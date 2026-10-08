// Home personale, visibile solo con l'accesso: il mio esagono e,
// come nella scheda giocatore, le info della stagione attuale.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { formatNumber } from "../format.js";
import { valoriDaVoto, votiPerTarget } from "../ratings.js";
import { cella, errore, rendimento, riepilogo, scheletro } from "../ui.js";

export async function renderHome(root, ctx) {
  if (!ctx.collegato()) {
    ctx.navigate("/accesso", { sostituisci: true });
    return;
  }
  clear(root);
  root.append(scheletro(4));

  const me = ctx.me();
  try {
    const scheda = await api.player(me.id, ctx.stagione());
    let mio = null;
    try {
      const voti = (await api.myVotes()).votes || [];
      mio = votiPerTarget(voti).get(scheda.id) || null;
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
    }

    clear(root);
    root.append(
      riepilogo({
        nome: scheda.name,
        ruolo: scheda.role,
        flag: scheda.flag,
        stemma: scheda.stemma ?? null,
        variante: "home",
        mostraVoti: false,
        mediane: scheda,
        mio: valoriDaVoto(mio),
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
  } catch (erroreApi) {
    clear(root);
    root.append(
      errore(erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati", () =>
        renderHome(root, ctx),
      ),
    );
  }
}