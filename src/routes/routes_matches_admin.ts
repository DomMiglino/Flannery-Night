// Gestione delle partite dentro la pagina Partite.
// Solo partite 'published', sempre nella stagione attiva per le nuove.
// Solo partite 'published', sempre nella stagione attiva per le nuove.
// Ogni scrittura avviene in un unico batch D1 (o tutto o niente) e
// finisce nel registro, senza PIN né hash nei dettagli.
// Limiti dichiarati: gol e autogol interi 0..99; testo Guidinha fino a
// 2000 caratteri; dettaglio del registro compattato a 4000 caratteri.

import { teamOutcomes, teamScores, type CalcEntry } from "../calc";
import type { Env } from "../env";
import { fail, json, MSG, readJsonObject } from "../http";
import { audit, type AuditAction } from "../audit";
import { resolveSeason } from "../queries";

const FORMATI = [5, 6, 8];
const MAX_GOAL = 99;
const MAX_Testo = 2000;
const MAX_DETTAGLIO = 4000;

export interface RigaGiocatore {
  playerId: string;
  goals: number;
  ownGoals: number;
  mvp: boolean;
}

export interface IngressoPartita {
  date: string;
  format: number;
  teamA: RigaGiocatore[];
  teamB: RigaGiocatore[];
  guidinha: { playerId: string; text: string } | null;
}

interface GiocatoreMinimo {
  id: string;
  name: string;
}

/** Id nuovi nello stile di quelli esistenti (minuscoli con trattino). */
export function nuovoIdPartita(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let coda = "";
  for (const b of buf) coda += b.toString(16).padStart(2, "0");
  return `m-${coda}`;
}

export function dataValida(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [a, m, g] = value.split("-").map(Number);
  if (m < 1 || m > 12 || g < 1 || g > 31) return false;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

function interoGol(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > MAX_GOAL) return null;
  return value;
}

function leggiRiga(value: unknown): RigaGiocatore | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const playerId = typeof r.playerId === "string" ? r.playerId.trim() : "";
  const goals = interoGol(r.goals);
  const ownGoals = interoGol(r.ownGoals);
  if (!playerId || goals === null || ownGoals === null) return null;
  return { playerId, goals, ownGoals, mvp: r.mvp === true };
}

/** Legge il corpo di creazione/modifica; errori in italiano, uno per problema. */
export function leggiIngresso(
  body: Record<string, unknown>,
  opts: { testoVuotoAmmesso: boolean },
): { ingresso: IngressoPartita | null; errori: string[] } {
  const errori: string[] = [];

  const date = body.date;
  if (!dataValida(date)) errori.push("La data della partita manca o non è valida (usa il formato AAAA-MM-GG).");

  const format = body.format;
  if (typeof format !== "number" || !FORMATI.includes(format)) {
    errori.push("Il formato deve essere 5, 6 o 8 (giocatori per squadra).");
  }

  const rawA = Array.isArray(body.teamA) ? body.teamA : null;
  const rawB = Array.isArray(body.teamB) ? body.teamB : null;
  let teamA: RigaGiocatore[] = [];
  let teamB: RigaGiocatore[] = [];
  if (!rawA || !rawB) {
    errori.push("Servono le due squadre (teamA e teamB) con i giocatori.");
  } else {
    const n = typeof format === "number" ? format : 0;
    teamA = rawA.map(leggiRiga).filter((r): r is RigaGiocatore => r !== null);
    teamB = rawB.map(leggiRiga).filter((r): r is RigaGiocatore => r !== null);
    if (teamA.length !== rawA.length || teamB.length !== rawB.length) {
      errori.push(`Gol e autogol devono essere numeri interi da 0 a ${MAX_GOAL}, con id giocatore valido.`);
    }
    if (FORMATI.includes(n)) {
      if (teamA.length !== n) errori.push(`La squadra A deve avere ${n} giocatori (formato ${n}v${n}).`);
      if (teamB.length !== n) errori.push(`La squadra B deve avere ${n} giocatori (formato ${n}v${n}).`);
    }
  }

  const visti = new Set<string>();
  let duplicato = false;
  for (const r of [...teamA, ...teamB]) {
    if (visti.has(r.playerId)) duplicato = true;
    visti.add(r.playerId);
  }
  if (duplicato) errori.push("Ogni giocatore può comparire una sola volta (non in entrambe le squadre).");

  let guidinha: IngressoPartita["guidinha"] = null;
  const rawG = body.guidinha;
  if (rawG !== undefined && rawG !== null) {
    if (typeof rawG !== "object" || Array.isArray(rawG)) {
      errori.push("La Guidinha richiede giocatore e testo.");
    } else {
      const g = rawG as Record<string, unknown>;
      const playerId = typeof g.playerId === "string" ? g.playerId.trim() : "";
      const text = typeof g.text === "string" ? g.text : "";
      if (!playerId) {
        errori.push("La Guidinha richiede giocatore e testo.");
      } else if (text.length > MAX_Testo) {
        errori.push(`Il testo della Guidinha è troppo lungo (massimo ${MAX_Testo} caratteri).`);
      } else if (text.trim() === "") {
        if (!opts.testoVuotoAmmesso) errori.push("Il testo della Guidinha non può essere vuoto.");
        else guidinha = { playerId, text: "" };
      } else {
        guidinha = { playerId, text };
      }
      if (guidinha && !visti.has(playerId)) {
        errori.push("La Guidinha deve aver giocato la partita.");
      }
    }
  }

  if (errori.length > 0) return { ingresso: null, errori };
  return {
    ingresso: {
      date: date as string,
      format: format as number,
      teamA,
      teamB,
      guidinha,
    },
    errori: [],
  };
}

async function mappaGiocatori(env: Env): Promise<Map<string, GiocatoreMinimo>> {
  const res = await env.DB.prepare("SELECT id, name FROM players").all<{ id: string; name: string }>();
  const out = new Map<string, GiocatoreMinimo>();
  for (const r of res.results ?? []) out.set(r.id, { id: r.id, name: r.name });
  return out;
}

function vociCalc(ingresso: IngressoPartita): CalcEntry[] {
  const voci: CalcEntry[] = [];
  for (const r of ingresso.teamA) voci.push({ playerId: r.playerId, team: "A", goals: r.goals, ownGoals: r.ownGoals, mvp: r.mvp });
  for (const r of ingresso.teamB) voci.push({ playerId: r.playerId, team: "B", goals: r.goals, ownGoals: r.ownGoals, mvp: r.mvp });
  return voci;
}

/** Risultato ufficiale calcolato sul server (stessa formula del sito). */
export function risultatoDi(ingresso: IngressoPartita): { puntiA: number; puntiB: number; testo: string } {
  const punteggi = teamScores({ id: "", date: ingresso.date, status: "published", entries: vociCalc(ingresso) });
  const a = punteggi.get("A") ?? 0;
  const b = punteggi.get("B") ?? 0;
  return { puntiA: a, puntiB: b, testo: `A ${a} - B ${b}` };
}

function nomeDi(mappa: Map<string, GiocatoreMinimo>, id: string): string {
  return mappa.get(id)?.name ?? id;
}

function riepilogo(ingresso: IngressoPartita): string {
  const r = risultatoDi(ingresso);
  return `${ingresso.date} ${ingresso.format}v${ingresso.format} ${r.testo}`;
}

/** Dettaglio compatto, sotto il limite, senza perdere i dati chiave. */
function compatta(testo: string): string {
  if (testo.length <= MAX_DETTAGLIO) return testo;
  return testo.slice(0, MAX_DETTAGLIO - 20) + "…(continua accorciata)";
}

function rigaCompatta(r: RigaGiocatore, mappa: Map<string, GiocatoreMinimo>): string {
  const pezzi = [nomeDi(mappa, r.playerId)];
  if (r.goals > 0) pezzi.push(`${r.goals}g`);
  if (r.ownGoals > 0) pezzi.push(`${r.ownGoals}ag`);
  if (r.mvp) pezzi.push("MVP");
  return pezzi.join(" ");
}

function dettaglioCreazione(id: string, ingresso: IngressoPartita, mappa: Map<string, GiocatoreMinimo>): string {
  const r = risultatoDi(ingresso);
  const g = ingresso.guidinha ? ` Guidinha: ${nomeDi(mappa, ingresso.guidinha.playerId)} (${ingresso.guidinha.text.trim().slice(0, 120)})` : "";
  return compatta(`id=${id} ${ingresso.date} ${ingresso.format}v${ingresso.format} ${r.testo}.${g}`);
}

/** Prima e dopo dei soli campi cambiati, in forma leggibile. */
export function dettaglioModifica(
  prima: IngressoPartita,
  dopo: IngressoPartita,
  mappa: Map<string, GiocatoreMinimo>,
): string {
  const cambi: string[] = [];
  if (prima.date !== dopo.date) cambi.push(`data: ${prima.date} → ${dopo.date}`);
  const squadra = (lista: RigaGiocatore[]) => lista.map((r) => rigaCompatta(r, mappa)).join(", ");
  const a1 = squadra(prima.teamA);
  const a2 = squadra(dopo.teamA);
  if (a1 !== a2) cambi.push(`A: [${a1}] → [${a2}]`);
  const b1 = squadra(prima.teamB);
  const b2 = squadra(dopo.teamB);
  if (b1 !== b2) cambi.push(`B: [${b1}] → [${b2}]`);
  const g1 = prima.guidinha ? `${nomeDi(mappa, prima.guidinha.playerId)}: ${prima.guidinha.text.trim().slice(0, 120)}` : "—";
  const g2 = dopo.guidinha ? `${nomeDi(mappa, dopo.guidinha.playerId)}: ${dopo.guidinha.text.trim().slice(0, 120)}` : "—";
  if (g1 !== g2) cambi.push(`Guidinha: ${g1} → ${g2}`);
  if (cambi.length === 0) return "nessun campo cambiato";
  return compatta(cambi.join(" | "));
}

/** Copia leggibile completa, sufficiente per reinserirla a mano. */
export function dettaglioEliminazione(
  id: string,
  ingresso: IngressoPartita,
  mappa: Map<string, GiocatoreMinimo>,
): string {
  const r = risultatoDi(ingresso);
  const squadra = (lista: RigaGiocatore[]) => lista.map((x) => rigaCompatta(x, mappa)).join(", ");
  const g = ingresso.guidinha
    ? ` Guidinha: ${nomeDi(mappa, ingresso.guidinha.playerId)} (${ingresso.guidinha.playerId}) "${ingresso.guidinha.text}"`
    : " nessuna Guidinha";
  return compatta(
    `id=${id} ${ingresso.date} ${ingresso.format}v${ingresso.format} ${r.testo}.` +
      ` A: ${squadra(ingresso.teamA)}. B: ${squadra(ingresso.teamB)}.${g}`,
  );
}

async function registra(env: Env, attore: string, azione: AuditAction, dettaglio: string): Promise<void> {
  await audit(env, attore, azione, compatta(dettaglio));
}

interface RigaPartita {
  id: string;
  season_id: number;
  date: string;
  status: string;
  guidinha_player_id: string | null;
  guidinha_text: string | null;
}

/** Lettura completa di una partita per l'editor. */
export async function leggiPartita(env: Env, id: string): Promise<{ riga: RigaPartita; ingresso: IngressoPartita } | null> {
  const riga = await env.DB.prepare(
    "SELECT id, season_id, date, status, guidinha_player_id, guidinha_text FROM matches WHERE id = ?",
  )
    .bind(id)
    .first<RigaPartita>();
  if (!riga) return null;
  const righe = await env.DB.prepare(
    "SELECT player_id, team, goals, own_goals, mvp FROM match_players WHERE match_id = ? ORDER BY team, player_id",
  )
    .bind(id)
    .all<{ player_id: string; team: string; goals: number; own_goals: number; mvp: number }>();
  const teamA: RigaGiocatore[] = [];
  const teamB: RigaGiocatore[] = [];
  for (const e of righe.results ?? []) {
    const riga2: RigaGiocatore = { playerId: e.player_id, goals: e.goals, ownGoals: e.own_goals, mvp: e.mvp === 1 };
    if (e.team === "A") teamA.push(riga2);
    else if (e.team === "B") teamB.push(riga2);
  }
  const ingresso: IngressoPartita = {
    date: riga.date,
    format: teamA.length,
    teamA,
    teamB,
    guidinha:
      riga.guidinha_player_id != null
        ? { playerId: riga.guidinha_player_id, text: riga.guidinha_text ?? "" }
        : null,
  };
  return { riga, ingresso };
}

function rispostaEditor(id: string, stagioneId: number, modificabile: boolean, ingresso: IngressoPartita) {
  const r = risultatoDi(ingresso);
  return {
    id,
    seasonId: stagioneId,
    date: ingresso.date,
    format: ingresso.format,
    editable: modificabile,
    result: r.testo,
    scoreA: r.puntiA,
    scoreB: r.puntiB,
    teamA: ingresso.teamA,
    teamB: ingresso.teamB,
    guidinha: ingresso.guidinha,
  };
}

export async function elencoPartite(env: Env, stagioneParam: string | null): Promise<Response> {
  const stagione = await resolveSeason(env, stagioneParam);
  if (!stagione) return fail(404, MSG.notFound);
  const modificabile = stagione.is_active === 1;
  const righe = await env.DB.prepare(
    "SELECT id, date FROM matches WHERE season_id = ? AND status = 'published' ORDER BY date DESC, id DESC",
  )
    .bind(stagione.id)
    .all<{ id: string; date: string }>();
  const ids = (righe.results ?? []).map((m) => m.id);
  const voci = new Map<string, CalcEntry[]>();
  const conteggi = new Map<string, number>();
  if (ids.length > 0) {
    const segnaposto = ids.map(() => "?").join(",");
    const tutte = await env.DB.prepare(
      `SELECT match_id, player_id, team, goals, own_goals, mvp FROM match_players WHERE match_id IN (${segnaposto})`,
    )
      .bind(...ids)
      .all<{ match_id: string; player_id: string; team: string; goals: number; own_goals: number; mvp: number }>();
    for (const e of tutte.results ?? []) {
      const lista = voci.get(e.match_id) ?? [];
      lista.push({ playerId: e.player_id, team: e.team, goals: e.goals, ownGoals: e.own_goals, mvp: e.mvp === 1 });
      voci.set(e.match_id, lista);
      conteggi.set(e.match_id, (conteggi.get(e.match_id) ?? 0) + 1);
    }
  }
  const partite = (righe.results ?? []).map((m) => {
    const entries = voci.get(m.id) ?? [];
    const perSquadra = new Map<string, number>();
    for (const e of entries) perSquadra.set(e.team, (perSquadra.get(e.team) ?? 0) + 1);
    const nA = perSquadra.get("A") ?? 0;
    const nB = perSquadra.get("B") ?? 0;
    const formato = nA > 0 && nA === nB ? `${nA}v${nA}` : "—";
    const punteggi = teamScores({ id: m.id, date: m.date, status: "published", entries });
    const esiti = teamOutcomes({ id: m.id, date: m.date, status: "published", entries });
    return {
      id: m.id,
      date: m.date,
      format: formato,
      result: `A ${punteggi.get("A") ?? 0} - B ${punteggi.get("B") ?? 0}`,
      scoreA: punteggi.get("A") ?? 0,
      scoreB: punteggi.get("B") ?? 0,
      outcomeA: esiti.get("A") ?? "P",
      outcomeB: esiti.get("B") ?? "P",
      editable: modificabile,
    };
  });
  return json({
    season: { id: stagione.id, name: stagione.name, isActive: stagione.is_active === 1, editable: modificabile },
    matches: partite,
  });
}

export async function dettaglioPartita(env: Env, id: string): Promise<Response> {
  const trovata = await leggiPartita(env, id);
  if (!trovata) return fail(404, "Partita non trovata");
  const stagione = await env.DB.prepare("SELECT id, name, is_active FROM seasons WHERE id = ?")
    .bind(trovata.riga.season_id)
    .first<{ id: number; name: string; is_active: number }>();
  const modificabile = (stagione?.is_active ?? 0) === 1;
  return json({
    ...rispostaEditor(trovata.riga.id, trovata.riga.season_id, modificabile, trovata.ingresso),
    season: stagione ? { id: stagione.id, name: stagione.name, isActive: stagione.is_active === 1 } : null,
  });
}

async function stagioneAttiva(env: Env) {
  const riga = await env.DB.prepare("SELECT id, name, is_active FROM seasons WHERE is_active = 1")
    .first<{ id: number; name: string; is_active: number }>();
  return riga ?? null;
}

export async function creaPartita(env: Env, attore: string, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const { ingresso, errori } = leggiIngresso(body, { testoVuotoAmmesso: false });
  if (!ingresso) return fail(400, errori.join(" "));
  const mappa = await mappaGiocatori(env);
  const mancanti = [...ingresso.teamA, ...ingresso.teamB].filter((r) => !mappa.has(r.playerId));
  if (mancanti.length > 0) return fail(400, `Giocatore non trovato: ${mancanti[0].playerId}.`);
  const stagione = await stagioneAttiva(env);
  if (!stagione) return fail(409, "Nessuna stagione attiva: non si può salvare la partita.");

  let id = nuovoIdPartita();
  for (let i = 0; i < 3; i++) {
    const esiste = await env.DB.prepare("SELECT id FROM matches WHERE id = ?").bind(id).first<{ id: string }>();
    if (!esiste) break;
    id = nuovoIdPartita();
  }

  // Ordine compatibile con i controlli Guidinha: prima la partita senza
  // Guidinha, poi le righe dei giocatori, poi la Guidinha.
  const passi: Parameters<Env["DB"]["batch"]>[0] = [];
  const db = env.DB;
  const inserisci = db
    .prepare(
      "INSERT INTO matches (id, season_id, date, status, guidinha_player_id, guidinha_text, published_at) VALUES (?, ?, ?, 'published', NULL, NULL, ?)",
    )
    .bind(id, stagione.id, ingresso.date, ingresso.date);
  passi.push(inserisci);
  for (const r of ingresso.teamA) {
    passi.push(
      db
        .prepare("INSERT INTO match_players (match_id, player_id, team, goals, own_goals, mvp) VALUES (?, ?, 'A', ?, ?, ?)")
        .bind(id, r.playerId, r.goals, r.ownGoals, r.mvp ? 1 : 0),
    );
  }
  for (const r of ingresso.teamB) {
    passi.push(
      db
        .prepare("INSERT INTO match_players (match_id, player_id, team, goals, own_goals, mvp) VALUES (?, ?, 'B', ?, ?, ?)")
        .bind(id, r.playerId, r.goals, r.ownGoals, r.mvp ? 1 : 0),
    );
  }
  if (ingresso.guidinha) {
    passi.push(
      db
        .prepare("UPDATE matches SET guidinha_player_id = ?, guidinha_text = ? WHERE id = ?")
        .bind(ingresso.guidinha.playerId, ingresso.guidinha.text, id),
    );
  }
  try {
    await db.batch(passi);
  } catch {
    return fail(400, "La partita non è valida: controlla squadre, gol e Guidinha.");
  }
  await registra(env, attore, "match_create", dettaglioCreazione(id, ingresso, mappa));
  return json({ ok: true, ...rispostaEditor(id, stagione.id, true, ingresso) }, 201);
}

export async function modificaPartita(env: Env, attore: string, id: string, request: Request): Promise<Response> {
  const esistente = await leggiPartita(env, id);
  if (!esistente) return fail(404, "Partita non trovata");
  const stagione = await env.DB.prepare("SELECT id, is_active FROM seasons WHERE id = ?")
    .bind(esistente.riga.season_id)
    .first<{ id: number; is_active: number }>();
  if (!stagione || stagione.is_active !== 1) {
    return fail(409, "La stagione è chiusa: la partita è in sola lettura e non si può modificare.");
  }
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const giaVuoto =
    esistente.ingresso.guidinha != null &&
    esistente.ingresso.guidinha.text === "" &&
    typeof (body.guidinha as Record<string, unknown> | null)?.text === "string" &&
    ((body.guidinha as Record<string, unknown>).text as string) === "" &&
    (body.guidinha as Record<string, unknown>).playerId === esistente.ingresso.guidinha.playerId;
  const { ingresso, errori } = leggiIngresso(body, { testoVuotoAmmesso: giaVuoto });
  if (!ingresso) return fail(400, errori.join(" "));
  const mappa = await mappaGiocatori(env);
  const mancanti = [...ingresso.teamA, ...ingresso.teamB].filter((r) => !mappa.has(r.playerId));
  if (mancanti.length > 0) return fail(400, `Giocatore non trovato: ${mancanti[0].playerId}.`);

  // Si azzera prima la Guidinha: così togliere dalla partita il giocatore
  // con la Guidinha o cambiare le righe non viene mai bloccato dai
  // controlli, poi si reinserisce alla fine.
  const db = env.DB;
  const passi: Parameters<Env["DB"]["batch"]>[0] = [
    db.prepare("UPDATE matches SET guidinha_player_id = NULL, guidinha_text = NULL WHERE id = ?").bind(id),
    db.prepare("DELETE FROM match_players WHERE match_id = ?").bind(id),
    db.prepare("UPDATE matches SET date = ?, published_at = ? WHERE id = ?").bind(ingresso.date, ingresso.date, id),
  ];
  for (const r of ingresso.teamA) {
    passi.push(
      db
        .prepare("INSERT INTO match_players (match_id, player_id, team, goals, own_goals, mvp) VALUES (?, ?, 'A', ?, ?, ?)")
        .bind(id, r.playerId, r.goals, r.ownGoals, r.mvp ? 1 : 0),
    );
  }
  for (const r of ingresso.teamB) {
    passi.push(
      db
        .prepare("INSERT INTO match_players (match_id, player_id, team, goals, own_goals, mvp) VALUES (?, ?, 'B', ?, ?, ?)")
        .bind(id, r.playerId, r.goals, r.ownGoals, r.mvp ? 1 : 0),
    );
  }
  if (ingresso.guidinha) {
    passi.push(
      db
        .prepare("UPDATE matches SET guidinha_player_id = ?, guidinha_text = ? WHERE id = ?")
        .bind(ingresso.guidinha.playerId, ingresso.guidinha.text, id),
    );
  }
  try {
    await db.batch(passi);
  } catch {
    return fail(400, "La partita non è valida: controlla squadre, gol e Guidinha.");
  }
  await registra(env, attore, "match_update", `id=${id} ` + dettaglioModifica(esistente.ingresso, ingresso, mappa));
  return json({ ok: true, ...rispostaEditor(id, esistente.riga.season_id, true, ingresso) });
}

export async function eliminaPartita(env: Env, attore: string, id: string): Promise<Response> {
  const esistente = await leggiPartita(env, id);
  if (!esistente) return fail(404, "Partita non trovata");
  const stagione = await env.DB.prepare("SELECT id, is_active FROM seasons WHERE id = ?")
    .bind(esistente.riga.season_id)
    .first<{ id: number; is_active: number }>();
  if (!stagione || stagione.is_active !== 1) {
    return fail(409, "La stagione è chiusa: la partita è in sola lettura e non si può eliminare.");
  }
  const mappa = await mappaGiocatori(env);
  const copia = dettaglioEliminazione(id, esistente.ingresso, mappa);
  const db = env.DB;
  try {
    // Prima si azzera la Guidinha e si tolgono le righe dei giocatori in
    // modo esplicito, poi la partita: nessuna cancellazione a cascata
    // implicita, nessun controllo che blocca a metà.
    await db.batch([
      db.prepare("UPDATE matches SET guidinha_player_id = NULL, guidinha_text = NULL WHERE id = ?").bind(id),
      db.prepare("DELETE FROM match_players WHERE match_id = ?").bind(id),
      db.prepare("DELETE FROM matches WHERE id = ?").bind(id),
    ]);
  } catch {
    return fail(400, "La partita non si può eliminare: riprova.");
  }
  await registra(env, attore, "match_delete", copia);
  return json({ ok: true, id });
}

export async function giocatoriPerEditor(env: Env): Promise<Response> {
  const res = await env.DB.prepare("SELECT id, name, role, flag FROM players ORDER BY name COLLATE NOCASE").all<{
    id: string;
    name: string;
    role: string;
    flag: string | null;
  }>();
  return json({ players: res.results ?? [] });
}
