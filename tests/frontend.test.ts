// Passo 4: test delle parti pure del sito.
// Percorsi, geometria dell'esagono, il mio overall, formattazione,
// ordinamenti e impaginazione delle partite.
// Nessun DOM: sono funzioni che non toccano la pagina.

import { describe, expect, it } from "vitest";
import {
  ANELLI,
  ASSI,
  GEOMETRIA,
  axisAngle,
  axisPoint,
  clampValue,
  labelPositions,
  polygonPoints,
  ringPoints,
  valuesInOrder,
} from "../public/js/hexagon.js";
import { activeNav, homePath, navItems, needsSeason, normalizePath, resolveRoute, seasonFromSearch, withSeason } from "../public/js/routes.js";
import { PESI, etichettePerRuolo, myOverall, valoriDaVoto, valoriIniziali, median, votiPerTarget } from "../public/js/ratings.js";
import { clamp, flagUrl, formatDate, formatNumber, formatOverall, formatOverallUp, formatShortDate, formatVotes, formaLabel, stepValue } from "../public/js/format.js";
import { filterPlayers, rolesOf, sortPlayers, withAppearances } from "../public/js/lists.js";
import { guidinhaLinea, matchHeadline, sortTeamPlayers } from "../public/js/matches.js";
import { ApiError, nonAutorizzato } from "../public/js/api.js";
import { separaMvp } from "../public/js/ui.js";
import { testoRendimento } from "../public/js/views/classifica.js";
import { completaAccesso } from "../public/js/views/accesso.js";
import { impostaCollegato, isCollegato, prendiReturnTo, ricordaReturnTo, utenteCollegato } from "../public/js/state.js";
import { ROLE_WEIGHTS, overallForRole } from "../src/calc";

interface SeiValori {
  velTuf: number | null;
  tirPre: number | null;
  passRin: number | null;
  driRif: number | null;
  difRea: number | null;
  fisPia: number | null;
}

interface GiocatoreElenco {
  id: string;
  name: string;
  role: string;
  overall: number | null;
}

interface RigaClassifica {
  id: string;
  played: number;
}

const SEI: SeiValori = { velTuf: 80, tirPre: 70, passRin: 75, driRif: 65, difRea: 85, fisPia: 90 };

/** Le tabelle dei pesi sono in JavaScript: qui si leggevano come any. */
const pesiDi = (ruolo: string): number[] => (PESI as Record<string, number[]>)[ruolo];

describe("percorsi", () => {
  it("la radice porta a classifica per l'ospite e a home per chi è entrato", () => {
    expect(homePath(false)).toBe("/classifica");
    expect(homePath(true)).toBe("/home");
    expect(resolveRoute("/", { authed: false }).redirect).toBe("/classifica");
    expect(resolveRoute("/", { authed: true }).redirect).toBe("/home");
  });

  it("le sezioni note si risolvono col loro nome", () => {
    expect(resolveRoute("/classifica").name).toBe("classifica");
    expect(resolveRoute("/giocatori").name).toBe("giocatori");
    expect(resolveRoute("/partite").name).toBe("partite");
    expect(resolveRoute("/accesso").name).toBe("accesso");
  });

  it("la scheda del giocatore porta l'id, anche con caratteri speciali", () => {
    const scelta = resolveRoute("/giocatori/antonio%20rossi");
    expect(scelta.name).toBe("scheda");
    expect(scelta.playerId).toBe("antonio rossi");
  });

  it("/home senza accesso porta all'accesso, mai in classifica", () => {
    expect(resolveRoute("/home", { authed: false }).redirect).toBe("/accesso");
    expect(resolveRoute("/accesso/cambia", { authed: false }).redirect).toBe("/accesso");
  });

  it("con accesso home si vede e /accesso rimanda a home", () => {
    expect(resolveRoute("/home", { authed: true }).name).toBe("home");
    expect(resolveRoute("/accesso", { authed: true }).redirect).toBe("/home");
  });

  it("dopo il login si atterra su /home e la voce Home punta a /home", () => {
    expect(homePath(true)).toBe("/home");
    expect(navItems(false).find((v) => v.name === "home")?.href).toBe("/home");
    expect(navItems(true).find((v) => v.name === "home")?.href).toBe("/home");
  });

  it("un indirizzo sconosciuto torna alla sezione giusta", () => {
    expect(resolveRoute("/percorso-che-non-esiste", { authed: true }).redirect).toBe("/home");
    expect(resolveRoute("/percorso-che-non-esiste", { authed: false }).redirect).toBe("/classifica");
    expect(resolveRoute("/giocatori/").name).toBe("giocatori");
    expect(resolveRoute("/giocatori/%20").redirect).toBe("/giocatori");
  });

  it("la barra finale sparisce e la season torna nei link", () => {
    expect(normalizePath("/classifica/")).toBe("/classifica");
    expect(normalizePath("/")).toBe("/");
    expect(withSeason("/classifica", 2)).toBe("/classifica?stagione=2");
    expect(seasonFromSearch("?stagione=3")).toBe(3);
    expect(seasonFromSearch("")).toBe(null);
    expect(seasonFromSearch("?stagione=abc")).toBe(null);
  });

  it("la barra ha sempre quattro voci, anche senza accesso", () => {
    expect(navItems(false).map((v) => v.href)).toEqual(["/home", "/classifica", "/giocatori", "/partite"]);
    expect(navItems(true).map((v) => v.href)).toEqual(["/home", "/classifica", "/giocatori", "/partite"]);
  });

  it("il selettore di stagione serve su classifica, partite e statistiche", () => {
    expect(needsSeason("classifica")).toBe(true);
    expect(needsSeason("partite")).toBe(true);
    expect(needsSeason("scheda")).toBe(true);
    expect(needsSeason("giocatori")).toBe(false);
    expect(needsSeason("home")).toBe(false);
  });

  it("nella barra resta accesa la voce Giocatori anche sulla scheda", () => {
    expect(activeNav("scheda")).toBe("giocatori");
    expect(activeNav("classifica")).toBe("classifica");
  });
});

describe("esagono", () => {
  it("sei assi, tre anelli, il primo in alto", () => {
    expect(ASSI).toHaveLength(6);
    expect(ANELLI).toHaveLength(3);
    expect(axisAngle(0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(axisAngle(1) - axisAngle(0)).toBeCloseTo(Math.PI / 3, 6);
  });

  it("il valore 100 arriva sul raggio massimo e 0 al centro", () => {
    const inAlto = axisPoint(0, 100);
    expect(inAlto.x).toBeCloseTo(GEOMETRIA.cx, 6);
    expect(inAlto.y).toBeCloseTo(GEOMETRIA.cy - GEOMETRIA.r, 6);
    const centro = axisPoint(3, 0);
    expect(centro.x).toBeCloseTo(GEOMETRIA.cx, 6);
    expect(centro.y).toBeCloseTo(GEOMETRIA.cy, 6);
  });

  it("il raggio cresce con il valore", () => {
    const piccolo = axisPoint(2, 50);
    const grande = axisPoint(2, 90);
    const distanza = (p: { x: number; y: number }) => Math.hypot(p.x - GEOMETRIA.cx, p.y - GEOMETRIA.cy);
    expect(distanza(grande)).toBeGreaterThan(distanza(piccolo));
    expect(distanza(piccolo)).toBeCloseTo(GEOMETRIA.r / 2, 6);
  });

  it("il poligono ha sei vertici e resta dentro il raggio", () => {
    const punti = polygonPoints([100, 50, 0, 75, 25, 60]).split(" ");
    expect(punti).toHaveLength(6);
    for (const punto of punti) {
      const [x, y] = punto.split(",").map(Number);
      expect(Math.hypot(x - GEOMETRIA.cx, y - GEOMETRIA.cy)).toBeLessThanOrEqual(GEOMETRIA.r + 0.1);
    }
  });

  it("gli anelli sono esagoni regolari concentrici", () => {
    const anello = ringPoints(100).split(" ");
    expect(anello).toHaveLength(6);
    for (const punto of anello) {
      const [x, y] = punto.split(",").map(Number);
      expect(Math.hypot(x - GEOMETRIA.cx, y - GEOMETRIA.cy)).toBeCloseTo(GEOMETRIA.r, 1);
    }
  });

  it("i valori fuori scala vengono tenuti dentro 0-100", () => {
    expect(clampValue(-10)).toBe(0);
    expect(clampValue(140)).toBe(100);
    expect(clampValue("72")).toBe(72);
  });

  it("i sei valori prendono l'ordine degli assi", () => {
    expect(valuesInOrder(SEI)).toEqual([80, 70, 75, 65, 85, 90]);
    expect(valuesInOrder(null)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("una sola etichetta per asse, fuori dal raggio e allineata", () => {
    for (const ruolo of [null, "CC", "P"]) {
      const posizioni = labelPositions(ruolo);
      expect(posizioni).toHaveLength(6);
      for (const posizione of posizioni) {
        expect(posizione.testo).toBeTruthy();
        expect(["start", "middle", "end"]).toContain(posizione.ancora);
        const distanza = Math.hypot(posizione.x - GEOMETRIA.cx, posizione.y - GEOMETRIA.cy);
        expect(distanza).toBeGreaterThan(GEOMETRIA.r);
      }
    }
  });

  it("il portiere vede la variante da portiere, gli altri quella base", () => {
    expect(labelPositions("P").map((p) => p.testo)).toEqual(["TUF", "PRE", "RIN", "RIF", "REA", "PIA"]);
    expect(labelPositions("CC").map((p) => p.testo)).toEqual(["VEL", "TIR", "PASS", "DRI", "DIF", "FIS"]);
    expect(labelPositions().map((p) => p.testo)).toEqual(["VEL", "TIR", "PASS", "DRI", "DIF", "FIS"]);
  });
});

describe("il mio overall", () => {
  it("usa gli stessi pesi del Worker, ruolo per ruolo", () => {
    for (const ruolo of ["P", "DC", "DL", "CC", "CL", "PC"]) {
      expect(pesiDi(ruolo)).toEqual(ROLE_WEIGHTS[ruolo]);
    }
  });

  it("coincide con il calcolo del Worker sugli stessi valori", () => {
    const valori = { vel_tuf: 80, tir_pre: 70, pass_rin: 75, dri_rif: 65, dif_rea: 85, fis_pia: 90 };
    for (const ruolo of ["P", "DC", "DL", "CC", "CL", "PC"]) {
      expect(myOverall(ruolo, SEI)).toBe(overallForRole(ruolo, valori));
    }
  });

  it("senza i miei sei valori non c'è overall", () => {
    expect(myOverall("CC", SEI)).not.toBeNull();
    expect(myOverall("CC", { ...SEI, fisPia: null })).toBeNull();
    expect(myOverall("CC", null)).toBeNull();
  });

  it("la mediana come nel Worker: centrale con numero dispari, media con numero pari", () => {
    expect(median([70, 90, 80])).toBe(80);
    expect(median([70, 90])).toBe(80);
    expect(median([])).toBeNull();
  });

  it("i campi partono dalla mediana, o da 50 se non c'è", () => {
    const senza = valoriIniziali({ velTuf: 80, tirPre: null } as any, null);
    expect(senza.velTuf).toBe(80);
    expect(senza.tirPre).toBe(50);
  });

  it("se ho già votato, i campi partono dal mio voto", () => {
    const iniziali = valoriIniziali({ velTuf: 80 } as any, { velTuf: 33, tirPre: 44 } as any);
    expect(iniziali.velTuf).toBe(33);
    expect(iniziali.tirPre).toBe(44);
  });

  it("legge una riga di /api/me/votes e la indicizza per giocatore", () => {
    const riga = { targetId: "salvio", velTuf: 80, tirPre: 70, passRin: 75, driRif: 65, difRea: 85, fisPia: 90 };
    const valori = valoriDaVoto(riga)! as SeiValori;
    expect(valori.driRif).toBe(65);
    expect(votiPerTarget([riga]).get("salvio")).toBe(riga);
    expect(votiPerTarget([riga]).has("antonio")).toBe(false);
  });
});

describe("numeri e date", () => {
  it("i numeri usano la virgola decimale", () => {
    expect(formatNumber(10.8, 1)).toBe("10,8");
    expect(formatNumber(86.35, 1)).toBe("86,4");
    expect(formatNumber(0, 1)).toBe("0,0");
    expect(formatOverall(null)).toBe("—");
    expect(formatOverall(85.3)).toBe("85,3");
  });

  it("un voto al singolare, due al plurale", () => {
    expect(formatVotes(1)).toBe("1 voto");
    expect(formatVotes(0)).toBe("0 voti");
    expect(formatVotes(12)).toBe("12 voti");
  });

  it("le date si leggono in italiano e non slittano di un giorno", () => {
    expect(formatDate("2026-09-10")).toBe("10 settembre 2026");
    expect(formatShortDate("2026-09-10")).toBe("10 set 2026");
    expect(formatDate("2026-01-01")).toBe("1 gennaio 2026");
    expect(formatDate("spazzatura")).toBe("—");
  });

  it("la bandiera c'è solo se il campo ha qualcosa", () => {
    expect(flagUrl(null)).toBe(null);
    expect(flagUrl("")).toBe(null);
    expect(flagUrl("  ")).toBe(null);
    expect(flagUrl("it")).toBe("/flags/it");
  });

  it("la freccia di forma ha un testo per gli screen reader", () => {
    expect(formaLabel("↑")).toBe("in crescita");
    expect(formaLabel("↓")).toBe("in forte calo");
    expect(formaLabel("→")).toBe("stabile");
  });

  it("i voti restano fra 1 e 99", () => {
    expect(clamp(0, 1, 99)).toBe(1);
    expect(clamp(120, 1, 99)).toBe(99);
    expect(stepValue(50, 1)).toBe(51);
    expect(stepValue(99, 1)).toBe(99);
    expect(stepValue(1, -1)).toBe(1);
  });
});

describe("elenco giocatori", () => {
  const GIOCATORI: GiocatoreElenco[] = [
    { id: "a", name: "Antonio", role: "CC", overall: 80 },
    { id: "b", name: "bernardo", role: "DL", overall: null },
    { id: "c", name: "Carlo", role: "CC", overall: 85 },
    { id: "d", name: "Davide", role: "P", overall: 80 },
  ];

  it("l'overall va dal più alto al più basso, chi non ha voti in fondo", () => {
    const ordine = sortPlayers(GIOCATORI, "overall-desc").map((g: any) => g.name);
    expect(ordine[0]).toBe("Carlo");
    expect(ordine[ordine.length - 1]).toBe("bernardo");
  });

  it("crescente e decrescente tengono i senza voti in fondo", () => {
    const crescente = sortPlayers(GIOCATORI, "overall-asc").map((g: any) => g.name);
    expect(crescente[crescente.length - 1]).toBe("bernardo");
    expect(crescente.slice(0, 2)).toEqual(["Antonio", "Davide"]);
  });

  it("per nome si ordina alfabeticamente", () => {
    expect(sortPlayers(GIOCATORI, "nome").map((g: any) => g.name)).toEqual(["Antonio", "bernardo", "Carlo", "Davide"]);
  });

  it("la ricerca ignora accenti e maiuscole", () => {
    expect(filterPlayers(GIOCATORI, { query: "BErn" }).map((g: any) => g.name)).toEqual(["bernardo"]);
    expect(filterPlayers(GIOCATORI, { query: "" })).toHaveLength(4);
  });

  it("il filtro per ruolo tiene solo quel ruolo", () => {
    expect(filterPlayers(GIOCATORI, { role: "CC" }).map((g: any) => g.name)).toEqual(["Antonio", "Carlo"]);
    expect(rolesOf(GIOCATORI)).toEqual(["CC", "DL", "P"]);
  });

  it("il filtro Da votare scarta chi ho già votato", () => {
    const votati = new Set(["a", "c"]);
    expect(filterPlayers(GIOCATORI, { votati } as any).map((g: any) => g.id)).toEqual(["b", "d"]);
  });

  it("il filtro Da votare non mostra mai chi ha fatto l'accesso", () => {
    const votati = new Set<string>();
    expect(filterPlayers(GIOCATORI, { votati, io: "a" } as any).map((g: any) => g.id)).toEqual(["b", "c", "d"]);
  });

  it("chi ho già votato resta escluso anche insieme a me stesso", () => {
    const votati = new Set(["c"]);
    expect(filterPlayers(GIOCATORI, { votati, io: "a" } as any).map((g: any) => g.id)).toEqual(["b", "d"]);
  });

  it("senza il filtro Da votare il proprio nome resta visibile", () => {
    expect(filterPlayers(GIOCATORI, { io: "a" } as any).map((g: any) => g.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterPlayers(GIOCATORI, {}).map((g: any) => g.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("in classifica ci sono solo chi ha giocato almeno una partita", () => {
    const righe = [
      { id: "a", played: 3 },
      { id: "b", played: 0 },
      { id: "c", played: 1 },
    ];
    expect(withAppearances(righe).map((r: any) => r.id)).toEqual(["a", "c"]);
  });
});

describe("partite", () => {
  const SQUADRE = [
    { team: "Squadra A", score: 7, players: [] },
    { team: "Squadra B", score: 6, players: [] },
  ];

  it("il risultato si legge Squadra A 7 – 6 Squadra B", () => {
    expect(matchHeadline(SQUADRE)).toBe("Squadra A 7 – 6 Squadra B");
    expect(matchHeadline([])).toBe("—");
  });

  it("in squadra prima i marcatori, poi a parità in ordine di nome", () => {
    const giocatori = [
      { name: "Zeno", goals: 1 },
      { name: "Ada", goals: 3 },
      { name: "Bruno", goals: 3 },
      { name: "Ciro", goals: 0 },
    ];
    expect(sortTeamPlayers(giocatori).map((g) => g.name)).toEqual(["Ada", "Bruno", "Zeno", "Ciro"]);
  });

  it("la Guidinha si mostra solo se c'è un giocatore", () => {
    expect(guidinhaLinea({ playerName: "Antonio", text: "  una frase  " })).toEqual({ nome: "Antonio", testo: "una frase" });
    expect(guidinhaLinea({ playerName: null, text: "qualcosa" })).toBe(null);
    expect(guidinhaLinea({ playerName: "Antonio", text: "" })).toEqual({ nome: "Antonio", testo: "" });
  });
});

describe("stato dopo l'accesso", () => {
  it("lo stato è aggiornato prima della navigazione", async () => {
    impostaCollegato(null);
    let collegatoAllaNavigazione: boolean | null = null;
    const ctx = {
      navigate: () => {
        collegatoAllaNavigazione = isCollegato();
      },
    };
    const fintoMe = { id: "a", name: "Antonio" };
    const destino = await completaAccesso(ctx as any, async () => fintoMe);
    expect(destino).toBe("/home");
    expect(collegatoAllaNavigazione).toBe(true);
    expect(utenteCollegato()).toEqual(fintoMe);
    impostaCollegato(null);
  });

  it("dopo l'accesso si torna alla pagina da cui si veniva", async () => {
    impostaCollegato(null);
    ricordaReturnTo("/giocatori/x?stagione=1");
    const visti: string[] = [];
    const destino = await completaAccesso({ navigate: (p: string) => visti.push(p) } as any, async () => ({ id: "a" }));
    expect(destino).toBe("/giocatori/x?stagione=1");
    expect(visti).toEqual(["/giocatori/x?stagione=1"]);
    expect(prendiReturnTo()).toBeNull();
    impostaCollegato(null);
  });

  it("uscire azzera subito lo stato", () => {
    impostaCollegato({ id: "a" } as any);
    expect(isCollegato()).toBe(true);
    impostaCollegato(null);
    expect(isCollegato()).toBe(false);
    expect(utenteCollegato()).toBeNull();
  });
});

describe("sessione scaduta", () => {
  it("il 401 del server vuol dire sessione scaduta, gli altri errori no", () => {
    expect(nonAutorizzato(new ApiError(401, "Accesso non consentito"))).toBe(true);
    expect(nonAutorizzato(new ApiError(400, "Richiesta non valida"))).toBe(false);
    expect(nonAutorizzato(new ApiError(403, "Richiesta non consentita"))).toBe(false);
    expect(nonAutorizzato(new ApiError(500, "Non riesco a caricare i dati"))).toBe(false);
    expect(nonAutorizzato(new Error("rete assente"))).toBe(false);
    expect(nonAutorizzato(null)).toBe(false);
  });
});

describe("tabella della classifica", () => {
  it("il rendimento diventa una riga di testo con la stella", () => {
    expect(testoRendimento(["V*", "V", "P", "S*", "V"])).toBe("V★ V P S★ V");
    expect(testoRendimento([])).toBe("");
    expect(testoRendimento(null)).toBe("");
  });

  it("l'asterisco segna l'MVP e si toglie dal testo", () => {
    expect(separaMvp("V*")).toEqual({ testo: "V", mvp: true });
    expect(separaMvp("S*")).toEqual({ testo: "S", mvp: true });
    expect(separaMvp("V")).toEqual({ testo: "V", mvp: false });
    expect(separaMvp("P")).toEqual({ testo: "P", mvp: false });
    expect(separaMvp("")).toEqual({ testo: "", mvp: false });
    expect(separaMvp(null)).toEqual({ testo: "", mvp: false });
  });
});

describe("etichette per ruolo", () => {
  it("il portiere usa la variante da portiere, gli altri quella base", () => {
    expect(etichettePerRuolo("P").map((e) => e.sigla)).toEqual(["TUF", "PRE", "RIN", "RIF", "REA", "PIA"]);
    for (const ruolo of ["DC", "DL", "CC", "CL", "PC"]) {
      expect(etichettePerRuolo(ruolo).map((e) => e.sigla)).toEqual(["VEL", "TIR", "PASS", "DRI", "DIF", "FIS"]);
    }
  });

  it("ogni sigla ha il suo significato dal glossario, mai inventato", () => {
    const significati = Object.fromEntries(etichettePerRuolo("CC").map((e) => [e.sigla, e.significato]));
    expect(significati).toEqual({
      VEL: "Velocità",
      TIR: "Tiro",
      PASS: "Passaggio",
      DRI: "DRI",
      DIF: "Difesa",
      FIS: "Fisico",
    });
    const portiere = Object.fromEntries(etichettePerRuolo("P").map((e) => [e.sigla, e.significato]));
    expect(portiere).toEqual({
      TUF: "Tuffo",
      PRE: "Presa",
      RIN: "Rinvio",
      RIF: "Riflessi",
      REA: "Reattività",
      PIA: "Piazzamento",
    });
  });

  it("l'overall per eccesso si mostra intero, o col trattino", () => {
    expect(formatOverallUp(86)).toBe("86");
    expect(formatOverallUp(0)).toBe("0");
    expect(formatOverallUp(null)).toBe("—");
    expect(formatOverallUp(undefined)).toBe("—");
  });
});