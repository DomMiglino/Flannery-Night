-- PASSO 1 / versione 1: fondamenta Flannery Night v2.
-- Un solo database D1, tabelle come da specifica. Nessun dato reale qui.

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE players (
  id TEXT PRIMARY KEY CHECK (id <> '' AND id = lower(id)),
  name TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('P', 'DC', 'DL', 'CC', 'CL', 'PC')),
  flag TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  can_login INTEGER NOT NULL DEFAULT 1 CHECK (can_login IN (0, 1)),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name)
);

CREATE TABLE credentials (
  player_id TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  salt TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL DEFAULT '',
  pin_origin TEXT NOT NULL DEFAULT '' CHECK (pin_origin IN ('', 'user')),
  hash_version INTEGER NOT NULL DEFAULT 1 CHECK (hash_version IN (1, 2)),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TEXT,
  session_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  season_id INTEGER NOT NULL REFERENCES seasons (id) ON DELETE RESTRICT,
  date TEXT NOT NULL CHECK (date <> ''),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  guidinha_player_id TEXT REFERENCES players (id) ON DELETE SET NULL,
  guidinha_text TEXT,
  field_name TEXT,
  field_maps_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  -- guidinha_text richiesto quando guidinha_player_id presente.
  -- La stringa vuota significa da completare in migrazione.
  CHECK ((guidinha_player_id IS NULL) OR (guidinha_text IS NOT NULL))
  -- Una sola Guidinha per partita: garantito dalle due colonne singole.
);

CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE RESTRICT,
  team TEXT NOT NULL CHECK (team <> ''),
  goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
  own_goals INTEGER NOT NULL DEFAULT 0 CHECK (own_goals >= 0),
  mvp INTEGER NOT NULL DEFAULT 0 CHECK (mvp IN (0, 1)),
  PRIMARY KEY (match_id, player_id)
);

CREATE TABLE votes (
  voter_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  vel_tuf INTEGER NOT NULL CHECK (vel_tuf BETWEEN 1 AND 99),
  tir_pre INTEGER NOT NULL CHECK (tir_pre BETWEEN 1 AND 99),
  pass_rin INTEGER NOT NULL CHECK (pass_rin BETWEEN 1 AND 99),
  dri_rif INTEGER NOT NULL CHECK (dri_rif BETWEEN 1 AND 99),
  dif_rea INTEGER NOT NULL CHECK (dif_rea BETWEEN 1 AND 99),
  fis_pia INTEGER NOT NULL CHECK (fis_pia BETWEEN 1 AND 99),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (voter_id, target_id),
  CHECK (voter_id <> target_id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  actor_player_id TEXT REFERENCES players (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action <> ''),
  detail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_matches_season_date ON matches (season_id, date, id);
CREATE INDEX idx_match_players_player ON match_players (player_id, match_id);
CREATE INDEX idx_match_players_match_team ON match_players (match_id, team);
CREATE INDEX idx_votes_target ON votes (target_id, voter_id);
CREATE INDEX idx_credentials_origin ON credentials (pin_origin);
CREATE INDEX idx_audit_at ON audit_log (at, id);

-- Regole Guidinha applicate dai trigger in migration/triggers.sql.
-- I trigger vivono fuori da questa migrazione perche D1 remoto spezza
-- il file sui punti e virgola dentro i corpi BEGIN END.
-- Caricarli con d1 execute dopo questa migrazione, prima dei dati.
