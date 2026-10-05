// Gestione dei giocatori e delle bandiere.
// Tutte le scritture avvengono in batch D1 e finiscono nel registro di audit.

import { auditStatement } from "../audit";
import type { Env } from "../env";
import { FLAGS, type FlagItem } from "../flags_list";
import { fail, json, MSG, readJsonObject } from "../http";

const RUOLI_VALIDI = new Set(["P", "DC", "DL", "CC", "CL", "PC"]);
const BANDIERE_VALIDE = new Set(FLAGS.map((f) => f.filename));

export function generaBaseSlug(name: string): string {
  const pulito = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return pulito || "giocatore";
}

export async function generaIdGiocatore(env: Env, name: string): Promise<string> {
  const base = generaBaseSlug(name);
  let id = base;
  let contatore = 1;
  while (true) {
    const esiste = await env.DB.prepare("SELECT id FROM players WHERE id = ?").bind(id).first<{ id: string }>();
    if (!esiste) return id;
    id = `${base}-${contatore}`;
    contatore++;
  }
}

export async function elencoBandiere(flags: readonly FlagItem[] = FLAGS): Promise<Response> {
  if (flags.length === 0) return fail(500, "Elenco bandiere non disponibile. Esegui npm run flags.");
  return json({ flags });
}

async function nomeGiaUsato(env: Env, name: string, esclusoId?: string): Promise<boolean> {
  const rows = await env.DB.prepare("SELECT id, name FROM players").all<{ id: string; name: string }>();
  const chiave = name.normalize("NFC").toLocaleLowerCase("it");
  return (rows.results ?? []).some(
    (p) => p.id !== esclusoId && p.name.normalize("NFC").toLocaleLowerCase("it") === chiave,
  );
}

export async function elencoGiocatoriAdmin(env: Env): Promise<Response> {
  const res = await env.DB.prepare(
    "SELECT id, name, role, flag, can_login FROM players ORDER BY name COLLATE NOCASE",
  ).all<{ id: string; name: string; role: string; flag: string | null; can_login: number }>();

  const players = (res.results ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    flag: p.flag,
    canLogin: p.can_login === 1,
  }));
  return json({ players });
}

interface PlayerRowAdmin {
  id: string;
  name: string;
  role: string;
  flag: string | null;
  can_login: number;
  is_admin: number;
}

interface CredentialRowAdmin {
  pin_origin: string;
  locked_until: string | null;
}

export async function dettaglioGiocatoreAdmin(env: Env, id: string): Promise<Response> {
  const player = await env.DB.prepare(
    "SELECT id, name, role, flag, can_login, is_admin FROM players WHERE id = ?",
  )
    .bind(id)
    .first<PlayerRowAdmin>();
  if (!player) return fail(404, MSG.notFound);

  const cred = await env.DB.prepare(
    "SELECT pin_origin, locked_until FROM credentials WHERE player_id = ?",
  )
    .bind(id)
    .first<CredentialRowAdmin>();

  const matchRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM match_players WHERE player_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();

  const votesGivenRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM votes WHERE voter_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();

  const votesReceivedRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM votes WHERE target_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();

  const now = Date.now();
  const locked = !!cred?.locked_until && Date.parse(cred.locked_until) > now;

  return json({
    id: player.id,
    name: player.name,
    role: player.role,
    flag: player.flag,
    canLogin: player.can_login === 1,
    pinCreated: cred?.pin_origin === "user",
    locked,
    lockedUntil: locked ? cred.locked_until : null,
    matchesCount: matchRes?.n ?? 0,
    votesGivenCount: votesGivenRes?.n ?? 0,
    votesReceivedCount: votesReceivedRes?.n ?? 0,
    isAdmin: player.is_admin === 1,
  });
}

export async function creaGiocatore(env: Env, attore: string, request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (rawName.length < 1 || rawName.length > 40) {
    return fail(400, "Il nome deve contenere da 1 a 40 caratteri.");
  }

  if (await nomeGiaUsato(env, rawName)) {
    return fail(400, "Un giocatore con questo nome esiste già.");
  }

  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!RUOLI_VALIDI.has(role)) {
    return fail(400, "Il ruolo deve essere uno tra P, DC, DL, CC, CL, PC.");
  }

  const flag = typeof body.flag === "string" ? body.flag.trim() : "";
  if (!BANDIERE_VALIDE.has(flag)) {
    return fail(400, "La bandiera selezionata non è valida.");
  }

  const canLogin = body.canLogin === undefined ? true : body.canLogin;
  if (typeof canLogin !== "boolean") return fail(400, "Il campo Può accedere deve essere vero o falso.");
  const id = await generaIdGiocatore(env, rawName);
  const ora = new Date().toISOString();

  const db = env.DB;
  await db.batch([
    db
      .prepare(
        "INSERT INTO players (id, name, role, flag, active, can_login, is_admin) VALUES (?, ?, ?, ?, 1, ?, 0)",
      )
      .bind(id, rawName, role, flag, canLogin ? 1 : 0),
    db
      .prepare(
        "INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at) VALUES (?, '', '', '', 1, 0, NULL, 0, ?)",
      )
      .bind(id, ora),
    auditStatement(
      env,
      attore,
      "player_create",
      `id=${id} nome=${rawName} ruolo=${role} bandiera=${flag} canLogin=${canLogin ? 1 : 0}`,
    ),
  ]);

  return json({ ok: true, id, name: rawName, role, flag, canLogin }, 201);
}

export async function modificaGiocatore(
  env: Env,
  attore: string,
  id: string,
  request: Request,
): Promise<Response> {
  const player = await env.DB.prepare(
    "SELECT id, name, role, flag, can_login FROM players WHERE id = ?",
  )
    .bind(id)
    .first<PlayerRowAdmin>();
  if (!player) return fail(404, MSG.notFound);

  const body = await readJsonObject(request);
  if (!body) return fail(400, MSG.badRequest);

  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (rawName.length < 1 || rawName.length > 40) {
    return fail(400, "Il nome deve contenere da 1 a 40 caratteri.");
  }

  if (await nomeGiaUsato(env, rawName, id)) {
    return fail(400, "Un giocatore con questo nome esiste già.");
  }

  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!RUOLI_VALIDI.has(role)) {
    return fail(400, "Il ruolo deve essere uno tra P, DC, DL, CC, CL, PC.");
  }

  const flag =
    body.flag === undefined
      ? player.flag
      : body.flag === null
        ? null
        : typeof body.flag === "string"
          ? body.flag.trim() || null
          : undefined;
  if (flag === undefined || (flag !== player.flag && (flag === null || !BANDIERE_VALIDE.has(flag)))) {
    return fail(400, "La bandiera selezionata non è valida.");
  }

  const canLogin = body.canLogin === undefined ? player.can_login === 1 : body.canLogin;
  if (typeof canLogin !== "boolean") return fail(400, "Il campo Può accedere deve essere vero o falso.");
  const canLoginPrecedente = player.can_login === 1;

  const cambi: string[] = [];
  if (player.name !== rawName) cambi.push(`nome: ${player.name} → ${rawName}`);
  if (player.role !== role) cambi.push(`ruolo: ${player.role} → ${role}`);
  if ((player.flag ?? "") !== (flag ?? "")) cambi.push(`bandiera: ${player.flag ?? "—"} → ${flag ?? "—"}`);
  if (canLoginPrecedente !== canLogin) cambi.push(`canLogin: ${canLoginPrecedente ? 1 : 0} → ${canLogin ? 1 : 0}`);

  const db = env.DB;
  const ora = new Date().toISOString();
  const passi: Parameters<Env["DB"]["batch"]>[0] = [
    db
      .prepare("UPDATE players SET name = ?, role = ?, flag = ?, can_login = ? WHERE id = ?")
      .bind(rawName, role, flag, canLogin ? 1 : 0, id),
  ];

  // Se canLogin passa da 1 a 0, si incrementa session_version per invalidare le sessioni aperte.
  if (canLoginPrecedente && !canLogin) {
    passi.push(
      db
        .prepare("UPDATE credentials SET session_version = session_version + 1, updated_at = ? WHERE player_id = ?")
        .bind(ora, id),
    );
  }

  const dettaglioAudit = cambi.length > 0 ? `id=${id} ` + cambi.join(" | ") : `id=${id} nessun campo cambiato`;
  passi.push(auditStatement(env, attore, "player_update", dettaglioAudit));
  await db.batch(passi);

  return json({ ok: true, id, name: rawName, role, flag, canLogin });
}

export async function eliminaGiocatore(env: Env, attore: string, id: string): Promise<Response> {
  const player = await env.DB.prepare(
    "SELECT id, name, role, flag, can_login, is_admin FROM players WHERE id = ?",
  )
    .bind(id)
    .first<PlayerRowAdmin>();
  if (!player) return fail(404, MSG.notFound);

  if (player.id === attore) {
    return fail(409, "Non puoi eliminare il tuo stesso account.");
  }

  if (player.is_admin === 1) {
    return fail(409, "Questo account non si può eliminare.");
  }

  const matchesCountRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM match_players WHERE player_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();
  const matchesCount = matchesCountRes?.n ?? 0;
  if (matchesCount > 0) {
    return fail(
      409,
      `Ha giocato ${matchesCount} ${matchesCount === 1 ? "partita" : "partite"}: non si può eliminare.`,
    );
  }

  const guidinhaCountRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM matches WHERE guidinha_player_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();
  if ((guidinhaCountRes?.n ?? 0) > 0) {
    return fail(409, "È la Guidinha di una partita: non si può eliminare.");
  }

  const cred = await env.DB.prepare(
    "SELECT pin_origin FROM credentials WHERE player_id = ?",
  )
    .bind(id)
    .first<CredentialRowAdmin>();

  const votesGivenRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM votes WHERE voter_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();
  const votesReceivedRes = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM votes WHERE target_id = ?",
  )
    .bind(id)
    .first<{ n: number }>();

  const votesGiven = votesGivenRes?.n ?? 0;
  const votesReceived = votesReceivedRes?.n ?? 0;
  const copiaDettaglio = `id=${player.id} nome=${player.name} ruolo=${player.role} bandiera=${player.flag ?? "nessuna"} canLogin=${player.can_login} pinCreated=${cred?.pin_origin === "user" ? 1 : 0} votiDati=${votesGiven} votiRicevuti=${votesReceived}`;

  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM votes WHERE voter_id = ? OR target_id = ?").bind(id, id),
    db.prepare("DELETE FROM credentials WHERE player_id = ?").bind(id),
    db.prepare("DELETE FROM players WHERE id = ?").bind(id),
    auditStatement(env, attore, "player_delete", copiaDettaglio),
  ]);

  return json({ ok: true, id: player.id });
}
