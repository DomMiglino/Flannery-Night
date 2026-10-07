# Flannery Night: documento di passaggio (handoff)

Stato al: 6 ottobre 2026. Scritto per qualsiasi AI che debba continuare il progetto senza la conversazione originale. Leggilo tutto prima di toccare qualcosa.

Convenzione: **[DECISO]** = deciso dall'utente. **[PROPOSTA]** = idea non ancora confermata: chiedi all'utente prima di costruirla. **[DA VERIFICARE]** = non ho visto l'esito.

---

## 1. Cos'è il progetto e chi è l'utente

Flannery Night è un sito amatoriale per un gruppo di calcetto (circa 37 giocatori). Mostra una classifica, le valutazioni che i giocatori si danno tra loro (6 attributi, voti da 1 a 99) e l'archivio delle partite. Si accede con nome + PIN a 6 cifre (nessuna registrazione).

**L'utente non è un programmatore.** Lavora su Windows con PowerShell, ha accesso in scrittura alla repo GitHub (di proprietà di un amico) e controlla l'account Cloudflare. Fa lui tutte le operazioni "con effetti": test, commit, push, deploy, comandi remoti, segreti. Il sito è usato dagli amici ogni settimana: **non si deve perdere nessun dato**.

Il sito originale (GitHub Pages + Google Apps Script + Google Sheet) è stato sostituito. Il sito nuovo è **in produzione** su Cloudflare. L'amico proprietario della repo ha già disattivato GitHub Pages e cancellato il vecchio Apps Script e il Google Sheet (6 ottobre 2026). L'utente conserva da sé le copie dei dati vecchi nella cartella locale `FlanneryDati`, fuori dalla repo.

---

## 2. Stato: versione 1 completa

| Passo | Contenuto | Stato |
|---|---|---|
| 1-3 | Fondamenta, Cloudflare, backend | FATTO |
| 4 | Sito pubblico (Classifica, Giocatori, Partite, Home, Accesso) | FATTO e rifinito |
| 5 | Gestione admin dentro le pagine (5a partite, 5b giocatori e bandiere, 5c stagione/registro/esportazione) | FATTO |
| 6 | Chiusura: equivalenza dati, passaggio, pulizia | FATTO (vedi sezione 12). Dominio: non comprato, deciso di restare su workers.dev |

Indirizzo di produzione, **deciso di non cambiarlo e di non comprare un dominio**: `https://flannery-night-v2.flannerynight.workers.dev`. Rinominare il Worker creerebbe un Worker nuovo senza segreti: sconsigliato (rischio per i PIN). Il vecchio indirizzo GitHub Pages sparirà.

---

## 3. Infrastruttura e stack

| Elemento | Scelta |
|---|---|
| Hosting | **Cloudflare Workers con static assets**: un solo progetto serve sito e API. Piano gratuito |
| Backend | TypeScript, nessun framework pesante |
| Frontend | HTML, CSS e JavaScript vanilla in `public/`, router con History API, nessuna libreria, nessuna risorsa remota |
| Database | **Cloudflare D1** (SQLite), nome `flannery-night-v2`, binding `DB` |
| Test | vitest su miniflare con D1 locale e fixture inventate; `tsc --noEmit` |
| Deploy | wrangler 4.x (`npx wrangler deploy`) |
| Repo | `Flannery-Night`. Lavoro sul branch **`v2`**. `main` contiene la pagina di manutenzione. Merge su `main` **[DA DECIDERE]**: farlo solo dopo che l'amico ha spento Pages (altrimenti GitHub pubblica i file) |
| Immagini future | Cloudflare R2 (non ancora usato) |

`wrangler.toml`: assets con fallback SPA, `run_worker_first = true` (ogni richiesta passa dal Worker per le intestazioni di sicurezza), sezione `[build]` con `command = "node scripts/genera-bandiere.mjs"` (genera l'elenco delle bandiere a ogni `dev` e `deploy`). **Non c'è più `ADMIN_PATH`.**

**Segreti** (mai nel repo, mai in chat): `PIN_PEPPER` e `SESSION_SECRET`, impostati con `npx wrangler secret put`. **`PIN_PEPPER` non si può rileggere e non va mai cambiato né perso** (gli hash PIN dipendono da lui; l'utente ne tiene copia in un gestore di password). Cambiare `SESSION_SECRET` fa solo uscire tutti dalle sessioni.

Limiti del piano gratuito (verifica sempre la documentazione attuale): 10 ms di CPU per richiesta (per questo gli hash PIN usano HMAC-SHA256), 100.000 richieste al giorno, limiti giornalieri di righe lette/scritte su D1.

---

## 4. Come si lavora (regole ferree)

### Flusso usato finora

L'utente non usa un'AI che lavora da sola: un'AI "consulente" (tu) scrive **prompt** che l'utente gira a un'**AI esecutrice** che modifica il repo. Poi l'utente lancia lui `npx vitest run` e `npx tsc --noEmit`, e tu gli dai **titolo del commit** e comandi (`git add -A`, `git status`, `git commit`, `git push`, `npx wrangler deploy`) più una lista di controlli da fare dal telefono in scheda privata. Se l'AI esecutrice esaurisce i crediti, si fa prima un audit in sola lettura (o l'utente incolla `git status` e l'esito dei test) e poi un prompt di completamento solo con ciò che manca.

### Regole per qualsiasi AI esecutrice

1. **Non eseguire mai** `wrangler deploy`, comandi con `--remote`, `wrangler secret put`, `git commit`, `git push`. Da un certo punto l'utente chiede anche di **non eseguire test, tsc né wrangler dev**: li lancia lui. In quel caso si scrivono i test ma non si eseguono.
2. **Mai dati o segreti nella repo né nei log**: niente PIN, hash, salt, voti reali, `.dev.vars`, file `.sql` di dati. I file dei dati reali stanno fuori dalla repo (`FlanneryDati`). `.gitignore` copre `backup/`, i `.sql` generati, `.dev.vars`, `node_modules/`, `.wrangler/`.
3. Vietati `git reset --hard`, `git checkout .`, `git clean`, `git stash`. Non toccare `main`.
4. Nessuna risorsa esterna nel sito. Testi dall'API solo con `textContent`, mai `innerHTML`. Script e stili in file esterni (CSP `default-src 'self'`: niente inline, niente attributi `style` generati; usa classi).
5. Interfaccia sempre **in italiano**, **mobile-first** (360 px minimo), nessuno scroll orizzontale della pagina (solo dentro le tabelle), bersagli toccabili di almeno 44 px. La parola "admin" non compare nell'interfaccia visibile.
6. Mantieni sempre nel CSS `[hidden]{display:none!important}` (c'è un test di guardia). Il suo assenza aveva fatto comparire voci di menu nascoste.
7. **Termini vietati** nel codice nuovo (ricerca senza distinzione di maiuscole, deve risultare vuota): `legacy`, `assist`, `tiri in porta`, `passaggi chiave`, `dribbling`, `recuperi`, `duelli`, `parate`, `advancedTracked`, `notes`, `critica` (si chiama **Guidinha**), `Supabase`, `Apps Script`, `JSONP`, `adminbridge`. **Eccezioni attuali**: `migration/build.mjs` e `tests/fixtures/season.json` contengono i campi del formato vecchio che devono leggere (restano perché `tests/helpers/server.ts` li usa per il seed di tutti i test).
8. Se non c'è una funzione, **non compare nulla**: niente segnaposto.
9. Se qualcosa è ambiguo, scegli la soluzione più semplice e dichiaralo nel report.
10. Il browser **non calcola** overall, mediane, Power Score, forma, risultati ufficiali: li espone il server (`src/calc.ts`). Le funzioni del browser ordinano e mostrano.
11. Non modificare lo schema né i trigger se non richiesto. Nessuna nuova migrazione senza accordo.

### Regole sul database (D1 remoto)

- `migrations apply --remote` invia l'intero file e D1 lo spezza sui `;`: i corpi dei **trigger** lo rompono. Per questo i trigger stanno in `migration/triggers.sql`, **fuori dalle migrazioni** (permanente), e si caricano a mano con `execute --file`. Regola scritta in `docs/DATABASE.md`.
- Nelle migrazioni: niente trigger, niente `PRAGMA`, niente `BEGIN/COMMIT`, niente virgolette o `;` nei commenti.
- Ogni scrittura multipla va in un unico `db.batch` (atomico). I trigger limitano l'ordine delle istruzioni (vedi sezione 5).

### Comandi (PowerShell, nella cartella del repo, branch `v2`)

```powershell
npx vitest run
npx tsc --noEmit

git add -A
git status
git commit -m "messaggio"
git push

npx wrangler deploy
# solo se cambia lo schema:
npx wrangler d1 migrations apply flannery-night-v2 --remote
npx wrangler d1 execute flannery-night-v2 --remote --file="migration/triggers.sql"

# backup (file FUORI dalla repo: contiene hash dei PIN e voti)
npx wrangler d1 export flannery-night-v2 --remote --output="C:\Users\anton\Documents\FlanneryDati\backup-AAAA-MM-GG.sql"
```

Prima di ogni commit controllare che `git status` NON mostri `.dev.vars`, `.sql` di dati, `backup/`, `old_db/`, `migrations/` o `migration/triggers.sql` modificati senza motivo.

### Operazioni manuali sul database (fuori dall'app)

Eliminare il voto di un giocatore a un altro: controllare con `SELECT * FROM votes WHERE voter_id='X' AND target_id='Y'` (deve dare una riga), fare il backup, poi `DELETE FROM votes WHERE voter_id='X' AND target_id='Y'`, tramite `npx wrangler d1 execute flannery-night-v2 --remote --command="..."` o la console D1 del dashboard. Le medie si ricalcolano da sole. L'operazione non finisce nel registro. Già fatto una volta: voto di `samuel` a `koke` (voti totali scesi a 204).

---

## 5. Database

Tabelle:

- `players(id, name, role, flag, active, can_login, is_admin, created_at)`: `id` slug minuscolo (es. `salvio`), `name` unico senza distinzione di maiuscole, `role` in `P/DC/DL/CC/CL/PC`, `flag` = **nome del file con estensione** (es. `Costa Rica.png`). `active` esiste ma **non si usa nessuna logica su attivi/disattivi** [DECISO]: i nuovi giocatori nascono `active=1` e non ci sono interruttori.
- `credentials(player_id, salt, pin_hash, pin_origin, hash_version, failed_attempts, locked_until, session_version, updated_at)`: `pin_origin` `''` = PIN mai creato, `'user'` = creato dall'utente.
- `seasons(id, name, is_active, created_at)`
- `matches(id, season_id, date, status, guidinha_player_id, guidinha_text, field_name, field_maps_url, created_at, published_at)`: **non esistono bozze** [DECISO]: `status` vale sempre `'published'`. `field_*` predisposti e non ancora usati (servono alla versione 2).
- `match_players(match_id, player_id, team, goals, own_goals, mvp)`: `team` etichetta libera (oggi `A`/`B`).
- `votes(voter_id, target_id, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia, updated_at)`: chiave (votante, target), valori 1..99, niente autovoto.
- `audit_log(id, at, actor_player_id, action, detail)`: mai PIN o hash. La FK `actor_player_id` azzera l'autore se il giocatore viene eliminato.
- 3 trigger (`migration/triggers.sql`): la Guidinha deve aver giocato la partita (insert/update) e protezione dalla cancellazione di chi ha la Guidinha. Una sola Guidinha per partita; `guidinha_text` obbligatorio se c'è il giocatore (`''` = da completare).

**Ordine nei batch** (per non far scattare i trigger):
- crea partita: partita senza Guidinha, righe giocatori, poi Guidinha;
- modifica: azzera Guidinha, cancella righe, aggiorna data, reinserisci, poi Guidinha;
- elimina partita: azzera Guidinha, righe, partita;
- elimina giocatore: voti, credenziali, giocatore (solo se non ha righe in `match_players`).

**Stato dei dati reali** (da verificare con i conteggi, cambiano con l'uso): 37 giocatori, 5 partite della stagione `2026/27`, circa 204 voti (205 importati, uno tolto a mano), 15+ PIN creati.
- Admin (`is_admin=1`): `antonio`, `vito`, `mimmo`. Attenzione: `antonioportiere` è un altro giocatore, non admin.
- 12 PNG in `public/flags/`; 10 bandiere assegnate nei dati.
- 3 giocatori recenti hanno id generati (`id-...`): **non si normalizzano** [DECISO].
- La Guidinha del 10/09 aveva testo vuoto: va completata dall'editor partite **[DA VERIFICARE se già fatto]**.

---

## 6. Regole di dominio e formule [DECISO]

**Risultato.** Gol della squadra + autogol dell'avversaria. V/P/S. Punti 3/1/0.

**Peso MVP.** In ogni squadra, ogni MVP vale `1/n` (n = MVP di quella squadra in quella partita), gli altri 0. Il peso non si salva.

**Flannery Power Score** = `round1( min(20, max(0, max(mediaPunti,1) * sommaPesiMVP)) + punti )`, `mediaPunti = punti/giocate`, `round1` = half-up a un decimale. Ordine classifica: Power Score decrescente, poi somma pesi MVP decrescente (campo `mvpWeight` nell'API per gli spareggi), poi nome.

**Rendimento.** Ultime 5 partite cronologiche (V/P/S), con ★ dove MVP.

**Forma.** Sulle ultime 5, pesi dall'ultima: 3, 2, 2, 1, 1. Punteggio = media pesata dei punti + media pesata del flag MVP. Frecce: `>= 2,4` ↑, `>= 1,7` ↗, `>= 1,0` →, `>= 0,3` ↘, altrimenti ↓. API espone `formaScore` e `formaArrow`; si ordina sul punteggio, non sulla freccia.

**Statistiche per stagione.** Solo partite della stagione scelta. Una nuova stagione azzera classifica, presenze, gol, MVP, Guidinha, rendimento e forma, ma **non** giocatori, PIN, voti (overall ed esagono non si azzerano mai). **La Classifica esclude i giocatori con 0 presenze: il filtro sta nel server** (`played = 0` escluso da `/api/ranking`); nelle nuove stagioni la Classifica parte vuota.

**Guidinha.** (Prima "critica".) Al massimo una per partita, facoltativa; se c'è, giocatore e descrizione obbligatori (tranne le storiche con testo vuoto, completabili); il giocatore deve aver giocato. Non pesa sul Power Score.

**Overall.** Per ogni attributo, la **mediana** dei voti ricevuti (pari: media dei due centrali), poi media pesata per ruolo. Con 0 voti overall nullo, con 1 voto basta. Pesi nell'ordine `VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA`:

| Ruolo | VEL/TUF | TIR/PRE | PASS/RIN | DRI/RIF | DIF/REA | FIS/PIA |
|---|---|---|---|---|---|---|
| P | .25 | .15 | .10 | .25 | .10 | .15 |
| DC | .15 | 0 | .10 | .05 | .40 | .30 |
| DL | .20 | 0 | .15 | .05 | .30 | .30 |
| CC | .15 | .15 | .30 | .15 | .15 | .10 |
| CL | .30 | .10 | .20 | .25 | .05 | .10 |
| PC | .20 | .40 | .05 | .15 | 0 | .20 |

Tabella unica in `src/calc.ts`.

**Overall mostrato.** Intero **arrotondato per eccesso** (85,01 → 86), calcolato nel server in aritmetica intera (`overallUp`, `myOverallUp`). L'ordinamento usa il valore esatto.

**Sigle degli attributi.** Portieri (ruolo P): `TUF, PRE, RIN, RIF, REA, PIA`. Gli altri: `VEL, TIR, PASS, DRI, DIF, FIS`. Mai le due varianti unite ("VEL/TUF") nelle pagine; da `ratings.js:etichettePerRuolo`.

**Voti.** 6 valori interi 1..99, un voto per coppia (aggiornato, mai duplicato), niente autovoto, votante con `can_login=1`. I voti singoli non si espongono mai (solo mediane, il proprio voto e il numero di voti). L'esportazione admin è l'unica eccezione e include i voti singoli, senza credenziali.

**Moduli di squadra (funzioni future).** Solo 5, 6 o 8 per squadra (10, 12, 16 in totale). 5v5: portiere, DC, due laterali, punta (1-1-2-1). 6v6: più un CC (1-1-2-1-1). 8v8: portiere, DL-DC-DL, CL-CC-CL, punta (1-3-3-1). I laterali del 5 e del 6 contano sempre come DL. Chiunque può giocare ovunque: fuori ruolo si mostra l'overall con il ruolo dello slot (calcolo sul telefono, mai salvato). Nel gruppo ci sono pochissimi portieri (3) e DC (2).

---

## 7. Accesso, permessi e sicurezza [DECISO]

- Identità: **giocatore + PIN a 6 cifre**. Chi non ha PIN lo crea scrivendolo due volte.
- Hash PIN: v1 = `SHA256(salt|pin)` (importato), v2 = `HMAC-SHA256` con `PIN_PEPPER`; al primo accesso riuscito v1 diventa v2. Confronto a tempo costante.
- Blocco: 5 errori consecutivi, 15 minuti (30 per gli admin); un admin può sbloccare subito.
- Sessione: cookie `HttpOnly`, `Secure`, `SameSite=Lax`, token firmato con `playerId`, `session_version`, emissione e scadenza. **Durata 90 giorni, 14 giorni per gli admin**; a ogni richiesta un admin con token emesso da più di 14 giorni riceve 401 (valutato sul database). Cambio PIN, reset PIN e `can_login` 1→0 incrementano `session_version`.
- Controllo `Origin` su ogni POST/PUT/DELETE.
- **Permesso admin = `players.is_admin` letto dal database a ogni richiesta** (mai dal cookie). **Nessuna area separata, nessun URL dedicato, nessuna riconferma PIN, nessun cookie admin** [DECISO]. `GET /api/me` espone `isAdmin` solo per mostrare o nascondere i tasti; la sicurezza è sul server. Il permesso `is_admin` **non si modifica dall'interfaccia**: gli admin sono tre.
- Giocatori con `can_login=0` (esterni): compaiono in classifica e si possono votare, ma non accedono né creano PIN.
- PIN dimenticato: l'admin lo azzera e il giocatore ne crea uno nuovo.
- Intestazioni: `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`.

### API

Pubbliche e utente: `GET /api/auth/players`, `/api/auth/status`, `POST /api/auth/create-pin`, `/login`, `/logout`; `GET /api/me`, `POST /api/me/pin`, `GET /api/me/votes`, `PUT /api/votes/:targetId`; `GET /api/seasons`, `/api/ranking?season=`, `/api/players`, `/api/players/:id?season=`, `/api/matches?season=`.

Admin (login + `is_admin` dal DB + Origin sulle scritture, ogni scrittura in `audit_log`):
- Partite: `GET/POST /api/admin/matches`, `GET/PUT/DELETE /api/admin/matches/:id`.
- Giocatori: `GET/POST /api/admin/players`, `GET/PUT/DELETE /api/admin/players/:id`, `POST .../reset-pin`, `POST .../unlock`, `GET /api/admin/flags`.
- Stagioni: `POST /api/admin/seasons`.
- Registro: `GET /api/admin/audit` (50 per pagina, cursore `before`).
- Esportazione: `GET /api/admin/export` (JSON scaricabile `flannery-night-AAAA-MM-GG.json`, mai credenziali né registro).

Azioni nel registro: creazione/modifica/eliminazione di partite e giocatori, `reset_pin`, `unlock`, `season_create`, `export_data`, più accessi, uscite, cambi PIN esistenti. **Gli accessi falliti non sono registrati** [PUNTO APERTO, non richiesto].

---

## 8. Sito pubblico: com'è

- **Percorsi:** `/classifica`, `/giocatori`, `/giocatori/:id`, `/partite`, `/home` (solo con accesso), `/accesso`, `/accesso/cambia`, `/registro` (solo admin). Percorsi di gestione aperti da non admin (`/partite/nuova`, `/giocatori/nuovo`, ecc.) mostrano la pagina normale, senza errori.
- **Barra in basso:** sempre 4 voci (Home, Classifica, Giocatori, Partite). `/home` senza accesso porta all'accesso.
- **Icona account:** senza accesso porta all'accesso; con accesso apre il menu con "Cambia PIN", "Esci" e, **solo per gli admin**, "Registro" ed "Esporta dati" (voci create dinamicamente, nessun nodo per gli altri).
- **Classifica:** tabella scorrevole con prima colonna ferma opaca, 14 colonne ordinabili (non il Rendimento), posizione sempre ufficiale (Power Score), selettore di stagione. Solo admin: tasto **"Nuova stagione" in fondo**, dopo la tabella, solo sulla stagione attiva (nome suggerito "2026/27" → "2027/28", conferma a due passi).
- **Giocatori:** **due tabelle**: "Portieri" (sigle TUF, PRE, RIN, RIF, REA, PIA; ordine iniziale overall decrescente, poi nome) e "Giocatori di movimento" (sigle base; ordine iniziale per ruolo DC, DL, CC, CL, PC, poi nome, poi overall). Ogni tabella ha ordinamento proprio. Filtro per ruolo e (con accesso) "Da votare" (esclude sé stessi e chi si è già votato). **Nessuna ricerca per nome, nessuna colonna "Mio"**: con accesso le celle degli attributi e dell'Overall mostrano "mediana / mio" (trattino se non assegnato) e c'è una riga di istruzione; senza accesso solo il valore. Solo admin: "Nuovo giocatore" in alto.
- **Scheda giocatore:** esagono SVG, overall, numero di voti, proprio voto tratteggiato, statistiche della stagione, blocco di voto con − e + e campo 1..99 (mai sulla propria scheda). Solo admin: "Modifica".
- **Home (con accesso):** il proprio esagono grande, nome, ruolo, overall, numero di voti.
- **Partite:** archivio compatto per data decrescente: testata con data, risultato e badge formato (solo a squadre pari), giocatori come chip con a capo, gol in pillola piena solo se > 0, autogol "-N" in pillola tratteggiata solo se > 0, ★ per MVP, una riga Guidinha. Solo admin: "Nuova partita" e "Modifica" (non per stagioni chiuse).
- **Editor partite** (dentro `/partite/nuova`, `/partite/:id/modifica`, solo admin): data, formato 5/6/8, squadre A/B scelte da **tutti** i giocatori con ricerca, stepper gol/autogol, MVP acceso/spento, Guidinha, anteprima non ufficiale, conferme per salva ed elimina. Pubblicazione immediata, modifica ed eliminazione anche di partite pubblicate (solo stagione attiva).
- **Editor giocatori** (`/giocatori/nuovo`, `/giocatori/:id/modifica`, solo admin): nome, ruolo, bandiera obbligatoria (menu dai PNG di `public/flags/`), interruttore "Può accedere"; stato PIN e blocco, "Azzera PIN", "Sblocca"; "Elimina giocatore" solo se non ha mai giocato, non admin e non sé stessi (conferma con numero di voti che spariscono).
- **Bandiere:** per aggiungerne una: copiare il PNG in `public/flags/` e fare il deploy (lo script `[build]` rigenera `src/flags_list.ts`; si può lanciare anche `npm run flags`). C'è un test che fallisce se l'elenco non coincide con la cartella.
- **Zoom:** `touch-action: manipulation` e campi da almeno 16px sui controlli; lo zoom a due dita **non** è disattivato (accessibilità).
- Icona del sito: `public/favicon.png` (48x48) e `public/apple-touch-icon.png` (180x180).

---

## 9. Cosa NON fare (eliminato per sempre) [DECISO]

- Valori `legacy`, statistiche avanzate, campo `notes`; collegamento con WhatsApp (messaggi automatici, pulsanti, bot); Supabase, Google Apps Script, Google Sheet come backend, JSONP, iframe di voto, CSV della classifica.
- Registrazione con email o password, recupero PIN automatico.
- Conferma di presenza, indice di affidabilità.
- **Bozze delle partite, logica attivi/disattivi, area `/copilota`, riconferma PIN, cambio di `is_admin` da interfaccia, normalizzazione degli id generati, tornei (triangolari/quadrangolari), notifiche.**
- Sondaggi: non ora (restano su WhatsApp fino alla versione 4).

---

## 10. Stato dei test

266 test passati dopo la pulizia finale (se `vitest` dà `EADDRINUSE`, è la porta ancora in TimeWait dopo una corsa interrotta: aspettare mezzo minuto e rilanciare; non è un difetto del codice). Prima erano circa 250 (`tests/`: calc, auth, dati, voti, admin partite, admin giocatori, admin stagione, frontend, partite). La pulizia ha tolto `tests/migration.test.ts`: il numero è sceso un po'. Prima di ogni commit l'utente lancia `npx vitest run` e `npx tsc --noEmit`, entrambi devono passare. `tests/helpers/server.ts` usa `migration/build.mjs` e `tests/fixtures/*` per il seed (**non eliminarli**).

---

## 11. Problemi noti e decisioni accettate

- Logout cancella solo i cookie, non invalida il token sul server [DECISO accettato].
- `GET /api/auth/status` distingue id esistenti da inesistenti [DECISO accettato].
- `run_worker_first = true`: ogni richiesta conta nella quota [DECISO accettato].
- Sessione admin di 14 giorni invece di 4 ore (nessuna riconferma PIN): chi ruba un telefono sbloccato può usare gli strumenti admin. Accettato [DECISO].
- Il blocco PIN è per account: chi conosce il nome di un admin può bloccarlo di proposito; gli altri admin sbloccano.
- Accessi falliti non registrati nel registro.
- Il conteggio partite nel registro di "Nuova stagione" è letto fuori dal batch (solo testo del registro, non i dati).
- La Guidinha del 10/09 e i 3 id generati: vedi sezione 5.
- `GET /api/admin/export` con sessione scaduta restituisce un errore JSON invece del file (nessuna gestione speciale).
- Non ancora verificati visivamente da me: resa su Safari iOS e tocco reale (l'utente prova dal telefono con scheda privata dopo ogni deploy).
- Time Travel di D1: limiti nel piano gratuito **[DA VERIFICARE]**; per ora backup a mano con `wrangler d1 export`.

---

## 12. Chiusura del passo 6: versione 1 CHIUSA (6 ottobre 2026)

Fatto: equivalenza dei dati verificata (conteggi e PIN vecchi funzionanti), vecchio sito spento (Pages, Apps Script, Sheet), pulizia del repo, `main` allineato a `v2` (merge fast-forward), placeholder di manutenzione rimossi, dipendenza `xlsx` rimossa (266 test passati, tsc pulito), `old_db/` non tracciata. Il branch `v2` si può tenere o eliminare lasciando solo `main` [DA DECIDERE: se si elimina, aggiornare "v2" in sezioni 3, 4 e 15]. Controllare sempre `git branch --show-current` prima di un commit. Mediana dei voti: l'utente ha valutato la media e **ha confermato di tenere la mediana** [DECISO].

Voci storiche della chiusura (già fatte, tenute come promemoria):

1. **L'amico proprietario della repo** deve: disattivare GitHub Pages (Settings → Pages) ed eliminare il progetto Apps Script e il Google Sheet "Flannery Night Backend" (e svuotare il cestino di Drive). L'utente ha le copie dei dati vecchi. Attendere il suo "fatto".
2. Dopo quel "fatto": merge di `v2` in `main` (oppure rendere `v2` il branch predefinito, ma solo il proprietario può). Prima verificare con `git ls-files` che non ci siano dati o segreti tracciati (ultimo controllo: pulito, solo file legittimi e fixture inventate).
3. Residui della pulizia: cartella `old_db/` (non tracciata, contenuto da verificare, non deve finire su GitHub); `index.html` e `admin.html` nella radice (placeholder di manutenzione, rimovibili dopo lo spegnimento di Pages); dipendenza npm `xlsx` ormai inutile (`npm uninstall xlsx` lo fa l'utente, aggiorna `package-lock.json`); `migration/build.mjs` e le fixture restano.
4. Annuncio dell'indirizzo nel gruppo WhatsApp (ognuno rifà il login una volta, PIN invariati).
5. Backup periodici a mano (`wrangler d1 export`), almeno prima di ogni cambio stagione e dopo grosse modifiche.
6. Provare "Nuova stagione" **mai sui dati veri** senza volerlo davvero: chiude la stagione `2026/27` e non si annulla dall'interfaccia.

---

## 13. Roadmap successiva

L'utente ha deciso un ordine di massima; i dettagli di ogni blocco si discutono "pagina per pagina" quando ci si arriva. Il lancio contiene **solo** la versione 1 descritta sopra.

### Versione 2: prenotazioni, fasi della partita, campo e Google Maps

Flusso reale (oggi su WhatsApp ed Excel): **una partita a settimana**, di solito mercoledì o giovedì alle 20 (in estate alle 21). Domenica mattina l'admin annuncia la partita; si prenota con una reazione; nei giorni dopo l'admin annuncia quanti sono e se servono altri (si cercano esterni approvati dall'admin); poi i convocati ufficiali e il **campo**; chiunque propone le squadre; l'admin chiude le proposte e si vota; l'admin annuncia le squadre (BIANCHI e NERI); a fine partita MVP, gol, Guidinha; l'admin pubblica.

**Campo di gioco** [DECISO, rientra nella versione 2]: nome del campo e **collegamento a Google Maps**, indicati dall'admin quando conferma i convocati e visibili nella card della partita. I campi `matches.field_name` e `field_maps_url` esistono già: nessuna nuova colonna.

**Fasi** (una sola partita corrente alla volta): 1 Annunciata (prenotazioni non aperte), 2 Prenotazioni aperte, 3 Lista in definizione (l'admin chiude manualmente), 4 Convocati e proposte aperte (esattamente 10, 12 o 16 giocatori, con campo), 5 Squadre ufficiali (proposta scelta e colore maglie BIANCO/NERO), 6 Giocata, 7 Pubblicata. "Annullata" sempre possibile.

**Regole delle prenotazioni** [DECISO]:
- Nessun tetto. Ordine per ora di prenotazione dell'**orologio del server** (Europe/Rome).
- L'utente si prenota e si toglie da solo solo dentro la fascia stabilita; fuori fascia decide l'admin. Chi si toglie e si riprenota riparte dall'ultimo posto.
- Le prenotazioni non si cancellano mai: stato "tolto" (il registro dice chi). L'admin può ripristinare con il posto originale. Conferma esplicita prima di togliersi.
- L'admin aggiunge un giocatore esistente o ne crea uno nuovo (solo nome) sempre in fondo, e può togliere in un tocco anche più giocatori insieme, dal telefono.
- "Conferma" attivo solo con esattamente 10, 12 o 16 giocatori. Dopo la conferma gli utenti non si tolgono più; se l'admin sostituisce un convocato, tutte le proposte prendono il sostituto nello stesso posto.
- Subentro suggerito e registro di ogni azione: nome e dettagli [DA DEFINIRE].
- Nomi e lista dei prenotati visibili a tutti, anche senza accesso. Niente conferma di presenza, niente messaggi automatici.
- Nessun WebSocket: il database con numerazione progressiva e vincoli di unicità assegna l'ordine; la pagina si aggiorna da sola ogni pochi secondi.
- Esterni senza `can_login=1`: non si prenotano né votano, ma compaiono nelle statistiche.

**Card della partita nella Home** (stati): nessuna partita pianificata; pianificata con prenotazioni non aperte; prenotazioni aperte (tasto **Prenotati** o "Sei prenotato, N° posto" con Togli); prenotazioni chiuse; confermata ("Si gioca a N", "Sei convocato"/"Non sei in lista", campo e Maps); squadre definitive (BIANCHI/NERI, ora, campo); giocata; risultato inserito; annullata. Senza accesso stessi stati e nomi; "Prenotati" porta all'accesso e poi torna.

**Schema indicativo** [PROPOSTA]: estendere `matches` (stato, apertura prenotazioni, ora, formato, colori); tabella `bookings(id, match_id, player_id, created_at server, removed_at, removed_by, added_by)` con unicità della prenotazione attiva per giocatore e partita; tabella `proposals` (autore, data, squadre). Aggiornamenti multipli atomici (`batch`). Attenzione: la versione 2 introdurrà stati su `matches` mentre oggi `status` vale sempre `published`.

### Versione 3: proposte di squadra

- Il **builder** compare solo quando la partita è confermata e le prenotazioni chiuse, solo a chi ha fatto l'accesso, ogni proposta ha un autore; i convocati sono la lista definitiva (ruolo, overall, forma); formazione per righe secondo i moduli della sezione 6.
- Spostando un giocatore su uno slot di ruolo diverso si mostra l'overall in quel ruolo (calcolo sul telefono, non salvato). Giocatori senza voti: senza overall, segnalato.
- Scelta della squadra definitiva fatta dall'admin tra le proposte, con colore maglie (bianco/nero).
- Il campo e Google Maps **non** stanno qui: sono nella versione 2.
- Formati diversi da 5, 6, 8 per squadra non previsti.

### Versione 4 e oltre (ordine ancora da decidere)

- **Votazione delle proposte di squadra** (solo convocati, periodo scelto dall'admin), **sondaggio MVP** subito dopo la partita (solo partecipanti), **sondaggio Guidinha** se ci sono più giocate: stessa struttura (opzioni, aventi diritto, chiusura), da costruire una volta sola. Fino ad allora restano su WhatsApp e l'admin inserisce a mano.
- **Formazione consigliata** [PROPOSTA]: con 2+ portieri tra i convocati assegna i ruoli massimizzando l'overall negli slot e bilanciando; con 0 o 1 portiere divide in due squadre equilibrate senza assegnare ruoli. Usa overall e forma (punteggio numerico).
- **Omini cartoon** per ogni giocatore (immagini su Cloudflare R2).
- **Tolti** [DECISO]: tornei (triangolari e quadrangolari) e notifiche.

---

## 14. Valori di riferimento per le verifiche (dati reali, 1 ottobre 2026)

Servono a controllare che i calcoli restino identici dopo una modifica; cambiano con nuove partite o voti.

- **Partite** (4 settembre – 1 ottobre): 7-6, 8-5, 5-2, 5-3, 2-5. Formati 5v5, 8v8, 8v8, 6v6, 8v8.
- **Classifica**: 30 giocatori con almeno una presenza (su 37). In testa Nicolas (Power Score 10,8, forma ↗), Angelo (10,0, ↑), Mimmo (9,0, →), poi Salvio e Tanino a 8,0. Rendimento di Nicolas: `V S S★ V V`.
- **Overall** (prima dell'arrotondamento per eccesso): Salvio 85,3 con 7 voti, Nicolas 82,6 con 8, Mimmo 81,6 con 7, Carletto 83,1 con 10, AntonioPortiere 86,25 (con il ceiling 87), Ale 85,4. Tre giocatori (Aung, Matic, Sergio) senza voti ricevuti: overall nullo. Koke è cambiato dopo l'eliminazione manuale del voto di Samuel.
- **Voti:** 205 importati, uno per coppia; ora 204.

---

## 15. Come comunicare con l'utente e come scrivere i prompt per le altre AI

**Con l'utente:**
- Italiano semplice; utente non tecnico che segue i comandi alla lettera. Comandi PowerShell **in ordine e uno alla volta** quando c'è rischio, dicendo cosa deve vedere e cosa fare se non lo vede. Nei comandi lunghi, controlla che funzionino incollati interi in PowerShell.
- Chiedi **una sola decisione per volta**, con un default proposto. L'utente vuole decisioni esplicite: non aggiungere funzioni non richieste, né segnaposto.
- Non chiedergli mai di incollare segreti, PIN o hash in chat.
- Se un errore è tuo, dillo chiaramente. Se dubiti di un report dell'AI esecutrice, verificalo con i dati (output di `vitest`, `git status`, grep). Un report che omette test, esito o conferme va trattato come incompleto: i numeri veri li dà l'utente lanciando i comandi.
- Dopo ogni deploy dai una lista di controlli da fare **dal telefono in scheda privata nuova** (per evitare la cache). Ricorda che "Nuova stagione" non va provata sui dati veri.
- Titolo del commit sempre proposto, con `git branch --show-current`, `git add -A`, `git status` (cosa deve e non deve comparire) prima di `git commit` e `git push`.

**Prompt per un'AI esecutrice** (lo gira l'utente). Struttura usata finora:
1. Titolo e contesto in poche righe (dichiara che non conosce la storia).
2. `CARTELLA`: repo e branch `v2`.
3. `REGOLE`: sezione 4 di questo documento (niente deploy/--remote/commit/push; quando richiesto niente test/tsc/wrangler; niente dati o segreti; niente risorse esterne; termini vietati; `[hidden]` intatto).
4. `DECISIONI DELL'UTENTE` da non rimettere in discussione.
5. `SPECIFICA` numerata e precisa (campi, formule, percorsi, messaggi).
6. `TEST` (elenco dei casi; fixture inventate; trigger reali).
7. `PULIZIA` (termini vietati, codice morto, debug).
8. `REPORT FINALE` di massimo 5-14 righe: cosa ha cambiato e dove, scelte prese da solo, cosa non ha potuto verificare, conferma di nessun comando vietato e nessun dato o segreto.

Per diagnosi di difetti, il prompt elenca le **ipotesi in ordine** da verificare e chiede la causa vera, non una correzione di facciata (due correzioni sono fallite perché l'AI aveva cercato solo nel JavaScript mentre la causa era nel CSS, o aveva corretto la causa comune senza trovare il difetto reale). Quando un test fallisce, chiedere all'AI di capire **chi è sbagliato, il test o il codice**, prima di cambiare l'aspettativa.

**Revisioni:** per cambiamenti importanti si può far fare una revisione in sola lettura a un'altra AI (sicurezza, logica duplicata, casi limite, routing).
