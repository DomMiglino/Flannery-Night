// Sessioni con cookie firmato.
// Il token contiene playerId, session_version, emissione ed scadenza;
// la firma e' HMAC con SESSION_SECRET. A ogni richiesta il giocatore
// deve restare attivo, con can_login=1 e con la stessa session_version.
// Il permesso di gestione si legge dal database (players.is_admin) a
// ogni richiesta, mai dal contenuto del cookie.

import { base64UrlDecode, base64UrlEncode, hmacHex, safeEqual, utf8 } from "./crypto";
import type { Env } from "./env";
import { secret } from "./env";
import { clearCookie, readCookie, sessionCookie } from "./http";
import { getPlayer, getCredential, type PlayerRow } from "./queries";

export const SESSION_COOKIE = "fn_session";
export const SESSION_DAYS = 90;
export const ADMIN_DAYS = 14;
const DAY = 86_400;

export interface TokenPayload {
  /** id giocatore */
  p: string;
  /** session_version del momento dell'emissione */
  v: number;
  /** emissione in secondi epoch */
  i: number;
  /** scadenza in secondi epoch */
  e: number;
  /** tipo: "s" sessione giocatore */
  k: "s";
}

async function sign(secretKey: string, payload: TokenPayload): Promise<string> {
  const body = base64UrlEncode(utf8(JSON.stringify(payload)));
  const sig = await hmacHex(secretKey, `fn.${body}`);
  return `${body}.${sig}`;
}

async function verify(secretKey: string, token: string, nowSeconds: number): Promise<TokenPayload | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(secretKey, `fn.${body}`);
  if (!safeEqual(sig, expected)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as TokenPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.k !== "s") return null;
  if (typeof payload.p !== "string" || !payload.p) return null;
  if (typeof payload.v !== "number" || typeof payload.e !== "number") return null;
  if (payload.e <= nowSeconds) return null;
  return payload;
}

/** Emissione con durata in giorni (14 per la gestione, 90 per gli altri). */
export async function issueSession(env: Env, playerId: string, sessionVersion: number, daysValid: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    p: playerId,
    v: sessionVersion,
    i: now,
    e: now + daysValid * DAY,
    k: "s",
  };
  return sign(secret(env, "SESSION_SECRET"), payload);
}

export function sessionCookieHeader(token: string, daysValid: number): string {
  return sessionCookie(token, daysValid * DAY);
}

export function clearSessionHeader(): string {
  return clearCookie(SESSION_COOKIE);
}

export interface AuthedPlayer {
  player: PlayerRow;
  sessionVersion: number;
}

/** Giocatore collegato, se il cookie e' valido e le credenziali sono ancora attive. */
export async function currentPlayer(env: Env, request: Request): Promise<AuthedPlayer | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  let payload: TokenPayload | null;
  try {
    payload = await verify(secret(env, "SESSION_SECRET"), token, now);
  } catch {
    return null;
  }
  if (!payload) return null;
  const player = await getPlayer(env, payload.p);
  if (!player || player.can_login !== 1) return null;
  const cred = await getCredential(env, player.id);
  if (!cred || cred.session_version !== payload.v) return null;
  // Chi gestisce la squadra ha sessioni di 14 giorni al massimo, anche
  // con cookie emessi prima (durata 90 giorni): l'emissione dei token
  // vecchi, che non la riportano, si ricava dalla scadenza (erano tutti
  // da 90 giorni). Vale anche se il permesso arriva dopo l'emissione.
  if (player.is_admin === 1) {
    const issued = typeof payload.i === "number" ? payload.i : payload.e - SESSION_DAYS * DAY;
    if (now - issued > ADMIN_DAYS * DAY) return null;
  }
  return { player, sessionVersion: payload.v };
}
