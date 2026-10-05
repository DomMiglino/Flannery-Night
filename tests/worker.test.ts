// Passo 4: risposte del Worker. Le intestazioni di sicurezza devono
// arrivare anche sugli asset e sugli errori, e il percorso riservato
// continua a non mostrare nulla.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../src/http";
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

describe("intestazioni di sicurezza", () => {
  it("la CSP vieta script e stili esterni e i riquadri", () => {
    const csp = SECURITY_HEADERS["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("ci sono anche nosniff e la politica sul referrer", () => {
    expect(SECURITY_HEADERS["x-content-type-options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("intestazioni sulle risposte vere", () => {
  it("ogni risposta dell'API porta CSP, nosniff e referrer", async () => {
    for (const path of ["/api/players", "/api/seasons", "/api/me", "/api/players/non-esiste"]) {
      const res = await s.call(path);
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp, `manca la CSP su ${path}`).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    }
  });

  it("anche la risposta di login porta le intestazioni e conserva il cookie", async () => {
    const res = await s.call("/api/auth/login", { method: "POST", body: { playerId: "antonio", pin: "123456" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    const cookie = res.cookies.find((c) => c.startsWith("fn_session="));
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });
});

describe("rotte senza dati", () => {
  it("un giocatore inesistente dà 404 con messaggio generico", async () => {
    const res = await s.call("/api/players/non-esiste");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Giocatore non trovato" });
  });

  it("una stagione inesistente dà 404 anche in classifica e partite", async () => {
    expect((await s.call("/api/ranking?season=9999")).status).toBe(404);
    expect((await s.call("/api/matches?season=9999")).status).toBe(404);
    expect((await s.call("/api/players/antonio?season=9999")).status).toBe(404);
  });

  it("le stagioni elencano quella attiva", async () => {
    const res = await s.call("/api/seasons");
    expect(res.status).toBe(200);
    const attiva = res.body.seasons.find((s2: { isActive: boolean }) => s2.isActive);
    expect(attiva.name).toBe("2026/27");
    expect(res.body.activeId).toBe(attiva.id);
  });

  it("senza accesso le rotte private rispondono 401", async () => {
    for (const path of ["/api/me", "/api/me/votes"]) {
      expect((await s.call(path)).status).toBe(401);
    }
    const voto = await s.call("/api/votes/antonio", { method: "PUT", body: {} });
    expect(voto.status).toBe(401);
  });
});