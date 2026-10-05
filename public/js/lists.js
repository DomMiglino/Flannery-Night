// Passo 4: filtri degli elenchi. Funzioni pure.
// L'ordinamento delle tabelle vive in ordina.js.

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