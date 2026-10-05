// PASSO 3: rotte di accesso con PIN.
// create-pin e' ammesso solo per chi non ha ancora un PIN.

import { audit } from "../audit";
import type { Env } from "../env";
import { fail, json, MSG, readJsonObject, str, withCookie } from "../http";
import { isValidPin } from "../pin";
import { storePinV2, upgradeToV2, verifyWithLocking } from "../pinflow";
import { getCredential, getPlayer, listPlayers } from "../queries";
import { clearAdminHeader, clearSessionHeader, issueSession, sessionCookieHeader } from "../session";

function hasPin(cred: { pin_origin: string; pin_hash: string } | null): boolean {
  return !!cred && cred.pin_origin !== "" && cred.pin_hash !== "";
}

export async function authPlayers(env: Env): Promise<Response> {
  const players = await listPlayers(env, { loginOnly: true });
  return json({
    players: players.map((p) => ({ id: p.id, name: p.name, role: p.role, flag: p.flag })),
  });
}

export async function authStatus(env: Env, playerId: string): Promise<Response> {
  const player = await getPlayer(env, playerId);
  if (!player || player.can_login !== 1) return fail(404, MSG.notFound);
  const cred = await getCredential(env, player.id);
  return json({ hasPin: hasPin(cred) });
}

export async function createPin(env: Env, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const playerId = str(body, "playerId").trim();
  const pin = str(body, "pin");
  const pinConfirm = str(body, "pinConfirm");
  if (!isValidPin(pin) || pin !== pinConfirm) return fail(400, MSG.badRequest);

  const player = await getPlayer(env, playerId);
  if (!player || player.can_login !== 1) return fail(404, MSG.notFound);
  const cred = await getCredential(env, player.id);
  if (hasPin(cred)) return fail(409, MSG.notReady);

  await storePinV2(env, player.id, pin);
  await audit(env, player.id, "create_pin");
  // La versione di sessione puo' essere > 0 (per esempio dopo un reset
  // del PIN): il cookie deve usare quella, altrimenti /api/me risponde 401.
  const fresh = await getCredential(env, player.id);
  const token = await issueSession(env, player.id, fresh?.session_version ?? 0);
  return withCookie(json({ ok: true, id: player.id }), sessionCookieHeader(token));
}

export async function login(env: Env, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const playerId = str(body, "playerId").trim();
  const pin = str(body, "pin");
  if (!isValidPin(pin)) return fail(400, MSG.badRequest);

  const player = await getPlayer(env, playerId);
  if (!player || player.can_login !== 1) return fail(401, MSG.unauthorized);
  const cred = await getCredential(env, player.id);
  if (!hasPin(cred)) return fail(401, MSG.pinInvalid);

  const check = await verifyWithLocking(env, player, cred!, pin);
  if (!check.ok) {
    return check.reason === "locked" ? fail(423, check.message) : fail(401, MSG.pinInvalid);
  }
  // Primo login riuscito su hash v1: si ricalcola e si salva in v2.
  if (cred!.hash_version === 1) {
    await upgradeToV2(env, player.id, pin);
    await audit(env, player.id, "pin_upgraded", "v1 -> v2");
  }
  const current = await getCredential(env, player.id);
  const token = await issueSession(env, player.id, current?.session_version ?? 0);
  return withCookie(json({ ok: true, id: player.id }), sessionCookieHeader(token));
}

export async function logout(env: Env): Promise<Response> {
  let response = json({ ok: true });
  response = withCookie(response, clearSessionHeader());
  response = withCookie(response, clearAdminHeader());
  return response;
}