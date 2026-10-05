// Passo 4: partite. Elenco per data decrescente con il selettore di
// stagione nell'intestazione; ogni partita mostra il risultato, i
// giocatori per squadra e la Guidinha.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { formatShortDate } from "../format.js";
import { etichetteGol, formatoPartita, guidinhaLinea, matchHeadline, sortTeamPlayers } from "../matches.js";
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

/** Risultato con i numeri grandi tra le due squadre; testo unico negli altri casi. */
function titoloRisultato(squadre) {
  const lista = Array.isArray(squadre) ? squadre : [];
  if (lista.length === 2) {
    const [a, b] = lista;
    return el("h3", {
      className: "partita-risultato",
      children: [
        el("span", { className: "partita-squadra", text: a.team }),
        el("span", {
          className: "partita-punteggio",
          text: `${a.score} – ${b.score}`,
          attrs: { "aria-label": `Risultato ${a.score} a ${b.score}` },
        }),
        el("span", { className: "partita-squadra", text: b.team }),
      ],
    });
  }
  return el("h3", { className: "partita-risultato", text: matchHeadline(lista) });
}

function chipGiocatore(giocatore) {
  const chip = el("li", {
    className: "chip-giocatore",
    children: [el("span", { className: "chip-nome", text: giocatore.name })],
  });
  for (const etichetta of etichetteGol(giocatore.goals, giocatore.ownGoals)) {
    chip.append(
      el("span", {
        className: etichetta.autogol ? "pill-autogol" : "pill-gol",
        text: etichetta.testo,
        attrs: { title: etichetta.etichetta, "aria-label": etichetta.etichetta },
      }),
    );
  }
  if (giocatore.mvp) {
    chip.append(el("span", { className: "badge-mvp", text: "★", attrs: { title: "MVP", "aria-label": "MVP" } }));
  }
  return chip;
}

function rigaPartita(partita) {
  const blocco = el("article", { className: "partita" });
  const squadre = Array.isArray(partita.teams) ? partita.teams : [];
  const formato = formatoPartita(squadre);
  blocco.append(
    el("div", {
      className: "partita-testa",
      children: [
        el("span", { className: "partita-data", text: formatShortDate(partita.date) }),
        titoloRisultato(squadre),
        formato ? el("span", { className: "badge-formato", text: formato }) : null,
      ],
    }),
  );

  const griglia = el("div", { className: "squadre" });
  for (const squadra of squadre) {
    const lista = el("ul", { className: "chip-lista", attrs: { "aria-label": `Giocatori ${squadra.team}` } });
    for (const giocatore of sortTeamPlayers(squadra.players)) {
      lista.append(chipGiocatore(giocatore));
    }
    griglia.append(
      el("div", { className: "squadra", children: [el("p", { className: "squadra-nome", text: squadra.team }), lista] }),
    );
  }
  blocco.append(griglia);

  const guidinha = guidinhaLinea(partita.guidinha);
  if (guidinha) {
    blocco.append(
      el("p", {
        className: "guidinha",
        children: [
          el("span", { className: "guidinha-etichetta", text: "Guidinha" }),
          document.createTextNode(" "),
          el("span", { className: "guidinha-nome", text: guidinha.nome }),
          guidinha.testo ? document.createTextNode(` — ${guidinha.testo}`) : null,
        ],
      }),
    );
  }

  return blocco;
}