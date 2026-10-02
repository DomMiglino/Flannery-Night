// PASSO 3: sessioni con cookie firmato.
// Il token contiene playerId, session_version e scadenza; la firma e'
// HMAC con SESSION_SECRET. A ogni richiesta il giocatore deve restare
// attivo, con can_login=1 e con la stessa session_version.

import { base64UrlDecode, base64UrlEncode, hmacHex, safeEqual, utf8 } from "./crypto";
import type { Env } from "./env";
import { secret } from "./env";
import { adminCookie, clearCookie, readCookie, sessionCookie } from "./http";
import { getPlayer, getCredential, type PlayerRow } from "./queries";

export const SESSION_COOKIE = "fn_session";
export const ADMIN_COOKIE = "fn_admin";
export const SESSION_DAYS = 90;
export const ADMIN_HOURS = 4;
const DAY = 86_400;

export interface TokenPayload {
  /** id giocatore */
  p: string;
  /** session_version del momento dell'emissione */
  v: number;
  /** scadenza in secondi epoch */
  e: number;
  /** tipo: "s" sessione giocatore, "a" area amministrazione */
  k: "s" | "a";
}

async function sign(secretKey: string, payload: TokenPayload): Promise<string> {
  const body = base64UrlEncode(utf8(JSON.stringify(payload)));
  const sig = await hmacHex(secretKey, `fn.${body}`);
  return `${body}.${sig}`;
}

async function verify(secretKey: string, token: string, kind: "s" | "a", nowSeconds: number): Promise<TokenPayload | null> {
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
  if (payload.k !== kind) return null;
  if (typeof payload.p !== "string" || !payload.p) return null;
  if (typeof payload.v !== "number" || typeof payload.e !== "number") return null;
  if (payload.e <= nowSeconds) return null;
  return payload;
}

export async function issueSession(env: Env, playerId: string, sessionVersion: number): Promise<string> {
  const payload: TokenPayload = {
    p: playerId,
    v: sessionVersion,
    e: Math.floor(Date.now() / 1000) + SESSION_DAYS * DAY,
    k: "s",
  };
  return sign(secret(env, "SESSION_SECRET"), payload);
}

export async function issueAdminSession(env: Env, playerId: string, sessionVersion: number): Promise<string> {
  const payload: TokenPayload = {
    p: playerId,
    v: sessionVersion,
    e: Math.floor(Date.now() / 1000) + ADMIN_HOURS * 3600,
    k: "a",
  };
  return sign(secret(env, "SESSION_SECRET"), payload);
}

export function sessionCookieHeader(token: string): string {
  return sessionCookie(token, SESSION_DAYS * DAY);
}

export function adminCookieHeader(token: string): string {
  return adminCookie(token, ADMIN_HOURS * 3600);
}

export function clearSessionHeader(): string {
  return clearCookie(SESSION_COOKIE);
}

export function clearAdminHeader(): string {
  return clearCookie(ADMIN_COOKIE);
}

export interface AuthedPlayer {
  player: PlayerRow;
  sessionVersion: number;
}

/** Giocatore collegato, se il cookie e' valido e le credenziali sono ancora attive. */
export async function currentPlayer(env: Env, request: Request): Promise<AuthedPlayer | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  let payload: TokenPayload | null;
  try {
    payload = await verify(secret(env, "SESSION_SECRET"), token, "s", Math.floor(Date.now() / 1000));
  } catch {
    return null;
  }
  if (!payload) return null;
  const player = await getPlayer(env, payload.p);
  if (!player || player.can_login !== 1) return null;
  const cred = await getCredential(env, player.id);
  if (!cred || cred.session_version !== payload.v) return null;
  return { player, sessionVersion: payload.v };
}

/**
 * Area amministrazione: servono entrambi i cookie, dello stesso
 * giocatore e con la stessa session_version.
 */
export async function currentAdmin(env: Env, request: Request): Promise<AuthedPlayer | null> {
  const base = await currentPlayer(env, request);
  if (!base || base.player.is_admin !== 1) return null;
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  let payload: TokenPayload | null;
  try {
    payload = await verify(secret(env, "SESSION_SECRET"), token, "a", Math.floor(Date.now() / 1000));
  } catch {
    return null;
  }
  if (!payload) return null;
  if (payload.p !== base.player.id || payload.v !== base.sessionVersion) return null;
  return base;
}