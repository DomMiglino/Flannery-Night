// Stemmi dei giocatori: elenco generato, stemmaPer, campo API e infoStemma.
// Solo dati inventati, nessun dato reale.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STEMMI } from "../src/stemmi_list";
import { stemmaPer } from "../src/stemmi";
import { scegliStemmi, testoStemmi } from "../scripts/genera-bandiere.mjs";
import { infoStemma } from "../public/js/ratings.js";
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

function stemmiAttesi(): string[] {
  const dir = join(process.cwd(), "public", "stemmi");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => {
      try {
        if (!statSync(join(dir, f)).isFile()) return false;
      } catch {
        return false;
      }
      if (!f.endsWith(".png")) return false;
      if (f !== f.toLowerCase()) return false;
      if (/\s/.test(f)) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}

describe("elenco generato", () => {
  it("src/stemmi_list.ts coincide con i .png in public/stemmi/, Esegui npm run flags", () => {
    expect([...STEMMI], "Esegui npm run flags").toEqual(stemmiAttesi());
  });

  it("ordine alfabetico", () => {
    const ordinati = [...STEMMI].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    expect([...STEMMI]).toEqual(ordinati);
  });

  it("scarta non .png, maiuscole e spazi; tiene gli id con trattino", () => {
    expect(scegliStemmi(["b.png", "A.png", "nota.txt", "c.PNG", "con spazio.png", "id-abc123.png"])).toEqual([
      "b.png",
      "id-abc123.png",
    ]);
    expect(testoStemmi(["b.png", "a.png"])).toBe(testoStemmi(["a.png", "b.png"]));
  });
});

describe("stemmaPer", () => {
  it("id esatto -> file, gli altri -> null", () => {
    expect(stemmaPer("salvio", ["salvio.png"])).toBe("salvio.png");
    expect(stemmaPer("mimmo", ["salvio.png"])).toBeNull();
  });

  it("id con trattino e niente match parziali o maiuscole", () => {
    expect(stemmaPer("id-abc123", ["id-abc123.png"])).toBe("id-abc123.png");
    expect(stemmaPer("salv", ["salvio.png"])).toBeNull();
    expect(stemmaPer("salvio2", ["salvio.png"])).toBeNull();
    expect(stemmaPer("SALVIO", ["salvio.png"])).toBeNull();
    expect(stemmaPer("", ["salvio.png"])).toBeNull();
  });
});

describe("campo stemma via API", () => {
  it("GET /api/players/:id include stemma senza cambiare gli altri campi", async () => {
    const res = await s.call("/api/players/antonio");
    expect(res.status).toBe(200);
    expect("stemma" in res.body).toBe(true);
    expect(res.body.id).toBe("antonio");
    expect(res.body.name).toBe("Fake Antonio");
    expect(res.body.role).toBe("CC");
  });

  it("senza file lo stemma è null, con file è il nome", async () => {
    const senza = await s.call("/api/players/antonio");
    expect(senza.body.stemma).toBeNull();
    await s.db
      .prepare("INSERT INTO players (id, name, role, flag, active, can_login, is_admin) VALUES ('fabio', 'Fake Fabio', 'CC', NULL, 1, 0, 0)")
      .run();
    const con = await s.call("/api/players/fabio");
    expect(con.status).toBe(200);
    expect(con.body.stemma).toBe("fabio.png");
  });

  it("GET /api/me resta con i soli campi id, name, role, isAdmin", async () => {
    const cookie = await asPlayer("antonio", PIN.antonio);
    const res = await s.call("/api/me", { cookie });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["id", "isAdmin", "name", "role"]);
  });

  it("elenco /api/players e classifica senza stemma", async () => {
    const elenco = await s.call("/api/players");
    expect(elenco.status).toBe(200);
    for (const g of elenco.body.players) expect("stemma" in g).toBe(false);
    const classifica = await s.call("/api/ranking");
    expect(classifica.status).toBe(200);
    for (const r of classifica.body.rows) expect("stemma" in r).toBe(false);
  });
});

describe("infoStemma nel browser", () => {
  it("con stemma dà src e alt con nome e ruolo", () => {
    expect(infoStemma({ name: "Fabio", role: "DC", stemma: "fabio.png" })).toEqual({
      src: "/stemmi/fabio.png",
      alt: "Stemma di Fabio, ruolo DC",
    });
  });

  it("src codificato e null senza stemma", () => {
    expect(infoStemma({ name: "A", role: "CC", stemma: "id-abc123.png" })?.src).toBe("/stemmi/id-abc123.png");
    expect(infoStemma({ name: "A", role: "CC", stemma: null })).toBeNull();
    expect(infoStemma({ name: "A", role: "CC", stemma: "" })).toBeNull();
    expect(infoStemma({ name: "A", role: "CC" })).toBeNull();
  });

  it("nei file toccati niente stili inline né innerHTML", () => {
    for (const p of ["../public/js/ui.js", "../public/js/views/home.js", "../public/js/views/scheda.js", "../public/js/ratings.js"]) {
      const src = readFileSync(new URL(p, import.meta.url), "utf8");
      expect(src).not.toContain("innerHTML");
      expect(src).not.toMatch(/style\s*=/);
    }
  });
});

describe("guardie su sorgente e stile", () => {
  it("parole non volute assenti nei file toccati", () => {
    const percorsi = [
      "../scripts/genera-bandiere.mjs",
      "../src/stemmi.ts",
      "../src/stemmi_list.ts",
      "../src/routes/routes_data.ts",
      "../public/js/ui.js",
      "../public/js/views/home.js",
      "../public/js/views/scheda.js",
      "../public/styles.css",
      "../docs/BANDIERE.md",
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
      const src = readFileSync(new URL(p, import.meta.url), "utf8").toLowerCase();
      for (const parola of vietati) expect(src, p).not.toContain(parola);
    }
  });

  it("[hidden] resta e lo stemma ha misure in CSS", () => {
    const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
    expect(css).toContain(".riassunto-stemma-home");
    expect(css).toContain(".riassunto-stemma-scheda");
    expect(css).toContain("max-width: 240px");
    expect(css).toContain("max-width: 280px");
  });
});
