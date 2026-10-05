// Rotte di gestione: serve il login normale e il permesso letto dal
// database (players.is_admin) a ogni richiesta. Valgono anche per chi
// agisce su se' stesso. Nessun PIN o hash nei dettagli.

import { audit } from "../audit";
import type { Env } from "../env";
import { fail, json, MSG } from "../http";
import { getPlayerAny } from "../queries";
import type { AuthedPlayer } from "../session";

/** Azzera PIN, tentativi e blocco, e chiude le sessioni aperte. */
export async function resetPin(env: Env, auth: AuthedPlayer, targetId: string): Promise<Response> {
  const target = await getPlayerAny(env, targetId);
  if (!target) return fail(404, MSG.notFound);
  await env.DB.prepare(
    `INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at)
     VALUES (?, '', '', '', 1, 0, NULL, 1, ?)
     ON CONFLICT(player_id) DO UPDATE SET salt = '', pin_hash = '', pin_origin = '', hash_version = 1,
       failed_attempts = 0, locked_until = NULL, session_version = credentials.session_version + 1,
       updated_at = excluded.updated_at`,
  )
    .bind(target.id, new Date().toISOString())
    .run();
  await audit(env, auth.player.id, "reset_pin", `target=${target.id}`);
  return json({ ok: true, id: target.id, hasPin: false });
}

/** Sblocca subito un account. */
export async function unlock(env: Env, auth: AuthedPlayer, targetId: string): Promise<Response> {
  const target = await getPlayerAny(env, targetId);
  if (!target) return fail(404, MSG.notFound);
  await env.DB.prepare(
    `INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at)
     VALUES (?, '', '', '', 1, 0, NULL, 0, ?)
     ON CONFLICT(player_id) DO UPDATE SET failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at`,
  )
    .bind(target.id, new Date().toISOString())
    .run();
  await audit(env, auth.player.id, "unlock", `target=${target.id}`);
  return json({ ok: true, id: target.id });
}

export async function auditTrail(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT a.id AS id, a.at AS at, a.actor_player_id AS actorPlayerId, p.name AS actorName,
            a.action AS action, a.detail AS detail
       FROM audit_log a LEFT JOIN players p ON p.id = a.actor_player_id
      ORDER BY a.id DESC
      LIMIT 200`,
  ).all<Record<string, unknown>>();
  return json({ events: rows.results ?? [] });
}