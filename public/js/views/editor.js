// Strumenti di gestione delle partite, dentro la pagina Partite.
// Si apre sui sottopercorsi /partite/nuova e /partite/:id/modifica, solo
// per chi ha il permesso (la vista Partite non lo monta mai per gli altri).
// Pensato per il telefono: una colonna, bersagli da almeno 44 px, nessun
// scorrimento orizzontale. Il risultato ufficiale lo calcola il server:
// qui si mostra solo un'anteprima non ufficiale prima del salvataggio.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { errore, nota, scheletro, titolo } from "../ui.js";

function rigaStato(classe = "nota") {
  return el("p", { className: classe, attrs: { role: "status" } });
}

function nomeDi(giocatori, id) {
  const g = giocatori.find((x) => x.id === id);
  return g ? g.name : id;
}

/** Anteprima locale non ufficiale: gol propri + autogol avversari. */
export function anteprimaPunteggio(squadraA, squadraB) {
  const somma = (lista, campo) => lista.reduce((t, r) => t + (Number(r[campo]) || 0), 0);
  const a = somma(squadraA, "goals") + somma(squadraB, "ownGoals");
  const b = somma(squadraB, "goals") + somma(squadraA, "ownGoals");
  return { a, b, testo: `A ${a} – ${b} B` };
}

function corpoPartita(stato) {
  return {
    date: stato.date,
    format: stato.format,
    teamA: stato.teamA.map((r) => ({ playerId: r.playerId, goals: r.goals, ownGoals: r.ownGoals, mvp: r.mvp })),
    teamB: stato.teamB.map((r) => ({ playerId: r.playerId, goals: r.goals, ownGoals: r.ownGoals, mvp: r.mvp })),
    guidinha: stato.guidinhaPlayer ? { playerId: stato.guidinhaPlayer, text: stato.guidinhaText } : null,
  };
}

function normalizzaTesto(testo) {
  return String(testo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Confronto senza maiuscole né accenti per la ricerca per nome. */
export function filtraDisponibili(giocatori, selezionati, ricerca) {
  const liberi = giocatori.filter((g) => !selezionati.has(g.id));
  const domanda = normalizzaTesto(ricerca);
  if (domanda === "") return liberi;
  return liberi.filter((g) => normalizzaTesto(g.name).includes(domanda));
}

/**
 * Editor di una partita. matchId null = nuova (stagione attiva), altrimenti
 * modifica. indietro = percorso dell'archivio. allaFine(messaggio) torna
 * all'archivio dopo salvataggio o eliminazione.
 */
export async function renderEditorPartita(root, ctx, { matchId, indietro, allaFine }) {
  clear(root);
  root.append(titolo(matchId ? "Modifica partita" : "Nuova partita"));
  root.append(scheletro(5));

  let giocatori = [];
  let stato = null;

  function disegna() {
    clear(root);
    root.append(titolo(matchId ? "Modifica partita" : "Nuova partita"));
    disegnaEditor();
  }

  function passoValore(contenitore, get, set, etichetta, max = 99) {
    const meno = el("button", {
      className: "editor-passo",
      text: "−",
      attrs: { type: "button", "aria-label": `Riduci ${etichetta}` },
      on: {
        click: () => {
          set(Math.max(0, get() - 1));
          disegna();
        },
      },
    });
    const piu = el("button", {
      className: "editor-passo",
      text: "+",
      attrs: { type: "button", "aria-label": `Aumenta ${etichetta}` },
      on: {
        click: () => {
          set(Math.min(max, get() + 1));
          disegna();
        },
      },
    });
    contenitore.append(meno);
    contenitore.append(el("span", { className: "editor-numero", text: String(get()), attrs: { "aria-label": etichetta } }));
    contenitore.append(piu);
  }

  function rigaGiocatore(squadra, indice) {
    const r = stato[squadra][indice];
    const blocco = el("div", { className: "editor-giocatore" });
    blocco.append(el("span", { className: "editor-nome", text: nomeDi(giocatori, r.playerId) }));
    const passi = el("div", { className: "editor-passi" });
    passi.append(el("span", { className: "editor-misura", text: "Gol" }));
    passoValore(
      passi,
      () => r.goals,
      (v) => {
        r.goals = v;
      },
      `Gol di ${nomeDi(giocatori, r.playerId)}`,
    );
    passi.append(el("span", { className: "editor-misura", text: "Autogol" }));
    passoValore(
      passi,
      () => r.ownGoals,
      (v) => {
        r.ownGoals = v;
      },
      `Autogol di ${nomeDi(giocatori, r.playerId)}`,
    );
    blocco.append(passi);
    const mvp = el("input", {
      attrs: { type: "checkbox", id: `mvp-${squadra}-${indice}` },
      on: {
        change: (evento) => {
          r.mvp = evento.target.checked;
        },
      },
    });
    mvp.checked = r.mvp === true;
    blocco.append(
      el("label", { className: "editor-mvp", attrs: { for: `mvp-${squadra}-${indice}` }, children: [mvp, document.createTextNode(" MVP")] }),
    );
    const togli = el("button", {
      className: "pulsante pulsante-secondario editor-togli",
      text: "Togli",
      attrs: { type: "button", "aria-label": `Togli ${nomeDi(giocatori, r.playerId)}` },
      on: {
        click: () => {
          stato[squadra].splice(indice, 1);
          if (stato.guidinhaPlayer === r.playerId) stato.guidinhaPlayer = "";
          disegna();
        },
      },
    });
    blocco.append(togli);
    return blocco;
  }

  function aggiuntaGiocatore(squadra) {
    const chiave = squadra === "teamA" ? "cercaA" : "cercaB";
    const selezionati = new Set([...stato.teamA, ...stato.teamB].map((r) => r.playerId));
    const liberi = filtraDisponibili(giocatori, selezionati, stato[chiave]);
    const cerca = el("input", {
      className: "testo",
      attrs: { type: "search", placeholder: "Cerca per nome", "aria-label": `Cerca giocatore da aggiungere in ${squadra === "teamA" ? "A" : "B"}` },
      on: {
        input: (evento) => {
          stato[chiave] = evento.target.value;
          disegna();
          const campo = root.querySelector(`[data-cerca="${chiave}"]`);
          if (campo) {
            campo.focus();
            campo.setSelectionRange(campo.value.length, campo.value.length);
          }
        },
      },
    });
    cerca.value = stato[chiave] || "";
    cerca.setAttribute("data-cerca", chiave);
    const blocco = el("div", {
      className: "editor-aggiunta",
      children: [cerca],
    });
    const visibili = liberi.slice(0, 8);
    for (const g of visibili) {
      blocco.append(
        el("button", {
          className: "pulsante pulsante-secondario editor-aggiungi",
          text: `+ ${g.name} (${g.role})`,
          attrs: { type: "button" },
          on: {
            click: () => {
              stato[squadra].push({ playerId: g.id, goals: 0, ownGoals: 0, mvp: false });
              stato[chiave] = "";
              disegna();
            },
          },
        }),
      );
    }
    if (liberi.length === 0) {
      blocco.append(nota(selezionati.size === 0 ? "Nessun giocatore disponibile." : "Nessun nome corrisponde alla ricerca."));
    } else if (liberi.length > visibili.length) {
      blocco.append(nota(`Primi ${visibili.length} di ${liberi.length}: scrivi per restringere.`));
    }
    return blocco;
  }

  function bloccoSquadra(nome, squadra) {
    const attesi = stato.format;
    const blocco = el("section", {
      className: "editor-squadra",
      attrs: { "aria-label": `Squadra ${nome}` },
      children: [el("h3", { className: "editor-squadra-nome", text: `Squadra ${nome} (${stato[squadra].length}/${attesi})` })],
    });
    stato[squadra].forEach((_, indice) => blocco.append(rigaGiocatore(squadra, indice)));
    blocco.append(aggiuntaGiocatore(squadra));
    return blocco;
  }

  function pannelloConferma(domanda, confermaTesto, onConferma, onAnnulla) {
    return el("div", {
      className: "blocco-errore",
      children: [
        el("p", { className: "nota-errore", text: domanda }),
        el("div", {
          className: "pulsanti",
          children: [
            el("button", {
              className: "pulsante pulsante-grande",
              text: confermaTesto,
              attrs: { type: "button" },
              on: { click: onConferma },
            }),
            el("button", {
              className: "pulsante pulsante-secondario pulsante-grande",
              text: "Annulla",
              attrs: { type: "button" },
              on: { click: onAnnulla },
            }),
          ],
        }),
      ],
    });
  }

  function disegnaEditor() {
    const avviso = rigaStato();
    root.append(
      el("button", {
        className: "pulsante pulsante-secondario",
        text: "← Indietro",
        attrs: { type: "button" },
        on: { click: () => ctx.navigate(indietro) },
      }),
    );

    const corpo = el("div", { className: "editor-modulo" });
    const dataInput = el("input", {
      className: "testo",
      attrs: { type: "date", value: stato.date, "aria-label": "Data della partita" },
      on: { change: (evento) => (stato.date = evento.target.value) },
    });
    corpo.append(el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Data" }), dataInput] }));

    const formatoSelect = el("select", {
      className: "selezione",
      attrs: { "aria-label": "Formato (giocatori per squadra)" },
      on: {
        change: (evento) => {
          stato.format = Number(evento.target.value);
          disegna();
        },
      },
    });
    for (const n of [5, 6, 8]) {
      const op = el("option", { text: `${n} contro ${n}`, attrs: { value: String(n) } });
      if (stato.format === n) op.selected = true;
      formatoSelect.append(op);
    }
    corpo.append(el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Formato" }), formatoSelect] }));
    root.append(corpo);

    root.append(bloccoSquadra("A", "teamA"));
    root.append(bloccoSquadra("B", "teamB"));

    // Guidinha facoltativa: solo chi è in partita, con testo obbligatorio.
    const inPartita = [...stato.teamA, ...stato.teamB].map((r) => r.playerId);
    const sceltaGuidinha = el("select", {
      className: "selezione",
      attrs: { "aria-label": "Giocatore della Guidinha" },
      on: {
        change: (evento) => {
          stato.guidinhaPlayer = evento.target.value;
          disegna();
        },
      },
    });
    sceltaGuidinha.append(el("option", { text: "Nessuna Guidinha", attrs: { value: "" } }));
    for (const id of inPartita) {
      const op = el("option", { text: nomeDi(giocatori, id), attrs: { value: id } });
      if (stato.guidinhaPlayer === id) op.selected = true;
      sceltaGuidinha.append(op);
    }
    const testoGuidinha = el("textarea", {
      className: "testo editor-testo",
      attrs: { rows: "3", placeholder: "Testo della Guidinha", "aria-label": "Testo della Guidinha" },
      on: { input: (evento) => (stato.guidinhaText = evento.target.value) },
    });
    testoGuidinha.value = stato.guidinhaText || "";
    root.append(
      el("div", {
        className: "editor-squadra",
        children: [
          el("h3", { className: "editor-squadra-nome", text: "Guidinha (facoltativa)" }),
          el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Giocatore" }), sceltaGuidinha] }),
          el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Testo" }), testoGuidinha] }),
        ],
      }),
    );

    const anteprima = anteprimaPunteggio(stato.teamA, stato.teamB);
    root.append(
      el("p", {
        className: "nota editor-anteprima",
        text: `Anteprima: ${anteprima.testo}. Il risultato ufficiale lo calcola il server al salvataggio.`,
      }),
    );
    root.append(avviso);

    async function salva() {
      const corpoRichiesta = corpoPartita(stato);
      if (matchId) return api.salvaPartita(matchId, corpoRichiesta);
      return api.creaPartita(corpoRichiesta);
    }

    const salvaBtn = el("button", {
      className: "pulsante pulsante-grande",
      text: matchId ? "Salva le modifiche" : "Pubblica la partita",
      attrs: { type: "button" },
    });
    salvaBtn.addEventListener("click", async () => {
      // In modifica si chiede conferma esplicita prima di scrivere.
      if (matchId) {
        clear(root);
        root.append(titolo("Modifica partita"));
        root.append(
          pannelloConferma(
            "Salvare le modifiche? La partita resta pubblicata e la classifica si aggiorna.",
            "Sì, salva",
            async () => {
              await eseguiSalva(avviso);
            },
            () => disegna(),
          ),
        );
        return;
      }
      await eseguiSalva(avviso);
    });
    root.append(salvaBtn);

    async function eseguiSalva(nodoAvviso) {
      salvaBtn.disabled = true;
      nodoAvviso.className = "nota";
      nodoAvviso.textContent = "Salvataggio…";
      try {
        const risposta = await salva();
        allaFine(`Salvata: ${risposta.result || ""}.`);
      } catch (erroreApi) {
        if (erroreApi instanceof ApiError && erroreApi.status === 401) {
          ctx.sessioneScaduta();
          return;
        }
        disegna();
        const nuovo = root.querySelector('[role="status"]');
        if (nuovo) {
          nuovo.className = "nota-errore";
          nuovo.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a salvare";
        }
      }
    }

    if (matchId) {
      const elimina = el("button", {
        className: "pulsante pulsante-secondario pulsante-grande editor-elimina",
        text: "Elimina la partita",
        attrs: { type: "button" },
      });
      elimina.addEventListener("click", () => {
        clear(root);
        root.append(titolo("Modifica partita"));
        root.append(
          pannelloConferma(
            "Eliminare davvero? Non si può annullare: resta traccia solo nel registro.",
            "Sì, elimina",
            async () => {
              try {
                await api.eliminaPartita(matchId);
                allaFine("Partita eliminata.");
              } catch (erroreApi) {
                if (erroreApi instanceof ApiError && erroreApi.status === 401) {
                  ctx.sessioneScaduta();
                  return;
                }
                disegna();
              }
            },
            () => disegna(),
          ),
        );
      });
      root.append(elimina);
    }
  }

  try {
    giocatori = (await api.giocatoriEditor()).players || [];
    if (matchId) {
      const dettaglio = await api.partitaGestione(matchId);
      // Stagione chiusa: niente editor, resta l'archivio in sola lettura.
      if (dettaglio.editable === false) {
        ctx.navigate(indietro);
        return;
      }
      stato = {
        id: dettaglio.id,
        date: dettaglio.date,
        format: dettaglio.format,
        teamA: dettaglio.teamA || [],
        teamB: dettaglio.teamB || [],
        guidinhaPlayer: dettaglio.guidinha ? dettaglio.guidinha.playerId : "",
        guidinhaText: dettaglio.guidinha ? dettaglio.guidinha.text : "",
        cercaA: "",
        cercaB: "",
      };
    } else {
      const oggi = new Date().toISOString().slice(0, 10);
      stato = { id: null, date: oggi, format: 5, teamA: [], teamB: [], guidinhaPlayer: "", guidinhaText: "", cercaA: "", cercaB: "" };
    }
    disegna();
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      ctx.sessioneScaduta();
      return;
    }
    clear(root);
    root.append(titolo(matchId ? "Modifica partita" : "Nuova partita"));
    root.append(errore("Non riesco a caricare i dati", () => renderEditorPartita(root, ctx, { matchId, indietro, allaFine })));
  }
}
