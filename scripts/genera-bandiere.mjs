import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const flagsDir = join(root, "public", "flags");
const targetFile = join(root, "src", "flags_list.ts");
const stemmiDir = join(root, "public", "stemmi");
const stemmiTarget = join(root, "src", "stemmi_list.ts");

/**
 * Testo di src/flags_list.ts a partire dai nomi dei file.
 * Ordine alfabetico fisso, nessun orario, soli fine riga \n.
 */
export function testoBandiere(files) {
  const ordinati = [...(files ?? [])]
    .map((f) => String(f))
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  const items = ordinati.map((filename) => {
    const name = filename.replace(/\.png$/i, "");
    return { filename, name };
  });
  const righe = [
    "// Generato automaticamente da scripts/genera-bandiere.mjs - non modificare a mano",
    "",
    "export interface FlagItem {",
    "  filename: string;",
    "  name: string;",
    "}",
    "",
    `export const FLAGS: FlagItem[] = ${JSON.stringify(items, null, 2)};`,
    "",
  ];
  return righe.join("\n");
}

function normalizzaTesto(testo) {
  return String(testo ?? "").replace(/\r\n/g, "\n");
}

/**
 * Testo di src/stemmi_list.ts a partire dai nomi dei file.
 * Ordine alfabetico fisso, nessun orario, soli fine riga \n.
 */
export function testoStemmi(files) {
  const ordinati = [...(files ?? [])]
    .map((f) => String(f))
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  const righe = [
    "// Generato automaticamente da scripts/genera-bandiere.mjs - non modificare a mano",
    "",
    `export const STEMMI: string[] = ${JSON.stringify(ordinati, null, 2)};`,
    "",
  ];
  return righe.join("\n");
}

/**
 * Solo i nomi validi per gli stemmi: file .png con nome tutto in
 * minuscolo e senza spazi (l'id del giocatore in minuscolo + ".png").
 * Il resto viene scartato con un avviso e non entra nell'elenco.
 */
export function scegliStemmi(files) {
  const validi = [];
  for (const f of files ?? []) {
    const nome = String(f);
    if (!nome.endsWith(".png")) continue;
    if (nome !== nome.toLowerCase()) continue;
    if (/\s/.test(nome)) continue;
    validi.push(nome);
  }
  return validi.sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}

/** Larghezza e altezza dall'intestazione PNG, senza librerie. */
export function dimensioniPng(percorso) {
  try {
    const buf = readFileSync(percorso);
    if (buf.length < 24) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
    return { larghezza: buf.readUInt32BE(16), altezza: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function scriviSeCambiato(percorso, contenuto, etichetta) {
  let corrente = null;
  try {
    corrente = readFileSync(percorso, "utf-8");
  } catch {
    corrente = null;
  }
  if (corrente !== null && normalizzaTesto(corrente) === normalizzaTesto(contenuto)) {
    console.log(`${etichetta} già aggiornato.`);
    return;
  }
  writeFileSync(percorso, contenuto, "utf-8");
  console.log(`Generato ${etichetta}.`);
}

// Solo con avvio diretto (npm run flags / build) si tocca il disco:
// importato nei test resta una funzione pura senza effetti.
const avvioDiretto = String(process.argv[1] ?? "").endsWith("genera-bandiere.mjs");

if (avvioDiretto) {
  const files = readdirSync(flagsDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

  if (files.length === 0) {
    throw new Error("Nessun PNG trovato in public/flags/. Aggiungi le immagini e riprova con npm run flags.");
  }

  const content = testoBandiere(files);

  let corrente = null;
  try {
    corrente = readFileSync(targetFile, "utf-8");
  } catch {
    corrente = null;
  }

  if (corrente !== null && normalizzaTesto(corrente) === normalizzaTesto(content)) {
    console.log(`src/flags_list.ts già aggiornato (${files.length} bandiere).`);
  } else {
    writeFileSync(targetFile, content, "utf-8");
    console.log(`Generato src/flags_list.ts con ${files.length} bandiere.`);
  }

  // Stemmi: cartella assente o vuota = elenco vuoto, senza errori.
  let grezzi = [];
  try {
    grezzi = readdirSync(stemmiDir);
  } catch {
    grezzi = [];
  }
  const presenti = [];
  for (const f of grezzi) {
    const nome = String(f);
    let file = false;
    try {
      file = statSync(join(stemmiDir, nome)).isFile();
    } catch {
      file = false;
    }
    if (!file) continue;
    presenti.push(nome);
    if (!nome.endsWith(".png") || nome !== nome.toLowerCase() || /\s/.test(nome)) {
      console.log(`stemmi: "${nome}" ignorato: usa l'id del giocatore in minuscolo.`);
    }
  }
  const stemmi = scegliStemmi(presenti);
  for (const nome of stemmi) {
    let peso = 0;
    try {
      peso = statSync(join(stemmiDir, nome)).size;
    } catch {
      peso = 0;
    }
    if (peso > 150 * 1024) {
      console.log(`stemmi: avviso: "${nome}" supera 150 KB.`);
    }
    const misura = dimensioniPng(join(stemmiDir, nome));
    if (misura && (misura.larghezza !== 512 || misura.altezza !== 512)) {
      console.log(`stemmi: avviso: "${nome}" misura ${misura.larghezza}x${misura.altezza}, attesi 512x512.`);
    }
  }
  scriviSeCambiato(stemmiTarget, testoStemmi(stemmi), `src/stemmi_list.ts con ${stemmi.length} stemmi`);
}
