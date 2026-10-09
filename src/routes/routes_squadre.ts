// Componi squadre: due rotte di lettura per la gestione.
// Nessuna scrittura sul DB e nessuna voce nel registro: solo calcolo e testo.
// Il permesso resta in router.ts (lettura di players.is_admin a ogni richiesta).

import { playerSeason, publishedSorted, summarizeVotes } from "../calc";
import type { Env } from "../env";
import { fail, json, MSG, readJsonObject } from "../http";
import { loadSeasonMatches, loadVotesByTarget, resolveSeason } from "../queries";
import { componiSquadre, FORMATI_AMMESSI, type Convocato } from "../squadre";

interface RigaGiocatore {
  id: string;
  name: string;
  role: string;
}

/** Elenco per la griglia: tutti i giocatori, anche con 0 presenze. */
export async function elencoSquadre(env: Env): Promise<Response> {
  const stagione = await resolveSeason(env, null);
  if (!stagione) return fail(404, MSG.notFound);
  const res = await env.DB.prepare("SELECT id, name, role FROM players ORDER BY name COLLATE NOCASE").all<RigaGiocatore>();
  const righe = res.results ?? [];
  const partite = await loadSeasonMatches(env, stagione.id);
  const presenze = new Map<string, number>();
  for (const p of righe) presenze.set(p.id, 0);
  for (const m of partite) {
    for (const e of m.entries) {
      presenze.set(e.playerId, (presenze.get(e.playerId) ?? 0) + 1);
    }
  }
  const giocatori = righe.map((p) => ({ id: p.id, name: p.name, role: p.role, played: presenze.get(p.id) ?? 0 }));
  giocatori.sort((a, b) => {
    if (b.played !== a.played) return b.played - a.played;
    const n = String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" });
    if (n !== 0) return n;
    return a.id < b.id ? -1 : 1;
  });
  return json({ season: { id: stagione.id, name: stagione.name }, players: giocatori });
}

function idsValidi(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string" || v.trim() === "") return null;
    out.push(v.trim());
  }
  return out;
}

/** Calcolo della proposta: riceve formato e id dei convocati, restituisce testo e dettagli. */
export async function propostaSquadre(env: Env, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);
  const formato = (body as Record<string, unknown>).formato;
  if (typeof formato !== "number" || !FORMATI_AMMESSI.includes(formato)) {
    return fail(400, "Il formato deve essere 5, 6, 7 o 8 (giocatori per squadra).");
  }
  const ids = idsValidi((body as Record<string, unknown>).convocati);
  if (!ids) return fail(400, "Servono i convocati come elenco di id.");
  const attesi = 2 * formato;
  if (ids.length !== attesi) {
    const mancano = attesi - ids.length;
    if (mancano > 0) return fail(400, `Mancano ${mancano} ${mancano === 1 ? "convocato" : "convocati"} (${ids.length} / ${attesi}).`);
    return fail(400, `${-mancano} ${-mancano === 1 ? "convocato di troppo" : "convocati di troppo"} (${ids.length} / ${attesi}).`);
  }
  const visti = new Set<string>();
  for (const id of ids) {
    if (visti.has(id)) return fail(400, "Ogni giocatore puo comparire una sola volta tra i convocati.");
    visti.add(id);
  }

  const segnaposto = ids.map(() => "?").join(",");
  const esistenti = await env.DB.prepare(`SELECT id, name, role FROM players WHERE id IN (${segnaposto})`).bind(...ids).all<RigaGiocatore>();
  const perId = new Map((esistenti.results ?? []).map((r) => [r.id, r]));
  for (const id of ids) {
    if (!perId.has(id)) return fail(400, `Giocatore non trovato: ${id}.`);
  }

  const stagione = await resolveSeason(env, null);
  if (!stagione) return fail(404, MSG.notFound);
  const partite = await loadSeasonMatches(env, stagione.id);
  const ordinate = publishedSorted(partite);
  const ultime4 = ordinate.slice(-4);
  const ha4 = ordinate.length >= 4;
  const presentiUltime = new Map<string, boolean>();
  for (const id of ids) presentiUltime.set(id, false);
  for (const m of ultime4) {
    for (const e of m.entries) {
      if (presentiUltime.has(e.playerId)) presentiUltime.set(e.playerId, true);
    }
  }

  const voti = await loadVotesByTarget(env);
  const convocati: Convocato[] = ids.map((id) => {
    const riga = perId.get(id) as RigaGiocatore;
    const riepilogo = summarizeVotes(riga.role, voti.get(id) ?? []);
    const stats = playerSeason(partite, id);
    return {
      id: riga.id,
      name: riga.name,
      role: riga.role,
      mediane: [riepilogo.vel_tuf, riepilogo.tir_pre, riepilogo.pass_rin, riepilogo.dri_rif, riepilogo.dif_rea, riepilogo.fis_pia],
      formaArrow: stats.formaArrow,
      inattivo: ha4 && !presentiUltime.get(id),
      played: stats.played,
    };
  });

  try {
    const proposta = componiSquadre(formato, convocati);
    const riduci = (p: { id: string; name: string; role: string; posto: string; linea: string; overallEff: number; played: number }) => ({
      id: p.id, name: p.name, role: p.role, posto: p.posto, linea: p.linea, overall: p.overallEff, played: p.played,
    });
    return json({
      formato: proposta.formato,
      testo: proposta.testo,
      squadraA: {
        totale: proposta.squadraA.totale,
        fisMedia: proposta.squadraA.fisMedia,
        rotazione: proposta.squadraA.rotazione,
        portiere: proposta.squadraA.portiere.map(riduci),
        difensori: proposta.squadraA.difensori.map(riduci),
        centrocampisti: proposta.squadraA.centrocampisti.map(riduci),
        attaccanti: proposta.squadraA.attaccanti.map(riduci),
      },
      squadraB: {
        totale: proposta.squadraB.totale,
        fisMedia: proposta.squadraB.fisMedia,
        rotazione: proposta.squadraB.rotazione,
        portiere: proposta.squadraB.portiere.map(riduci),
        difensori: proposta.squadraB.difensori.map(riduci),
        centrocampisti: proposta.squadraB.centrocampisti.map(riduci),
        attaccanti: proposta.squadraB.attaccanti.map(riduci),
      },
      diffOverall: proposta.diffOverall,
      diffFis: proposta.diffFis,
      avvisi: proposta.avvisi,
    });
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : MSG.badRequest);
  }
}
