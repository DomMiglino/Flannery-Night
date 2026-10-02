// PASSO 3: voti. Un solo PUT per coppia votante/target, con upsert
// nella stessa istruzione: anche due richieste insieme lasciano una riga.
// Da fuori escono solo mediane e numero di votanti.

import type { Env } from "../env";
import { fail, json, MSG, ratingValue, readJsonObject } from "../http";
import { getPlayer, ratingOf } from "../queries";
import type { AuthedPlayer } from "../session";

const FIELDS = ["velTuf", "tirPre", "passRin", "driRif", "difRea", "fisPia"] as const;

export async function putVote(env: Env, auth: AuthedPlayer, targetId: string, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const values: number[] = [];
  for (const field of FIELDS) {
    const v = ratingValue(body[field]);
    if (v === null) return fail(400, MSG.badRequest);
    values.push(v);
  }
  if (auth.player.can_login !== 1) return fail(403, MSG.forbidden);
  if (!targetId || targetId === auth.player.id) return fail(400, MSG.badRequest);

  const target = await getPlayer(env, targetId);
  if (!target) return fail(404, MSG.notFound);

  await env.DB.prepare(
    `INSERT INTO votes (voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(voter_id, target_id) DO UPDATE SET
       vel_tuf = excluded.vel_tuf, tir_pre = excluded.tir_pre, pass_rin = excluded.pass_rin,
       dri_rif = excluded.dri_rif, dif_rea = excluded.dif_rea, fis_pia = excluded.fis_pia,
       updated_at = excluded.updated_at`,
  )
    .bind(auth.player.id, target.id, ...values)
    .run();

  const summary = await ratingOf(env, target.role, target.id);
  return json({
    targetId: target.id,
    voters: summary.voters,
    velTuf: summary.vel_tuf,
    tirPre: summary.tir_pre,
    passRin: summary.pass_rin,
    driRif: summary.dri_rif,
    difRea: summary.dif_rea,
    fisPia: summary.fis_pia,
    overall: summary.overall,
  });
}