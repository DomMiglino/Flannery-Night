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

export async function auditTrail(env: Env, before?: number | null): Promise<Response> {
  const limit = 50;
  const cursor = Number.isFinite(before) && Number(before) > 0 ? Number(before) : null;
  const rows = await env.DB.prepare(
    `SELECT a.id AS id, a.at AS at, a.actor_player_id AS actorPlayerId, COALESCE(p.name, 'Giocatore eliminato') AS actorName,
            a.action AS action, a.detail AS detail
       FROM audit_log a
       LEFT JOIN players p ON p.id = a.actor_player_id
      WHERE (? IS NULL OR a.id < ?)
      ORDER BY a.id DESC
      LIMIT ?`,
  )
    .bind(cursor, cursor, limit + 1)
    .all<Record<string, unknown>>();
  const results = rows.results ?? [];
  const items = results.slice(0, limit).map((row) => ({
    id: Number(row.id ?? 0),
    at: String(row.at ?? ""),
    actor: String(row.actorName ?? "Giocatore eliminato"),
    action: String(row.action ?? ""),
    detail: String(row.detail ?? ""),
  }));
  return json({
    events: items,
    hasMore: results.length > limit,
    before: items.length > 0 ? items[items.length - 1].id : null,
  });
}

export async function createSeason(env: Env, auth: AuthedPlayer, input: string): Promise<Response> {
  const name = input.trim();
  if (name.length < 1 || name.length > 20) {
    return fail(400, "Il nome della stagione deve avere da 1 a 20 caratteri.");
  }

  const vecchia = await env.DB.prepare(
    "SELECT id, name FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
  ).first<{ id: number; name: string }>();

  const batch = [
    env.DB.prepare(`
      INSERT INTO seasons (name, is_active)
      SELECT ?, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM seasons WHERE lower(name) = lower(?)
      )
    `).bind(name, name),
    env.DB.prepare(`
      UPDATE seasons
         SET is_active = 0
       WHERE is_active = 1
         AND id != (
           SELECT id
             FROM seasons
            WHERE lower(name) = lower(?)
            ORDER BY id DESC
            LIMIT 1
         )
    `).bind(name),
    env.DB.prepare(`
      UPDATE seasons
         SET is_active = 1
       WHERE lower(name) = lower(?)
         AND id = (
           SELECT id
             FROM seasons
            WHERE lower(name) = lower(?)
            ORDER BY id DESC
            LIMIT 1
         )
         AND is_active = 0
    `).bind(name, name),
  ];

  const [insertRes] = await env.DB.batch(batch);
  const inserted = Number((insertRes as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0);
  if (inserted === 0) {
    return fail(409, `La stagione "${name}" esiste già.`);
  }

  const nuova = await env.DB.prepare(
    "SELECT id, name, is_active FROM seasons WHERE lower(name) = lower(?) ORDER BY id DESC LIMIT 1",
  )
    .bind(name)
    .first<{ id: number; name: string; is_active: number }>();

  if (!nuova) return fail(500, "Non riesco a creare la nuova stagione.");

  const attive = await env.DB.prepare("SELECT id FROM seasons WHERE is_active = 1 ORDER BY id DESC").all<{ id: number }>();
  const attiveIds = (attive.results ?? []).map((row) => row.id);
  if (attiveIds.length !== 1 || attiveIds[0] !== nuova.id) {
    await env.DB.batch([
      env.DB.prepare("UPDATE seasons SET is_active = 0 WHERE is_active = 1 AND id != ?").bind(nuova.id),
      env.DB.prepare("UPDATE seasons SET is_active = 1 WHERE id = ? AND is_active = 0").bind(nuova.id),
    ]);
  }

  const finale = await env.DB.prepare("SELECT id, name, is_active FROM seasons WHERE id = ?").bind(nuova.id).first<{
    id: number;
    name: string;
    is_active: number;
  }>();
  if (!finale || finale.is_active !== 1) {
    return fail(500, "Non riesco a creare la nuova stagione.");
  }

  const contaPartite = vecchia
    ? await env.DB.prepare("SELECT COUNT(*) AS n FROM matches WHERE season_id = ?").bind(vecchia.id).first<{ n: number }>()
    : { n: 0 };
  const detail = vecchia
    ? `chiusa=${vecchia.name}; nuova=${finale.name}; partite=${contaPartite?.n ?? 0}`
    : `nuova=${finale.name}; partite=0`;
  await audit(env, auth.player.id, "season_create", detail);

  return json({
    ok: true,
    season: { id: finale.id, name: finale.name, isActive: true },
    previousSeason: vecchia ? { id: vecchia.id, name: vecchia.name } : null,
  });
}

export async function exportData(env: Env, auth: AuthedPlayer): Promise<Response> {
  const [seasons, players, matches, matchPlayers, votes] = await Promise.all([
    env.DB.prepare("SELECT * FROM seasons ORDER BY id").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT id, name, role, role2, flag, active, can_login, is_admin, created_at FROM players ORDER BY name COLLATE NOCASE").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT * FROM matches ORDER BY date DESC, id DESC").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT * FROM match_players ORDER BY match_id, player_id").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia, updated_at FROM votes ORDER BY voter_id, target_id").all<Record<string, unknown>>(),
  ]);
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((part) => part.type === type)?.value ?? "";
  const fileName = `flannery-night-${datePart("year")}-${datePart("month")}-${datePart("day")}.json`;
  const payload = {
    exportedAt: now.toISOString(),
    exportedBy: auth.player.id,
    seasons: seasons.results ?? [],
    players: players.results ?? [],
    matches: matches.results ?? [],
    match_players: matchPlayers.results ?? [],
    votes: votes.results ?? [],
  };
  const counts = {
    seasons: seasons.results?.length ?? 0,
    players: players.results?.length ?? 0,
    matches: matches.results?.length ?? 0,
    match_players: matchPlayers.results?.length ?? 0,
    votes: votes.results?.length ?? 0,
  };
  await audit(env, auth.player.id, "export_data", `seasons=${counts.seasons}; players=${counts.players}; matches=${counts.matches}; match_players=${counts.match_players}; votes=${counts.votes}`);
  return json(payload, 200, {
    "content-disposition": `attachment; filename="${fileName}"`,
    "cache-control": "no-store",
  });
}