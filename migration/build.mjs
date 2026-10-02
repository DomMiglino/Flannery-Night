// migration/build.mjs — logica pura e temporanea per la prova di migrazione.
// Legge i campi vecchi (inclusi quelli da scartare) e genera SQL per D1.
// NON fa parte del Worker e non viene mai deployato.
// Testato solo con dati inventati in tests/fixtures/.

const ADMIN_IDS = new Set(["antonio", "vito", "mimmo"]);
const VALID_ROLES = new Set(["P", "DC", "DL", "CC", "CL", "PC"]);
const VALID_TEAM_SIZES = new Set([5, 6, 8]);
const SEASON_NAME = "2026/27";

function esc(v) {
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function escOrNull(v) {
  if (v == null || v === "") return "NULL";
  return esc(v);
}

function normId(v) {
  return String(v ?? "").trim().toLowerCase();
}

function toIso(v, fallback) {
  if (v == null || v === "") return fallback;
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  const d = new Date(String(v));
  if (!isNaN(d)) return d.toISOString();
  return fallback;
}

/**
 * @param {any} seasonJson parsed flannery-night-*.json
 * @param {Array<any>} accessRows righe FN_ACCESS
 * @param {Array<any>} voteRows righe FN_VOTES
 * @param {string} nowIso timestamp ISO per created/updated mancanti
 * @returns {{ sql: string, summary: any }}
 * @throws {Error} con messaggio che elenca i controlli bloccanti falliti
 */
export function validateAndBuild(seasonJson, accessRows, voteRows, nowIso) {
  const now = nowIso || new Date().toISOString();
  const errors = [];

  const players = seasonJson?.players ?? [];
  const matches = seasonJson?.matches ?? [];
  const byId = new Map();
  for (const p of players) {
    const id = normId(p?.id);
    if (!id) {
      errors.push("giocatore senza id");
      continue;
    }
    if (byId.has(id)) errors.push(`giocatore duplicato: ${id}`);
    else byId.set(id, p);
  }

  // Ruoli e nomi (controllo leggero, senza stampare segreti altrove).
  for (const [id, p] of byId) {
    if (!VALID_ROLES.has(String(p?.role))) errors.push(`ruolo non valido per ${id}: ${String(p?.role)}`);
    if (!String(p?.name ?? "").trim()) errors.push(`nome vuoto per ${id}`);
  }

  // --- controlli partite ---
  const guidinhaToComplete = [];
  for (const m of matches) {
    const mid = String(m?.id ?? "");
    const a = m?.teamA ?? [];
    const b = m?.teamB ?? [];
    if (a.length !== b.length) errors.push(`partita ${mid}: squadre di dimensioni diverse (${a.length} vs ${b.length})`);
    if (!VALID_TEAM_SIZES.has(a.length) || !VALID_TEAM_SIZES.has(b.length)) {
      errors.push(`partita ${mid}: squadre diverse da 5, 6 o 8 per lato (${a.length} vs ${b.length})`);
    }
    const seen = new Set();
    for (const side of [a, b]) {
      for (const e of side) {
        const pid = normId(e?.playerId);
        if (!byId.has(pid)) errors.push(`partita ${mid}: id orfano ${String(e?.playerId)}`);
        if (seen.has(pid)) errors.push(`partita ${mid}: giocatore duplicato ${pid}`);
        seen.add(pid);
        if (!Number.isInteger(e?.goals) || e.goals < 0) errors.push(`partita ${mid}: gol non valido per ${pid}`);
        if (!Number.isInteger(e?.ownGoals) || e.ownGoals < 0) errors.push(`partita ${mid}: autogol non valido per ${pid}`);
      }
    }
    const idsA = new Set(a.map((e) => normId(e?.playerId)));
    const idsB = new Set(b.map((e) => normId(e?.playerId)));
    for (const [mvp, ids, label] of [
      [m?.mvpA, idsA, "mvpA"],
      [m?.mvpB, idsB, "mvpB"],
    ]) {
      if (mvp != null && String(mvp) !== "") {
        const pid = normId(mvp);
        if (!byId.has(pid)) errors.push(`partita ${mid}: ${label} orfano ${String(mvp)}`);
        else if (!ids.has(pid)) errors.push(`partita ${mid}: ${label} ${pid} non in squadra`);
      }
    }
    const critica = String(m?.critica ?? "").trim();
    if (critica !== "") {
      const pid = normId(critica);
      if (!byId.has(pid)) errors.push(`partita ${mid}: guidinha orfana ${critica}`);
      else if (!seen.has(pid)) errors.push(`partita ${mid}: guidinha ${pid} non ha giocato`);
      else guidinhaToComplete.push({ matchId: mid, date: String(m?.date ?? ""), playerId: pid });
    }
  }

  // --- controlli credenziali (solo struttura, nessun segreto in output) ---
  const accessById = new Map();
  for (const r of accessRows) {
    const pid = normId(r?.playerId);
    if (!pid) {
      errors.push("FN_ACCESS: riga senza playerId");
      continue;
    }
    if (accessById.has(pid)) errors.push(`FN_ACCESS: playerId duplicato ${pid}`);
    else accessById.set(pid, r);
    if (!byId.has(pid)) errors.push(`FN_ACCESS: id orfano ${pid}`);
    const origin = r?.pinOrigin == null || r?.pinOrigin === "" ? "" : String(r.pinOrigin);
    if (origin !== "" && origin !== "user") errors.push(`FN_ACCESS: pinOrigin non valido per ${pid}`);
  }

  // --- controlli voti + deduplica (tiene updated_at piu' recente) ---
  const ATTR = ["velTuf", "tirPre", "passRin", "driRif", "difRea", "fisPia"];
  const dedup = new Map();
  let duplicateVotes = 0;
  for (const r of voteRows) {
    const voter = normId(r?.voterId);
    const target = normId(r?.targetId);
    if (!voter || !target) {
      errors.push("FN_VOTES: riga senza votante o target");
      continue;
    }
    if (!byId.has(voter)) errors.push(`FN_VOTES: votante orfano ${voter}`);
    if (!byId.has(target)) errors.push(`FN_VOTES: target orfano ${target}`);
    if (voter === target) errors.push(`FN_VOTES: autovoto ${voter}`);
    for (const k of ATTR) {
      const n = r?.[k];
      if (!Number.isInteger(n) || n < 1 || n > 99) errors.push(`FN_VOTES: ${voter}->${target} valore fuori 1..99 (${k})`);
    }
    const key = voter + "→" + target;
    const prev = dedup.get(key);
    if (!prev) {
      dedup.set(key, r);
    } else {
      duplicateVotes += 1;
      const tPrev = new Date(prev?.updatedAt ?? 0).getTime();
      const tCur = new Date(r?.updatedAt ?? 0).getTime();
      if ((isNaN(tCur) ? 0 : tCur) >= (isNaN(tPrev) ? 0 : tPrev)) dedup.set(key, r);
    }
  }

  if (errors.length > 0) {
    throw new Error("Controlli bloccanti falliti:\n- " + errors.slice(0, 50).join("\n- ") + (errors.length > 50 ? `\n... (+${errors.length - 50} altri)` : ""));
  }

  // --- riepilogo senza segreti (solo conteggi e nomi) ---
  const noFlag = [];
  const noNation = [];
  for (const [id, p] of byId) {
    const nation = String(p?.nationUrl ?? "");
    // Il flag non si importa mai: resta vuoto per tutti.
    noFlag.push({ id, name: String(p?.name ?? id), nationUrl: nation });
    if (!nation) noNation.push({ id, name: String(p?.name ?? id) });
  }
  const admins = [...byId.keys()].filter((id) => ADMIN_IDS.has(id));
  const withPin = [...byId.keys()].filter((id) => {
    const r = accessById.get(id);
    return r && String(r?.pinOrigin ?? "") === "user" && r?.salt && r?.pinHash;
  });

  // --- SQL (ordine compatibile con i trigger: match senza guidinha, poi righe, poi update).
  // Niente BEGIN/COMMIT: l'API D1 li rifiuta (transazione implicita del batch).
  const L = [];
  L.push(`INSERT INTO seasons (id, name, is_active) VALUES (1, ${esc(SEASON_NAME)}, 1);`);

  const sortedIds = [...byId.keys()].sort();
  for (const id of sortedIds) {
    const p = byId.get(id);
    const name = String(p?.name ?? id);
    const role = String(p?.role ?? "");
    const active = p?.active === false ? 0 : 1;
    const canLogin = active;
    const isAdmin = ADMIN_IDS.has(id) ? 1 : 0;
    L.push(
      `INSERT INTO players (id, name, role, flag, active, can_login, is_admin) VALUES (${esc(id)}, ${esc(name)}, ${esc(role)}, NULL, ${active}, ${canLogin}, ${isAdmin});`,
    );
  }

  const sortedMatches = [...matches].sort((a, b) =>
    String(a?.date ?? "") < String(b?.date ?? "") ? -1 : String(a?.date ?? "") > String(b?.date ?? "") ? 1 : String(a?.id) < String(b?.id) ? -1 : 1,
  );
  for (const m of sortedMatches) {
    const mid = String(m?.id ?? "");
    const date = String(m?.date ?? "");
    L.push(
      `INSERT INTO matches (id, season_id, date, status, guidinha_player_id, guidinha_text, published_at) VALUES (${esc(mid)}, 1, ${esc(date)}, 'published', NULL, NULL, ${esc(date)});`,
    );
  }

  for (const m of sortedMatches) {
    const mid = String(m?.id ?? "");
    for (const [entries, team, mvp] of [
      [m?.teamA ?? [], "A", m?.mvpA],
      [m?.teamB ?? [], "B", m?.mvpB],
    ]) {
      for (const e of entries) {
        const pid = normId(e?.playerId);
        const goals = e?.goals ?? 0;
        const own = e?.ownGoals ?? 0;
        const isMvp = String(mvp ?? "") !== "" && normId(mvp) === pid ? 1 : 0;
        L.push(
          `INSERT INTO match_players (match_id, player_id, team, goals, own_goals, mvp) VALUES (${esc(mid)}, ${esc(pid)}, ${esc(team)}, ${goals}, ${own}, ${isMvp});`,
        );
      }
    }
  }

  for (const g of guidinhaToComplete) {
    // guidinha_text vuoto = da completare (ammesso dal vincolo NOT NULL).
    L.push(`UPDATE matches SET guidinha_player_id=${esc(g.playerId)}, guidinha_text='' WHERE id=${esc(g.matchId)};`);
  }

  for (const id of sortedIds) {
    const r = accessById.get(id);
    const salt = r?.salt == null ? "" : String(r.salt);
    const hash = r?.pinHash == null ? "" : String(r.pinHash);
    const origin = r?.pinOrigin == null || r?.pinOrigin === "" ? "" : "user";
    const updated = toIso(r?.updatedAt, now);
    L.push(
      `INSERT INTO credentials (player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, session_version, updated_at) VALUES (${esc(id)}, ${esc(salt)}, ${esc(hash)}, ${esc(origin)}, 1, 0, 0, ${esc(updated)});`,
    );
  }

  const sortedVotes = [...dedup.values()].sort((a, b) =>
    String(a?.voterId).localeCompare(String(b?.voterId)) || String(a?.targetId).localeCompare(String(b?.targetId)),
  );
  for (const r of sortedVotes) {
    const voter = normId(r?.voterId);
    const target = normId(r?.targetId);
    const updated = toIso(r?.updatedAt, now);
    L.push(
      `INSERT INTO votes (voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia, updated_at) VALUES (${esc(voter)}, ${esc(target)}, ${r.velTuf}, ${r.tirPre}, ${r.passRin}, ${r.driRif}, ${r.difRea}, ${r.fisPia}, ${esc(updated)});`,
    );
  }
  L.push("-- fine migrazione passo 1");

  const summary = {
    season: SEASON_NAME,
    players: byId.size,
    matches: matches.length,
    votes: dedup.size,
    voteRowsIn: voteRows.length,
    duplicateVotes,
    credentials: byId.size,
    credentialsWithPin: withPin.length,
    credentialsWithPinIds: withPin.sort(),
    noNation,
    noFlagCount: noFlag.length,
    noFlag,
    guidinhaToComplete,
    admins: admins.sort(),
  };
  return { sql: L.join("\n") + "\n", summary };
}
