// PASSO 3: instradamento delle API.
// Ogni richiesta che modifica dati (POST, PUT, DELETE, PATCH) deve
// avere l'header Origin sullo stesso host del sito, altrimenti 403.

import { type Env } from "./env";
import { fail, MSG, readJsonObject } from "./http";
import { currentPlayer, type AuthedPlayer } from "./session";
import { authPlayers, authStatus, createPin, login, logout } from "./routes/routes_auth";
import { changePin, me, myVotes } from "./routes/routes_me";
import { putVote } from "./routes/routes_votes";
import { auditTrail, createSeason, exportData, resetPin, unlock } from "./routes/routes_admin";
import {
  creaPartita,
  dettaglioPartita,
  elencoPartite,
  eliminaPartita,
  giocatoriPerEditor,
  modificaPartita,
} from "./routes/routes_matches_admin";
import {
  creaGiocatore,
  dettaglioGiocatoreAdmin,
  elencoBandiere,
  elencoGiocatoriAdmin,
  eliminaGiocatore,
  modificaGiocatore,
} from "./routes/routes_players_admin";
import { matches, playerDetail, players, ranking, seasons } from "./routes/routes_data";

const WRITE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

const NOT_FOUND = () => fail(404, MSG.badRequest);
const UNAUTHORIZED = () => fail(401, MSG.unauthorized);
const FORBIDDEN = () => fail(403, MSG.forbidden);

async function requireSession(env: Env, request: Request): Promise<AuthedPlayer | Response> {
  const auth = await currentPlayer(env, request);
  return auth ?? UNAUTHORIZED();
}

async function requireAdmin(env: Env, request: Request): Promise<AuthedPlayer | Response> {
  const base = await currentPlayer(env, request);
  if (!base) return UNAUTHORIZED();
  // Il permesso si legge dal database a ogni richiesta: se viene tolto,
  // smette di funzionare subito anche con la sessione ancora aperta.
  if (base.player.is_admin !== 1) return FORBIDDEN();
  return base;
}

function isResponse(value: AuthedPlayer | Response): value is Response {
  return value instanceof Response;
}

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (WRITE_METHODS.has(request.method) && !originAllowed(request, url)) {
    return FORBIDDEN();
  }

  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  const head = parts[0];
  const second = parts[1];
  const method = request.method;

  if (head === "auth") {
    if (method === "GET" && second === "players") return authPlayers(env);
    if (method === "GET" && second === "status") return authStatus(env, url.searchParams.get("playerId") ?? "");
    if (method === "POST" && second === "create-pin") return createPin(env, request);
    if (method === "POST" && second === "login") return login(env, request);
    if (method === "POST" && second === "logout") return logout(env);
    return NOT_FOUND();
  }

  if (head === "me") {
    if (method === "GET" && second === undefined) {
      const auth = await requireSession(env, request);
      return isResponse(auth) ? auth : me(auth);
    }
    if (method === "GET" && second === "votes") {
      const auth = await requireSession(env, request);
      return isResponse(auth) ? auth : myVotes(env, auth);
    }
    if (method === "POST" && second === "pin") {
      const auth = await requireSession(env, request);
      return isResponse(auth) ? auth : changePin(env, auth, request);
    }
    return NOT_FOUND();
  }

  if (head === "votes" && second !== undefined && parts.length === 2) {
    if (method === "PUT") {
      const auth = await requireSession(env, request);
      if (isResponse(auth)) return auth;
      return putVote(env, auth, decodeURIComponent(second), request);
    }
    return NOT_FOUND();
  }

  if (head === "admin") {
    if (method === "GET" && second === "flags" && parts.length === 2) {
      const auth = await requireAdmin(env, request);
      return isResponse(auth) ? auth : elencoBandiere();
    }
    if (second === "players" && parts.length === 4) {
      if (method === "POST" && parts[3] === "reset-pin") {
        const auth = await requireAdmin(env, request);
        return isResponse(auth) ? auth : resetPin(env, auth, decodeURIComponent(parts[2] ?? ""));
      }
      if (method === "POST" && parts[3] === "unlock") {
        const auth = await requireAdmin(env, request);
        return isResponse(auth) ? auth : unlock(env, auth, decodeURIComponent(parts[2] ?? ""));
      }
      return NOT_FOUND();
    }
    if (method === "GET" && second === "audit") {
      const auth = await requireAdmin(env, request);
      return isResponse(auth) ? auth : auditTrail(env, Number(url.searchParams.get("before") ?? "") || null);
    }
    if (method === "GET" && second === "export") {
      const auth = await requireAdmin(env, request);
      return isResponse(auth) ? auth : exportData(env, auth);
    }
    if (method === "POST" && second === "seasons") {
      const auth = await requireAdmin(env, request);
      return isResponse(auth) ? auth : createSeason(env, auth, await readJsonObject(request).then((obj) => (obj ? String(obj.name ?? "") : "")));
    }
    if (second === "players" && parts.length === 2) {
      const auth = await requireAdmin(env, request);
      if (isResponse(auth)) return auth;
      if (method === "GET") return elencoGiocatoriAdmin(env);
      if (method === "POST") return creaGiocatore(env, auth.player.id, request);
      return NOT_FOUND();
    }
    if (second === "players" && parts.length === 3) {
      const auth = await requireAdmin(env, request);
      if (isResponse(auth)) return auth;
      const id = decodeURIComponent(parts[2] ?? "");
      if (method === "GET") return dettaglioGiocatoreAdmin(env, id);
      if (method === "PUT") return modificaGiocatore(env, auth.player.id, id, request);
      if (method === "DELETE") return eliminaGiocatore(env, auth.player.id, id);
      return NOT_FOUND();
    }
    if (second === "matches" && parts.length === 2) {
      const auth = await requireAdmin(env, request);
      if (isResponse(auth)) return auth;
      if (method === "GET") return elencoPartite(env, url.searchParams.get("season"));
      if (method === "POST") return creaPartita(env, auth.player.id, request);
      return NOT_FOUND();
    }
    if (second === "matches" && parts.length === 3) {
      const auth = await requireAdmin(env, request);
      if (isResponse(auth)) return auth;
      const id = decodeURIComponent(parts[2] ?? "");
      if (method === "GET") return dettaglioPartita(env, id);
      if (method === "PUT") return modificaPartita(env, auth.player.id, id, request);
      if (method === "DELETE") return eliminaPartita(env, auth.player.id, id);
      return NOT_FOUND();
    }
    return NOT_FOUND();
  }

  if (head === "seasons" && method === "GET") return seasons(env);
  if (head === "ranking" && method === "GET") return ranking(env, url.searchParams.get("season"));
  if (head === "players" && method === "GET" && second === undefined) return players(env);
  if (head === "players" && method === "GET" && second !== undefined) {
    const auth = await currentPlayer(env, request);
    return playerDetail(env, decodeURIComponent(second), url.searchParams.get("season"), auth !== null);
  }
  if (head === "matches" && method === "GET") return matches(env, url.searchParams.get("season"));

  return NOT_FOUND();
}