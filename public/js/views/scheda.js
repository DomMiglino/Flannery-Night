// Passo 4: scheda del giocatore. Esagono in alto, statistiche della stagione
// scelta e, se sono collegato e non è la mia scheda, la votazione.

import { ApiError, api, nonAutorizzato } from "../api.js";
import { clear, el } from "../dom.js";
import { clamp, formatNumber, formatVotes } from "../format.js";
import { ATTRIBUTI, dettagliPerRuolo, etichettePerRuolo, valoriDaVoto, valoriIniziali, vociRiferimento, votiPerTarget } from "../ratings.js";
import { cella, errore, esiti, rendimento, riepilogo, scheletro, titolo } from "../ui.js";

export async function renderScheda(root, ctx, playerId, conferma = null) {
  clear(root);
  root.append(scheletro(6));

  let scheda;
  try {
    scheda = await api.player(playerId, ctx.stagione());
  } catch (erroreApi) {
    clear(root);
    root.append(titolo("Giocatore"));
    root.append(
      errore(erroreApi instanceof ApiError && erroreApi.status === 404 ? "Giocatore non trovato" : "Non riesco a caricare i dati", () =>
        renderScheda(root, ctx, playerId),
      ),
    );
    return;
  }

  let mioVoto = null;
  if (ctx.collegato()) {
    try {
      const voti = (await api.myVotes()).votes || [];
      mioVoto = votiPerTarget(voti).get(scheda.id) || null;
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
    }
  }

  const mediana = {
    velTuf: scheda.velTuf,
    tirPre: scheda.tirPre,
    passRin: scheda.passRin,
    driRif: scheda.driRif,
    difRea: scheda.difRea,
    fisPia: scheda.fisPia,
  };

  const me = ctx.me();
  const gestione = !!me && me.isAdmin === true;

  clear(root);
  root.append(titolo("Giocatore"));
  if (gestione) {
    root.append(
      el("div", {
        className: "partita-strumenti",
        children: [
          el("button", {
            className: "tasto-modifica",
            text: "Modifica",
            attrs: { type: "button", "aria-label": `Modifica ${scheda.name}` },
            on: { click: () => ctx.navigate(`/giocatori/${encodeURIComponent(scheda.id)}/modifica`) },
          }),
        ],
      }),
    );
  }
  root.append(
    riepilogo({
      nome: scheda.name,
      ruolo: scheda.role,
      flag: scheda.flag,
      stemma: scheda.stemma ?? null,
      variante: "scheda",
      mediane: mediana,
      mio: valoriDaVoto(mioVoto),
      overallUp: scheda.overallUp,
      voti: scheda.votes,
    }),
  );

  const stats = scheda.stats;
  root.append(el("h3", { className: "titolo-gruppo", text: `Stagione ${scheda.season.name}` }));
  root.append(
    el("div", {
      className: "griglia",
      children: [
        cella("Giocate", String(stats.played)),
        cella("V-P-S", `${stats.V}-${stats.P}-${stats.S}`),
        cella("Gol", String(stats.goals)),
        cella("Autogol", String(stats.ownGoals)),
        cella("MVP", String(stats.mvp)),
        cella("Guidinha", String(stats.guidinha)),
        cella("Power Score", formatNumber(stats.powerScore, 1)),
        cella("Forma", `${stats.formaArrow}`),
      ],
    }),
  );

  root.append(el("h3", { className: "titolo-gruppo", text: "Esiti nelle ultime cinque" }));
  root.append(rendimento(stats.rendimento));

  if (Array.isArray(scheda.last5) && scheda.last5.length > 0) {
    root.append(el("h3", { className: "titolo-gruppo", text: "Ultime partite" }));
    const elenco = el("ul", { className: "elenco" });
    for (const partita of scheda.last5) {
      elenco.append(
        el("li", {
          className: "voce",
          children: [
            el("span", {
              className: "voce-testa",
              children: [
                el("span", { className: "voce-nome", text: `${partita.team} ${partita.score} ${partita.opponent}` }),
                el("span", {
                  className: "voce-sottotitolo",
                  text: [
                    partita.goals === 1 ? "1 gol" : `${partita.goals} gol`,
                    partita.ownGoals > 0 ? `${partita.ownGoals === 1 ? "1 autogol" : `${partita.ownGoals} autogol`}` : null,
                    partita.label,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }),
              ],
            }),
            partita.mvp ? el("span", { className: "badge-mvp", text: "MVP" }) : null,
          ],
        }),
      );
    }
    root.append(elenco);
  }

  if (!ctx.collegato()) {
    root.append(el("p", { className: "nota", text: "Accedi per votare i giocatori." }));
    return;
  }
  if (ctx.me().id === scheda.id) {
    root.append(el("h3", { className: "titolo-gruppo", text: "Il tuo voto" }));
    root.append(el("p", { className: "nota nota-avviso", text: "Non puoi votare te stesso." }));
    return;
  }

  root.append(el("h3", { className: "titolo-gruppo", text: "Il tuo voto" }));
  root.append(renderVotazione(scheda, scheda.riferimenti, mioVoto, ctx, conferma));
}

function renderVotazione(scheda, riferimenti, mioVoto, ctx, conferma) {
  const salvato = mioVoto !== null;
  const valori = valoriIniziali(valoriDaVoto(mioVoto));
  // Un solo nome per attributo: variante da portiere per il ruolo P.
  const etichette = etichettePerRuolo(scheda.role);
  const dettagli = dettagliPerRuolo(scheda.role);
  const perChiave = new Map(dettagli.map((d) => [d.chiave, d]));

  const messaggio = el("p", { className: "nota", attrs: { role: "status" } });
  messaggio.textContent =
    conferma ||
    (salvato ? "Voto già salvato: puoi cambiarlo e salvare di nuovo." : "Non ancora salvato: premi Salva voto per registrare le sei scelte.");

  const righe = el("div");
  const campi = {};

  for (const { chiave, sigla, significato } of etichette) {
    const info = perChiave.get(chiave) || { nome: significato, descrizione: "" };
    const campo = el("input", {
      className: "voto-campo",
      attrs: {
        type: "number",
        inputmode: "numeric",
        min: "1",
        max: "99",
        step: "1",
        value: String(valori[chiave]),
        "aria-label": `Il tuo voto per ${info.nome}`,
      },
      on: {
        input: (evento) => {
          valori[chiave] = clamp(evento.target.value, 1, 99);
          if (salvato && messaggio.className === "nota-ok") {
            messaggio.className = "nota";
            messaggio.textContent = "Modifiche non ancora salvate.";
          }
        },
      },
    });
    campi[chiave] = campo;

    const sposta = (delta) => {
      valori[chiave] = clamp(Number(valori[chiave]) + delta, 1, 99);
      campo.value = String(valori[chiave]);
      if (salvato && messaggio.className === "nota-ok") {
        messaggio.className = "nota";
        messaggio.textContent = "Modifiche non ancora salvate.";
      }
    };

    const indice = ATTRIBUTI.indexOf(chiave);
    const lista = Array.isArray(riferimenti) && Array.isArray(riferimenti[indice]) ? riferimenti[indice] : [];
    const voci = vociRiferimento(lista);
    const testa = el("div", {
      className: "voto-testa",
      children: [
        el("span", {
          className: "voto-titolo",
          attrs: { title: info.nome },
          children: [el("span", { className: "voto-sigla", text: sigla }), document.createTextNode(` ${info.nome}`)],
        }),
        el("span", {
          className: "voto-controlli",
          children: [
            el("button", {
              className: "voto-passo",
              text: "−",
              attrs: { type: "button", "aria-label": `Un punto in meno a ${info.nome}` },
              on: { click: () => sposta(-1) },
            }),
            campo,
            el("button", {
              className: "voto-passo",
              text: "+",
              attrs: { type: "button", "aria-label": `Un punto in più a ${info.nome}` },
              on: { click: () => sposta(1) },
            }),
          ],
        }),
      ],
    });
    const figliRiga = [testa, el("p", { className: "voto-descrizione", text: info.descrizione })];
    if (voci.length > 0) {
      const nodiVoci = voci.map((voce) => {
        const visibile = `${voce.nome} ${voce.punteggio}`;
        const titolo = voce.sr ? `${voce.sr}: ${visibile}` : visibile;
        const dentro = [];
        if (voce.simbolo) dentro.push(el("span", { className: "voto-freccia", text: voce.simbolo, attrs: { "aria-hidden": "true" } }));
        if (voce.sr) dentro.push(el("span", { className: "solo-lettori", text: voce.sr }));
        dentro.push(el("span", { text: visibile }));
        return el("span", { className: "voto-riferimento", attrs: { title: titolo }, children: dentro });
      });
      figliRiga.push(el("div", { className: "voto-riferimenti", children: nodiVoci }));
    }

    righe.append(el("div", { className: "voto-riga", children: figliRiga }));
  }

  const invia = el("button", { className: "pulsante pulsante-grande", text: "Salva voto", attrs: { type: "submit" } });

  const modulo = el("form", {
    className: "votazione",
    attrs: { novalidate: "novalidate" },
    children: [righe, messaggio, el("div", { className: "pulsanti", children: [invia] })],
    on: {
      submit: (evento) => {
        evento.preventDefault();
        if (!invia.disabled) invia.click();
      },
    },
  });

  invia.addEventListener("click", async () => {
    const payload = {};
    for (const chiave of ATTRIBUTI) {
      const n = clamp(valori[chiave], 1, 99);
      if (!Number.isFinite(n)) {
        messaggio.className = "nota-errore";
        messaggio.textContent = "Tutti i voti devono stare fra 1 e 99.";
        return;
      }
      payload[chiave] = n;
    }
    invia.disabled = true;
    messaggio.className = "nota";
    messaggio.textContent = "Salvo…";
    try {
      const risposta = await api.putVote(scheda.id, payload);
      // Il server rimanda mediane e overall già ricalcolati: si ridisegna.
      await renderScheda(ctx.root, ctx, scheda.id, `Voto salvato. Ora ${formatVotes(risposta.voters)}.`);
    } catch (erroreApi) {
      // Sessione scaduta durante il voto: si torna non collegati e
      // all'accesso, senza perdere la pagina in cui si era.
      if (nonAutorizzato(erroreApi)) {
        ctx.sessioneScaduta();
        return;
      }
      messaggio.className = "nota-errore";
      messaggio.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a salvare il voto";
      invia.disabled = false;
    }
  });

  return modulo;
}