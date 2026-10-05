// Accesso con PIN, blocco, sessioni, PIN nuovo e permesso di gestione.
// Solo giocatori e PIN inventati.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  forgeSessionCookie,
  PIN,
  sessionCookie,
  startServer,
  type TestServer,
} from "./helpers/server";

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

function login(playerId: string, pin: string, opts: { origin?: string | null } = {}) {
  return s.call("/api/auth/login", { method: "POST", body: { playerId, pin }, ...opts });
}

async function auditRows(): Promise<Array<{ action: string; detail: string; actor: string | null }>> {
  const rows = await s.db
    .prepare("SELECT action, detail, actor_player_id AS actor FROM audit_log ORDER BY id")
    .all<{ action: string; detail: string; actor: string | null }>();
  return rows.results ?? [];
}

async function loginAntonio() {
  return login("antonio", PIN.antonio);
}

/** Cookie di sessione di un giocatore, pronto per le rotte di gestione. */
async function loginCookie(playerId: string, pin: string): Promise<string> {
  const session = await login(playerId, pin);
  expect(session.status).toBe(200);
  return `fn_session=${sessionCookie(session)}`;
}

function maxAge(reply: { cookies: string[] }): number | null {
  for (const raw of reply.cookies) {
    const m = raw.match(/Max-Age=(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

describe("accesso con PIN", () => {
  it("PIN giusto: cookie di sessione e /api/me risponde", async () => {
    const res = await login("antonio", PIN.antonio);
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toBeTruthy();
    const me = await s.call("/api/me", { cookie: `fn_session=${cookie}` });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: "antonio", isAdmin: true });
  });

  it("PIN sbagliato: 401 generico e audit", async () => {
    const res = await login("antonio", "000000");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("PIN non valido");
    expect(res.text).not.toMatch(/hash|salt|pin_hash/);
    const rows = await auditRows();
    expect(rows.filter((r) => r.action === "login_failed")).toHaveLength(1);
  });

  it("giocatore inesistente: stesso 401, senza audit", async () => {
    const res = await login("fake-inesistente", "123456");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Accesso non consentito");
  });

  it("formato del PIN sempre validato", async () => {
    expect((await login("antonio", "12345")).status).toBe(400);
    expect((await login("antonio", "1234567")).status).toBe(400);
    expect((await login("antonio", "12345a")).status).toBe(400);
    expect((await login("antonio", "abcdef")).status).toBe(400);
  });

  it("accesso senza sessione: 401", async () => {
    expect((await s.call("/api/me")).status).toBe(401);
  });
});

describe("blocco per account", () => {
  it("quinto errore: blocco con orario, anche con il PIN giusto", async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await login("antonio", "000000");
      expect(res.status).toBe(401);
    }
    const fifth = await login("antonio", "000000");
    expect(fifth.status).toBe(423);
    expect(fifth.body.error).toMatch(/^Account bloccato fino alle \d{2}:\d{2}$/);
    // Durante il blocco il PIN non viene verificato: resta 423.
    const right = await login("antonio", PIN.antonio);
    expect(right.status).toBe(423);
    const rows = await auditRows();
    expect(rows.some((r) => r.action === "account_locked")).toBe(true);
  });

  it("durata 15 minuti per i giocatori e 30 per gli admin", async () => {
    for (let i = 0; i < 5; i++) await login("fake-due", "000000");
    for (let i = 0; i < 5; i++) await login("fake-otto", "000000");

    const due = await s.first<{ locked_until: string }>("SELECT locked_until FROM credentials WHERE player_id = 'fake-due'");
    const otto = await s.first<{ locked_until: string }>("SELECT locked_until FROM credentials WHERE player_id = 'fake-otto'");
    const minutes = (iso: string) => (Date.parse(iso) - Date.now()) / 60_000;
    expect(minutes(due.locked_until)).toBeGreaterThan(14.5);
    expect(minutes(due.locked_until)).toBeLessThan(15.1);
    expect(minutes(otto.locked_until)).toBeGreaterThan(29.5);
    expect(minutes(otto.locked_until)).toBeLessThan(30.1);
  });

  it("login riuscito azzera i tentativi", async () => {
    for (let i = 0; i < 3; i++) await login("fake-due", "000000");
    expect((await login("fake-due", PIN.fakeDue)).status).toBe(200);
    const cred = await s.first<{ failed_attempts: number }>("SELECT failed_attempts FROM credentials WHERE player_id = 'fake-due'");
    expect(cred.failed_attempts).toBe(0);
  });

  it("sblocco immediato da parte di un admin", async () => {
    for (let i = 0; i < 5; i++) await login("antonio", "000000");
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const res = await s.call("/api/admin/players/antonio/unlock", { method: "POST", cookie: cookies });
    expect(res.status).toBe(200);
    const after = await login("antonio", PIN.antonio);
    expect(after.status).toBe(200);
    const rows = await auditRows();
    expect(rows.some((r) => r.action === "unlock" && r.actor === "fake-otto")).toBe(true);
  });
});

describe("creazione del PIN", () => {
  it("ammessa solo senza PIN e con can_login=1", async () => {
    const ok = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "fake-tre", pin: "135790", pinConfirm: "135790" },
    });
    expect(ok.status).toBe(200);
    expect(sessionCookie(ok)).toBeTruthy();
    // Secondo tentativo sullo stesso account: non ammesso.
    const again = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "fake-tre", pin: "135790", pinConfirm: "135790" },
    });
    expect(again.status).toBe(409);
    // Chi ha gia' un PIN importato non puo' ricrearlo.
    const has = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "antonio", pin: "135790", pinConfirm: "135790" },
    });
    expect(has.status).toBe(409);
    // Esterno senza accesso: non esiste come voce del menu.
    const outside = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "fake-esterno", pin: "135790", pinConfirm: "135790" },
    });
    expect(outside.status).toBe(404);
  });

  it("i due PIN devono coincidere ed essere 6 cifre", async () => {
    const mismatch = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "fake-sette", pin: "135790", pinConfirm: "135791" },
    });
    expect(mismatch.status).toBe(400);
    const short = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "fake-sette", pin: "12345", pinConfirm: "12345" },
    });
    expect(short.status).toBe(400);
  });

  it("hasPin risponde correttamente e il menu esclude chi non puo' accedere", async () => {
    expect((await s.call("/api/auth/status?playerId=fake-tre")).body).toEqual({ hasPin: false });
    expect((await s.call("/api/auth/status?playerId=antonio")).body).toEqual({ hasPin: true });
    expect((await s.call("/api/auth/status?playerId=fake-esterno")).status).toBe(404);

    const menu = await s.call("/api/auth/players");
    expect(menu.status).toBe(200);
    const ids = menu.body.players.map((p: { id: string }) => p.id);
    expect(ids).toContain("antonio");
    expect(ids).not.toContain("fake-esterno");
    expect(Object.keys(menu.body.players[0]).sort()).toEqual(["flag", "id", "name", "role"]);
  });

  it("chi non puo' accedere non entra nemmeno con il PIN giusto", async () => {
    expect((await login("fake-esterno", PIN.antonio)).status).toBe(401);
  });
});

describe("hash v1 e passaggio a v2", () => {
  it("al primo login riuscito l'hash v1 diventa v2 con sale nuovo", async () => {
    const before = await s.first<{ salt: string; hash_version: number }>(
      "SELECT salt, hash_version FROM credentials WHERE player_id = 'antonioportiere'",
    );
    expect(before.hash_version).toBe(1);

    const res = await login("antonioportiere", PIN.antonioportiere);
    expect(res.status).toBe(200);

    const after = await s.first<{ salt: string; hash_version: number; pin_origin: string }>(
      "SELECT salt, hash_version, pin_origin FROM credentials WHERE player_id = 'antonioportiere'",
    );
    expect(after.hash_version).toBe(2);
    expect(after.salt).not.toBe(before.salt);
    expect(after.salt.length).toBe(32);
    expect(after.pin_origin).toBe("user");
    // Il login successivo continua a funzionare.
    expect((await login("antonioportiere", PIN.antonioportiere)).status).toBe(200);
    expect((await auditRows()).some((r) => r.action === "pin_upgraded")).toBe(true);
  });
});

describe("sessioni", () => {
  it("il cambio di PIN chiude le sessioni sugli altri telefoni", async () => {
    const first = await loginAntonio();
    const cookie = sessionCookie(first)!;
    const phoneOne = `fn_session=${cookie}`;
    const phoneTwo = `fn_session=${cookie}`; // stesso token, altro telefono

    const changed = await s.call("/api/me/pin", {
      method: "POST",
      body: { current: PIN.antonio, new: "654321", newConfirm: "654321" },
      cookie: phoneOne,
    });
    expect(changed.status).toBe(200);

    // Il telefono che ha fatto il cambio ha una sessione nuova.
    const phoneOneNew = `fn_session=${sessionCookie(changed)}`;
    expect((await s.call("/api/me", { cookie: phoneOneNew })).status).toBe(200);
    // L'altro telefono, con il token di prima, perde l'accesso.
    expect((await s.call("/api/me", { cookie: phoneTwo })).status).toBe(401);
    // Il PIN nuovo vale, quello vecchio no.
    expect((await login("antonio", "654321")).status).toBe(200);
    expect((await login("antonio", PIN.antonio)).status).toBe(401);
  });

  it("PIN attuale sbagliato: 401 e conteggio nel blocco", async () => {
    const session = await loginAntonio();
    const res = await s.call("/api/me/pin", {
      method: "POST",
      body: { current: "000000", new: "654321", newConfirm: "654321" },
      cookie: `fn_session=${sessionCookie(session)}`,
    });
    expect(res.status).toBe(401);
    const cred = await s.first<{ failed_attempts: number }>("SELECT failed_attempts FROM credentials WHERE player_id = 'antonio'");
    expect(cred.failed_attempts).toBe(1);
  });

  it("cookie con firma alterata non vale", async () => {
    const session = await loginAntonio();
    const cookie = sessionCookie(session)!;
    const tampered = `fn_session=${cookie.slice(0, -2)}xy`;
    expect((await s.call("/api/me", { cookie: `fn_session=${tampered}` })).status).toBe(401);
  });

  it("logout cancella il cookie", async () => {
    const res = await s.call("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.cookies.join(";")).toMatch(/Max-Age=0/);
  });
});

describe("permesso di gestione dal database", () => {
  it("le rotte chiedono login e permesso letto a ogni richiesta", async () => {
    expect((await s.call("/api/admin/audit")).status).toBe(401);
    const other = await loginCookie("fake-due", PIN.fakeDue);
    expect((await s.call("/api/admin/audit", { cookie: other })).status).toBe(403);
    expect((await s.call("/api/admin/players", { cookie: other })).status).toBe(403);

    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const audit = await s.call("/api/admin/audit", { cookie: cookies });
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body.events)).toBe(true);
  });

  it("la riconferma separata non esiste più", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    expect((await s.call("/api/admin/session", { method: "POST", body: { pin: PIN.fakeOtto }, cookie: cookies })).status).toBe(
      404,
    );
  });

  it("permesso tolto dal database: rifiutato subito con la sessione aperta", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    expect((await s.call("/api/admin/audit", { cookie: cookies })).status).toBe(200);
    await s.db.prepare("UPDATE players SET is_admin = 0 WHERE id = 'fake-otto'").run();
    expect((await s.call("/api/admin/audit", { cookie: cookies })).status).toBe(403);
    expect((await s.call("/api/admin/players", { cookie: cookies })).status).toBe(403);
    // La sessione resta valida per il resto: solo il permesso è tolto.
    expect((await s.call("/api/me", { cookie: cookies })).status).toBe(200);
  });

  it("un giocatore con il permesso agisce su un altro e su se' stesso", async () => {
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);

    const missing = await s.call("/api/admin/players/fake-inesistente/unlock", { method: "POST", cookie: cookies });
    expect(missing.status).toBe(404);
    const others = await s.call("/api/admin/players/antonio/reset-pin", { method: "POST", cookie: cookies });
    expect(others.status).toBe(200);
    const self = await s.call("/api/admin/players/fake-otto/reset-pin", { method: "POST", cookie: cookies });
    expect(self.status).toBe(200);
    // Il reset di se' stessi chiude anche la propria sessione.
    expect((await s.call("/api/admin/audit", { cookie: cookies })).status).toBe(401);
  });

  it("reset del PIN: azzera hash, blocco e sessioni", async () => {
    const antonio = await loginAntonio();
    const cookie = `fn_session=${sessionCookie(antonio)}`;
    expect((await s.call("/api/me", { cookie })).status).toBe(200);

    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    const reset = await s.call("/api/admin/players/antonio/reset-pin", { method: "POST", cookie: cookies });
    expect(reset.status).toBe(200);

    const cred = await s.first<{ salt: string; pin_hash: string; pin_origin: string; failed_attempts: number; locked_until: string | null }>(
      "SELECT salt, pin_hash, pin_origin, failed_attempts, locked_until FROM credentials WHERE player_id = 'antonio'",
    );
    expect(cred.salt).toBe("");
    expect(cred.pin_hash).toBe("");
    expect(cred.pin_origin).toBe("");
    expect(cred.failed_attempts).toBe(0);
    expect(cred.locked_until).toBeNull();

    // Sessione precedente morta e PIN vecchio non valido.
    expect((await s.call("/api/me", { cookie })).status).toBe(401);
    expect((await login("antonio", PIN.antonio)).status).toBe(401);
    // Si puo' tornare a creare un PIN.
    const created = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId: "antonio", pin: "112233", pinConfirm: "112233" },
    });
    expect(created.status).toBe(200);
  });

  it("chi non ha il permesso non entra", async () => {
    const session = await login("fake-due", PIN.fakeDue);
    const res = await s.call("/api/admin/audit", { cookie: `fn_session=${sessionCookie(session)}` });
    expect(res.status).toBe(403);
  });
});

describe("durata della sessione", () => {
  const GIORNO = 86_400;

  async function versione(playerId: string): Promise<number> {
    const cred = await s.first<{ session_version: number }>("SELECT session_version FROM credentials WHERE player_id = ?", playerId);
    return cred.session_version;
  }

  it("/api/me dice isAdmin senza altri campi riservati", async () => {
    const admin = await s.call("/api/me", { cookie: await loginCookie("antonio", PIN.antonio) });
    expect(admin.body).toEqual({ id: "antonio", name: "Fake Antonio", role: "CC", isAdmin: true });
    const other = await s.call("/api/me", { cookie: await loginCookie("fake-due", PIN.fakeDue) });
    expect(other.body).toEqual({ id: "fake-due", name: "Fake Due", role: "DC", isAdmin: false });
  });

  it("cookie nuovi: 14 giorni per la gestione, 90 per gli altri", async () => {
    expect(maxAge(await login("antonio", PIN.antonio))).toBe(14 * GIORNO);
    expect(maxAge(await login("fake-due", PIN.fakeDue))).toBe(90 * GIORNO);
  });

  it("gestione con token emesso 13 giorni fa: ok; 15 giorni fa: 401", async () => {
    const ora = Math.floor(Date.now() / 1000);
    const v = await versione("fake-otto");
    const fresco = forgeSessionCookie("fake-otto", v, ora - 13 * GIORNO, ora - 13 * GIORNO + 90 * GIORNO);
    expect((await s.call("/api/me", { cookie: fresco })).status).toBe(200);
    expect((await s.call("/api/admin/audit", { cookie: fresco })).status).toBe(200);
    const vecchio = forgeSessionCookie("fake-otto", v, ora - 15 * GIORNO, ora - 15 * GIORNO + 90 * GIORNO);
    expect((await s.call("/api/me", { cookie: vecchio })).status).toBe(401);
  });

  it("altri giocatori con token di 15 giorni: ancora ok", async () => {
    const ora = Math.floor(Date.now() / 1000);
    const v = await versione("fake-due");
    const cookie = forgeSessionCookie("fake-due", v, ora - 15 * GIORNO, ora - 15 * GIORNO + 90 * GIORNO);
    expect((await s.call("/api/me", { cookie })).status).toBe(200);
  });

  it("permesso assegnato dopo l'emissione: il limite vale lo stesso", async () => {
    const ora = Math.floor(Date.now() / 1000);
    const v = await versione("fake-due");
    const cookie = forgeSessionCookie("fake-due", v, ora - 15 * GIORNO, ora - 15 * GIORNO + 90 * GIORNO);
    expect((await s.call("/api/me", { cookie })).status).toBe(200);
    await s.db.prepare("UPDATE players SET is_admin = 1 WHERE id = 'fake-due'").run();
    expect((await s.call("/api/me", { cookie })).status).toBe(401);
  });
});

describe("protezione CSRF", () => {
  it("senza Origin le richieste che scrivono sono rifiutate", async () => {
    const noOrigin = await s.call("/api/auth/login", {
      method: "POST",
      body: { playerId: "antonio", pin: PIN.antonio },
      origin: null,
    });
    expect(noOrigin.status).toBe(403);

    const otherOrigin = await s.call("/api/auth/login", {
      method: "POST",
      body: { playerId: "antonio", pin: PIN.antonio },
      origin: "https://altro.example",
    });
    expect(otherOrigin.status).toBe(403);

    const okOrigin = await s.call("/api/auth/login", {
      method: "POST",
      body: { playerId: "antonio", pin: PIN.antonio },
      origin: "http://localhost:8787",
    });
    expect(okOrigin.status).toBe(200);
  });

  it("le letture non hanno bisogno di Origin", async () => {
    expect((await s.call("/api/ranking", { origin: null })).status).toBe(200);
    expect((await s.call("/api/players", { origin: null })).status).toBe(200);
  });

  it("logout e voti senza Origin sono rifiutati", async () => {
    const session = await loginAntonio();
    const cookie = `fn_session=${sessionCookie(session)}`;
    const logout = await s.call("/api/auth/logout", { method: "POST", cookie, origin: null });
    expect(logout.status).toBe(403);
    const vote = await s.call("/api/votes/fake-uno", {
      method: "PUT",
      cookie,
      origin: null,
      body: { velTuf: 50, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50 },
    });
    expect(vote.status).toBe(403);
  });
});

describe("audit", () => {
  it("traccia senza PIN, salt o hash", async () => {
    for (let i = 0; i < 5; i++) await login("antonio", "000000");
    const cookies = await loginCookie("fake-otto", PIN.fakeOtto);
    await s.call("/api/admin/players/fake-otto/unlock", { method: "POST", cookie: cookies });

    const rows = await auditRows();
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("login_failed");
    expect(actions).toContain("account_locked");
    expect(actions).toContain("unlock");

    const cred = await s.first<{ salt: string; pin_hash: string }>("SELECT salt, pin_hash FROM credentials WHERE player_id = 'fake-otto'");
    const trail = await s.call("/api/admin/audit", { cookie: cookies });
    expect(trail.text).not.toContain(cred.salt);
    expect(trail.text).not.toContain(cred.pin_hash);
    expect(trail.text).not.toContain(PIN.fakeOtto);
    expect(rows.every((r) => !r.detail.includes(PIN.fakeOtto))).toBe(true);
  });
});