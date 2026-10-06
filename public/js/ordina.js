// Ordinamento delle tabelle: logica pura, senza DOM.
// Una sola colonna attiva alla volta. Su una colonna il primo tocco dà la
// sua direzione iniziale e il secondo l'inversa; con prossimoStatoTabella
// il terzo tocco riporta all'ordine iniziale della tabella (stato null).

/**
 * @typedef {Object} Criterio
 * @property {string|function} chiave  nome del campo o funzione che estrae il valore
 * @property {"asc"|"desc"} [direzione]
 */

/**
 * @typedef {Object} StatoOrdinamento
 * @property {string} id
 * @property {string|function} chiave
 * @property {"asc"|"desc"} direzione
 */

/** I valori mancanti (null, undefined, NaN) vanno sempre in fondo. */
function mancante(v) {
  return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
}

function confrontaValori(a, b, direzione) {
  const ma = mancante(a);
  const mb = mancante(b);
  if (ma && mb) return 0;
  if (ma) return 1;
  if (mb) return -1;
  let esito;
  if (typeof a === "number" && typeof b === "number") {
    esito = a < b ? -1 : a > b ? 1 : 0;
  } else {
    esito = String(a).localeCompare(String(b), "it", { sensitivity: "base" });
  }
  return direzione === "desc" ? -esito : esito;
}

function valore(riga, chiave) {
  if (typeof chiave === "function") return chiave(riga);
  return riga ? riga[chiave] : undefined;
}

/**
 * Ordina una copia delle righe: prima per chiave e direzione, poi per
 * gli spareggi nell'ordine dato. L'originale non viene mutato; a pari
 * valori resta l'ordine di partenza (ordinamento stabile).
 * @param {Array} righe
 * @param {{chiave: string|function, direzione?: "asc"|"desc", spareggi?: Criterio[]}} opzioni
 */
export function ordinaRighe(righe, { chiave, direzione = "desc", spareggi = [] } = {}) {
  const criteri = [{ chiave, direzione }, ...(spareggi || [])];
  const copia = [...(righe || [])];
  copia.sort((a, b) => {
    for (const criterio of criteri) {
      const esito = confrontaValori(valore(a, criterio.chiave), valore(b, criterio.chiave), criterio.direzione || "desc");
      if (esito !== 0) return esito;
    }
    return 0;
  });
  return copia;
}

/**
 * Ordina per una sequenza di criteri: il primo ha la precedenza, gli
 * altri valgono come spareggi nell'ordine dato. Serve per l'ordine
 * iniziale di una tabella, che non coincide con nessuna colonna.
 * @param {Array} righe
 * @param {Criterio[]} criteri
 */
export function ordinaPerCriteri(righe, criteri) {
  const lista = (criteri || []).filter((c) => c && c.chiave !== undefined && c.chiave !== null);
  if (lista.length === 0) return [...(righe || [])];
  const [primo, ...resto] = lista;
  return ordinaRighe(righe, { chiave: primo.chiave, direzione: primo.direzione || "desc", spareggi: resto });
}

/**
 * Prossimo stato dopo il tocco su una colonna.
 * @param {StatoOrdinamento|null} stato  colonna attiva, o null
 * @param {{id: string, chiave: string|function, iniziale: "asc"|"desc"}} colonna  colonna toccata
 */
export function prossimoStato(stato, colonna) {
  if (!stato || stato.id !== colonna.id) {
    return { id: colonna.id, chiave: colonna.chiave, direzione: colonna.iniziale };
  }
  return { id: stato.id, chiave: stato.chiave, direzione: stato.direzione === "asc" ? "desc" : "asc" };
}

/**
 * Tocco sull'intestazione di una tabella: il primo porta la direzione
 * iniziale della colonna, il secondo l'inversa, il terzo torna
 * all'ordine iniziale della tabella (null = nessuna colonna attiva).
 * @param {StatoOrdinamento|null} stato  colonna attiva, o null
 * @param {{id: string, chiave: string|function, iniziale: "asc"|"desc"}} colonna  colonna toccata
 * @returns {StatoOrdinamento|null}
 */
export function prossimoStatoTabella(stato, colonna) {
  if (stato && stato.id === colonna.id && stato.direzione !== colonna.iniziale) return null;
  return prossimoStato(stato, colonna);
}

/** Valore per aria-sort dall'essere o meno la colonna attiva. */
export function ariaSort(attiva, direzione) {
  if (!attiva) return "none";
  return direzione === "asc" ? "ascending" : "descending";
}

const memorie = new Map();

/**
 * Ordinamento che resta cambiando stagione (stesso percorso) ma torna a
 * quello iniziale uscendo dalla pagina e rientrando (percorso diverso).
 * L'iniziale può essere null: nessuna colonna attiva, ordine iniziale
 * della tabella.
 * @param {string} vista  nome della pagina ("classifica", "giocatori-portieri")
 * @param {string} percorso  percorso attuale (location.pathname)
 * @param {StatoOrdinamento|null} iniziale
 */
export function memoriaOrdinamento(vista, percorso, iniziale) {
  const precedente = memorie.get(vista);
  if (!precedente || precedente.percorso !== percorso) {
    const fresca = { percorso, ordinamento: iniziale ? { ...iniziale } : null };
    memorie.set(vista, fresca);
    return fresca;
  }
  return precedente;
}
