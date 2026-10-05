// Passo 4: schermata di accesso. Si sceglie il nome, poi il PIN esiste
// oppure va creato. I messaggi del server si mostrano come arrivano.

import { ApiError, api, nonAutorizzato } from "../api.js";
import { clear, el } from "../dom.js";
import { impostaCollegato, prendiReturnTo } from "../state.js";

function campoPin(nome, etichetta, autofill = false) {
  const input = el("input", {
    className: "pin-campo",
    attrs: {
      id: nome,
      name: nome,
      type: "password",
      inputmode: "numeric",
      pattern: "[0-9]*",
      maxlength: "6",
      autocomplete: autofill ? "new-password" : "off",
      "aria-label": etichetta,
      placeholder: "••••••",
    },
    on: {
      input: (evento) => {
        const valore = evento.target.value.replace(/\D/g, "").slice(0, 6);
        if (valore !== evento.target.value) evento.target.value = valore;
      },
    },
  });
  return el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: etichetta, attrs: { for: nome } }), input] });
}

function avviso(classe = "nota-errore") {
  return el("p", { className: classe, attrs: { role: "status" } });
}

/**
 * Dopo un login, una creazione o un cambio PIN riusciti: rilegge l'utente,
 * aggiorna lo stato PRIMA di navigare e va a /home (o alla pagina da cui
 * si veniva). Così la vista di destinazione trova subito lo stato giusto
 * e non serve ricaricare.
 */
export async function completaAccesso(ctx, leggiMe = api.me) {
  const me = await leggiMe();
  impostaCollegato(me);
  const destinazione = prendiReturnTo() || "/home";
  ctx.navigate(destinazione, { sostituisci: true });
  return destinazione;
}

export async function renderAccesso(root, ctx) {
  clear(root);
  const box = el("div", { className: "accesso" });
  root.append(box);
  box.append(el("h2", { className: "titolo-sezione", text: "Accedi" }));

  let scelta = null;
  let haPin = false;

  const messaggio = avviso();
  const ricerca = el("input", {
    className: "testo",
    attrs: { type: "search", placeholder: "Cerca il tuo nome", "aria-label": "Cerca il tuo nome", autocomplete: "off", enterkeyhint: "search" },
    on: {
      input: () => disegnaElenco(),
    },
  });
  const elenco = el("ul", { className: "elenco accesso-lista", attrs: { "aria-label": "Giocatori" } });

  async function disegnaElenco() {
    clear(elenco);
    const testo = ricerca.value.trim().toLowerCase();
    const filtrati = giocatori.filter((g) => g.name.toLowerCase().includes(testo));
    if (filtrati.length === 0) {
      elenco.append(el("li", { className: "nota", text: "Nessun nome corrisponde alla ricerca." }));
      return;
    }
    for (const giocatore of filtrati) {
      const riga = el("li", {
        className: "voce accesso-voce",
        attrs: { tabindex: "0", role: "button" },
        children: [
          el("span", { className: "accesso-nome", text: giocatore.name }),
        ],
        on: { click: () => scegli(giocatore) },
      });
      riga.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          scegli(giocatore);
        }
      });
      elenco.append(riga);
    }
  }

  async function scegli(giocatore) {
    scelta = giocatore;
    messaggio.textContent = "";
    try {
      const stato = await api.authStatus(giocatore.id);
      haPin = stato.hasPin === true;
    } catch (erroreApi) {
      messaggio.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a caricare i dati";
      return;
    }
    disegnaPin();
  }

  function disegnaPin() {
    clear(box);
    box.append(el("h2", { className: "titolo-sezione", text: "Accedi" }));
    if (haPin) {
      box.append(el("p", { className: "nota", text: `Ciao ${scelta.name}. Inserisci il tuo PIN di 6 cifre.` }));
      box.append(el("p", { className: "nota", text: "Hai dimenticato il PIN? Chiedi a un admin di azzerarlo." }));
    } else {
      box.append(
        el("p", {
          className: "nota",
          text: `Ciao ${scelta.name}. È la prima volta: scegli un PIN di 6 cifre. Lo userai ogni volta che accedi per votare. Scrivilo due volte e non condividerlo.`,
        }),
      );
    }
    messaggio.textContent = "";
    box.append(messaggio);

    const pin = campoPin("pin", haPin ? "PIN" : "PIN di 6 cifre");
    const campi = [pin];

    if (!haPin) {
      const conferma = campoPin("pin-conferma", "Ripeti il PIN");
      campi.push(conferma);
    }

    const invia = el("button", {
      className: "pulsante pulsante-grande",
      text: haPin ? "Entra" : "Crea il PIN",
      attrs: { type: "submit" },
    });
    const annulla = el("button", {
      className: "pulsante pulsante-secondario pulsante-grande",
      text: "Cambia giocatore",
      attrs: { type: "button" },
      on: { click: () => disegnaScelta() },
    });

    const modulo = el("form", {
      className: "pin-campi",
      attrs: { novalidate: "novalidate" },
      on: {
        submit: (evento) => {
          evento.preventDefault();
          invia.click();
        },
      },
      children: [...campi, el("div", { className: "pulsanti", children: [invia] }), annulla],
    });

    for (const campo of campi) {
      campo.querySelector("input").addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          invia.click();
        }
      });
    }

    invia.addEventListener("click", async () => {
      const valore = pin.querySelector("input").value;
      if (!/^[0-9]{6}$/.test(valore)) {
        messaggio.textContent = "Il PIN deve avere 6 cifre.";
        return;
      }
      if (!haPin) {
        const ripetuto = campi[1].querySelector("input").value;
        if (valore !== ripetuto) {
          messaggio.textContent = "Le due PIN non coincidono.";
          return;
        }
      }
      invia.disabled = true;
      messaggio.className = "nota";
      messaggio.textContent = "Attendo…";
      try {
        if (haPin) await api.login(scelta.id, valore);
        else await api.createPin(scelta.id, valore, campi[1].querySelector("input").value);
        await completaAccesso(ctx);
      } catch (erroreApi) {
        messaggio.className = "nota-errore";
        messaggio.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a completare l'accesso";
        invia.disabled = false;
      }
    });

    box.append(modulo);
    const primo = pin.querySelector("input");
    if (primo) primo.focus();
  }

  function disegnaScelta() {
    scelta = null;
    haPin = false;
    clear(box);
    box.append(el("h2", { className: "titolo-sezione", text: "Accedi" }));
    box.append(el("p", { className: "nota", text: "1. Scegli il tuo nome dall'elenco (puoi cercarlo scrivendo)." }));
    box.append(messaggio);
    box.append(
      el("div", { className: "campo", children: [el("label", { className: "campo-etichetta", text: "Il tuo nome", attrs: { for: "cerca" } }), ricerca] }),
    );
    box.append(elenco);
    disegnaElenco();
    ricerca.focus();
  }

  let giocatori = [];
  try {
    const risposta = await api.authPlayers();
    giocatori = Array.isArray(risposta.players) ? risposta.players : [];
  } catch (erroreApi) {
    box.append(el("p", { className: "nota-errore", text: erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a caricare i dati" }));
    box.append(el("button", { className: "pulsante", text: "Riprova", attrs: { type: "button" }, on: { click: () => renderAccesso(root, ctx) } }));
    return;
  }

  disegnaScelta();
}

/** Schermata di cambio PIN: PIN attuale e nuovo due volte. */
export async function renderCambiaPin(root, ctx) {
  clear(root);
  const box = el("div", { className: "accesso" });
  root.append(box);
  box.append(el("h2", { className: "titolo-sezione", text: "Cambia PIN" }));

  const messaggio = avviso();
  const attuale = campoPin("pin-attuale", "PIN attuale", true);
  const nuovo = campoPin("pin-nuovo", "Nuovo PIN di 6 cifre", true);
  const conferma = campoPin("pin-conferma", "Ripeti il nuovo PIN", true);
  const invia = el("button", { className: "pulsante pulsante-grande", text: "Salva il PIN", attrs: { type: "submit" } });

  const modulo = el("form", {
    className: "pin-campi",
    attrs: { novalidate: "novalidate" },
    children: [
      messaggio,
      attuale,
      nuovo,
      conferma,
      el("div", { className: "pulsanti", children: [invia] }),
      el("button", {
        className: "pulsante pulsante-secondario pulsante-grande",
        text: "Annulla",
        attrs: { type: "button" },
        on: { click: () => ctx.navigate(prendiReturnTo() || "/home") },
      }),
    ],
    on: {
      submit: (evento) => {
        evento.preventDefault();
        invia.click();
      },
    },
  });

  invia.addEventListener("click", async () => {
    const a = attuale.querySelector("input").value;
    const b = nuovo.querySelector("input").value;
    const c = conferma.querySelector("input").value;
    if (!/^[0-9]{6}$/.test(a)) {
      messaggio.textContent = "Il PIN attuale deve avere 6 cifre.";
      return;
    }
    if (!/^[0-9]{6}$/.test(b)) {
      messaggio.textContent = "Il nuovo PIN deve avere 6 cifre.";
      return;
    }
    if (b !== c) {
      messaggio.textContent = "Le due PIN non coincidono.";
      return;
    }
    invia.disabled = true;
    messaggio.className = "nota";
    messaggio.textContent = "Attendo…";
    try {
      await api.changePin(a, b, c);
      messaggio.className = "nota-ok";
      messaggio.textContent = "PIN cambiato.";
      await completaAccesso(ctx);
    } catch (erroreApi) {
      // Stesso caso del voto: se la sessione è scaduta si torna non
      // collegati e all'accesso, senza restare a metà schermata.
      if (nonAutorizzato(erroreApi)) {
        ctx.sessioneScaduta();
        return;
      }
      messaggio.className = "nota-errore";
      messaggio.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a cambiare il PIN";
      invia.disabled = false;
    }
  });

  box.append(modulo);
  const primo = attuale.querySelector("input");
  if (primo) primo.focus();
}