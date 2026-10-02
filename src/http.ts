// PASSO 3: risposte JSON, cookie e messaggi di errore.
// I messaggi sono generici: non dicono se un giocatore esiste,
// non mostrano hash, salt o PIN.

export const MSG = {
  badRequest: "Richiesta non valida",
  unauthorized: "Accesso non consentito",
  forbidden: "Richiesta non consentita",
  notFound: "Giocatore non trovato",
  notReady: "Operazione non disponibile",
  pinInvalid: "PIN non valido",
} as const;

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(extraHeaders ?? {}),
    },
  });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...(extra ?? {}) }, status);
}

export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out.set(name, part.slice(idx + 1).trim());
  }
  return out;
}

export function readCookie(request: Request, name: string): string | null {
  return parseCookies(request.headers.get("cookie")).get(name) ?? null;
}

/** Aggiunge un Set-Cookie a una risposta già costruita. */
export function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `fn_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function adminCookie(token: string, maxAgeSeconds: number): string {
  return `fn_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Corpo JSON come oggetto; null se non è un oggetto valido. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await request.json();
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

export function str(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v : "";
}

/** Intero 1..99 per i sei attributi di voto. */
export function ratingValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > 99) return null;
  return value;
}