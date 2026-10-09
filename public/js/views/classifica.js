// Passo 4: classifica come tabella ordinabile. Si ordina toccando
// l'intestazione; la posizione mostra sempre quella ufficiale
// (per Flannery Power Score), anche con un altro ordinamento.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { formatNumber } from "../format.js";
import { withAppearances } from "../lists.js";
import { ariaSort, memoriaOrdinamento, ordinaRighe, prossimoStato } from "../ordina.js";
import { attesa, bandiera, errore, forma, separaMvp, titolo } from "../ui.js";
import { withSeason } from "../routes.js";
import { stagioneAttiva as idStagioneCorrente, utenteCollegato } from "../state.js";

/**
 * Rendimento in piccoli segnaposto con la lettera visibile e la stella
 * dove il giocatore è stato MVP. Il colore è solo di supporto.
 */
function segniRendimento(lista) {
  const gruppo = el("span", { className: "segni" });
  for (const etichetta of Array.isArray(lista) ? lista : []) {
    const { testo, mvp } = separaMvp(etichetta);
    const prima = (testo || "").charAt(0).toUpperCase();
    const classe = prima === "V" ? "segno segno-v" : prima === "S" ? "segno segno-s" : "segno segno-p";
    gruppo.append(el("span", { className: classe, text: mvp ? `${testo}★` : testo }));
  }
  return gruppo;
}

/**
 * Rendimento in una sola riga di testo: "V*" diventa "V★".
 * L'ordine è quello dell'API (ultime cinque partite).
 */
export function testoRendimento(lista) {
  return (Array.isArray(lista) ? lista : []).map((e) => String(e ?? "").replace("*", "★")).join(" ");
}

/** Una cella numerica: il trattino se il valore manca, tono attenuato se zero. */
function cellaNumero(testo, zero = false, forte = false) {
  const classi = ["tabella-numero"];
  if (zero) classi.push("tabella-zero");
  if (forte) classi.push("tabella-forte");
  return el("td", { className: classi.join(" "), text: testo });
}

function intero(value) {
  return value === null || value === undefined ? "—" : String(value);
}

function zero(value) {
  return Number(value) === 0;
}

/**
 * Nome troncato a 9 lettere con due puntini: "AntonioPortiere"
 * diventa "AntonioPo..". Fino a 9 lettere resta intero.
 */
export function troncaNome(nome, limite = 9) {
  const testo = String(nome ?? "");
  return testo.length > limite ? `${testo.slice(0, limite)}..` : testo;
}

/**
 * Fascia dell'overall per eccesso: oro da 81 in su, argento da 70 a 80,
 * bronzo sotto il 70. Niente fascia senza voti.
 */
export function fasciaOverall(overallUp) {
  if (overallUp === null || overallUp === undefined) return null;
  if (overallUp >= 81) return "oro";
  if (overallUp >= 70) return "argento";
  return "bronzo";
}

export function suggerisciNomeStagione(attuale) {
  const testo = String(attuale ?? "").trim();
  if (!testo) return "";
  const match = testo.match(/^(\d{4})\s*\/\s*(\d{2})$/);
  if (!match) return "";
  const base = Number(match[1]);
  const finale = Number(match[2]);
  if (!Number.isInteger(base) || !Number.isInteger(finale)) return "";
  const nuovoBase = base + 1;
  const nuovoFinale = (finale + 1) % 100;
  return `${nuovoBase}/${String(nuovoFinale).padStart(2, "0")}`;
}

/**
 * Il tasto "Nuova stagione" si vede solo a chi gestisce: il permesso è
 * l'unico richiesto e va letto dallo stato condiviso nel momento del
 * disegno. Chi non gestisce non riceve né tasto né riquadro.
 * @param {{ [chiave: string]: any, isAdmin?: boolean } | null | undefined} utente giocatore attivo, oppure null
 * @returns {boolean}
 */
export function mostraNuovaStagione(utente) {
  return !!utente && utente.isAdmin === true;
}

/** Il gestore chiude la stagione solo guardandone una attiva: su una
 *  stagione archiviata niente tasto. Il confronto è tra numeri, perché
 *  id di stagioni e query possono arrivare come stringhe. */
export function soloStagioneAttiva(seasonId, attivaId) {
  if (attivaId === null || attivaId === undefined) return false;
  return Number(seasonId) === Number(attivaId);
}

export const PERCORSO_PREMI = "/contest";

/**
 * Il tasto dei premi si mostra a tutti, anche con classifica vuota:
 * ospite, collegato e chi gestisce vedono lo stesso collegamento.
 * @param {{ [chiave: string]: any, isAdmin?: boolean } | null | undefined} [_utente] chi guarda, mai usato per filtrare
 * @param {Array<any> | null | undefined} [_righe] righe in classifica, mai usate per filtrare
 * @returns {boolean}
 */
export function mostraTastoPremi(_utente = null, _righe = null) {
  return true;
}

/** Indirizzo del contest, con la stagione scelta quando c'è. */
export function hrefPremi(stagione) {
  return withSeason(PERCORSO_PREMI, stagione);
}

const COLONNE = [
  { id: "nome", etichetta: "Giocatore", completa: "Giocatore", chiave: "name", iniziale: "asc" },
  { id: "power", etichetta: "FPS", completa: "Flannery Power Score", chiave: "powerScore", iniziale: "desc" },
  { id: "forma", etichetta: "Forma", completa: "Forma", chiave: "formaScore", iniziale: "desc" },
  { id: "giocate", etichetta: "G", completa: "Giocate", chiave: "played", iniziale: "desc" },
  { id: "vinte", etichetta: "V", completa: "Vinte", chiave: "V", iniziale: "desc" },
  { id: "pareggiate", etichetta: "X", completa: "Pareggiate", chiave: "P", iniziale: "desc" },
  { id: "perse", etichetta: "P", completa: "Perse", chiave: "S", iniziale: "desc" },
  { id: "gol", etichetta: "Gol", completa: "Gol", chiave: "goals", iniziale: "desc" },
  { id: "mediagol", etichetta: "Media gol", completa: "Media gol", chiave: "avgGoals", iniziale: "desc" },
  { id: "autogol", etichetta: "Autogol", completa: "Autogol", chiave: "ownGoals", iniziale: "desc" },
  { id: "punti", etichetta: "Punti", completa: "Punti", chiave: "points", iniziale: "desc" },
  { id: "mediapunti", etichetta: "Media punti", completa: "Media punti", chiave: "avgPoints", iniziale: "desc" },
  { id: "mvp", etichetta: "MVP", completa: "MVP", chiave: "mvp", iniziale: "desc" },
  { id: "guidinha", etichetta: "Guidinha", completa: "Guidinha", chiave: "guidinha", iniziale: "desc" },
];

/** Spareggi ufficiali: Power Score, poi somma pesi MVP, poi nome. */
const SPAREGGI_UFFICIALI = [
  { chiave: "powerScore", direzione: "desc" },
  { chiave: "mvpWeight", direzione: "desc" },
  { chiave: "name", direzione: "asc" },
];

const INIZIALE = { id: "power", chiave: "powerScore", direzione: "desc" };

function intestazione(colonna, stato, alToccare) {
  const attiva = stato.id === colonna.id;
  const bottone = el("button", {
    className: attiva ? "th-ordina th-attiva" : "th-ordina",
    attrs: { type: "button", "aria-label": `Ordina per ${colonna.completa || colonna.etichetta}` },
    children: [
      el("span", { text: colonna.etichetta }),
      el("span", {
        className: "th-freccia",
        text: attiva ? (stato.direzione === "asc" ? "▲" : "▼") : "↕",
        attrs: { "aria-hidden": "true" },
      }),
    ],
    on: { click: () => alToccare(colonna) },
  });
  return el("th", { attrs: { scope: "col", "aria-sort": ariaSort(attiva, stato.direzione) }, children: [bottone] });
}

export async function renderClassifica(root, ctx) {
  clear(root);
  root.append(titolo("Classifica"));
  root.append(attesa());

  let risposta;
  try {
    risposta = await api.ranking(ctx.stagione());
  } catch (erroreApi) {
    const messaggio = erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati";
    clear(root);
    root.append(titolo("Classifica"));
    root.append(errore(messaggio, () => renderClassifica(root, ctx)));
    return;
  }

  const righe = withAppearances(risposta.rows);
  // Posizione ufficiale: ordine per Power Score con gli spareggi ufficiali.
  const ufficiali = ordinaRighe(righe, { chiave: "powerScore", direzione: "desc", spareggi: SPAREGGI_UFFICIALI.slice(1) });
  const posizioneDi = new Map(ufficiali.map((r, i) => [r.id, i + 1]));

  const memoria = memoriaOrdinamento("classifica", location.pathname, INIZIALE);
  const contenitore = el("div");
  const stagioneAttiva = risposta.season && risposta.season.name ? risposta.season.name : "";
  const suggerito = suggerisciNomeStagione(stagioneAttiva);

  /**
   * Il tasto "Nuova stagione" con il suo riquadro: si costruisce solo per
   * chi gestisce, con il permesso letto dallo stato nel momento del
   * disegno. Ritorna null per gli altri, così in pagina non resta nessun
   * testo nascosto.
   */
  function sezioneNuovaStagione() {
    if (!mostraNuovaStagione(utenteCollegato())) return null;
    if (!soloStagioneAttiva(risposta.season && risposta.season.id, idStagioneCorrente())) return null;

    const panel = el("div", { className: "pannello-gestione", attrs: { hidden: true } });
    const input = el("input", { className: "campo-gestione", attrs: { type: "text", maxlength: "20", value: suggerito } });
    const erroreNodo = el("p", { className: "nota-errore", text: "", attrs: { hidden: true } });
    const intro = el("div", { className: "gestione-fase", children: [
      el("label", { className: "etichetta-gestione", text: "Nome stagione", attrs: { for: "nuova-stagione-nome" } }),
      input,
      el("div", { className: "azione-gestione", children: [
        el("button", {
          className: "pulsante pulsante-grande",
          text: "Continua",
          attrs: { type: "button" },
          on: { click: () => {
            const nome = input.value.trim();
            if (!nome) {
              erroreNodo.textContent = "Il nome della stagione non può essere vuoto.";
              erroreNodo.hidden = false;
              return;
            }
            const conferma = panel.querySelector(".gestione-fase-conferma");
            const test = panel.querySelector(".nuova-stagione-testo");
            if (test) test.textContent = `Chiudere la stagione ${stagioneAttiva} e iniziare ${nome}? Classifica e statistiche ripartono da zero. Le partite della stagione chiusa restano consultabili ma non modificabili. L'operazione non si annulla.`;
            if (conferma) conferma.hidden = false;
            intro.hidden = true;
            erroreNodo.hidden = true;
          } },
        }),
      ]}),
    ]});
    const conferma = el("div", { className: "gestione-fase-conferma", attrs: { hidden: true }, children: [
      el("p", { className: "nuova-stagione-testo", text: "" }),
      el("div", { className: "azione-gestione", children: [
        el("button", {
          className: "pulsante pulsante-grande",
          text: "Conferma",
          attrs: { type: "button" },
          on: { click: async () => {
            const nome = input.value.trim();
            try {
              const esito = await api.nuovaStagione(nome);
              if (esito && esito.season) {
                ctx.navigate(withSeason("/classifica", esito.season.id));
                return;
              }
              throw new Error("Non riesco a creare la nuova stagione.");
            } catch (err) {
              erroreNodo.textContent = err instanceof Error ? err.message : "Non riesco a creare la nuova stagione.";
              erroreNodo.hidden = false;
              intro.hidden = false;
              conferma.hidden = true;
            }
          } },
        }),
        el("button", {
          className: "pulsante-secondario",
          text: "Annulla",
          attrs: { type: "button" },
          on: { click: () => {
            panel.hidden = true;
            intro.hidden = false;
            erroreNodo.hidden = true;
            conferma.hidden = true;
          } },
        }),
      ]}),
    ]});
    panel.append(intro, erroreNodo, conferma);
    const pulsanteNuova = el("button", {
      className: "pulsante pulsante-grande tasto-gestione-separato",
      text: "Nuova stagione",
      attrs: { type: "button" },
      on: { click: () => {
        panel.hidden = false;
        input.value = suggerisciNomeStagione(stagioneAttiva);
        intro.hidden = false;
        erroreNodo.hidden = true;
        conferma.hidden = true;
      } },
    });
    return el("div", { className: "gestione-sezione nuova-stagione-fondo", children: [pulsanteNuova, panel] });
  }

  function disegna() {
    const stato = memoria.ordinamento;
    const ordinate = ordinaRighe(righe, { chiave: stato.chiave, direzione: stato.direzione, spareggi: SPAREGGI_UFFICIALI });
    clear(contenitore);

    const testa = el("tr", {
      children: [
        ...COLONNE.map((c) => intestazione(c, stato, (colonna) => {
          memoria.ordinamento = prossimoStato(stato, colonna);
          disegna();
        })),
        el("th", { attrs: { scope: "col", "aria-sort": "none" }, text: "Rendimento" }),
      ],
    });
    const corpo = el("tbody");
    for (const riga of ordinate) {
      const bandierina = bandiera(riga.flag);
      const fascia = fasciaOverall(riga.overallUp);
      const indirizzo = withSeason(`/giocatori/${encodeURIComponent(riga.id)}`, ctx.stagione());
      const nome = el("a", {
        className: fascia ? `tabella-nome tabella-nome-corto fascia-${fascia}` : "tabella-nome tabella-nome-corto",
        attrs: {
          href: indirizzo,
          title: riga.name,
          "aria-label": fascia ? `${riga.name}, fascia ${fascia}, overall ${riga.overallUp}` : riga.name,
        },
        text: troncaNome(riga.name),
      });
      linkInterno(nome, ctx.navigate);
      let miniatura = null;
      if (typeof riga.stemma === "string" && riga.stemma !== "") {
        miniatura = el("img", {
          className: "tabella-stemma",
          attrs: { src: "/stemmi/" + encodeURIComponent(riga.stemma), alt: "", width: "64", height: "64", decoding: "async" },
        });
        miniatura.addEventListener("error", () => miniatura.remove());
      }
      const posizione = posizioneDi.get(riga.id) ?? 0;
      corpo.append(
        el("tr", {
          className: "riga-link",
          on: {
            click: (evento) => {
              const bersaglio = evento.target;
              if (bersaglio && bersaglio.closest && bersaglio.closest("a,button")) return;
              ctx.navigate(indirizzo);
            },
          },
          children: [
            el("th", {
              attrs: { scope: "row" },
              children: [
                el("span", {
                  className: "tabella-nome-cella",
                  children: [
                    el("span", {
                      className: "posizione",
                      text: String(posizione),
                      attrs: { "aria-hidden": "true" },
                    }),
                    bandierina,
                    nome,
                    miniatura,
                  ],
                }),
              ],
            }),
            cellaNumero(formatNumber(riga.powerScore, 1), false, true),
            el("td", { children: [forma(riga.formaArrow)] }),
            cellaNumero(intero(riga.played), zero(riga.played)),
            cellaNumero(intero(riga.V), zero(riga.V)),
            cellaNumero(intero(riga.P), zero(riga.P)),
            cellaNumero(intero(riga.S), zero(riga.S)),
            cellaNumero(intero(riga.goals), zero(riga.goals)),
            cellaNumero(riga.avgGoals === null || riga.avgGoals === undefined ? "—" : formatNumber(riga.avgGoals, 1), zero(riga.avgGoals)),
            cellaNumero(intero(riga.ownGoals), zero(riga.ownGoals)),
            cellaNumero(intero(riga.points), zero(riga.points)),
            cellaNumero(riga.avgPoints === null || riga.avgPoints === undefined ? "—" : formatNumber(riga.avgPoints, 1), zero(riga.avgPoints)),
            cellaNumero(intero(riga.mvp), zero(riga.mvp)),
            cellaNumero(intero(riga.guidinha), zero(riga.guidinha)),
            el("td", { children: [segniRendimento(riga.rendimento)], attrs: { "aria-label": "Rendimento ultime cinque, stella = MVP" } }),
          ],
        }),
      );
    }

    // La colonna attiva ha lo sfondo evidenziato.
    const indiceAttiva = COLONNE.findIndex((c) => c.id === stato.id);
    if (indiceAttiva >= 0) {
      for (const tr of corpo.children) {
        const cella = tr.children[indiceAttiva + 1];
        if (cella) cella.classList.add("colonna-attiva");
      }
    }

    const tabella = el("table", {
      className: "tabella",
      attrs: { "aria-label": `Classifica ${risposta.season.name}: posizione, punteggio e statistiche di ogni giocatore.` },
      children: [
        el("thead", { children: [testa] }),
        corpo,
      ],
    });
    contenitore.append(
      el("div", {
        className: "tabella-scorre",
        attrs: { tabindex: "0", role: "region", "aria-label": "Tabella scorrevole" },
        children: [tabella],
      }),
    );
  }

  clear(root);
  root.append(titolo("Classifica"));
  root.append(el("p", { className: "nota", text: `${risposta.season.name} · ${righe.length} in classifica` }));

  // Tasto verso il contest: sta su root, sopra la tabella e fuori da
  // contenitore, così i clear(contenitore) dei riordini non lo cancellano.
  // Si vede a tutti, anche con classifica vuota.
  if (mostraTastoPremi(utenteCollegato(), righe)) {
    const premi = el("a", {
      className: "pulsante pulsante-grande tasto-gestione-separato",
      attrs: { href: hrefPremi(ctx.stagione()) },
      text: "🏆 Premi della stagione",
    });
    linkInterno(premi, ctx.navigate);
    root.append(premi);
  }

  if (righe.length === 0) {
    root.append(el("p", { className: "nota", text: "Non risultano ancora partite pubblicate." }));
  } else {
    root.append(contenitore);
    disegna();
  }

  // In fondo, dopo la tabella (o la nota dello stato vuoto): sta sopra
  // root, quindi i clear(contenitore) dei riordini non lo cancellano.
  const gestione = sezioneNuovaStagione();
  if (gestione) root.append(gestione);
}
