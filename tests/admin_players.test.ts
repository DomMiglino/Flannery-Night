import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FLAGS } from "../src/flags_list";
import { testoBandiere } from "../scripts/genera-bandiere.mjs";
import { elencoBandiere } from "../src/routes/routes_players_admin";
import { withAppearances } from "../public/js/lists.js";
import { PIN, sessionCookie, startServer, type TestServer } from "./helpers/server";

let s: TestServer;
const FLAG = "Italia.png";
const INPUT = { name: "Nuovo Nome", role: "CC", flag: FLAG };

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

async function creaGiocatore(cookie: string, dati: Record<string, unknown> = INPUT) {
  return s.call("/api/admin/players", { method: "POST", body: dati, cookie });
}

describe("permessi gestione giocatori", () => {
  it("richiede accesso per tutte le nuove letture e scritture", async () => {
    const richieste = [
      ["/api/admin/flags", {}],
      ["/api/admin/players", {}],
      ["/api/admin/players/fake-uno", {}],
      ["/api/admin/players", { method: "POST", body: INPUT }],
      ["/api/admin/players/fake-uno", { method: "PUT", body: { ...INPUT, name: "Altro" } }],
      ["/api/admin/players/fake-esterno", { method: "DELETE" }],
      ["/api/admin/players/fake-uno/reset-pin", { method: "POST" }],
      ["/api/admin/players/fake-uno/unlock", { method: "POST" }],
    ] as const;

    for (const [path, options] of richieste) {
      expect((await s.call(path, options)).status, path).toBe(401);
    }
  });

  it("rifiuta un giocatore senza permesso su ogni nuova rotta", async () => {
    const cookie = await loginCookie("fake-due", PIN.fakeDue);
    const richieste = [
      ["/api/admin/flags", {}],
      ["/api/admin/players", {}],
      ["/api/admin/players/fake-uno", {}],
      ["/api/admin/players", { method: "POST", body: INPUT }],
      ["/api/admin/players/fake-uno", { method: "PUT", body: { ...INPUT, name: "Altro" } }],
      ["/api/admin/players/fake-esterno", { method: "DELETE" }],
      ["/api/admin/players/fake-uno/reset-pin", { method: "POST" }],
      ["/api/admin/players/fake-uno/unlock", { method: "POST" }],
    ] as const;

    for (const [path, options] of richieste) {
      expect((await s.call(path, { ...options, cookie })).status, path).toBe(403);
    }
  });

  it("l'admin legge le nuove rotte e il permesso revocato vale subito", async () => {
    const cookie = await loginCookie();
    expect((await s.call("/api/admin/flags", { cookie })).status).toBe(200);
    const elenco = await s.call("/api/admin/players", { cookie });
    expect(elenco.status).toBe(200);
    expect(Object.keys(elenco.body.players[0]).sort()).toEqual(["canLogin", "flag", "id", "name", "role"]);
    expect(elenco.text).not.toMatch(/pin_hash|pinHash|salt/);
    expect((await s.call("/api/admin/players/fake-uno", { cookie })).status).toBe(200);
    expect((await creaGiocatore(cookie)).status).toBe(201);

    await s.db.prepare("UPDATE players SET is_admin = 0 WHERE id = 'fake-otto'").run();
    const richieste = [
      ["/api/admin/flags", {}],
      ["/api/admin/players", {}],
      ["/api/admin/players/fake-uno", {}],
      ["/api/admin/players", { method: "POST", body: { ...INPUT, name: "Dopo revoca" } }],
      ["/api/admin/players/fake-uno", { method: "PUT", body: { ...INPUT, name: "Dopo revoca" } }],
      ["/api/admin/players/fake-esterno", { method: "DELETE" }],
      ["/api/admin/players/fake-uno/reset-pin", { method: "POST" }],
      ["/api/admin/players/fake-uno/unlock", { method: "POST" }],
    ] as const;
    for (const [path, options] of richieste) {
      expect((await s.call(path, { ...options, cookie })).status, path).toBe(403);
    }
    expect(await s.db.prepare("SELECT id FROM players WHERE id = 'fake-esterno'").first()).not.toBeNull();
  });

  it("rifiuta Origin diverso su ogni nuova scrittura", async () => {
    const cookie = await loginCookie();
    const richieste = [
      ["/api/admin/players", "POST", INPUT],
      ["/api/admin/players/fake-uno", "PUT", { ...INPUT, name: "Altro" }],
      ["/api/admin/players/fake-esterno", "DELETE", undefined],
      ["/api/admin/players/fake-uno/reset-pin", "POST", undefined],
      ["/api/admin/players/fake-uno/unlock", "POST", undefined],
    ] as const;

    for (const [path, method, body] of richieste) {
      expect((await s.call(path, { method, body, cookie, origin: "https://evil.invalid" })).status, path).toBe(403);
    }
    expect(await s.db.prepare("SELECT id FROM players WHERE name = 'Nuovo Nome'").first()).toBeNull();
  });
});

describe("creazione", () => {
  it("imposta active e i permessi corretti, crea le credenziali nello stesso flusso", async () => {
    const cookie = await loginCookie();
    const creato = await creaGiocatore(cookie, { ...INPUT, isAdmin: true });
    expect(creato.status).toBe(201);
    expect(creato.body).toMatchObject({ name: "Nuovo Nome", role: "CC", flag: FLAG, canLogin: true });
    const player = await s.first<{ active: number; can_login: number; is_admin: number }>(
      "SELECT active, can_login, is_admin FROM players WHERE id = ?",
      creato.body.id,
    );
    const cred = await s.first<{ pin_origin: string; salt: string; pin_hash: string }>(
      "SELECT pin_origin, salt, pin_hash FROM credentials WHERE player_id = ?",
      creato.body.id,
    );
    expect(player).toEqual({ active: 1, can_login: 1, is_admin: 0 });
    expect(cred).toEqual({ pin_origin: "", salt: "", pin_hash: "" });

    const senzaAccesso = await creaGiocatore(cookie, { ...INPUT, name: "Senza Accesso", canLogin: false });
    expect(senzaAccesso.status).toBe(201);
    expect(senzaAccesso.body.canLogin).toBe(false);
    expect(await s.first<{ can_login: number }>("SELECT can_login FROM players WHERE id = ?", senzaAccesso.body.id)).toEqual({ can_login: 0 });
  });

  it("crea slug accentati e usa il suffisso numerico quando l'id esiste", async () => {
    const cookie = await loginCookie();
    await s.db
      .prepare("INSERT INTO players (id, name, role, flag) VALUES ('eva-de-luca', 'Nome già presente', 'CC', NULL)")
      .run();
    const creato = await creaGiocatore(cookie, { ...INPUT, name: "Éva De Luca" });
    expect(creato.status).toBe(201);
    expect(creato.body.id).toBe("eva-de-luca-1");
    expect(await s.db.prepare("SELECT id FROM players WHERE id = 'eva-de-luca-1'").first()).not.toBeNull();
  });

  it("rifiuta nome vuoto, lungo, duplicato anche con maiuscole o accenti diversi", async () => {
    const cookie = await loginCookie();
    await s.db.prepare("INSERT INTO players (id, name, role) VALUES ('eva-nuova', 'Éva', 'CC')").run();
    const casi = [
      [{ ...INPUT, name: "  " }, "da 1 a 40"],
      [{ ...INPUT, name: "x".repeat(41) }, "da 1 a 40"],
      [{ ...INPUT, name: "FAKE UNO" }, "esiste già"],
      [{ ...INPUT, name: "éVA" }, "esiste già"],
    ] as const;
    for (const [body, errore] of casi) {
      const result = await creaGiocatore(cookie, body);
      expect(result.status).toBe(400);
      expect(result.body.error).toContain(errore);
    }
  });

  it("rifiuta ruolo non ammesso, bandiera vuota o assente dall'elenco", async () => {
    const cookie = await loginCookie();
    for (const body of [
      { ...INPUT, role: "XX" },
      { ...INPUT, flag: "" },
      { ...INPUT, flag: "fuori-elenco.png" },
      { ...INPUT, flag: undefined },
      { ...INPUT, canLogin: "sì" },
    ]) {
      expect((await creaGiocatore(cookie, body)).status).toBe(400);
    }
    expect(await s.db.prepare("SELECT id FROM players WHERE name = 'Nuovo Nome'").first()).toBeNull();
  });
});

describe("modifica", () => {
  it("aggiorna nome, ruolo, bandiera e accesso lasciando invariato l'id", async () => {
    const cookie = await loginCookie();
    const creato = await creaGiocatore(cookie, { ...INPUT, name: "Prima Versione" });
    const result = await s.call(`/api/admin/players/${creato.body.id}`, {
      method: "PUT",
      cookie,
      body: { name: "Seconda Versione", role: "DL", flag: "Cile.png", canLogin: false, isAdmin: true },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: creato.body.id, name: "Seconda Versione", role: "DL", flag: "Cile.png", canLogin: false });
    const row = await s.first<{ name: string; role: string; flag: string; can_login: number; is_admin: number }>(
      "SELECT name, role, flag, can_login, is_admin FROM players WHERE id = ?",
      creato.body.id,
    );
    expect(row).toEqual({ name: "Seconda Versione", role: "DL", flag: "Cile.png", can_login: 0, is_admin: 0 });
    const audit = await s.db.prepare("SELECT detail FROM audit_log WHERE action = 'player_update' ORDER BY id DESC LIMIT 1").first<{ detail: string }>();
    expect(audit?.detail).toContain("Prima Versione");
    expect(audit?.detail).toContain("Seconda Versione");
  });

  it("rifiuta nomi usati, ma conserva una bandiera storica identica fuori elenco", async () => {
    const cookie = await loginCookie();
    const creato = await creaGiocatore(cookie, { ...INPUT, name: "Bandiera Storica" });
    await s.db.prepare("UPDATE players SET flag = 'vecchia.svg' WHERE id = ?").bind(creato.body.id).run();
    const duplicato = await s.call(`/api/admin/players/${creato.body.id}`, {
      method: "PUT",
      cookie,
      body: { name: "FAKE UNO", role: "CC", flag: "vecchia.svg", canLogin: true },
    });
    expect(duplicato.status).toBe(400);
    const invariata = await s.call(`/api/admin/players/${creato.body.id}`, {
      method: "PUT",
      cookie,
      body: { name: "Bandiera Storica", role: "CC", flag: "vecchia.svg", canLogin: true },
    });
    expect(invariata.status).toBe(200);
    expect(invariata.body.flag).toBe("vecchia.svg");
    expect(invariata.body.id).toBe(creato.body.id);
  });

  it("canLogin da true a false invalida le sessioni e rifiuta il login successivo", async () => {
    const admin = await loginCookie();
    const creato = await creaGiocatore(admin, { ...INPUT, name: "Accesso Revocabile" });
    const playerId = creato.body.id as string;
    const creaPin = await s.call("/api/auth/create-pin", {
      method: "POST",
      body: { playerId, pin: "123456", pinConfirm: "123456" },
    });
    expect(creaPin.status).toBe(200);
    const cookie = `fn_session=${sessionCookie(creaPin)}`;
    const prima = await s.first<{ session_version: number }>("SELECT session_version FROM credentials WHERE player_id = ?", playerId);

    const disattiva = await s.call(`/api/admin/players/${playerId}`, {
      method: "PUT",
      cookie: admin,
      body: { ...INPUT, name: "Accesso Revocabile", canLogin: false },
    });
    expect(disattiva.status).toBe(200);
    const dopo = await s.first<{ session_version: number }>("SELECT session_version FROM credentials WHERE player_id = ?", playerId);
    expect(dopo.session_version).toBe(prima.session_version + 1);
    expect((await s.call("/api/me", { cookie })).status).toBe(401);
    expect((await s.call("/api/auth/login", { method: "POST", body: { playerId, pin: "123456" } })).status).toBe(401);
  });
});

describe("dettaglio", () => {
  it("restituisce solo stati e conteggi, senza credenziali né voti singoli", async () => {
    const cookie = await loginCookie();
    const finoA = new Date(Date.now() + 60_000).toISOString();
    await s.db.prepare("UPDATE credentials SET pin_origin = 'user', locked_until = ? WHERE player_id = 'fake-uno'").bind(finoA).run();
    const result = await s.call("/api/admin/players/fake-uno", { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "fake-uno", pinCreated: true, locked: true, lockedUntil: finoA, matchesCount: 2, isAdmin: false });
    expect(result.body).toHaveProperty("votesGivenCount");
    expect(result.body).toHaveProperty("votesReceivedCount");
    expect(result.text).not.toMatch(/pin_hash|pinHash|salt|vel_tuf|tir_pre|pass_rin|dri_rif|dif_rea|fis_pia/);

    await s.db.prepare("UPDATE credentials SET locked_until = '2000-01-01T00:00:00.000Z' WHERE player_id = 'fake-uno'").run();
    const sbloccato = await s.call("/api/admin/players/fake-uno", { cookie });
    expect(sbloccato.body.locked).toBe(false);
    expect(sbloccato.body.lockedUntil).toBeNull();
  });

  it("restituisce 404 per un giocatore inesistente", async () => {
    const result = await s.call("/api/admin/players/inesistente", { cookie: await loginCookie() });
    expect(result.status).toBe(404);
  });
});

describe("eliminazione", () => {
  it("rimuove voti e credenziali in batch, ricalcola le mediane e registra una copia leggibile", async () => {
    const cookie = await loginCookie();
    const creato = await creaGiocatore(cookie, { ...INPUT, name: "Da Eliminare", canLogin: false });
    const id = creato.body.id as string;
    await s.db.prepare("UPDATE credentials SET salt = 'segreto-salt-prova', pin_hash = 'segreto-hash-prova' WHERE player_id = ?").bind(id).run();
    await s.db
      .prepare("INSERT INTO votes (voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia) VALUES (?, 'fake-esterno', 99, 99, 99, 99, 99, 99)")
      .bind(id)
      .run();
    await s.db
      .prepare("INSERT INTO votes (voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia) VALUES ('fake-esterno', ?, 45, 45, 45, 45, 45, 45)")
      .bind(id)
      .run();
    await s.db.prepare("INSERT INTO audit_log (actor_player_id, action, detail) VALUES (?, 'login_failed', 'prova')").bind(id).run();

    const result = await s.call(`/api/admin/players/${id}`, { method: "DELETE", cookie });
    expect(result.status).toBe(200);
    expect(await s.db.prepare("SELECT id FROM players WHERE id = ?").bind(id).first()).toBeNull();
    expect(await s.db.prepare("SELECT player_id FROM credentials WHERE player_id = ?").bind(id).first()).toBeNull();
    expect(await s.db.prepare("SELECT voter_id FROM votes WHERE voter_id = ? OR target_id = ?").bind(id, id).first()).toBeNull();
    const attoriStorici = await s.db.prepare("SELECT actor_player_id FROM audit_log WHERE action = 'login_failed'").first<{ actor_player_id: string | null }>();
    expect(attoriStorici?.actor_player_id).toBeNull();

    const players = await s.call("/api/players");
    expect(players.body.players.find((p: { id: string }) => p.id === "fake-esterno").velTuf).toBe(70);
    const audit = await s.call("/api/admin/audit", { cookie });
    const evento = audit.body.events.find((e: { action: string; detail: string }) => e.action === "player_delete");
    expect(evento.detail).toContain("nome=Da Eliminare");
    expect(evento.detail).toContain("ruolo=CC");
    expect(evento.detail).toContain("votiDati=1");
    expect(evento.detail).toContain("votiRicevuti=1");
    expect(audit.text).not.toContain("segreto-salt-prova");
    expect(audit.text).not.toContain("segreto-hash-prova");
    expect(evento.detail).not.toContain("99");
    expect(evento.detail).not.toContain("45");
  });

  it("non elimina chi ha giocato, un altro account di gestione o sé stesso", async () => {
    const cookie = await loginCookie();
    const conteggioAudit = await s.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'player_delete'").first<{ n: number }>();
    const giocato = await s.call("/api/admin/players/fake-uno", { method: "DELETE", cookie });
    expect(giocato.status).toBe(409);
    expect(giocato.body.error).toContain("Ha giocato");

    await s.db.prepare("UPDATE players SET is_admin = 1 WHERE id = 'fake-due'").run();
    expect((await s.call("/api/admin/players/fake-due", { method: "DELETE", cookie })).status).toBe(409);
    const seStesso = await s.call("/api/admin/players/fake-otto", { method: "DELETE", cookie });
    expect(seStesso.status).toBe(409);
    expect(seStesso.body.error).toContain("stesso account");
    const dopo = await s.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'player_delete'").first<{ n: number }>();
    expect(dopo?.n).toBe(conteggioAudit?.n);
    expect(await s.db.prepare("SELECT id FROM players WHERE id = 'fake-uno'").first()).not.toBeNull();
  });
});

describe("PIN e sblocco", () => {
  it("resetta PIN e stato blocco; sblocca sia un account bloccato sia uno già libero", async () => {
    const cookie = await loginCookie();
    await s.db
      .prepare("UPDATE credentials SET pin_origin = 'user', salt = 'salt-prova', pin_hash = 'hash-prova', failed_attempts = 6, locked_until = ? WHERE player_id = 'fake-uno'")
      .bind(new Date(Date.now() + 60_000).toISOString())
      .run();
    const reset = await s.call("/api/admin/players/fake-uno/reset-pin", { method: "POST", cookie });
    expect(reset.status).toBe(200);
    expect(await s.first<{ pin_origin: string; salt: string; pin_hash: string; failed_attempts: number; locked_until: string | null }>(
      "SELECT pin_origin, salt, pin_hash, failed_attempts, locked_until FROM credentials WHERE player_id = 'fake-uno'",
    )).toMatchObject({ pin_origin: "", salt: "", pin_hash: "", failed_attempts: 0, locked_until: null });

    await s.db.prepare("UPDATE credentials SET failed_attempts = 4, locked_until = ? WHERE player_id = 'fake-uno'").bind(new Date(Date.now() + 60_000).toISOString()).run();
    expect((await s.call("/api/admin/players/fake-uno/unlock", { method: "POST", cookie })).status).toBe(200);
    expect((await s.call("/api/admin/players/fake-uno/unlock", { method: "POST", cookie })).status).toBe(200);
    expect(await s.first<{ failed_attempts: number; locked_until: string | null }>(
      "SELECT failed_attempts, locked_until FROM credentials WHERE player_id = 'fake-uno'",
    )).toEqual({ failed_attempts: 0, locked_until: null });
  });
});

describe("bandiere", () => {
  it("l'elenco generato coincide con i soli PNG presenti", () => {
    const files = readdirSync(join(process.cwd(), "public", "flags"))
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    expect(FLAGS.map((flag) => flag.filename)).toEqual(files);
    expect(FLAGS.every((flag) => flag.filename.endsWith(".png"))).toBe(true);
  });

  it("generare due volte lo stesso elenco dà lo stesso testo", () => {
    const elenco = ["Tunisia.png", "Argentina.png", "Italia.png"];
    expect(testoBandiere([...elenco].reverse())).toBe(testoBandiere(elenco));
    expect(testoBandiere(elenco)).not.toContain("\r");
  });

  it("se la lista manca indica come rigenerarla; l'endpoint richiede il permesso", async () => {
    const vuoto = await elencoBandiere([]);
    expect(vuoto.status).toBe(500);
    expect(await vuoto.text()).toContain("Esegui npm run flags");
    expect((await s.call("/api/admin/flags")).status).toBe(401);
    const nonAdmin = await loginCookie("fake-due", PIN.fakeDue);
    expect((await s.call("/api/admin/flags", { cookie: nonAdmin })).status).toBe(403);
    const admin = await loginCookie();
    expect((await s.call("/api/admin/flags", { cookie: admin })).body.flags).toEqual(FLAGS);
  });
});

describe("giocatore appena creato", () => {
  it("è pubblico e utilizzabile nell'editor partite, ma non appare nella classifica prima di giocare", async () => {
    const cookie = await loginCookie();
    const creato = await creaGiocatore(cookie, { ...INPUT, name: "Esordiente" });
    const id = creato.body.id as string;
    expect((await s.call("/api/players")).body.players.some((p: { id: string }) => p.id === id)).toBe(true);
    expect((await s.call("/api/admin/players", { cookie })).body.players.some((p: { id: string; canLogin: boolean }) => p.id === id && p.canLogin)).toBe(true);
    const { rows: classificaIniziale } = (await s.call("/api/ranking")).body;
    expect(withAppearances(classificaIniziale).some((r: { id: string }) => r.id === id)).toBe(false);

    const votante = await loginCookie("fake-due", PIN.fakeDue);
    const voto = await s.call(`/api/votes/${id}`, {
      method: "PUT",
      cookie: votante,
      body: { velTuf: 70, tirPre: 70, passRin: 70, driRif: 70, difRea: 70, fisPia: 70 },
    });
    expect(voto.status).toBe(200);
    expect((await s.call("/api/me/votes", { cookie: votante })).body.votes.some((r: { targetId: string }) => r.targetId === id)).toBe(true);

    const teamA = ["antonio", "fake-uno", "fake-tre", "fake-quattro", id].map((playerId) => ({ playerId, goals: 0, ownGoals: 0, mvp: false }));
    const teamB = ["antonioportiere", "fake-due", "fake-sei", "fake-sette", "fake-otto"].map((playerId) => ({ playerId, goals: 0, ownGoals: 0, mvp: false }));
    const partita = await s.call("/api/admin/matches", {
      method: "POST",
      cookie,
      body: { date: "2026-10-04", format: 5, teamA, teamB, guidinha: null },
    });
    expect(partita.status).toBe(201);
    expect((await s.call("/api/ranking")).body.rows.some((r: { id: string; played: number }) => r.id === id && r.played > 0)).toBe(true);

    const { rows: classificaSuccessiva } = (await s.call("/api/ranking")).body;
    expect(withAppearances(classificaSuccessiva).some((r: { id: string }) => r.id === id)).toBe(true);
  });
});