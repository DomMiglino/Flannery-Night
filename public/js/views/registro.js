import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { errore, scheletro, titolo } from "../ui.js";

export function isSecurityAction(action) {
  return [
    "login_failed",
    "account_locked",
    "create_pin",
    "change_pin",
    "pin_upgraded",
    "reset_pin",
    "unlock",
  ].includes(action);
}

export function actionLabel(action) {
  const mappa = {
    login_failed: "Accesso fallito",
    account_locked: "Account bloccato",
    create_pin: "Creazione PIN",
    change_pin: "Cambio PIN",
    pin_upgraded: "Aggiornamento PIN",
    reset_pin: "Reset PIN",
    unlock: "Sblocco account",
    match_create: "Creata partita",
    match_update: "Modifica partita",
    match_delete: "Eliminata partita",
    player_create: "Creato giocatore",
    player_update: "Modifica giocatore",
    player_delete: "Eliminato giocatore",
    season_create: "Nuova stagione",
    export_data: "Esportazione dati",
  };
  return mappa[action] ?? String(action ?? "Azione");
}

export function formatAuditDetail(detail) {
  const testo = String(detail ?? "").trim();
  if (!testo) return "";
  try {
    const parsed = JSON.parse(testo);
    if (parsed && typeof parsed === "object") {
      const pezzi = [];
      for (const [k, v] of Object.entries(parsed)) {
        pezzi.push(`${k}: ${String(v)}`);
      }
      return pezzi.join(" · ");
    }
  } catch {
    // niente: si passa al formato testuale.
  }
  const coppie = testo.split(/[;]+/).map((p) => p.trim()).filter(Boolean);
  if (coppie.length > 1) {
    return coppie.map((entry) => {
      const idx = entry.indexOf("=");
      if (idx > 0) return `${entry.slice(0, idx)}: ${entry.slice(idx + 1)}`;
      return entry;
    }).join(" · ");
  }
  if (testo.includes("=")) {
    const [chiave, ...resto] = testo.split("=");
    return `${chiave}: ${resto.join("=")}`;
  }
  return testo;
}

export const etichettaAzioneRegistro = actionLabel;
export const formatoDettaglioRegistro = formatAuditDetail;
export const formatAuditEntry = formatAuditDetail;

function formatItalianDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export const formatoOra = formatItalianDate;

function rigaRegistro(entry) {
  const azione = actionLabel(entry.action);
  const sicurezza = isSecurityAction(entry.action);
  const blocco = el("article", {
    className: "registro-item",
    children: [
      el("div", {
        className: "registro-testa",
        children: [
          el("span", { className: "registro-data", text: formatItalianDate(entry.at) }),
          el("span", { className: sicurezza ? "registro-badge registro-badge-sicurezza" : "registro-badge registro-badge-dati", text: sicurezza ? "Sicurezza" : "Dati" }),
        ],
      }),
      el("div", { className: "registro-riga", children: [
        el("span", { className: "registro-label", text: "Autore" }),
        el("span", { className: "registro-valore", text: entry.actor || "Giocatore eliminato" }),
      ]}),
      el("div", { className: "registro-riga", children: [
        el("span", { className: "registro-label", text: "Azione" }),
        el("span", { className: "registro-valore", text: azione }),
      ]}),
      entry.detail ? el("div", { className: "registro-riga registro-dettaglio", children: [
        el("span", { className: "registro-label", text: "Dettaglio" }),
        el("span", { className: "registro-valore", text: formatAuditDetail(entry.detail) }),
      ]}) : null,
    ],
  });
  return blocco;
}

export async function renderRegistro(root, ctx) {
  const me = ctx.me();
  if (!me || me.isAdmin !== true) {
    ctx.navigate("/classifica");
    return;
  }

  clear(root);
  root.append(titolo("Registro"));
  root.append(scheletro(6));

  const elenco = el("div", { className: "registro-lista" });
  root.append(elenco);

  async function carica(before = null) {
    try {
      const risposta = await api.audit(before);
      const eventi = Array.isArray(risposta.events) ? risposta.events : [];
      const partireDa = before === null || before === undefined ? 0 : Number(before) || 0;
      if (partireDa === 0) clear(elenco);
      for (const evento of eventi) elenco.append(rigaRegistro(evento));
      const ancora = !!risposta.hasMore;
      const footer = document.getElementById("registro-footer");
      if (footer) footer.remove();
      if (ancora) {
        const ultimo = eventi[eventi.length - 1];
        const bottone = el("button", {
          className: "pulsante pulsante-grande tasto-gestione-separato",
          text: "Carica altre",
          attrs: { type: "button" },
          on: { click: () => carica(ultimo ? ultimo.id : null) },
        });
        const wrap = el("div", { id: "registro-footer", className: "registro-footer", children: [bottone] });
        root.append(wrap);
      }
      const indietro = document.getElementById("registro-indietro");
      if (!indietro) {
        root.append(
          el("button", {
            id: "registro-indietro",
            className: "pulsante pulsante-grande tasto-gestione-separato",
            text: "Indietro",
            attrs: { type: "button" },
            on: { click: () => ctx.navigate("/classifica") },
          }),
        );
      }
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
      clear(root);
      root.append(titolo("Registro"));
      root.append(errore("Non riesco a caricare i dati", () => renderRegistro(root, ctx)));
    }
  }

  await carica();
}
