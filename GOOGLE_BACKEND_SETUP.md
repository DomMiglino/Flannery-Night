# Flannery Night - attivazione backend Google

La versione pubblica usa **Google Apps Script + Google Sheet** come archivio condiviso.
Non serve Supabase.

## 1. Apri Apps Script

Apri:

https://script.google.com/

Crea un nuovo progetto chiamato **Flannery Night Backend**.

## 2. Copia Code.gs

Nel progetto elimina il contenuto predefinito di `Code.gs` e incolla tutto il contenuto del file:

`google-apps-script/Code.gs`

presente in questa repository.

Lo script è già configurato per il Google Sheet:

`1HovZP5Owurvko_mnl2UeG08C38_HyytLKWSz8xx2BDw`

## 3. Inizializza database e PIN

Nell'editor Apps Script seleziona la funzione:

`setupFlanneryNight`

e premi **Esegui**.

Google chiederà l'autorizzazione ad accedere al foglio.

Verranno creati:

- FN_ACCESS
- FN_VOTES
- FN_STATE
- FN_PIN_EXPORT

FN_ACCESS, FN_VOTES e FN_STATE vengono nascosti automaticamente.

FN_PIN_EXPORT contiene un PIN iniziale di 6 cifre per ogni giocatore.
Copia i PIN prima di eliminare o proteggere quel foglio.

## 4. Imposta password amministratore

Dall'editor esegui temporaneamente:

`setAdminSecret('UNA-PASSWORD-LUNGA-SCELTA-DA-TE')`

Usa almeno 12 caratteri.

## 5. Pubblica come Web App

Apps Script:

**Deploy > New deployment > Web app**

Impostazioni:

- Execute as: **Me**
- Who has access: **Anyone**

Premi Deploy.

Copia l'URL finale, simile a:

`https://script.google.com/macros/s/XXXXXXXXXXXX/exec`

## 6. Inserisci l'URL nella webapp

Nel file GitHub `config.js`:

```js
window.FLANNERY_API_URL = "https://script.google.com/macros/s/XXXXXXXXXXXX/exec";
```

Dopo il merge/pubblicazione, la scheda **Votazioni** sarà operativa.

## Funzionamento votazioni

- Ogni giocatore seleziona il proprio nome.
- Inserisce il PIN personale.
- Può votare tutti tranne sé stesso.
- Sei valori: VEL/TUF, TIR/PRE, PASS/RIN, DRI/RIF, DIF/REA, FIS/PIA.
- Una sola valutazione per coppia votante -> giocatore.
- Il voto può essere successivamente aggiornato.
- I singoli voti non sono restituiti pubblicamente.
- La pagina Giocatori mostra solo medie aggregate, numero votanti e Overall.
- L'Overall mantiene le ponderazioni specifiche per ruolo della versione Excel.

## Sicurezza

Il PIN non viene memorizzato in chiaro nel foglio FN_ACCESS.
Lo script salva hash SHA-256 con salt individuale.

I PIN in chiaro compaiono soltanto nel foglio temporaneo FN_PIN_EXPORT creato al setup.
Dopo averli distribuiti conviene eliminare quel foglio.

La webapp GitHub non contiene token Google né credenziali con accesso al foglio.
