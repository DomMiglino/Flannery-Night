// Passo 4: giocatori in due tabelle ordinabili, una per i portieri e una
// per i ruoli di movimento. Restano il filtro per ruolo e, con l'accesso,
// la spunta "Da votare". Si ordina toccando l'intestazione e ogni tabella
// ha il suo ordinamento. Senza accesso le celle delle mediane mostrano
// solo il valore ricevuto.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { filterPlayers, rolesOf, separaPortieri } from "../lists.js";
import { etichettePerRuolo, votiPerTarget } from "../ratings.js";
import {
  ariaSort,
  memoriaOrdinamento,
  ordinaPerCriteri,
  ordinaRighe,
  prossimoStatoTabella,
  statoVisibile,
} from "../ordina.js";
import { withSeason } from "../routes.js";
import { bandiera, errore, scheletro, titolo } from "../ui.js";
import { troncaNome } from "./classifica.js";
import { lasciaAvviso, prendiAvviso } from "../state.js";
import { renderEditorGiocatore } from "./editor_giocatore.js";

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
const COLONNA_MIO = { id: "mio", etichetta: "Mio", chiave: "mioEsatto", iniziale: "desc" };

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
  const colonne = [COLONNA_NOME, COLONNA_OVERALL, ...colonneMediane("P")];
  if (collegato) colonne.push(COLONNA_MIO);
  return colonne;
}

/** Colonne dei ruoli di movimento: con la colonna Ruolo. */
export function colonneMovimento(collegato = false) {
  const colonne = [COLONNA_NOME, COLONNA_RUOLO, COLONNA_OVERALL, ...colonneMediane(ORDINE_RUOLI[1])];
  if (collegato) colonne.push(COLONNA_MIO);
  return colonne;
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
  // Il "mio overall" per riga: quello esatto per ordinare la colonna
  // Mio, quello per eccesso per mostrarlo. Niente voti, niente valori.
  const righe = (giocatori || []).map((g) => {
    const mio = mioIndice.get(g.id);
    return {
      ...g,
      mioVoto: mio || null,
      mioEsatto: mio && typeof mio.myOverall === "number" ? mio.myOverall : null,
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

    const celle = colonne.map((colonna) => {
      if (colonna.id === "nome") return el("th", { attrs: { scope: "row" }, children: [bandierina, nome] });
      if (colonna.id === "ruolo") return el("td", { children: [el("span", { className: "pill", text: giocatore.role })] });
      if (colonna.id === "mio") {
        return el("td", {
          className: "tabella-numero tabella-mio",
          text: mioUp === null ? "—" : String(mioUp),
          attrs: {
            "aria-label": mioUp === null ? "Non hai ancora votato questo giocatore" : `Il mio overall è ${mioUp}`,
          },
        });
      }
      if (colonna.id === "overall") {
        return el("td", {
          className: "tabella-numero tabella-doppio",
          children: [el("span", { className: "overall-pill", text: testoCella(overallUp, mioUp, collegato, propria) })],
          attrs: { "aria-label": etichettaOverall },
        });
      }
      return el("td", {
        className: "tabella-numero tabella-doppio",
        text: testoCella(testoMediana(giocatore[colonna.chiave]), mioDi(colonna.chiave), collegato, propria),
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

    // Se la colonna attiva non c'è più (per esempio "Mio" senza accesso),
    // la tabella torna al suo ordine iniziale.
    memoriaPortieri.ordinamento = statoVisibile(memoriaPortieri.ordinamento, colonnePortieri(collegato));
    memoriaMovimento.ordinamento = statoVisibile(memoriaMovimento.ordinamento, colonneMovimento(collegato));

    const tabelle = tabelleGiocatori(
      righe,
      { role: filtro.role, votati: filtro.soloDaVotare ? votati : null, io },
      { portieri: memoriaPortieri.ordinamento, movimento: memoriaMovimento.ordinamento },
    );

    istruzione.hidden = !collegato;
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
  root.append(istruzione);
  root.append(contenitore);
  disegna();
}
