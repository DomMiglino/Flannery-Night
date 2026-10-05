// Passo 4: schermata di accesso. Si sceglie il nome, poi il PIN esiste
// oppure va creato. I messaggi del server si mostrano come arrivano.

import { ApiError, api } from "../api.js";
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
        className: "voce voce-giocatori",
        attrs: { tabindex: "0", role: "button" },
        children: [
          el("span", { className: "voce-nome", text: giocatore.name }),
          el("span", { className: "voce-sottotitolo", text: giocatore.role }),
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
    box.append(el("h2", { className: "titolo-sezione", text: scelta.name }));
    messaggio.textContent = "";
    box.append(messaggio);

    const pin = campoPin("pin", haPin ? "PIN" : "PIN di 6 cifre");
    const campi = [pin];

    if (!haPin) {
      const conferma = campoPin("pin-conferma", "Ripeti il PIN");
      campi.push(conferma);
      box.append(el("p", { className: "nota", text: "Non hai ancora un PIN: creane uno di 6 cifre." }));
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
        const me = await api.me();
        impostaCollegato(me);
        const destinazione = prendiReturnTo() || "/home";
        ctx.navigate(destinazione, { sostituisci: true });
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
      const me = await api.me();
      impostaCollegato(me);
      messaggio.className = "nota-ok";
      messaggio.textContent = "PIN cambiato.";
      ctx.navigate("/home", { sostituisci: true });
    } catch (erroreApi) {
      messaggio.className = "nota-errore";
      messaggio.textContent = erroreApi instanceof ApiError ? erroreApi.message : "Non riesco a cambiare il PIN";
      invia.disabled = false;
    }
  });

  box.append(modulo);
  const primo = attuale.querySelector("input");
  if (primo) primo.focus();
}