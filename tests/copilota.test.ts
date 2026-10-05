// Blocco 5a: parti pure della gestione (percorsi e anteprima del risultato).

import { describe, expect, it } from "vitest";
import { PERCORSO_GESTIONE, resolveRoute } from "../public/js/routes.js";
import { anteprimaPunteggio } from "../public/js/views/copilota.js";

describe("percorso della gestione", () => {
  it("il valore predefinito non contiene la parola vietata", () => {
    expect(PERCORSO_GESTIONE).toBe("/copilota");
    expect(PERCORSO_GESTIONE.toLowerCase()).not.toContain("admin");
  });

  it("senza accesso rimanda all'accesso, con accesso apre la sezione Partite", () => {
    expect(resolveRoute("/copilota", { authed: false }).redirect).toBe("/accesso");
    expect(resolveRoute("/copilota", { authed: true }).name).toBe("copilota");
  });

  it("il percorso resta configurabile dal Worker", () => {
    expect(resolveRoute("/gestione", { authed: true, gestione: "/gestione" }).name).toBe("copilota");
    expect(resolveRoute("/copilota", { authed: true, gestione: "/gestione" }).redirect).toBe("/home");
  });

  it("la gestione non sta nella barra e non usa il selettore di stagione", async () => {
    const { activeNav, needsSeason } = await import("../public/js/routes.js");
    expect(activeNav("copilota")).toBeNull();
    expect(needsSeason("copilota")).toBe(false);
  });
});

describe("anteprima non ufficiale nell'editor", () => {
  it("gol propri più autogol avversari", () => {
    const a = [
      { goals: 2, ownGoals: 0 },
      { goals: 1, ownGoals: 0 },
    ];
    const b = [{ goals: 1, ownGoals: 1 }];
    // A: 3 gol + 1 autogol di B = 4; B: 1 gol + 0 = 1.
    expect(anteprimaPunteggio(a, b)).toEqual({ a: 4, b: 1, testo: "A 4 – 1 B" });
  });

  it("a zero da entrambi i lati", () => {
    expect(anteprimaPunteggio([], [])).toEqual({ a: 0, b: 0, testo: "A 0 – 0 B" });
  });
});
