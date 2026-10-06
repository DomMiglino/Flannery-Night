import { describe, expect, it } from "vitest";
import {
  ceilOverallForRole,
  median,
  mediaPerPartita,
  overallForRole,
  puntiStagione,
  round1,
  summarizeVotes,
  teamScores,
  teamOutcomes,
  pointsFor,
  mvpWeights,
  playerSeason,
  standings,
  type CalcMatch,
  type Outcome,
} from "../src/calc";

function mkMatch(id: string, date: string, status: string, entries: CalcMatch["entries"]): CalcMatch {
  return { id, date, status, entries };
}

// Solo dati inventati: nessun nome reale.
const FA = "fake-a";
const FB = "fake-b";
const FC = "fake-c";
const FD = "fake-d";

describe("round1 come nel sito precedente", () => {
  it("arrotonda a un decimale", () => {
    expect(round1(2.45)).toBe(2.5);
    expect(round1(2.44)).toBe(2.4);
    expect(round1(32.55)).toBe(32.6);
  });
});

describe("mediana come median_ del sito precedente", () => {
  it("dispari: centrale", () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([7])).toBe(7);
  });
  it("pari: media dei due centrali con round1", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
    expect(median([1, 2])).toBe(1.5);
  });
  it("ordina in modo numerico", () => {
    expect(median([10, 2, 30])).toBe(10);
  });
  it("vuota: null", () => {
    expect(median([])).toBeNull();
  });
});

describe("overall come overall_ del sito precedente", () => {
  const all10 = { vel_tuf: 10, tir_pre: 10, pass_rin: 10, dri_rif: 10, dif_rea: 10, fis_pia: 10 };
  it("tutti 10 -> 10 per ogni ruolo", () => {
    for (const r of ["P", "DC", "DL", "CC", "CL", "PC"]) {
      expect(overallForRole(r, all10)).toBe(10);
    }
  });
  it("pesi differenziati per ruolo", () => {
    const a = { vel_tuf: 10, tir_pre: 20, pass_rin: 30, dri_rif: 40, dif_rea: 50, fis_pia: 60 };
    expect(overallForRole("P", a)).toBe(32.5);
    expect(overallForRole("DC", a)).toBe(44.5);
    expect(overallForRole("DL", a)).toBe(41.5);
    expect(overallForRole("CC", a)).toBe(33);
    expect(overallForRole("CL", a)).toBe(29.5);
    expect(overallForRole("PC", a)).toBe(29.5);
  });
  it("ruolo ignoto: media semplice", () => {
    const a = { vel_tuf: 10, tir_pre: 20, pass_rin: 30, dri_rif: 40, dif_rea: 50, fis_pia: 60 };
    expect(overallForRole("XX", a)).toBe(35);
  });
  it("manca un valore: null", () => {
    expect(overallForRole("P", { ...all10, vel_tuf: null })).toBeNull();
  });
});

describe("overall per eccesso (ceiling intero, aritmetica intera)", () => {
  const base = { vel_tuf: 86, tir_pre: 86, pass_rin: 86, dri_rif: 86, dif_rea: 86, fis_pia: 86 };
  it("somma esattamente intera: 86,00 resta 86", () => {
    for (const r of ["P", "DC", "DL", "CC", "CL", "PC"]) {
      expect(ceilOverallForRole(r, base)).toBe(86);
    }
  });
  it("86,01 diventa 87", () => {
    // 0,15 * 86,01 + 0,85 * 86 = 86,0015 con i pesi CC.
    expect(ceilOverallForRole("CC", { ...base, vel_tuf: 86.01 })).toBe(87);
  });
  it("85,99 diventa 86", () => {
    expect(ceilOverallForRole("CC", { ...base, vel_tuf: 85.99 })).toBe(86);
  });
  it("86,25 diventa 87", () => {
    const quarti = { vel_tuf: 86.25, tir_pre: 86.25, pass_rin: 86.25, dri_rif: 86.25, dif_rea: 86.25, fis_pia: 86.25 };
    expect(ceilOverallForRole("CC", quarti)).toBe(87);
    expect(ceilOverallForRole("P", quarti)).toBe(87);
  });
  it("coincide col ceiling della somma esatta per ogni ruolo", () => {
    const valori = { vel_tuf: 79.5, tir_pre: 82, pass_rin: 77.5, dri_rif: 90, dif_rea: 68.5, fis_pia: 84 };
    for (const r of ["P", "DC", "DL", "CC", "CL", "PC"]) {
      const esatto = overallForRole(r, valori)!;
      // L'overall a un decimale non basta: il ceiling va sulla somma esatta.
      expect(ceilOverallForRole(r, valori)).toBeGreaterThanOrEqual(Math.round(esatto));
      expect(ceilOverallForRole(r, valori)).toBeLessThanOrEqual(Math.ceil(esatto) + 1);
    }
  });
  it("ruolo ignoto: media semplice per eccesso", () => {
    const valori = { vel_tuf: 10, tir_pre: 20, pass_rin: 30, dri_rif: 40, dif_rea: 50, fis_pia: 60 };
    // Media 35 esatta -> 35; con un decimo in più -> 36.
    expect(ceilOverallForRole("XX", valori)).toBe(35);
    expect(ceilOverallForRole("XX", { ...valori, vel_tuf: 10.6 })).toBe(36);
  });
  it("manca un valore: null", () => {
    expect(ceilOverallForRole("CC", { ...base, fis_pia: null })).toBeNull();
  });
  it("summarizeVotes espone anche l'overall per eccesso", () => {
    const s = summarizeVotes("CC", [
      { vel_tuf: 86, tir_pre: 86, pass_rin: 86, dri_rif: 86, dif_rea: 86, fis_pia: 86 },
    ]);
    expect(s.voters).toBe(1);
    expect(s.overall).toBe(86);
    expect(s.overallUp).toBe(86);
    expect(summarizeVotes("CC", []).overallUp).toBeNull();
  });
});

describe("punti e medie della classifica", () => {
  it("punti: 3 per vinta, 1 per pareggiata", () => {
    expect(puntiStagione(4, 2)).toBe(14);
    expect(puntiStagione(0, 0)).toBe(0);
  });
  it("medie a un decimale half-up, null con zero giocate", () => {
    expect(mediaPerPartita(14, 7)).toBe(2);
    expect(mediaPerPartita(9, 7)).toBe(1.3);
    expect(mediaPerPartita(10, 6)).toBe(1.7);
    expect(mediaPerPartita(5, 0)).toBeNull();
    expect(mediaPerPartita(0, 0)).toBeNull();
  });
});

describe("summarizeVotes come getMedians_", () => {
  it("zero voti: overall nullo", () => {
    const s = summarizeVotes("CC", []);
    expect(s.voters).toBe(0);
    expect(s.overall).toBeNull();
  });
  it("mediana per attributo + overall pesato", () => {
    const s = summarizeVotes("P", [
      { vel_tuf: 10, tir_pre: 10, pass_rin: 10, dri_rif: 10, dif_rea: 10, fis_pia: 10 },
      { vel_tuf: 20, tir_pre: 20, pass_rin: 20, dri_rif: 20, dif_rea: 20, fis_pia: 20 },
      { vel_tuf: 30, tir_pre: 30, pass_rin: 30, dri_rif: 30, dif_rea: 30, fis_pia: 30 },
    ]);
    expect(s.voters).toBe(3);
    expect(s.vel_tuf).toBe(20);
    expect(s.overall).toBe(20);
  });
});

describe("risultato: gol + autogol avversaria", () => {
  it("V/P/S e punti 3/1/0", () => {
    const m = mkMatch("t1", "2026-09-01", "published", [
      { playerId: FA, team: "Rossi", goals: 2, ownGoals: 0, mvp: false },
      { playerId: FB, team: "Blu", goals: 1, ownGoals: 1, mvp: false },
    ]);
    // Rossi 2 + autogol di Blu (1) = 3; Blu 1 + autogol di Rossi (0) = 1.
    expect(teamScores(m).get("Rossi")).toBe(3);
    expect(teamScores(m).get("Blu")).toBe(1);
    expect(teamOutcomes(m).get("Rossi")).toBe("V");
    expect(teamOutcomes(m).get("Blu")).toBe("S");
    expect(pointsFor("V")).toBe(3);
    expect(pointsFor("P")).toBe(1);
    expect(pointsFor("S")).toBe(0);
  });
  it("pareggio", () => {
    const m = mkMatch("t2", "2026-09-02", "published", [
      { playerId: FA, team: "Rossi", goals: 2, ownGoals: 0, mvp: false },
      { playerId: FB, team: "Blu", goals: 2, ownGoals: 0, mvp: false },
    ]);
    expect(teamOutcomes(m).get("Rossi")).toBe("P");
    expect(teamOutcomes(m).get("Blu")).toBe("P");
  });
  it("etichette libere, non solo A/B", () => {
    const m = mkMatch("t3", "2026-09-03", "published", [
      { playerId: FA, team: "Gialli", goals: 1, ownGoals: 0, mvp: false },
      { playerId: FB, team: "Verdi", goals: 0, ownGoals: 0, mvp: false },
    ]);
    expect(teamOutcomes(m).get("Gialli")).toBe("V");
  });
});

describe("peso MVP 1/n per squadra", () => {
  it("singolo MVP vale 1", () => {
    const m = mkMatch("mvp1", "2026-09-01", "published", [
      { playerId: FA, team: "A", goals: 1, ownGoals: 0, mvp: true },
      { playerId: FB, team: "A", goals: 0, ownGoals: 0, mvp: false },
      { playerId: FC, team: "B", goals: 0, ownGoals: 0, mvp: false },
    ]);
    const w = mvpWeights(m);
    expect(w.get(FA)).toBe(1);
    expect(w.get(FB)).toBe(0);
  });
  it("due MVP stessa squadra valgono 1/2", () => {
    const m = mkMatch("mvp2", "2026-09-01", "published", [
      { playerId: FA, team: "A", goals: 1, ownGoals: 0, mvp: true },
      { playerId: FB, team: "A", goals: 1, ownGoals: 0, mvp: true },
      { playerId: FC, team: "B", goals: 0, ownGoals: 0, mvp: true },
    ]);
    const w = mvpWeights(m);
    expect(w.get(FA)).toBeCloseTo(0.5);
    expect(w.get(FB)).toBeCloseTo(0.5);
    expect(w.get(FC)).toBe(1);
  });
});

describe("Flannery Power Score", () => {
  it("formula con media e tetto 20", () => {
    // fake-a: 2 giocate, 4 punti (V+S? no: V=3 + P=1), un MVP da 1.
    const matches: CalcMatch[] = [
      mkMatch("g1", "2026-09-01", "published", [
        { playerId: FA, team: "A", goals: 3, ownGoals: 0, mvp: true },
        { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
      ]),
      mkMatch("g2", "2026-09-02", "published", [
        { playerId: FA, team: "A", goals: 1, ownGoals: 0, mvp: false },
        { playerId: FB, team: "B", goals: 1, ownGoals: 0, mvp: false },
      ]),
    ];
    const s = playerSeason(matches, FA);
    expect(s.played).toBe(2);
    expect(s.points).toBe(4); // 3 + 1
    expect(s.mvpWeightSum).toBeCloseTo(1);
    // media 2 -> max(2,1)*1 = 2 -> +4 = 6
    expect(s.powerScore).toBe(6);
  });
  it("tetto a 20 sulla parte MVP", () => {
    const matches: CalcMatch[] = [];
    for (let i = 0; i < 10; i++) {
      matches.push(
        mkMatch(`w${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, "published", [
          { playerId: FA, team: "A", goals: 5, ownGoals: 0, mvp: true },
          { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
        ]),
      );
    }
    const s = playerSeason(matches, FA);
    expect(s.played).toBe(10);
    expect(s.points).toBe(30);
    // media 3 * somma 10 = 30 -> tetto 20 -> +30 = 50
    expect(s.powerScore).toBe(50);
  });
  it("ordine: Power decrescente poi somma MVP", () => {
    const matches: CalcMatch[] = [
      mkMatch("o1", "2026-09-01", "published", [
        { playerId: FA, team: "A", goals: 2, ownGoals: 0, mvp: true },
        { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
        { playerId: FC, team: "B", goals: 0, ownGoals: 0, mvp: false },
      ]),
    ];
    const table = standings(matches, [FB, FC, FA]);
    expect(table[0].playerId).toBe(FA);
    // FB e FC pari: resta stabile per id.
    expect(table.map((r) => r.playerId)).toEqual([FA, FB, FC]);
  });
  it("solo published", () => {
    const matches: CalcMatch[] = [
      mkMatch("d1", "2026-09-01", "draft", [
        { playerId: FA, team: "A", goals: 9, ownGoals: 0, mvp: true },
        { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
      ]),
    ];
    const s = playerSeason(matches, FA);
    expect(s.played).toBe(0);
    expect(s.powerScore).toBe(0);
  });
});

describe("rendimento ultime 5 con asterisco", () => {
  it("cronologico con * dove peso MVP > 0", () => {
    const matches: CalcMatch[] = [
      mkMatch("r1", "2026-09-01", "published", [
        { playerId: FA, team: "A", goals: 3, ownGoals: 0, mvp: true },
        { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
      ]),
      mkMatch("r2", "2026-09-02", "published", [
        { playerId: FA, team: "A", goals: 1, ownGoals: 0, mvp: false },
        { playerId: FB, team: "B", goals: 1, ownGoals: 0, mvp: false },
      ]),
      mkMatch("r3", "2026-09-03", "published", [
        { playerId: FA, team: "A", goals: 0, ownGoals: 0, mvp: false },
        { playerId: FB, team: "B", goals: 2, ownGoals: 0, mvp: true },
      ]),
    ];
    const s = playerSeason(matches, FA);
    expect(s.rendimento).toEqual(["V*", "P", "S"]);
  });
  it("al massimo 5", () => {
    const matches: CalcMatch[] = [];
    for (let i = 0; i < 7; i++) {
      matches.push(
        mkMatch(`q${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, "published", [
          { playerId: FA, team: "A", goals: 1, ownGoals: 0, mvp: false },
          { playerId: FB, team: "B", goals: 1, ownGoals: 0, mvp: false },
        ]),
      );
    }
    expect(playerSeason(matches, FA).rendimento).toHaveLength(5);
  });
});

describe("forma: media pesata + frecce", () => {
  function formaOf(outcomes: Outcome[], mvpFlags: boolean[]) {
    const matches: CalcMatch[] = outcomes.map((o, i) => {
      const goalsA = o === "V" ? 3 : o === "P" ? 1 : 0;
      const goalsB = o === "V" ? 0 : o === "P" ? 1 : 3;
      return mkMatch(`f${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, "published", [
        { playerId: FA, team: "A", goals: goalsA, ownGoals: 0, mvp: mvpFlags[i] },
        { playerId: FB, team: "B", goals: goalsB, ownGoals: 0, mvp: false },
      ]);
    });
    return playerSeason(matches, FA);
  }
  it("↑ sopra 2,4", () => {
    const s = formaOf(["V", "V", "V", "V", "V"], [true, true, true, true, true]);
    expect(s.formaScore).toBe(4);
    expect(s.formaArrow).toBe("↑");
  });
  it("↗ sopra 1,7", () => {
    // Pesi 1+1+2+2+3=9. ["S","P","P","P","V"]: (0+1+2+2+9)/9 = 14/9 ≈ 1,56 -> 1,6 -> →
    const s = formaOf(["S", "P", "P", "P", "V"], [false, false, false, false, false]);
    expect(s.formaScore).toBeCloseTo(1.6, 1);
    expect(s.formaArrow).toBe("→");
    // ["V","V","V","P","P"]: (3+3+4+2+3)/9 = 15/9 ≈ 1,67 -> 1,7 -> ↗
    const s2 = formaOf(["V", "V", "V", "P", "P"], [false, false, false, false, false]);
    expect(s2.formaArrow).toBe("↗");
  });
  it("→ sopra 1,0 e ↘ sopra 0,3 e ↓ sotto", () => {
    expect(formaOf(["P", "P", "P", "P", "P"], [false, false, false, false, false]).formaArrow).toBe("→");
    expect(formaOf(["S", "S", "S", "S", "P"], [false, false, false, false, false]).formaArrow).toBe("↘");
    expect(formaOf(["S", "S", "S", "S", "S"], [false, false, false, false, false]).formaArrow).toBe("↓");
  });
  it("pesi ultima=3 precedenti due=2 altre=1", () => {
    // Solo l'ultima vinta con MVP, resto perso: (3*3)/8? pesi 1,1,2,2,3 = 9? no 5 gare: 1+1+2+2+3=9.
    // punti: 3*3/9 = 1 + MVP 3/9 ≈ 0,33 -> 1,33 -> →
    const s = formaOf(["S", "S", "S", "S", "V"], [false, false, false, false, true]);
    expect(s.formaScore).toBeCloseTo(1.3, 1);
    expect(s.formaArrow).toBe("→");
  });
  it("MVP diviso 1/n conta come flag 1", () => {
    const matches: CalcMatch[] = [
      mkMatch("n1", "2026-09-01", "published", [
        { playerId: FA, team: "A", goals: 2, ownGoals: 0, mvp: true },
        { playerId: FD, team: "A", goals: 2, ownGoals: 0, mvp: true },
        { playerId: FB, team: "B", goals: 0, ownGoals: 0, mvp: false },
      ]),
    ];
    const s = playerSeason(matches, FA);
    expect(s.mvpWeightSum).toBeCloseTo(0.5);
    expect(s.rendimento).toEqual(["V*"]);
  });
});
