// PASSO 3: variabili d'ambiente del Worker.
// PIN_PEPPER e SESSION_SECRET arrivano da .dev.vars in locale e da
// `wrangler secret put` in produzione: non stanno mai nel codice.

export interface Env {
  DB: D1Database;
  PIN_PEPPER: string;
  SESSION_SECRET: string;
  /** Percorso della pagina di gestione: blocco 5a. */
  ADMIN_PATH?: string;
  ASSETS?: Fetcher;
}

/** Il percorso non deve contenere la parola "admin": resta configurabile. */
export const ADMIN_PATH_FALLBACK = "/copilota";

export function adminPath(env: Env): string {
  const raw = String(env.ADMIN_PATH ?? "").trim();
  if (!raw) return ADMIN_PATH_FALLBACK;
  return raw.startsWith("/") ? raw : "/" + raw;
}

export function secret(env: Env, name: "PIN_PEPPER" | "SESSION_SECRET"): string {
  const v = env[name];
  if (typeof v !== "string" || v.length < 16) {
    throw new Error(`segreto mancante o troppo corto: ${name}`);
  }
  return v;
}