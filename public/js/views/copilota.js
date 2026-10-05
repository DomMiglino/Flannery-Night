// Blocco 5a: pagina di gestione delle partite (una sola sezione: "Partite").
// Pensata per il telefono: una colonna, bersagli da almeno 44 px, nessun
// scorrimento orizzontale. Il risultato ufficiale lo calcola il server:
// qui si mostra solo un'anteprima non ufficiale prima del salvataggio.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { formatShortDate } from "../format.js";
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

export async function renderCopilota(root, ctx) {
  clear(root);
  const me = ctx.me();
  if (!me) {
    ctx.navigate("/accesso", { sostituisci: true });
    return;
  }
  // Chi non gestisce la squadra vede solo un messaggio breve con via d'uscita.
  if (!me.isAdmin) {
    root.append(titolo("Partite"));
    root.append(nota("Area riservata: non hai i permessi per gestire le partite."));
    root.append(
      el("button", {
        className: "pulsante",
        text: "Torna alla Home",
        attrs: { type: "button" },
        on: { click: () => ctx.navigate("/home") },
      }),
    );
    return;
  }

  root.append(titolo("Partite"));
  root.append(scheletro(5));

  let stagioni = [];
  let stagioneId = null;
  let modificabile = true;
  let partite = [];
  let giocatori = [];
  let vista = "elenco";
  let stato = null;
  let messaggio = "";

  async function carica() {
    const s = await api.seasons();
    stagioni = Array.isArray(s.seasons) ? s.seasons : [];
    stagioneId = s.activeId ?? stagioni.find((x) => x.isActive)?.id ?? stagioni[0]?.id ?? null;
    giocatori = (await api.giocatoriEditor()).players || [];
    await caricaPartite();
  }

  async function caricaPartite() {
    const risposta = await api.partiteGestione(stagioneId);
    partite = Array.isArray(risposta.matches) ? risposta.matches : [];
    modificabile = risposta.season ? risposta.season.editable !== false : true;
  }

  function disegna() {
    clear(root);
    root.append(titolo("Partite"));
    if (vista === "editor" && stato) disegnaEditor();
    else disegnaElenco();
  }

  function selettoreStagione() {
    if (stagioni.length === 0) return null;
    const select = el("select", {
      className: "selezione",
      attrs: { "aria-label": "Stagione" },
      on: {
        change: async (evento) => {
          stagioneId = Number(evento.target.value);
          messaggio = "";
          try {
            await caricaPartite();
          } catch (erroreApi) {
            if (erroreApi instanceof ApiError && erroreApi.status === 401) {
              ctx.sessioneScaduta();
              return;
            }
            messaggio = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a caricare i dati";
          }
          disegna();
        },
      },
    });
    for (const s of stagioni) {
      const opzione = el("option", { text: `${s.name}${s.isActive ? " (in corso)" : ""}`, attrs: { value: String(s.id) } });
      if (Number(s.id) === Number(stagioneId)) opzione.selected = true;
      select.append(opzione);
    }
    return el("div", {
      className: "campo",
      children: [el("label", { className: "campo-etichetta", text: "Stagione" }), select],
    });
  }

  function disegnaElenco() {
    const selettore = selettoreStagione();
    if (selettore) root.append(selettore);
    if (messaggio) root.append(el("p", { className: "nota-ok", text: messaggio, attrs: { role: "status" } }));
    if (!modificabile) root.append(nota("Stagione chiusa: sola lettura, non si può modificare né eliminare."));

    if (modificabile) {
      root.append(
        el("button", {
          className: "pulsante pulsante-grande",
          text: "+ Nuova partita",
          attrs: { type: "button" },
          on: {
            click: () => {
              const oggi = new Date().toISOString().slice(0, 10);
              stato = { id: null, date: oggi, format: 5, teamA: [], teamB: [], guidinhaPlayer: "", guidinhaText: "" };
              vista = "editor";
              disegna();
            },
          },
        }),
      );
    }

    if (partite.length === 0) {
      root.append(nota("Non ci sono partite in questa stagione."));
      return;
    }
    const elenco = el("ul", { className: "elenco", attrs: { "aria-label": "Partite della stagione" } });
    for (const p of partite) {
      const riga = el("button", {
        className: "copilota-riga",
        attrs: { type: "button" },
        on: {
          click: async () => {
            try {
              const dettaglio = await api.partitaGestione(p.id);
              stato = {
                id: dettaglio.id,
                date: dettaglio.date,
                format: dettaglio.format,
                teamA: dettaglio.teamA || [],
                teamB: dettaglio.teamB || [],
                guidinhaPlayer: dettaglio.guidinha ? dettaglio.guidinha.playerId : "",
                guidinhaText: dettaglio.guidinha ? dettaglio.guidinha.text : "",
                editable: dettaglio.editable !== false,
              };
              vista = "editor";
              disegna();
            } catch (erroreApi) {
              if (erroreApi instanceof ApiError && erroreApi.status === 401) {
                ctx.sessioneScaduta();
                return;
              }
              messaggio = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a caricare i dati";
              disegna();
            }
          },
        },
        children: [
          el("span", { className: "copilota-riga-data", text: formatShortDate(p.date) }),
          el("span", { className: "copilota-riga-risultato", text: p.result }),
          el("span", { className: "badge-formato", text: p.format }),
        ],
      });
      elenco.append(el("li", { children: [riga] }));
    }
    root.append(elenco);
  }

  function passoValore(contenitore, get, set, etichetta, max = 99) {
    const meno = el("button", {
      className: "copilota-passo",
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
      className: "copilota-passo",
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
    contenitore.append(el("span", { className: "copilota-numero", text: String(get()), attrs: { "aria-label": etichetta } }));
    contenitore.append(piu);
  }

  function rigaGiocatore(squadra, indice, solaLettura) {
    const r = stato[squadra][indice];
    const blocco = el("div", { className: "copilota-giocatore" });
    blocco.append(el("span", { className: "copilota-nome", text: nomeDi(giocatori, r.playerId) }));
    const passi = el("div", { className: "copilota-passi" });
    passi.append(el("span", { className: "copilota-misura", text: "Gol" }));
    passoValore(
      passi,
      () => r.goals,
      (v) => {
        r.goals = v;
      },
      `Gol di ${nomeDi(giocatori, r.playerId)}`,
    );
    passi.append(el("span", { className: "copilota-misura", text: "Autogol" }));
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
    if (solaLettura) mvp.disabled = true;
    blocco.append(
      el("label", { className: "copilota-mvp", attrs: { for: `mvp-${squadra}-${indice}` }, children: [mvp, document.createTextNode(" MVP")] }),
    );
    if (!solaLettura) {
      const togli = el("button", {
        className: "pulsante pulsante-secondario copilota-togli",
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
    }
    if (solaLettura) {
      for (const b of blocco.querySelectorAll("button")) b.disabled = true;
    }
    return blocco;
  }

  function aggiuntaGiocatore(squadra) {
    const selezionati = new Set([...stato.teamA, ...stato.teamB].map((r) => r.playerId));
    const liberi = giocatori.filter((g) => !selezionati.has(g.id));
    const select = el("select", { className: "selezione", attrs: { "aria-label": `Giocatore da aggiungere in ${squadra}` } });
    for (const g of liberi) {
      select.append(el("option", { text: `${g.name} (${g.role})`, attrs: { value: g.id } }));
    }
    const bottone = el("button", {
      className: "pulsante pulsante-secondario",
      text: `Aggiungi in ${squadra}`,
      attrs: { type: "button" },
      on: {
        click: () => {
          if (!select.value) return;
          stato[squadra].push({ playerId: select.value, goals: 0, ownGoals: 0, mvp: false });
          disegna();
        },
      },
    });
    if (liberi.length === 0) {
      bottone.disabled = true;
      select.disabled = true;
    }
    return el("div", { className: "copilota-aggiunta", children: [select, bottone] });
  }

  function bloccoSquadra(nome, squadra, solaLettura) {
    const attesi = stato.format;
    const blocco = el("section", {
      className: "copilota-squadra",
      attrs: { "aria-label": `Squadra ${nome}` },
      children: [el("h3", { className: "copilota-squadra-nome", text: `Squadra ${nome} (${stato[squadra].length}/${attesi})` })],
    });
    stato[squadra].forEach((_, indice) => blocco.append(rigaGiocatore(squadra, indice, solaLettura)));
    if (!solaLettura) blocco.append(aggiuntaGiocatore(nome === "A" ? "teamA" : "teamB"));
    return blocco;
  }

  function disegnaEditor() {
    const solaLettura = !modificabile || stato.editable === false;
    if (solaLettura) root.append(nota("Stagione chiusa: sola lettura, non si può modificare né eliminare."));

    const avviso = rigaStato();
    root.append(
      el("button", {
        className: "pulsante pulsante-secondario",
        text: "← Torna all'elenco",
        attrs: { type: "button" },
        on: {
          click: () => {
            vista = "elenco";
            stato = null;
            disegna();
          },
        },
      }),
    );

    const corpo = el("div", { className: "copilota-modulo" });
    const dataInput = el("input", {
      className: "testo",
      attrs: { type: "date", value: stato.date, "aria-label": "Data della partita" },
      on: { change: (evento) => (stato.date = evento.target.value) },
    });
    if (solaLettura) dataInput.disabled = true;
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
    if (solaLettura) formatoSelect.disabled = true;
    corpo.append(el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Formato" }), formatoSelect] }));
    root.append(corpo);

    root.append(bloccoSquadra("A", "teamA", solaLettura));
    root.append(bloccoSquadra("B", "teamB", solaLettura));

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
      className: "testo copilota-testo",
      attrs: { rows: "3", placeholder: "Testo della Guidinha", "aria-label": "Testo della Guidinha" },
      on: { input: (evento) => (stato.guidinhaText = evento.target.value) },
    });
    testoGuidinha.value = stato.guidinhaText || "";
    if (solaLettura) {
      sceltaGuidinha.disabled = true;
      testoGuidinha.disabled = true;
    }
    root.append(
      el("div", {
        className: "copilota-squadra",
        children: [
          el("h3", { className: "copilota-squadra-nome", text: "Guidinha (facoltativa)" }),
          el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Giocatore" }), sceltaGuidinha] }),
          el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Testo" }), testoGuidinha] }),
        ],
      }),
    );

    const anteprima = anteprimaPunteggio(stato.teamA, stato.teamB);
    root.append(
      el("p", {
        className: "nota copilota-anteprima",
        text: `Anteprima: ${anteprima.testo}. Il risultato ufficiale lo calcola il server al salvataggio.`,
      }),
    );
    root.append(avviso);

    if (!solaLettura) {
      const salva = el("button", {
        className: "pulsante pulsante-grande",
        text: stato.id ? "Salva le modifiche" : "Pubblica la partita",
        attrs: { type: "button" },
      });
      salva.addEventListener("click", async () => {
        salva.disabled = true;
        avviso.className = "nota";
        avviso.textContent = "Salvataggio…";
        try {
          const corpoRichiesta = corpoPartita(stato);
          const risposta = stato.id ? await api.salvaPartita(stato.id, corpoRichiesta) : await api.creaPartita(corpoRichiesta);
          await caricaPartite();
          vista = "elenco";
          stato = null;
          messaggio = `Salvata: ${risposta.result || ""}.`;
          disegna();
        } catch (erroreApi) {
          if (erroreApi instanceof ApiError && erroreApi.status === 401) {
            ctx.sessioneScaduta();
            return;
          }
          avviso.className = "nota-errore";
          avviso.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a salvare";
          salva.disabled = false;
        }
      });
      root.append(salva);

      if (stato.id) {
        const elimina = el("button", {
          className: "pulsante pulsante-secondario pulsante-grande copilota-elimina",
          text: "Elimina la partita",
          attrs: { type: "button" },
        });
        elimina.addEventListener("click", () => {
          clear(root);
          root.append(titolo("Partite"));
          const conferma = el("div", {
            className: "blocco-errore",
            children: [
              el("p", { className: "nota-errore", text: "Eliminare davvero? Non si può annullare: resta traccia solo nel registro." }),
              el("div", {
                className: "pulsanti",
                children: [
                  el("button", {
                    className: "pulsante pulsante-grande",
                    text: "Sì, elimina",
                    attrs: { type: "button" },
                    on: {
                      click: async () => {
                        try {
                          await api.eliminaPartita(stato.id);
                          await caricaPartite();
                          vista = "elenco";
                          stato = null;
                          messaggio = "Partita eliminata.";
                          disegna();
                        } catch (erroreApi) {
                          if (erroreApi instanceof ApiError && erroreApi.status === 401) {
                            ctx.sessioneScaduta();
                            return;
                          }
                          messaggio = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a eliminare";
                          vista = "elenco";
                          stato = null;
                          disegna();
                        }
                      },
                    },
                  }),
                  el("button", {
                    className: "pulsante pulsante-secondario pulsante-grande",
                    text: "Annulla",
                    attrs: { type: "button" },
                    on: {
                      click: () => {
                        vista = "elenco";
                        stato = null;
                        disegna();
                      },
                    },
                  }),
                ],
              }),
            ],
          });
          root.append(conferma);
        });
        root.append(elimina);
      }
    }
  }

  /** Riconferma del PIN: usa la rotta esistente, poi ricarica tutto. */
  function moduloPin() {
    clear(root);
    root.append(titolo("Partite"));
    root.append(nota("Per gestire le partite inserisci di nuovo il tuo PIN di 6 cifre."));
    const avviso = rigaStato("nota-errore");
    const campo = el("input", {
      className: "pin-campo",
      attrs: {
        type: "password",
        inputmode: "numeric",
        pattern: "[0-9]*",
        maxlength: "6",
        autocomplete: "off",
        "aria-label": "PIN di 6 cifre",
        placeholder: "••••••",
      },
      on: {
        input: (evento) => {
          const valore = evento.target.value.replace(/\D/g, "").slice(0, 6);
          if (valore !== evento.target.value) evento.target.value = valore;
        },
      },
    });
    const invia = el("button", { className: "pulsante pulsante-grande", text: "Conferma", attrs: { type: "button" } });
    invia.addEventListener("click", async () => {
      if (!/^[0-9]{6}$/.test(campo.value)) {
        avviso.textContent = "Il PIN deve avere 6 cifre.";
        return;
      }
      invia.disabled = true;
      avviso.className = "nota";
      avviso.textContent = "Controllo…";
      try {
        await api.confermaPin(campo.value);
        await carica();
        disegna();
      } catch (erroreApi) {
        if (erroreApi instanceof ApiError && erroreApi.status === 401) {
          ctx.sessioneScaduta();
          return;
        }
        avviso.className = "nota-errore";
        avviso.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a confermare il PIN";
        invia.disabled = false;
      }
    });
    root.append(avviso);
    root.append(el("div", { className: "pin-campi", children: [campo, invia] }));
    campo.focus();
  }

  try {
    await carica();
    disegna();
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      ctx.sessioneScaduta();
      return;
    }
    // Senza il secondo via (riconferma) il server risponde 403: si mostra
    // il modulo del PIN invece dell'elenco.
    if (erroreApi instanceof ApiError && erroreApi.status === 403) {
      moduloPin();
      return;
    }
    clear(root);
    root.append(titolo("Partite"));
    root.append(errore("Non riesco a caricare i dati", () => renderCopilota(root, ctx)));
  }
}
