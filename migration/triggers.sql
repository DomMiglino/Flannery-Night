-- Trigger Guidinha, stesse regole della migrazione 0001.
-- Caricare con d1 execute dopo la 0001 e prima dei dati.
-- Non usare d1 migrations apply su questo file.

-- Il giocatore guidinha deve aver giocato quella partita.
CREATE TRIGGER trg_matches_guidinha_played_insert
BEFORE INSERT ON matches
FOR EACH ROW
WHEN NEW.guidinha_player_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = NEW.id AND player_id = NEW.guidinha_player_id
    )
    THEN RAISE(ABORT, 'guidinha must have played that match')
  END;
END;

CREATE TRIGGER trg_matches_guidinha_played_update
BEFORE UPDATE OF guidinha_player_id ON matches
FOR EACH ROW
WHEN NEW.guidinha_player_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = NEW.id AND player_id = NEW.guidinha_player_id
    )
    THEN RAISE(ABORT, 'guidinha must have played that match')
  END;
END;

-- Vieta di rimuovere dalla partita il giocatore indicato come guidinha.
CREATE TRIGGER trg_match_players_guidinha_protect_delete
BEFORE DELETE ON match_players
FOR EACH ROW
WHEN (SELECT guidinha_player_id FROM matches WHERE id = OLD.match_id) IS OLD.player_id
BEGIN
  SELECT RAISE(ABORT, 'cannot remove guidinha player from match');
END;
