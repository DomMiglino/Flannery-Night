// Componi squadre: funzione pura e rotta di gestione. Solo dati inventati.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assegnaLinee,
  componiSquadre,
  correggiAttributi,
  gravitaEffettiva,
  GRAVITA_FUORI_RUOLO,
  gravitaFuoriRuolo,
  POSTI,
  POSTI_CENTRALI,
  PESO_FIS,
  PESO_LINEE,
  usaSecondoRuolo,
  validaIngresso,
  type Convocato,
} from "../src/squadre";
import { ceilOverallForRole } from "../src/calc";
import { PIN, sessionCookie, startServer, type TestServer } from "./helpers/server";

function mk(id: string, name: string, role: string, vals: number[], arrow: Convocato["formaArrow"] = "→", inattivo = false, played = 5): Convocato {
  return { id, name, role, mediane: [...vals], formaArrow: arrow, inattivo, played };
}

function mk2(id: string, name: string, role: string, role2: string | null, vals: number[], arrow: Convocato["formaArrow"] = "→", inattivo = false, played = 5): Convocato {
  return { id, name, role, role2, mediane: [...vals], formaArrow: arrow, inattivo, played };
}

describe("forma e inattivita", () => {
  it("ogni freccia sposta tutti gli attributi", () => {
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↑", false)).toEqual([72, 72, 72, 72, 72, 72]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↗", false)).toEqual([71, 71, 71, 71, 71, 71]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "→", false)).toEqual([70, 70, 70, 70, 70, 70]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↘", false)).toEqual([69, 69, 69, 69, 69, 69]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↓", false)).toEqual([68, 68, 68, 68, 68, 68]);
  });
  it("inattivita -1 e somma con la freccia", () => {
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "→", true)).toEqual([69, 69, 69, 69, 69, 69]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↑", true)).toEqual([71, 71, 71, 71, 71, 71]);
    expect(correggiAttributi([70, 70, 70, 70, 70, 70], "↓", true)).toEqual([67, 67, 67, 67, 67, 67]);
  });
  it("limiti 1 e 99", () => {
    expect(correggiAttributi([99, 99, 99, 99, 99, 99], "↑", false)).toEqual([99, 99, 99, 99, 99, 99]);
    expect(correggiAttributi([1, 1, 1, 1, 1, 1], "↓", true)).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it("senza voti resta null", () => {
    expect(correggiAttributi([70, null, 70, 70, 70, 70], "↑", false)).toBeNull();
  });
});

describe("posti esatti", () => {
  // 5 contro 5, posti per squadra: P, DL, DC, DL, PC.
  function dieciBase(): Convocato[] {
    return [
      mk("p1", "Portiere Uno", "P", [75, 75, 75, 75, 75, 75], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 60, 70, 65, 84, 79], "→", false, 6),
      mk("dl2", "Laterale Due", "DL", [68, 60, 68, 64, 82, 76], "→", false, 6),
      mk("dl3", "Laterale Tre", "DL", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [66, 60, 66, 63, 70, 68], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 60, 70, 65, 85, 80], "→", false, 6),
      mk("dc2", "Centrale Due", "DC", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("a1", "Attaccante Uno", "PC", [72, 85, 65, 75, 60, 78], "→", false, 6),
      mk("a2", "Attaccante Due", "PC", [62, 70, 60, 65, 60, 68], "→", false, 3),
    ];
  }
  it("ognuno nel posto con il proprio ruolo, senza ricalcoli", () => {
    const piazzati = assegnaLinee(5, dieciBase());
    expect(piazzati).toHaveLength(10);
    for (const p of piazzati) {
      expect(p.posto).toBe(p.role);
      expect(p.fuoriRuolo).toBe(false);
    }
  });
  it("ruolo mancante (nessun PC): i migliori ricalcolati con i pesi PC", () => {
    const base = dieciBase().filter((c) => c.role !== "PC");
    base.push(mk("x1", "Esterno Uno", "DC", [65, 92, 65, 65, 70, 70], "→", false, 2));
    base.push(mk("x2", "Esterno Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 2));
    const piazzati = assegnaLinee(5, base);
    const att = piazzati.filter((p) => p.posto === "PC");
    expect(att).toHaveLength(2);
    expect(att.every((p) => p.fuoriRuolo)).toBe(true);
    // Con pesi PC (TIR pesante) il TIR 92 vince sul resto.
    expect(att.map((p) => p.id)).toContain("x1");
  });
  it("piu DC che posti DC: fuori un DC in DL con avviso di posto", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [75, 75, 75, 75, 75, 75], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 60, 70, 65, 84, 79], "→", false, 6),
      mk("dl2", "Laterale Due", "DL", [68, 60, 68, 64, 82, 76], "→", false, 6),
      mk("dl3", "Laterale Tre", "DL", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 60, 70, 65, 85, 80], "→", false, 6),
      mk("dc2", "Centrale Due", "DC", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dx", "Centrale Extra", "DC", [62, 60, 62, 60, 68, 66], "→", false, 4),
      mk("a1", "Attaccante Uno", "PC", [72, 85, 65, 75, 60, 78], "→", false, 6),
      mk("a2", "Attaccante Due", "PC", [62, 70, 60, 65, 60, 68], "→", false, 3),
    ];
    const piazzati = assegnaLinee(5, conv);
    // Entrambi i posti DC restano a giocatori DC.
    expect(piazzati.filter((p) => p.posto === "DC").every((p) => p.role === "DC")).toBe(true);
    // Un solo fuori ruolo in tutto il gruppo, ed e un DC in DL.
    const fuori = piazzati.filter((p) => p.fuoriRuolo);
    expect(fuori).toHaveLength(1);
    expect(fuori[0].role).toBe("DC");
    expect(fuori[0].posto).toBe("DL");
    const prop = componiSquadre(5, conv);
    expect(prop.avvisi.join(" ")).toContain(`(${fuori[0].role} in ${fuori[0].posto})`);
  });
  it("DC nel posto DL: ricalcolo con i pesi del posto", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [75, 75, 75, 75, 75, 75], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 60, 70, 65, 84, 79], "→", false, 6),
      mk("dl2", "Laterale Due", "DL", [68, 60, 68, 64, 82, 76], "→", false, 6),
      mk("dl3", "Laterale Tre", "DL", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 60, 70, 65, 85, 80], "→", false, 6),
      mk("dc2", "Centrale Due", "DC", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dx", "Centrale Extra", "DC", [62, 60, 62, 60, 68, 66], "→", false, 4),
      mk("a1", "Attaccante Uno", "PC", [72, 85, 65, 75, 60, 78], "→", false, 6),
      mk("a2", "Attaccante Due", "PC", [62, 70, 60, 65, 60, 68], "→", false, 3),
    ];
    const piazzati = assegnaLinee(5, conv);
    // Un solo DC finisce in DL; il suo overall e ricalcolato con i pesi DL,
    // verificato in modo indipendente con la funzione di calcolo esistente.
    const fuoriDL = piazzati.filter((p) => p.role === "DC" && p.posto === "DL");
    expect(fuoriDL).toHaveLength(1);
    expect(fuoriDL[0].fuoriRuolo).toBe(true);
    const src = conv.find((c) => c.id === fuoriDL[0].id)!;
    const atteso = ceilOverallForRole("DL", {
      vel_tuf: src.mediane[0], tir_pre: src.mediane[1], pass_rin: src.mediane[2],
      dri_rif: src.mediane[3], dif_rea: src.mediane[4], fis_pia: src.mediane[5],
    });
    expect(fuoriDL[0].overallEff).toBe(atteso);
  });
});

describe("gravita fuori ruolo", () => {
  it("tabella simmetrica con i valori attesi", () => {
    // Ruolo esatto 0; stessa linea 1; adiacenti 2; difesa-attacco 3.
    expect(gravitaFuoriRuolo("DL", "DL")).toBe(0);
    expect(gravitaFuoriRuolo("DL", "DC")).toBe(1);
    expect(gravitaFuoriRuolo("DC", "DL")).toBe(1);
    expect(gravitaFuoriRuolo("CL", "CC")).toBe(1);
    expect(gravitaFuoriRuolo("CC", "CL")).toBe(1);
    expect(gravitaFuoriRuolo("DL", "CL")).toBe(2);
    expect(gravitaFuoriRuolo("DL", "CC")).toBe(2);
    expect(gravitaFuoriRuolo("DC", "CC")).toBe(2);
    expect(gravitaFuoriRuolo("CC", "PC")).toBe(2);
    expect(gravitaFuoriRuolo("CL", "PC")).toBe(2);
    expect(gravitaFuoriRuolo("DL", "PC")).toBe(3);
    expect(gravitaFuoriRuolo("DC", "PC")).toBe(3);
    expect(gravitaFuoriRuolo("PC", "DL")).toBe(3);
    expect(gravitaFuoriRuolo("PC", "DC")).toBe(3);
    // Simmetria su tutte le coppie di movimento.
    const ruoli = ["DL", "DC", "CL", "CC", "PC"];
    for (const a of ruoli) {
      for (const b of ruoli) {
        expect(gravitaFuoriRuolo(a, b), `${a}-${b}`).toBe(gravitaFuoriRuolo(b, a));
        expect(gravitaFuoriRuolo(a, b), `${a}-${b}`).toBe(GRAVITA_FUORI_RUOLO[a][b]);
      }
    }
  });
  it("gravita prima degli overall: due leggeri (1+2=3) battono un grave (3+2=5)", () => {
    // 6 contro 6: posti movimento DL4 DC2 CC2 PC2. Giocatori movimento DL5
    // DC1 CC3 PC1: surplus DL e CC, deficit DC e PC. Due abbinamenti con lo
    // stesso numero di fuori ruolo (2 contro 2):
    // L: DL in DC (1) + CC in PC (2) = 3 leggeri;
    // G: DL in PC (3, grave) + CC in DC (2) = 5.
    // L ha somma overall piu bassa (DL->DC 60 + CC->PC 60 = 120 contro
    // DL->PC 76 + CC->DC 82 = 158 per i soli mossi), quindi col vecchio
    // criterio (numero 2 pari, poi overall) verrebbe scelta G; col nuovo
    // (gravita 3 contro 5) viene scelta L. Il DL estremo ha DC 56 e DL 58
    // (sotto i 60), cosi resta esatto anche col criterio dei centrali.
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-grave", "Laterale Grave", "DL", [70, 95, 70, 70, 50, 50], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl5", "Laterale Cinque", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cc-tec", "Mediano Tecnico", "CC", [70, 60, 70, 70, 95, 75], "→", false, 5),
      mk("cc2", "Mediano Due", "CC", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("cc3", "Mediano Tre", "CC", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const piazzati = assegnaLinee(6, conv);
    // Scelta leggera: i due profili estremi restano esatti (DL e CC).
    expect(piazzati.find((p) => p.id === "dl-grave")?.posto).toBe("DL");
    expect(piazzati.find((p) => p.id === "cc-tec")?.posto).toBe("CC");
    const fuori = piazzati.filter((p) => p.fuoriRuolo && !p.adattato);
    expect(fuori).toHaveLength(2);
    expect(fuori.reduce((a, p) => a + p.gravita, 0)).toBe(3);
    expect(new Set(fuori.map((p) => `${p.role} in ${p.posto}`))).toEqual(new Set(["DL in DC", "CC in PC"]));
    // Controllo a mano: DL in PC 76 e CC in DC 82 (grave, totale mossi 158)
    // superano DL in DC 60 e CC in PC 60 (leggeri, totale mossi 120), quindi
    // il vecchio criterio a parita di numero avrebbe premiato il grave.
    expect(ceilOverallForRole("PC", { vel_tuf: 70, tir_pre: 95, pass_rin: 70, dri_rif: 70, dif_rea: 50, fis_pia: 50 })).toBe(76);
    expect(ceilOverallForRole("DC", { vel_tuf: 70, tir_pre: 60, pass_rin: 70, dri_rif: 70, dif_rea: 95, fis_pia: 75 })).toBe(82);
  });
  it("stessa gravita totale: decide la somma degli overall", () => {
    // 5 contro 5: posti DL4 DC2 PC2; giocatori DL5 DC1 PC2 (surplus DL,
    // deficit DC). Ogni opzione ha gravita totale 1 (un DL in DC); il posto
    // DC e centrale, quindi decide la somma dei centrali (criterio 2, che qui
    // coincide con la somma totale): vince l'overall piu alto nel posto DC.
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-alto", "Laterale Alto", "DL", [65, 60, 65, 65, 85, 80], "→", false, 5),
      mk("dl-basso", "Laterale Basso", "DL", [75, 60, 75, 75, 60, 60], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const piazzati = assegnaLinee(5, conv);
    const fuori = piazzati.filter((p) => p.fuoriRuolo && !p.adattato);
    expect(fuori).toHaveLength(1);
    expect(fuori[0].gravita).toBe(1);
    // A mano: Alto in DC 78 contro Basso in DC 65, stessa gravita 1.
    expect(ceilOverallForRole("DC", { vel_tuf: 65, tir_pre: 60, pass_rin: 65, dri_rif: 65, dif_rea: 85, fis_pia: 80 })).toBe(78);
    expect(ceilOverallForRole("DC", { vel_tuf: 75, tir_pre: 60, pass_rin: 75, dri_rif: 75, dif_rea: 60, fis_pia: 60 })).toBe(65);
    expect(fuori[0].id).toBe("dl-alto");
    expect(fuori[0].posto).toBe("DC");
  });
  it("avvisi fuori ruolo dal piu grave al meno grave, a parita per nome", () => {
    // 5 contro 5: DL6 DC1 PC1 (surplus DL doppio, deficit DC e PC):
    // un DL in PC (gravita 3, Zeta) + un DL in DC (gravita 1, Alfa) = 4.
    // Alfa precede Zeta per nome, ma l'avviso mette prima il grave.
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-alfa", "Alfa", "DL", [65, 60, 65, 65, 85, 80], "→", false, 5),
      mk("dl-zeta", "Zeta", "DL", [70, 95, 70, 70, 60, 60], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl5", "Laterale Cinque", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const prop = componiSquadre(5, conv);
    const riga = prop.avvisi.find((a) => a.startsWith("Fuori ruolo:"));
    expect(riga).toBeDefined();
    expect(riga).toBe("Fuori ruolo: Zeta (DL in PC), Alfa (DL in DC).");
  });
  it("stessa gravita: avvisi in ordine di nome", () => {
    // 5 contro 5: DL6 PC2 (surplus DL doppio, deficit DC doppio):
    // due DL in DC (1+1=2). I due migliori in DC (Alfa e Zulu, entrambi 78)
    // restano i mossi; l'avviso li elenca per nome.
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-alfa", "Alfa", "DL", [65, 60, 65, 65, 85, 80], "→", false, 5),
      mk("dl-zulu", "Zulu", "DL", [65, 60, 65, 65, 85, 80], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl5", "Laterale Cinque", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const prop = componiSquadre(5, conv);
    const riga = prop.avvisi.find((a) => a.startsWith("Fuori ruolo:"));
    expect(riga).toBeDefined();
    expect(riga).toBe("Fuori ruolo: Alfa (DL in DC), Zulu (DL in DC).");
  });
});

describe("secondo ruolo", () => {
  it("gravita effettiva: la migliore tra primario e secondario", () => {
    // Senza secondo ruolo vale il primario.
    expect(gravitaEffettiva("DL", null, "DC")).toBe(gravitaFuoriRuolo("DL", "DC"));
    expect(gravitaEffettiva("DL", undefined, "DC")).toBe(1);
    expect(gravitaEffettiva("DL", "", "DC")).toBe(1);
    // Posto uguale al secondario: gravita 0 come il ruolo esatto.
    expect(gravitaEffettiva("DL", "DC", "DC")).toBe(0);
    expect(gravitaEffettiva("DL", "DC", "DL")).toBe(0);
    // Altrove: il minimo tra i due (DL->CL 2, CC->CL 1).
    expect(gravitaEffettiva("DL", "CC", "CL")).toBe(1);
    expect(gravitaEffettiva("DL", "PC", "CL")).toBe(2);
    // Secondario non valido o uguale al primario: vale il primario.
    expect(gravitaEffettiva("DL", "P", "DC")).toBe(1);
    expect(gravitaEffettiva("DL", "XX", "DC")).toBe(1);
    expect(gravitaEffettiva("DL", "DL", "DC")).toBe(1);
  });
  it("uso del secondario solo con vantaggio sul primario", () => {
    expect(usaSecondoRuolo("DL", "DC", "DC")).toBe(true);
    expect(usaSecondoRuolo("DL", "CC", "CL")).toBe(true);
    expect(usaSecondoRuolo("DL", "DC", "DL")).toBe(false);
    expect(usaSecondoRuolo("DL", null, "DC")).toBe(false);
    expect(usaSecondoRuolo("DL", "DL", "DC")).toBe(false);
    expect(usaSecondoRuolo("DL", "P", "DC")).toBe(false);
  });
  it("posto nel secondo ruolo: gravita 0 e avviso dedicato, non fuori ruolo", () => {
    // 5 contro 5: DL5 DC1 PC2 (surplus DL, deficit DC). Laterale Basso ha
    // secondario DC: prende lui il posto DC con gravita 0, anche se
    // Laterale Alto nel posto DC varrebbe di piu (78 contro 60, vedi
    // "stessa gravita totale"). La gravita resta prioritaria: il secondo
    // ruolo batte il cambio ruolo.
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-alto", "Laterale Alto", "DL", [65, 60, 65, 65, 85, 80], "→", false, 5),
      mk2("dl-basso", "Laterale Basso", "DL", "DC", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [60, 60, 60, 60, 60, 60], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const piazzati = assegnaLinee(5, conv);
    const basso = piazzati.find((p) => p.id === "dl-basso")!;
    expect(basso.posto).toBe("DC");
    expect(basso.gravita).toBe(0);
    expect(basso.fuoriRuolo).toBe(false);
    expect(basso.secondoRuolo).toBe(true);
    expect(basso.role2).toBe("DC");
    // Il piu forte resta nel ruolo primario: nessun fuori ruolo in giro.
    expect(piazzati.find((p) => p.id === "dl-alto")?.posto).toBe("DL");
    expect(piazzati.filter((p) => p.fuoriRuolo && !p.adattato)).toHaveLength(0);
    const prop = componiSquadre(5, conv);
    expect(prop.avvisi.join(" ")).not.toContain("Fuori ruolo");
    expect(prop.avvisi.find((a) => a.startsWith("Nel secondo ruolo:"))).toBe(
      "Nel secondo ruolo: Laterale Basso (DL in DC).",
    );
  });
  it("secondario piu vicino ma non esatto: gravita attenuata e avviso doppio", () => {
    // 6 contro 6: posti movimento DL4 DC2 CC2 PC2; giocatori DL5 DC2 CC1
    // PC2 (surplus DL, deficit CC). Laterale Pronto ha secondario CL:
    // DL->CC 2 contro CL->CC 1, quindi prende lui il posto CC con
    // gravita 1 invece di 2, ma resta fuori ruolo attenuato.
    const v = [60, 60, 60, 60, 60, 60];
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk2("dl-pronto", "Laterale Pronto", "DL", "CL", v, "→", false, 5),
      mk("dl2", "Laterale Due", "DL", v, "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", v, "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", v, "→", false, 5),
      mk("dl5", "Laterale Cinque", "DL", v, "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dc2", "Centrale Due", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cc1", "Mediano Uno", "CC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const piazzati = assegnaLinee(6, conv);
    const pronto = piazzati.find((p) => p.id === "dl-pronto")!;
    expect(pronto.posto).toBe("CC");
    expect(pronto.gravita).toBe(1);
    expect(pronto.fuoriRuolo).toBe(true);
    expect(pronto.secondoRuolo).toBe(true);
    const prop = componiSquadre(6, conv);
    const riga = prop.avvisi.find((a) => a.startsWith("Fuori ruolo:"));
    expect(riga).toBe("Fuori ruolo: Laterale Pronto (DL/CL in CC).");
    expect(prop.avvisi.some((a) => a.startsWith("Nel secondo ruolo:"))).toBe(false);
  });
  it("ingresso non valido per secondo ruolo vietato", () => {
    const base = (): Convocato[] => [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dc2", "Centrale Due", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    const casi: Array<[string, Convocato]> = [
      ["oppure nessuno", { ...base()[2], role2: "XX" }],
      ["diverso dal ruolo principale", { ...base()[2], role2: "DL" }],
      ["oppure nessuno", { ...base()[2], role2: "P" }],
      ["non ha un secondo ruolo", { ...base()[0], role2: "DC" }],
    ];
    for (const [atteso, alterato] of casi) {
      const conv = base().map((c) => (c.id === alterato.id ? alterato : c));
      expect(validaIngresso(5, conv), alterato.id).toContain(atteso);
    }
    // Senza secondo ruolo resta tutto valido.
    expect(validaIngresso(5, base())).toBeNull();
  });
});

describe("posti centrali", () => {
  it("centrali in un solo punto (DC e CC)", () => {
    expect(POSTI_CENTRALI.has("DC")).toBe(true);
    expect(POSTI_CENTRALI.has("CC")).toBe(true);
    expect(POSTI_CENTRALI.has("DL")).toBe(false);
    expect(POSTI_CENTRALI.has("CL")).toBe(false);
    expect(POSTI_CENTRALI.has("PC")).toBe(false);
    expect(POSTI_CENTRALI.has("P")).toBe(false);
  });
  it("nessun CC e 6 CL in 8 contro 8: i due CL piu forti in CC vanno in CC", () => {
    // Posti mov. DL4 DC2 CL4 CC2 PC2; giocatori DL4 DC2 CL6 CC0 PC2:
    // surplus CL doppio, deficit CC doppio. Ogni opzione ha gravita 2
    // (due CL in CC, 1+1). Centrali = DC fissi (70+70) + CC mossi:
    // C in CC 75 contro L2 in CC 73, quindi vincono i due C anche se il
    // totale globale e piu basso (406 contro 412, vedi sotto).
    const clC = [60, 70, 90, 60, 80, 70];
    const clL = [50, 70, 90, 50, 85, 70];
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl2", "Laterale Due", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl3", "Laterale Tre", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("dc2", "Centrale Due", "DC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cl-c1", "Esterno C Uno", "CL", clC, "→", false, 5),
      mk("cl-c2", "Esterno C Due", "CL", clC, "→", false, 5),
      mk("cl-l1", "Esterno L Uno", "CL", clL, "→", false, 5),
      mk("cl-l2", "Esterno L Due", "CL", clL, "→", false, 5),
      mk("cl-l3", "Esterno L Tre", "CL", clL, "→", false, 5),
      mk("cl-l4", "Esterno L Quattro", "CL", clL, "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    // A mano con i pesi CC e CL: C in CC 75 e in CL 69; L2 in CC 73 e in CL 64.
    expect(ceilOverallForRole("CC", { vel_tuf: 60, tir_pre: 70, pass_rin: 90, dri_rif: 60, dif_rea: 80, fis_pia: 70 })).toBe(75);
    expect(ceilOverallForRole("CL", { vel_tuf: 60, tir_pre: 70, pass_rin: 90, dri_rif: 60, dif_rea: 80, fis_pia: 70 })).toBe(69);
    expect(ceilOverallForRole("CC", { vel_tuf: 50, tir_pre: 70, pass_rin: 90, dri_rif: 50, dif_rea: 85, fis_pia: 70 })).toBe(73);
    expect(ceilOverallForRole("CL", { vel_tuf: 50, tir_pre: 70, pass_rin: 90, dri_rif: 50, dif_rea: 85, fis_pia: 70 })).toBe(64);
    const piazzati = assegnaLinee(8, conv);
    const inCC = piazzati.filter((p) => p.posto === "CC").map((p) => p.id).sort();
    expect(inCC).toEqual(["cl-c1", "cl-c2"]);
    const inCL = piazzati.filter((p) => p.posto === "CL").map((p) => p.id).sort();
    expect(inCL).toEqual(["cl-l1", "cl-l2", "cl-l3", "cl-l4"]);
    for (const p of piazzati.filter((p) => p.posto === "CC")) expect(p.overallEff).toBe(75);
    // Centrali CC 150 contro 146; globale CL 150+256=406 contro 146+266=412:
    // vince il centro anche se il totale e piu basso.
    expect(piazzati.filter((p) => p.fuoriRuolo && !p.adattato)).toHaveLength(2);
  });
  it("nessun DC e piu DL: i due DL piu forti in DC vanno in DC", () => {
    // Posti mov. DL4 DC2 CL4 CC2 PC2; giocatori DL6 DC0 CL4 CC2 PC2:
    // surplus DL doppio, deficit DC doppio. Gravita 2 (due DL in DC, 1+1).
    // Centrali = CC fissi + DC mossi: C in DC 75 contro L2 in DC 68.
    const dlC = [60, 60, 60, 60, 90, 70];
    const dlL = [50, 60, 50, 60, 85, 60];
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl-c1", "Laterale C Uno", "DL", dlC, "→", false, 5),
      mk("dl-c2", "Laterale C Due", "DL", dlC, "→", false, 5),
      mk("dl-l1", "Laterale L Uno", "DL", dlL, "→", false, 5),
      mk("dl-l2", "Laterale L Due", "DL", dlL, "→", false, 5),
      mk("dl-l3", "Laterale L Tre", "DL", dlL, "→", false, 5),
      mk("dl-l4", "Laterale L Quattro", "DL", dlL, "→", false, 5),
      mk("cl1", "Esterno Uno", "CL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cl2", "Esterno Due", "CL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cl3", "Esterno Tre", "CL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cl4", "Esterno Quattro", "CL", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cc1", "Mediano Uno", "CC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("cc2", "Mediano Due", "CC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc1", "Punta Uno", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
      mk("pc2", "Punta Due", "PC", [70, 70, 70, 70, 70, 70], "→", false, 5),
    ];
    expect(ceilOverallForRole("DC", { vel_tuf: 60, tir_pre: 60, pass_rin: 60, dri_rif: 60, dif_rea: 90, fis_pia: 70 })).toBe(75);
    expect(ceilOverallForRole("DL", { vel_tuf: 60, tir_pre: 60, pass_rin: 60, dri_rif: 60, dif_rea: 90, fis_pia: 70 })).toBe(72);
    expect(ceilOverallForRole("DC", { vel_tuf: 50, tir_pre: 60, pass_rin: 50, dri_rif: 60, dif_rea: 85, fis_pia: 60 })).toBe(68);
    expect(ceilOverallForRole("DL", { vel_tuf: 50, tir_pre: 60, pass_rin: 50, dri_rif: 60, dif_rea: 85, fis_pia: 60 })).toBe(64);
    const piazzati = assegnaLinee(8, conv);
    const inDC = piazzati.filter((p) => p.posto === "DC").map((p) => p.id).sort();
    expect(inDC).toEqual(["dl-c1", "dl-c2"]);
    const inDL = piazzati.filter((p) => p.posto === "DL").map((p) => p.id).sort();
    expect(inDL).toEqual(["dl-l1", "dl-l2", "dl-l3", "dl-l4"]);
  });
  it("ruoli completi restano esatti", () => {
    const v = [70, 70, 70, 70, 70, 70];
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", v), mk("dl2", "Laterale Due", "DL", v),
      mk("dl3", "Laterale Tre", "DL", v), mk("dl4", "Laterale Quattro", "DL", v),
      mk("dc1", "Centrale Uno", "DC", v), mk("dc2", "Centrale Due", "DC", v),
      mk("cl1", "Esterno Uno", "CL", v), mk("cl2", "Esterno Due", "CL", v),
      mk("cl3", "Esterno Tre", "CL", v), mk("cl4", "Esterno Quattro", "CL", v),
      mk("cc1", "Mediano Uno", "CC", v), mk("cc2", "Mediano Due", "CC", v),
      mk("pc1", "Punta Uno", "PC", v), mk("pc2", "Punta Due", "PC", v),
    ];
    const piazzati = assegnaLinee(8, conv);
    expect(piazzati).toHaveLength(16);
    for (const p of piazzati) {
      expect(p.posto).toBe(p.role);
      expect(p.fuoriRuolo).toBe(false);
      expect(p.gravita).toBe(0);
    }
  });
});

describe("portieri", () => {
  function mov(id: string, name: string, role: string, v = 72, played = 5): Convocato {
    return mk(id, name, role, [v, v, v, v, v, v], "→", false, played);
  }
  it("2 portieri: uno per squadra", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mov("dl1", "Laterale Uno", "DL"), mov("dl2", "Laterale Due", "DL"),
      mov("dl3", "Laterale Tre", "DL"), mov("dl4", "Laterale Quattro", "DL"),
      mov("dc1", "Centrale Uno", "DC"), mov("dc2", "Centrale Due", "DC"),
      mov("a1", "Att Uno", "PC"), mov("a2", "Att Due", "PC"),
    ];
    const prop = componiSquadre(5, conv);
    expect(prop.squadraA.rotazione).toBe(false);
    expect(prop.squadraB.rotazione).toBe(false);
    expect(prop.squadraA.portiere).toHaveLength(1);
    expect(prop.squadraB.portiere).toHaveLength(1);
  });
  it("oltre 2 portieri: stima di movimento e avviso adattato, nessun ricalcolo", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [82, 82, 82, 82, 82, 82], "→", false, 8),
      mk("p2", "Portiere Due", "P", [80, 80, 80, 80, 80, 80], "→", false, 7),
      mk("p3", "Portiere Tre", "P", [90, 60, 60, 60, 60, 60], "→", false, 6),
      mov("dl1", "Laterale Uno", "DL"), mov("dl2", "Laterale Due", "DL"),
      mov("dl3", "Laterale Tre", "DL"),
      mov("dc1", "Centrale Uno", "DC"), mov("dc2", "Centrale Due", "DC"),
      mov("a1", "Att Uno", "PC"), mov("a2", "Att Due", "PC"),
    ];
    const prop = componiSquadre(5, conv);
    const tutti = [...prop.squadraA.portiere, ...prop.squadraB.portiere];
    expect(tutti).toHaveLength(2);
    const piazzati = assegnaLinee(5, conv);
    const terzo = piazzati.find((p) => p.id === "p3")!;
    expect(terzo.posto).not.toBe("P");
    // Stima di movimento (72), non ricalcolo con pesi di movimento (66)
    // e non overall proprio da portiere (68).
    expect(terzo.overallEff).toBe(72);
    expect(terzo.fisCorr).toBeNull();
    expect(prop.avvisi.join(" ")).toContain("Portiere adattato");
    expect(prop.avvisi.join(" ")).toContain("Portiere Tre");
  });
  it("1 portiere: una squadra a rotazione con posto extra CC", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mov("dl1", "Laterale Uno", "DL", 76), mov("dl2", "Laterale Due", "DL", 74),
      mov("dl3", "Laterale Tre", "DL", 72), mov("dl4", "Laterale Quattro", "DL", 70),
      mov("dc1", "Centrale Uno", "DC", 75), mov("dc2", "Centrale Due", "DC", 71),
      mov("a1", "Att Uno", "PC", 77), mov("a2", "Att Due", "PC", 71),
      mov("c1", "Mediano Uno", "CC", 75),
    ];
    const prop = componiSquadre(5, conv);
    const rotazioni = [prop.squadraA.rotazione, prop.squadraB.rotazione];
    expect(rotazioni.sort()).toEqual([false, true]);
    const nA = prop.squadraA.portiere.length + prop.squadraA.difensori.length + prop.squadraA.centrocampisti.length + prop.squadraA.attaccanti.length;
    const nB = prop.squadraB.portiere.length + prop.squadraB.difensori.length + prop.squadraB.centrocampisti.length + prop.squadraB.attaccanti.length;
    expect(nA).toBe(5);
    expect(nB).toBe(5);
    expect(prop.testo).toContain("Portiere: a rotazione");
    // Un solo CC extra in tutto il gruppo.
    expect(prop.squadraA.centrocampisti.length + prop.squadraB.centrocampisti.length).toBe(1);
    expect(prop.squadraA.centrocampisti.concat(prop.squadraB.centrocampisti).every((p) => p.posto === "CC")).toBe(true);
  });
  it("0 portieri: entrambe a rotazione con due posti extra CC", () => {
    const conv: Convocato[] = [
      mov("dl1", "Laterale Uno", "DL", 76), mov("dl2", "Laterale Due", "DL", 74),
      mov("dl3", "Laterale Tre", "DL", 72), mov("dl4", "Laterale Quattro", "DL", 70),
      mov("dc1", "Centrale Uno", "DC", 75), mov("dc2", "Centrale Due", "DC", 71),
      mov("a1", "Att Uno", "PC", 77), mov("a2", "Att Due", "PC", 71),
      mov("c1", "Mediano Uno", "CC", 78), mov("c2", "Mediano Due", "CC", 74),
    ];
    const prop = componiSquadre(5, conv);
    expect(prop.squadraA.rotazione).toBe(true);
    expect(prop.squadraB.rotazione).toBe(true);
    expect(prop.squadraA.centrocampisti.length + prop.squadraB.centrocampisti.length).toBe(2);
    expect(prop.avvisi.join(" ")).toContain("rotazione");
  });
  it("P titolare senza voti: vale l'altro titolare", () => {
    const conv: Convocato[] = [
      { ...mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80]), mediane: [null, null, null, null, null, null] },
      mk("p2", "Portiere Due", "P", [80, 80, 80, 80, 80, 80], "→", false, 7),
      mov("dl1", "Laterale Uno", "DL"), mov("dl2", "Laterale Due", "DL"),
      mov("dl3", "Laterale Tre", "DL"), mov("dl4", "Laterale Quattro", "DL"),
      mov("dc1", "Centrale Uno", "DC"), mov("dc2", "Centrale Due", "DC"),
      mov("a1", "Att Uno", "PC"), mov("a2", "Att Due", "PC"),
    ];
    const piazzati = assegnaLinee(5, conv);
    // L'altro titolare ha 80: non la stima di movimento (72).
    expect(piazzati.find((p) => p.id === "p1")?.overallEff).toBe(80);
  });
  it("P titolare senza voti e senza altro con voti: stima di movimento", () => {
    const conv: Convocato[] = [
      { ...mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80]), mediane: [null, null, null, null, null, null] },
      mov("dl1", "Laterale Uno", "DL"), mov("dl2", "Laterale Due", "DL"),
      mov("dl3", "Laterale Tre", "DL"), mov("dl4", "Laterale Quattro", "DL"),
      mov("dc1", "Centrale Uno", "DC"), mov("dc2", "Centrale Due", "DC"),
      mov("a1", "Att Uno", "PC"), mov("a2", "Att Due", "PC"),
      mov("c1", "Mediano Uno", "CC"),
    ];
    const piazzati = assegnaLinee(5, conv);
    expect(piazzati.find((p) => p.id === "p1")?.overallEff).toBe(72);
  });
});

describe("equilibrio e testo", () => {
  // 5 contro 5, posti per squadra: P, DL, DC, DL, PC. FIS esplicito
  // nell'ultimo valore delle mediane.
  function casoBilanciato(): Convocato[] {
    return [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mk("dl1", "Laterale Uno", "DL", [70, 60, 70, 65, 84, 79], "→", false, 6),
      mk("dl2", "Laterale Due", "DL", [68, 60, 68, 64, 82, 76], "→", false, 6),
      mk("dl3", "Laterale Tre", "DL", [68, 60, 68, 64, 72, 70], "→", false, 5),
      mk("dl4", "Laterale Quattro", "DL", [66, 60, 66, 63, 70, 68], "→", false, 5),
      mk("dc1", "Centrale Uno", "DC", [70, 60, 70, 65, 85, 80], "→", false, 6),
      mk("dc2", "Centrale Due", "DC", [68, 60, 68, 64, 72, 70], "→", false, 4),
      mk("pc1", "Punta Uno", "PC", [72, 85, 65, 75, 60, 78], "→", false, 6),
      mk("pc2", "Punta Due", "PC", [62, 70, 60, 65, 60, 68], "→", false, 3),
    ];
  }
  it("ottimo verificato con ricerca esaustiva indipendente e determinismo", () => {
    const conv = casoBilanciato();
    const prima = componiSquadre(5, conv);
    expect(componiSquadre(5, conv).testo).toBe(prima.testo);
    // Calcolo a mano (overall per eccesso col ruolo del posto, forma →):
    // POR 80 e 70; DL 77, 75, 70, 68; DC 79 e 70; PC 79 e 67; totale 735.
    // Fissato P80 su un lato, diff = |10 + dDL + dDC + dPC| con dDL in
    // {±14, ±4, 0}, dDC in {±9}, dPC in {±12}: il minimo overall puro e 1
    // (P80 + DL{70,68} + DC70 + PC79 = 367 contro 368), ma l'algoritmo
    // minimizza il costo intero e NON lo si asserisce qui sotto.
    // Divisioni rilevanti (overall / FIS / costo con pesi 0.5 e 0.3):
    // A: P80 DL{70,68} DC70 PC79 = 367 contro 368: diff 1, FIS 71.5/75.75,
    //    costo 1 + 2.125 + 0.3x19.67 = 9.025.
    // B: P80 DL{77,75} DC70 PC67 = 369 contro 366: diff 3, FIS 73.25/74,
    //    costo 3 + 0.375 + 0.3x13.67 = 7.475 (minimo).
    // C: P80 DL{75,68} DC79 PC67 = 369 contro 366: diff 3, FIS 73/74.25,
    //    costo 3 + 0.625 + 0.3x13.67 = 7.725 (seconda).
    // Ricerca esaustiva indipendente: tutti i sottoinsiemi da 5 su 10 (252),
    // tenendo solo quelli con i posti di ogni ruolo (P1 DL2 DC1 PC1), con la
    // stessa funzione di costo (medie per FIS e per linea).
    const piazzati = assegnaLinee(5, conv);
    const perId = new Map(piazzati.map((p) => [p.id, p]));
    const ids = conv.map((c) => c.id);
    const quota: Record<string, number> = { P: 1, DL: 2, DC: 1, PC: 1 };
    const metriche = (xs: string[]): { costo: number; diffOverall: number; diffFis: number } => {
      const inX = new Set(xs);
      const X = ids.filter((id) => inX.has(id)).map((id) => perId.get(id)!);
      const Y = ids.filter((id) => !inX.has(id)).map((id) => perId.get(id)!);
      const totX = X.reduce((a, p) => a + p.overallEff, 0);
      const totY = Y.reduce((a, p) => a + p.overallEff, 0);
      const diffOverall = Math.abs(totX - totY);
      const fisX = X.map((p) => p.fisCorr).filter((v): v is number => typeof v === "number");
      const fisY = Y.map((p) => p.fisCorr).filter((v): v is number => typeof v === "number");
      const mFx = fisX.reduce((a, v) => a + v, 0) / Math.max(1, fisX.length);
      const mFy = fisY.reduce((a, v) => a + v, 0) / Math.max(1, fisY.length);
      const diffFis = Math.abs(mFx - mFy);
      const avg = (l: typeof X, posti: string[]): number => {
        const s = l.filter((p) => posti.includes(p.posto));
        return s.reduce((a, p) => a + p.overallEff, 0) / Math.max(1, s.length);
      };
      const costo =
        diffOverall +
        PESO_FIS * diffFis +
        PESO_LINEE * (Math.abs(avg(X, ["DL", "DC"]) - avg(Y, ["DL", "DC"])) + Math.abs(avg(X, ["PC"]) - avg(Y, ["PC"])));
      return { costo, diffOverall, diffFis };
    };
    let minCosto = Number.POSITIVE_INFINITY;
    let overallAlMin = 0;
    let fisAlMin = 0;
    const n = ids.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      const xs: string[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) xs.push(ids[i]);
      if (xs.length !== 5) continue;
      const conti: Record<string, number> = {};
      for (const id of xs) {
        const posto = perId.get(id)!.posto;
        conti[posto] = (conti[posto] ?? 0) + 1;
      }
      if (conti["P"] !== quota["P"] || conti["DL"] !== quota["DL"] || conti["DC"] !== quota["DC"] || conti["PC"] !== quota["PC"]) continue;
      const m = metriche(xs);
      if (m.costo < minCosto - 1e-9) {
        minCosto = m.costo;
        overallAlMin = m.diffOverall;
        fisAlMin = m.diffFis;
      }
    }
    const idsA = [
      ...prima.squadraA.portiere,
      ...prima.squadraA.difensori,
      ...prima.squadraA.centrocampisti,
      ...prima.squadraA.attaccanti,
    ].map((p) => p.id);
    // La ricerca ritrova il minimo calcolato a mano (divisione B: 7.475).
    expect(minCosto).toBeCloseTo(7.475, 9);
    expect(metriche(idsA).costo).toBeCloseTo(minCosto, 9);
    // Valori della divisione di costo minimo, derivati dalla ricerca stessa...
    expect(prima.diffOverall).toBe(overallAlMin);
    expect(prima.diffFis).toBeCloseTo(Math.round(fisAlMin * 10) / 10, 9);
    // ...e uguali a quelli calcolati a mano (diff FIS 0.75, mostrato 0.8).
    expect(prima.diffOverall).toBe(3);
    expect(prima.diffFis).toBe(0.8);
  });
  it("determinismo con ordine d'ingresso mescolato", () => {
    const base = casoBilanciato();
    const testo = componiSquadre(5, base).testo;
    const perms = [
      [...base].reverse(),
      [...base.slice(3), ...base.slice(0, 3)],
      [...base.slice(5), ...base.slice(0, 5)],
      [base[1], base[0], base[3], base[2], base[5], base[4], base[7], base[6], base[9], base[8]],
      [base[9], base[7], base[5], base[3], base[1], base[8], base[6], base[4], base[2], base[0]],
    ];
    for (const p of perms) expect(componiSquadre(5, p).testo).toBe(testo);
  });
  it("5 senza rotazione: nessuna riga dei centrocampisti", () => {
    const prop = componiSquadre(5, casoBilanciato());
    const righe = prop.testo.split("\n");
    // Titolo, vuoto, blocco A (4 righe), vuoto, vs, vuoto, blocco B (4 righe).
    expect(righe.length).toBe(13);
    expect([righe[1], righe[6], righe[8]]).toEqual(["", "", ""]);
    expect(righe.filter((r) => r === "").length).toBe(3);
    expect(prop.squadraA.centrocampisti).toEqual([]);
    expect(prop.squadraB.centrocampisti).toEqual([]);
  });
  it("righe per posto: DL DC DL con laterali in ordine", () => {
    const prop = componiSquadre(5, casoBilanciato());
    for (const s of [prop.squadraA, prop.squadraB]) {
      expect(s.difensori.map((p) => p.posto)).toEqual(["DL", "DC", "DL"]);
      expect(s.difensori[0].overallEff).toBeGreaterThanOrEqual(s.difensori[2].overallEff);
      expect(s.attaccanti.map((p) => p.posto)).toEqual(["PC"]);
      expect(s.portiere.map((p) => p.posto)).toEqual(["P"]);
    }
  });
  it("riga CL CC CC CL con rotazione totale in 8 contro 8", () => {
    const conv: Convocato[] = [
      mov("dl1", "Laterale Uno", "DL", 72), mov("dl2", "Laterale Due", "DL", 72),
      mov("dl3", "Laterale Tre", "DL", 72), mov("dl4", "Laterale Quattro", "DL", 72),
      mov("dc1", "Centrale Uno", "DC", 72), mov("dc2", "Centrale Due", "DC", 72),
      mk("cla", "Esterno A", "CL", [80, 80, 80, 80, 80, 80], "→", false, 6),
      mov("clb", "Esterno B", "CL", 76), mov("clc", "Esterno C", "CL", 74),
      mov("cld", "Esterno D", "CL", 72),
      mov("cc1", "Mediano Uno", "CC", 72), mov("cc2", "Mediano Due", "CC", 72),
      mov("cc3", "Mediano Tre", "CC", 72), mov("cc4", "Mediano Quattro", "CC", 72),
      mov("pc1", "Punta Uno", "PC", 72), mov("pc2", "Punta Due", "PC", 72),
    ];
    const prop = componiSquadre(8, conv);
    expect(prop.squadraA.rotazione).toBe(true);
    expect(prop.squadraB.rotazione).toBe(true);
    for (const s of [prop.squadraA, prop.squadraB]) {
      expect(s.centrocampisti.map((p) => p.posto)).toEqual(["CL", "CC", "CC", "CL"]);
      const cl = s.centrocampisti.filter((p) => p.posto === "CL");
      expect(cl[0].overallEff).toBeGreaterThanOrEqual(cl[1].overallEff);
    }
    expect(prop.squadraA.centrocampisti.length + prop.squadraB.centrocampisti.length).toBe(8);
  });
  it("formato del testo: totali = somma dei numeri, solo nome e numero", () => {
    const prop = componiSquadre(5, casoBilanciato());
    const righe = prop.testo.split("\n");
    expect(righe[0]).toBe("*PROPOSTA FORMAZIONI FLANNERY - 5 vs 5*");
    expect(righe).toContain("vs");
    expect(righe.filter((r) => r === "*Squadra A* - Overall " + prop.squadraA.totale)).toHaveLength(1);
    expect(righe.filter((r) => r === "*Squadra B* - Overall " + prop.squadraB.totale)).toHaveLength(1);
    const numeriA = [
      ...prop.squadraA.portiere, ...prop.squadraA.difensori,
      ...prop.squadraA.centrocampisti, ...prop.squadraA.attaccanti,
    ].reduce((a, p) => a + p.overallEff, 0);
    const numeriB = [
      ...prop.squadraB.portiere, ...prop.squadraB.difensori,
      ...prop.squadraB.centrocampisti, ...prop.squadraB.attaccanti,
    ].reduce((a, p) => a + p.overallEff, 0);
    expect(numeriA).toBe(prop.squadraA.totale);
    expect(numeriB).toBe(prop.squadraB.totale);
    // Ogni riga di giocatori: solo coppie nome + numero, niente sigle di ruolo.
    const ruoli = new Set(["P", "DL", "DC", "CL", "CC", "PC"]);
    for (const r of righe) {
      if (r === "" || r === "vs" || r.startsWith("*")) continue;
      if (r === "Portiere: a rotazione") continue;
      for (const t of r.split(" ")) {
        expect(ruoli.has(t)).toBe(false);
      }
    }
    expect(prop.testo).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
  it("senza voti: stima dalla media con avviso, nessun errore", () => {
    const base = casoBilanciato();
    base[4] = { ...base[4], mediane: [null, null, null, null, null, null] };
    const prop = componiSquadre(5, base);
    expect(prop.avvisi.join(" ")).toContain("Senza voti");
    expect(prop.squadraA.totale).toBeGreaterThan(0);
  });
  it("ruolo mancante (nessun CL) in 8 contro 8", () => {
    const conv: Convocato[] = [
      mk("p1", "Portiere Uno", "P", [80, 80, 80, 80, 80, 80], "→", false, 8),
      mk("p2", "Portiere Due", "P", [70, 70, 70, 70, 70, 70], "→", false, 7),
      mov("dl1", "Laterale Uno", "DL"), mov("dl2", "Laterale Due", "DL"),
      mov("dl3", "Laterale Tre", "DL"), mov("dl4", "Laterale Quattro", "DL"),
      mov("dc1", "Centrale Uno", "DC"), mov("dc2", "Centrale Due", "DC"),
      mov("cc1", "Mediano Uno", "CC", 90), mov("cc2", "Mediano Due", "CC", 60),
      mov("cc3", "Mediano Tre", "CC", 60), mov("cc4", "Mediano Quattro", "CC", 60),
      mov("cc5", "Mediano Cinque", "CC", 60), mov("cc6", "Mediano Sei", "CC", 60),
      mov("pc1", "Punta Uno", "PC"), mov("pc2", "Punta Due", "PC"),
    ];
    const piazzati = assegnaLinee(8, conv);
    const cl = piazzati.filter((p) => p.posto === "CL");
    expect(cl).toHaveLength(4);
    expect(cl.every((p) => p.fuoriRuolo)).toBe(true);
    // I piu forti vanno al centro (CC): il migliore (CC da 90) resta in CC,
    // i 4 CL sono i piu deboli.
    expect(piazzati.filter((p) => p.posto === "CC").map((p) => p.id)).toContain("cc1");
    expect(cl.map((p) => p.id)).not.toContain("cc1");
  });
});

describe("moduli", () => {
  it("posti per squadra in un solo punto", () => {
    expect(POSTI[5]).toEqual(["P", "DL", "DC", "DL", "PC"]);
    expect(POSTI[6]).toEqual(["P", "DL", "DC", "DL", "CC", "PC"]);
    expect(POSTI[7]).toEqual(["P", "DL", "DC", "DL", "CC", "CC", "PC"]);
    expect(POSTI[8]).toEqual(["P", "DL", "DC", "DL", "CL", "CC", "CL", "PC"]);
  });
});

let s: TestServer;

beforeAll(async () => {
  s = await startServer();
}, 120_000);

afterAll(async () => {
  await s?.dispose();
});

beforeEach(async () => {
  await s.reset();
});

async function loginCookie(playerId: string, pin: string): Promise<string> {
  const session = await s.call("/api/auth/login", { method: "POST", body: { playerId, pin } });
  expect(session.status).toBe(200);
  return `fn_session=${sessionCookie(session)}`;
}

const DIECI = ["antonio", "antonioportiere", "fake-uno", "fake-due", "fake-tre", "fake-quattro", "fake-cinque", "fake-sei", "fake-sette", "fake-otto"];

function mov(id: string, name: string, role: string, v = 72, played = 5): Convocato {
  return mk(id, name, role, [v, v, v, v, v, v], "→", false, played);
}

describe("rotta", () => {
  it("401 senza accesso, 403 per non gestione", async () => {
    expect((await s.call("/api/admin/squadre/giocatori")).status).toBe(401);
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: DIECI } })).status).toBe(401);
    const ospite = await s.call("/api/auth/login", { method: "POST", body: { playerId: "fake-due", pin: PIN.fakeDue } });
    const cookie = `fn_session=${sessionCookie(ospite)}`;
    expect((await s.call("/api/admin/squadre/giocatori", { cookie })).status).toBe(403);
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: DIECI }, cookie })).status).toBe(403);
  });
  it("400 per formato e convocati non validi", async () => {
    const cookie = await loginCookie("fake-otto", PIN.fakeOtto);
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 9, convocati: DIECI }, cookie })).status).toBe(400);
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: DIECI.slice(0, 8) }, cookie })).body.error).toMatch(/Mancano 2 convocati/);
    const doppi = [...DIECI.slice(0, 9), DIECI[0]];
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: doppi }, cookie })).body.error).toMatch(/una sola volta/);
    const fantasmi = [...DIECI.slice(0, 9), "fantasma"];
    expect((await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: fantasmi }, cookie })).body.error).toMatch(/non trovato/);
  });
  it("secondo ruolo via API: in elenco e nella proposta", async () => {
    const cookie = await loginCookie("fake-otto", PIN.fakeOtto);
    // fake-uno e CL: secondario DC valido.
    const mod = await s.call("/api/admin/players/fake-uno", {
      method: "PUT",
      cookie,
      body: { name: "Fake Uno", role: "CL", role2: "DC", flag: "Italia.png", canLogin: true },
    });
    expect(mod.status).toBe(200);
    expect(mod.body.role2).toBe("DC");
    const elenco = await s.call("/api/admin/squadre/giocatori", { cookie });
    expect(elenco.status).toBe(200);
    expect(elenco.body.players.find((p: { id: string }) => p.id === "fake-uno").role2).toBe("DC");
    // Vietati: P come secondo ruolo e secondo ruolo al portiere.
    for (const body of [
      { name: "Fake Uno", role: "CL", role2: "P", flag: "Italia.png", canLogin: true },
      { name: "Fake Uno", role: "CL", role2: "CL", flag: "Italia.png", canLogin: true },
    ]) {
      expect((await s.call("/api/admin/players/fake-uno", { method: "PUT", cookie, body })).status).toBe(400);
    }
    expect(
      (
        await s.call("/api/admin/players/antonioportiere", {
          method: "PUT",
          cookie,
          body: { name: "Fake Altro Portiere", role: "P", role2: "DC", flag: "Italia.png", canLogin: true },
        })
      ).status,
    ).toBe(400);
    const prop = await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: DIECI }, cookie });
    expect(prop.status).toBe(200);
    expect(typeof prop.body.testo).toBe("string");
  });
  it("200 per la gestione, senza scritture", async () => {
    const cookie = await loginCookie("fake-otto", PIN.fakeOtto);
    const elenco = await s.call("/api/admin/squadre/giocatori", { cookie });
    expect(elenco.status).toBe(200);
    expect(elenco.body.players.length).toBeGreaterThanOrEqual(10);
    const primo = elenco.body.players[0];
    expect(Object.keys(primo).sort()).toEqual(["id", "name", "played", "role", "role2"]);
    const primaPartite = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM matches");
    const primaRegistro = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log");
    const prop = await s.call("/api/admin/squadre/proposta", { method: "POST", body: { formato: 5, convocati: DIECI }, cookie });
    expect(prop.status).toBe(200);
    expect(typeof prop.body.testo).toBe("string");
    expect(prop.body.testo).toContain("*Squadra A*");
    expect(typeof prop.body.diffOverall).toBe("number");
    expect(Array.isArray(prop.body.avvisi)).toBe(true);
    const dopoPartite = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM matches");
    const dopoRegistro = await s.first<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log");
    expect(dopoPartite.n).toBe(primaPartite.n);
    expect(dopoRegistro.n).toBe(primaRegistro.n);
  });
});

describe("guardie di stile dei nuovi file", () => {
  it("parole non volute assenti e sigle presenti", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const percorsi = [
      "src/squadre.ts",
      "src/routes/routes_squadre.ts",
      "src/router.ts",
      "public/js/views/squadre.js",
      "public/js/views/partite.js",
      "public/js/routes.js",
      "public/js/api.js",
      "public/styles.css",
      "docs/SQUADRE.md",
    ];
    const vietati = [
      "leg" + "acy",
      "ass" + "ist",
      "tiri in " + "porta",
      "passaggi " + "chiave",
      "dri" + "bbling",
      "recu" + "peri",
      "du" + "elli",
      "par" + "ate",
      "advanced" + "tracked",
      "not" + "es",
      "crit" + "ica",
      "supa" + "base",
      "apps " + "script",
      "jso" + "np",
      "admin" + "bridge",
    ];
    for (const p of percorsi) {
      const src = readFileSync(join(root, p), "utf8").toLowerCase();
      for (const parola of vietati) expect(src, `${p}:${parola}`).not.toContain(parola);
    }
    const pura = readFileSync(join(root, "src/squadre.ts"), "utf8");
    for (const sigla of ["VEL", "TIR", "PASS", "DRI", "DIF", "FIS", "TUF", "PRE", "RIN", "RIF", "REA", "PIA"]) {
      expect(pura).toContain(sigla);
    }
  });
});
