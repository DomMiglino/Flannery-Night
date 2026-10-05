// Passo 4: ordinamenti e filtri degli elenchi. Funzioni pure.

export const MODI_ORDINE = ["overall-desc", "overall-asc", "nome"];

/**
 * @typedef {Object} GiocatoreElenco
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {number|null} [overall]
 */

/**
 * @typedef {Object} RigaClassifica
 * @property {string} id
 * @property {number} [played]
 */

/**
 * @typedef {Object} FiltroElenco
 * @property {string} [query]
 * @property {string} [role]
 * @property {Set<string>|null} [votati]
 * @property {string|null} [io]
 */

/**
 * @param {GiocatoreElenco} a
 * @param {GiocatoreElenco} b
 * @param {boolean} decrescente
 */
function confrontaOverall(a, b, decrescente) {
  const va = a.overall === null || a.overall === undefined ? null : Number(a.overall);
  const vb = b.overall === null || b.overall === undefined ? null : Number(b.overall);
  // Chi non ha voti va sempre in fondo, in entrambi i sensi.
  if (va === null && vb === null) return a.name.localeCompare(b.name, "it");
  if (va === null) return 1;
  if (vb === null) return -1;
  if (va === vb) return a.name.localeCompare(b.name, "it");
  return decrescente ? vb - va : va - vb;
}

/**
 * Ordina per overall decrescente, crescente o per nome.
 * @param {GiocatoreElenco[]} giocatori
 * @param {string} [modo]
 * @returns {GiocatoreElenco[]}
 */
export function sortPlayers(giocatori, modo = "overall-desc") {
  const copia = [...(giocatori || [])];
  if (modo === "nome") {
    return copia.sort((a, b) => a.name.localeCompare(b.name, "it"));
  }
  return copia.sort((a, b) => confrontaOverall(a, b, modo !== "overall-asc"));
}

function normalizza(testo) {
  return String(testo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filtra per nome, ruolo e per "solo chi non ho ancora votato".
 * Con il filtro "da votare" attivo non compare mai chi ha fatto
 * l'accesso (non ci si può votare da soli). La ricerca ignora
 * accenti e maiuscole.
 * @param {GiocatoreElenco[]} giocatori
 * @param {FiltroElenco} [filtro]
 * @returns {GiocatoreElenco[]}
 */
export function filterPlayers(giocatori, { query = "", role = "", votati = null, io = null } = {}) {
  const testo = normalizza(query);
  const mioInsieme = votati instanceof Set ? votati : null;
  return (giocatori || []).filter((g) => {
    if (role && g.role !== role) return false;
    if (testo !== "" && !normalizza(g.name).includes(testo)) return false;
    if (mioInsieme && mioInsieme.has(g.id)) return false;
    if (mioInsieme && io && g.id === io) return false;
    return true;
  });
}

/**
 * Ruoli presenti nell'elenco, in ordine di comparsa.
 * @param {GiocatoreElenco[]} giocatori
 * @returns {string[]}
 */
export function rolesOf(giocatori) {
  const ruoli = [];
  for (const g of giocatori || []) {
    if (g.role && !ruoli.includes(g.role)) ruoli.push(g.role);
  }
  return ruoli;
}

/**
 * La classifica tiene solo chi ha giocato almeno una partita.
 * @template {RigaClassifica} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function withAppearances(rows) {
  return (rows || []).filter((r) => Number(r.played) > 0);
}