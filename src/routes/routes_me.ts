// PASSO 3: rotte /api/me, cioe' il giocatore collegato.
// /api/me/pin sbagliare sul PIN attuale conta nel blocco; quando va
// bene la sessione si sposta su questo telefono e chiude le altre.

import { audit } from "../audit";
import type { Env } from "../env";
import { fail, json, MSG, readJsonObject, str, withCookie } from "../http";
import { isValidPin } from "../pin";
import { storePinV2, verifyWithLocking } from "../pinflow";
import { getCredential } from "../queries";
import type { AuthedPlayer } from "../session";
import { currentPlayer, issueSession, sessionCookieHeader } from "../session";
import { ceilOverallForRole, overallForRole } from "../calc";

export async function me(auth: AuthedPlayer): Promise<Response> {
  return json({
    id: auth.player.id,
    name: auth.player.name,
    role: auth.player.role,
    isAdmin: auth.player.is_admin === 1,
  });
}

export async function changePin(env: Env, auth: AuthedPlayer, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const current = str(body, "current");
  const next = str(body, "new");
  const nextConfirm = str(body, "newConfirm");
  if (!isValidPin(next) || next !== nextConfirm) return fail(400, MSG.badRequest);

  const cred = await getCredential(env, auth.player.id);
  if (!cred || cred.pin_origin === "" || cred.pin_hash === "") return fail(409, MSG.notReady);

  const check = await verifyWithLocking(env, auth.player, cred, current);
  if (!check.ok) {
    return check.reason === "locked" ? fail(423, check.message) : fail(401, MSG.pinInvalid);
  }

  // session_version + 1 chiude le sessioni aperte sugli altri telefoni.
  await env.DB.prepare("UPDATE credentials SET session_version = session_version + 1 WHERE player_id = ?")
    .bind(auth.player.id)
    .run();
  await storePinV2(env, auth.player.id, next);
  await audit(env, auth.player.id, "change_pin");
  const fresh = await getCredential(env, auth.player.id);
  const token = await issueSession(env, auth.player.id, fresh?.session_version ?? auth.sessionVersion + 1);
  return withCookie(json({ ok: true }), sessionCookieHeader(token));
}

export async function myVotes(env: Env, auth: AuthedPlayer): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT v.target_id AS targetId, p.name AS targetName, p.role AS targetRole,
            v.vel_tuf AS velTuf, v.tir_pre AS tirPre, v.pass_rin AS passRin, v.dri_rif AS driRif,
            v.dif_rea AS difRea, v.fis_pia AS fisPia, v.updated_at AS updatedAt
       FROM votes v JOIN players p ON p.id = v.target_id
      WHERE v.voter_id = ?
      ORDER BY p.name COLLATE NOCASE`,
  )
    .bind(auth.player.id)
    .all<Record<string, unknown>>();

  const votes = (rows.results ?? []).map((row) => {
    const role = typeof row.targetRole === "string" ? row.targetRole : "";
    const valori = {
      vel_tuf: typeof row.velTuf === "number" ? row.velTuf : null,
      tir_pre: typeof row.tirPre === "number" ? row.tirPre : null,
      pass_rin: typeof row.passRin === "number" ? row.passRin : null,
      dri_rif: typeof row.driRif === "number" ? row.driRif : null,
      dif_rea: typeof row.difRea === "number" ? row.difRea : null,
      fis_pia: typeof row.fisPia === "number" ? row.fisPia : null,
    };
    const myOverall = overallForRole(role, valori);
    const myOverallUp = ceilOverallForRole(role, valori);
    return { ...row, myOverall, myOverallUp };
  });

  return json({ votes });
}

export { currentPlayer };