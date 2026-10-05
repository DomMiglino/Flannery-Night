// Passo 4: geometria dell'esagono dei sei assi. Funzioni pure.
// Il primo asse parte dall'alto e gli altri seguono a 60 gradi:
// VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA.

export const ASSI = [
  { chiave: "velTuf", sopra: "VEL", sotto: "TUF" },
  { chiave: "tirPre", sopra: "TIR", sotto: "PRE" },
  { chiave: "passRin", sopra: "PASS", sotto: "RIN" },
  { chiave: "driRif", sopra: "DRI", sotto: "RIF" },
  { chiave: "difRea", sopra: "DIF", sotto: "REA" },
  { chiave: "fisPia", sopra: "FIS", sotto: "PIA" },
];

/** Tre anelli di riferimento sulla scala 0-100. */
export const ANELLI = [33.3, 66.6, 100];

export const GEOMETRIA = { cx: 110, cy: 112, r: 78 };

const GRADI = 180 / Math.PI;

export function clampValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Angolo in radianti dell'asse: il primo è in alto, poi a 60 gradi. */
export function axisAngle(index) {
  return (-90 + index * 60) * (Math.PI / 180);
}

/** Punto sull'asse: il valore 100 arriva sul raggio massimo. */
export function axisPoint(index, value, geo = GEOMETRIA) {
  const lunghezza = (clampValue(value) / 100) * geo.r;
  const angolo = axisAngle(index);
  return {
    x: geo.cx + lunghezza * Math.cos(angolo),
    y: geo.cy + lunghezza * Math.sin(angolo),
  };
}

function punto(p) {
  return `${round1(p.x)},${round1(p.y)}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Poligono pieno con i sei valori, nell'ordine degli assi. */
export function polygonPoints(values, geo = GEOMETRIA) {
  return ASSI.map((asse, i) => punto(axisPoint(i, values[i], geo))).join(" ");
}

/** Poligono di uno degli anelli di riferimento. */
export function ringPoints(level, geo = GEOMETRIA) {
  return ASSI.map((_, i) => punto(axisPoint(i, level, geo))).join(" ");
}

/**
 * Posizione delle etichette: la metà "sopra" sta oltre il raggio massimo,
 * la metà "sotto" sta dentro, verso il centro. Ritorna anche l'allineamento
 * del testo, così le etichette non escono dal riquadro.
 */
export function labelPositions(geo = GEOMETRIA) {
  const fuori = 15;
  return ASSI.map((asse, i) => {
    const esterno = axisPoint(i, 100, geo);
    const interno = axisPoint(i, 0, geo);
    const angolo = axisAngle(i);
    const sopra = {
      x: esterno.x + fuori * Math.cos(angolo),
      y: esterno.y + fuori * Math.sin(angolo),
      testo: asse.sopra,
      ancora: ancoraPer(esterno.x, geo.cx),
    };
    const dentro = {
      x: interno.x + 14 * Math.cos(angolo),
      y: interno.y + 14 * Math.sin(angolo),
      testo: asse.sotto,
      ancora: ancoraPer(interno.x, geo.cx),
    };
    return { sopra, sotto: dentro };
  });
}

function ancoraPer(x, cx) {
  if (x > cx + 4) return "start";
  if (x < cx - 4) return "end";
  return "middle";
}

/** I sei valori di un oggetto {velTuf, ...} nell'ordine degli assi. */
export function valuesInOrder(attributes) {
  return ASSI.map((asse) => (attributes ? clampValue(attributes[asse.chiave]) : 0));
}