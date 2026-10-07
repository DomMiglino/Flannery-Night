import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const flagsDir = join(root, "public", "flags");
const targetFile = join(root, "src", "flags_list.ts");

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
}
