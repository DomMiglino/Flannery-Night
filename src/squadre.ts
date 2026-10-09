// Componi squadre: funzione pura, nessun accesso a DB o rete.
// Riusa mediane, pesi per ruolo e arrotondamento per eccesso di src/calc.ts.
// Posti e moduli in un solo punto (POSTI), pesi di equilibrio in cima.

import { ceilOverallForRole, type Arrow } from "./calc";

// Posti per squadra in ordine di riga: portiere, difensori,
// centrocampisti, attaccanti. Il 5 contro 5 non ha centrocampisti.
export const POSTI: Record<number, string[]> = {
  5: ["P", "DL", "DC", "DL", "PC"],
  6: ["P", "DL", "DC", "DL", "CC", "PC"],
  7: ["P", "DL", "DC", "DL", "CC", "CC", "PC"],
  8: ["P", "DL", "DC", "DL", "CL", "CC", "CL", "PC"],
};

export const FORMATI_AMMESSI = [5, 6, 7, 8];

// Pesi della funzione di costo, in cima per la taratura.
export const PESO_FIS = 0.5;
export const PESO_LINEE = 0.3;
export const PESO_FIS_ROT = 1.0;
export const PESO_LINEE_ROT = 0.5;

// Stima per chi e senza voti quando nessuno ha voti.
export const STIMA_SENZA_VOTI = 70;

// Penalita per ogni punto di gravita fuori ruolo: piu grande di qualunque
// somma di overall (al massimo 16 posti da 99), cosi la gravita totale resta
// prioritaria su qualsiasi differenza di overall; a parita di gravita totale
// vincono nell'ordine la somma dei centrali e poi la somma di tutti.
export const PENALITA_FUORI_RUOLO = 100000;

// Tabella unica della gravita fuori ruolo (movimento; il portiere resta
// escluso e gestito a parte come adattato). Facile da cambiare:
// ruolo esatto = 0; stessa linea con ruolo diverso (DL con DC, CL con CC)
// = 1; linee adiacenti (difesa con centrocampo, centrocampo con attacco)
// = 2; difesa con attacco = 3. Simmetrica.
export const GRAVITA_FUORI_RUOLO: Record<string, Record<string, number>> = {
  DL: { DL: 0, DC: 1, CL: 2, CC: 2, PC: 3 },
  DC: { DL: 1, DC: 0, CL: 2, CC: 2, PC: 3 },
  CL: { DL: 2, DC: 2, CL: 0, CC: 1, PC: 2 },
  CC: { DL: 2, DC: 2, CL: 1, CC: 0, PC: 2 },
  PC: { DL: 3, DC: 3, CL: 2, CC: 2, PC: 0 },
};

/** Gravita del fuori ruolo tra ruolo del giocatore e posto (0 esatto). */
export function gravitaFuoriRuolo(ruolo: string, posto: string): number {
  if (ruolo === posto) return 0;
  const riga = GRAVITA_FUORI_RUOLO[ruolo];
  const g = riga?.[posto];
  if (typeof g === "number") return g;
  // Portiere o ruoli ignoti fuori tabella: trattati come adattati leggeri,
  // senza alterare il confronto tra assegnazioni di movimento.
  return 1;
}

export const DELTA_FORMA: Record<Arrow, number> = {
  "↑": 2,
  "↗": 1,
  "→": 0,
  "↘": -1,
  "↓": -2,
};

export type Linea = "POR" | "DIF" | "CEN" | "ATT";

const LINEA_DI_POSTO: Record<string, Linea> = {
  P: "POR",
  DL: "DIF",
  DC: "DIF",
  CL: "CEN",
  CC: "CEN",
  PC: "ATT",
};

const RANGO_POSTO: Record<string, number> = {
  P: 0,
  DL: 1,
  DC: 2,
  CL: 3,
  CC: 4,
  PC: 5,
};

// Posti centrali in un solo punto: tutti i DC e i CC delle due squadre.
// A parita di gravita totale, la somma dei loro overall effettivi decide
// prima della somma di tutti (i piu forti vanno al centro).
export const POSTI_CENTRALI: ReadonlySet<string> = new Set(["DC", "CC"]);

export interface Convocato {
  id: string;
  name: string;
  role: string;
  // Sei valori nell'ordine VEL, TIR, PASS, DRI, DIF, FIS.
  // Per il ruolo P stesso ordine con TUF, PRE, RIN, RIF, REA, PIA.
  mediane: (number | null)[];
  formaArrow: Arrow;
  // Vero se assente dalle ultime 4 pubblicate della stagione attiva.
  // Chi ha 0 presenze con almeno 4 pubblicate risulta inattivo.
  inattivo: boolean;
  played: number;
}

export interface Piazzato {
  id: string;
  name: string;
  role: string;
  // Ruolo del posto occupato (P, DL, DC, CL, CC, PC).
  posto: string;
  linea: Linea;
  fuoriRuolo: boolean;
  // Gravita del fuori ruolo (0 esatto; vedi GRAVITA_FUORI_RUOLO).
  gravita: number;
  // Vero per i portieri oltre i due titolari, valutati a stima.
  adattato: boolean;
  senzaVoti: boolean;
  overallEff: number;
  fisCorr: number | null;
  played: number;
}

export interface SquadraProposta {
  portiere: Piazzato[];
  rotazione: boolean;
  difensori: Piazzato[];
  centrocampisti: Piazzato[];
  attaccanti: Piazzato[];
  totale: number;
  fisMedia: number | null;
}

export interface Proposta {
  formato: number;
  squadraA: SquadraProposta;
  squadraB: SquadraProposta;
  diffOverall: number;
  diffFis: number;
  avvisi: string[];
  testo: string;
}

function confrontaNomi(a: string, b: string): number {
  const n = String(a).localeCompare(String(b), "it", { sensitivity: "base" });
  if (n !== 0) return n;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// Chiave di spareggio come sequenza di elementi (rango posto, id):
// niente stringhe concatenate, confronto elemento per elemento.
type Chiave = Array<[number, string]>;

function confrontaChiavi(a: Chiave, b: Chiave): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0];
    if (a[i][1] !== b[i][1]) return a[i][1] < b[i][1] ? -1 : 1;
  }
  if (a.length !== b.length) return a.length - b.length;
  return 0;
}

function chiaveDi(posti: string[], ids: string[]): Chiave {
  const coppie = posti.map((p, i) => [RANGO_POSTO[p] ?? 99, ids[i]] as [number, string]);
  coppie.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return coppie;
}

function aOggetto(valori: (number | null)[]): {
  vel_tuf: number | null;
  tir_pre: number | null;
  pass_rin: number | null;
  dri_rif: number | null;
  dif_rea: number | null;
  fis_pia: number | null;
} {
  return {
    vel_tuf: valori[0] ?? null,
    tir_pre: valori[1] ?? null,
    pass_rin: valori[2] ?? null,
    dri_rif: valori[3] ?? null,
    dif_rea: valori[4] ?? null,
    fis_pia: valori[5] ?? null,
  };
}

/** Attributi corretti con forma + inattivita, entro 1 e 99. Null senza voti. */
export function correggiAttributi(
  mediane: (number | null)[],
  formaArrow: Arrow,
  inattivo: boolean,
): number[] | null {
  if (!Array.isArray(mediane) || mediane.length !== 6) return null;
  if (mediane.some((v) => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
  const delta = (DELTA_FORMA[formaArrow] ?? 0) + (inattivo ? -1 : 0);
  return (mediane as number[]).map((v) => Math.min(99, Math.max(1, Number(v) + delta)));
}

/** Overall per eccesso con i pesi del ruolo indicato. Null senza valori. */
export function overallRicalcolato(role: string, corretti: number[] | null): number | null {
  if (!corretti) return null;
  return ceilOverallForRole(role, aOggetto(corretti));
}

function ordinaPerOverall(
  lista: Array<{ overall: number; name?: string; id?: string; r?: { name: string; id: string } }>,
): void {
  lista.sort((a, b) => {
    if (b.overall !== a.overall) return b.overall - a.overall;
    const an = a.name ?? a.r?.name ?? "";
    const bn = b.name ?? b.r?.name ?? "";
    const n = confrontaNomi(an, bn);
    if (n !== 0) return n;
    const ai = a.id ?? a.r?.id ?? "";
    const bi = b.id ?? b.r?.id ?? "";
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
}

function sottoinsiemi<T>(lista: T[], k: number): T[][] {
  const out: T[][] = [];
  if (k < 0 || k > lista.length) return out;
  if (k === 0) return [[]];
  if (k === lista.length) return [[...lista]];
  const ric = (inizio: number, scelti: T[]): void => {
    if (scelti.length === k) {
      out.push([...scelti]);
      return;
    }
    for (let i = inizio; i < lista.length; i++) {
      scelti.push(lista[i]);
      ric(i + 1, scelti);
      scelti.pop();
    }
  };
  ric(0, []);
  return out;
}

function media(valori: number[]): number | null {
  if (valori.length === 0) return null;
  return valori.reduce((a, b) => a + b, 0) / valori.length;
}

function perOverallNome(a: Piazzato, b: Piazzato): number {
  if (b.overallEff !== a.overallEff) return b.overallEff - a.overallEff;
  const n = confrontaNomi(a.name, b.name);
  if (n !== 0) return n;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function validaIngresso(formato: number, convocati: Convocato[]): string | null {
  if (!FORMATI_AMMESSI.includes(formato)) return "Il formato deve essere 5, 6, 7 o 8 (giocatori per squadra).";
  const attesi = 2 * formato;
  if (convocati.length !== attesi) {
    const mancano = attesi - convocati.length;
    if (mancano > 0) return `Mancano ${mancano} ${mancano === 1 ? "convocato" : "convocati"} (${convocati.length} / ${attesi}).`;
    return `${-mancano} ${-mancano === 1 ? "convocato di troppo" : "convocati di troppo"} (${convocati.length} / ${attesi}).`;
  }
  const visti = new Set<string>();
  for (const c of convocati) {
    if (!c || typeof c.id !== "string" || c.id.trim() === "") return "Ogni convocato deve avere un id valido.";
    if (visti.has(c.id)) return "Ogni giocatore puo comparire una sola volta tra i convocati.";
    visti.add(c.id);
  }
  return null;
}

type Riga = Convocato & { corretti: number[] | null; proprio: number | null; senzaVoti: boolean };

/**
 * Assegnazione ottima dei posti di movimento con DP su maschere di bit
 * (al massimo 16 posti: circa un milione di passi, pochi millisecondi).
 * Minimizza la tupla ordinata (gravita totale fuori ruolo, -somma centrali,
 * -somma overall) con spareggio su sequenze (rango posto, id): il confronto
 * resta lessicografico per ordine, senza ambiguita. I posti di pari ruolo
 * sono indistinguibili.
 */
function assegnaOttima(
  posti: string[],
  giocatori: Riga[],
  valore: (r: Riga, posto: string) => { gravita: number; overall: number },
): Map<string, string> {
  const ord = [...giocatori].sort((a, b) => confrontaNomi(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const M = ord.length;
  const esito = new Map<string, string>();
  if (M === 0) return esito;
  interface Stato {
    gravita: number;
    centrale: number;
    somma: number;
    chiave: Chiave;
    prev: number;
    chi: number;
  }
  // Matrici precalcolate: niente ricalcoli dentro il ciclo caldo.
  // centrale = overall effettivo se il posto e DC/CC, altrimenti 0.
  const gravitaMat: number[][] = [];
  const valMat: number[][] = [];
  const centraleMat: number[][] = [];
  for (let j = 0; j < M; j++) {
    const rf: number[] = [];
    const rv: number[] = [];
    const rc: number[] = [];
    for (let t = 0; t < M; t++) {
      const v = valore(ord[j], posti[t]);
      rf.push(v.gravita);
      rv.push(v.overall);
      rc.push(POSTI_CENTRALI.has(posti[t]) ? v.overall : 0);
    }
    gravitaMat.push(rf);
    valMat.push(rv);
    centraleMat.push(rc);
  }
  const dp: (Stato | null)[] = new Array(1 << M).fill(null);
  dp[0] = { gravita: 0, centrale: 0, somma: 0, chiave: [], prev: -1, chi: -1 };
  const conta = (mask: number): number => {
    let n = 0;
    let m = mask;
    while (m > 0) {
      n += m & 1;
      m >>= 1;
    }
    return n;
  };
  const meglio = (cand: { gravita: number; centrale: number; somma: number; chiave: Chiave }, old: Stato): boolean => {
    if (cand.gravita !== old.gravita) return cand.gravita < old.gravita;
    if (cand.centrale !== old.centrale) return cand.centrale > old.centrale;
    if (cand.somma !== old.somma) return cand.somma > old.somma;
    return confrontaChiavi(cand.chiave, old.chiave) < 0;
  };
  for (let mask = 0; mask < 1 << M; mask++) {
    const cur = dp[mask];
    if (!cur) continue;
    const t = conta(mask);
    if (t >= M) continue;
    for (let j = 0; j < M; j++) {
      if (mask & (1 << j)) continue;
      const nmask = mask | (1 << j);
      // Chiave canonica del parziale: coppie (rango posto, id) ordinate.
      const estesa = [...cur.chiave, [RANGO_POSTO[posti[t]] ?? 99, ord[j].id] as [number, string]].sort((a, b) =>
        a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
      );
      const cand: Stato = { gravita: cur.gravita + gravitaMat[j][t], centrale: cur.centrale + centraleMat[j][t], somma: cur.somma + valMat[j][t], chiave: estesa, prev: mask, chi: j };
      const old = dp[nmask];
      if (!old || meglio(cand, old)) dp[nmask] = cand;
    }
  }
  let cur = (1 << M) - 1;
  while (cur > 0) {
    const st = dp[cur];
    if (!st || st.prev < 0) break;
    const t = conta(st.prev);
    esito.set(ord[st.chi].id, posti[t]);
    cur = st.prev;
  }
  return esito;
}

/**
 * Assegnazione ai posti: nell'ordine gravita totale dei fuori ruolo (vedi
 * GRAVITA_FUORI_RUOLO), somma dei centrali (DC+CC, i piu forti al centro
 * con overall ricalcolato del posto), somma di tutti; i posti scoperti
 * vanno ai migliori ricalcolati con i pesi del posto. Anche dentro la
 * stessa linea (DL nel posto DC, gravita 1) vale ricalcolo e avviso.
 */
export function assegnaLinee(formato: number, convocati: Convocato[]): Piazzato[] {
  const base = POSTI[formato];
  const righe: Riga[] = convocati.map((c) => {
    const corretti = correggiAttributi(c.mediane, c.formaArrow, c.inattivo);
    const senzaVoti = corretti === null;
    const proprio = senzaVoti ? null : ceilOverallForRole(c.role, aOggetto(corretti as number[]));
    return { ...c, corretti, proprio, senzaVoti };
  });
  // Stima di movimento: media per eccesso degli overall propri dei movement con voti.
  const movConVoti = righe.filter((r) => r.role !== "P" && !r.senzaVoti && r.proprio !== null);
  const stimaMov =
    movConVoti.length > 0
      ? Math.ceil(movConVoti.reduce((a, r) => a + (r.proprio as number), 0) / movConVoti.length)
      : STIMA_SENZA_VOTI;
  const effProprio = (r: Riga): number => (r.senzaVoti ? stimaMov : (r.proprio as number));

  const nP = righe.filter((r) => r.role === "P").length;
  const postiP = nP >= 2 ? 2 : nP;
  // Posti totali: due copie del modulo, con un CC in piu per ogni portiere mancante.
  const posti: string[] = [...base, ...base];
  let daTogliere = 2 - postiP;
  const tenuti = posti.filter((p) => {
    if (p === "P" && daTogliere > 0) {
      daTogliere -= 1;
      return false;
    }
    return true;
  });
  for (let i = 0; i < 2 - postiP; i++) tenuti.push("CC");

  // Titolari in porta: i migliori P (a parita nome, poi id).
  const candP = righe
    .filter((r) => r.role === "P")
    .map((r) => ({ r, overall: effProprio(r) }));
  ordinaPerOverall(candP);
  const titolari = candP.slice(0, postiP).map((c) => c.r);
  const idTitolari = new Set(titolari.map((r) => r.id));
  // P titolare senza voti: media dell'altro titolare se ha voti, altrimenti stima.
  const valorePor = (r: Riga): number => {
    if (!r.senzaVoti) return r.proprio as number;
    const altro = titolari.find((t) => t.id !== r.id && !t.senzaVoti);
    if (altro) return altro.proprio as number;
    return stimaMov;
  };

  const piazzati: Piazzato[] = titolari.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    posto: "P",
    linea: "POR" as Linea,
    fuoriRuolo: false,
    gravita: 0,
    adattato: false,
    senzaVoti: r.senzaVoti,
    overallEff: valorePor(r),
    fisCorr: null,
    played: r.played,
  }));

  // Bacino movimento: tutti gli altri; i P fuori porta sono adattati a stima fissa
  // (i loro voti su TUF, PRE, RIN, RIF, REA, PIA non si ricalcolano in movimento).
  // Il portiere resta escluso dalla tabella gravita come prima: nessun
  // giocatore di movimento va in porta e nessun P va in movimento se non
  // come adattato a stima.
  const bacino = righe.filter((r) => !idTitolari.has(r.id));
  const valoreMov = (r: Riga, posto: string): { gravita: number; overall: number } => {
    if (r.role === "P") return { gravita: 1, overall: stimaMov };
    const gravita = gravitaFuoriRuolo(r.role, posto);
    if (r.senzaVoti) return { gravita, overall: stimaMov };
    if (r.role === posto) return { gravita: 0, overall: r.proprio as number };
    return { gravita, overall: ceilOverallForRole(posto, aOggetto(r.corretti as number[])) as number };
  };
  const fisDi = (r: Riga): number | null => {
    if (r.role === "P" || r.senzaVoti || !r.corretti) return null;
    return (r.corretti as number[])[5];
  };
  const postiMov = tenuti
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p !== "P")
    .sort((a, b) => RANGO_POSTO[a.p] - RANGO_POSTO[b.p] || a.i - b.i)
    .map(({ p }) => p);
  const mappa = assegnaOttima(postiMov, bacino, valoreMov);
  const perId = new Map(bacino.map((r) => [r.id, r]));
  for (const [id, posto] of mappa) {
    const r = perId.get(id);
    if (!r) continue;
    const v = valoreMov(r, posto);
    piazzati.push({
      id: r.id,
      name: r.name,
      role: r.role,
      posto,
      linea: LINEA_DI_POSTO[posto],
      fuoriRuolo: v.gravita > 0,
      gravita: v.gravita,
      adattato: r.role === "P",
      senzaVoti: r.senzaVoti,
      overallEff: v.overall,
      fisCorr: fisDi(r),
      played: r.played,
    });
  }
  return piazzati;
}

interface Divisione {
  x: Piazzato[];
  y: Piazzato[];
}

function opzioniGruppo(l: Piazzato[]): Piazzato[][] {
  if (l.length === 0) return [[]];
  if (l.length === 1) return [[...l], []];
  if (l.length % 2 === 0) return sottoinsiemi(l, l.length / 2);
  return [...sottoinsiemi(l, Math.floor(l.length / 2)), ...sottoinsiemi(l, Math.ceil(l.length / 2))];
}

export function dividiSquadre(formato: number, piazzati: Piazzato[]): { teamX: Piazzato[]; teamY: Piazzato[] } {
  const perPosto = new Map<string, Piazzato[]>();
  for (const p of piazzati) {
    const l = perPosto.get(p.posto) ?? [];
    l.push(p);
    perPosto.set(p.posto, l);
  }
  const gruppi = [...perPosto.entries()].sort((a, b) => (RANGO_POSTO[a[0]] ?? 99) - (RANGO_POSTO[b[0]] ?? 99));
  const opzioni = gruppi.map(([, l]) => opzioniGruppo(l));
  const por = piazzati.filter((p) => p.linea === "POR");
  const rotazione = por.length < 2;
  const pesoFis = rotazione ? PESO_FIS_ROT : PESO_FIS;
  const pesoLinee = rotazione ? PESO_LINEE_ROT : PESO_LINEE;

  const inLinea = (l: Piazzato[], linea: Linea): Piazzato[] => l.filter((p) => p.linea === linea);
  let best: Divisione | null = null;
  let bestCosto = Number.POSITIVE_INFINITY;
  let bestChiave: Chiave = [];
  const idx = new Array(gruppi.length).fill(0);
  for (;;) {
    const x = gruppi.flatMap(([,], gi) => opzioni[gi][idx[gi]]);
    if (x.length === formato) {
      const idsX = new Set(x.map((p) => p.id));
      const y = piazzati.filter((p) => !idsX.has(p.id));
      if (y.length === formato) {
        const totX = x.reduce((a, p) => a + p.overallEff, 0);
        const totY = y.reduce((a, p) => a + p.overallEff, 0);
        const diffOverall = Math.abs(totX - totY);
        const fisX = x.map((p) => p.fisCorr).filter((v): v is number => typeof v === "number");
        const fisY = y.map((p) => p.fisCorr).filter((v): v is number => typeof v === "number");
        const mFx = media(fisX) ?? 0;
        const mFy = media(fisY) ?? 0;
        const diffFis = Math.abs(mFx - mFy);
        const avg = (lista: Piazzato[]): number => {
          if (lista.length === 0) return 0;
          return lista.reduce((a, p) => a + p.overallEff, 0) / lista.length;
        };
        const dDif = Math.abs(avg(inLinea(x, "DIF")) - avg(inLinea(y, "DIF")));
        const dCen = Math.abs(avg(inLinea(x, "CEN")) - avg(inLinea(y, "CEN")));
        const dAtt = Math.abs(avg(inLinea(x, "ATT")) - avg(inLinea(y, "ATT")));
        const costo = diffOverall + pesoFis * diffFis + pesoLinee * (dDif + dCen + dAtt);
        const chiave = chiaveDi(
          x.map((p) => p.posto),
          x.map((p) => p.id),
        );
        if (costo < bestCosto - 1e-9 || (Math.abs(costo - bestCosto) <= 1e-9 && (best === null || confrontaChiavi(chiave, bestChiave) < 0))) {
          bestCosto = costo;
          best = { x: [...x], y: [...y] };
          bestChiave = chiave;
        }
      }
    }
    let k = 0;
    while (k < idx.length) {
      idx[k] += 1;
      if (idx[k] < opzioni[k].length) break;
      idx[k] = 0;
      k += 1;
    }
    if (k >= idx.length) break;
  }
  if (!best) {
    const meta = piazzati.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    return { teamX: meta.slice(0, formato), teamY: meta.slice(formato) };
  }
  return { teamX: best.x, teamY: best.y };
}

// Righe per posto: i laterali in ordine decrescente fuori, i centrali in mezzo.
function rigaDifensori(membri: Piazzato[]): Piazzato[] {
  const dl = membri.filter((p) => p.posto === "DL").sort(perOverallNome);
  const dc = membri.filter((p) => p.posto === "DC");
  return [...dl.slice(0, 1), ...dc.slice(0, 1), ...dl.slice(1, 2)];
}

function rigaCentrocampisti(membri: Piazzato[]): Piazzato[] | null {
  const cl = membri.filter((p) => p.posto === "CL").sort(perOverallNome);
  const cc = membri.filter((p) => p.posto === "CC").sort(perOverallNome);
  if (cl.length === 0 && cc.length === 0) return null;
  const fuori: Piazzato[] = [];
  if (cl.length > 0) fuori.push(cl[0]);
  fuori.push(...cc);
  if (cl.length > 1) fuori.push(cl[1]);
  return fuori;
}

function rigaLinea(lista: Piazzato[]): string {
  return lista.map((p) => `${p.name} ${p.overallEff}`).join(" ");
}

export function costruisciTesto(formato: number, a: SquadraProposta, b: SquadraProposta): string {
  const righe: string[] = [];
  righe.push(`*PROPOSTA FORMAZIONI FLANNERY - ${formato} vs ${formato}*`);
  righe.push("");
  const blocco = (etichetta: string, s: SquadraProposta): void => {
    righe.push(`*${etichetta}* - Overall ${s.totale}`);
    righe.push(s.rotazione ? "Portiere: a rotazione" : rigaLinea(s.portiere));
    righe.push(rigaLinea(s.difensori));
    if (s.centrocampisti.length > 0) righe.push(rigaLinea(s.centrocampisti));
    righe.push(rigaLinea(s.attaccanti));
  };
  blocco("Squadra A", a);
  righe.push("");
  righe.push("vs");
  righe.push("");
  blocco("Squadra B", b);
  return righe.join("\n");
}

function costruisciSquadra(membri: Piazzato[]): SquadraProposta {
  const portiere = membri.filter((p) => p.linea === "POR").sort(perOverallNome).slice(0, 1);
  const difensori = rigaDifensori(membri);
  const cen = rigaCentrocampisti(membri);
  const attaccanti = membri.filter((p) => p.posto === "PC").slice(0, 1);
  const totale = membri.reduce((a, p) => a + p.overallEff, 0);
  const fisValori = membri.map((p) => p.fisCorr).filter((v): v is number => typeof v === "number");
  return {
    portiere,
    rotazione: portiere.length === 0,
    difensori,
    centrocampisti: cen ?? [],
    attaccanti,
    totale,
    fisMedia: media(fisValori),
  };
}

/** Proposta completa: valida, assegna, divide, ordina A/B, scrive testo e avvisi. */
export function componiSquadre(formato: number, convocati: Convocato[]): Proposta {
  const errore = validaIngresso(formato, convocati);
  if (errore) throw new Error(errore);
  const piazzati = assegnaLinee(formato, convocati);
  const { teamX, teamY } = dividiSquadre(formato, piazzati);

  const totX = teamX.reduce((a, p) => a + p.overallEff, 0);
  const totY = teamY.reduce((a, p) => a + p.overallEff, 0);
  let candA = teamX;
  let candB = teamY;
  if (totY > totX) {
    candA = teamY;
    candB = teamX;
  } else if (totX === totY) {
    const maxX = Math.max(...teamX.map((p) => p.played));
    const maxY = Math.max(...teamY.map((p) => p.played));
    if (maxY > maxX) {
      candA = teamY;
      candB = teamX;
    } else if (maxX === maxY) {
      const kx = chiaveDi(
        teamX.map((p) => p.posto),
        teamX.map((p) => p.id),
      );
      const ky = chiaveDi(
        teamY.map((p) => p.posto),
        teamY.map((p) => p.id),
      );
      if (confrontaChiavi(ky, kx) < 0) {
        candA = teamY;
        candB = teamX;
      }
    }
  }
  const squadraA = costruisciSquadra(candA);
  const squadraB = costruisciSquadra(candB);
  const diffOverall = Math.abs(squadraA.totale - squadraB.totale);
  const diffFis = Math.abs((squadraA.fisMedia ?? 0) - (squadraB.fisMedia ?? 0));

  const avvisi: string[] = [];
  const nPor = convocati.filter((c) => c.role === "P").length;
  if (nPor < 2) avvisi.push(nPor === 1 ? "Portiere a rotazione in una squadra." : "Portiere a rotazione in entrambe le squadre.");
  const senza = piazzati.filter((p) => p.senzaVoti);
  if (senza.length > 0) {
    const nomi = [...senza].sort((a, b) => confrontaNomi(a.name, b.name)).map((p) => p.name).join(", ");
    avvisi.push(`Senza voti (stima dalla media): ${nomi}.`);
  }
  const adattati = piazzati.filter((p) => p.adattato);
  if (adattati.length > 0) {
    const nomi = [...adattati].sort((a, b) => confrontaNomi(a.name, b.name)).map((p) => p.name).join(", ");
    avvisi.push(`Portiere adattato: ${nomi}.`);
  }
  const fuori = piazzati.filter((p) => p.fuoriRuolo && !p.adattato);
  if (fuori.length > 0) {
    const nomi = [...fuori]
      .sort((a, b) => b.gravita - a.gravita || confrontaNomi(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => `${p.name} (${p.role} in ${p.posto})`)
      .join(", ");
    avvisi.push(`Fuori ruolo: ${nomi}.`);
  }

  return {
    formato,
    squadraA,
    squadraB,
    diffOverall,
    diffFis: Math.round(diffFis * 10) / 10,
    avvisi,
    testo: costruisciTesto(formato, squadraA, squadraB),
  };
}
