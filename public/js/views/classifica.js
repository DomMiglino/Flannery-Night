// Passo 4: classifica. Lista compatta: posizione, bandiera, nome,
// Flannery Power Score, freccia di forma e giocate. Toccando la riga
// si apre la scheda del giocatore, che ha tutte le altre cifre.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { formatNumber } from "../format.js";
import { withAppearances } from "../lists.js";
import { bandiera, errore, forma, scheletro, titolo } from "../ui.js";
import { withSeason } from "../routes.js";

/**
 * Rendimento in una sola riga di testo: "V*" diventa "V★".
 * L'ordine è quello dell'API (ultime cinque partite).
 */
export function testoRendimento(lista) {
  return (Array.isArray(lista) ? lista : []).map((e) => String(e ?? "").replace("*", "★")).join(" ");
}

/** Una cella numerica: il trattino se il valore manca. */
function cellaNumero(testo) {
  return el("td", { className: "tabella-numero", text: testo });
}

function intero(value) {
  return value === null || value === undefined ? "—" : String(value);
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

    const intestazioni = [
      "Giocatore",
      "Flannery Power Score",
      "Forma",
      "Giocate",
      "Vinte",
      "Pareggiate",
      "Perse",
      "Gol",
      "Media gol",
      "Autogol",
      "Punti",
      "Media punti",
      "MVP",
      "Guidinha",
      "Rendimento",
    ];
    const testa = el("tr", {
      children: intestazioni.map((t) => el("th", { attrs: { scope: "col" }, text: t })),
    });
    const corpo = el("tbody");
    righe.forEach((riga, indice) => {
      const bandierina = bandiera(riga.flag);
      const nome = el("a", {
        className: "tabella-nome",
        attrs: { href: withSeason(`/giocatori/${encodeURIComponent(riga.id)}`, ctx.stagione()) },
        text: riga.name,
      });
      linkInterno(nome, ctx.navigate);
      corpo.append(
        el("tr", {
          children: [
            el("th", {
              attrs: { scope: "row" },
              children: [
                el("span", { className: "posizione", text: String(indice + 1), attrs: { "aria-hidden": "true" } }),
                bandierina,
                nome,
              ],
            }),
            cellaNumero(formatNumber(riga.powerScore, 1)),
            el("td", { children: [forma(riga.formaArrow)] }),
            cellaNumero(intero(riga.played)),
            cellaNumero(intero(riga.V)),
            cellaNumero(intero(riga.P)),
            cellaNumero(intero(riga.S)),
            cellaNumero(intero(riga.goals)),
            cellaNumero(riga.avgGoals === null || riga.avgGoals === undefined ? "—" : formatNumber(riga.avgGoals, 1)),
            cellaNumero(intero(riga.ownGoals)),
            cellaNumero(intero(riga.points)),
            cellaNumero(riga.avgPoints === null || riga.avgPoints === undefined ? "—" : formatNumber(riga.avgPoints, 1)),
            cellaNumero(intero(riga.mvp)),
            cellaNumero(intero(riga.guidinha)),
            el("td", { text: testoRendimento(riga.rendimento), attrs: { "aria-label": "Rendimento ultime cinque, stella = MVP" } }),
          ],
        }),
      );
    });

    const tabella = el("table", {
      className: "tabella",
      children: [
        el("caption", { className: "tabella-descrizione", text: `Classifica ${risposta.season.name}: posizione, punteggio e statistiche di ogni giocatore.` }),
        el("thead", { children: [testa] }),
        corpo,
      ],
    });
    root.append(
      el("div", {
        className: "tabella-scorre",
        attrs: { tabindex: "0", role: "region", "aria-label": "Tabella scorrevole" },
        children: [tabella],
      }),
    );
  } catch (erroreApi) {
    const messaggio = erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati";
    clear(root);
    root.append(titolo("Classifica"));
    root.append(errore(messaggio, () => renderClassifica(root, ctx)));
  }
}
