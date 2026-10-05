// PASSO 3: harness dei test. Worker compilato con esbuild e eseguito
// dentro miniflare con un D1 locale temporaneo. Solo dati inventati:
// i fixture arrivano da tests/fixtures e i PIN sono calcolati qui.

import { Miniflare } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndBuild } from "../../migration/build.mjs";
import { hashV1, newPinHash } from "../../src/pin";
import { splitSql } from "./sql";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PEPPER = "pepper-di-prova-0123456789abcdef";
export const SESSION_SECRET = "segreto-di-prova-0123456789abcdef";
export const BASE = "http://localhost:8787";
const ORIGIN = BASE;

export const PIN = {
  antonio: "123456",
  antonioportiere: "222222",
  fakeDue: "444444",
  fakeOtto: "555555",
};

let bundle: Promise<string> | null = null;

/** workerd risolve i moduli solo dentro la cartella di lavoro: il bundle va qui. */
const BUILD_DIR = join(ROOT, ".tmp-tests");

function workerBundle(): Promise<string> {
  if (!bundle) {
    bundle = (async () => {
      mkdirSync(BUILD_DIR, { recursive: true });
      const out = join(BUILD_DIR, "worker.js");
      await build({
        entryPoints: [join(ROOT, "src/worker.ts")],
        outfile: out,
        bundle: true,
        format: "esm",
        target: "es2022",
        platform: "browser",
        conditions: ["workerd", "worker", "browser"],
        logLevel: "silent",
      });
      return out;
    })();
  }
  return bundle;
}

const FIXTURES = join(ROOT, "tests", "fixtures");
const NOW = "2026-10-02T00:00:00.000Z";

/** Fixture + righe inventate: un secondo admin, un esterno senza accesso, una stagione futura. */
function seedSql(): string {
  const season = JSON.parse(readFileSync(join(FIXTURES, "season.json"), "utf-8"));
  const access = JSON.parse(readFileSync(join(FIXTURES, "access.json"), "utf-8"));
  const votes = JSON.parse(readFileSync(join(FIXTURES, "votes.json"), "utf-8"));
  const { sql } = validateAndBuild(season, access, votes, NOW);
  return `${sql}
INSERT INTO seasons (id, name, is_active) VALUES (2, '2099/00', 0);
UPDATE players SET is_admin = 1 WHERE id = 'fake-otto';
INSERT INTO players (id, name, role, flag, active, can_login, is_admin) VALUES ('fake-esterno', 'Fake Esterno', 'CC', NULL, 1, 0, 0);
INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, session_version, updated_at) VALUES ('fake-esterno', '', '', '', 1, 0, 0, '2026-09-01T10:00:00.000Z');
INSERT INTO votes (voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia, updated_at) VALUES ('fake-uno', 'fake-esterno', 70, 70, 70, 70, 70, 70, '2026-09-01T10:00:00.000Z');
`;
}

const WIPE = `DELETE FROM votes;
DELETE FROM match_players;
DELETE FROM matches;
DELETE FROM credentials;
DELETE FROM audit_log;
DELETE FROM players;
DELETE FROM seasons;
DELETE FROM sqlite_sequence WHERE name IN ('seasons', 'audit_log');`;

export interface Reply {
  status: number;
  body: any;
  text: string;
  cookies: string[];
  headers: Headers;
}

export interface TestServer {
  mf: Miniflare;
  db: D1Database;
  call(path: string, opts?: CallOptions): Promise<Reply>;
  first<T>(sql: string, ...binds: unknown[]): Promise<T>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  cookie?: string | null;
  origin?: string | null;
}

function cookieValue(setCookie: string[], name: string): string | null {
  for (const raw of setCookie) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    if (pair.slice(0, idx).trim() === name) return pair.slice(idx + 1).trim();
  }
  return null;
}

/** Cookie di sessione dalla risposta, pronto per la richiesta successiva. */
export function sessionCookie(reply: Reply): string | null {
  return cookieValue(reply.cookies, "fn_session");
}

export function adminCookieFrom(reply: Reply): string | null {
  return cookieValue(reply.cookies, "fn_admin");
}

/** Cookie di sessione + cookie area, da usare sulle rotte di amministrazione. */
export function bothCookies(reply: Reply): string {
  return `fn_session=${sessionCookie(reply)}; fn_admin=${adminCookieFrom(reply)}`;
}

async function applyCredentials(db: D1Database): Promise<void> {
  const admin = await newPinHash(PEPPER, PIN.antonio);
  await db
    .prepare(
      "UPDATE credentials SET salt = ?, pin_hash = ?, pin_origin = 'user', hash_version = 2, failed_attempts = 0, locked_until = NULL, session_version = 0 WHERE player_id = 'antonio'",
    )
    .bind(admin.salt, admin.hash)
    .run();
  // Versione 1: ancora quella importata, serve per il passaggio a v2.
  await db
    .prepare(
      "UPDATE credentials SET salt = 'fake-salt-v1', pin_hash = ?, pin_origin = 'user', hash_version = 1, failed_attempts = 0, locked_until = NULL, session_version = 0 WHERE player_id = 'antonioportiere'",
    )
    .bind(await hashV1("fake-salt-v1", PIN.antonioportiere))
    .run();
  const due = await newPinHash(PEPPER, PIN.fakeDue);
  await db
    .prepare(
      "UPDATE credentials SET salt = ?, pin_hash = ?, pin_origin = 'user', hash_version = 2, failed_attempts = 0, locked_until = NULL, session_version = 0 WHERE player_id = 'fake-due'",
    )
    .bind(due.salt, due.hash)
    .run();
  const otto = await newPinHash(PEPPER, PIN.fakeOtto);
  await db
    .prepare(
      "UPDATE credentials SET salt = ?, pin_hash = ?, pin_origin = 'user', hash_version = 2, failed_attempts = 0, locked_until = NULL, session_version = 0 WHERE player_id = 'fake-otto'",
    )
    .bind(otto.salt, otto.hash)
    .run();
  // fake-uno e fake-tre restano senza PIN: possono crearselo.
}

/**
 * D1 exec non accetta le CREATE TABLE su piu' righe: spezziamo noi il
 * testo (come fa wrangler) e applichiamo una istruzione alla volta.
 */
async function runSql(db: D1Database, sql: string): Promise<void> {
  for (const statement of splitSql(sql)) {
    await db.prepare(statement).run();
  }
}

export async function startServer(): Promise<TestServer> {
  const scriptPath = await workerBundle();
  const persist = mkdtempSync(join(tmpdir(), "fn-d1-"));
  const mf = new Miniflare({
    scriptPath,
    modules: true,
    compatibilityDate: "2026-05-01",
    d1Databases: { DB: "local" },
    d1Persist: persist,
    bindings: {
      PIN_PEPPER: PEPPER,
      SESSION_SECRET: SESSION_SECRET,
      ADMIN_PATH: "/copilota",
    },
  });
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;

  await runSql(db, readFileSync(join(ROOT, "migrations", "0001_init.sql"), "utf-8"));
  await runSql(db, readFileSync(join(ROOT, "migration", "triggers.sql"), "utf-8"));

  const triggersSql = readFileSync(join(ROOT, "migration", "triggers.sql"), "utf-8");

  const reset = async () => {
    // I trigger guidinha impediscono di svuotare match_players: si tolgono
    // solo per il reset dei test e vengono rimessi subito dopo.
    await runSql(db, "DROP TRIGGER IF EXISTS trg_matches_guidinha_played_insert;");
    await runSql(db, "DROP TRIGGER IF EXISTS trg_matches_guidinha_played_update;");
    await runSql(db, "DROP TRIGGER IF EXISTS trg_match_players_guidinha_protect_delete;");
    await runSql(db, WIPE);
    await runSql(db, seedSql());
    await runSql(db, triggersSql);
    await applyCredentials(db);
  };
  await reset();

  const call = async (path: string, opts: CallOptions = {}): Promise<Reply> => {
    const headers = new Headers();
    if (opts.body !== undefined) headers.set("content-type", "application/json");
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers.set("origin", origin);
    if (opts.cookie) headers.set("cookie", opts.cookie);
    const init = { method: opts.method ?? "GET", headers } as Parameters<Miniflare["dispatchFetch"]>[1];
    if (opts.body !== undefined) (init as { body?: string }).body = JSON.stringify(opts.body);
    const res = await mf.dispatchFetch(`${BASE}${path}`, init);
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const headers2 = res.headers as unknown as { getSetCookie?: () => string[] };
    const cookies = typeof headers2.getSetCookie === "function" ? headers2.getSetCookie() : [];
    return { status: res.status, body, text, cookies, headers: res.headers };
  };

  /** Una riga dal D1 di test: se manca, il test fallisce con un messaggio chiaro. */
  const first = async <T>(sql: string, ...binds: unknown[]): Promise<T> => {
    const stmt = binds.length > 0 ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    const row = await stmt.first<T>();
    if (!row) throw new Error(`riga non trovata: ${sql}`);
    return row;
  };

  return {
    mf,
    db,
    call,
    first,
    reset,
    dispose: async () => {
      await mf.dispose();
    },
  };
}