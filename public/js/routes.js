// Passo 4: risoluzione dei percorsi. Funzioni pure, senza DOM.
// Le rotte dell'interfaccia sono /classifica, /giocatori, /giocatori/:id,
// /partite, /home (solo con accesso) e /accesso per entrare.

export const VISTA = {
  classifica: "classifica",
  giocatori: "giocatori",
  scheda: "scheda",
  partite: "partite",
  home: "home",
  accesso: "accesso",
  cambia: "cambia",
};

/** Percorso iniziale: chi non è entrato va in classifica, chi è entrato in home. */
export function homePath(authed) {
  return authed ? "/home" : "/classifica";
}

/** Toglie la barra finale e i segmenti vuoti. */
export function normalizePath(pathname) {
  const testo = String(pathname || "/");
  const trimmato = testo.replace(/\/+$/, "");
  return trimmato === "" ? "/" : trimmato;
}

/** La stagione scelta vive nella query, così i link diretti funzionano. */
export function seasonFromSearch(search) {
  try {
    const value = new URLSearchParams(String(search || "")).get("stagione");
    if (value === null) return null;
    const numero = Number(value);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
  } catch {
    return null;
  }
}

export function withSeason(pathname, season) {
  const base = normalizePath(pathname);
  if (!season) return base;
  return `${base}?stagione=${encodeURIComponent(String(season))}`;
}

/**
 * Traduce un indirizzo in una vista.
 * Restituisce {redirect} quando l'indirizzo non va bene (per esempio /home
 * senza accesso), altrimenti {name, playerId, season}.
 */
export function resolveRoute(pathname, { authed = false, search = "" } = {}) {
  const path = normalizePath(pathname);
  const season = seasonFromSearch(search);
  const resta = { authed, season };

  if (path === "/") return { redirect: homePath(authed), season };
  if (path === "/home") return authed ? { name: VISTA.home, season } : { redirect: "/classifica", season };
  if (path === "/classifica") return { name: VISTA.classifica, season };
  if (path === "/giocatori") return { name: VISTA.giocatori, season };
  if (path === "/partite") return { name: VISTA.partite, season };
  if (path === "/accesso/cambia") {
    return authed ? { name: VISTA.cambia, season } : { redirect: "/accesso", season };
  }
  if (path === "/accesso") return authed ? { redirect: "/home", season } : { name: VISTA.accesso, season };
  if (path.startsWith("/giocatori/")) {
    const id = safeDecode(path.slice("/giocatori/".length));
    if (id === "") return { redirect: "/giocatori", season };
    return { name: VISTA.scheda, playerId: id, season };
  }
  return { redirect: homePath(authed), ...resta };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

/** Voci della barra in basso: Home compare solo con l'accesso. */
export function navItems(authed) {
  const voci = [];
  if (authed) voci.push({ name: VISTA.home, href: "/home", label: "Home" });
  voci.push({ name: VISTA.classifica, href: "/classifica", label: "Classifica" });
  voci.push({ name: VISTA.giocatori, href: "/giocatori", label: "Giocatori" });
  voci.push({ name: VISTA.partite, href: "/partite", label: "Partite" });
  return voci;
}

/** Il selettore di stagione serve su classifica, partite e statistiche. */
export function needsSeason(name) {
  return name === VISTA.classifica || name === VISTA.partite || name === VISTA.scheda;
}

/** La voce della barra da segnare come corrente. */
export function activeNav(routeName, playerId) {
  if (routeName === VISTA.scheda) return VISTA.giocatori;
  return routeName;
}