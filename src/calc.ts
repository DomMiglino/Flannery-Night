// Flannery Night v2 — PASSO 1: calcoli puri per classifica e voti.
// Solo partite 'published' di una stagione. Nessun accesso a DB o rete.
// Le formule di mediana e overall riproducono esattamente quelle del sito
// precedente (funzioni round1_, median_, overall_, getMedians_).

export type Role = "P" | "DC" | "DL" | "CC" | "CL" | "PC";
export type Outcome = "V" | "P" | "S";
export type Arrow = "↑" | "↗" | "→" | "↘" | "↓";

export interface CalcEntry {
  playerId: string;
  team: string;
  goals: number;
  ownGoals: number;
  mvp: boolean;
}

export interface CalcMatch {
  id: string;
  date: string;
  status: string;
  entries: CalcEntry[];
}

export interface VoteRow {
  vel_tuf: number;
  tir_pre: number;
  pass_rin: number;
  dri_rif: number;
  dif_rea: number;
  fis_pia: number;
}

export interface RatingSummary {
  voters: number;
  vel_tuf: number | null;
  tir_pre: number | null;
  pass_rin: number | null;
  dri_rif: number | null;
  dif_rea: number | null;
  fis_pia: number | null;
  overall: number | null;
  /** Overall per eccesso: il piu' piccolo intero sopra la somma pesata esatta. */
  overallUp: number | null;
}

export interface RecentGame {
  outcome: Outcome;
  mvpStar: boolean;
  label: string;
}

export interface PlayerSeason {
  playerId: string;
  played: number;
  points: number;
  mvpWeightSum: number;
  avgPoints: number;
  powerScore: number;
  last5: RecentGame[];
  rendimento: string[];
  formaScore: number;
  formaArrow: Arrow;
}

/** Come round1_ del sito precedente. */
export function round1(n: number): number {
  return Math.round(Number(n) * 10) / 10;
}

/**
 * Come median_ del sito precedente: ordina in modo numerico; con conteggio dispari
 * restituisce il centrale, con conteggio pari la media dei due centrali
 * arrotondata con round1. Ritorna null con zero valori.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const b = [...values].sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  if (b.length % 2 === 1) return b[m];
  return round1((b[m - 1] + b[m]) / 2);
}

const ATTR_KEYS = ["vel_tuf", "tir_pre", "pass_rin", "dri_rif", "dif_rea", "fis_pia"] as const;

/**
 * Come overall_ del sito precedente + round1_. Pesi per ruolo nell'ordine
 * VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA.
 * Ruolo ignoto: media semplice dei sei valori. Ritorna null se manca un valore.
 */
export function overallForRole(
  role: string,
  a: {
    vel_tuf: number | null;
    tir_pre: number | null;
    pass_rin: number | null;
    dri_rif: number | null;
    dif_rea: number | null;
    fis_pia: number | null;
  },
): number | null {
  const values = [a.vel_tuf, a.tir_pre, a.pass_rin, a.dri_rif, a.dif_rea, a.fis_pia];
  if (values.some((v) => v == null)) return null;
  const weights = ROLE_WEIGHTS[role];
  if (!weights) return round1((values as number[]).reduce((a2, b) => a2 + b, 0) / 6);
  let total = 0;
  for (let i = 0; i < 6; i++) total += weights[i] * (values[i] as number);
  return round1(total);
}

/**
 * Pesi per ruolo, nell'ordine VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF,
 * DIF/REA, FIS/PIA. Esposti perché l'interfaccia calcola il "mio overall"
 * con gli stessi pesi: un test confronta questa tabella con public/js/ratings.js.
 */
export const ROLE_WEIGHTS: Record<string, number[]> = {
  P: [0.25, 0.15, 0.1, 0.25, 0.1, 0.15],
  DC: [0.15, 0, 0.1, 0.05, 0.4, 0.3],
  DL: [0.2, 0, 0.15, 0.05, 0.3, 0.3],
  CC: [0.15, 0.15, 0.3, 0.15, 0.15, 0.1],
  CL: [0.3, 0.1, 0.2, 0.25, 0.05, 0.1],
  PC: [0.2, 0.4, 0.05, 0.15, 0, 0.2],
};

/**
 * Overall per eccesso: il piu' piccolo intero maggiore o uguale alla
 * somma pesata esatta (85,01 -> 86; 86,00 -> 86). Niente virgola mobile:
 * pesi in centesimi e valori in millesimi, tutto in aritmetica intera.
 * Ritorna null se manca un valore.
 */
export function ceilOverallForRole(
  role: string,
  a: {
    vel_tuf: number | null;
    tir_pre: number | null;
    pass_rin: number | null;
    dri_rif: number | null;
    dif_rea: number | null;
    fis_pia: number | null;
  },
): number | null {
  const values = [a.vel_tuf, a.tir_pre, a.pass_rin, a.dri_rif, a.dif_rea, a.fis_pia];
  if (values.some((v) => v == null)) return null;
  const milli = (values as number[]).map((v) => Math.round(v * 1000));
  const weights = ROLE_WEIGHTS[role];
  if (!weights) {
    const sum = milli.reduce((x, y) => x + y, 0);
    return Math.floor((sum + 5999) / 6000);
  }
  let total = 0;
  for (let i = 0; i < 6; i++) total += Math.round(weights[i] * 100) * milli[i];
  return Math.floor((total + 99999) / 100000);
}

/** Punti stagionali: 3 per vinta, 1 per pareggiata. */
export function puntiStagione(vinte: number, pareggiate: number): number {
  return 3 * vinte + pareggiate;
}

/**
 * Media per partita a un decimale half-up (come round1_).
 * Null con zero giocate: in classifica quelle righe non si mostrano.
 */
export function mediaPerPartita(totale: number, giocate: number): number | null {
  if (!Number.isFinite(totale) || !Number.isFinite(giocate) || giocate <= 0) return null;
  return round1(totale / giocate);
}

/** Come getMedians_ del sito precedente per un singolo giocatore. */
export function summarizeVotes(role: string, rows: VoteRow[]): RatingSummary {
  if (rows.length === 0) {
    return {
      voters: 0,
      vel_tuf: null,
      tir_pre: null,
      pass_rin: null,
      dri_rif: null,
      dif_rea: null,
      fis_pia: null,
      overall: null,
      overallUp: null,
    };
  }
  const med = {
    vel_tuf: median(rows.map((r) => r.vel_tuf)),
    tir_pre: median(rows.map((r) => r.tir_pre)),
    pass_rin: median(rows.map((r) => r.pass_rin)),
    dri_rif: median(rows.map((r) => r.dri_rif)),
    dif_rea: median(rows.map((r) => r.dif_rea)),
    fis_pia: median(rows.map((r) => r.fis_pia)),
  };
  return { voters: rows.length, ...med, overall: overallForRole(role, med), overallUp: ceilOverallForRole(role, med) };
}

function teamsOf(match: CalcMatch): string[] {
  const seen: string[] = [];
  for (const e of match.entries) {
    if (!seen.includes(e.team)) seen.push(e.team);
  }
  return seen;
}

/**
 * Punteggio di ogni squadra: gol segnati dalla squadra
 * piu' autogol delle avversarie.
 */
export function teamScores(match: CalcMatch): Map<string, number> {
  const goalsByTeam = new Map<string, number>();
  const ownByTeam = new Map<string, number>();
  for (const e of match.entries) {
    goalsByTeam.set(e.team, (goalsByTeam.get(e.team) ?? 0) + e.goals);
    ownByTeam.set(e.team, (ownByTeam.get(e.team) ?? 0) + e.ownGoals);
  }
  const out = new Map<string, number>();
  for (const t of teamsOf(match)) {
    let oppOwn = 0;
    for (const [other, v] of ownByTeam) {
      if (other !== t) oppOwn += v;
    }
    out.set(t, (goalsByTeam.get(t) ?? 0) + oppOwn);
  }
  return out;
}

/** Esito per squadra: V vince, S perde, P pareggio. Punti 3/1/0. */
export function teamOutcomes(match: CalcMatch): Map<string, Outcome> {
  const scores = teamScores(match);
  const teams = [...scores.keys()];
  const out = new Map<string, Outcome>();
  if (teams.length === 0) return out;
  const vals = teams.map((t) => scores.get(t) ?? 0);
  const top = Math.max(...vals);
  const low = Math.min(...vals);
  if (top === low) {
    for (const t of teams) out.set(t, "P");
    return out;
  }
  for (const t of teams) out.set(t, (scores.get(t) ?? 0) === top ? "V" : "S");
  return out;
}

export function pointsFor(outcome: Outcome): number {
  return outcome === "V" ? 3 : outcome === "P" ? 1 : 0;
}

/**
 * Peso MVP: in ogni squadra ogni MVP vale 1/n (n = numero di MVP di quella
 * squadra nella partita); chi non e' MVP vale 0.
 */
export function mvpWeights(match: CalcMatch): Map<string, number> {
  const countByTeam = new Map<string, number>();
  for (const e of match.entries) {
    if (e.mvp) countByTeam.set(e.team, (countByTeam.get(e.team) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const e of match.entries) {
    if (!e.mvp) {
      out.set(e.playerId, 0);
      continue;
    }
    const n = countByTeam.get(e.team) ?? 1;
    out.set(e.playerId, n > 0 ? 1 / n : 0);
  }
  return out;
}

/** Solo partite 'published', in ordine cronologico (a parita' di data, per id). */
export function publishedSorted(matches: CalcMatch[]): CalcMatch[] {
  return matches
    .filter((m) => m.status === "published")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function outcomeOf(match: CalcMatch, playerId: string): Outcome | null {
  const entry = match.entries.find((e) => e.playerId === playerId);
  if (!entry) return null;
  return teamOutcomes(match).get(entry.team) ?? null;
}

function weightOf(match: CalcMatch, playerId: string, cache?: Map<string, number>): number {
  if (cache) return cache.get(playerId) ?? 0;
  return mvpWeights(match).get(playerId) ?? 0;
}

/**
 * Statistiche stagionali di un giocatore sulle partite 'published'.
 * Rendimento: ultime 5 in ordine cronologico, "*" dove il peso MVP e' > 0.
 * Forma: media pesata dei punti (V3 P1 S0) + media pesata del flag MVP,
 * con pesi per posizione dall'ultima: ultima 3, due precedenti 2, altre 1.
 */
export function playerSeason(matches: CalcMatch[], playerId: string): PlayerSeason {
  const ordered = publishedSorted(matches);
  let played = 0;
  let points = 0;
  let mvpWeightSum = 0;
  const timeline: Array<{ outcome: Outcome; w: number }> = [];

  for (const m of ordered) {
    const o = outcomeOf(m, playerId);
    if (o == null) continue;
    const w = weightOf(m, playerId);
    played += 1;
    points += pointsFor(o);
    mvpWeightSum += w;
    timeline.push({ outcome: o, w });
  }

  const avgPoints = played > 0 ? points / played : 0;
  const capped = Math.min(20, Math.max(0, Math.max(avgPoints, 1) * mvpWeightSum));
  const powerScore = round1(capped + points);

  const tail = timeline.slice(-5);
  const last5: RecentGame[] = tail.map((g) => ({
    outcome: g.outcome,
    mvpStar: g.w > 0,
    label: g.outcome + (g.w > 0 ? "*" : ""),
  }));

  let formaScore = 0;
  if (tail.length > 0) {
    const k = tail.length - 1;
    let wSum = 0;
    let ptsSum = 0;
    let mvpSum = 0;
    for (let i = 0; i < tail.length; i++) {
      const wPos = i === k ? 3 : i >= k - 2 ? 2 : 1;
      wSum += wPos;
      ptsSum += wPos * pointsFor(tail[i].outcome);
      mvpSum += wPos * (tail[i].w > 0 ? 1 : 0);
    }
    formaScore = round1(ptsSum / wSum + mvpSum / wSum);
  }

  const formaArrow: Arrow =
    formaScore >= 2.4 ? "↑" : formaScore >= 1.7 ? "↗" : formaScore >= 1.0 ? "→" : formaScore >= 0.3 ? "↘" : "↓";

  return {
    playerId,
    played,
    points,
    mvpWeightSum,
    avgPoints,
    powerScore,
    last5,
    rendimento: last5.map((g) => g.label),
    formaScore,
    formaArrow,
  };
}

/**
 * Classifica: Power Score decrescente, poi somma pesi MVP decrescente.
 * A parita' ulteriore l'ordine resta stabile per id.
 */
export function standings(matches: CalcMatch[], playerIds: string[]): PlayerSeason[] {
  const rows = playerIds.map((id) => playerSeason(matches, id));
  return rows.sort((a, b) => {
    if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
    if (b.mvpWeightSum !== a.mvpWeightSum) return b.mvpWeightSum - a.mvpWeightSum;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
}

export const __ATTR_KEYS = ATTR_KEYS;
