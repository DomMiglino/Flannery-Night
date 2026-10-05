// PASSO 3: rotte pubbliche di lettura. Nessun accesso richiesto.
// Escono solo mediane e conteggi: mai un voto singolo, mai salt o hash.

import { mediaPerPartita, playerSeason, publishedSorted, puntiStagione, summarizeVotes, teamOutcomes, teamScores, type CalcMatch, type RatingSummary } from "../calc";
import type { Env } from "../env";
import { fail, json, MSG } from "../http";
import {
  buildRanking,
  listPlayers,
  loadGuidinhaCounts,
  loadSeasonMatches,
  loadVotesByTarget,
  resolveSeason,
  seasonCounters,
  type PlayerRow,
} from "../queries";

function medianFields(summary: RatingSummary) {
  return {
    velTuf: summary.vel_tuf,
    tirPre: summary.tir_pre,
    passRin: summary.pass_rin,
    driRif: summary.dri_rif,
    difRea: summary.dif_rea,
    fisPia: summary.fis_pia,
    overall: summary.overall,
    overallUp: summary.overallUp,
  };
}

export async function seasons(env: Env): Promise<Response> {
  const rows = await resolveSeasonAll(env);
  return json({
    seasons: rows.map((s) => ({ id: s.id, name: s.name, isActive: s.is_active === 1 })),
    activeId: rows.find((s) => s.is_active === 1)?.id ?? null,
  });
}

async function resolveSeasonAll(env: Env) {
  const res = await env.DB.prepare("SELECT id, name, is_active FROM seasons ORDER BY id").all<{
    id: number;
    name: string;
    is_active: number;
  }>();
  return res.results ?? [];
}

export async function ranking(env: Env, seasonParam: string | null): Promise<Response> {
  const season = await resolveSeason(env, seasonParam);
  if (!season) return fail(404, MSG.notFound);
  const rows = await buildRanking(env, season.id);
  return json({
    season: { id: season.id, name: season.name },
    rows: rows.map((r) => ({
      id: r.playerId,
      name: r.name,
      role: r.role,
      flag: r.flag,
      played: r.played,
      V: r.V,
      P: r.P,
      S: r.S,
      goals: r.goals,
      ownGoals: r.ownGoals,
      mvp: r.mvp,
      guidinha: r.guidinha,
      powerScore: r.powerScore,
      mvpWeight: r.mvpWeightSum,
      overallUp: r.overallUp,
      formaArrow: r.formaArrow,
      formaScore: r.formaScore,
      rendimento: r.rendimento,
      points: puntiStagione(r.V, r.P),
      avgPoints: mediaPerPartita(r.points, r.played),
      avgGoals: mediaPerPartita(r.goals, r.played),
    })),
  });
}

export async function players(env: Env): Promise<Response> {
  const all = await listPlayers(env);
  const votesByTarget = await loadVotesByTarget(env);
  const out = all.map((p) => {
    const summary = summarizeVotes(p.role, votesByTarget.get(p.id) ?? []);
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      flag: p.flag,
      votes: summary.voters,
      ...medianFields(summary),
    };
  });
  out.sort((a, b) => {
    const av = a.overall ?? -1;
    const bv = b.overall ?? -1;
    if (bv !== av) return bv - av;
    return a.name.localeCompare(b.name, "it");
  });
  return json({ players: out });
}

export async function playerDetail(env: Env, id: string, seasonParam: string | null): Promise<Response> {
  const season = await resolveSeason(env, seasonParam);
  if (!season) return fail(404, MSG.notFound);
  const player = await listPlayers(env).then((all) => all.find((p) => p.id === id) ?? null);
  if (!player) return fail(404, MSG.notFound);

  const votesByTarget = await loadVotesByTarget(env);
  const summary = summarizeVotes(player.role, votesByTarget.get(player.id) ?? []);

  const matches = await loadSeasonMatches(env, season.id);
  const stats = playerSeason(matches, player.id);
  const counters = seasonCounters(matches, [player.id]).get(player.id)!;
  const guidinha = (await loadGuidinhaCounts(env, season.id)).get(player.id) ?? 0;
  const last5 = latestMatches(matches, player.id, 5);

  return json({
    id: player.id,
    name: player.name,
    role: player.role,
    flag: player.flag,
    votes: summary.voters,
    ...medianFields(summary),
    season: { id: season.id, name: season.name },
    stats: {
      played: stats.played,
      points: stats.points,
      powerScore: stats.powerScore,
      formaArrow: stats.formaArrow,
      formaScore: stats.formaScore,
      rendimento: stats.rendimento,
      goals: counters.goals,
      ownGoals: counters.ownGoals,
      mvp: counters.mvp,
      guidinha,
      V: counters.V,
      P: counters.P,
      S: counters.S,
    },
    last5,
  });
}

function latestMatches(matches: CalcMatch[], playerId: string, limit: number) {
  const ordered = publishedSorted(matches).reverse();
  const out: Array<Record<string, unknown>> = [];
  for (const match of ordered) {
    const entry = match.entries.find((e) => e.playerId === playerId);
    if (!entry) continue;
    const scores = teamScores(match);
    const outcomes = teamOutcomes(match);
    const opponent = match.entries.find((e) => e.team !== entry.team)?.team ?? "";
    out.push({
      id: match.id,
      date: match.date,
      team: entry.team,
      opponent,
      outcome: outcomes.get(entry.team) ?? "P",
      label: (outcomes.get(entry.team) ?? "P") + (entry.mvp ? "*" : ""),
      score: `${scores.get(entry.team) ?? 0}-${scores.get(opponent) ?? 0}`,
      goals: entry.goals,
      ownGoals: entry.ownGoals,
      mvp: entry.mvp,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function matches(env: Env, seasonParam: string | null): Promise<Response> {
  const season = await resolveSeason(env, seasonParam);
  if (!season) return fail(404, MSG.notFound);
  const all: PlayerRow[] = await listPlayers(env);
  const nameById = new Map(all.map((p) => [p.id, p.name]));
  const guidinhaRows = await env.DB.prepare(
    `SELECT id, date, guidinha_player_id, guidinha_text FROM matches
      WHERE season_id = ? AND status = 'published' ORDER BY date DESC, id DESC`,
  )
    .bind(season.id)
    .all<{ id: string; date: string; guidinha_player_id: string | null; guidinha_text: string | null }>();

  const ids = (guidinhaRows.results ?? []).map((m) => m.id);
  const entriesByMatch = new Map<string, CalcMatch["entries"]>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT match_id, player_id, team, goals, own_goals, mvp FROM match_players
        WHERE match_id IN (${placeholders}) ORDER BY team, player_id`,
    )
      .bind(...ids)
      .all<{ match_id: string; player_id: string; team: string; goals: number; own_goals: number; mvp: number }>();
    for (const row of rows.results ?? []) {
      const list = entriesByMatch.get(row.match_id) ?? [];
      list.push({ playerId: row.player_id, team: row.team, goals: row.goals, ownGoals: row.own_goals, mvp: row.mvp === 1 });
      entriesByMatch.set(row.match_id, list);
    }
  }

  const out = (guidinhaRows.results ?? []).map((m) => {
    const entries = entriesByMatch.get(m.id) ?? [];
    const calcMatch: CalcMatch = { id: m.id, date: m.date, status: "published", entries };
    const scores = teamScores(calcMatch);
    const outcomes = teamOutcomes(calcMatch);
    const teams = [...new Set(entries.map((e) => e.team))];
    const teamRows = teams.map((team) => ({
      team,
      score: scores.get(team) ?? 0,
      outcome: outcomes.get(team) ?? "P",
      players: entries
        .filter((e) => e.team === team)
        .map((e) => ({
          id: e.playerId,
          name: nameById.get(e.playerId) ?? e.playerId,
          goals: e.goals,
          ownGoals: e.ownGoals,
          mvp: e.mvp,
        })),
    }));
    return {
      id: m.id,
      date: m.date,
      guidinha: {
        playerId: m.guidinha_player_id,
        playerName: m.guidinha_player_id ? (nameById.get(m.guidinha_player_id) ?? null) : null,
        text: m.guidinha_text ?? "",
      },
      teams: teamRows,
      result: teamRows.map((t) => `${t.team} ${t.score}`).join(" - "),
    };
  });

  return json({ season: { id: season.id, name: season.name }, matches: out });
}