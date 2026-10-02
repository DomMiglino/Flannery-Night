// PASSO 3: flusso unico di verifica del PIN con blocco per account.
// Vale per login, cambio PIN e accesso all'area amministrazione:
// 5 tentativi sbagliati consecutivi, poi 15 minuti (30 per gli admin).

import { audit } from "./audit";
import { secret, type Env } from "./env";
import {
  MAX_ATTEMPTS,
  blockedMessage,
  isLocked,
  lockIso,
  newPinHash,
  verifyPin,
  type CredentialRow,
} from "./pin";
import type { PlayerRow } from "./queries";

export type PinCheck = { ok: true } | { ok: false; reason: "bad" | "locked"; message: string };

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Se il conto e' giusto azzera i tentativi. Se e' sbagliato incrementa,
 * e al quinto errore imposta il blocco. Durante il blocco il PIN non
 * viene nemmeno calcolato.
 */
export async function verifyWithLocking(
  env: Env,
  player: PlayerRow,
  cred: CredentialRow,
  pin: string,
): Promise<PinCheck> {
  const now = Date.now();
  if (isLocked(cred, now)) {
    await audit(env, player.id, "login_failed", "bloccato");
    return { ok: false, reason: "locked", message: blockedMessage(cred.locked_until ?? "") };
  }
  if (await verifyPin(secret(env, "PIN_PEPPER"), cred, pin)) {
    await env.DB.prepare(
      "UPDATE credentials SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE player_id = ?",
    )
      .bind(nowIso(), player.id)
      .run();
    return { ok: true };
  }
  const attempts = (cred.failed_attempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const until = lockIso(now, player.is_admin === 1);
    await env.DB.prepare(
      "UPDATE credentials SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE player_id = ?",
    )
      .bind(attempts, until, nowIso(), player.id)
      .run();
    await audit(env, player.id, "login_failed", `tentativi falliti: ${attempts}`);
    await audit(env, player.id, "account_locked", player.is_admin === 1 ? "30 minuti" : "15 minuti");
    return { ok: false, reason: "locked", message: blockedMessage(until) };
  }
  await env.DB.prepare("UPDATE credentials SET failed_attempts = ?, updated_at = ? WHERE player_id = ?")
    .bind(attempts, nowIso(), player.id)
    .run();
  await audit(env, player.id, "login_failed", `tentativi falliti: ${attempts}`);
  return { ok: false, reason: "bad", message: "" };
}

/** Scrive un PIN nuovo: sale nuovo, hash v2, tentativi e blocco azzerati. */
export async function storePinV2(env: Env, playerId: string, pin: string): Promise<void> {
  const { salt, hash } = await newPinHash(secret(env, "PIN_PEPPER"), pin);
  await env.DB.prepare(
    `INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at)
     VALUES (?, ?, ?, 'user', 2, 0, NULL, 0, ?)
     ON CONFLICT(player_id) DO UPDATE SET salt = excluded.salt, pin_hash = excluded.pin_hash,
       pin_origin = 'user', hash_version = 2, failed_attempts = 0, locked_until = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(playerId, salt, hash, nowIso())
    .run();
}

/** Ricalcola l'hash di un account ancora su v1, con sale nuovo. */
export async function upgradeToV2(env: Env, playerId: string, pin: string): Promise<void> {
  const { salt, hash } = await newPinHash(secret(env, "PIN_PEPPER"), pin);
  await env.DB.prepare(
    "UPDATE credentials SET salt = ?, pin_hash = ?, hash_version = 2, updated_at = ? WHERE player_id = ?",
  )
    .bind(salt, hash, nowIso(), playerId)
    .run();
}