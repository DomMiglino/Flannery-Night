// PASSO 3: rotte dell'area amministrazione.
// Servono entrambi i cookie (giocatore + area) e valgono anche per
// l'admin che agisce su se' stesso. Nessun PIN o hash nei dettagli.

import { audit } from "../audit";
import type { Env } from "../env";
import { fail, json, MSG, readJsonObject, str, withCookie } from "../http";
import { getCredential, getPlayerAny } from "../queries";
import { verifyWithLocking } from "../pinflow";
import type { AuthedPlayer } from "../session";
import { adminCookieHeader, issueAdminSession } from "../session";

/** Accesso all'area: il PIN viene richiesto di nuovo, conta nel blocco. */
export async function adminSession(env: Env, auth: AuthedPlayer, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const pin = str(body, "pin");
  if (!/^\d{6}$/.test(pin)) return fail(400, MSG.badRequest);

  const cred = await getCredential(env, auth.player.id);
  if (!cred || cred.pin_origin === "" || cred.pin_hash === "") return fail(401, MSG.unauthorized);

  const check = await verifyWithLocking(env, auth.player, cred, pin);
  if (!check.ok) {
    return check.reason === "locked" ? fail(423, check.message) : fail(401, MSG.pinInvalid);
  }
  const token = await issueAdminSession(env, auth.player.id, auth.sessionVersion);
  await audit(env, auth.player.id, "admin_session");
  return withCookie(json({ ok: true }), adminCookieHeader(token));
}

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