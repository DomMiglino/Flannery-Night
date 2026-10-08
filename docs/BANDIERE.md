# Bandiere

1. Copia il file `.png` in `public/flags/` (per esempio `Spagna.png`).
2. Esegui il deploy: la fase di build genera automaticamente `src/flags_list.ts`.

Il nome del file, inclusa l'estensione `.png`, è il valore salvato in `players.flag`.

## Stemmi

Metti ogni PNG con sfondo trasparente in `public/stemmi/` con nome = id del giocatore in minuscolo (per esempio `salvio.png`), 512x512 px e sotto 150 KB. Leggi gli id con npx wrangler d1 execute flannery-night-v2 --remote --command="SELECT id, name FROM players ORDER BY name", poi rigenera con `npm run flags` e fai il deploy: la build scrive `src/stemmi_list.ts` e lo stemma sostituisce il ruolo solo in Home e scheda.
