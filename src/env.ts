// PASSO 3: variabili d'ambiente del Worker.
// PIN_PEPPER e SESSION_SECRET arrivano da .dev.vars in locale e da
// `wrangler secret put` in produzione: non stanno mai nel codice.

export interface Env {
  DB: D1Database;
  PIN_PEPPER: string;
  SESSION_SECRET: string;
  ASSETS?: Fetcher;
}

export function secret(env: Env, name: "PIN_PEPPER" | "SESSION_SECRET"): string {
  const v = env[name];
  if (typeof v !== "string" || v.length < 16) {
    throw new Error(`segreto mancante o troppo corto: ${name}`);
  }
  return v;
}