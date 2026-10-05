// Strumenti di gestione dentro Partite: percorsi, anteprima e avvisi.
// Funzioni pure, senza DOM.

import { describe, expect, it } from "vitest";
import { activeNav, needsSeason, resolveRoute } from "../public/js/routes.js";
import { anteprimaPunteggio, filtraDisponibili } from "../public/js/views/editor.js";
import { lasciaAvviso, prendiAvviso } from "../public/js/state.js";

describe("sottopercorsi di Partite", () => {
  it("l'archivio resta la vista predefinita", () => {
    expect(resolveRoute("/partite").name).toBe("partite");
    expect(resolveRoute("/partite").sotto).toBeUndefined();
    expect(resolveRoute("/partite").modificaId).toBeUndefined();
  });

  it("nuova e modifica si leggono dal percorso", () => {
    expect(resolveRoute("/partite/nuova")).toMatchObject({ name: "partite", sotto: "nuova" });
    expect(resolveRoute("/partite/abc/modifica")).toMatchObject({ name: "partite", modificaId: "abc" });
    expect(resolveRoute("/partite/abc%20x/modifica").modificaId).toBe("abc x");
  });

  it("sottopercorsi sconosciuti mostrano l'archivio normale", () => {
    expect(resolveRoute("/partite/qualsiasi")).toMatchObject({ name: "partite" });
    expect(resolveRoute("/partite/qualsiasi").sotto).toBeUndefined();
    expect(resolveRoute("/partite/qualsiasi").modificaId).toBeUndefined();
  });

  it("/copilota è un percorso sconosciuto come gli altri", () => {
    expect(resolveRoute("/copilota", { authed: false }).redirect).toBe("/classifica");
    expect(resolveRoute("/copilota", { authed: true }).redirect).toBe("/home");
  });

  it("stagione e barra come prima", () => {
    expect(needsSeason("partite")).toBe(true);
    expect(activeNav("partite")).toBe("partite");
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

describe("ricerca per nome nell'editor", () => {
  const giocatori = [
    { id: "a", name: "Antonio" },
    { id: "b", name: "Vito" },
    { id: "c", name: "Mimmo" },
  ];

  it("senza ricerca tutti i liberi, mai i selezionati", () => {
    expect(filtraDisponibili(giocatori, new Set(["a"]), "").map((g: { id: string; name: string }) => g.id)).toEqual(["b", "c"]);
  });

  it("la ricerca ignora le maiuscole e gli accenti", () => {
    expect(filtraDisponibili(giocatori, new Set(), "vit").map((g: { id: string; name: string }) => g.id)).toEqual(["b"]);
    expect(filtraDisponibili(giocatori, new Set(), "o").map((g: { id: string; name: string }) => g.id)).toEqual(["a", "b", "c"]);
    const accenti = [{ id: "d", name: "Nicolò" }];
    expect(filtraDisponibili(accenti, new Set(), "nicolo").map((g: { id: string; name: string }) => g.id)).toEqual(["d"]);
  });
});

describe("avviso dopo salva ed elimina", () => {
  it("si legge una volta sola", () => {
    lasciaAvviso("Salvata.");
    expect(prendiAvviso()).toBe("Salvata.");
    expect(prendiAvviso()).toBeNull();
  });
});
