// Pagina pubblica dei premi con il Flannery Pub.
// Solo testo statico: nessuna chiamata di rete, nessun dato salvato.
// L'assegnazione dei premi resta manuale, fuori dal sito.

import { clear, el, linkInterno } from "../dom.js";
import { withSeason } from "../routes.js";

export const TITOLO_PAGINA = "Premi Flannery";
export const URL_INSTAGRAM = "https://www.instagram.com/flannerypub/?hl=it";
export const PERCORSO_CLASSIFICA = "/classifica";
export const PERCORSO_CONTEST = "/contest";

/**
 * I tre premi in ordine: etichetta con numero e pezzi di descrizione.
 * I simboli grafici non stanno qui: vivono solo nella vista, dentro
 * elementi a parte nascosti alla lettura vocale.
 */
export const PREMI = [
  {
    posto: "1° classificato",
    tono: "contest-card-oro",
    pezzi: [
      "T-shirt celebrativa con nome personalizzato e le firme di tutti i partecipanti",
      "; panino e birra da 1 litro.",
    ],
  },
  {
    posto: "2° classificato",
    tono: "contest-card-argento",
    pezzi: ["T-shirt Guinness", "; panino e birra da mezzo litro."],
  },
  {
    posto: "3° classificato",
    tono: "contest-card-bronzo",
    pezzi: ["panino e birra da mezzo litro."],
  },
];

/** Descrizione intera di un premio, senza simboli grafici. */
export function testoPremio(premio) {
  return premio.pezzi.join("");
}

/** Ritorno alla classifica tenendo la stagione scelta quando c'è. */
export function hrefClassifica(stagione) {
  return withSeason(PERCORSO_CLASSIFICA, stagione);
}

/** Indirizzo del contest tenendo la stagione scelta quando c'è. */
export function hrefContest(stagione) {
  return withSeason(PERCORSO_CONTEST, stagione);
}

/**
 * Simbolo grafico decorativo in un elemento a parte con aria-hidden,
 * così resta fuori dalla lettura vocale e il testo resta pieno da solo.
 */
function voceIcona(simbolo, classe) {
  return el("span", { className: classe, attrs: { "aria-hidden": "true" }, text: simbolo });
}

export async function renderContest(root, ctx) {
  clear(root);

  root.append(
    el("header", {
      className: "contest-hero contest-anim",
      children: [
        el("h2", {
          className: "contest-titolo",
          children: [
            el("span", { className: "contest-titolo-testo", text: TITOLO_PAGINA }),
            voceIcona("🏆🍺", "contest-coppa"),
          ],
        }),
        el("p", {
          className: "contest-sottotitolo",
          text: "Una collaborazione tra Flannery Night e il Flannery Pub di Fuorigrotta: ai primi tre della classifica generale della stagione 2026/27 vanno questi premi.",
        }),
      ],
    }),
  );

  const lista = el("ol", { className: "contest-lista" });
  lista.append(
    el("li", {
      className: `contest-card ${PREMI[0].tono}`,
      children: [
        el("div", {
          className: "contest-riga-posto",
          children: [
            voceIcona("🥇", "contest-medaglia"),
            el("span", { className: "contest-posto", text: PREMI[0].posto }),
          ],
        }),
        el("p", {
          className: "contest-testo",
          children: [
            el("span", { text: PREMI[0].pezzi[0] }),
            voceIcona("👕", "contest-ico"),
            el("span", { text: PREMI[0].pezzi[1] }),
            voceIcona("🍔🍺", "contest-ico"),
          ],
        }),
      ],
    }),
  );
  lista.append(
    el("li", {
      className: `contest-card ${PREMI[1].tono}`,
      children: [
        el("div", {
          className: "contest-riga-posto",
          children: [
            voceIcona("🥈", "contest-medaglia"),
            el("span", { className: "contest-posto", text: PREMI[1].posto }),
          ],
        }),
        el("p", {
          className: "contest-testo",
          children: [
            el("span", { text: PREMI[1].pezzi[0] }),
            voceIcona("👕", "contest-ico"),
            el("span", { text: PREMI[1].pezzi[1] }),
            voceIcona("🍔🍺", "contest-ico"),
          ],
        }),
      ],
    }),
  );
  lista.append(
    el("li", {
      className: `contest-card ${PREMI[2].tono}`,
      children: [
        el("div", {
          className: "contest-riga-posto",
          children: [
            voceIcona("🥉", "contest-medaglia"),
            el("span", { className: "contest-posto", text: PREMI[2].posto }),
          ],
        }),
        el("p", {
          className: "contest-testo",
          children: [
            el("span", { text: PREMI[2].pezzi[0] }),
            voceIcona("🍔🍺", "contest-ico"),
          ],
        }),
      ],
    }),
  );
  root.append(
    el("section", {
      className: "contest-sezione contest-anim contest-ritardo-1",
      attrs: { "aria-label": "Premi" },
      children: [el("h3", { className: "contest-sezione-titolo", text: "Premi" }), lista],
    }),
  );

  const stagione = ctx && ctx.stagione ? ctx.stagione() : null;
  const versoClassifica = hrefClassifica(stagione);
  const linkClassifica = el("a", {
    className: "contest-link",
    attrs: { href: versoClassifica },
    text: "Classifica",
  });
  if (ctx && ctx.navigate) linkInterno(linkClassifica, ctx.navigate);
  root.append(
    el("section", {
      className: "contest-sezione contest-anim contest-ritardo-2",
      children: [
        el("h3", {
          className: "contest-sezione-titolo",
          children: [el("span", { text: "Come si vince" }), voceIcona("📅", "contest-ico")],
        }),
        el("p", {
          className: "contest-testo",
          children: [
            el("span", {
              text: "Contano i primi tre posti della Classifica generale al termine della stagione, con l'ultima partita, prevista nelle ultime settimane di luglio 2027. La classifica è quella che vedi nella pagina ",
            }),
            linkClassifica,
            el("span", { text: "." }),
          ],
        }),
      ],
    }),
  );

  root.append(
    el("section", {
      className: "contest-sezione contest-anim contest-ritardo-3",
      children: [
        el("h3", {
          className: "contest-sezione-titolo",
          children: [el("span", { text: "Pallone d'Oro 2026/27" }), voceIcona("⚽🏅", "contest-ico")],
        }),
        el("p", {
          className: "contest-testo",
          text: "Indipendentemente dalla classifica, tutti i partecipanti con almeno 30 presenze nella stagione votano il miglior giocatore dell'anno. Ogni votante assegna, in segreto, 5, 3 e 1 punti a tre giocatori. Chi totalizza più punti vince il Pallone d'Oro 2026/27 e la coppa, che passa di anno in anno con una targhetta con il nome del vincitore. Le modalità di voto vengono comunicate nel gruppo.",
        }),
      ],
    }),
  );

  root.append(
    el("section", {
      className: "contest-sezione contest-anim contest-ritardo-4",
      children: [
        el("h3", {
          className: "contest-sezione-titolo",
          children: [el("span", { text: "Seguici su Instagram" }), voceIcona("📸", "contest-ico")],
        }),
        el("a", {
          className: "pulsante pulsante-grande contest-instagram",
          attrs: {
            href: URL_INSTAGRAM,
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-label": "Segui il Flannery Pub su Instagram, si apre in una nuova scheda",
          },
          text: "Segui il Flannery Pub su Instagram",
        }),
      ],
    }),
  );

  const indietro = el("a", {
    className: "pulsante pulsante-secondario pulsante-grande contest-indietro contest-anim contest-ritardo-4",
    attrs: { href: versoClassifica },
    children: [voceIcona("⬅️", "contest-ico"), el("span", { text: "Torna alla Classifica" })],
  });
  if (ctx && ctx.navigate) linkInterno(indietro, ctx.navigate);
  root.append(indietro);
}
