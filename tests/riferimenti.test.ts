// Riferimenti di ruolo per il blocco di voto.
// Valori a mano per la parte pura, forma della risposta via API,
// voci del browser e guardie su sorgente e stile.
// Solo dati inventati, nessun dato reale.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildReferences, pickReferences, truncateScore } from "../src/calc";
import { valoriIniziali, vociRiferimento } from "../public/js/ratings.js";
import { readFileSync } from "node:fs";
import { PIN, sessionCookie, startServer, type TestServer } from "./helpers/server";

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

async function asPlayer(playerId: string, pin: string): Promise<string> {
  const res = await s.call("/api/auth/login", { method: "POST", body: { playerId, pin } });
  expect(res.status).toBe(200);
  return `fn_session=${sessionCookie(res)}`;
}

function senzaCommenti(testo: string): string {
  return testo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("troncamento in aritmetica intera", () => {
  it("70,9 -> 70, 70,0 -> 70, 0,9 -> 0, 99,9 -> 99", () => {
    expect(truncateScore(70.9)).toBe(70);
    expect(truncateScore(70.0)).toBe(70);
    expect(truncateScore(0.9)).toBe(0);
    expect(truncateScore(99.9)).toBe(99);
    expect(truncateScore(85.0)).toBe(85);
    expect(truncateScore(1)).toBe(1);
  });
});

describe("scelta dei riferimenti da mediane note", () => {
  const ruolo = "CC";
  function elencoQuattro() {
    return [
      { id: "t", nome: "Target", ruolo, mediane: [50, 50, 50, 50, 50, 50] },
      { id: "a", nome: "Anna", ruolo, mediane: [60, 60, 60, 60, 60, 60] },
      { id: "b", nome: "Bruno", ruolo, mediane: [70.9, 70.9, 70.9, 70.9, 70.9, 70.9] },
      { id: "c", nome: "Carlo", ruolo, mediane: [80.2, 80.2, 80.2, 80.2, 80.2, 80.2] },
      { id: "d", nome: "Dario", ruolo, mediane: [85.0, 85.0, 85.0, 85.0, 85.0, 85.0] },
    ];
  }

  it("quattro candidati: basso, medio con indice floor((n-1)/2), alto", () => {
    const righe = buildReferences("t", ruolo, elencoQuattro());
    expect(righe).toHaveLength(6);
    // n = 5 con il target incluso, medio in posizione 2: il terzo in ordine.
    for (const riga of righe) {
      expect(riga.map((r) => r.tipo)).toEqual(["basso", "medio", "alto"]);
      expect(riga.map((r) => r.nome)).toEqual(["Target", "Bruno", "Dario"]);
      expect(riga.map((r) => r.valore)).toEqual([50, 70, 85]);
    }
  });

  it("n = 3: basso, centrale, alto", () => {
    const elenco = [
      { id: "t", nome: "Target", ruolo, mediane: [10, 10, 10, 10, 10, 10] },
      { id: "a", nome: "Anna", ruolo, mediane: [60, 60, 60, 60, 60, 60] },
      { id: "b", nome: "Bruno", ruolo, mediane: [70, 70, 70, 70, 70, 70] },
      { id: "c", nome: "Carlo", ruolo, mediane: [80, 80, 80, 80, 80, 80] },
    ];
    const righe = buildReferences("t", ruolo, elenco);
    for (const riga of righe) {
      expect(riga.map((r) => r.tipo)).toEqual(["basso", "medio", "alto"]);
      expect(riga.map((r) => r.nome)).toEqual(["Target", "Anna", "Carlo"]);
    }
  });

  it("n = 2: solo basso e alto", () => {
    const riga = pickReferences([
      { id: "a", nome: "Anna", valore: 60 },
      { id: "b", nome: "Bruno", valore: 80 },
    ]);
    expect(riga.map((r) => r.tipo)).toEqual(["basso", "alto"]);
    expect(riga.map((r) => r.nome)).toEqual(["Anna", "Bruno"]);
  });

  it("n = 1: un solo unico", () => {
    const riga = pickReferences([{ id: "a", nome: "Anna", valore: 70.9 }]);
    expect(riga).toHaveLength(1);
    expect(riga[0].tipo).toBe("unico");
    expect(riga[0].nome).toBe("Anna");
    expect(riga[0].valore).toBe(70);
  });

  it("n = 0: array vuoto", () => {
    expect(pickReferences([])).toEqual([]);
    const righe = buildReferences("t", ruolo, [{ id: "t", nome: "Target", ruolo, mediane: [50, 50, 50, 50, 50, 50] }]);
    for (const riga of righe) {
      expect(riga).toHaveLength(1);
      expect(riga[0].tipo).toBe("unico");
      expect(riga[0].id).toBe("t");
    }
  });

  it("il richiesto è incluso", () => {
    const righe = buildReferences("t", ruolo, elencoQuattro());
    for (const riga of righe) {
      expect(riga.map((r) => r.id)).toContain("t");
    }
  });

  it("a parita' di valore conta il nome", () => {
    const riga = pickReferences([
      { id: "z", nome: "Zeno", valore: 70 },
      { id: "a", nome: "anna", valore: 70 },
      { id: "m", nome: "Marco", valore: 70 },
    ]);
    expect(riga.map((r) => r.nome)).toEqual(["anna", "Marco", "Zeno"]);
    expect(riga.map((r) => r.tipo)).toEqual(["basso", "medio", "alto"]);
  });

  it("solo stesso ruolo: portieri distinti dagli altri", () => {
    const elenco = [
      { id: "t", nome: "Target", ruolo: "CC", mediane: [50, 50, 50, 50, 50, 50] },
      { id: "p1", nome: "Pietro", ruolo: "P", mediane: [90, 90, 90, 90, 90, 90] },
      { id: "c1", nome: "Carlo", ruolo: "CC", mediane: [60, 60, 60, 60, 60, 60] },
    ];
    const righe = buildReferences("t", "CC", elenco);
    for (const riga of righe) {
      expect(riga.map((r) => r.id)).toEqual(["t", "c1"]);
    }
    const righeP = buildReferences("p1", "P", [
      { id: "p1", nome: "Pietro", ruolo: "P", mediane: [90, 90, 90, 90, 90, 90] },
      { id: "c1", nome: "Carlo", ruolo: "CC", mediane: [60, 60, 60, 60, 60, 60] },
    ]);
    for (const riga of righeP) {
      expect(riga).toHaveLength(1);
      expect(riga[0].id).toBe("p1");
      expect(riga[0].tipo).toBe("unico");
    }
  });

  it("senza voti non entra: mediana null scartata", () => {
    const elenco = [
      { id: "t", nome: "Target", ruolo, mediane: [50, 50, 50, 50, 50, 50] },
      { id: "a", nome: "Anna", ruolo, mediane: [null, 60, null, 60, null, 60] },
      { id: "b", nome: "Bruno", ruolo, mediane: [70, null, 70, null, 70, null] },
    ];
    const righe = buildReferences("t", ruolo, elenco);
    // Attributo 0: Target + Bruno; attributo 1: Target + Anna.
    expect(righe[0].map((r) => r.id)).toEqual(["t", "b"]);
    expect(righe[0].map((r) => r.tipo)).toEqual(["basso", "alto"]);
    expect(righe[1].map((r) => r.id)).toEqual(["t", "a"]);
    expect(righe[1].map((r) => r.tipo)).toEqual(["basso", "alto"]);
  });
});

describe("voci del browser dai riferimenti", () => {
  it("tre voci con simbolo, testo per chi non vede, nome e punteggio", () => {
    const voci = vociRiferimento([
      { tipo: "basso", id: "a", nome: "Salvio", valore: 62 },
      { tipo: "medio", id: "b", nome: "Bruno", valore: 70 },
      { tipo: "alto", id: "c", nome: "Carlo", valore: 85 },
    ] as any);
    expect(voci.map((v: any) => v.simbolo)).toEqual(["↓", "→", "↑"]);
    expect(voci.map((v: any) => v.sr)).toEqual(["più basso", "medio", "più alto"]);
    expect(voci.map((v: any) => v.nome)).toEqual(["Salvio", "Bruno", "Carlo"]);
    expect(voci.map((v: any) => v.punteggio)).toEqual([62, 70, 85]);
  });

  it("due voci, una voce unica senza simbolo, vuoto senza voci", () => {
    const due = vociRiferimento([
      { tipo: "basso", id: "a", nome: "Anna", valore: 60 },
      { tipo: "alto", id: "b", nome: "Zeno", valore: 80 },
    ] as any);
    expect(due.map((v: any) => v.simbolo)).toEqual(["↓", "↑"]);
    expect(due.map((v: any) => v.sr)).toEqual(["più basso", "più alto"]);
    const unico = vociRiferimento([{ tipo: "unico", id: "a", nome: "Salvio Rossi", valore: 70 }] as any);
    expect(unico).toHaveLength(1);
    expect(unico[0].simbolo).toBe("");
    expect(unico[0].sr).toBe("");
    expect(unico[0].nome).toBe("Salvio Rossi");
    expect(vociRiferimento([])).toEqual([]);
  });

  it("il campo parte dal mio voto o da 50, mai dalla mediana", () => {
    expect(valoriIniziali(null).velTuf).toBe(50);
    expect(valoriIniziali({ velTuf: 33 } as any).velTuf).toBe(33);
    const vecchia = valoriIniziali({ velTuf: 80 } as any, null);
    expect(vecchia.velTuf).toBe(50);
  });
});

describe("guardie su sorgente e stile", () => {
  it("nel blocco di voto non compare la parola mediana", () => {
    const scheda = readFileSync(new URL("../public/js/views/scheda.js", import.meta.url), "utf8");
    const pulita = senzaCommenti(scheda);
    const inizio = pulita.indexOf("function renderVotazione");
    expect(inizio).toBeGreaterThan(-1);
    const blocco = pulita.slice(inizio).toLowerCase();
    expect(blocco).not.toContain("mediana");
    expect(blocco).not.toContain("voto-mediana");
    const ratings = readFileSync(new URL("../public/js/ratings.js", import.meta.url), "utf8");
    const ratingsPuliti = senzaCommenti(ratings).toLowerCase();
    expect(ratingsPuliti).not.toContain("mediana");
    expect(ratingsPuliti).not.toContain("voto-mediana");
  });

  it("[hidden] nasconde davvero", () => {
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
    expect(css).not.toContain("voto-mediana");
  });

  it("nel blocco di voto restano solo freccia, nome e punteggio", () => {
    const scheda = readFileSync(new URL("../public/js/views/scheda.js", import.meta.url), "utf8");
    const pulita = senzaCommenti(scheda);
    const inizio = pulita.indexOf("function renderVotazione");
    expect(inizio).toBeGreaterThan(-1);
    const blocco = pulita.slice(inizio);
    expect(blocco).not.toContain("Più basso");
    expect(blocco).not.toContain("Più alto");
    expect(blocco).not.toContain("Medio");
    expect(blocco).toContain("solo-lettori");
    expect(blocco).toContain("aria-hidden");
    expect(blocco).toContain("title");
    const ratings = readFileSync(new URL("../public/js/ratings.js", import.meta.url), "utf8");
    expect(ratings).toContain("più basso");
    expect(ratings).toContain("più alto");
  });
});

describe("risposta della scheda via API", () => {
  it("ospite senza riferimenti, collegato con riferimenti", async () => {
    const ospite = await s.call("/api/players/fake-cinque");
    expect(ospite.status).toBe(200);
    expect("riferimenti" in ospite.body).toBe(false);
    const cookie = await asPlayer("antonio", PIN.antonio);
    const collegato = await s.call("/api/players/fake-cinque", { cookie });
    expect(collegato.status).toBe(200);
    expect(Array.isArray(collegato.body.riferimenti)).toBe(true);
    expect(collegato.body.riferimenti).toHaveLength(6);
  });

  it("ogni voce ha solo tipo, id, nome e valore intero", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/players/fake-cinque", { cookie });
    expect(res.status).toBe(200);
    for (const riga of res.body.riferimenti) {
      expect(Array.isArray(riga)).toBe(true);
      for (const voce of riga) {
        expect(Object.keys(voce).sort()).toEqual(["id", "nome", "tipo", "valore"]);
        expect(["basso", "medio", "alto", "unico"]).toContain(voce.tipo);
        expect(Number.isInteger(voce.valore)).toBe(true);
      }
    }
    // Niente voti singoli e niente campi extra nella stringa.
    expect(res.text).not.toContain("voter_id");
    expect(res.text).not.toContain("voterId");
    expect(res.text).not.toContain("pin_hash");
    expect(res.text).not.toContain("salt");
  });

  it("fake-cinque senza voti vede solo antonio e fake-esterno", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/players/fake-cinque", { cookie });
    expect(res.status).toBe(200);
    for (const riga of res.body.riferimenti) {
      const ids = riga.map((v: { id: string }) => v.id).sort();
      expect(ids).toEqual(["antonio", "fake-esterno"]);
      expect(ids).not.toContain("fake-cinque");
      const tipi = riga.map((v: { tipo: string }) => v.tipo).sort();
      expect(tipi).toEqual(["alto", "basso"]);
    }
    const prima = res.body.riferimenti[0];
    expect(prima.find((v: any) => v.tipo === "basso").nome).toBe("Fake Antonio");
    expect(prima.find((v: any) => v.tipo === "basso").valore).toBe(50);
    expect(prima.find((v: any) => v.tipo === "alto").valore).toBe(70);
  });

  it("antonio vede se stesso e fake-esterno", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/players/antonio", { cookie });
    expect(res.status).toBe(200);
    for (const riga of res.body.riferimenti) {
      const ids = riga.map((v: { id: string }) => v.id).sort();
      expect(ids).toEqual(["antonio", "fake-esterno"]);
      const tipi = riga.map((v: { tipo: string }) => v.tipo).sort();
      expect(tipi).toEqual(["alto", "basso"]);
    }
  });

  it("senza altri dello stesso ruolo le liste restano vuote", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/players/antonioportiere", { cookie });
    expect(res.status).toBe(200);
    expect(res.body.riferimenti).toHaveLength(6);
    for (const riga of res.body.riferimenti) expect(riga).toEqual([]);
  });

  it("stessa risposta con stagioni diverse", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const prima = await s.call("/api/players/fake-cinque?season=1", { cookie });
    const seconda = await s.call("/api/players/fake-cinque?season=2", { cookie });
    expect(prima.status).toBe(200);
    expect(seconda.status).toBe(200);
    expect(seconda.body.riferimenti).toEqual(prima.body.riferimenti);
  });

  it("dopo Salva voto i riferimenti includono il votato", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const prima = await s.call("/api/players/fake-cinque", { cookie });
    const voto = await s.call("/api/votes/fake-cinque", {
      method: "PUT",
      cookie,
      body: { velTuf: 40, tirPre: 41, passRin: 42, driRif: 43, difRea: 44, fisPia: 45 },
    });
    expect(voto.status).toBe(200);
    const dopo = await s.call("/api/players/fake-cinque", { cookie });
    // Il votato ora ha una mediana e compare nei suoi stessi riferimenti come "basso".
    expect(dopo.body.riferimenti).not.toEqual(prima.body.riferimenti);
    for (const riga of dopo.body.riferimenti) {
      const ids = riga.map((v: { id: string }) => v.id);
      expect(ids).toContain("fake-cinque");
      expect(riga.find((v: any) => v.id === "fake-cinque").tipo).toBe("basso");
    }
  });
});
