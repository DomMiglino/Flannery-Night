// PASSO 3: rotte pubbliche di lettura. Controllo anche che fuori dal
// server non escano mai salt, hash o voti singoli.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startServer, type TestServer } from "./helpers/server";

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

const PUBLIC_PATHS = ["/api/seasons", "/api/ranking", "/api/players", "/api/players/antonio", "/api/matches"];

describe("stagioni", () => {
  it("elenca le stagioni e segnala quella attiva", async () => {
    const res = await s.call("/api/seasons");
    expect(res.status).toBe(200);
    expect(res.body.seasons).toEqual([
      { id: 1, name: "2026/27", isActive: true },
      { id: 2, name: "2099/00", isActive: false },
    ]);
    expect(res.body.activeId).toBe(1);
  });
});

describe("classifica", () => {
  it("usa la stagione attiva e segue l'ordine di calcolo", async () => {
    const res = await s.call("/api/ranking");
    expect(res.status).toBe(200);
    expect(res.body.season.id).toBe(1);
    const rows = res.body.rows as Array<{ id: string; powerScore: number; played: number; guidinha: number; mvpWeight: number; overallUp: number | null }>;
    expect(rows.length).toBeGreaterThan(5);
    // In classifica compaiono solo giocatori con presenze nella stagione.
    expect(rows.map((r) => r.id)).not.toContain("fake-esterno");
    expect(rows.every((r) => r.played > 0)).toBe(true);
    for (const r of rows) {
      expect(typeof r.mvpWeight).toBe("number");
    }
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].powerScore).toBeGreaterThanOrEqual(rows[i].powerScore);
      if (rows[i - 1].powerScore === rows[i].powerScore) {
        expect(rows[i - 1].mvpWeight).toBeGreaterThanOrEqual(rows[i].mvpWeight);
      }
    }
    const antonio = rows.find((r) => r.id === "antonio")!;
    expect(antonio.played).toBe(2);
    expect(antonio.guidinha).toBe(1);
    for (const r of rows) {
      expect(r.overallUp === null || Number.isInteger(r.overallUp)).toBe(true);
    }
    expect(Object.keys(antonio).sort()).toEqual(
      [
        "V",
        "P",
        "S",
        "avgGoals",
        "avgPoints",
        "flag",
        "formaArrow",
        "formaScore",
        "goals",
        "guidinha",
        "id",
        "mvp",
        "mvpWeight",
        "name",
        "overallUp",
        "ownGoals",
        "played",
        "points",
        "powerScore",
        "rendimento",
        "role",
        "role2",
        "stemma",
      ].sort(),
    );
  });

  it("punti e medie arrivano dal server, coerenti con V/P/S e giocate", async () => {
    const res = await s.call("/api/ranking");
    expect(res.status).toBe(200);
    const rows = res.body.rows as Array<{
      id: string;
      played: number;
      V: number;
      P: number;
      goals: number;
      points: number;
      avgPoints: number | null;
      avgGoals: number | null;
    }>;
    for (const r of rows) {
      // Punti: 3 per vinta, 1 per pareggiata. Il browser non ricalcola.
      expect(r.points).toBe(3 * r.V + r.P);
      if (r.played > 0) {
        expect(r.avgPoints).not.toBeNull();
        expect(r.avgGoals).not.toBeNull();
        expect(Math.abs(r.avgPoints! * r.played - r.points)).toBeLessThan(0.06);
        expect(Math.abs(r.avgGoals! * r.played - r.goals)).toBeLessThan(0.06);
      } else {
        expect(r.avgPoints).toBeNull();
        expect(r.avgGoals).toBeNull();
      }
    }
    const antonio = rows.find((r) => r.id === "antonio")!;
    expect(antonio.points).toBe(3 * antonio.V + antonio.P);
  });

  it("season= sceglie la stagione", async () => {
    const res = await s.call("/api/ranking?season=2");
    // Stagione senza partite: nessuno ha presenze da mostrare in classifica.
    expect(res.body.rows).toEqual([]);
    const byName = await s.call("/api/ranking?season=2026/27");
    expect(byName.body.rows.length).toBeGreaterThan(5);
    expect(byName.body.rows.some((r: { played: number }) => r.played > 0)).toBe(true);
  });
});

describe("giocatori", () => {
  it("elenco con mediane, numero di voti e overall", async () => {
    const res = await s.call("/api/players");
    expect(res.status).toBe(200);
    const rows = res.body.players as Array<{ id: string; votes: number; overall: number | null; velTuf: number | null }>;
    const uno = rows.find((r) => r.id === "fake-uno")!;
    expect(uno.votes).toBe(1);
    expect(uno.velTuf).toBe(11);
    const esterno = rows.find((r) => r.id === "fake-esterno")!;
    expect(esterno.votes).toBe(1);
    const withOverall = rows.filter((r) => r.overall !== null);
    for (let i = 1; i < withOverall.length; i++) {
      expect(withOverall[i - 1].overall!).toBeGreaterThanOrEqual(withOverall[i].overall!);
    }
    // L'overall per eccesso arriva dal server ed è coerente con l'overall:
    // o il ceiling diretto, o uno in più quando l'overall a un decimale
    // ha nascosto i centesimi (es. 85,04 -> 85,0 -> 86).
    const rowsUp = res.body.players as Array<{ overall: number | null; overallUp: number | null }>;
    for (const r of rowsUp) {
      if (r.overall === null) {
        expect(r.overallUp).toBeNull();
      } else {
        expect([Math.ceil(r.overall), Math.ceil(r.overall) + 1]).toContain(r.overallUp);
        expect(Number.isInteger(r.overallUp)).toBe(true);
      }
    }
  });

  it("scheda di un giocatore: statistiche di stagione e ultime partite", async () => {
    const res = await s.call("/api/players/antonio");
    expect(res.status).toBe(200);
    expect(res.body.season.id).toBe(1);
    expect(res.body.stats).toMatchObject({ played: 2, goals: 2, mvp: 1, guidinha: 1 });
    expect(res.body.last5).toHaveLength(2);
    expect(res.body.last5[0].date).toBe("2026-09-10");
    expect(res.body.last5[1].outcome).toBe("V");
    expect(res.body.last5[1].label).toBe("V*");
    expect((await s.call("/api/players/fake-inesistente")).status).toBe(404);
  });
});

describe("partite", () => {
  it("pubblicate, dalla piu' recente, con squadre e Guidinha", async () => {
    const res = await s.call("/api/matches");
    expect(res.status).toBe(200);
    const matches = res.body.matches as Array<Record<string, any>>;
    expect(matches).toHaveLength(2);
    expect(matches[0].date).toBe("2026-09-10");
    expect(matches[0].guidinha.text).toBe("");
    const first = matches[1];
    expect(first.guidinha.playerId).toBe("antonio");
    expect(first.guidinha.playerName).toBe("Fake Antonio");
    expect(first.teams[0].players).toHaveLength(5);
    expect(first.teams[0].players[0]).toMatchObject({ id: "antonio", goals: 2, mvp: true });
    expect(first.result).toBe("A 4 - B 1");
    // Solo published: nessuna bozza.
    const other = await s.call("/api/matches?season=2");
    expect(other.body.matches).toEqual([]);
  });

  it("il risultato conta gli autogol avversari", async () => {
    const res = await s.call("/api/matches");
    const first = res.body.matches[1];
    // Squadra A: 3 gol + l'autogol di fake-due (squadra B) = 4. Squadra B: 1 gol = 1.
    expect(first.teams.map((t: { score: number }) => t.score)).toEqual([4, 1]);
    expect(first.teams.map((t: { outcome: string }) => t.outcome)).toEqual(["V", "S"]);
  });
});

describe("nessun segreto nelle risposte pubbliche", () => {
  it("niente salt, hash, PIN o voti singoli", async () => {
    const creds = await s.db
      .prepare("SELECT salt, pin_hash FROM credentials WHERE salt <> '' OR pin_hash <> ''")
      .all<{ salt: string; pin_hash: string }>();
    const secrets = creds.results.flatMap((c) => [c.salt, c.pin_hash]).filter(Boolean);
    // Anche i valori dei fixture, che non sono segreti veri ma non devono uscire.
    secrets.push("fake-salt-a", "fake-salt-u", "fake-salt-v1", "fake-hash-a", "fake-hash-u");

    for (const path of PUBLIC_PATHS) {
      const res = await s.call(path);
      expect(res.status).toBe(200);
      for (const value of secrets) {
        expect(res.text).not.toContain(value);
      }
      expect(res.text).not.toMatch(/pin_hash|pinHash|"salt"/);
      expect(res.text).not.toContain("voterId");
    }
  });
});