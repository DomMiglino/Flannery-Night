// Passo 4: elenco dei giocatori. Si ordina per overall o per nome, si
// cerca per nome, si filtra per ruolo e, con l'accesso, si può scegliere
// solo chi non si è ancora votato. Con l'accesso accanto all'overall
// ricevuto compare anche il mio overall.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { formatOverall, formatNumber } from "../format.js";
import { filterPlayers, rolesOf, sortPlayers } from "../lists.js";
import { myOverall, votiPerTarget } from "../ratings.js";
import { withSeason } from "../routes.js";
import { bandiera, errore, forma, scheletro, titolo } from "../ui.js";

export async function renderGiocatori(root, ctx) {
  clear(root);
  root.append(titolo("Giocatori"));
  root.append(scheletro(8));

  let giocatori;
  let votiMiei = [];
  let frecce = new Map();

  try {
    giocatori = (await api.players()).players || [];
  } catch (erroreApi) {
    clear(root);
    root.append(titolo("Giocatori"));
    root.append(errore("Non riesco a caricare i dati", () => renderGiocatori(root, ctx)));
    return;
  }

  try {
    // La freccia di forma arriva dalla classifica pubblica e si vede
    // anche senza accesso.
    const classifica = await api.ranking(ctx.stagione());
    frecce = new Map((classifica.rows || []).map((r) => [r.id, r.formaArrow]));
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) ctx.sessioneScaduta();
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
  const elenco = el("ul", { className: "elenco" });
  contenitore.append(elenco);

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
    const votati = new Set(mioIndice.keys());
    let elencoGiocatori = filterPlayers(giocatori, {
      query: filtro.query,
      role: filtro.role,
      votati: filtro.soloDaVotare ? votati : null,
    });
    elencoGiocatori = sortPlayers(elencoGiocatori, filtro.ordine);

    contatore.textContent = `${elencoGiocatori.length} di ${giocatori.length} giocatori`;
    clear(elenco);

    if (elencoGiocatori.length === 0) {
      elenco.append(el("li", { className: "nota", text: "Nessun giocatore corrisponde ai filtri." }));
      return;
    }

    for (const giocatore of elencoGiocatori) {
      const bandierina = bandiera(giocatore.flag);
      const freccia = frecce.get(giocatore.id);
      const mio = mioIndice.get(giocatore.id);
      const mioValue = ctx.collegato() ? myOverall(giocatore.role, mio) : null;

      const numeri = el("span", { className: "voce-numeri" });
      if (freccia) numeri.append(forma(freccia));
      numeri.append(el("span", { className: "punteggio", text: formatOverall(giocatore.overall), attrs: { "aria-label": `Overall ricevuto ${formatOverall(giocatore.overall)}` } }));
      if (ctx.collegato()) {
        numeri.append(
          el("span", {
            className: "punteggio-mio",
            text: mioValue === null ? "mio —" : `mio ${formatNumber(mioValue, 1)}`,
            attrs: { "aria-label": mioValue === null ? "Non hai ancora votato questo giocatore" : `Il mio overall è ${formatNumber(mioValue, 1)}` },
          }),
        );
      }

      const link = el("a", {
        className: "voce voce-giocatori",
        attrs: { href: withSeason(`/giocatori/${encodeURIComponent(giocatore.id)}`, ctx.stagione()) },
        children: [
          bandierina,
          el("span", {
            className: "voce-testa",
            children: [
              el("span", { className: "voce-nome", text: giocatore.name }),
              el("span", { className: "voce-sottotitolo", text: giocatore.role }),
            ],
          }),
          numeri,
        ],
      });
      linkInterno(link, ctx.navigate);
      elenco.append(el("li", { children: [link] }));
    }
  }

  clear(root);
  root.append(titolo("Giocatori"));
  root.append(filtri);
  root.append(contatore);
  root.append(contenitore);
  disegna();
}