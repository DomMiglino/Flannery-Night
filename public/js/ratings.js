// Passo 4: il "mio overall", cioè l'overall calcolato con i miei sei voti
// e i pesi del ruolo. Funzioni pure.
// I pesi sono gli stessi del Worker: un test confronta le due tabelle,
// così non possono divergere.

export const ATTRIBUTI = ["velTuf", "tirPre", "passRin", "driRif", "difRea", "fisPia"];

/**
 * @typedef {Object} Valori
 * @property {number|null} [velTuf]
 * @property {number|null} [tirPre]
 * @property {number|null} [passRin]
 * @property {number|null} [driRif]
 * @property {number|null} [difRea]
 * @property {number|null} [fisPia]
 */

/**
 * @typedef {Object} RigaVoto
 * @property {string} targetId
 * @property {number|null} [velTuf]
 * @property {number|null} [tirPre]
 * @property {number|null} [passRin]
 * @property {number|null} [driRif]
 * @property {number|null} [difRea]
 * @property {number|null} [fisPia]
 */

/**
 * Un solo nome per attributo, in base al ruolo: i portieri (P) usano la
 * variante da portiere, tutti gli altri quella base. Coppie base/portiere:
 * VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA.
 */
export const NOMI_BASE = ["VEL", "TIR", "PASS", "DRI", "DIF", "FIS"];
export const NOMI_PORTIERE = ["TUF", "PRE", "RIN", "RIF", "REA", "PIA"];

/**
 * Significati estesi dal glossario del vecchio sito (public-v2.js nel
 * branch main): Velocità/Tuffo, Tiro/Presa, Passaggio/Rinvio,
 * Riflessi, Difesa/Reattività, Fisico/Piazzamento.
 */
export const SIGNIFICATI = {
  VEL: "Velocità",
  TUF: "Tuffo",
  TIR: "Tiro",
  PRE: "Presa",
  PASS: "Passaggio",
  RIN: "Rinvio",
  DRI: "DRI",
  RIF: "Riflessi",
  DIF: "Difesa",
  REA: "Reattività",
  FIS: "Fisico",
  PIA: "Piazzamento",
};

/**
 * Le sei etichette per un ruolo: [{chiave, sigla, significato}].
 * @param {string} role
 */
export function etichettePerRuolo(role) {
  const nomi = role === "P" ? NOMI_PORTIERE : NOMI_BASE;
  return ATTRIBUTI.map((chiave, i) => ({ chiave, sigla: nomi[i], significato: SIGNIFICATI[nomi[i]] }));
}

/** Ordine degli assi come in src/calc.ts: VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA. */
export const PESI = {
  P: [0.25, 0.15, 0.1, 0.25, 0.1, 0.15],
  DC: [0.15, 0, 0.1, 0.05, 0.4, 0.3],
  DL: [0.2, 0, 0.15, 0.05, 0.3, 0.3],
  CC: [0.15, 0.15, 0.3, 0.15, 0.15, 0.1],
  CL: [0.3, 0.1, 0.2, 0.25, 0.05, 0.1],
  PC: [0.2, 0.4, 0.05, 0.15, 0, 0.2],
};

export function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/** Come in src/calc.ts: con un numero dispari il centrale, con un pari la media dei due. */
/**
 * @param {number[]|null} values
 * @returns {number|null}
 */
export function median(values) {
  const numeri = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (numeri.length === 0) return null;
  const ordinati = [...numeri].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  if (ordinati.length % 2 === 1) return ordinati[meta];
  return round1((ordinati[meta - 1] + ordinati[meta]) / 2);
}

/**
 * Overall di un insieme di sei voti per un ruolo.
 * Vuoto (null) se manca un valore: senza il mio voto non si può calcolare.
 */
/**
 * @param {string} role
 * @param {Valori|null} valori
 * @returns {number|null}
 */
export function myOverall(role, valori) {
  const numeri = ATTRIBUTI.map((chiave) => {
    const v = valori ? valori[chiave] : null;
    return v === null || v === undefined ? null : Number(v);
  });
  if (numeri.some((v) => v === null || !Number.isFinite(v))) return null;
  const pesi = PESI[role];
  if (!pesi) return round1(numeri.reduce((a, b) => a + b, 0) / 6);
  let totale = 0;
  for (let i = 0; i < 6; i++) totale += pesi[i] * numeri[i];
  return round1(totale);
}

/** I sei valori di una riga di /api/me/votes. */
/**
 * @param {RigaVoto|null} voto
 * @returns {Valori|null}
 */
export function valoriDaVoto(voto) {
  if (!voto) return null;
  const valori = {};
  for (const chiave of ATTRIBUTI) {
    const v = voto[chiave];
    valori[chiave] = v === null || v === undefined ? null : Number(v);
  }
  return valori;
}

/** Indice dei giocatori che ho già votato. */
/**
 * @param {RigaVoto[]} voti
 * @returns {Map<string, RigaVoto>}
 */
export function votiPerTarget(voti) {
  const indice = new Map();
  for (const voto of voti || []) {
    if (voto && typeof voto.targetId === "string") indice.set(voto.targetId, voto);
  }
  return indice;
}

/**
 * Valori iniziali dei campi di voto: il mio voto se esiste,
 * altrimenti 50. Mai la mediana. Restano "non salvati".
 * Accetta anche la vecchia chiamata a due argomenti e ignora il primo.
 */
/**
 * @param {Valori|null} primo mio voto, oppure mediane ignorate per compatibilita'
 * @param {Valori|null} [secondo] mio voto quando ci sono due argomenti
 * @returns {Valori}
 */
export function valoriIniziali(primo, secondo) {
  const mioVoto = secondo !== undefined ? secondo : primo;
  const iniziali = {};
  for (const chiave of ATTRIBUTI) {
    const v = mioVoto ? mioVoto[chiave] : null;
    iniziali[chiave] = v === null || v === undefined ? 50 : Number(v);
  }
  return iniziali;
}

/**
 * Voci da mostrare per i riferimenti di un attributo.
 * Ogni voce ha etichetta breve, nome intero e punteggio intero.
 * "unico" non ha etichetta di posizione, solo il nome.
 * @param {Array<{tipo: string, id: string, nome: string, valore: number}>} riferimenti
 */
export function vociRiferimento(riferimenti) {
  const lista = Array.isArray(riferimenti) ? riferimenti : [];
  const voci = [];
  for (const r of lista) {
    if (!r || typeof r.nome !== "string") continue;
    const punteggio = Number(r.valore);
    if (!Number.isFinite(punteggio)) continue;
    let etichetta = "";
    if (r.tipo === "basso") etichetta = "Più basso";
    else if (r.tipo === "medio") etichetta = "Medio";
    else if (r.tipo === "alto") etichetta = "Più alto";
    else if (r.tipo === "unico") etichetta = "";
    else continue;
    voci.push({ etichetta, nome: r.nome, punteggio, tipo: r.tipo, id: r.id });
  }
  return voci;
}