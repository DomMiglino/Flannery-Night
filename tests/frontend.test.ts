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
import { DESCRIZIONI_MOVIMENTO, DESCRIZIONI_PORTIERE, PESI, dettagliPerRuolo, etichettePerRuolo, myOverall, valoriDaVoto, valoriIniziali, median, vociRiferimento, votiPerTarget } from "../public/js/ratings.js";
import { clamp, flagUrl, formatDate, formatNumber, formatOverall, formatOverallUp, formatShortDate, formatVotes, formaLabel, stepValue } from "../public/js/format.js";
import { filterPlayers, rolesOf, separaPortieri, withAppearances } from "../public/js/lists.js";
import {
  ariaSort,
  memoriaOrdinamento,
  ordinaPerCriteri,
  ordinaRighe,
  prossimoStato,
  prossimoStatoTabella,
} from "../public/js/ordina.js";
import { etichetteGol, formatoPartita, guidinhaLinea, matchHeadline, sortTeamPlayers } from "../public/js/matches.js";
import { ApiError, nonAutorizzato } from "../public/js/api.js";
import { separaMvp } from "../public/js/ui.js";
import { fasciaOverall, hrefPremi, mostraNuovaStagione, mostraTastoPremi, soloStagioneAttiva, suggerisciNomeStagione, testoRendimento, troncaNome } from "../public/js/views/classifica.js";
import { testoDoppio, testoCella, colonnePortieri, colonneMovimento, INIZIALE_PORTIERI, INIZIALE_MOVIMENTO, tabelleGiocatori } from "../public/js/views/giocatori.js";
import { completaAccesso } from "../public/js/views/accesso.js";
import { etichettaAzioneRegistro, formatoDettaglioRegistro } from "../public/js/views/registro.js";
import { formatoOra, validaDatiGiocatore } from "../public/js/views/editor_giocatore.js";
import { azioneAccount, impostaCollegato, isCollegato, prendiReturnTo, ricordaReturnTo, utenteCollegato, vociMenu } from "../public/js/state.js";
import { PREMI, TITOLO_PAGINA, hrefClassifica, hrefContest, testoPremio } from "../public/js/views/contest.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("risolve creazione e modifica giocatore nella sezione Giocatori", () => {
    expect(resolveRoute("/giocatori/nuovo")).toMatchObject({ name: "giocatori", sotto: "nuovo" });
    expect(resolveRoute("/giocatori/fake-uno/modifica")).toMatchObject({ name: "giocatori", modificaId: "fake-uno" });
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

  it("i campi partono da 50 senza mio voto, mai dalla mediana", () => {
    const senza = valoriIniziali(null);
    expect(senza.velTuf).toBe(50);
    expect(senza.tirPre).toBe(50);
    expect(senza.passRin).toBe(50);
    expect(senza.driRif).toBe(50);
    expect(senza.difRea).toBe(50);
    expect(senza.fisPia).toBe(50);
    // Anche la vecchia chiamata a due argomenti ignora la mediana.
    const vecchia = valoriIniziali({ velTuf: 80, tirPre: null } as any, null);
    expect(vecchia.velTuf).toBe(50);
    expect(vecchia.tirPre).toBe(50);
  });

  it("se ho già votato, i campi partono dal mio voto", () => {
    const iniziali = valoriIniziali({ velTuf: 33, tirPre: 44 } as any);
    expect(iniziali.velTuf).toBe(33);
    expect(iniziali.tirPre).toBe(44);
    // Compatibilita' con la chiamata a due argomenti: il primo e' ignorato.
    const due = valoriIniziali({ velTuf: 80 } as any, { velTuf: 33, tirPre: 44 } as any);
    expect(due.velTuf).toBe(33);
    expect(due.tirPre).toBe(44);
  });

  it("le voci dei riferimenti hanno simbolo, testo per chi non vede, nome intero e punteggio intero", () => {
    const tre = vociRiferimento([
      { tipo: "basso", id: "a", nome: "Salvio", valore: 62 },
      { tipo: "medio", id: "b", nome: "Bruno", valore: 70 },
      { tipo: "alto", id: "c", nome: "Carlo", valore: 85 },
    ] as any);
    expect(tre.map((v: any) => v.simbolo)).toEqual(["↓", "→", "↑"]);
    expect(tre.map((v: any) => v.sr)).toEqual(["più basso", "medio", "più alto"]);
    expect(tre.map((v: any) => v.nome)).toEqual(["Salvio", "Bruno", "Carlo"]);
    expect(tre.map((v: any) => v.punteggio)).toEqual([62, 70, 85]);
    const unico = vociRiferimento([{ tipo: "unico", id: "a", nome: "Salvio Rossi", valore: 70 }] as any);
    expect(unico).toHaveLength(1);
    expect(unico[0].simbolo).toBe("");
    expect(unico[0].sr).toBe("");
    expect(unico[0].nome).toBe("Salvio Rossi");
    expect(vociRiferimento([])).toEqual([]);
    expect(vociRiferimento(null as any)).toEqual([]);
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

describe("form giocatore", () => {
  const bandiere = [{ filename: "Italia.png", name: "Italia" }];
  const dati = { name: "Giocatore", role: "CC", flag: "Italia.png", canLogin: true };

  it("valida nome, ruolo, bandiera e accesso senza DOM", () => {
    expect(validaDatiGiocatore(dati, bandiere)).toBeNull();
    expect(validaDatiGiocatore({ ...dati, name: " " }, bandiere)).toContain("da 1 a 40");
    expect(validaDatiGiocatore({ ...dati, name: "x".repeat(41) }, bandiere)).toContain("da 1 a 40");
    expect(validaDatiGiocatore({ ...dati, role: "XX" }, bandiere)).toContain("ruolo");
    expect(validaDatiGiocatore({ ...dati, flag: "altro.png" }, bandiere)).toContain("bandiera");
    expect(validaDatiGiocatore({ ...dati, flag: "" }, bandiere)).toContain("bandiera");
    expect(validaDatiGiocatore({ ...dati, canLogin: 1 }, bandiere)).toContain("accedere");
  });

  it("ammette una bandiera storica solo se invariata", () => {
    expect(validaDatiGiocatore({ ...dati, flag: "vecchia.svg" }, bandiere, "vecchia.svg")).toBeNull();
    expect(validaDatiGiocatore({ ...dati, flag: "altra.svg" }, bandiere, "vecchia.svg")).toContain("bandiera");
    expect(validaDatiGiocatore({ ...dati, flag: "" }, bandiere, null)).toBeNull();
  });

  it("formatta l'ora del blocco e nasconde date non valide", () => {
    expect(formatoOra("2026-10-05T12:34:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatoOra("non-valida")).toBe("");
    expect(formatoOra(null)).toBe("");
  });
});

describe("elenco giocatori", () => {
  const GIOCATORI: GiocatoreElenco[] = [
    { id: "a", name: "Antonio", role: "CC", overall: 80 },
    { id: "b", name: "bernardo", role: "DL", overall: null },
    { id: "c", name: "Carlo", role: "CC", overall: 85 },
    { id: "d", name: "Davide", role: "P", overall: 80 },
  ];

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

describe("due tabelle dei giocatori", () => {
  const ROSTER: Array<{ id: string; name: string; role: string; overall: number | null }> = [
    { id: "p-alto", name: "Amico", role: "P", overall: 85 },
    { id: "p-pari", name: "Dario", role: "P", overall: 85 },
    { id: "p-null", name: "Barto", role: "P", overall: null },
    { id: "p-basso", name: "Salvio", role: "P", overall: 80 },
    { id: "dc-a", name: "Antonio", role: "DC", overall: 80 },
    { id: "dl-b", name: "bernardo", role: "DL", overall: null },
    { id: "cc-anna", name: "anna", role: "CC", overall: 60 },
    { id: "cc-blu", name: "blu", role: "CC", overall: null },
    { id: "cc-eva", name: "Èva", role: "CC", overall: 70 },
    { id: "cl-e", name: "èlia", role: "CL", overall: 70 },
    { id: "pc-same-lo", name: "Same", role: "PC", overall: 55 },
    { id: "pc-same-hi", name: "Same", role: "PC", overall: 95 },
    { id: "pc-z", name: "Zeno", role: "PC", overall: 90 },
  ];

  it("ogni giocatore finisce nella sua tabella, mai in entrambe o in nessuna", () => {
    const { portieri, movimento } = separaPortieri(ROSTER);
    expect(portieri.map((g: any) => g.id)).toEqual(["p-alto", "p-pari", "p-null", "p-basso"]);
    expect(movimento.map((g: any) => g.id)).toEqual(["dc-a", "dl-b", "cc-anna", "cc-blu", "cc-eva", "cl-e", "pc-same-lo", "pc-same-hi", "pc-z"]);
    const inEntrambe = portieri.filter((p: any) => movimento.some((m: any) => m.id === p.id));
    const inNessuna = new Set(ROSTER.map((g) => g.id)).size !== portieri.length + movimento.length;
    expect(inEntrambe).toEqual([]);
    expect(inNessuna).toBe(false);
  });

  it("ruoli sconosciuti o mancanti vanno coi movimento", () => {
    const { portieri, movimento } = separaPortieri([{ id: "x", role: "" }, { id: "y" }, { id: "z", role: "P" }] as any);
    expect(portieri.map((g: any) => g.id)).toEqual(["z"]);
    expect(movimento.map((g: any) => g.id)).toEqual(["x", "y"]);
  });

  it("portieri: sigle da portiere, nessuna colonna Ruolo né sigle unite", () => {
    const etichette = colonnePortieri(false).map((c: any) => c.etichetta);
    expect(etichette).toEqual(["Giocatore", "Overall", "TUF", "PRE", "RIN", "RIF", "REA", "PIA"]);
    expect(etichette.some((e: string) => e.includes("/"))).toBe(false);
  });

  it("movimento: sigle base e colonna Ruolo, senza sigle unite", () => {
    const etichette = colonneMovimento(false).map((c: any) => c.etichetta);
    expect(etichette).toEqual(["Giocatore", "Ruolo", "Overall", "VEL", "TIR", "PASS", "DRI", "DIF", "FIS"]);
    expect(etichette.some((e: string) => e.includes("/"))).toBe(false);
  });

  it("nessuna colonna Mio in nessuno stato di accesso", () => {
    const tutte = [...colonnePortieri(false), ...colonnePortieri(true), ...colonneMovimento(false), ...colonneMovimento(true)];
    expect(tutte.some((c: any) => c.id === "mio" || c.etichetta === "Mio")).toBe(false);
  });

  it("ordine iniziale dei movimento: ruolo, poi nome (maiuscole e accenti), poi overall", () => {
    const { movimento } = tabelleGiocatori(ROSTER, {});
    expect(movimento.map((g: any) => g.id)).toEqual([
      "dc-a",
      "dl-b",
      "cc-anna", "cc-blu", "cc-eva",
      "cl-e",
      "pc-same-hi", "pc-same-lo", "pc-z",
    ]);
  });

  it("ordine iniziale dei portieri: overall decrescente, null in fondo, poi nome", () => {
    const { portieri } = tabelleGiocatori(ROSTER, {});
    expect(portieri.map((g: any) => g.id)).toEqual(["p-alto", "p-pari", "p-basso", "p-null"]);
  });

  it("nessun filtro: compaiono entrambe le tabelle", () => {
    const tabelle = tabelleGiocatori(ROSTER, {});
    expect(tabelle.mostraPortieri).toBe(true);
    expect(tabelle.mostraMovimento).toBe(true);
    expect(tabelle.nessuna).toBe(false);
  });

  it("filtro ruolo P: solo la tabella dei portieri", () => {
    const tabelle = tabelleGiocatori(ROSTER, { role: "P" });
    expect(tabelle.mostraPortieri).toBe(true);
    expect(tabelle.mostraMovimento).toBe(false);
    expect(tabelle.nessuna).toBe(false);
    expect(tabelle.movimento).toEqual([]);
  });

  it("filtro su un altro ruolo: solo la tabella dei movimento", () => {
    const tabelle = tabelleGiocatori(ROSTER, { role: "CC" });
    expect(tabelle.mostraPortieri).toBe(false);
    expect(tabelle.mostraMovimento).toBe(true);
    expect(tabelle.movimento.map((g: any) => g.id)).toEqual(["cc-anna", "cc-blu", "cc-eva"]);
  });

  it("una tabella vuota non compare; se sono vuote entrambe c'è la scritta", () => {
    const tabelle = tabelleGiocatori(ROSTER, { role: "XX" });
    expect(tabelle.mostraPortieri).toBe(false);
    expect(tabelle.mostraMovimento).toBe(false);
    expect(tabelle.nessuna).toBe(true);
    expect(tabelleGiocatori([], {}).nessuna).toBe(true);
  });

  it("il filtro da votare vale per entrambe le tabelle", () => {
    const votati = new Set(["dc-a"]);
    const tabelle = tabelleGiocatori(ROSTER, { votati, io: "p-basso" } as any);
    expect(tabelle.portieri.map((g: any) => g.id)).toEqual(["p-alto", "p-pari", "p-null"]);
    expect(tabelle.movimento.map((g: any) => g.id)).not.toContain("dc-a");
  });

  it("con una colonna attiva si ordina su quella colonna", () => {
    const tabelle = tabelleGiocatori(ROSTER, {}, { portieri: { id: "name", chiave: "name", direzione: "desc" } } as any);
    expect(tabelle.portieri.map((g: any) => g.id)).toEqual(["p-basso", "p-pari", "p-null", "p-alto"]);
  });

  it("cella numerica: senza accesso solo il valore, con accesso mediana / mio", () => {
    expect(testoCella("80", 84, false)).toBe("80");
    expect(testoCella("—", null, false)).toBe("—");
    expect(testoCella("80", 84, true)).toBe("80 / 84");
    expect(testoCella("86", null, true)).toBe("86 / —");
    expect(testoCella("—", null, true)).toBe("— / —");
    expect(testoCella("86", null, true, true)).toBe("86");
  });
});

describe("ordinamento delle tabelle", () => {
  const RIGHE = [
    { id: "a", name: "Carlo", powerScore: 10.5, mvpWeight: 1, overall: 80 },
    { id: "b", name: "bernardo", powerScore: null, mvpWeight: 0, overall: null },
    { id: "c", name: "Antonio", powerScore: 12, mvpWeight: 0.5, overall: 85 },
    { id: "d", name: "Davide", powerScore: 10.5, mvpWeight: 2, overall: 80 },
  ];
  const UFFICIALI: Array<{ chiave: string; direzione: "asc" | "desc" }> = [
    { chiave: "powerScore", direzione: "desc" },
    { chiave: "mvpWeight", direzione: "desc" },
    { chiave: "name", direzione: "asc" },
  ];

  it("decrescente e crescente sui numeri esatti", () => {
    expect(ordinaRighe(RIGHE, { chiave: "powerScore", direzione: "desc" }).map((r: any) => r.id)).toEqual(["c", "a", "d", "b"]);
    expect(ordinaRighe(RIGHE, { chiave: "powerScore", direzione: "asc" }).map((r: any) => r.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("i null vanno sempre in fondo, in entrambe le direzioni", () => {
    const giu = ordinaRighe(RIGHE, { chiave: "overall", direzione: "desc" }).map((r: any) => r.id);
    const su = ordinaRighe(RIGHE, { chiave: "overall", direzione: "asc" }).map((r: any) => r.id);
    expect(giu[giu.length - 1]).toBe("b");
    expect(su[su.length - 1]).toBe("b");
    expect(su.slice(0, 2)).toEqual(["a", "d"]);
  });

  it("spareggio ufficiale: Power, poi somma MVP, poi nome", () => {
    const ordine = ordinaRighe(RIGHE, { chiave: "powerScore", direzione: "desc", spareggi: [...UFFICIALI] }).map((r: any) => r.id);
    expect(ordine).toEqual(["c", "d", "a", "b"]);
  });

  it("i nomi si confrontano ignorando maiuscole e accenti", () => {
    const nomi = [{ name: "zecchino" }, { name: "Amaro" }, { name: "èlia" }];
    expect(ordinaRighe(nomi, { chiave: "name", direzione: "asc" }).map((r: any) => r.name)).toEqual(["Amaro", "èlia", "zecchino"]);
  });

  it("stabile: a pari valori resta l'ordine di partenza", () => {
    const pari = [{ id: "x", v: 1 }, { id: "y", v: 1 }, { id: "z", v: 1 }];
    expect(ordinaRighe(pari, { chiave: "v", direzione: "desc" }).map((r: any) => r.id)).toEqual(["x", "y", "z"]);
  });

  it("non muta l'originale e accetta chiavi funzione", () => {
    const ruoli = [{ role: "CC" }, { role: "P" }, { role: "DL" }];
    const ordine = ["P", "DC", "DL", "CC", "CL", "PC"];
    const copia = ruoli.map((r) => ({ ...r }));
    const risultato = ordinaRighe(ruoli, { chiave: (r: any) => ordine.indexOf(r.role), direzione: "asc" });
    expect(risultato.map((r: any) => r.role)).toEqual(["P", "DL", "CC"]);
    expect(ruoli).toEqual(copia);
  });

  it("tocchi: iniziale, inversa, di nuovo iniziale", () => {
    const colonna = { id: "gol", chiave: "goals", iniziale: "desc" as const };
    const primo: any = prossimoStato(null, colonna);
    expect(primo).toEqual({ id: "gol", chiave: "goals", direzione: "desc" });
    const secondo: any = prossimoStato(primo, colonna);
    expect(secondo.direzione).toBe("asc");
    expect(prossimoStato(secondo, colonna)).toEqual(primo);
    const altra = { id: "nome", chiave: "name", iniziale: "asc" as const };
    expect(prossimoStato(secondo, altra)).toEqual({ id: "nome", chiave: "name", direzione: "asc" });
  });

  it("tocchi della tabella: colonna, inversa, ritorno all'ordine iniziale (null)", () => {
    const colonna = { id: "overall", chiave: "overall" as const, iniziale: "desc" as const };
    const primo: any = prossimoStatoTabella(null, colonna);
    expect(primo).toEqual({ id: "overall", chiave: "overall", direzione: "desc" });
    const secondo: any = prossimoStatoTabella(primo, colonna);
    expect(secondo.direzione).toBe("asc");
    expect(prossimoStatoTabella(secondo, colonna)).toBeNull();
    expect(prossimoStatoTabella(null, colonna)).toEqual(primo);
  });

  it("cambiare colonna ricomincia il giro", () => {
    const prima = { id: "overall", chiave: "overall" as const, iniziale: "desc" as const };
    const attiva: any = prossimoStatoTabella(null, prima);
    const altra = { id: "nome", chiave: "name" as const, iniziale: "asc" as const };
    expect(prossimoStatoTabella(attiva, altra)).toEqual({ id: "nome", chiave: "name", direzione: "asc" });
  });

  it("ordinaPerCriteri applica l'ordine iniziale dei movimento (ruolo, nome, overall)", () => {
    const righe = [
      { id: "a", role: "DC", name: "Antonio", overall: 70 },
      { id: "b", role: "PC", name: "Zeno", overall: null },
      { id: "c", role: "DC", name: "Adele", overall: 90 },
    ];
    const ordine = ordinaPerCriteri(righe, INIZIALE_MOVIMENTO as any).map((r: any) => r.id);
    expect(ordine).toEqual(["c", "a", "b"]);
    expect(INIZIALE_PORTIERI.map((c: any) => c.chiave)).toEqual(["overall", "name"]);
  });

  it("la memoria di ordinamento accetta anche lo stato null iniziale", () => {
    const vuota = memoriaOrdinamento("prova-null", "/giocatori", null);
    expect(vuota.ordinamento).toBeNull();
    vuota.ordinamento = { id: "nome", chiave: "name", direzione: "asc" };
    expect(memoriaOrdinamento("prova-null", "/giocatori", null).ordinamento.id).toBe("nome");
    expect(memoriaOrdinamento("prova-null", "/altra", null).ordinamento).toBeNull();
  });

  it("aria-sort: none sulle altre, corretto sull'attiva", () => {
    expect(ariaSort(false, "desc")).toBe("none");
    expect(ariaSort(true, "desc")).toBe("descending");
    expect(ariaSort(true, "asc")).toBe("ascending");
  });

  it("la memoria resta sulla stagione e si azzera rientrando", () => {
    const iniziale = { id: "power", chiave: "powerScore", direzione: "desc" as const };
    const prima = memoriaOrdinamento("prova", "/classifica", iniziale);
    prima.ordinamento = { id: "gol", chiave: "goals", direzione: "asc" };
    expect(memoriaOrdinamento("prova", "/classifica", iniziale).ordinamento.id).toBe("gol");
    expect(memoriaOrdinamento("prova", "/giocatori", iniziale).ordinamento).toEqual(iniziale);
    expect(memoriaOrdinamento("altra", "/classifica", iniziale).ordinamento).toEqual(iniziale);
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

  it("gol e autogol a zero non mostrano niente", () => {
    expect(etichetteGol(0, 0)).toEqual([]);
    expect(etichetteGol(null, undefined)).toEqual([]);
  });

  it("gol in pill piena con etichetta al singolare e plurale", () => {
    expect(etichetteGol(1, 0)).toEqual([{ testo: "1", etichetta: "1 gol", autogol: false }]);
    expect(etichetteGol(3, 0)).toEqual([{ testo: "3", etichetta: "3 gol", autogol: false }]);
  });

  it("autogol con il meno davanti e aspetto diverso", () => {
    expect(etichetteGol(0, 1)).toEqual([{ testo: "-1", etichetta: "1 autogol", autogol: true }]);
    expect(etichetteGol(0, 2)).toEqual([{ testo: "-2", etichetta: "2 autogol", autogol: true }]);
  });

  it("gol e autogol insieme mostrano entrambe le pill", () => {
    expect(etichetteGol(2, 1)).toEqual([
      { testo: "2", etichetta: "2 gol", autogol: false },
      { testo: "-1", etichetta: "1 autogol", autogol: true },
    ]);
  });

  it("formato dal numero di giocatori, solo a squadre pari", () => {
    const cinque = (n: string) => ({ team: n, players: [1, 2, 3, 4, 5] });
    expect(formatoPartita([cinque("A"), cinque("B")])).toBe("5v5");
    const otto = (n: string) => ({ team: n, players: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(formatoPartita([otto("A"), otto("B")])).toBe("8v8");
    expect(formatoPartita([cinque("A"), otto("B")])).toBe(null);
    expect(formatoPartita([cinque("A")])).toBe(null);
    expect(formatoPartita([])).toBe(null);
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
  it("fascia oro da 81, argento da 70 a 80, bronzo sotto, niente senza voti", () => {
    expect(fasciaOverall(95)).toBe("oro");
    expect(fasciaOverall(81)).toBe("oro");
    expect(fasciaOverall(80)).toBe("argento");
    expect(fasciaOverall(79)).toBe("argento");
    expect(fasciaOverall(70)).toBe("argento");
    expect(fasciaOverall(69)).toBe("bronzo");
    expect(fasciaOverall(0)).toBe("bronzo");
    expect(fasciaOverall(null)).toBe(null);
    expect(fasciaOverall(undefined)).toBe(null);
  });

  it("nomi oltre 9 lettere troncati con due puntini", () => {
    expect(troncaNome("AntonioPortiere")).toBe("AntonioPo..");
    expect(troncaNome("Bartolomeo")).toBe("Bartolome..");
    expect(troncaNome("Alessandr")).toBe("Alessandr");
    expect(troncaNome("Ann")).toBe("Ann");
    expect(troncaNome("")).toBe("");
  });

  it("cella doppia mediana/mio: trattini se non assegnato", () => {
    expect(testoDoppio("80", 84)).toBe("80 / 84");
    expect(testoDoppio("79,5", 80)).toBe("79,5 / 80");
    expect(testoDoppio("—", null)).toBe("— / —");
    expect(testoDoppio("86", null)).toBe("86 / —");
    expect(testoDoppio("86", undefined)).toBe("86 / —");
  });

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

  it("il tasto Nuova stagione si vede solo per chi gestisce", () => {
    expect(mostraNuovaStagione({ id: "antonio", isAdmin: true })).toBe(true);
    expect(mostraNuovaStagione({ id: "fake", isAdmin: false })).toBe(false);
    expect(mostraNuovaStagione({ id: "fake" })).toBe(false);
    expect(mostraNuovaStagione({ isAdmin: true, name: "Antonio" })).toBe(true);
    expect(mostraNuovaStagione(null)).toBe(false);
    expect(mostraNuovaStagione(undefined)).toBe(false);
  });

  it("il permesso si legge dallo stato nel momento del disegno, mai da una copia", () => {
    impostaCollegato({ id: "antonio", isAdmin: true } as any);
    expect(mostraNuovaStagione(utenteCollegato())).toBe(true);
    impostaCollegato({ id: "antonio", isAdmin: false } as any);
    expect(mostraNuovaStagione(utenteCollegato())).toBe(false);
    impostaCollegato(null);
    expect(mostraNuovaStagione(utenteCollegato())).toBe(false);
  });

  it("il tasto Nuova stagione esiste solo sulla stagione attiva", () => {
    expect(soloStagioneAttiva(2, 2)).toBe(true);
    expect(soloStagioneAttiva("2", "2")).toBe(true);
    expect(soloStagioneAttiva(3, 2)).toBe(false);
    expect(soloStagioneAttiva(null, 2)).toBe(false);
    expect(soloStagioneAttiva(2, null)).toBe(false);
    expect(soloStagioneAttiva(undefined, undefined)).toBe(false);
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
    const nomeDri = "Dri" + "bbling";
    const significati = Object.fromEntries(etichettePerRuolo("CC").map((e) => [e.sigla, e.significato]));
    expect(significati).toEqual({
      VEL: "Velocità",
      TIR: "Tiro",
      PASS: "Passaggi",
      DRI: nomeDri,
      DIF: "Difesa",
      FIS: "Fisico",
    });
    const portiere = Object.fromEntries(etichettePerRuolo("P").map((e) => [e.sigla, e.significato]));
    expect(portiere).toEqual({
      TUF: "Tuffo",
      PRE: "Presa",
      RIN: "Rinvio",
      RIF: "Riflessi",
      REA: "Reazione",
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

describe("icona e menu dell'account", () => {
  it("non collegato: l'icona porta all'accesso; collegato: apre il menu", () => {
    expect(azioneAccount(false)).toBe("accesso");
    expect(azioneAccount(true)).toBe("menu");
  });

  it("collegato: menu con Cambia PIN ed Esci, senza Accedi", () => {
    expect(vociMenu(true)).toEqual([
      { id: "voce-cambia", visibile: true },
      { id: "voce-accedi", visibile: false },
      { id: "voce-esci", visibile: true },
    ]);
  });

  it("admin collegato: vede Registro ed Esporta dati", () => {
    expect(vociMenu(true, true)).toEqual([
      { id: "voce-cambia", visibile: true },
      { id: "voce-registro", visibile: true },
      { id: "voce-exporta", visibile: true },
      { id: "voce-accedi", visibile: false },
      { id: "voce-esci", visibile: true },
    ]);
  });

  it("non collegato: nessuna voce di menu per chi è dentro", () => {
    expect(vociMenu(false)).toEqual([
      { id: "voce-cambia", visibile: false },
      { id: "voce-accedi", visibile: true },
      { id: "voce-esci", visibile: false },
    ]);
  });

  it("ospite e collegato senza permesso: nessuna voce di gestione", () => {
    const ids = (voci: any[]) => new Set(voci.map((v) => v.id));
    expect(ids(vociMenu(false)).has("voce-registro")).toBe(false);
    expect(ids(vociMenu(false)).has("voce-exporta")).toBe(false);
    expect(ids(vociMenu(true, false)).has("voce-registro")).toBe(false);
    expect(ids(vociMenu(true, false)).has("voce-exporta")).toBe(false);
    expect(ids(vociMenu(true, true)).has("voce-registro")).toBe(true);
    expect(ids(vociMenu(true, true)).has("voce-exporta")).toBe(true);
  });

  it("nella pagina statica non esistono le voci di gestione", () => {
    const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/voce-registro/);
    expect(html).not.toMatch(/voce-exporta/);
  });

  it("hidden nasconde davvero, anche dove l'autore imposta display", () => {
    // Regressione punto B: .menu-voce { display: flex } vinceva sul
    // display:none di [hidden] e "Accedi" restava visibile nel menu.
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  });
});

describe("registro", () => {
  it("il dettaglio vuoto o null non produce testo né riquadri", () => {
    expect(formatoDettaglioRegistro(null)).toBe("");
    expect(formatoDettaglioRegistro(undefined)).toBe("");
    expect(formatoDettaglioRegistro("")).toBe("");
    expect(formatoDettaglioRegistro("   ")).toBe("");
    expect(formatoDettaglioRegistro("{}")).toBe("");
  });

  it("il dettaglio con coppie si legge chiave: valore", () => {
    expect(formatoDettaglioRegistro("chiusa=2025/26; nuova=2026/27; partite=3")).toBe(
      "chiusa: 2025/26 · nuova: 2026/27 · partite: 3",
    );
    expect(formatoDettaglioRegistro('{"target":"a","n":2}')).toBe("target: a · n: 2");
  });

  it("azione vuota o sconosciuta ha sempre un'etichetta leggibile", () => {
    expect(etichettaAzioneRegistro("match_create")).toBe("Creata partita");
    expect(etichettaAzioneRegistro("azione_mai_vista")).toBe("azione_mai_vista");
    expect(etichettaAzioneRegistro("")).not.toBe("");
    expect(etichettaAzioneRegistro(null)).not.toBe("");
    expect(etichettaAzioneRegistro("  ")).not.toBe("");
  });
});

describe("pagina contest", () => {
  it("/contest è pubblico, anche senza accesso", () => {
    expect(resolveRoute("/contest", { authed: false }).name).toBe("contest");
    expect(resolveRoute("/contest", { authed: true }).name).toBe("contest");
    expect(resolveRoute("/contest/", { authed: false }).name).toBe("contest");
    expect(resolveRoute("/contest", { authed: false, search: "?stagione=2" }).season).toBe(2);
  });

  it("i percorsi esistenti restano come prima", () => {
    expect(resolveRoute("/classifica").name).toBe("classifica");
    expect(resolveRoute("/accesso").name).toBe("accesso");
    expect(resolveRoute("/home", { authed: false }).redirect).toBe("/accesso");
    expect(resolveRoute("/home", { authed: true }).name).toBe("home");
  });

  it("su /contest la barra resta a quattro voci e resta accesa Classifica", () => {
    expect(navItems(false)).toHaveLength(4);
    expect(navItems(true)).toHaveLength(4);
    expect(navItems(false).some((v) => v.href === "/contest")).toBe(false);
    expect(navItems(true).some((v) => v.href === "/contest")).toBe(false);
    expect(activeNav("contest")).toBe("classifica");
    expect(needsSeason("contest")).toBe(false);
  });

  it("gli indirizzi del contest tengono la stagione", () => {
    expect(hrefContest(2)).toBe("/contest?stagione=2");
    expect(hrefContest(null)).toBe("/contest");
    expect(hrefClassifica(3)).toBe("/classifica?stagione=3");
    expect(hrefClassifica(null)).toBe("/classifica");
    expect(hrefPremi(2)).toBe("/contest?stagione=2");
    expect(hrefPremi(null)).toBe("/contest");
  });
});

describe("tasto Premi della stagione", () => {
  it("si vede per ospite, collegato e chi gestisce, anche con classifica vuota", () => {
    expect(mostraTastoPremi(null, [])).toBe(true);
    expect(mostraTastoPremi(null, null)).toBe(true);
    expect(mostraTastoPremi({ id: "a", isAdmin: false }, [])).toBe(true);
    expect(mostraTastoPremi({ id: "a", isAdmin: false }, [{ id: "x" }])).toBe(true);
    expect(mostraTastoPremi({ id: "a", isAdmin: true }, [])).toBe(true);
    expect(mostraTastoPremi({ id: "a", isAdmin: true }, [{ id: "x" }])).toBe(true);
  });
});

describe("titolo ed emoji del contest", () => {
  const SIMBOLI = ["🏆", "🍺", "🥇", "🥈", "🥉", "👕", "🍔", "📅", "⚽", "🏅", "📸", "⬅"];

  it("il nuovo titolo c'è, il vecchio no", () => {
    const sorgente = readFileSync(new URL("../public/js/views/contest.js", import.meta.url), "utf8");
    expect(sorgente).toContain("Premi Flannery");
    expect(sorgente).not.toContain("Il contest del Flannery Pub");
    expect(TITOLO_PAGINA).toBe("Premi Flannery");
  });

  it("i tre premi hanno etichetta 1°/2°/3° e il testo noto senza simboli", () => {
    expect(PREMI.map((p) => p.posto)).toEqual(["1° classificato", "2° classificato", "3° classificato"]);
    expect(testoPremio(PREMI[0])).toBe(
      "T-shirt celebrativa con nome personalizzato e le firme di tutti i partecipanti; panino e birra da 1 litro.",
    );
    expect(testoPremio(PREMI[1])).toBe("T-shirt Guinness; panino e birra da mezzo litro.");
    expect(testoPremio(PREMI[2])).toBe("panino e birra da mezzo litro.");
    for (const premio of PREMI) {
      for (const simbolo of SIMBOLI) {
        expect(testoPremio(premio)).not.toContain(simbolo);
        expect(premio.posto).not.toContain(simbolo);
      }
    }
  });

  it("ogni simbolo grafico sta in una chiamata voceIcona con aria-hidden", () => {
    const sorgente = readFileSync(new URL("../public/js/views/contest.js", import.meta.url), "utf8");
    for (const simbolo of SIMBOLI) expect(sorgente).toContain(simbolo);
    expect(sorgente).toMatch(/function voceIcona[\s\S]*?aria-hidden/);
    const senzaVoci = sorgente.replace(/voceIcona\(".*?"\)/g, "");
    for (const simbolo of SIMBOLI) expect(senzaVoci).not.toContain(simbolo);
  });

  it("i testi noti restano nella pagina", () => {
    const sorgente = readFileSync(new URL("../public/js/views/contest.js", import.meta.url), "utf8");
    expect(sorgente).toContain("luglio 2027");
    expect(sorgente).toContain("30 presenze");
    expect(sorgente).toContain("Torna alla Classifica");
    expect(sorgente).toContain("Segui il Flannery Pub su Instagram");
  });
});

describe("stile del contest", () => {
  it("[hidden] resta e riduci movimento ferma tutto", () => {
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
    expect(css).toMatch(/prefers-reduced-motion\s*:\s*reduce/);
    expect(css).toContain("contest-entrata");
  });
});

describe("collegamento Instagram", () => {
  function raccogliFile(cartella: string): string[] {
    const lista: string[] = [];
    const coda: string[] = [cartella];
    while (coda.length > 0) {
      const dir = coda.pop() as string;
      for (const voce of readdirSync(dir)) {
        const pieno = join(dir, voce as string);
        if (statSync(pieno).isDirectory()) coda.push(pieno);
        else lista.push(pieno);
      }
    }
    return lista;
  }

  it("una sola occorrenza in public/, solo in contest.js, con rel sicura", () => {
    const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
    const files = raccogliFile(publicDir);
    const conMarca: string[] = [];
    let totale = 0;
    for (const f of files) {
      const testo = readFileSync(f, "utf8").toLowerCase();
      const parti = testo.split("instagram.com");
      const conta = parti.length - 1;
      if (conta > 0) {
        totale += conta;
        conMarca.push(f);
      }
    }
    expect(totale).toBe(1);
    expect(conMarca).toHaveLength(1);
    expect(conMarca[0].replace(/\\/g, "/")).toMatch(/views\/contest\.js$/);
    const sorgente = readFileSync(conMarca[0], "utf8");
    expect(sorgente).toContain("https://www.instagram.com/flannerypub/?hl=it");
    expect(sorgente).toContain("noopener noreferrer");
    expect(sorgente).toContain("_blank");
  });
});

describe("nomi e descrizioni per chi vota", () => {
  it("sei voci per il gruppo movimento e sei per i portieri, nome e frase non vuoti", () => {
    expect(DESCRIZIONI_MOVIMENTO).toHaveLength(6);
    expect(DESCRIZIONI_PORTIERE).toHaveLength(6);
    for (const gruppo of [dettagliPerRuolo("CC"), dettagliPerRuolo("P")]) {
      expect(gruppo).toHaveLength(6);
      for (const voce of gruppo) {
        expect(voce.nome.trim().length).toBeGreaterThan(0);
        expect(voce.descrizione.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("i nomi sono quelli attesi nell'ordine", () => {
    const nomeDri = "Dri" + "bbling";
    expect(dettagliPerRuolo("CC").map((v) => v.nome)).toEqual([
      "Velocità",
      "Tiro",
      "Passaggi",
      nomeDri,
      "Difesa",
      "Fisico",
    ]);
    expect(dettagliPerRuolo("P").map((v) => v.nome)).toEqual([
      "Tuffo",
      "Presa",
      "Rinvio",
      "Riflessi",
      "Reazione",
      "Piazzamento",
    ]);
  });

  it("ogni frase è lunga al massimo 130 caratteri", () => {
    for (const frase of [...DESCRIZIONI_MOVIMENTO, ...DESCRIZIONI_PORTIERE]) {
      expect(frase.length).toBeLessThanOrEqual(130);
    }
  });

  it("la sigla resta quella di etichettePerRuolo per P e per un ruolo di movimento", () => {
    for (const ruolo of ["CC", "P"]) {
      const attese = etichettePerRuolo(ruolo).map((e) => e.sigla);
      expect(dettagliPerRuolo(ruolo).map((v) => v.sigla)).toEqual(attese);
    }
    expect(dettagliPerRuolo("CC").map((v) => v.sigla)).toEqual(["VEL", "TIR", "PASS", "DRI", "DIF", "FIS"]);
    expect(dettagliPerRuolo("P").map((v) => v.sigla)).toEqual(["TUF", "PRE", "RIN", "RIF", "REA", "PIA"]);
  });
});

describe("guardie sul modulo delle descrizioni", () => {
  it("parole non volute assenti, una sola occorrenza del nome concesso", () => {
    const sorgente = readFileSync(new URL("../public/js/ratings.js", import.meta.url), "utf8").toLowerCase();
    const nomeConcesso = "dri" + "bbling";
    const vietati = [
      "leg" + "acy",
      "ass" + "ist",
      "tiri in " + "porta",
      "passaggi " + "chiave",
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
    for (const parola of vietati) {
      expect(sorgente).not.toContain(parola);
    }
    const conta = sorgente.split(nomeConcesso).length - 1;
    expect(conta).toBe(1);
  });

  it("[hidden] resta e il testo solo per chi non vede non usa display none", () => {
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
    const inizio = css.indexOf(".solo-lettori");
    expect(inizio).toBeGreaterThan(-1);
    const blocco = css.slice(inizio, css.indexOf("}", inizio));
    expect(blocco).not.toMatch(/display\s*:\s*none/);
  });
});