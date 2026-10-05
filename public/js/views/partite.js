// Passo 4: partite. Elenco per data decrescente con il selettore di
// stagione nell'intestazione; ogni partita mostra il risultato, i
// giocatori per squadra e la Guidinha.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { formatShortDate } from "../format.js";
import { guidinhaLinea, matchHeadline, sortTeamPlayers } from "../matches.js";
import { errore, scheletro, titolo } from "../ui.js";

export async function renderPartite(root, ctx) {
  clear(root);
  root.append(titolo("Partite"));
  root.append(scheletro(5));

  try {
    const risposta = await api.matches(ctx.stagione());
    clear(root);
    root.append(titolo("Partite"));
    root.append(el("p", { className: "nota", text: `${risposta.season.name} · ${risposta.matches.length} partite` }));

    if (risposta.matches.length === 0) {
      root.append(el("p", { className: "nota", text: "Non risultano ancora partite pubblicate." }));
      return;
    }

    for (const partita of risposta.matches) {
      root.append(rigaPartita(partita));
    }
  } catch (erroreApi) {
    clear(root);
    root.append(titolo("Partite"));
    root.append(errore("Non riesco a caricare i dati", () => renderPartite(root, ctx)));
  }
}

function rigaPartita(partita) {
  const blocco = el("article", { className: "partita" });
  blocco.append(el("p", { className: "partita-data", text: formatShortDate(partita.date) }));
  blocco.append(el("h3", { className: "partita-risultato", text: matchHeadline(partita.teams) }));

  for (const squadra of partita.teams) {
    const lista = el("ul", { className: "squadra-elenco" });
    for (const giocatore of sortTeamPlayers(squadra.players)) {
      lista.append(
        el("li", {
          className: "squadra-giocatore",
          children: [
            el("span", { className: "squadra-gol", text: String(giocatore.goals), attrs: { "aria-label": `${giocatore.goals} gol` } }),
            el("span", { className: "voce-nome", text: giocatore.name }),
            giocatore.ownGoals > 0 ? el("span", { className: "voce-sottotitolo", text: `${giocatore.ownGoals} AG` }) : null,
            giocatore.mvp ? el("span", { className: "badge-mvp", text: "MVP" }) : null,
          ],
        }),
      );
    }
    blocco.append(
      el("div", { className: "squadra", children: [el("p", { className: "squadra-nome", text: squadra.team }), lista] }),
    );
  }

  const guidinha = guidinhaLinea(partita.guidinha);
  if (guidinha) {
    blocco.append(
      el("p", {
        className: "guidinha",
        children: [
          document.createTextNode("Guidinha: "),
          el("span", { className: "guidinha-nome", text: guidinha.nome }),
          guidinha.testo ? document.createTextNode(` — ${guidinha.testo}`) : null,
        ],
      }),
    );
  }

  return blocco;
}