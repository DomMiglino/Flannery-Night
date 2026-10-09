# Componi squadre

Strumento di gestione dentro Partite, solo con permesso. Calcola due squadre
equilibrate dai convocati e restituisce un testo pronto da copiare in chat.
Nessun salvataggio: nessun dato scritto, nessuna voce nel registro.

## Posti e moduli

Tabella unica in `src/squadre.ts` (`POSTI`): ruoli in ordine di riga,
per squadra. Difensori tutti sulla riga difensori, centrocampisti sulla
riga centrocampisti, attaccanti sulla riga attaccanti:

- 5 contro 5: P / DL DC DL / PC (nessuna riga di centrocampo)
- 6 contro 6: P / DL DC DL / CC / PC
- 7 contro 7: P / DL DC DL / CC CC / PC
- 8 contro 8: P / DL DC DL / CL CC CL / PC

Il formato di partenza e 8 contro 8; cambiare formato non cancella
i convocati. Con 1 portiere o 0 portieri ogni posto P mancante diventa
un posto extra **CC** (anche nel 5 contro 5).

## Secondo ruolo

Ogni giocatore di movimento puo avere un secondo ruolo facoltativo
(DC, DL, CC, CL, PC), scelto in creazione e modifica del giocatore.
Il portiere non ha un secondo ruolo e non e un secondo ruolo.

Quando presente, l'assegnazione usa la gravita effettiva: la migliore
tra primario e secondario (`gravitaEffettiva` in `src/squadre.ts`).
Chi gioca nel secondo ruolo ha gravita 0 (stessa priorita del ruolo
esatto, quindi batte qualunque cambio ruolo); chi va altrove ma col
secondario piu vicino paga comunque meno (per esempio DL con
secondario CL nel posto CC: 1 invece di 2). L'overall resta sempre
ricalcolato coi pesi del posto, come per ogni fuori ruolo: il secondo
ruolo riduce solo la gravita, con impatto minore.

Avvisi dedicati: chi gioca nel secondo ruolo esatto non conta come
fuori ruolo e compare in `Nel secondo ruolo: Nome (RUOLO in POSTO)`;
chi resta fuori ruolo con gravita attenuata compare in
`Fuori ruolo: Nome (PRIMARIO/SECONDARIO in POSTO)`.

## Valore effettivo

1. Mediane dei voti con le funzioni esistenti di `src/calc.ts`.
2. Forma dalla freccia esistente (`formaArrow`): su +2, obliqua in su +1,
   orizzontale 0, obliqua in giu -1, in giu -2. Vale per tutti i sei valori,
   nell'ordine VEL, TIR, PASS, DRI, DIF, FIS (per P: TUF, PRE, RIN, RIF,
   REA, PIA).
3. Inattivita -1 fisso se assente dalle ultime 4 pubblicate del gruppo
   nella stagione attiva. Con meno di 4 pubblicate nessuna inattivita.
   Chi ha 0 presenze con almeno 4 pubblicate risulta assente e prende -1.
4. Somma dei due delta su ogni valore, poi limiti 1-99.
5. Overall per eccesso con i pesi esistenti (`ceilOverallForRole`) del
   **posto occupato**: chi e nel posto col proprio ruolo usa i pesi del
   proprio ruolo; chi e fuori ruolo (anche dentro la stessa linea, come
   un DL nel posto DC) e ricalcolato con i pesi del posto e segnalato
   con nome e posto. Un giocatore di movimento non va mai in porta.

Senza voti sufficienti: stima pari alla media di movimento (media per
eccesso degli overall propri dei convocati di movimento con voti),
70 se vuota, con avviso e nomi. I portieri oltre i due titolari non si
ricalcolano in movimento (i loro voti restano su scala da portiere):
prendono la stima di movimento, restano fuori dalle medie FIS e hanno
l'avviso dedicato `Portiere adattato`. Il P titolare senza voti prende
l'overall dell'altro titolare se ha voti, altrimenti la stima.

## Assegnazione e divisione

Assegnazione ottima dei posti con DP su maschere di bit (al massimo
16 posti), come tupla ordinata senza ambiguita: prima la gravita totale
dei fuori ruolo (la piu bassa), poi la somma degli overall effettivi dei
posti centrali (tutti i DC e i CC delle due squadre, con overall ricalcolato
del posto come mostrato: i piu forti vanno al centro), poi la somma degli
overall effettivi di tutti i posti. Spareggi deterministici come sequenze
di elementi (rango posto, id): niente confronti tra stringhe concatenate.
I posti di pari ruolo sono indistinguibili; a parita di costo vince la
sequenza minore. Centrali in un solo punto (`POSTI_CENTRALI` in
`src/squadre.ts`): DC e CC.

Gravita in un solo punto (`GRAVITA_FUORI_RUOLO` in `src/squadre.ts`):
ruolo esatto 0; stessa linea con ruolo diverso (DL con DC, CL con CC) 1;
linee adiacenti (difesa con centrocampo, centrocampo con attacco) 2;
difesa con attacco 3. Il portiere resta escluso come prima: nessun
giocatore di movimento in porta e nessun portiere in movimento se non come
adattato. Penalita 100000 per punto di gravita, prioritaria su qualsiasi
differenza di overall; a parita di gravita totale decidono nell'ordine la
somma dei centrali e poi la somma di tutti. Avvisi `Fuori ruolo: Nome (RUOLO in POSTO)` ordinati dal piu grave
al meno grave, a parita per nome.

Divisione per gruppo di posti con lo stesso ruolo (P, DL, DC, CL, CC,
PC) con ricerca su poche combinazioni. Costo:

- differenza di overall totale (somma dei numeri mostrati),
- peso FIS per differenza di FIS (medie per giocatore di movimento,
  portieri e adattati esclusi),
- peso linee per somma delle differenze medie di difensori (DL+DC),
  centrocampisti (CL+CC) e attaccanti.

Pesi in cima a `src/squadre.ts`: `PESO_FIS` 0.5 e `PESO_LINEE` 0.3;
con rotazione `PESO_FIS_ROT` 1.0 e `PESO_LINEE_ROT` 0.5.
Confronto con medie perche con rotazione le squadre hanno numeri diversi
di giocatori per linea; il totale overall mostrato resta la somma.
La ricerca valuta anche quale squadra riceve il portiere vero.
Squadra A: totale piu alto; a parita chi ha il convocato con piu presenze,
poi la sequenza minore.

Con 1 portiere o 0 portieri la riga e `Portiere: a rotazione`.

## Testo e interfaccia

Titolo e nomi squadra in grassetto WhatsApp. Una riga per portiere,
difensori, centrocampisti e attaccanti (la riga dei centrocampisti e
omessa del tutto quando nessuna squadra ne ha, come nel 5 contro 5
senza rotazione). Dentro la riga i giocatori stanno per posto, non per
overall: DL DC DL con i laterali in ordine decrescente fuori e il
centrale in mezzo (a parita nome in italiano); CC CC in ordine
decrescente; CL CC CL e, con rotazione, CL CC CC CL. Solo nome e numero,
senza sigle di ruolo. Totale = somma dei numeri mostrati.

Interfaccia mobile a 360 px: tasti formato affiancati, griglia a 2 colonne
di chip da almeno 44 px con nome, ruolo e presenze, barra fissa di conferma
sopra la barra dell'app, tasto Azzera, copia con conferma visiva,
differenze e avvisi in piccolo, ritorno senza perdere la selezione.
`Altra proposta` omessa in prima versione per semplicita.

## Rotte e permessi

- `GET /api/admin/squadre/giocatori`: id, nome, ruolo, secondo ruolo e
  presenze nella stagione attiva per la griglia, in ordine di presenze
  e nome. La griglia mostra `RUOLO/SECONDO` quando presente.
- `POST /api/admin/squadre/proposta`: riceve formato e id dei convocati,
  restituisce testo, squadre con numeri (con posto di ognuno), totali,
  differenze e avvisi.

Entrambe solo con permesso, letto da `players.is_admin` a ogni richiesta
(401 senza accesso, 403 senza permesso). Validazione con 400 e messaggio
chiaro: formato 5/6/7/8, numero esatto 2 per formato, id unici ed esistenti.
Lato client il permesso si legge da `state.js` come le altre funzioni di
gestione; tasto e pagina restano invisibili senza permesso e l'apertura
diretta riporta a Partite.
