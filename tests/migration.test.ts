import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndBuild } from "../migration/build.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const season = JSON.parse(readFileSync(join(dir, "season.json"), "utf-8"));
const access = JSON.parse(readFileSync(join(dir, "access.json"), "utf-8"));
const votes = JSON.parse(readFileSync(join(dir, "votes.json"), "utf-8"));
const NOW = "2026-10-02T00:00:00.000Z";

describe("migrazione: riepilogo e SQL (solo dati inventati)", () => {
  it("conteggi e casi speciali", () => {
    const { summary } = validateAndBuild(season, access, votes, NOW);
    expect(summary.players).toBe(10);
    expect(summary.matches).toBe(2);
    // 4 righe con 1 duplicato -> 3 voti unici.
    expect(summary.voteRowsIn).toBe(4);
    expect(summary.votes).toBe(3);
    expect(summary.duplicateVotes).toBe(1);
    // Una riga di credenziali per giocatore, vuota se manca.
    expect(summary.credentials).toBe(10);
    expect(summary.credentialsWithPin).toBe(2);
    // Senza nationUrl: solo fake-due.
    expect(summary.noNation.map((p: any) => p.id).sort()).toEqual(["fake-due"]);
    // Guidinha da completare: critica di fake-m1.
    expect(summary.guidinhaToComplete).toHaveLength(1);
    expect(summary.guidinhaToComplete[0]).toMatchObject({ matchId: "fake-m1", playerId: "antonio" });
    // Admin: id esatto antonio si', antonioportiere no.
    expect(summary.admins).toEqual(["antonio"]);
  });

  it("SQL: stagione, published, MVP, Guidinha, credenziali, dedup voti", () => {
    const { sql } = validateAndBuild(season, access, votes, NOW);
    expect(sql).toContain("2026/27");
    expect(sql).toContain("'published'");
    // mvpA/mvpB diventano mvp=1 sui giocatori corrispondenti.
    expect(sql).toContain("fake-m1', 'antonio', 'A', 2, 0, 1");
    expect(sql).toContain("fake-m1', 'fake-due', 'B', 0, 1, 1");
    // Non-MVP a 0.
    expect(sql).toContain("fake-m1', 'fake-uno', 'A', 1, 0, 0");
    // critica -> guidinha con testo vuoto, dopo le righe.
    const iMatch = sql.indexOf("INSERT INTO matches");
    const iMp = sql.indexOf("INSERT INTO match_players");
    const iGuid = sql.indexOf("guidinha_player_id='antonio'");
    expect(iMatch).toBeGreaterThanOrEqual(0);
    expect(iMp).toBeGreaterThan(iMatch);
    expect(iGuid).toBeGreaterThan(iMp);
    expect(sql).toContain("guidinha_text=''");
    // Credenziali copiate cosi' come sono, hash_version=1; riga vuota se manca.
    expect(sql).toContain("hash_version");
    expect(sql).toContain("fake-salt-a");
    // fake-tre non e' in access: riga vuota.
    expect(sql).toContain("('fake-tre', '', '', '', 1, 0, 0,");
    // Voti: duplicato risolto con updated_at piu' recente (11, non 10).
    expect(sql).toContain("'antonio', 'fake-uno', 11, 21, 31, 41, 51, 61,");
    expect(sql).not.toContain("'antonio', 'fake-uno', 10, 20, 30, 40, 50, 60,");
  });

  it("SQL: scarta i campi vecchi", () => {
    const { sql } = validateAndBuild(season, access, votes, NOW);
    for (const banned of ["fake-sync-da-scartare", "nota da scartare", "advancedTracked", "shotsOnTarget"]) {
      expect(sql).not.toContain(banned);
    }
  });

  it("bloccante: id orfano in partita", () => {
    const bad = structuredClone(season);
    bad.matches[0].teamA.push({ playerId: "inesistente", goals: 0, ownGoals: 0 });
    expect(() => validateAndBuild(bad, access, votes, NOW)).toThrow(/orfano/i);
  });

  it("bloccante: voto fuori 1..99", () => {
    const badVotes = structuredClone(votes);
    badVotes.push({ voterId: "antonio", targetId: "fake-due", velTuf: 0, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50, updatedAt: NOW });
    expect(() => validateAndBuild(season, access, badVotes, NOW)).toThrow(/1\.\.99/);
  });

  it("bloccante: autovoto", () => {
    const badVotes = structuredClone(votes);
    badVotes.push({ voterId: "antonio", targetId: "antonio", velTuf: 50, tirPre: 50, passRin: 50, driRif: 50, difRea: 50, fisPia: 50, updatedAt: NOW });
    expect(() => validateAndBuild(season, access, badVotes, NOW)).toThrow(/autovoto/i);
  });

  it("bloccante: squadre di dimensioni diverse", () => {
    const bad = structuredClone(season);
    bad.matches[0].teamB.pop();
    expect(() => validateAndBuild(bad, access, votes, NOW)).toThrow(/dimensioni diverse/);
  });

  it("bloccante: squadre diverse da 5, 6 o 8 per lato", () => {
    const bad = structuredClone(season);
    bad.matches[0].teamA = bad.matches[0].teamA.slice(0, 4);
    bad.matches[0].teamB = bad.matches[0].teamB.slice(0, 4);
    expect(() => validateAndBuild(bad, access, votes, NOW)).toThrow(/5, 6 o 8/);
  });

  it("bloccante: MVP non in squadra", () => {
    const bad = structuredClone(season);
    bad.matches[0].mvpA = "fake-otto";
    expect(() => validateAndBuild(bad, access, votes, NOW)).toThrow(/non in squadra/);
  });

  it("bloccante: Guidinha che non ha giocato", () => {
    const bad = structuredClone(season);
    bad.matches[1].critica = "antonio";
    bad.matches[1].teamA = bad.matches[1].teamA.filter((e: any) => e.playerId !== "antonio");
    bad.matches[1].teamB = bad.matches[1].teamB.filter((e: any) => e.playerId !== "antonio");
    expect(() => validateAndBuild(bad, access, votes, NOW)).toThrow(/non ha giocato/);
  });
});
