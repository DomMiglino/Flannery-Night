// Strumenti di gestione dei giocatori, dentro la pagina Giocatori.
// Si apre sui sottopercorsi /giocatori/nuovo e /giocatori/:id/modifica, solo
// per chi ha il permesso (la vista Giocatori non lo monta mai per gli altri).

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { bandiera, errore, scheletro, titolo } from "../ui.js";
import { lasciaAvviso } from "../state.js";

const ETICHETTE_RUOLI = [
  { value: "P", label: "P · Portiere" },
  { value: "DC", label: "DC · Difensore Centrale" },
  { value: "DL", label: "DL · Difensore Laterale" },
  { value: "CC", label: "CC · Centrocampista Centrale" },
  { value: "CL", label: "CL · Centrocampista Laterale" },
  { value: "PC", label: "PC · Punta Centrale" },
];

const RUOLI_VALIDI = new Set(ETICHETTE_RUOLI.map((ruolo) => ruolo.value));

export function validaDatiGiocatore(dati, bandiere, flagPrecedente) {
  const name = typeof dati.name === "string" ? dati.name.trim() : "";
  if (name.length < 1 || name.length > 40) return "Il nome deve contenere da 1 a 40 caratteri.";
  if (!RUOLI_VALIDI.has(dati.role)) return "Seleziona un ruolo valido.";

  const flag = typeof dati.flag === "string" && dati.flag !== "" ? dati.flag : null;
  const invariata = flagPrecedente !== undefined && flag === flagPrecedente;
  if (!invariata && !bandiere.some((voce) => voce.filename === flag)) return "Seleziona una bandiera valida.";
  if (typeof dati.canLogin !== "boolean") return "Indica se il giocatore può accedere.";
  return null;
}

function rigaStato(classe = "nota") {
  return el("p", { className: classe, attrs: { role: "status" } });
}

export function formatoOra(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Editor di un giocatore. playerId null = nuovo, altrimenti modifica.
 * indietro = percorso del ritorno (/giocatori). allaFine(messaggio) torna
 * all'archivio dopo salvataggio o eliminazione.
 */
export async function renderEditorGiocatore(root, ctx, { playerId, indietro, allaFine }) {
  clear(root);
  root.append(titolo(playerId ? "Modifica giocatore" : "Nuovo giocatore"));
  root.append(scheletro(5));

  let bandiereDisponibili = [];
  let dettaglio = null;
  let me = ctx.me();

  try {
    const flagsRes = await api.flags();
    bandiereDisponibili = Array.isArray(flagsRes.flags) ? flagsRes.flags : [];

    if (playerId) {
      dettaglio = await api.giocatoreAdmin(playerId);
    }
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      ctx.sessioneScaduta();
      return;
    }
    clear(root);
    root.append(titolo(playerId ? "Modifica giocatore" : "Nuovo giocatore"));
    root.append(
      errore(erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a caricare i dati", () =>
        renderEditorGiocatore(root, ctx, { playerId, indietro, allaFine }),
      ),
    );
    return;
  }

  const stato = {
    name: dettaglio ? dettaglio.name : "",
    role: dettaglio ? dettaglio.role : "CC",
    flag: dettaglio ? dettaglio.flag ?? "" : bandiereDisponibili[0]?.filename || "",
    canLogin: dettaglio ? dettaglio.canLogin : true,
    pinCreated: dettaglio ? dettaglio.pinCreated : false,
    locked: dettaglio ? dettaglio.locked : false,
    lockedUntil: dettaglio ? dettaglio.lockedUntil : null,
    matchesCount: dettaglio ? dettaglio.matchesCount : 0,
    votesGivenCount: dettaglio ? dettaglio.votesGivenCount : 0,
    votesReceivedCount: dettaglio ? dettaglio.votesReceivedCount : 0,
    isAdminTarget: dettaglio ? dettaglio.isAdmin : false,
  };

  function disegna() {
    clear(root);
    root.append(titolo(playerId ? "Modifica giocatore" : "Nuovo giocatore"));
    disegnaForm();
  }

  function mostraErroreAzione(erroreApi, fallback) {
    disegna();
    const avviso = root.querySelector('[role="status"]');
    if (avviso) {
      avviso.className = "nota-errore";
      avviso.textContent = erroreApi instanceof ApiError ? erroreApi.message : fallback;
    }
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

  function disegnaForm() {
    const avviso = rigaStato();

    root.append(
      el("button", {
        className: "pulsante pulsante-secondario",
        text: "← Indietro",
        attrs: { type: "button" },
        on: { click: () => ctx.navigate(indietro) },
      }),
    );

    const modulo = el("div", { className: "editor-modulo" });

    // Nome
    const nomeInput = el("input", {
      className: "testo",
      attrs: { id: "nome-giocatore", type: "text", value: stato.name, maxLength: "40", placeholder: "Nome del giocatore", "aria-label": "Nome del giocatore" },
      on: { input: (e) => (stato.name = e.target.value) },
    });
    modulo.append(
      el("div", {
        className: "campo",
        children: [el("label", { className: "campo-etichetta", text: "Nome", attrs: { for: "nome-giocatore" } }), nomeInput],
      }),
    );

    // Ruolo
    const ruoloSelect = el("select", {
      className: "selezione",
      attrs: { id: "ruolo-giocatore", "aria-label": "Ruolo" },
      on: { change: (e) => (stato.role = e.target.value) },
    });
    for (const r of ETICHETTE_RUOLI) {
      const op = el("option", { text: r.label, attrs: { value: r.value } });
      if (stato.role === r.value) op.selected = true;
      ruoloSelect.append(op);
    }
    modulo.append(
      el("div", {
        className: "campo",
        children: [el("label", { className: "campo-etichetta", text: "Ruolo", attrs: { for: "ruolo-giocatore" } }), ruoloSelect],
      }),
    );

    // Bandiera
    const contenitoreBandiera = el("div", { className: "campo" });
    const bandieraSelect = el("select", {
      className: "selezione",
      attrs: { id: "bandiera-giocatore", "aria-label": "Bandiera", required: playerId ? undefined : "required" },
      on: {
        change: (e) => {
          stato.flag = e.target.value;
          disegna();
        },
      },
    });

    for (const f of bandiereDisponibili) {
      const op = el("option", { text: f.name, attrs: { value: f.filename } });
      if (stato.flag === f.filename) op.selected = true;
      bandieraSelect.append(op);
    }
    if (playerId && stato.flag === "") {
      const op = el("option", { text: "Nessuna bandiera", attrs: { value: "" } });
      op.selected = true;
      bandieraSelect.prepend(op);
    }
    // Se la bandiera del giocatore non è in elenco, la aggiungiamo per evitare blocco
    if (stato.flag && !bandiereDisponibili.some((f) => f.filename === stato.flag)) {
      const op = el("option", { text: stato.flag, attrs: { value: stato.flag } });
      op.selected = true;
      bandieraSelect.append(op);
    }

    const anteprimaNodo = el("div", { className: "editor-anteprima" });
    const imgBandiera = bandiera(stato.flag);
    if (imgBandiera) anteprimaNodo.append(imgBandiera);

    contenitoreBandiera.append(el("label", { className: "campo-etichetta", text: "Bandiera", attrs: { for: "bandiera-giocatore" } }));
    contenitoreBandiera.append(bandieraSelect);
    if (imgBandiera) contenitoreBandiera.append(anteprimaNodo);
    modulo.append(contenitoreBandiera);

    // Può accedere
    const canLoginCheckbox = el("input", {
      attrs: { type: "checkbox", id: "can-login-check" },
      on: { change: (e) => (stato.canLogin = e.target.checked) },
    });
    canLoginCheckbox.checked = stato.canLogin;

    modulo.append(
      el("div", {
        className: "campo",
        children: [
          el("label", {
            className: "interruttore",
            attrs: { for: "can-login-check" },
            children: [canLoginCheckbox, el("span", { text: "Può accedere" })],
          }),
          el("p", {
            className: "nota",
            text: "Se spento, il giocatore compare in classifica e si può votare ma non può accedere",
          }),
        ],
      }),
    );

    root.append(modulo);

    // Sezione Accesso (solo in modifica)
    if (playerId) {
      const sezioneAccesso = el("section", { className: "editor-squadra" });
      sezioneAccesso.append(el("h3", { className: "editor-squadra-nome", text: "Accesso e Sicurezza" }));

      const testoPin = stato.pinCreated ? "PIN creato" : "PIN non creato";
      sezioneAccesso.append(el("p", { className: "nota", text: `Stato PIN: ${testoPin}` }));

      const oraSblocco = formatoOra(stato.lockedUntil);
      const testoBlocco = stato.locked ? `Bloccato fino alle ${oraSblocco}` : "Non bloccato";
      sezioneAccesso.append(el("p", { className: "nota", text: `Stato blocco: ${testoBlocco}` }));

      const pulsantiAccesso = el("div", { className: "pulsanti" });

      const azzeraBtn = el("button", {
        className: "pulsante pulsante-secondario",
        text: "Azzera PIN",
        attrs: { type: "button" },
      });
      azzeraBtn.addEventListener("click", () => {
        clear(root);
        root.append(titolo("Modifica giocatore"));
        root.append(
          pannelloConferma(
            `Azzerare il PIN di ${stato.name}? Al prossimo accesso ne creerà uno nuovo e le sue sessioni si chiudono.`,
            "Sì, azzera PIN",
            async () => {
              try {
                await api.resetPin(playerId);
                stato.pinCreated = false;
                stato.locked = false;
                stato.lockedUntil = null;
                lasciaAvviso("PIN azzerato con successo.");
                disegna();
              } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                  ctx.sessioneScaduta();
                  return;
                }
                mostraErroreAzione(err, "Non riesco ad azzerare il PIN");
              }
            },
            () => disegna(),
          ),
        );
      });
      pulsantiAccesso.append(azzeraBtn);

      if (stato.locked) {
        const sbloccaBtn = el("button", {
          className: "pulsante pulsante-secondario",
          text: "Sblocca",
          attrs: { type: "button" },
        });
        sbloccaBtn.addEventListener("click", async () => {
          try {
            await api.unlock(playerId);
            stato.locked = false;
            stato.lockedUntil = null;
            disegna();
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              ctx.sessioneScaduta();
              return;
            }
            mostraErroreAzione(err, "Non riesco a sbloccare il giocatore");
          }
        });
        pulsantiAccesso.append(sbloccaBtn);
      }

      sezioneAccesso.append(pulsantiAccesso);
      root.append(sezioneAccesso);
    }

    root.append(avviso);

    // Tasto Salva
    const salvaBtn = el("button", {
      className: "pulsante pulsante-grande",
      text: playerId ? "Salva le modifiche" : "Crea giocatore",
      attrs: { type: "button" },
    });

    salvaBtn.addEventListener("click", async () => {
      const dati = {
        name: stato.name,
        role: stato.role,
        flag: stato.flag,
        canLogin: stato.canLogin,
      };
      const erroreValidazione = validaDatiGiocatore(
        dati,
        bandiereDisponibili,
        dettaglio ? dettaglio.flag : undefined,
      );
      if (erroreValidazione) {
        avviso.className = "nota-errore";
        avviso.textContent = erroreValidazione;
        return;
      }
      salvaBtn.disabled = true;
      avviso.className = "nota";
      avviso.textContent = "Salvataggio…";

      try {
        if (playerId) {
          await api.salvaGiocatore(playerId, dati);
          allaFine("Giocatore salvato.");
        } else {
          await api.creaGiocatore(dati);
          allaFine("Giocatore creato.");
        }
      } catch (err) {
        salvaBtn.disabled = false;
        if (err instanceof ApiError && err.status === 401) {
          ctx.sessioneScaduta();
          return;
        }
        avviso.className = "nota-errore";
        avviso.textContent = err instanceof ApiError ? err.message : "Non riesco a salvare";
      }
    });

    root.append(salvaBtn);

    // Sezione Elimina (solo in modifica)
    if (playerId) {
      if (stato.matchesCount > 0) {
        root.append(
          el("p", {
            className: "nota editor-nota-spaziatura",
            text: `Ha giocato ${stato.matchesCount} ${stato.matchesCount === 1 ? "partita" : "partite"}: non si può eliminare.`,
          }),
        );
      } else if (stato.isAdminTarget) {
        root.append(
          el("p", {
            className: "nota editor-nota-spaziatura",
            text: "Questo account non si può eliminare.",
          }),
        );
      } else if (me && me.id === playerId) {
        root.append(
          el("p", {
            className: "nota editor-nota-spaziatura",
            text: "Non puoi eliminare il tuo stesso account.",
          }),
        );
      } else {
        const eliminaBtn = el("button", {
          className: "pulsante pulsante-secondario pulsante-grande editor-elimina",
          text: "Elimina giocatore",
          attrs: { type: "button" },
        });

        eliminaBtn.addEventListener("click", () => {
          clear(root);
          root.append(titolo("Modifica giocatore"));
          root.append(
            pannelloConferma(
              `Eliminare ${stato.name}? Verranno cancellati ${stato.votesGivenCount} voti dati e ${stato.votesReceivedCount} ricevuti: le medie degli altri giocatori possono cambiare. L'operazione non si annulla.`,
              "Sì, elimina",
              async () => {
                try {
                  await api.eliminaGiocatore(playerId);
                  allaFine("Giocatore eliminato.");
                } catch (err) {
                  if (err instanceof ApiError && err.status === 401) {
                    ctx.sessioneScaduta();
                    return;
                  }
                  disegna();
                  const nuovoAvviso = root.querySelector('[role="status"]');
                  if (nuovoAvviso) {
                    nuovoAvviso.className = "nota-errore";
                    nuovoAvviso.textContent = err instanceof ApiError ? err.message : "Non riesco a eliminare";
                  }
                }
              },
              () => disegna(),
            ),
          );
        });
        root.append(eliminaBtn);
      }
    }
  }

  disegna();
}
