# Database Flannery Night v2 (D1)

## Tabelle

`seasons`, `players`, `credentials`, `matches`, `match_players`, `votes`,
`audit_log`. Lo schema completo e i vincoli sono in `migrations/0001_init.sql`
e `migrations/0002_role2.sql`.

`players.role2` e il secondo ruolo facoltativo (solo `DC/DL/CC/CL/PC`
oppure `NULL`): mai per il portiere e mai `P`. Le regole incrociate
(diverso dal ruolo principale, niente secondo ruolo al portiere) vivono
nel codice, non nei vincoli.

## Trigger: regola obbligatoria

I tre trigger Guidinha **non** stanno nelle migrazioni, ma in
`migration/triggers.sql`. Motivo: `wrangler d1 migrations apply` invia il
file al D1 remoto in un'unica richiesta, che spezza il testo su ogni `;` e
tronca i corpi `BEGIN ... END` (errore `incomplete input`). Lo stesso file
con `wrangler d1 execute` va invece letto da SQLite, che lo interpreta
per intero.

**Su un database nuovo, dopo aver applicato le migrazioni, caricare
`migration/triggers.sql` con `execute --file`**, prima di caricare i dati:

```bash
npx wrangler d1 migrations apply DB
npx wrangler d1 execute DB --file="migration/triggers.sql"
```

Regole applicate dai trigger:

- il giocatore indicato come Guidinha deve aver giocato quella partita
  (controllo su insert e su update di `guidinha_player_id`);
- non si può togliere dalla formazione il giocatore indicato come Guidinha.

## Credenziali

`credentials` tiene `salt`, `pin_hash`, `hash_version` (1 = SHA256,
2 = HMAC con `PIN_PEPPER`), `pin_origin`, `failed_attempts`, `locked_until`
e `session_version`. `session_version` chiude le sessioni aperte quando il
cambio PIN o il reset incrementano il valore.

## Audit

`audit_log` riceve login falliti, blocchi, creazione e cambio PIN, reset,
sblocco e accessi all'area di amministrazione. Nei dettagli non finiscono
mai PIN, salt o hash.