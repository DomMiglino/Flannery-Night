// Passo 4: numeri e date in italiano. Funzioni pure, senza DOM.

/** Numero con virgola decimale italiana: 10.8 diventa "10,8". */
export function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatOverall(value) {
  return value === null || value === undefined ? "—" : formatNumber(value, 1);
}

/**
 * Overall per eccesso già calcolato dal server: si mostra com'è
 * (intero), senza arrotondare nel browser; "—" senza voti.
 */
export function formatOverallUp(value) {
  return value === null || value === undefined ? "—" : String(value);
}

/** Un voto, due voti, tre voti. */
export function formatVotes(count) {
  return `${count} ${count === 1 ? "voto" : "voti"}`;
}

export function plural(count, one, many) {
  return count === 1 ? one : many;
}

/**
 * Le date delle partite arrivano come YYYY-MM-DD: lette come ora UTC
 * per non slittare di un giorno. Accetta anche una data ISO completa.
 */
function toDate(value) {
  if (typeof value !== "string" || value === "") return null;
  const soloData = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const ms = soloData ? Date.parse(`${value}T00:00:00Z`) : Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

const FORMATTERI = {
  lungo: new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }),
  breve: new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }),
};

/** "10 settembre 2026" */
export function formatDate(value) {
  const data = toDate(value);
  return data ? FORMATTERI.lungo.format(data) : "—";
}

/** "10 set 2026" */
export function formatShortDate(value) {
  const data = toDate(value);
  return data ? FORMATTERI.breve.format(data) : "—";
}

/** Percorso dell'immagine della bandiera, oppure null se non c'è. */
export function flagUrl(flag) {
  if (typeof flag !== "string") return null;
  const pulito = flag.trim();
  if (pulito === "") return null;
  return `/flags/${encodeURIComponent(pulito)}`;
}

/** Testo alternativo della freccia di forma, per chi non vede il simbolo. */
export function formaLabel(arrow) {
  switch (arrow) {
    case "↑":
      return "in crescita";
    case "↗":
      return "in leggera crescita";
    case "→":
      return "stabile";
    case "↘":
      return "in calo";
    case "↓":
      return "in forte calo";
    default:
      return "";
  }
}

/** La freccia è alta quando la forma è positiva, bassa quando è negativa. */
export function formaClasse(arrow) {
  if (arrow === "↑" || arrow === "↗") return "forma forma-alta";
  if (arrow === "↘" || arrow === "↓") return "forma forma-bassa";
  return "forma";
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Un passo di un voto: resta sempre dentro 1-99. */
export function stepValue(value, delta, min = 1, max = 99) {
  return clamp(Math.round(Number(value) || 0) + delta, min, max);
}