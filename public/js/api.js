// Passo 4: chiamate alle API. Gli errori del server arrivano come
// {error: "..."} e vengono mostrati così come sono.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const MESSAGGIO_GENERICO = "Non riesco a caricare i dati";

async function request(path, { method = "GET", body } = {}) {
  const init = {
    method,
    credentials: "same-origin",
    headers: {},
  };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, MESSAGGIO_GENERICO);
  }
  const testo = await res.text();
  let dati = null;
  if (testo) {
    try {
      dati = JSON.parse(testo);
    } catch {
      dati = null;
    }
  }
  if (!res.ok) {
    const messaggio = dati && typeof dati.error === "string" && dati.error !== "" ? dati.error : MESSAGGIO_GENERICO;
    throw new ApiError(res.status, messaggio);
  }
  return dati;
}

export const api = {
  // pubbliche
  seasons: () => request("/api/seasons"),
  ranking: (season) => request(`/api/ranking${season ? `?season=${encodeURIComponent(season)}` : ""}`),
  players: () => request("/api/players"),
  player: (id, season) =>
    request(`/api/players/${encodeURIComponent(id)}${season ? `?season=${encodeURIComponent(season)}` : ""}`),
  matches: (season) => request(`/api/matches${season ? `?season=${encodeURIComponent(season)}` : ""}`),

  // accesso
  authPlayers: () => request("/api/auth/players"),
  authStatus: (playerId) => request(`/api/auth/status?playerId=${encodeURIComponent(playerId)}`),
  createPin: (playerId, pin, pinConfirm) => request("/api/auth/create-pin", { method: "POST", body: { playerId, pin, pinConfirm } }),
  login: (playerId, pin) => request("/api/auth/login", { method: "POST", body: { playerId, pin } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  // collegato
  me: () => request("/api/me"),
  myVotes: () => request("/api/me/votes"),
  putVote: (targetId, valori) => request(`/api/votes/${encodeURIComponent(targetId)}`, { method: "PUT", body: valori }),
  changePin: (current, next, nextConfirm) =>
    request("/api/me/pin", { method: "POST", body: { current, new: next, newConfirm: nextConfirm } }),

  // strumenti di gestione (solo con permesso, la sicurezza resta sul server)
  flags: () => request("/api/admin/flags"),
  giocatoriEditor: () => request("/api/admin/players"),
  giocatoreAdmin: (id) => request(`/api/admin/players/${encodeURIComponent(id)}`),
  creaGiocatore: (dati) => request("/api/admin/players", { method: "POST", body: dati }),
  salvaGiocatore: (id, dati) => request(`/api/admin/players/${encodeURIComponent(id)}`, { method: "PUT", body: dati }),
  eliminaGiocatore: (id) => request(`/api/admin/players/${encodeURIComponent(id)}`, { method: "DELETE" }),
  resetPin: (id) => request(`/api/admin/players/${encodeURIComponent(id)}/reset-pin`, { method: "POST" }),
  unlock: (id) => request(`/api/admin/players/${encodeURIComponent(id)}/unlock`, { method: "POST" }),
  partiteGestione: (season) => request(`/api/admin/matches${season ? `?season=${encodeURIComponent(season)}` : ""}`),
  partitaGestione: (id) => request(`/api/admin/matches/${encodeURIComponent(id)}`),
  creaPartita: (partita) => request("/api/admin/matches", { method: "POST", body: partita }),
  salvaPartita: (id, partita) => request(`/api/admin/matches/${encodeURIComponent(id)}`, { method: "PUT", body: partita }),
  eliminaPartita: (id) => request(`/api/admin/matches/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/**
 * Vero se l'errore è un 401 del server: la sessione è scaduta o non
 * vale più e lo stato deve tornare a "non collegato".
 */
export function nonAutorizzato(errore) {
  return errore instanceof ApiError && errore.status === 401;
}

export const MESSAGGIO_ERRORE = MESSAGGIO_GENERICO;