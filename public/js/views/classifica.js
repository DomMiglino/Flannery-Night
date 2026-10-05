// Passo 4: classifica. Lista compatta: posizione, bandiera, nome,
// Flannery Power Score, freccia di forma e giocate. Toccando la riga
// si apre la scheda del giocatore, che ha tutte le altre cifre.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { formatNumber } from "../format.js";
import { withAppearances } from "../lists.js";
import { bandiera, cella, errore, forma, rendimento, scheletro, titolo } from "../ui.js";
import { withSeason } from "../routes.js";

/**
 * Dati puri della zona aperta di una riga di classifica, da una riga
 * di /api/ranking. V-P-S come "4-2-1", i conteggi come numeri, il
 * rendimento com'è arrivato. I campi mancanti valgono zero.
 */
export function dettaglioRiga(riga) {
  const r = riga || {};
  const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    vps: `${numero(r.V)}-${numero(r.P)}-${numero(r.S)}`,
    giocate: numero(r.played),
    gol: numero(r.goals),
    autogol: numero(r.ownGoals),
    mvp: numero(r.mvp),
    guidinha: numero(r.guidinha),
    rendimento: Array.isArray(r.rendimento) ? r.rendimento.map(String) : [],
  };
}

export async function renderClassifica(root, ctx) {
  clear(root);
  root.append(titolo("Classifica"));
  root.append(scheletro(8));

  try {
    const risposta = await api.ranking(ctx.stagione());
    const righe = withAppearances(risposta.rows);
    clear(root);
    root.append(titolo("Classifica"));
    root.append(el("p", { className: "nota", text: `${risposta.season.name} · ${righe.length} in classifica` }));

    if (righe.length === 0) {
      root.append(el("p", { className: "nota", text: "Non risultano ancora partite pubblicate." }));
      return;
    }

    const elenco = el("ul", { className: "elenco" });
    righe.forEach((riga, indice) => {
      const bandierina = bandiera(riga.flag);
      const dettaglio = dettaglioRiga(riga);
      const idDettaglio = `dettaglio-classifica-${indice}`;

      const zona = el("div", {
        className: "voce-dettaglio",
        attrs: { id: idDettaglio },
        children: [
          el("div", {
            className: "griglia",
            children: [
              cella("V-P-S", dettaglio.vps),
              cella("Giocate", String(dettaglio.giocate)),
              cella("Gol", String(dettaglio.gol)),
              cella("Autogol", String(dettaglio.autogol)),
              cella("MVP", String(dettaglio.mvp)),
              cella("Guidinha", String(dettaglio.guidinha)),
            ],
          }),
          dettaglio.rendimento.length > 0
            ? el("div", {
                children: [
                  el("p", { className: "nota", text: "Ultime cinque · ★ = MVP" }),
                  rendimento(dettaglio.rendimento),
                ],
              })
            : null,
          (() => {
            const link = el("a", {
              className: "voce-link",
              attrs: { href: withSeason(`/giocatori/${encodeURIComponent(riga.id)}`, ctx.stagione()) },
              text: "Vai alla scheda",
            });
            linkInterno(link, ctx.navigate);
            return link;
          })(),
        ],
      });
      zona.hidden = true;

      const pulsante = el("button", {
        className: "voce voce-griglia voce-pulsante",
        attrs: { type: "button", "aria-expanded": "false", "aria-controls": idDettaglio },
        children: [
          el("span", { className: "posizione", text: String(indice + 1), attrs: { "aria-hidden": "true" } }),
          bandierina,
          el("span", {
            className: "voce-testa",
            children: [
              el("span", { className: "voce-nome", text: riga.name }),
              el("span", { className: "voce-sottotitolo", text: `${riga.role} · ${riga.played} ${riga.played === 1 ? "giocata" : "giocate"}` }),
            ],
          }),
          el("span", {
            className: "voce-numeri",
            children: [
              forma(riga.formaArrow),
              el("span", { className: "punteggio", text: formatNumber(riga.powerScore, 1) }),
            ],
          }),
        ],
        on: {
          click: () => {
            const aprire = zona.hidden;
            zona.hidden = !aprire;
            pulsante.setAttribute("aria-expanded", aprire ? "true" : "false");
          },
        },
      });

      elenco.append(el("li", { children: [pulsante, zona] }));
    });
    root.append(elenco);
  } catch (erroreApi) {
    const messaggio = erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati";
    clear(root);
    root.append(titolo("Classifica"));
    root.append(errore(messaggio, () => renderClassifica(root, ctx)));
  }
}
