// Passo 4: stato condiviso dell'applicazione.
// Niente DOM qui dentro: lo stato serve a tutte le viste.

const stato = {
  /** Giocatore collegato, oppure null. */
  player: null,
  /** true dopo un controllo riuscito su /api/me. */
  controllato: false,
  /** Stagioni disponibili e stagione scelta. */
  stagioni: [],
  seasonId: null,
  /** Pagina da riprendere dopo un accesso scaduto. */
  returnTo: null,
};

const ascoltatori = new Set();

export function ascolta(funzione) {
  ascoltatori.add(funzione);
  return () => ascoltatori.delete(funzione);
}

function avvisa() {
  for (const funzione of ascoltatori) funzione(stato);
}

export function getStato() {
  return stato;
}

export function isCollegato() {
  return stato.player !== null;
}

/**
 * Il giocatore collegato, oppure null. Unica fonte dello stato:
 * le viste leggono da qui, mai da copie locali.
 */
export function utenteCollegato() {
  return stato.player;
}

/**
 * Cosa fa l'icona dell'account al tocco: "accesso" diretto alla pagina
 * di accesso, oppure "menu". Si decide al momento del tocco leggendo
 * lo stato corrente, mai con un valore memorizzato prima.
 */
export function azioneAccount(collegato) {
  return collegato ? "menu" : "accesso";
}

/**
 * Voci del menu dell'account visibili per lo stato dato.
 */
export function vociMenu(collegato) {
  return [
    { id: "voce-cambia", visibile: collegato },
    { id: "voce-accedi", visibile: !collegato },
    { id: "voce-esci", visibile: collegato },
  ];
}

export function impostaCollegato(player) {
  stato.player = player;
  avvisa();
}

export function impostaControllato() {
  stato.controllato = true;
  avvisa();
}

export function ricordaReturnTo(path) {
  stato.returnTo = path || null;
}

export function prendiReturnTo() {
  const value = stato.returnTo;
  stato.returnTo = null;
  return value;
}

export function impostaStagioni(lista) {
  stato.stagioni = Array.isArray(lista) ? lista : [];
  avvisa();
}

export function impostaStagione(seasonId) {
  const esiste = stato.stagioni.some((s) => Number(s.id) === Number(seasonId));
  stato.seasonId = esiste ? Number(seasonId) : null;
  avvisa();
}

export function stagioneCorrente() {
  return stato.seasonId;
}

export function stagioneAttiva() {
  const attiva = stato.stagioni.find((s) => s.isActive);
  return attiva ? attiva.id : null;
}

export function nomeStagione(seasonId) {
  const trovata = stato.stagioni.find((s) => Number(s.id) === Number(seasonId));
  return trovata ? trovata.name : "";
}