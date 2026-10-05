// Passo 4: giocatori come tabella ordinabile. Restano il filtro per ruolo
// e, con l'accesso, la spunta "Da votare". Si ordina toccando
// l'intestazione; l'ordinamento usa i valori esatti.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { filterPlayers, rolesOf } from "../lists.js";
import { votiPerTarget } from "../ratings.js";
import { ariaSort, memoriaOrdinamento, ordinaRighe, prossimoStato } from "../ordina.js";
import { withSeason } from "../routes.js";
import { bandiera, errore, scheletro, titolo } from "../ui.js";

/** Mediana come arriva dall'API (può avere un decimale); "—" senza voti. */
function testoMediana(valore) {
  if (valore === null || valore === undefined) return "—";
  return Number.isInteger(valore) ? String(valore) : String(valore).replace(".", ",");
}

/** Overall per eccesso già calcolato dal server; "—" senza voti. */
function testoOverallUp(valore) {
  return valore === null || valore === undefined ? "—" : String(valore);
}

/** Una cella numerica: il trattino se il valore manca, tono attenuato se zero. */
function cellaNumero(testo, zero = false) {
  return el("td", { className: zero ? "tabella-numero tabella-zero" : "tabella-numero", text: testo });
}

/** Ruoli in ordine fisso: prima i portieri, poi la difesa e l'attacco. */
const ORDINE_RUOLI = ["P", "DC", "DL", "CC", "CL", "PC"];

function indiceRuolo(ruolo) {
  const i = ORDINE_RUOLI.indexOf(ruolo);
  return i < 0 ? ORDINE_RUOLI.length : i;
}

const COLONNE = [
  { id: "nome", etichetta: "Giocatore", chiave: "name", iniziale: "asc" },
  { id: "ruolo", etichetta: "Ruolo", chiave: indiceRuoloDi, iniziale: "asc" },
  { id: "overall", etichetta: "Overall", chiave: "overall", iniziale: "desc" },
  { id: "vel", etichetta: "VEL/TUF", chiave: "velTuf", iniziale: "desc" },
  { id: "tir", etichetta: "TIR/PRE", chiave: "tirPre", iniziale: "desc" },
  { id: "pass", etichetta: "PASS/RIN", chiave: "passRin", iniziale: "desc" },
  { id: "dri", etichetta: "DRI/RIF", chiave: "driRif", iniziale: "desc" },
  { id: "dif", etichetta: "DIF/REA", chiave: "difRea", iniziale: "desc" },
  { id: "fis", etichetta: "FIS/PIA", chiave: "fisPia", iniziale: "desc" },
  { id: "mio", etichetta: "Mio", chiave: "mioEsatto", iniziale: "desc", soloCollegato: true },
];

function indiceRuoloDi(giocatore) {
  return indiceRuolo(giocatore ? giocatore.role : "");
}

/** Spareggi ufficiali: overall esatto, poi nome. */
const SPAREGGI_UFFICIALI = [
  { chiave: "overall", direzione: "desc" },
  { chiave: "name", direzione: "asc" },
];

const INIZIALE = { id: "overall", chiave: "overall", direzione: "desc" };

function intestazione(colonna, stato, alToccare) {
  const attiva = stato.id === colonna.id;
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
  return el("th", { attrs: { scope: "col", "aria-sort": ariaSort(attiva, stato.direzione) }, children: [bottone] });
}

export async function renderGiocatori(root, ctx) {
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
    root.append(errore("Non riesco a caricare i dati", () => renderGiocatori(root, ctx)));
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
  // Il "mio overall" per riga: quello esatto per ordinare, quello per
  // eccesso per mostrare. Niente voti, niente valori.
  const righe = (giocatori || []).map((g) => {
    const mio = mioIndice.get(g.id);
    const esatto = mio && typeof mio.myOverall === "number" ? mio.myOverall : null;
    const eccesso = mio && typeof mio.myOverallUp === "number" ? mio.myOverallUp : null;
    return { ...g, mioEsatto: esatto, mioUp: eccesso };
  });

  const filtro = { role: "", soloDaVotare: false };
  const memoria = memoriaOrdinamento("giocatori", location.pathname, INIZIALE);
  const contenitore = el("div");

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

  const contatore = el("p", { className: "nota", attrs: { role: "status" } });

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

  function colonneVisibili() {
    const collegato = ctx.collegato();
    return COLONNE.filter((c) => !c.soloCollegato || collegato);
  }

  function disegna() {
    const collegato = ctx.collegato();
    const votati = new Set(mioIndice.keys());
    const io = collegato && ctx.me() ? ctx.me().id : null;
    const filtrate = filterPlayers(righe, {
      role: filtro.role,
      votati: filtro.soloDaVotare ? votati : null,
      io,
    });

    let stato = memoria.ordinamento;
    // Se la colonna attiva non c'è più (es. "Mio" senza accesso),
    // si torna all'ordinamento iniziale.
    if (!colonneVisibili().some((c) => c.id === stato.id)) {
      stato = { ...INIZIALE };
      memoria.ordinamento = stato;
    }
    const elenco = ordinaRighe(filtrate, { chiave: stato.chiave, direzione: stato.direzione, spareggi: SPAREGGI_UFFICIALI });

    contatore.textContent = `${elenco.length} di ${righe.length} giocatori`;
    clear(contenitore);

    if (elenco.length === 0) {
      contenitore.append(el("p", { className: "nota", text: "Nessun giocatore con questi filtri." }));
      return;
    }

    const visibili = colonneVisibili();
    const testa = el("tr", {
      children: visibili.map((c) => intestazione(c, stato, (colonna) => {
        memoria.ordinamento = prossimoStato(stato, colonna);
        disegna();
      })),
    });
    const corpo = el("tbody");
    for (const giocatore of elenco) {
      const bandierina = bandiera(giocatore.flag);
      const nome = el("a", {
        className: "tabella-nome",
        attrs: { href: withSeason(`/giocatori/${encodeURIComponent(giocatore.id)}`, ctx.stagione()) },
        text: giocatore.name,
      });
      linkInterno(nome, ctx.navigate);
      const celle = [
        el("th", { attrs: { scope: "row" }, children: [bandierina, nome] }),
        el("td", { children: [el("span", { className: "pill", text: giocatore.role })] }),
        el("td", {
          className: "tabella-numero",
          children: [el("span", { className: "overall-pill", text: testoOverallUp(giocatore.overallUp) })],
          attrs: { "aria-label": `Overall ricevuto ${testoOverallUp(giocatore.overallUp)}` },
        }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.velTuf) }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.tirPre) }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.passRin) }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.driRif) }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.difRea) }),
        el("td", { className: "tabella-numero", text: testoMediana(giocatore.fisPia) }),
      ];
      if (collegato) {
        const mioUp = giocatore.mioUp;
        celle.push(
          el("td", {
            className: "tabella-numero tabella-mio",
            text: mioUp === null || mioUp === undefined ? "—" : String(mioUp),
            attrs: { "aria-label": mioUp === null || mioUp === undefined ? "Non hai ancora votato questo giocatore" : `Il mio overall è ${mioUp}` },
          }),
        );
      }
      corpo.append(el("tr", { children: celle }));
    }

    // La colonna attiva ha lo sfondo evidenziato.
    const indiceAttiva = visibili.findIndex((c) => c.id === stato.id);
    if (indiceAttiva >= 0) {
      for (const tr of corpo.children) {
        const cella = tr.children[indiceAttiva + 1];
        if (cella) cella.classList.add("colonna-attiva");
      }
    }

    contenitore.append(
      el("div", {
        className: "tabella-scorre",
        attrs: { tabindex: "0", role: "region", "aria-label": "Tabella scorrevole" },
        children: [
          el("table", {
            className: "tabella",
            children: [
              el("caption", { className: "tabella-descrizione", text: "Giocatori: ruolo, overall per eccesso e mediane dei voti ricevuti." }),
              el("thead", {
                children: [
                  el("tr", {
                    children: visibili.map((c) => intestazione(c, stato, (colonna) => {
                      memoria.ordinamento = prossimoStato(stato, colonna);
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
    );
  }

  clear(root);
  root.append(titolo("Giocatori"));
  root.append(filtri);
  root.append(contatore);
  root.append(contenitore);
  disegna();
}
