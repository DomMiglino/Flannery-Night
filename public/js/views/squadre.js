// Componi squadre: scelta del formato e dei convocati, poi testo pronto.
// Solo per chi ha il permesso (la vista Partite non la monta per gli altri).
// Una sola schermata: selezione e, dopo Conferma, risultato con copia.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { attesa, errore, titolo } from "../ui.js";

const FORMATI = [5, 6, 7, 8];
const FORMATO_DEFAULT = 8;

function indietroTesto() {
  return "← Indietro";
}

function ordinaGiocatori(lista) {
  return [...(lista || [])].sort((a, b) => {
    const pa = Number(a.played) || 0;
    const pb = Number(b.played) || 0;
    if (pb !== pa) return pb - pa;
    const n = String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" });
    if (n !== 0) return n;
    return a.id < b.id ? -1 : 1;
  });
}

function statoSelezione(formato, conta) {
  const attesi = 2 * formato;
  if (conta === attesi) return "Pronti: premi Conferma.";
  if (conta < attesi) {
    const mancano = attesi - conta;
    return mancano === 1 ? `Manca 1 convocato (${conta} / ${attesi}).` : `Mancano ${mancano} convocati (${conta} / ${attesi}).`;
  }
  const troppi = conta - attesi;
  return troppi === 1 ? `1 convocato di troppo (${conta} / ${attesi}).` : `${troppi} convocati di troppo (${conta} / ${attesi}).`;
}

async function copiaTesto(testo) {
  const valore = String(testo || "");
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(valore);
      return true;
    }
  } catch {
    // Ripiego sotto.
  }
  try {
    const area = document.createElement("textarea");
    area.value = valore;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Pagina Componi squadre. indietro = percorso dell'archivio Partite.
 * Mantiene formato e selezione tra selezione e risultato.
 */
export async function renderSquadre(root, ctx, { indietro }) {
  clear(root);
  root.append(titolo("Componi squadre"));
  root.append(attesa());

  let giocatori = [];
  let formato = FORMATO_DEFAULT;
  let selezionati = new Set();
  let fase = "scelta";
  let proposta = null;
  let avvisoCopia = "";

  function disegna() {
    clear(root);
    root.append(titolo("Componi squadre"));
    root.append(
      el("button", {
        className: "pulsante pulsante-secondario",
        text: indietroTesto(),
        attrs: { type: "button" },
        on: { click: () => ctx.navigate(indietro || "/partite") },
      }),
    );
    if (fase === "risultato" && proposta) {
      disegnaRisultato();
      return;
    }
    disegnaScelta();
  }

  function disegnaFormato() {
    const gruppo = el("div", {
      className: "squadre-formati",
      attrs: { role: "group", "aria-label": "Formato (giocatori per squadra)" },
    });
    for (const n of FORMATI) {
      const attivo = formato === n;
      gruppo.append(
        el("button", {
          className: attivo ? "squadre-formato squadre-formato-attivo" : "squadre-formato",
          text: `${n} vs ${n}`,
          attrs: { type: "button", "aria-pressed": attivo ? "true" : "false", "aria-label": `Formato ${n} contro ${n}` },
          on: {
            click: () => {
              formato = n;
              disegna();
            },
          },
        }),
      );
    }
    root.append(el("h3", { className: "titolo-gruppo", text: "Formato" }));
    root.append(gruppo);
  }

  function disegnaScelta() {
    disegnaFormato();
    const attesi = 2 * formato;
    root.append(el("h3", { className: "titolo-gruppo", text: `Convocati (${selezionati.size} / ${attesi})` }));
    const griglia = el("div", { className: "squadre-griglia" });
    for (const g of ordinaGiocatori(giocatori)) {
      const attivo = selezionati.has(g.id);
      const chip = el("button", {
        className: attivo ? "squadre-chip squadre-chip-attivo" : "squadre-chip",
        attrs: { type: "button", "aria-pressed": attivo ? "true" : "false", "aria-label": `${g.name}, ${g.role}, ${g.played} partite${attivo ? ", selezionato" : ""}` },
        on: {
          click: () => {
            if (selezionati.has(g.id)) selezionati.delete(g.id);
            else selezionati.add(g.id);
            disegna();
          },
        },
      });
      chip.append(el("span", { className: "squadre-chip-nome", text: g.name }));
      chip.append(
        el("span", {
          className: "squadre-chip-sotto",
          text: `${g.role} · ${g.played} ${g.played === 1 ? "partita" : "partite"}${attivo ? " · ✓" : ""}`,
        }),
      );
      griglia.append(chip);
    }
    root.append(griglia);

    const barra = el("div", { className: "squadre-barra", attrs: { role: "group", "aria-label": "Conferma convocati" } });
    barra.append(el("span", { className: "squadre-contatore", text: `Convocati ${selezionati.size} / ${attesi}` }));
    const messaggio = el("span", {
      className: "squadre-stato",
      text: statoSelezione(formato, selezionati.size),
      attrs: { role: "status" },
    });
    barra.append(messaggio);
    const azzera = el("button", {
      className: "pulsante pulsante-secondario squadre-azzera",
      text: "Azzera",
      attrs: { type: "button", "aria-label": "Deseleziona tutti i convocati" },
      on: {
        click: () => {
          selezionati = new Set();
          disegna();
        },
      },
    });
    const conferma = el("button", {
      className: "pulsante squadre-conferma",
      text: "Conferma",
      attrs: { type: "button", disabled: selezionati.size === attesi ? null : true },
      on: { click: invia },
    });
    const rigaTasti = el("div", { className: "squadre-barra-tasti", children: [azzera, conferma] });
    barra.append(rigaTasti);
    root.append(barra);
  }

  function disegnaRisultato() {
    const testo = proposta && proposta.testo ? proposta.testo : "";
    const blocco = el("pre", { className: "squadre-testo", text: testo, attrs: { tabindex: "0", "aria-label": "Testo pronto da copiare" } });
    root.append(el("h3", { className: "titolo-gruppo", text: "Testo pronto" }));
    root.append(blocco);
    const statoCopia = el("p", { className: "nota", text: avvisoCopia, attrs: { role: "status" } });
    const copia = el("button", {
      className: "pulsante pulsante-grande",
      text: "Copia testo",
      attrs: { type: "button" },
      on: {
        click: async () => {
          const ok = await copiaTesto(testo);
          avvisoCopia = ok ? "Copiato." : "Copia non riuscita: seleziona il testo a mano.";
          disegna();
          const ancora = root.querySelector(".squadre-testo");
          if (ancora && !ok) {
            const intervallo = document.createRange();
            intervallo.selectNodeContents(ancora);
            const selezione = window.getSelection();
            if (selezione) {
              selezione.removeAllRanges();
              selezione.addRange(intervallo);
            }
          }
        },
      },
    });
    root.append(copia);
    root.append(statoCopia);
    const diffs = el("p", {
      className: "nota",
      text: `Differenza overall: ${proposta.diffOverall} · Differenza FIS: ${proposta.diffFis}`,
    });
    root.append(diffs);
    for (const a of proposta.avvisi || []) {
      root.append(el("p", { className: "nota", text: a }));
    }
    root.append(
      el("button", {
        className: "pulsante pulsante-secondario pulsante-grande squadre-modifica",
        text: "Modifica convocati",
        attrs: { type: "button" },
        on: {
          click: () => {
            fase = "scelta";
            avvisoCopia = "";
            disegna();
          },
        },
      }),
    );
  }

  async function invia() {
    const attesi = 2 * formato;
    const ids = [...selezionati];
    if (ids.length !== attesi) {
      disegna();
      return;
    }
    clear(root);
    root.append(titolo("Componi squadre"));
    root.append(attesa());
    try {
      const risposta = await api.componiSquadre(formato, ids);
      proposta = risposta;
      fase = "risultato";
      avvisoCopia = "";
      disegna();
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
      clear(root);
      root.append(titolo("Componi squadre"));
      const messaggio = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a calcolare le squadre";
      root.append(errore(messaggio, () => renderSquadre(root, ctx, { indietro })));
    }
  }

  try {
    const risposta = await api.squadreGiocatori();
    giocatori = Array.isArray(risposta.players) ? risposta.players : [];
    disegna();
  } catch (erroreApi) {
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      ctx.sessioneScaduta();
      return;
    }
    clear(root);
    root.append(titolo("Componi squadre"));
    root.append(errore("Non riesco a caricare i dati", () => renderSquadre(root, ctx, { indietro })));
  }
}
