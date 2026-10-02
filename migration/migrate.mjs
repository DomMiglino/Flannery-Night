// migration/migrate.mjs — strumento TEMPORANEO (prova + passaggio finale).
// Non fa parte del Worker e non viene mai deployato.
// Legge la cartella dati reali (fuori repo), genera migrazione.sql (fuori repo).
// Non stampa mai salt, hash, PIN o voti singoli: solo conteggi e nomi.
//
// Uso (Windows PowerShell, da radice repo):
//   npm install
//   node migration/migrate.mjs --data "C:\Users\anton\Downloads\FlanneryDati" --out "C:\Users\anton\Downloads\FlanneryDati\migrazione.sql"

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { validateAndBuild } from "./build.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function pickFile(dir, candidates, pattern) {
  for (const c of candidates) {
    const p = join(dir, c);
    if (existsSync(p)) return p;
  }
  const files = readdirSync(dir);
  const hit = files.filter((f) => pattern.test(f)).sort()[0];
  return hit ? join(dir, hit) : undefined;
}

const dataDir = resolve(arg("--data") || "");
const outFile = arg("--out") ? resolve(arg("--out")) : undefined;

if (!dataDir || !existsSync(dataDir)) {
  console.error('Uso: node migration/migrate.mjs --data "<cartella-dati>" --out "<cartella-dati>\\migrazione.sql"');
  process.exit(2);
}
if (!outFile) {
  console.error("Manca --out (il file migrazione.sql deve stare nella cartella dati, mai nella repo).");
  process.exit(2);
}
// Sicurezza: il file generato non deve finire nella repo.
const repoRoot = resolve(process.cwd());
const relOut = relative(repoRoot, outFile);
if (relOut !== "" && !relOut.startsWith("..") && !isAbsolute(relOut)) {
  console.error(`Rifiuto: --out (${outFile}) e' dentro la repo. Deve stare nella cartella dati, fuori dal repo.`);
  process.exit(2);
}
if (relative(dataDir, outFile).startsWith("..")) {
  console.error(`Rifiuto: --out (${outFile}) deve stare dentro --data (${dataDir}).`);
  process.exit(2);
}

const jsonFile = pickFile(dataDir, ["flannery-night-2026-10-01.json"], /^flannery-night-.*\.json$/i);
const xlsxFile = pickFile(dataDir, ["Flannery Night Backend.xlsx"], /\.xlsx$/i);
if (!jsonFile || !existsSync(jsonFile)) {
  console.error(`JSON non trovato in ${dataDir} (atteso flannery-night-2026-10-01.json).`);
  process.exit(2);
}
if (!xlsxFile || !existsSync(xlsxFile)) {
  console.error(`XLSX non trovato in ${dataDir} (atteso "Flannery Night Backend.xlsx").`);
  process.exit(2);
}

const seasonJson = JSON.parse(readFileSync(jsonFile, "utf-8"));
const wb = XLSX.readFile(xlsxFile, { cellDates: true });
for (const needed of ["FN_ACCESS", "FN_VOTES"]) {
  if (!wb.Sheets[needed]) {
    console.error(`Foglio ${needed} mancante in ${xlsxFile}. Fogli presenti: ${wb.SheetNames.join(", ")}`);
    process.exit(2);
  }
}
// Il foglio FN_STATE viene ignorato di proposito.
const accessRows = XLSX.utils.sheet_to_json(wb.Sheets["FN_ACCESS"], { defval: null });
const voteRows = XLSX.utils.sheet_to_json(wb.Sheets["FN_VOTES"], { defval: null });

let built;
try {
  built = validateAndBuild(seasonJson, accessRows, voteRows);
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
}

writeFileSync(outFile, built.sql, "utf-8");

const s = built.summary;
console.log(`Cartella dati : ${dataDir}`);
console.log(`JSON          : ${jsonFile.split(/[\\/]/).pop()}`);
console.log(`XLSX          : ${xlsxFile.split(/[\\/]/).pop()} (foglio FN_STATE ignorato)`);
console.log(`SQL generato  : ${outFile}`);
console.log(`Giocatori     : ${s.players}`);
console.log(`Partite       : ${s.matches} (tutte importate 'published', stagione ${s.season} attiva)`);
console.log(`Voti          : ${s.votes} (da ${s.voteRowsIn} righe, duplicati: ${s.duplicateVotes})`);
console.log(`Credenziali   : ${s.credentials} righe, ${s.credentialsWithPin} con PIN valido (pinOrigin='user')`);
console.log(`Senza nationUrl (${s.noNation.length}): ${s.noNation.map((p) => p.name).sort().join(", ") || "-"}`);
console.log(`Senza bandiera: ${s.noFlagCount} (flag non importato, resta vuoto)`);
for (const p of [...s.noFlag].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  - ${p.name} (${p.id}): ${p.nationUrl ? p.nationUrl : "(nessun nationUrl)"}`);
}
console.log(
  `Guidinha da completare (${s.guidinhaToComplete.length}): ${s.guidinhaToComplete.map((g) => `${g.matchId} ${g.date} -> ${g.playerId}`).join("; ") || "-"}`,
);
console.log(`Admin riconosciuti (${s.admins.length}): ${s.admins.join(", ") || "-"}`);
