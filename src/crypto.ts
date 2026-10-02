// PASSO 3: funzioni crittografiche minime.
// Nessun segreto viene loggato o restituito: qui solo calcoli.

const TEXT = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
}

export function hexEncode(bytes: ArrayBuffer | Uint8Array): string {
  return toHex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/** SHA256(salt + "|" + pin): versione 1, quella importata. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", TEXT.encode(text));
  return toHex(new Uint8Array(digest));
}

/** HMAC-SHA256 con chiave PIN_PEPPER: versione 2. */
export async function hmacHex(key: string, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    TEXT.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, TEXT.encode(text));
  return toHex(new Uint8Array(sig));
}

/** Sale casuale esadecimale. */
export function randomSalt(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function utf8(text: string): Uint8Array {
  return TEXT.encode(text);
}

export { fromHex };

/**
 * Confronto a tempo costante su due stringhe esadecimali.
 * Il ciclo gira sempre su max(len) e accumula le differenze:
 * la lunghezza non viene rivelata dal tempo di esecuzione.
 */
export function safeEqualHex(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Confronta due stringhe qualsiasi a tempo costante (usata per i token). */
export function safeEqual(a: string, b: string): boolean {
  return safeEqualHex(a, b);
}