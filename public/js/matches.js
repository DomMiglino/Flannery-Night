// Passo 4: formattazione delle partite. Funzioni pure.

/** "Squadra A 7 – 6 Squadra B" */
export function matchHeadline(squadre) {
  const lista = Array.isArray(squadre) ? squadre : [];
  if (lista.length === 0) return "—";
  if (lista.length === 1) return `${lista[0].team} ${lista[0].score}`;
  const [a, b] = lista;
  return `${a.team} ${a.score} – ${b.score} ${b.team}`;
}

/** In squadra: prima i marcatori, poi a parità di gol in ordine di nome. */
export function sortTeamPlayers(giocatori) {
  return [...(giocatori || [])].sort((a, b) => {
    const ga = Number(a.goals) || 0;
    const gb = Number(b.goals) || 0;
    if (gb !== ga) return gb - ga;
    return String(a.name).localeCompare(String(b.name), "it");
  });
}

/** La Guidinha in fondo: nome del giocatore e testo, se c'è. */
export function guidinhaLinea(guidinha) {
  if (!guidinha || !guidinha.playerName) return null;
  const testo = typeof guidinha.text === "string" ? guidinha.text.trim() : "";
  return { nome: guidinha.playerName, testo };
}

/**
 * Etichette compatte per gol e autogol: solo valori diversi da zero.
 * 0/0 → nessuna; 2 gol → [{testo "2", etichetta "2 gol"}];
 * 1 autogol → [{testo "-1", etichetta "1 autogol"}].
 */
export function etichetteGol(goals, ownGoals) {
  const etichette = [];
  const gol = Number(goals) || 0;
  const auto = Number(ownGoals) || 0;
  if (gol > 0) etichette.push({ testo: String(gol), etichetta: `${gol} gol`, autogol: false });
  if (auto > 0) etichette.push({ testo: `-${auto}`, etichetta: `${auto} autogol`, autogol: true });
  return etichette;
}

/**
 * Formato della partita dal numero di giocatori ("5v5"): solo con due
 * squadre di pari dimensioni, altrimenti null (niente badge).
 */
export function formatoPartita(squadre) {
  const lista = Array.isArray(squadre) ? squadre : [];
  if (lista.length !== 2) return null;
  const a = (lista[0].players || []).length;
  const b = (lista[1].players || []).length;
  if (a <= 0 || a !== b) return null;
  return `${a}v${a}`;
}