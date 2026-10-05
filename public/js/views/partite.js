// Passo 4: partite. Elenco per data decrescente con il selettore di
// stagione nell'intestazione; ogni partita mostra il risultato, i
// giocatori per squadra e la Guidinha.
// Chi ha il permesso vede anche gli strumenti di gestione (stessi della
// pagina, senza cambiarne l'aspetto per gli altri): tasto "Nuova partita"
// in alto e un discreto "Modifica" su ogni scheda della stagione in corso.
// L'editor vive nei sottopercorsi /partite/nuova e /partite/:id/modifica.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { formatShortDate } from "../format.js";
import { etichetteGol, formatoPartita, guidinhaLinea, matchHeadline, sortTeamPlayers } from "../matches.js";
import { lasciaAvviso, prendiAvviso } from "../state.js";
import { errore, nota, scheletro, titolo } from "../ui.js";
import { renderEditorPartita } from "./editor.js";

export async function renderPartite(root, ctx, rotta = {}) {
  const me = ctx.me();
  const gestione = !!me && me.isAdmin === true;

  // Strumenti di gestione solo con il permesso: gli altri vedono sempre
  // l'archivio normale, senza tracce né messaggi.
  if (gestione && rotta.sotto === "nuova") {
    await renderEditorPartita(root, ctx, {
      matchId: null,
      indietro: indietroA(ctx),
      allaFine: (messaggio) => {
        lasciaAvviso(messaggio);
        ctx.navigate(indietroA(ctx));
      },
    });
    return;
  }
  if (gestione && typeof rotta.modificaId === "string" && rotta.modificaId !== "") {
    await renderEditorPartita(root, ctx, {
      matchId: rotta.modificaId,
      indietro: indietroA(ctx),
      allaFine: (messaggio) => {
        lasciaAvviso(messaggio);
        ctx.navigate(indietroA(ctx));
      },
    });
    return;
  }

  clear(root);
  root.append(titolo("Partite"));
  root.append(scheletro(5));

  try {
    const risposta = await api.matches(ctx.stagione());
    let modificabile = false;
    if (gestione) {
      // Le stagioni chiuse restano in sola lettura: niente tasti.
      try {
        const stagioni = await api.seasons();
        const attiva = stagioni.activeId ?? (stagioni.seasons || []).find((s) => s.isActive)?.id ?? null;
        modificabile = attiva !== null && Number(risposta.season.id) === Number(attiva);
      } catch {
        modificabile = false;
      }
    }
    clear(root);
    root.append(titolo("Partite"));
    const avviso = prendiAvviso();
    if (avviso) root.append(el("p", { className: "nota-ok", text: avviso, attrs: { role: "status" } }));
    root.append(el("p", { className: "nota", text: `${risposta.season.name} · ${risposta.matches.length} partite` }));

    if (gestione && modificabile) {
      root.append(
        el("button", {
          className: "pulsante pulsante-grande",
          text: "Nuova partita",
          attrs: { type: "button" },
          on: { click: () => ctx.navigate("/partite/nuova") },
        }),
      );
    }

    if (risposta.matches.length === 0) {
      root.append(el("p", { className: "nota", text: "Non risultano ancora partite pubblicate." }));
      return;
    }

    for (const partita of risposta.matches) {
      root.append(rigaPartita(partita, gestione && modificabile ? () => ctx.navigate(`/partite/${partita.id}/modifica`) : null));
    }
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      ctx.sessioneScaduta();
      return;
    }
    clear(root);
    root.append(titolo("Partite"));
    root.append(errore("Non riesco a caricare i dati", () => renderPartite(root, ctx, rotta)));
  }
}

/** Ritorno all'archivio mantenendo la stagione scelta. */
function indietroA(ctx) {
  const stagione = ctx.stagione();
  return stagione ? `/partite?stagione=${encodeURIComponent(String(stagione))}` : "/partite";
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

function rigaPartita(partita, apriModifica) {
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

  // Solo con il permesso: riga discreta sotto la scheda, invariata per gli altri.
  if (apriModifica) {
    blocco.append(
      el("div", {
        className: "partita-strumenti",
        children: [
          el("button", {
            className: "tasto-modifica",
            text: "Modifica",
            attrs: { type: "button", "aria-label": `Modifica la partita del ${formatShortDate(partita.date)}` },
            on: { click: apriModifica },
          }),
        ],
      }),
    );
  }

  return blocco;
}
