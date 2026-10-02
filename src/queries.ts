// PASSO 3: query di lettura e calcoli per le rotte pubbliche.
// Solo partite 'published'. Le voti singole restano sempre dentro il
// server: da fuori escono solo mediane e numero di votanti.

import type { CalcMatch, PlayerSeason, RatingSummary, VoteRow } from "./calc";
import { publishedSorted, standings, summarizeVotes, teamOutcomes, type Outcome } from "./calc";
import type { Env } from "./env";

export interface PlayerRow {
  id: string;
  name: string;
  role: string;
  flag: string | null;
  active: number;
  can_login: number;
  is_admin: number;
}

export interface SeasonRow {
  id: number;
  name: string;
  is_active: number;
}

export interface MatchCounters {
  goals: number;
  ownGoals: number;
  mvp: number;
  V: number;
  P: number;
  S: number;
}

const PLAYER_COLUMNS = "id, name, role, flag, active, can_login, is_admin";

export async function listPlayers(env: Env, opts: { loginOnly?: boolean } = {}): Promise<PlayerRow[]> {
  const where = opts.loginOnly ? "WHERE active = 1 AND can_login = 1" : "WHERE active = 1";
  const res = await env.DB.prepare(`SELECT ${PLAYER_COLUMNS} FROM players ${where} ORDER BY name COLLATE NOCASE`)
    .all<PlayerRow>();
  return res.results ?? [];
}

/** Giocatore attivo con accesso consentito, altrimenti null. */
export async function getPlayer(env: Env, id: string): Promise<PlayerRow | null> {
  if (!id) return null;
  const row = await env.DB.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = ? AND active = 1`)
    .bind(id)
    .first<PlayerRow>();
  return row ?? null;
}

/** Qualsiasi giocatore, anche non attivo: serve per le rotte di amministrazione. */
export async function getPlayerAny(env: Env, id: string): Promise<PlayerRow | null> {
  if (!id) return null;
  const row = await env.DB.prepare(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = ?`)
    .bind(id)
    .first<PlayerRow>();
  return row ?? null;
}

export async function getCredential(env: Env, playerId: string) {
  return env.DB.prepare(
    "SELECT player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at FROM credentials WHERE player_id = ?",
  )
    .bind(playerId)
    .first<{
      player_id: string;
      salt: string;
      pin_hash: string;
      pin_origin: string;
      hash_version: number;
      failed_attempts: number;
      locked_until: string | null;
      session_version: number;
      updated_at: string;
    }>();
}

export async function listSeasons(env: Env): Promise<SeasonRow[]> {
  const res = await env.DB.prepare("SELECT id, name, is_active FROM seasons ORDER BY id").all<SeasonRow>();
  return res.results ?? [];
}

/** ?season= accetta id o nome; senza parametro la stagione attiva. */
export async function resolveSeason(env: Env, raw: string | null): Promise<SeasonRow | null> {
  const seasons = await listSeasons(env);
  if (seasons.length === 0) return null;
  const value = (raw ?? "").trim();
  if (!value) {
    return seasons.find((s) => s.is_active === 1) ?? seasons[seasons.length - 1];
  }
  if (/^\d+$/.test(value)) {
    const byId = seasons.find((s) => s.id === Number(value));
    if (byId) return byId;
  }
  const lowered = value.toLowerCase();
  return seasons.find((s) => s.name.toLowerCase() === lowered) ?? null;
}

/** Partite con formazioni della stagione, per i calcoli di src/calc.ts. */
export async function loadSeasonMatches(env: Env, seasonId: number): Promise<CalcMatch[]> {
  const rows = await env.DB.prepare(
    `SELECT m.id AS id, m.date AS date, m.status AS status, mp.player_id AS player_id,
            mp.team AS team, mp.goals AS goals, mp.own_goals AS own_goals, mp.mvp AS mvp
       FROM matches m
       JOIN match_players mp ON mp.match_id = m.id
      WHERE m.season_id = ? AND m.status = 'published'
      ORDER BY m.date, m.id, mp.team, mp.player_id`,
  )
    .bind(seasonId)
    .all<{
      id: string;
      date: string;
      status: string;
      player_id: string;
      team: string;
      goals: number;
      own_goals: number;
      mvp: number;
    }>();
  const byId = new Map<string, CalcMatch>();
  for (const row of rows.results ?? []) {
    let match = byId.get(row.id);
    if (!match) {
      match = { id: row.id, date: row.date, status: row.status, entries: [] };
      byId.set(row.id, match);
    }
    match.entries.push({
      playerId: row.player_id,
      team: row.team,
      goals: row.goals,
      ownGoals: row.own_goals,
      mvp: row.mvp === 1,
    });
  }
  return [...byId.values()];
}

/** Guidinha per giocatore sulle partite pubblicate della stagione. */
export async function loadGuidinhaCounts(env: Env, seasonId: number): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(
    `SELECT guidinha_player_id AS pid, COUNT(*) AS n
       FROM matches
      WHERE season_id = ? AND status = 'published' AND guidinha_player_id IS NOT NULL
      GROUP BY guidinha_player_id`,
  )
    .bind(seasonId)
    .all<{ pid: string; n: number }>();
  const out = new Map<string, number>();
  for (const row of rows.results ?? []) out.set(row.pid, row.n);
  return out;
}

/** Tutti i voti raggruppati per target: resta nel server. */
export async function loadVotesByTarget(env: Env): Promise<Map<string, VoteRow[]>> {
  const rows = await env.DB.prepare(
    "SELECT voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia FROM votes",
  ).all<VoteRow & { voter_id: string; target_id: string }>();
  const out = new Map<string, VoteRow[]>();
  for (const row of rows.results ?? []) {
    const list = out.get(row.target_id) ?? [];
    list.push({
      vel_tuf: row.vel_tuf,
      tir_pre: row.tir_pre,
      pass_rin: row.pass_rin,
      dri_rif: row.dri_rif,
      dif_rea: row.dif_rea,
      fis_pia: row.fis_pia,
    });
    out.set(row.target_id, list);
  }
  return out;
}

export async function ratingOf(env: Env, role: string, targetId: string): Promise<RatingSummary> {
  const rows = await env.DB.prepare(
    "SELECT vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia FROM votes WHERE target_id = ?",
  )
    .bind(targetId)
    .all<VoteRow>();
  return summarizeVotes(role, rows.results ?? []);
}

/** Gol, autogol, MVP e V/P/S di ogni giocatore sulle partite pubblicate. */
export function seasonCounters(matches: CalcMatch[], playerIds: string[]): Map<string, MatchCounters> {
  const out = new Map<string, MatchCounters>();
  for (const id of playerIds) {
    out.set(id, { goals: 0, ownGoals: 0, mvp: 0, V: 0, P: 0, S: 0 });
  }
  for (const match of publishedSorted(matches)) {
    const outcomes: Map<string, Outcome> = teamOutcomes(match);
    for (const entry of match.entries) {
      const c = out.get(entry.playerId);
      if (!c) continue;
      c.goals += entry.goals;
      c.ownGoals += entry.ownGoals;
      if (entry.mvp) c.mvp += 1;
      const outcome = outcomes.get(entry.team);
      if (outcome === "V") c.V += 1;
      else if (outcome === "P") c.P += 1;
      else if (outcome === "S") c.S += 1;
    }
  }
  return out;
}

export interface RankingRow extends PlayerSeason {
  name: string;
  role: string;
  flag: string | null;
  guidinha: number;
  V: number;
  P: number;
  S: number;
  goals: number;
  ownGoals: number;
  mvp: number;
}

/** Classifica nell'ordine di calc.standings, arricchita di nomi e contatori. */
export async function buildRanking(env: Env, seasonId: number): Promise<RankingRow[]> {
  const players = await listPlayers(env);
  const matches = await loadSeasonMatches(env, seasonId);
  const guidinha = await loadGuidinhaCounts(env, seasonId);
  const ids = players.map((p) => p.id);
  const table = standings(matches, ids);
  const counters = seasonCounters(matches, ids);
  const byId = new Map(players.map((p) => [p.id, p]));
  return table.map((row) => {
    const player = byId.get(row.playerId)!;
    const c = counters.get(row.playerId)!;
    return {
      ...row,
      name: player.name,
      role: player.role,
      flag: player.flag,
      guidinha: guidinha.get(row.playerId) ?? 0,
      V: c.V,
      P: c.P,
      S: c.S,
      goals: c.goals,
      ownGoals: c.ownGoals,
      mvp: c.mvp,
    };
  });
}