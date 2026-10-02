// PASSO 3: PIN, versioni di hash e blocco per account.
// Il PIN è sempre 6 cifre; l'hash non lascia mai il server.

import { hmacHex, randomSalt, safeEqualHex, sha256Hex } from "./crypto";

export const PIN_RE = /^\d{6}$/;

export interface CredentialRow {
  player_id: string;
  salt: string;
  pin_hash: string;
  pin_origin: string;
  hash_version: number;
  failed_attempts: number;
  locked_until: string | null;
  session_version: number;
  updated_at: string;
}

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES_PLAYER = 15;
export const LOCK_MINUTES_ADMIN = 30;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_RE.test(pin);
}

function payload(salt: string, pin: string): string {
  return `${salt}|${pin}`;
}

/** versione 1: SHA256(salt + "|" + pin). */
export function hashV1(salt: string, pin: string): Promise<string> {
  return sha256Hex(payload(salt, pin));
}

/** versione 2: HMAC-SHA256 con PIN_PEPPER. */
export function hashV2(pepper: string, salt: string, pin: string): Promise<string> {
  return hmacHex(pepper, payload(salt, pin));
}

export async function hashForVersion(pepper: string, version: number, salt: string, pin: string): Promise<string> {
  return version === 2 ? hashV2(pepper, salt, pin) : hashV1(salt, pin);
}

/** Confronto a tempo costante; versione sconosciuta = fallimento. */
export async function verifyPin(pepper: string, cred: CredentialRow, pin: string): Promise<boolean> {
  if (!cred.pin_hash || !cred.pin_origin) return false;
  if (!isValidPin(pin)) return false;
  const computed = await hashForVersion(pepper, cred.hash_version, cred.salt, pin);
  return safeEqualHex(computed, cred.pin_hash);
}

/** Credenziali nuove: sale nuovo, hash v2. */
export async function newPinHash(pepper: string, pin: string): Promise<{ salt: string; hash: string }> {
  const salt = randomSalt();
  return { salt, hash: await hashV2(pepper, salt, pin) };
}

export function lockMinutes(isAdmin: boolean): number {
  return isAdmin ? LOCK_MINUTES_ADMIN : LOCK_MINUTES_PLAYER;
}

export function lockIso(nowMs: number, isAdmin: boolean): string {
  return new Date(nowMs + lockMinutes(isAdmin) * 60_000).toISOString();
}

export function isLocked(cred: Pick<CredentialRow, "locked_until">, nowMs: number): boolean {
  if (!cred.locked_until) return false;
  const until = Date.parse(cred.locked_until);
  if (Number.isNaN(until)) return false;
  return until > nowMs;
}

/** Orario di fine blocco in HH:MM, ora locale italiana. */
export function formatLockTime(lockedUntil: string): string {
  const d = new Date(lockedUntil);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

export function blockedMessage(lockedUntil: string): string {
  const t = formatLockTime(lockedUntil);
  return t ? `Account bloccato fino alle ${t}` : "Account bloccato";
}