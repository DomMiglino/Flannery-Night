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