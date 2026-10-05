import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const flagsDir = join(root, "public", "flags");
const targetFile = join(root, "src", "flags_list.ts");

const files = readdirSync(flagsDir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

if (files.length === 0) {
  throw new Error("Nessun PNG trovato in public/flags/. Aggiungi le immagini e riprova con npm run flags.");
}

const items = files.map((filename) => {
  const name = filename.replace(/\.png$/i, "");
  return { filename, name };
});

const content = `// Generato automaticamente da scripts/genera-bandiere.mjs - non modificare a mano

export interface FlagItem {
  filename: string;
  name: string;
}

export const FLAGS: FlagItem[] = ${JSON.stringify(items, null, 2)};
`;

writeFileSync(targetFile, content, "utf-8");
console.log(`Generato src/flags_list.ts con ${items.length} bandiere.`);
