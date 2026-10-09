// Gestione delle partite dentro la pagina Partite, con i trigger Guidinha
// veri caricati. Solo dati inventati dai fixture.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

async function loginCookie(playerId: string, pin: string): Promise<string> {
  const session = await s.call("/api/auth/login", { method: "POST", body: { playerId, pin } });
  expect(session.status).toBe(200);
  return `fn_session=${sessionCookie(session)}`;
}

const A5 = ["antonio", "fake-uno", "fake-tre", "fake-quattro", "fake-cinque"];
const B5 = ["antonioportiere", "fake-due", "fake-sei", "fake-sette", "fake-otto"];

function squadra(ids: string[], gol: Record<string, number> = {}, mvp: string[] = []) {
  return ids.map((playerId) => ({
    playerId,
    goals: gol[playerId] ?? 0,
    ownGoals: 0,
    mvp: mvp.includes(playerId),
  }));
}

function corpo(mod: Record<string, unknown> = {}) {
  return {
    date: "2026-10-03",
    format: 5,
    teamA: squadra(A5, { antonio: 2 }, ["antonio"]),
    teamB: squadra(B5),
    guidinha: { playerId: "antonio", text: "Gran giocata" },
    ...mod,
  };
}

describe("accesso alla gestione", () => {
  it("serve il login; senza permesso è rifiutato", async () => {
    expect((await s.call("/api/admin/matches")).status).toBe(401);
    const session = await s.call("/api/auth/login", { method: "POST", body: { playerId: "fake-due", pin: PIN.fakeDue } });
    expect((await s.call("/api/admin/matches", { cookie: `fn_session=${sessionCookie(session)}` })).status).toBe(403);
  });

  it("permesso tolto: anche le scritture sono rifiutate subito", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    expect((await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies })).status).toBe(201);
    await s.db.prepare("UPDATE players SET is_admin = 0 WHERE id = 'fake-otto'").run();
    expect((await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies })).status).toBe(403);
  });

  it("senza Origin le scritture sono rifiutate", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies, origin: null });
    expect(res.status).toBe(403);
  });

  it("nessun percorso dedicato nel codice", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of [
      "wrangler.toml",
      "src/env.ts",
      "src/router.ts",
      "src/session.ts",
      "src/worker.ts",
      "public/js/routes.js",
      "public/js/api.js",
      "public/js/app.js",
      "tests/helpers/server.ts",
    ]) {
      const testo = readFileSync(join(root, file), "utf-8");
      expect(testo, file).not.toContain("ADMIN_PATH");
      expect(testo, file).not.toContain("/copilota");
    }
  });
});

describe("elenco e dettaglio", () => {
  it("stagione attiva di default, dalla più recente, con formato e risultato", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches", { cookie: cookies });
    expect(res.status).toBe(200);
    expect(res.body.season).toMatchObject({ id: 1, editable: true });
    expect(res.body.matches).toHaveLength(2);
    expect(res.body.matches[0].date).toBe("2026-09-10");
    expect(res.body.matches[0]).toMatchObject({ format: "5v5", editable: true });
    expect(typeof res.body.matches[0].result).toBe("string");
  });

  it("dettaglio completo per l'editor", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches/fake-m1", { cookie: cookies });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "fake-m1", date: "2026-09-04", format: 5, editable: true });
    expect(res.body.teamA).toHaveLength(5);
    expect(res.body.teamB).toHaveLength(5);
    expect(res.body.teamA.find((r: { playerId: string }) => r.playerId === "antonio")).toMatchObject({
      goals: 2,
      mvp: true,
    });
    expect(res.body.result).toBe("A 4 - B 1");
  });

  it("partita inesistente: 404 in italiano", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches/non-esiste", { cookie: cookies });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Partita non trovata");
  });
});

describe("creazione", () => {
  it("salva subito pubblicata con risultato ufficiale del server", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    expect(res.status).toBe(201);
    expect(res.body.result).toBe("A 2 - B 0");
    const riga = await s.first<{ status: string; published_at: string; season_id: number; guidinha_player_id: string }>(
      "SELECT status, published_at, season_id, guidinha_player_id FROM matches WHERE id = ?",
      res.body.id,
    );
    expect(riga.status).toBe("published");
    expect(riga.published_at).toBe("2026-10-03");
    expect(riga.season_id).toBe(1);
    expect(riga.guidinha_player_id).toBe("antonio");
    const n = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM match_players WHERE match_id = ?", res.body.id);
    expect(n.n).toBe(10);
  });

  it("ogni partita entra subito in classifica", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    const ranking = await s.call("/api/ranking", { origin: null });
    const antonio = ranking.body.rows.find((r: { id: string }) => r.id === "antonio");
    expect(antonio.played).toBe(3);
  });

  it("date libere nel passato e più partite lo stesso giorno", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    for (const ora of ["2020-01-01", "2020-01-01"]) {
      const res = await s.call("/api/admin/matches", { method: "POST", body: corpo({ date: ora }), cookie: cookies });
      expect(res.status).toBe(201);
    }
  });

  it.each([
    [{ date: "ieri" }, "La data della partita manca o non è valida"],
    [{ date: "2026-02-30" }, "La data della partita manca o non è valida"],
    [{ format: 7 }, "Il formato deve essere 5, 6 o 8"],
    [{ format: 6 }, "La squadra A deve avere 6 giocatori"],
  ])("validazione %j: %s", async (mod, messaggio) => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo(mod), cookie: cookies });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(messaggio);
  });

  it("niente giocatori ripetuti o in entrambe le squadre", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const teamB = squadra(B5);
    teamB[0] = { ...teamB[0], playerId: "antonio" };
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo({ teamB }), cookie: cookies });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("una sola volta");
  });

  it("i giocatori devono esistere", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const teamA = squadra(A5);
    teamA[0] = { ...teamA[0], playerId: "fantasma" };
    const res = await s.call("/api/admin/matches", {
      method: "POST",
      body: corpo({ teamA, guidinha: null }),
      cookie: cookies,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Giocatore non trovato");
  });

  it("gol e autogol interi da 0 a 99", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const teamA = squadra(A5);
    teamA[0] = { ...teamA[0], goals: 100 };
    expect((await s.call("/api/admin/matches", { method: "POST", body: corpo({ teamA }), cookie: cookies })).status).toBe(400);
    const teamA2 = squadra(A5);
    teamA2[1] = { ...teamA2[1], ownGoals: -1 };
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo({ teamA: teamA2 }), cookie: cookies });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("da 0 a 99");
  });

  it("Guidinha: testo obbligatorio e giocatore in partita", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const vuoto = await s.call("/api/admin/matches", {
      method: "POST",
      body: corpo({ guidinha: { playerId: "antonio", text: "  " } }),
      cookie: cookies,
    });
    expect(vuoto.status).toBe(400);
    expect(vuoto.body.error).toContain("non può essere vuoto");
    const fuori = await s.call("/api/admin/matches", {
      method: "POST",
      body: corpo({
        teamA: squadra(A5),
        teamB: squadra(B5),
        guidinha: { playerId: "fake-esterno", text: "Bella" },
      }),
      cookie: cookies,
    });
    expect(fuori.status).toBe(400);
    expect(fuori.body.error).toContain("deve aver giocato la partita");
  });

  it("più MVP per squadra ammessi e tutti i giocatori selezionabili", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const teamA = squadra(A5, {}, ["antonio", "fake-uno"]);
    teamA[4] = { ...teamA[4], playerId: "fake-esterno" };
    const res = await s.call("/api/admin/matches", {
      method: "POST",
      body: corpo({ teamA, guidinha: null }),
      cookie: cookies,
    });
    expect(res.status).toBe(201);
  });
});

describe("modifica", () => {
  it("sostituisce i dati e registra prima e dopo", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const creato = await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    const id = creato.body.id;
    const dopo = corpo({ date: "2026-10-04", guidinha: { playerId: "fake-uno", text: "Nuovo testo" } });
    dopo.teamA = squadra(A5, { ["fake-uno"]: 3 }, ["fake-uno"]);
    const res = await s.call("/api/admin/matches/" + encodeURIComponent(id), {
      method: "PUT",
      body: dopo,
      cookie: cookies,
    });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("A 3 - B 0");
    const audit = await s.db
      .prepare("SELECT action, detail FROM audit_log WHERE action = 'match_update' ORDER BY id DESC LIMIT 1")
      .first<{ action: string; detail: string }>();
    expect(audit?.detail).toContain("data: 2026-10-03 → 2026-10-04");
    expect(audit?.detail).toContain("Guidinha:");
  });

  it("toglie dalla partita il giocatore con la Guidinha e la sposta", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const creato = await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    const id = creato.body.id;
    // Antonio esce, entra fake-esterno; la Guidinha passa a fake-uno.
    const teamA = squadra(["fake-uno", "fake-tre", "fake-quattro", "fake-cinque", "fake-esterno"], { ["fake-uno"]: 1 });
    const res = await s.call("/api/admin/matches/" + encodeURIComponent(id), {
      method: "PUT",
      body: corpo({ teamA, guidinha: { playerId: "fake-uno", text: "Nuova" } }),
      cookie: cookies,
    });
    expect(res.status).toBe(200);
    const righe = await s.db
      .prepare("SELECT player_id AS p FROM match_players WHERE match_id = ?")
      .bind(id)
      .all<{ p: string }>();
    expect(righe.results.map((r) => r.p).sort()).not.toContain("antonio");
  });

  it("stagione chiusa: sola lettura", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/matches/" + encodeURIComponent("fake-m1"), {
      method: "PUT",
      body: corpo(),
      cookie: cookies,
    });
    expect(res.status).toBe(200);
    // Sposta la partita nella stagione chiusa e riprova.
    await s.db.prepare("UPDATE matches SET season_id = 2 WHERE id = 'fake-m1'").run();
    const chiuso = await s.call("/api/admin/matches/" + encodeURIComponent("fake-m1"), {
      method: "PUT",
      body: corpo(),
      cookie: cookies,
    });
    expect(chiuso.status).toBe(409);
    expect(chiuso.body.error).toContain("sola lettura");
    const dettaglio = await s.call("/api/admin/matches/" + encodeURIComponent("fake-m1"), { cookie: cookies });
    expect(dettaglio.body.editable).toBe(false);
  });
});

describe("eliminazione", () => {
  it("elimina partita con Guidinha e righe collegate, con copia nel registro", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const creato = await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    const id = creato.body.id;
    const res = await s.call("/api/admin/matches/" + encodeURIComponent(id), { method: "DELETE", cookie: cookies });
    expect(res.status).toBe(200);
    expect(await s.db.prepare("SELECT id FROM matches WHERE id = ?").bind(id).first()).toBeNull();
    const figlie = await s.db.prepare("SELECT COUNT(*) AS n FROM match_players WHERE match_id = ?").bind(id).first<{ n: number }>();
    expect(figlie?.n).toBe(0);
    const audit = await s.db
      .prepare("SELECT action, detail FROM audit_log WHERE action = 'match_delete' ORDER BY id DESC LIMIT 1")
      .first<{ action: string; detail: string }>();
    expect(audit?.detail).toContain("2026-10-03");
    expect(audit?.detail).toContain("Fake Antonio");
    expect(audit?.detail).toContain("Gran giocata");
  });

  it("stagione chiusa: eliminazione rifiutata", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    await s.db.prepare("UPDATE matches SET season_id = 2 WHERE id = 'fake-m1'").run();
    const res = await s.call("/api/admin/matches/" + encodeURIComponent("fake-m1"), { method: "DELETE", cookie: cookies });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("sola lettura");
    expect(await s.db.prepare("SELECT id FROM matches WHERE id = 'fake-m1'").first()).not.toBeNull();
  });

  it("senza dati a metà: tutto o niente", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const prima = await s.db.prepare("SELECT COUNT(*) AS n FROM matches").first<{ n: number }>();
    const teamA = squadra(A5);
    teamA[0] = { ...teamA[0], playerId: "fantasma" };
    const res = await s.call("/api/admin/matches", { method: "POST", body: corpo({ teamA, guidinha: null }), cookie: cookies });
    expect(res.status).toBe(400);
    const dopo = await s.db.prepare("SELECT COUNT(*) AS n FROM matches").first<{ n: number }>();
    expect(dopo?.n).toBe(prima?.n);
  });
});

describe("giocatori per l'editor e registro", () => {
  it("elenca tutti i giocatori senza dati riservati", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/players", { cookie: cookies, origin: null });
    expect(res.status).toBe(200);
    const ids = res.body.players.map((p: { id: string }) => p.id);
    expect(ids).toContain("fake-esterno");
    expect(Object.keys(res.body.players[0]).sort()).toEqual(["canLogin", "flag", "id", "name", "role", "role2"]);
    expect(res.text).not.toMatch(/pin_hash|"salt"|pinHash/);
  });

  it("il registro non contiene PIN né hash", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    await s.call("/api/admin/matches", { method: "POST", body: corpo(), cookie: cookies });
    const trail = await s.call("/api/admin/audit", { cookie: cookies });
    const azioni = trail.body.events.map((e: { action: string }) => e.action);
    expect(azioni).toContain("match_create");
    const cred = await s.first<{ salt: string; pin_hash: string }>("SELECT salt, pin_hash FROM credentials WHERE player_id = 'fake-otto'");
    expect(trail.text).not.toContain(cred.salt);
    expect(trail.text).not.toContain(cred.pin_hash);
    expect(trail.text).not.toContain(PIN.fakeOtto);
  });
});
