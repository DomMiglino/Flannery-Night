// Passo 4: scheda del giocatore. Esagono in alto, statistiche della stagione
// scelta e, se sono collegato e non è la mia scheda, la votazione.

import { ApiError, api, nonAutorizzato } from "../api.js";
import { clear, el } from "../dom.js";
import { clamp, formatNumber, formatOverall, formatVotes } from "../format.js";
import { ATTRIBUTI, valoriDaVoto, valoriIniziali, votiPerTarget } from "../ratings.js";
import { cella, errore, esiti, rendimento, riepilogo, scheletro, titolo } from "../ui.js";

const NOMI_ATTRIBUTI = {
  velTuf: "Velocità",
  tirPre: "Tiri",
  passRin: "Passaggi",
  driRif: "Conduzione",
  difRea: "Difesa",
  fisPia: "Fisico",
};

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

  clear(root);
  root.append(titolo("Giocatore"));
  root.append(
    riepilogo({
      nome: scheda.name,
      ruolo: scheda.role,
      flag: scheda.flag,
      mediane: mediana,
      mio: valoriDaVoto(mioVoto),
      overall: scheda.overall,
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
  root.append(renderVotazione(scheda, mediana, mioVoto, ctx, conferma));
}

function renderVotazione(scheda, mediana, mioVoto, ctx, conferma) {
  const salvato = mioVoto !== null;
  const valori = valoriIniziali(mediana, valoriDaVoto(mioVoto));

  const messaggio = el("p", { className: "nota", attrs: { role: "status" } });
  messaggio.textContent =
    conferma ||
    (salvato ? "Voto già salvato: puoi cambiarlo e salvare di nuovo." : "Non ancora salvato: premi Salva voto per registrare le sei scelte.");

  const righe = el("div");
  const campi = {};

  for (const chiave of ATTRIBUTI) {
    const campo = el("input", {
      className: "voto-campo",
      attrs: {
        type: "number",
        inputmode: "numeric",
        min: "1",
        max: "99",
        step: "1",
        value: String(valori[chiave]),
        "aria-label": `Il tuo voto per ${NOMI_ATTRIBUTI[chiave]}`,
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

    righe.append(
      el("div", {
        className: "voto-riga",
        children: [
          el("span", { className: "voto-nome", text: NOMI_ATTRIBUTI[chiave] }),
          el("span", { className: "voto-mediana", text: `mediana ${mediana[chiave] === null ? "—" : formatOverall(mediana[chiave])}` }),
          el("span", {
            className: "voto-controlli",
            children: [
              el("button", {
                className: "voto-passo",
                text: "−",
                attrs: { type: "button", "aria-label": `Un punto in meno a ${NOMI_ATTRIBUTI[chiave]}` },
                on: { click: () => sposta(-1) },
              }),
              campo,
              el("button", {
                className: "voto-passo",
                text: "+",
                attrs: { type: "button", "aria-label": `Un punto in più a ${NOMI_ATTRIBUTI[chiave]}` },
                on: { click: () => sposta(1) },
              }),
            ],
          }),
        ],
      }),
    );
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