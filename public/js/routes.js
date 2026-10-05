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
  copilota: "copilota",
};

/** Percorso della pagina di gestione (stesso valore di ADMIN_PATH). */
export const PERCORSO_GESTIONE = "/copilota";

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
 * La pagina di gestione non sta nella barra: senza accesso rimanda
 * all'accesso (che poi torna qui), con accesso la vista decide in base
 * ai permessi (riconferma del PIN o messaggio breve).
 */
export function resolveRoute(pathname, { authed = false, search = "", gestione = PERCORSO_GESTIONE } = {}) {
  const path = normalizePath(pathname);
  const season = seasonFromSearch(search);
  const resta = { authed, season };

  if (path === normalizePath(gestione)) {
    return authed ? { name: VISTA.copilota, season } : { redirect: "/accesso", season };
  }

  if (path === "/") return { redirect: homePath(authed), season };
  // /home senza accesso va alla pagina di accesso, mai in classifica:
  // vale per tocco sulla voce Home, link diretto, refresh e indietro.
  if (path === "/home") return authed ? { name: VISTA.home, season } : { redirect: "/accesso", season };
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

/** La pagina di gestione non ha voce nella barra: niente evidenziato. */
export function activeNav(routeName, playerId) {
  if (routeName === VISTA.scheda) return VISTA.giocatori;
  if (routeName === VISTA.copilota) return null;
  return routeName;
}