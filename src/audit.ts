// PASSO 3: scritture di audit.
// Tracciamo login falliti, blocchi, creazione e cambio PIN, reset,
// sblocco e accessi di amministrazione. Nei dettagli mai PIN o hash.

import type { Env } from "./env";

export type AuditAction =
  | "login_failed"
  | "account_locked"
  | "create_pin"
  | "change_pin"
  | "pin_upgraded"
  | "reset_pin"
  | "unlock"
  | "match_create"
  | "match_update"
  | "match_delete";

export async function audit(env: Env, actor: string | null, action: AuditAction, detail = ""): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_log (at, actor_player_id, action, detail) VALUES (datetime('now'), ?, ?, ?)",
  )
    .bind(actor, action, detail)
    .run();
}