// Passo 4: risoluzione dei percorsi. Funzioni pure, senza DOM.
// Le rotte dell'interfaccia sono /classifica, /contest, /giocatori, /giocatori/:id,
// /partite, /home (solo con accesso) e /accesso per entrare.

export const VISTA = {
  classifica: "classifica",
  giocatori: "giocatori",
  scheda: "scheda",
  partite: "partite",
  home: "home",
  accesso: "accesso",
  cambia: "cambia",
  registro: "registro",
  contest: "contest",
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
 * senza accesso), altrimenti {name, playerId, season} e, dentro Partite,
 * {sotto: "nuova"} o {modificaId} per gli strumenti di gestione.
 */
export function resolveRoute(pathname, { authed = false, search = "" } = {}) {
  const path = normalizePath(pathname);
  const season = seasonFromSearch(search);
  const resta = { authed, season };

  if (path === "/") return { redirect: homePath(authed), season };
  // /home senza accesso va alla pagina di accesso, mai in classifica:
  // vale per tocco sulla voce Home, link diretto, refresh e indietro.
  if (path === "/home") return authed ? { name: VISTA.home, season } : { redirect: "/accesso", season };
  if (path === "/classifica") return { name: VISTA.classifica, season };
  if (path === "/contest") return { name: VISTA.contest, season };
  if (path === "/giocatori") return { name: VISTA.giocatori, season };
  if (path === "/giocatori/nuovo") return { name: VISTA.giocatori, sotto: "nuovo", season };
  if (path.startsWith("/giocatori/")) {
    const resto = safeDecode(path.slice("/giocatori/".length));
    if (resto === "") return { redirect: "/giocatori", season };
    const modifica = resto.match(/^(.+)\/modifica$/);
    if (modifica && modifica[1] !== "") return { name: VISTA.giocatori, modificaId: modifica[1], season };
    return { name: VISTA.scheda, playerId: resto, season };
  }
  if (path === "/partite") return { name: VISTA.partite, season };
  if (path === "/partite/nuova") return { name: VISTA.partite, sotto: "nuova", season };
  if (path === "/partite/squadre") return { name: VISTA.partite, sotto: "squadre", season };
  if (path.startsWith("/partite/")) {
    const resto = safeDecode(path.slice("/partite/".length));
    const modifica = resto.match(/^(.+)\/modifica$/);
    if (modifica && modifica[1] !== "") return { name: VISTA.partite, modificaId: modifica[1], season };
    return { name: VISTA.partite, season };
  }
  if (path === "/accesso/cambia") {
    return authed ? { name: VISTA.cambia, season } : { redirect: "/accesso", season };
  }
  if (path === "/registro") return { name: VISTA.registro, season };
  if (path === "/accesso") return authed ? { redirect: "/home", season } : { name: VISTA.accesso, season };
  return { redirect: homePath(authed), ...resta };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

/** Voci della barra in basso: sempre quattro, Home punta a /home. */
export function navItems(authed) {
  const voci = [{ name: VISTA.home, href: "/home", label: "Home" }];
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
  if (routeName === VISTA.contest) return VISTA.classifica;
  return routeName;
}