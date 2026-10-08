// Passo 4: giocatori in due tabelle ordinabili, una per i portieri e una
// per i ruoli di movimento. Restano il filtro per ruolo e, con l'accesso,
// la spunta "Da votare". Si ordina toccando l'intestazione e ogni tabella
// ha il suo ordinamento. Senza accesso le celle delle mediane mostrano
// solo il valore ricevuto.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { filterPlayers, rolesOf, separaPortieri } from "../lists.js";
import { etichettePerRuolo, PESI, votiPerTarget } from "../ratings.js";
import {
  ariaSort,
  memoriaOrdinamento,
  ordinaPerCriteri,
  ordinaRighe,
  prossimoStatoTabella,
} from "../ordina.js";
import { withSeason } from "../routes.js";
import { bandiera, errore, scheletro, titolo } from "../ui.js";
import { troncaNome } from "./classifica.js";
import { lasciaAvviso, prendiAvviso } from "../state.js";
import { renderEditorGiocatore, ETICHETTE_RUOLI } from "./editor_giocatore.js";

/** Mediana come arriva dall'API (può avere un decimale); "—" senza voti. */
function testoMediana(valore) {
  if (valore === null || valore === undefined) return "—";
  return Number.isInteger(valore) ? String(valore) : String(valore).replace(".", ",");
}

/** Ritorno all'archivio mantenendo la stagione scelta. */
function indietroA(ctx) {
  const stagione = ctx.stagione();
  return stagione ? `/giocatori?stagione=${encodeURIComponent(String(stagione))}` : "/giocatori";
}

/** Overall per eccesso già calcolato dal server; "—" senza voti. */
function testoOverallUp(valore) {
  return valore === null || valore === undefined ? "—" : String(valore);
}

/**
 * Cella doppia "mediana / mio voto": a sinistra il valore ricevuto,
 * a destra quello assegnato, trattini se non assegnato.
 */
export function testoDoppio(sinistra, mio) {
  const destro = mio === null || mio === undefined ? "—" : String(mio);
  return `${sinistra} / ${destro}`;
}

/**
 * Testo di una cella numerica letto al momento del disegno: con
 * l'accesso il doppio valore "mediana / mio", senza l'accesso il solo
 * valore ricevuto. La propria riga resta sempre singola.
 * @param {string} sinistra  mediana o overall ricevuto
 * @param {number|null|undefined} destro  il mio voto
 * @param {boolean} collegato  stato letto da state.js
 * @param {boolean} [propria]
 */
export function testoCella(sinistra, destro, collegato, propria = false) {
  if (!collegato || propria) return sinistra;
  return testoDoppio(sinistra, destro);
}

/**
 * Vero se il mio voto sta almeno 8 punti sotto la mediana:
 * solo numeri finiti, mai con valori mancanti.
 */
export function votoBasso(mediana, mio) {
  if (mediana === null || mediana === undefined || mio === null || mio === undefined) return false;
  const ricevuta = Number(mediana);
  const dato = Number(mio);
  if (!Number.isFinite(ricevuta) || !Number.isFinite(dato)) return false;
  return ricevuta - dato >= 8;
}

/**
 * Stesso doppio valore ma come nodi: la mediana resta com'è,
 * il "/ mio" va in uno span leggero da stilizzare a parte.
 */
export function nodoCella(sinistra, destro, collegato, propria = false) {
  if (!collegato || propria) return String(sinistra);
  const mio = destro === null || destro === undefined ? "—" : String(destro);
  return [el("span", { text: String(sinistra) }), el("span", { className: "tabella-mio", text: ` / ${mio}` })];
}

/** Ruoli in ordine fisso: prima i portieri, poi la difesa e l'attacco. */
const ORDINE_RUOLI = ["P", "DC", "DL", "CC", "CL", "PC"];

function indiceRuolo(ruolo) {
  const i = ORDINE_RUOLI.indexOf(ruolo);
  return i < 0 ? ORDINE_RUOLI.length : i;
}

function indiceRuoloDi(giocatore) {
  return indiceRuolo(giocatore ? giocatore.role : "");
}

const COLONNA_NOME = { id: "nome", etichetta: "Giocatore", chiave: "name", iniziale: "asc" };
const COLONNA_RUOLO = { id: "ruolo", etichetta: "Ruolo", chiave: indiceRuoloDi, iniziale: "asc" };
const COLONNA_OVERALL = { id: "overall", etichetta: "Overall", chiave: "overall", iniziale: "desc" };

/**
 * Le sei colonne delle mediane con la sola variante del ruolo: sigle
 * prese dal glossario, mai unite come "VEL/TUF".
 * @param {string} ruolo  P dà la variante da portiere, ogni altro ruolo la base
 */
function colonneMediane(ruolo) {
  return etichettePerRuolo(ruolo).map((e) => ({ id: e.chiave, etichetta: e.sigla, chiave: e.chiave, iniziale: "desc" }));
}

/** Colonne dei portieri: nessuna colonna Ruolo, sono tutti P. */
export function colonnePortieri(collegato = false) {
  return [COLONNA_NOME, COLONNA_OVERALL, ...colonneMediane("P")];
}

/** Colonne dei ruoli di movimento: con la colonna Ruolo. */
export function colonneMovimento(collegato = false) {
  return [COLONNA_NOME, COLONNA_RUOLO, COLONNA_OVERALL, ...colonneMediane(ORDINE_RUOLI[1])];
}

/** Spareggi ufficiali: overall esatto, poi nome. */
const SPAREGGI_UFFICIALI = [
  { chiave: "overall", direzione: "desc" },
  { chiave: "name", direzione: "asc" },
];

/** L'ordine iniziale dei portieri: overall esatto decrescente, poi nome. */
export const INIZIALE_PORTIERI = SPAREGGI_UFFICIALI;

/** L'ordine iniziale dei movimento: ruolo, poi nome, poi overall esatto. */
export const INIZIALE_MOVIMENTO = [
  { chiave: indiceRuoloDi, direzione: "asc" },
  { chiave: "name", direzione: "asc" },
  { chiave: "overall", direzione: "desc" },
];

/** Le righe di una tabella: l'ordinamento attivo, oppure quello iniziale. */
function ordinaTabella(righe, stato, iniziale) {
  if (!stato) return ordinaPerCriteri(righe, iniziale);
  return ordinaRighe(righe, { chiave: stato.chiave, direzione: stato.direzione, spareggi: SPAREGGI_UFFICIALI });
}

/**
 * Le due tabelle dopo i filtri, ognuna col suo ordinamento. In `stati`
 * lo stato di ciascuna tabella ({portieri, movimento}); null significa
 * ordine iniziale e nessuna colonna attiva. Una tabella senza righe non
 * si vede, e se sono vuote tutte e due serve il messaggio.
 * @param {GiocatoreElenco[]} giocatori
 * @param {import("../lists.js").FiltroElenco} [filtro]
 * @param {{portieri?: object|null, movimento?: object|null}} [stati]
 */
export function tabelleGiocatori(giocatori, filtro = {}, stati = {}) {
  const divise = separaPortieri(filterPlayers(giocatori, filtro));
  const portieri = ordinaTabella(divise.portieri, stati.portieri, INIZIALE_PORTIERI);
  const movimento = ordinaTabella(divise.movimento, stati.movimento, INIZIALE_MOVIMENTO);
  return {
    portieri,
    movimento,
    mostraPortieri: portieri.length > 0,
    mostraMovimento: movimento.length > 0,
    nessuna: portieri.length === 0 && movimento.length === 0,
  };
}

function intestazione(colonna, stato, alToccare) {
  const attiva = !!stato && stato.id === colonna.id;
  const bottone = el("button", {
    className: attiva ? "th-ordina th-attiva" : "th-ordina",
    attrs: { type: "button", "aria-label": `Ordina per ${colonna.etichetta}` },
    children: [
      el("span", { text: colonna.etichetta }),
      el("span", {
        className: "th-freccia",
        text: attiva ? (stato.direzione === "asc" ? "▲" : "▼") : "↕",
        attrs: { "aria-hidden": "true" },
      }),
    ],
    on: { click: () => alToccare(colonna) },
  });
  return el("th", { attrs: { scope: "col", "aria-sort": ariaSort(attiva, stato ? stato.direzione : null) }, children: [bottone] });
}

/** Percentuali per cui esiste una classe barra in styles.css (pesi reali di PESI). */
const PESI_CLASSI = [0, 5, 10, 15, 20, 25, 30, 35, 40];

function classePeso(peso) {
  const quota = Math.round(Number(peso) * 100);
  const vicino = PESI_CLASSI.reduce((a, b) => (Math.abs(b - quota) < Math.abs(a - quota) ? b : a), 0);
  return `peso-${vicino}`;
}

/** Una cella del popup: sigla e per cento con la barra; "—" se l'attributo pesa zero. */
function cellaPeso(etichetta, peso) {
  const quota = Math.round(Number(peso) * 100);
  const nome = `${etichetta.sigla} ${etichetta.significato}`;
  if (quota === 0) {
    return el("td", { className: "peso-cella peso-zero", text: "—", attrs: { "aria-label": `${nome}: nessun peso` } });
  }
  return el("td", {
    className: "peso-cella",
    attrs: { "aria-label": `${nome}: ${quota} per cento`, title: nome },
    children: [
      el("span", {
        className: "peso-valore",
        children: [el("span", { className: "peso-sigla", text: etichetta.sigla }), el("span", { className: "peso-quota", text: `${quota}%` })],
      }),
      el("span", {
        className: "peso-traccia",
        children: [el("span", { className: `peso-barra ${classePeso(peso)}`, attrs: { "aria-hidden": "true" } })],
      }),
    ],
  });
}

/** Il popup "Come si calcola l'overall": una riga per ruolo, sei celle di pesi. */
function dialogoPesi() {
  const righe = ORDINE_RUOLI.map((ruolo) => {
    const etichette = etichettePerRuolo(ruolo);
    const pesi = PESI[ruolo] || [];
    const etichettaRuolo = ETICHETTE_RUOLI.find((r) => r.value === ruolo);
    return el("tr", {
      children: [
        el("th", { attrs: { scope: "row" }, text: etichettaRuolo ? etichettaRuolo.label : ruolo }),
        ...etichette.map((etichetta, i) => cellaPeso(etichetta, pesi[i] || 0)),
      ],
    });
  });

  const dialogo = el("dialog", {
    className: "dialogo-pesi",
    attrs: { "aria-label": "Come si calcola l'overall" },
    children: [
      el("h3", { className: "dialogo-titolo", text: "Come si calcola l'overall" }),
      el("p", {
        className: "nota",
        text:
          "L'overall è la media dei sei valori (le mediane ricevute, o i voti che hai assegnato) pesata per il ruolo:" +
          " ogni attributo conta quanto pesa qui sotto. Un peso dello 0% non entra nel calcolo e il risultato finale" +
          " è arrotondato per eccesso. Chi ha un ruolo non riconosciuto resta con la media semplice dei sei valori.",
      }),
      el("div", {
        className: "pesi-scorre",
        children: [
          el("table", {
            className: "pesi-tabella",
            attrs: { "aria-label": "Peso di ogni attributo per ruolo" },
            children: [el("tbody", { children: righe })],
          }),
        ],
      }),
      el("p", {
        className: "nota",
        text:
          "I portieri usano le stesse sei posizioni con il nome da portiere: TUF, PRE, RIN, RIF, REA e PIA" +
          " al posto di VEL, TIR, PASS, DRI, DIF e FIS.",
      }),
      el("div", {
        className: "dialogo-azione",
        children: [el("button", { className: "pulsante", text: "Chiudi", attrs: { type: "button" }, on: { click: () => dialogo.close() } })],
      }),
    ],
  });

  dialogo.addEventListener("close", () => dialogo.remove());
  // Click sullo sfondo fuori dal riquadro: chiude. Dentro il riquadro no.
  dialogo.addEventListener("click", (evento) => {
    if (evento.target !== dialogo) return;
    const r = dialogo.getBoundingClientRect();
    const dentro =
      evento.clientX >= r.left && evento.clientX <= r.right && evento.clientY >= r.top && evento.clientY <= r.bottom;
    if (!dentro) dialogo.close();
  });
  return dialogo;
}

export async function renderGiocatori(root, ctx, rotta = {}) {
  const me = ctx.me();
  const gestione = !!me && me.isAdmin === true;

  if (gestione && rotta.sotto === "nuovo") {
    await renderEditorGiocatore(root, ctx, {
      playerId: null,
      indietro: indietroA(ctx),
      allaFine: (messaggio) => {
        lasciaAvviso(messaggio);
        ctx.navigate(indietroA(ctx));
      },
    });
    return;
  }
  if (gestione && typeof rotta.modificaId === "string" && rotta.modificaId !== "") {
    await renderEditorGiocatore(root, ctx, {
      playerId: rotta.modificaId,
      indietro: indietroA(ctx),
      allaFine: (messaggio) => {
        lasciaAvviso(messaggio);
        ctx.navigate(indietroA(ctx));
      },
    });
    return;
  }

  clear(root);
  root.append(titolo("Giocatori"));
  root.append(scheletro(8));

  let giocatori;
  let votiMiei = [];

  try {
    giocatori = (await api.players()).players || [];
  } catch (erroreApi) {
    clear(root);
    root.append(titolo("Giocatori"));
    root.append(errore("Non riesco a caricare i dati", () => renderGiocatori(root, ctx, rotta)));
    return;
  }

  if (ctx.collegato()) {
    try {
      votiMiei = (await api.myVotes()).votes || [];
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
    }
  }

  const mioIndice = votiPerTarget(votiMiei);
  // Il "mio voto" per riga serve alle celle doppie "mediana / mio".
  // Niente voti, niente valori.
  const righe = (giocatori || []).map((g) => {
    const mio = mioIndice.get(g.id);
    return {
      ...g,
      mioVoto: mio || null,
    };
  });

  const filtro = { role: "", soloDaVotare: false };
  const memoriaPortieri = memoriaOrdinamento("giocatori-portieri", location.pathname, null);
  const memoriaMovimento = memoriaOrdinamento("giocatori-movimento", location.pathname, null);
  const contenitore = el("div");
  // Legenda della cella doppia: c'è solo con l'accesso, sparisce da ospite.
  const istruzione = el("p", {
    className: "nota",
    attrs: { role: "status" },
    text: "A sinistra il voto mediana, a destra il voto che hai assegnato (— se non lo hai assegnato).",
  });
  const notaRossi = el("p", {
    className: "nota nota-rossi",
    text: "Voti in rosso: sei stato troppo severo. Se sono tanti nella stessa colonna, rileggi cosa valuta quell'attributo e correggi i tuoi voti.",
  });
  const legenda = el("div", { children: [istruzione, notaRossi] });

  // Legenda dell'overall con il tasto "i": resta visibile anche agli ospiti.
  // Con il popup aperto la pagina sotto non scorre (classe su html e body).
  let dialogoAperto = null;
  function apriPesi() {
    if (dialogoAperto) dialogoAperto.close();
    const dialogo = dialogoPesi();
    dialogoAperto = dialogo;
    dialogo.addEventListener("close", () => {
      document.documentElement.classList.remove("popup-aperto");
      document.body.classList.remove("popup-aperto");
      if (dialogoAperto === dialogo) dialogoAperto = null;
    });
    document.documentElement.classList.add("popup-aperto");
    document.body.classList.add("popup-aperto");
    document.body.append(dialogo);
    dialogo.showModal();
  }
  const notaOverall = el("p", {
    className: "nota",
    children: [
      el("span", { text: "L'overall è la media dei sei valori pesata per il ruolo." }),
      el("button", {
        className: "tasto-info",
        text: "i",
        attrs: { type: "button", "aria-haspopup": "dialog", "aria-label": "Come si calcola l'overall" },
        on: { click: apriPesi },
      }),
    ],
  });

  const ruoli = rolesOf(giocatori);
  const selezioneRuolo = el("select", {
    className: "selezione",
    attrs: { "aria-label": "Filtra per ruolo" },
    children: [
      el("option", { text: "Tutti i ruoli", attrs: { value: "" } }),
      ...ruoli.map((r) => el("option", { text: r, attrs: { value: r } })),
    ],
    on: { change: (e) => { filtro.role = e.target.value; disegna(); } },
  });

  const daVotare = el("input", {
    attrs: { type: "checkbox", id: "filtro-da-votare" },
    on: {
      change: (e) => {
        filtro.soloDaVotare = e.target.checked;
        disegna();
      },
    },
  });

  const filtri = el("div", {
    className: "filtri",
    children: [selezioneRuolo],
  });

  if (ctx.collegato()) {
    filtri.append(
      el("label", { className: "interruttore", attrs: { for: "filtro-da-votare" }, children: [daVotare, el("span", { text: "Da votare" })] }),
    );
  }

  /** Una riga cliccabile verso la scheda, costruita sulle colonne date. */
  function rigaTabella(giocatore, colonne, collegato, io) {
    const bandierina = bandiera(giocatore.flag);
    const indirizzo = withSeason(`/giocatori/${encodeURIComponent(giocatore.id)}`, ctx.stagione());
    const nome = el("a", {
      className: "tabella-nome tabella-nome-corto",
      attrs: { href: indirizzo, title: giocatore.name, "aria-label": giocatore.name },
      text: troncaNome(giocatore.name),
    });
    linkInterno(nome, ctx.navigate);
    const mio = giocatore.mioVoto || {};
    const mioDi = (chiave) => (mio[chiave] === null || mio[chiave] === undefined ? null : mio[chiave]);
    const overallUp = testoOverallUp(giocatore.overallUp);
    const mioUp = typeof mio.myOverallUp === "number" ? mio.myOverallUp : null;
    // La propria riga non ha il doppio valore: non ci si può votare da soli.
    const propria = io !== null && giocatore.id === io;
    const etichettaOverall = collegato && !propria
      ? `Overall ricevuto ${overallUp}, il mio ${mioUp === null ? "non assegnato" : mioUp}`
      : `Overall ricevuto ${overallUp}`;

    // Solo chi vota vede il confronto: il mio voto di almeno
    // 8 punti sotto la mediana colora di rosso la cella.
    const basso = (mediana, mioVoto) => collegato && !propria && votoBasso(mediana, mioVoto);
    const celle = colonne.map((colonna) => {
      if (colonna.id === "nome") return el("th", { attrs: { scope: "row" }, children: [bandierina, nome] });
      if (colonna.id === "ruolo") return el("td", { children: [el("span", { className: "pill", text: giocatore.role })] });
      if (colonna.id === "overall") {
        return el("td", {
          className: basso(giocatore.overallUp, mioUp) ? "tabella-numero tabella-doppio tabella-basso" : "tabella-numero tabella-doppio",
          children: [el("span", { className: "overall-pill", children: nodoCella(overallUp, mioUp, collegato, propria) })],
          attrs: { "aria-label": etichettaOverall },
        });
      }
      return el("td", {
        className: basso(giocatore[colonna.chiave], mioDi(colonna.chiave))
          ? "tabella-numero tabella-doppio tabella-basso"
          : "tabella-numero tabella-doppio",
        children: nodoCella(testoMediana(giocatore[colonna.chiave]), mioDi(colonna.chiave), collegato, propria),
      });
    });

    return el("tr", {
      className: "riga-link",
      on: {
        click: (evento) => {
          const bersaglio = evento.target;
          if (bersaglio && bersaglio.closest && bersaglio.closest("a,button")) return;
          ctx.navigate(indirizzo);
        },
      },
      children: celle,
    });
  }

  /** Titolo e tabella scorrevole di una sezione, col suo ordinamento. */
  function sezioneTabella({ testo, descrizione, colonne, righe, stato, memoria, collegato, io }) {
    const corpo = el("tbody");
    for (const giocatore of righe) corpo.append(rigaTabella(giocatore, colonne, collegato, io));

    // La colonna attiva ha lo sfondo evidenziato.
    const indiceAttiva = stato ? colonne.findIndex((c) => c.id === stato.id) : -1;
    if (indiceAttiva >= 0) {
      for (const tr of corpo.children) {
        const cella = tr.children[indiceAttiva + 1];
        if (cella) cella.classList.add("colonna-attiva");
      }
    }

    return [
      el("h3", { className: "titolo-tabella", text: testo }),
      el("div", {
        className: "tabella-scorre",
        attrs: { tabindex: "0", role: "region", "aria-label": `${testo}: tabella scorrevole` },
        children: [
          el("table", {
            className: "tabella",
            attrs: { "aria-label": descrizione },
            children: [
              el("thead", {
                children: [
                  el("tr", {
                    children: colonne.map((c) => intestazione(c, stato, (colonna) => {
                      memoria.ordinamento = prossimoStatoTabella(stato, colonna);
                      disegna();
                    })),
                  }),
                ],
              }),
              corpo,
            ],
          }),
        ],
      }),
    ];
  }

  function disegna() {
    const collegato = ctx.collegato();
    const votati = new Set(mioIndice.keys());
    const io = collegato && ctx.me() ? ctx.me().id : null;

    const tabelle = tabelleGiocatori(
      righe,
      { role: filtro.role, votati: filtro.soloDaVotare ? votati : null, io },
      { portieri: memoriaPortieri.ordinamento, movimento: memoriaMovimento.ordinamento },
    );

    legenda.hidden = !collegato;
    clear(contenitore);

    if (tabelle.nessuna) {
      contenitore.append(el("p", { className: "nota", text: "Nessun giocatore con questi filtri." }));
      return;
    }

    if (tabelle.mostraPortieri) {
      for (const nodo of sezioneTabella({
        testo: "Portieri",
        descrizione: "Portieri: overall per eccesso e mediane dei voti ricevuti.",
        colonne: colonnePortieri(collegato),
        righe: tabelle.portieri,
        stato: memoriaPortieri.ordinamento,
        memoria: memoriaPortieri,
        collegato,
        io,
      })) contenitore.append(nodo);
    }

    if (tabelle.mostraMovimento) {
      for (const nodo of sezioneTabella({
        testo: "Giocatori di movimento",
        descrizione: "Giocatori di movimento: ruolo, overall per eccesso e mediane dei voti ricevuti.",
        colonne: colonneMovimento(collegato),
        righe: tabelle.movimento,
        stato: memoriaMovimento.ordinamento,
        memoria: memoriaMovimento,
        collegato,
        io,
      })) contenitore.append(nodo);
    }
  }

  clear(root);
  root.append(titolo("Giocatori"));
  const avviso = prendiAvviso();
  if (avviso) root.append(el("p", { className: "nota-ok", text: avviso, attrs: { role: "status" } }));
  if (gestione) {
    root.append(
      el("button", {
        className: "pulsante pulsante-grande tasto-gestione-separato",
        text: "Nuovo giocatore",
        attrs: { type: "button" },
        on: { click: () => ctx.navigate("/giocatori/nuovo") },
      }),
    );
  }
  root.append(filtri);
  root.append(notaOverall);
  root.append(legenda);
  root.append(contenitore);
  disegna();
}
