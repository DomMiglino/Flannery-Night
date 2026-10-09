// Passo 4: pezzi di interfaccia usati da più viste.

import { clear, el, svg } from "./dom.js";
import { flagUrl, formatOverallUp, formatVotes, formaClasse, formaLabel } from "./format.js";
import { infoStemma } from "./ratings.js";
import { ANELLI, ASSI, GEOMETRIA, labelPositions, polygonPoints, ringPoints, valuesInOrder } from "./hexagon.js";

/** Titolo di sezione. */
export function titolo(testo) {
  return el("h2", { className: "titolo-sezione", text: testo });
}

export function nota(testo, classe = "nota") {
  return el("p", { className: classe, text: testo });
}

/** Scheletri con l'altezza delle righe vere: nulla salta in basso. */
export function scheletro(quante = 6) {
  const blocco = el("div", { className: "scheletri", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < quante; i++) blocco.append(el("div", { className: "scheletro" }));
  return blocco;
}

/**
 * Indicatore di caricamento unico: anello che gira e scritta
 * "Caricamento" coi puntini animati via CSS. Compare con ritardo
 * (niente lampeggi sui caricamenti brevi) e sparisce con clear().
 */
export function attesa() {
  return el("div", {
    className: "attesa",
    attrs: { role: "status", "aria-live": "polite" },
    children: [
      el("span", { className: "attesa-anello", attrs: { "aria-hidden": "true" } }),
      el("p", {
        className: "attesa-testo",
        children: [
          document.createTextNode("Caricamento"),
          el("span", { className: "attesa-punti", attrs: { "aria-hidden": "true" } }),
        ],
      }),
    ],
  });
}

/** Stato di errore con il tasto Riprova. */
export function errore(messaggio, onRiprova) {
  return el("div", {
    className: "blocco-errore",
    children: [
      el("p", { className: "nota-errore", text: messaggio }),
      onRiprova ? el("button", { className: "pulsante", text: "Riprova", attrs: { type: "button" }, on: { click: onRiprova } }) : null,
    ],
  });
}

/** Freccia di forma, con testo per chi non vede il simbolo. */
export function forma(arrow) {
  const etichetta = formaLabel(arrow);
  const span = el("span", {
    className: formaClasse(arrow),
    attrs: etichetta
      ? { role: "img", "aria-label": `Forma ${etichetta}` }
      : { "aria-hidden": "true" },
  });
  span.append(el("span", { text: arrow || "→", attrs: { "aria-hidden": "true" } }));
  return span;
}

const bandieraCache = new Map();

/**
 * Immagine della bandiera. Se il file non c'è non viene mostrato nulla:
 * niente icone rotte. Il risultato è messo in cache per flag.
 */
export function bandiera(flag) {
  const url = flagUrl(flag);
  if (!url) return null;
  const container = el("span", { className: "bandiera-contenitore" });
  const cached = bandieraCache.get(url);
  if (cached === false) return null;
  if (cached) {
    container.append(cached.cloneNode(true));
    return container;
  }
  const img = el("img", { className: "bandiera", attrs: { alt: "", loading: "lazy", decoding: "async", src: url } });
  img.addEventListener("load", () => bandieraCache.set(url, img));
  img.addEventListener("error", () => bandieraCache.set(url, false));
  container.append(img);
  return container;
}

/** Cella di statistica. */
export function cella(etichetta, valore) {
  return el("div", {
    className: "cella",
    children: [
      el("span", { className: "cella-etichetta", text: etichetta }),
      el("span", { className: "cella-valore", text: valore }),
    ],
  });
}

/** V-P-S con colori. */
export function esiti(stats) {
  return el("span", {
    className: "esito",
    attrs: { "aria-label": `Vinte ${stats.V}, pareggi ${stats.P}, perse ${stats.S}` },
    children: [
      el("span", { className: "esito esito-v", text: `${stats.V} V` }),
      el("span", { className: "esito esito-p", text: `${stats.P} P` }),
      el("span", { className: "esito esito-s", text: `${stats.S} S` }),
    ],
  });
}

/**
 * Toglie l'asterisco di MVP dall'etichetta del rendimento: {testo, mvp}.
 * "V*" diventa {testo: "V", mvp: true}, "P" resta {testo: "P", mvp: false}.
 */
export function separaMvp(etichetta) {
  const intera = String(etichetta ?? "");
  const mvp = intera.endsWith("*");
  return { testo: mvp ? intera.slice(0, -1) : intera, mvp };
}

/** Le ultime cinque partite: l'asterisco segna l'MVP. */
export function rendimento(lista) {
  const ul = el("ul", { className: "rendimento" });
  for (const label of lista || []) {
    const { testo, mvp } = separaMvp(label);
    ul.append(
      el("li", {
        attrs: mvp ? { title: "MVP" } : {},
        children: [
          el("span", { text: testo, attrs: { "aria-hidden": "true" } }),
          el("span", {
            className: "solo-lettori",
            text: mvp ? " con MVP" : "",
          }),
          mvp ? el("span", { className: "etichetta-mvp", text: "★", attrs: { "aria-hidden": "true" } }) : null,
        ],
      }),
    );
  }
  return ul;
}

/**
 * Esagono dei sei assi. Un solo nome per asse (variante da portiere per
 * il ruolo P). Con zero voti ricevuti non si disegna nessun poligono e
 * compare la scritta di attesa. Se ho un mio voto, in verde tratteggiato
 * sopra le mediane. L'overall è quello per eccesso già calcolato dal
 * server: il browser non arrotonda niente.
 */
export function esagono({ mediane, mio, overallUp = null, voti = 0, ruolo = "" }) {
  const valori = valuesInOrder(mediane);
  const haMediane = voti > 0;
  const haMio = mio && ATTRIBUTI_CON_VALORI.every((k) => Number.isFinite(Number(mio[k])));

  const elementi = [];
  for (const livello of ANELLI) {
    elementi.push(svg("polygon", { class: "esagono-anello", points: ringPoints(livello) }));
  }
  if (haMediane) {
    elementi.push(svg("polygon", { class: "esagono-mediane", points: polygonPoints(valori) }));
  }
  if (haMio) {
    elementi.push(svg("polygon", { class: "esagono-mio", points: polygonPoints(valuesInOrder(mio)) }));
  }
  for (const posizione of labelPositions(ruolo)) {
    elementi.push(svg("text", { class: "esagono-etichetta", x: posizione.x, y: posizione.y, "text-anchor": posizione.ancora }, [posizione.testo]));
  }
  if (haMediane) {
    elementi.push(
      svg("text", { class: "esagono-overall", x: GEOMETRIA.cx, y: GEOMETRIA.cy, "text-anchor": "middle", "dominant-baseline": "middle" }, [
        formatOverallUp(overallUp),
      ]),
    );
  } else {
    elementi.push(
      svg("text", { class: "esagono-vuoto", x: GEOMETRIA.cx, y: GEOMETRIA.cy, "text-anchor": "middle", "dominant-baseline": "middle" }, [
        "Ancora nessun voto ricevuto",
      ]),
    );
  }

  return svg(
    "svg",
    {
      class: "esagono",
      viewBox: `0 0 ${GEOMETRIA.cx * 2} ${GEOMETRIA.cy * 2 + 6}`,
      role: "img",
      "aria-label": haMediane
        ? `Esagono delle sei caratteristiche, media ricevuta ${formatOverallUp(overallUp)} con ${formatVotes(voti)}`
        : "Esagono delle sei caratteristiche, nessun voto ricevuto",
    },
    elementi,
  );
}

const ATTRIBUTI_CON_VALORI = ASSI.map((a) => a.chiave);

/**
 * Nome, ruolo o stemma, esagono e numero di voti: l'intestazione
 * di Home e scheda. Con lo stemma l'immagine prende il posto della
 * scritta del ruolo; se non carica torna la scritta.
 */
export function riepilogo({ nome, ruolo, flag, stemma = null, variante = "", mostraVoti = true, mediane, mio, overallUp, voti }) {
  const bandierina = bandiera(flag);
  const marca = infoStemma({ name: nome, role: ruolo, stemma });
  let rigaRuolo;
  if (marca) {
    const classe =
      variante === "home"
        ? "riassunto-stemma riassunto-stemma-home"
        : variante === "scheda"
          ? "riassunto-stemma riassunto-stemma-scheda"
          : "riassunto-stemma";
    const img = el("img", {
      className: classe,
      attrs: { src: marca.src, alt: marca.alt, width: "512", height: "512", decoding: "async" },
    });
    img.addEventListener("error", () => {
      img.replaceWith(el("p", { className: "riassunto-ruolo", text: String(ruolo || "") }));
    });
    rigaRuolo = img;
  } else {
    rigaRuolo = el("p", { className: "riassunto-ruolo", text: String(ruolo || "") });
  }
  const capezzale = el("div", {
    className: "riassunto",
    children: [
      el("h2", {
        className: "riassunto-nome",
        children: bandierina ? [bandierina, document.createTextNode(` ${nome}`)] : [document.createTextNode(String(nome))],
      }),
      rigaRuolo,
      esagono({ mediane, mio, overallUp, voti, ruolo }),
      mostraVoti ? (voti > 0 ? nota(formatVotes(voti), "nota") : nota("Ancora nessun voto ricevuto", "nota")) : null,
    ],
  });
  return capezzale;
}

export { clear };