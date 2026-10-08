// Stemmi dei giocatori: il nome del file vale se l'elenco generato
// contiene esattamente "<id>.png", altrimenti non c'è stemma.
// L'elenco è iniettabile per i test.

import { STEMMI } from "./stemmi_list";

export function stemmaPer(id: string, elenco: readonly string[] = STEMMI): string | null {
  const chiave = String(id ?? "");
  if (chiave === "") return null;
  const file = `${chiave}.png`;
  return elenco.includes(file) ? file : null;
}
