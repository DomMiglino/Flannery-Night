-- Secondo ruolo facoltativo per i giocatori di movimento.
-- Mai per il portiere e mai il portiere come secondo ruolo: solo
-- DC, DL, CC, CL, PC oppure NULL (nessun secondo ruolo). NULL passa
-- sempre il CHECK di SQLite, quindi i giocatori esistenti restano validi.
-- Le regole incrociate (diverso dal ruolo principale, niente P con
-- secondo ruolo) vivono nel codice, non nei vincoli.
ALTER TABLE players ADD COLUMN role2 TEXT CHECK (role2 IN ('DC', 'DL', 'CC', 'CL', 'PC'));
