// Passo 4: classifica. Lista compatta: posizione, bandiera, nome,
// Flannery Power Score, freccia di forma e giocate. Toccando la riga
// si apre la scheda del giocatore, che ha tutte le altre cifre.

import { ApiError, api } from "../api.js";
import { clear, el, linkInterno } from "../dom.js";
import { formatNumber } from "../format.js";
import { withAppearances } from "../lists.js";
import { bandiera, errore, forma, scheletro, titolo } from "../ui.js";
import { withSeason } from "../routes.js";

export async function renderClassifica(root, ctx) {
  clear(root);
  root.append(titolo("Classifica"));
  root.append(scheletro(8));

  try {
    const risposta = await api.ranking(ctx.stagione());
    const righe = withAppearances(risposta.rows);
    clear(root);
    root.append(titolo("Classifica"));
    root.append(el("p", { className: "nota", text: `${risposta.season.name} · ${righe.length} in classifica` }));

    if (righe.length === 0) {
      root.append(el("p", { className: "nota", text: "Non risultano ancora partite pubblicate." }));
      return;
    }

    const elenco = el("ul", { className: "elenco" });
    righe.forEach((riga, indice) => {
      const bandierina = bandiera(riga.flag);
      const voce = el("li", { children: [] });
      const link = el("a", {
        className: "voce voce-griglia",
        attrs: { href: withSeason(`/giocatori/${encodeURIComponent(riga.id)}`, ctx.stagione()) },
        children: [
          el("span", { className: "posizione", text: String(indice + 1), attrs: { "aria-hidden": "true" } }),
          bandierina,
          el("span", {
            className: "voce-testa",
            children: [
              el("span", { className: "voce-nome", text: riga.name }),
              el("span", { className: "voce-sottotitolo", text: `${riga.role} · ${riga.played} ${riga.played === 1 ? "giocata" : "giocate"}` }),
            ],
          }),
          el("span", {
            className: "voce-numeri",
            children: [
              forma(riga.formaArrow),
              el("span", { className: "punteggio", text: formatNumber(riga.powerScore, 1) }),
            ],
          }),
        ],
      });
      linkInterno(link, ctx.navigate);
      voce.append(link);
      elenco.append(voce);
    });
    root.append(elenco);
  } catch (erroreApi) {
    const messaggio = erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati";
    clear(root);
    root.append(titolo("Classifica"));
    root.append(errore(messaggio, () => renderClassifica(root, ctx)));
  }
}
