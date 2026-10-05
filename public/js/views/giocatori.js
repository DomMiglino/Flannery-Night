// Passo 4: elenco dei giocatori. Si ordina per overall o per nome, si
// cerca per nome, si filtra per ruolo e, con l'accesso, si può scegliere
// solo chi non si è ancora votato. Con l'accesso accanto all'overall
// ricevuto compare anche il mio overall.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { filterPlayers, rolesOf, sortPlayers } from "../lists.js";
import { votiPerTarget } from "../ratings.js";
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
  const filtro = { query: "", role: "", soloDaVotare: false, ordine: "overall-desc" };

  const contenitore = el("div");

  const ricerca = el("input", {
    className: "testo",
    attrs: { type: "search", placeholder: "Cerca un nome", "aria-label": "Cerca un nome", autocomplete: "off" },
    on: { input: (e) => { filtro.query = e.target.value; disegna(); } },
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

  const selezioneOrdine = el("select", {
    className: "selezione",
    attrs: { "aria-label": "Ordina l'elenco" },
    children: [
      el("option", { text: "Overall: dal più alto", attrs: { value: "overall-desc" } }),
      el("option", { text: "Overall: dal più basso", attrs: { value: "overall-asc" } }),
      el("option", { text: "Nome", attrs: { value: "nome" } }),
    ],
    on: { change: (e) => { filtro.ordine = e.target.value; disegna(); } },
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
    children: [
      el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Cerca", attrs: { for: "cerca-giocatori" } }), ricerca] }),
      el("div", { className: "filtri-riga", children: [selezioneRuolo, selezioneOrdine] }),
    ],
  });
  ricerca.id = "cerca-giocatori";

  if (ctx.collegato()) {
    filtri.append(
      el("label", { className: "interruttore", attrs: { for: "filtro-da-votare" }, children: [daVotare, el("span", { text: "Da votare" })] }),
    );
  }

  function disegna() {
    const collegato = ctx.collegato();
    const votati = new Set(mioIndice.keys());
    const io = collegato && ctx.me() ? ctx.me().id : null;
    let elencoGiocatori = filterPlayers(giocatori, {
      query: filtro.query,
      role: filtro.role,
      votati: filtro.soloDaVotare ? votati : null,
      io,
    });
    // L'ordinamento usa il valore esatto; quello mostrato è per eccesso.
    elencoGiocatori = sortPlayers(elencoGiocatori, filtro.ordine);

    contatore.textContent = `${elencoGiocatori.length} di ${giocatori.length} giocatori`;
    clear(contenitore);

    if (elencoGiocatori.length === 0) {
      contenitore.append(el("p", { className: "nota", text: "Nessun giocatore corrisponde ai filtri." }));
      return;
    }

    const intestazioni = ["Giocatore", "Ruolo", "Overall", "VEL/TUF", "TIR/PRE", "PASS/RIN", "DRI/RIF", "DIF/REA", "FIS/PIA"];
    if (collegato) intestazioni.push("Mio");
    const corpo = el("tbody");
    for (const giocatore of elencoGiocatori) {
      const bandierina = bandiera(giocatore.flag);
      const nome = el("a", {
        className: "tabella-nome",
        attrs: { href: withSeason(`/giocatori/${encodeURIComponent(giocatore.id)}`, ctx.stagione()) },
        text: giocatore.name,
      });
      linkInterno(nome, ctx.navigate);
      const mio = mioIndice.get(giocatore.id);
      const celle = [
        el("th", { attrs: { scope: "row" }, children: [bandierina, nome] }),
        el("td", { text: giocatore.role }),
        el("td", {
          className: "tabella-numero",
          text: testoOverallUp(giocatore.overallUp),
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
        const mioUp = mio ? mio.myOverallUp : null;
        celle.push(
          el("td", {
            className: "tabella-numero",
            text: testoOverallUp(mioUp),
            attrs: { "aria-label": mioUp === null || mioUp === undefined ? "Non hai ancora votato questo giocatore" : `Il mio overall è ${mioUp}` },
          }),
        );
      }
      corpo.append(el("tr", { children: celle }));
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
                children: [el("tr", { children: intestazioni.map((t) => el("th", { attrs: { scope: "col" }, text: t })) })],
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