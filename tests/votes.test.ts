// PASSO 3: voti. Una riga per coppia votante/target, niente autovoto,
// valori 1..99, e chi non puo' accedere vota ma non viene votato per errore.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PIN, sessionCookie, startServer, type TestServer } from "./helpers/server";

let s: TestServer;

beforeAll(async () => {
  s = await startServer();
}, 120_000);

afterAll(async () => {
  await s?.dispose();
});

beforeEach(async () => {
  await s.reset();
});

const VOTES = { velTuf: 40, tirPre: 41, passRin: 42, driRif: 43, difRea: 44, fisPia: 45 };

async function asPlayer(playerId: string, pin: string): Promise<string> {
  const res = await s.call("/api/auth/login", { method: "POST", body: { playerId, pin } });
  expect(res.status).toBe(200);
  return `fn_session=${sessionCookie(res)}`;
}

async function rowCount(voter: string, target: string): Promise<number> {
  const row = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM votes WHERE voter_id = ? AND target_id = ?", voter, target);
  return row.n;
}

describe("voto", () => {
  it("richiede accesso", async () => {
    const res = await s.call("/api/votes/fake-uno", { method: "PUT", body: VOTES });
    expect(res.status).toBe(401);
  });

  it("scrive una riga e risponde con mediane e overall del target", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/votes/fake-sei", { method: "PUT", cookie, body: VOTES });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ targetId: "fake-sei", voters: 1, velTuf: 40, overall: 42 });
    expect(await rowCount("antonio", "fake-sei")).toBe(1);
  });

  it("upsert: la stessa coppia non si duplica", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    await s.call("/api/votes/fake-sei", { method: "PUT", cookie, body: VOTES });
    const second = await s.call("/api/votes/fake-sei", {
      method: "PUT",
      cookie,
      body: { velTuf: 90, tirPre: 90, passRin: 90, driRif: 90, difRea: 90, fisPia: 90 },
    });
    expect(second.status).toBe(200);
    expect(second.body.voters).toBe(1);
    expect(second.body.velTuf).toBe(90);
    expect(await rowCount("antonio", "fake-sei")).toBe(1);
  });

  it("due richieste insieme lasciano una sola riga", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const [a, b] = await Promise.all([
      s.call("/api/votes/fake-quattro", { method: "PUT", cookie, body: VOTES }),
      s.call("/api/votes/fake-quattro", {
        method: "PUT",
        cookie,
        body: { velTuf: 77, tirPre: 77, passRin: 77, driRif: 77, difRea: 77, fisPia: 77 },
      }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await rowCount("antonio", "fake-quattro")).toBe(1);
    const stored = await s.first<{ vel_tuf: number }>("SELECT vel_tuf FROM votes WHERE voter_id = 'antonio' AND target_id = 'fake-quattro'");
    expect([40, 77]).toContain(stored.vel_tuf);
  });

  it("niente autovoto", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/votes/antonio", { method: "PUT", cookie, body: VOTES });
    expect(res.status).toBe(400);
    expect(await rowCount("antonio", "antonio")).toBe(0);
  });

  it("sei valori interi da 1 a 99", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const bad = [
      { velTuf: 0, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 },
      { velTuf: 100, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 },
      { velTuf: 50.5, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 },
      { velTuf: "50", tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 },
      { velTuf: 50, tirPre: 99, passRin: 99, driRif: 99, difRea: 99 },
    ];
    for (const body of bad) {
      const res = await s.call("/api/votes/fake-cinque", { method: "PUT", cookie, body });
      expect(res.status).toBe(400);
    }
    const okBody = { velTuf: 1, tirPre: 99, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 };
    expect((await s.call("/api/votes/fake-cinque", { method: "PUT", cookie, body: okBody })).status).toBe(200);
    expect(await rowCount("antonio", "fake-cinque")).toBe(1);
  });

  it("il target deve esistere ed essere attivo", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    expect((await s.call("/api/votes/fake-inesistente", { method: "PUT", cookie, body: VOTES })).status).toBe(404);
  });

  it("chi non puo' accedere non vota, ma puo' essere votato", async () => {
    const cookie = await asPlayer("fake-due", PIN.fakeDue);
    await s.db.prepare("UPDATE players SET can_login = 0 WHERE id = 'fake-due'").run();
    const res = await s.call("/api/votes/fake-otto", { method: "PUT", cookie, body: VOTES });
    expect(res.status).toBe(401);
    expect(await rowCount("fake-due", "fake-otto")).toBe(0);

    // fake-esterno ha can_login=0: non vota, ma la sua scheda e' votabile.
    expect((await s.call("/api/auth/login", { method: "POST", body: { playerId: "fake-esterno", pin: PIN.antonio } })).status).toBe(401);
    const voter = await asPlayer("antonio", PIN.antonio);
    const voted = await s.call("/api/votes/fake-esterno", { method: "PUT", cookie: voter, body: VOTES });
    expect(voted.status).toBe(200);
    expect(voted.body.voters).toBe(2);
  });

  it("i miei voti tornano con il nome del target", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    await s.call("/api/votes/fake-sei", { method: "PUT", cookie, body: VOTES });
    const mine = await s.call("/api/me/votes", { cookie });
    expect(mine.status).toBe(200);
    const targets = mine.body.votes.map((v: { targetId: string }) => v.targetId);
    expect(targets.sort()).toEqual(["fake-sei", "fake-uno"]);
    const sei = mine.body.votes.find((v: { targetId: string }) => v.targetId === "fake-sei");
    expect(sei.targetName).toBe("Fake Sei");
    expect(sei.velTuf).toBe(40);
    // Fake Sei è CL: 0,3*40 + 0,1*41 + 0,2*42 + 0,25*43 + 0,05*44 + 0,1*45
    // = 41,95 esatti, per eccesso 42. Il browser non calcola niente.
    expect(typeof sei.myOverall).toBe("number");
    expect(sei.myOverallUp).toBe(42);

    // Le votazioni di altri non si vedono.
    const other = await s.call("/api/me/votes", { cookie: await asPlayer("fake-otto", PIN.fakeOtto) });
    expect(other.body.votes.every((v: { targetId: string }) => v.targetId !== "fake-sei")).toBe(true);
  });

  it("l'overall compare con un solo voto ricevuto", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const fresh = await s.first<{ role: string }>("SELECT role FROM players WHERE id = 'fake-cinque'");
    const res = await s.call("/api/votes/fake-cinque", { method: "PUT", cookie, body: VOTES });
    expect(res.status).toBe(200);
    expect(res.body.voters).toBe(1);
    // Nessuna soglia: con un solo voto le mediane sono quei valori
    // e l'overall esiste gia'.
    expect(res.body.velTuf).toBe(40);
    expect(res.body.overall).not.toBeNull();
    expect(typeof res.body.overall).toBe("number");
    expect(fresh.role).toBeTruthy();

    const scheda = await s.call("/api/players/fake-cinque");
    expect(scheda.body.votes).toBe(1);
    expect(scheda.body.overall).toBe(res.body.overall);

    const elenco = await s.call("/api/players");
    const riga = elenco.body.players.find((p: { id: string }) => p.id === "fake-cinque");
    expect(riga.overall).toBe(res.body.overall);
  });

  it("l'overall si aggiorna anche con due votanti", async () => {
    const primo = await asPlayer("antonio", PIN.antonio);
    const secondo = await asPlayer("fake-otto", PIN.fakeOtto);
    const terzo = await asPlayer("fake-due", PIN.fakeDue);
    // fake-cinque non ha voti nelle fixture: il conteggio parte da zero.
    await s.call("/api/votes/fake-cinque", { method: "PUT", cookie: primo, body: { velTuf: 10, tirPre: 20, passRin: 30, driRif: 40, difRea: 50, fisPia: 60 } });
    const res = await s.call("/api/votes/fake-cinque", {
      method: "PUT",
      cookie: secondo,
      body: { velTuf: 50, tirPre: 60, passRin: 70, driRif: 80, difRea: 90, fisPia: 99 },
    });
    expect(res.body.voters).toBe(2);
    expect(res.body.velTuf).toBe(30);
    expect(res.body.fisPia).toBe(79.5);
    expect(res.body.overall).not.toBeNull();

    // Un terzo votante alza il conteggio e cambia le mediane.
    const dopo = await s.call("/api/votes/fake-cinque", {
      method: "PUT",
      cookie: terzo,
      body: { velTuf: 90, tirPre: 90, passRin: 90, driRif: 90, difRea: 90, fisPia: 90 },
    });
    expect(dopo.body.voters).toBe(3);
    expect(dopo.body.velTuf).toBe(50);
    expect(dopo.body.overall).not.toBeNull();
  });

  it("la risposta non contiene i voti degli altri", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/votes/fake-sette", { method: "PUT", cookie, body: VOTES });
    expect(res.text).not.toContain("voterId");
    expect(Object.keys(res.body).sort()).toEqual([
      "difRea",
      "driRif",
      "fisPia",
      "overall",
      "overallUp",
      "passRin",
      "targetId",
      "tirPre",
      "velTuf",
      "voters",
    ]);
  });
});