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

async function loginCookie(playerId = "fake-otto", pin = PIN.fakeOtto): Promise<string> {
  const result = await s.call("/api/auth/login", { method: "POST", body: { playerId, pin } });
  expect(result.status).toBe(200);
  return `fn_session=${sessionCookie(result)}`;
}

describe("nuova stagione", () => {
  it("rifiuta nome vuoto, troppo lungo e doppione con maiuscole diverse", async () => {
    const cookie = await loginCookie();
    const creato = await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" }, cookie });
    expect(creato.status).toBe(200);

    const casi = [
      [{ name: " " }, 400, "da 1 a 20"],
      [{ name: "x".repeat(21) }, 400, "da 1 a 20"],
      [{ name: "2027/28" }, 409, "esiste già"],
      [{ name: "2027/28".toUpperCase() }, 409, "esiste già"],
    ] as const;

    for (const [body, status, testo] of casi) {
      const result = await s.call("/api/admin/seasons", { method: "POST", body, cookie });
      expect(result.status, JSON.stringify(body)).toBe(status);
      expect(result.body.error).toContain(testo);
    }
  });

  it("due richieste simultanee con lo stesso nome non creano duplicati", async () => {
    const cookie = await loginCookie();
    const [prima, seconda] = await Promise.all([
      s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" }, cookie }),
      s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" }, cookie }),
    ]);

    expect([prima.status, seconda.status].filter((status) => status === 200)).toHaveLength(1);
    expect([prima.status, seconda.status].filter((status) => status === 409)).toHaveLength(1);

    const righe = await s.db.prepare("SELECT COUNT(*) AS n FROM seasons WHERE lower(name) = lower(?)").bind("2027/28").first<{ n: number }>();
    expect(righe).toEqual({ n: 1 });

    const attive = await s.db.prepare("SELECT COUNT(*) AS n FROM seasons WHERE is_active = 1").first<{ n: number }>();
    expect(attive).toEqual({ n: 1 });
  });

  it("due richieste simultanee con nomi diversi mantengono una sola stagione attiva", async () => {
    const cookie = await loginCookie();
    const [prima, seconda] = await Promise.all([
      s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" }, cookie }),
      s.call("/api/admin/seasons", { method: "POST", body: { name: "2028/29" }, cookie }),
    ]);

    expect(prima.status).toBe(200);
    expect(seconda.status).toBe(200);

    const attive = await s.db.prepare("SELECT id, name FROM seasons WHERE is_active = 1 ORDER BY id DESC").all<{ id: number; name: string }>();
    expect(attive.results).toHaveLength(1);
    expect(["2027/28", "2028/29"]).toContain(attive.results?.[0]?.name);

    const conteggio = await s.db.prepare("SELECT COUNT(*) AS n FROM seasons WHERE is_active = 1").first<{ n: number }>();
    expect(conteggio).toEqual({ n: 1 });
  });

  it("richiede login, admin e Origin corretti, e rifiuta permesso revocato subito", async () => {
    const anon = await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" } });
    expect(anon.status).toBe(401);

    const nonAdmin = await loginCookie("fake-due", PIN.fakeDue);
    expect((await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/29" }, cookie: nonAdmin })).status).toBe(403);

    const admin = await loginCookie();
    expect((await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/29" }, cookie: admin, origin: "https://evil.invalid" })).status).toBe(403);

    const ok = await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/29" }, cookie: admin });
    expect(ok.status).toBe(200);

    await s.db.prepare("UPDATE players SET is_admin = 0 WHERE id = 'fake-otto'").run();
    expect((await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/30" }, cookie: admin })).status).toBe(403);
  });

  it("nuova stagione disattiva la vecchia, apre una pagina vuota e lascia i dati invariati", async () => {
    const admin = await loginCookie();
    const vecchia = await s.first<{ id: number; name: string }>("SELECT id, name FROM seasons WHERE is_active = 1 LIMIT 1");
    const prima = {
      players: await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM players"),
      votes: await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM votes"),
    };

    const result = await s.call("/api/admin/seasons", { method: "POST", body: { name: "2027/28" }, cookie: admin });
    expect(result.status).toBe(200);

    const nuova = await s.first<{ id: number; name: string; is_active: number }>(
      "SELECT id, name, is_active FROM seasons WHERE lower(name) = lower(?) ORDER BY id DESC LIMIT 1",
      "2027/28",
    );
    expect(nuova.is_active).toBe(1);
    const vecchiaDopo = await s.first<{ is_active: number }>("SELECT is_active FROM seasons WHERE id = ?", vecchia.id);
    expect(vecchiaDopo.is_active).toBe(0);

    const attive = await s.db.prepare("SELECT COUNT(*) AS n FROM seasons WHERE is_active = 1").first<{ n: number }>();
    expect(attive).toEqual({ n: 1 });

    const ranking = await s.call(`/api/ranking?season=${nuova.id}`);
    expect(ranking.status).toBe(200);
    expect(ranking.body.rows).toEqual([]);

    const partite = await s.call(`/api/matches?season=${nuova.id}`);
    expect(partite.status).toBe(200);
    expect(partite.body.matches).toEqual([]);

    const vecchioRanking = await s.call(`/api/ranking?season=${vecchia.id}`);
    expect(vecchioRanking.status).toBe(200);
    expect(vecchioRanking.body.rows.length).toBeGreaterThan(0);

    const dopo = {
      players: await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM players"),
      votes: await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM votes"),
    };
    expect(dopo.players).toEqual(prima.players);
    expect(dopo.votes).toEqual(prima.votes);

    const nuovaPartita = await s.call("/api/admin/matches", {
      method: "POST",
      body: {
        date: "2027-01-10",
        format: 5,
        teamA: [
          { playerId: "antonio", goals: 1, ownGoals: 0, mvp: false },
          { playerId: "fake-uno", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-tre", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-quattro", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-cinque", goals: 0, ownGoals: 0, mvp: false },
        ],
        teamB: [
          { playerId: "antonioportiere", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-due", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-sei", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-sette", goals: 0, ownGoals: 0, mvp: false },
          { playerId: "fake-otto", goals: 0, ownGoals: 0, mvp: false },
        ],
        guidinha: null,
      },
      cookie: admin,
    });
    expect(nuovaPartita.status).toBe(201);
    const inNuova = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM matches WHERE season_id = ?", nuova.id);
    expect(inNuova.n).toBeGreaterThan(0);

    const vecchiaPartita = await s.call(`/api/admin/matches/fake-m1`, { cookie: admin });
    expect(vecchiaPartita.status).toBe(200);
    expect((await s.call(`/api/admin/matches/fake-m1`, { method: "PUT", body: { date: "2027-01-11", format: 5, teamA: [], teamB: [], guidinha: null }, cookie: admin })).status).toBe(409);
    expect((await s.call(`/api/admin/matches/fake-m1`, { method: "DELETE", cookie: admin })).status).toBe(409);

    const audit = await s.db.prepare("SELECT action, detail FROM audit_log WHERE action = 'season_create' ORDER BY id DESC LIMIT 1").first<{ action: string; detail: string }>();
    expect(audit).toBeTruthy();
    expect(audit!.detail).toContain(`chiusa=${vecchia.name}`);
    expect(audit!.detail).toContain(`nuova=${nuova.name}`);
    expect(audit!.detail).toContain("partite=");
  });

  it("registro restituisce 50 righe per pagina, cursore, ordine decrescente e senza PIN/hash/salt", async () => {
    const admin = await loginCookie();
    for (let i = 0; i < 60; i++) {
      await s.db.prepare(
        "INSERT INTO audit_log (actor_player_id, action, detail) VALUES (?, 'unlock', ?)",
      ).bind("fake-otto", `evento-${i}`).run();
    }

    const prima = await s.call("/api/admin/audit", { cookie: admin });
    expect(prima.status).toBe(200);
    expect(prima.body.events).toHaveLength(50);
    expect(prima.body.hasMore).toBe(true);
    const ultimoId = (prima.body.events ?? []).at(-1)?.id;
    const seconda = await s.call(`/api/admin/audit?before=${ultimoId}`, { cookie: admin });
    expect(seconda.status).toBe(200);
    expect(seconda.body.events.length).toBeGreaterThan(0);
    expect(seconda.body.events.length).toBeLessThanOrEqual(50);
    expect(seconda.body.hasMore).toBe(false);
    expect(prima.body.events[0].id).toBeGreaterThan((prima.body.events ?? []).at(-1)?.id ?? 0);
    expect(seconda.body.events[0].id).toBeLessThan(ultimoId);
    for (const page of [prima.body.events, seconda.body.events]) {
      for (let i = 1; i < page.length; i++) {
        expect(page[i - 1].id).toBeGreaterThan(page[i].id);
      }
    }
    expect(prima.body.events[0].actor).toBe("Fake Otto");
    for (const response of [prima, seconda]) {
      expect(response.text).not.toMatch(/pin_hash|pinHash|salt|session_version|hash_version/i);
    }
  });

  it("esportazione risponde con contenuto atteso e registra conteggi", async () => {
    const admin = await loginCookie();
    const res = await s.call("/api/admin/export", { cookie: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition") ?? "").toMatch(/^attachment; filename="flannery-night-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.body).toMatchObject({ exportedAt: expect.any(String), exportedBy: "fake-otto", seasons: expect.any(Array), players: expect.any(Array), matches: expect.any(Array), match_players: expect.any(Array), votes: expect.any(Array) });
    expect(JSON.stringify(res.body)).not.toMatch(/credentials|audit_log|pin_hash|salt|session_version/);

    const stats = await s.db.prepare(
      "SELECT COUNT(*) AS seasons, (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM match_players) AS match_players, (SELECT COUNT(*) FROM votes) AS votes FROM seasons",
    ).first<{ seasons: number; players: number; matches: number; match_players: number; votes: number }>();
    expect(res.body.seasons).toHaveLength(stats!.seasons);
    expect(res.body.players).toHaveLength(stats!.players);
    expect(res.body.matches).toHaveLength(stats!.matches);
    expect(res.body.match_players).toHaveLength(stats!.match_players);
    expect(res.body.votes).toHaveLength(stats!.votes);

    const audit = await s.db.prepare("SELECT action, detail FROM audit_log WHERE action = 'export_data' ORDER BY id DESC LIMIT 1").first<{ action: string; detail: string }>();
    expect(audit).toBeTruthy();
    expect(audit!.detail).toContain("seasons=");
    expect(audit!.detail).toContain("players=");
    expect(audit!.detail).toContain("matches=");
    expect(audit!.detail).toContain("match_players=");
    expect(audit!.detail).toContain("votes=");
  });
});
