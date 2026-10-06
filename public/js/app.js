// Passo 4: avvio dell'applicazione.
// Una sola pagina: le sezioni cambiano con la History API, senza
// ricaricare nulla. Il tasto indietro del telefono e i link diretti
// funzionano come su un sito normale.

import { ApiError, api } from "./api.js";
import { clear, el, linkInterno } from "./dom.js";
import {
  ascolta,
  impostaCollegato,
  impostaControllato,
  impostaStagione,
  impostaStagioni,
  isCollegato,
  prendiReturnTo,
  ricordaReturnTo,
  stagioneAttiva,
  stagioneCorrente,
  utenteCollegato,
  azioneAccount,
  vociMenu,
} from "./state.js";
import {
  activeNav,
  navItems,
  needsSeason,
  normalizePath,
  resolveRoute,
  seasonFromSearch,
  withSeason,
} from "./routes.js";
import { renderAccesso, renderCambiaPin } from "./views/accesso.js";
import { renderClassifica } from "./views/classifica.js";
import { renderGiocatori } from "./views/giocatori.js";
import { renderHome } from "./views/home.js";
import { renderPartite } from "./views/partite.js";
import { renderRegistro } from "./views/registro.js";
import { renderScheda } from "./views/scheda.js";

const dom = {};
let rendering = 0;
let percorsoDisegnato = null;

function prendiElementi() {
  dom.contenuto = document.getElementById("contenuto");
  dom.barra = document.querySelector(".barra");
  dom.stagioneCampo = document.getElementById("stagione-campo");
  dom.stagione = document.getElementById("stagione");
  dom.pulsanteAccount = document.getElementById("pulsante-account");
  dom.titoloSito = document.getElementById("titolo-sito");
  dom.menu = document.getElementById("menu-account");
  dom.menuTitolo = document.getElementById("menu-titolo");
  dom.voceAccedi = document.getElementById("voce-accedi");
  dom.voceCambia = document.getElementById("voce-cambia");
  dom.voceEsci = document.getElementById("voce-esci");
  dom.nav = new Map([
    ["home", document.getElementById("nav-home")],
    ["classifica", document.getElementById("nav-classifica")],
    ["giocatori", document.getElementById("nav-giocatori")],
    ["partite", document.getElementById("nav-partite")],
  ]);
}

/** Contesto passato a ogni vista. */
const ctx = {
  root: null,
  navigate,
  collegato: isCollegato,
  me: () => utenteCollegato(),
  stagione: stagioneCorrente,
  sessioneScaduta,
};

function sessioneScaduta() {
  impostaCollegato(null);
  ricordaReturnTo(`${location.pathname}${location.search}`);
  vai("/accesso");
}

function navigate(path, { sostituisci = false } = {}) {
  vai(path, { sostituisci });
}

/** Cambio di indirizzo: se cambia la rotta si ridisegna. */
function vai(path, { sostituisci = false } = {}) {
  const url = new URL(path, location.origin);
  const stessaPagina = url.pathname === location.pathname && url.search === location.search;
  if (stessaPagina) {
    disegna();
    return;
  }
  if (sostituisci) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  disegna();
}

function leggiStagioneDallUrl() {
  const dallaUrl = seasonFromSearch(location.search);
  if (dallaUrl) impostaStagione(dallaUrl);
  else impostaStagione(stagioneAttiva());
}

// ---------- testata e barra ----------

function disegnaStagioni() {
  const select = dom.stagione;
  clear(select);
  for (const stagione of currentStagioni()) {
    select.append(el("option", { text: stagione.name, attrs: { value: String(stagione.id) } }));
  }
  const scelta = stagioneCorrente();
  if (scelta) select.value = String(scelta);
}

let cachedStagioni = [];
function currentStagioni() {
  return cachedStagioni;
}

function disegnaBarra(routeName) {
  for (const [nome, nodo] of dom.nav) {
    if (!nodo) continue;
    const voce = navItems(isCollegato()).find((v) => v.name === nome);
    nodo.hidden = voce === undefined;
  }
  const attivo = activeNav(routeName);
  for (const [nome, nodo] of dom.nav) {
    if (!nodo) continue;
    if (nome === attivo) nodo.setAttribute("aria-current", "page");
    else nodo.removeAttribute("aria-current");
  }
}

const NODI_VOCI_MENU = {
  "voce-cambia": "voceCambia",
  "voce-accedi": "voceAccedi",
  "voce-esci": "voceEsci",
};

let nodoRegistro = null;
let nodoExporta = null;

function creaVoceRegistro() {
  const nodo = el("a", { className: "menu-voce", id: "voce-registro", text: "Registro", attrs: { href: "/registro" } });
  return linkInterno(nodo, (href) => vai(href));
}

function creaVoceExporta() {
  const nodo = el("button", { className: "menu-voce", id: "voce-exporta", text: "Esporta dati", attrs: { type: "button" } });
  nodo.addEventListener("click", async () => {
    try {
      const dati = await api.esportaDati();
      const blob = new Blob([JSON.stringify(dati, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flannery-night-${new Date().toISOString().slice(0, 10)}.json`;
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      apriMenu(false);
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        sessioneScaduta();
        return;
      }
      window.alert(erroreApi instanceof Error ? erroreApi.message : "Non riesco a esportare i dati");
    }
  });
  return nodo;
}

/** Le voci di gestione esistono nel menu solo per chi ha il permesso:
 *  per gli altri non c'è proprio il nodo, né testo nascosto. Il permesso
 *  si legge dallo stato condiviso in questo momento, mai da una copia. */
function aggiornaVociGestione(utente) {
  const daMostrare = !!utente && utente.isAdmin === true;
  if (daMostrare) {
    const dopo = document.getElementById("voce-cambia");
    if (!nodoRegistro && dopo && dopo.parentNode) {
      nodoRegistro = creaVoceRegistro();
      dopo.after(nodoRegistro);
    }
    if (!nodoExporta && nodoRegistro && nodoRegistro.parentNode) {
      nodoExporta = creaVoceExporta();
      nodoRegistro.after(nodoExporta);
    }
  } else {
    if (nodoRegistro) {
      nodoRegistro.remove();
      nodoRegistro = null;
    }
    if (nodoExporta) {
      nodoExporta.remove();
      nodoExporta = null;
    }
  }
}

function disegnaMenu() {
  const collegato = isCollegato();
  const utente = utenteCollegato();
  dom.menu.hidden = true;
  dom.pulsanteAccount.setAttribute("aria-expanded", "false");
  aggiornaVociGestione(utente);
  for (const voce of vociMenu(collegato, Boolean(utente && utente.isAdmin))) {
    const nodo = dom[NODI_VOCI_MENU[voce.id]];
    if (nodo) nodo.hidden = !voce.visibile;
  }
  dom.menuTitolo.textContent = collegato && utente ? utente.name : "Account";
}

function apriMenu(apri) {
  dom.menu.hidden = !apri;
  dom.pulsanteAccount.setAttribute("aria-expanded", apri ? "true" : "false");
}

// ---------- disegno della rotta ----------

/** All'inizio della pagina: la scorrevole è del body, la finestra non si muove. */
function azzeraScorrimento() {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
}

async function disegna() {
  const scelta = resolveRoute(location.pathname, { authed: isCollegato(), search: location.search });
  if (scelta.redirect) {
    vai(scelta.redirect, { sostituisci: true });
    return;
  }
  // Una pagina nuova riparte dall'alto; ridisegnare la stessa la lascia dov'era.
  const percorso = `${location.pathname}${location.search}`;
  if (percorso !== percorsoDisegnato) {
    percorsoDisegnato = percorso;
    azzeraScorrimento();
  }
  leggiStagioneDallUrl();
  disegnaStagioni();
  dom.stagioneCampo.hidden = !needsSeason(scelta.name);
  disegnaBarra(scelta.name);
  disegnaMenu();

  const mio = ++rendering;
  clear(dom.contenuto);
  try {
    switch (scelta.name) {
      case "home":
        await renderHome(dom.contenuto, ctx);
        break;
      case "classifica":
        await renderClassifica(dom.contenuto, ctx);
        break;
      case "giocatori":
        await renderGiocatori(dom.contenuto, ctx, scelta);
        break;
      case "scheda":
        await renderScheda(dom.contenuto, ctx, scelta.playerId);
        break;
      case "partite":
        await renderPartite(dom.contenuto, ctx, scelta);
        break;
      case "registro":
        await renderRegistro(dom.contenuto, ctx);
        break;
      case "cambia":
        await renderCambiaPin(dom.contenuto, ctx);
        break;
      default:
        await renderAccesso(dom.contenuto, ctx);
        break;
    }
  } catch (erroreApi) {
    if (mio !== rendering) return;
    if (erroreApi instanceof ApiError && erroreApi.status === 401) {
      sessioneScaduta();
      return;
    }
    clear(dom.contenuto);
    dom.contenuto.append(el("p", { className: "nota-errore", text: "Non riesco a caricare i dati" }));
  }

  if (mio === rendering) {
    document.title = titoloPagina(scelta.name);
    dom.contenuto.focus({ preventScroll: true });
  }
}

function titoloPagina(nome) {
  if (nome === "home") return "Home · Flannery Night";
  if (nome === "classifica") return "Classifica · Flannery Night";
  if (nome === "giocatori") return "Giocatori · Flannery Night";
  if (nome === "scheda") return "Giocatore · Flannery Night";
  if (nome === "partite") return "Partite · Flannery Night";
  if (nome === "registro") return "Registro · Flannery Night";
  if (nome === "cambia") return "Cambia PIN · Flannery Night";
  return "Accedi · Flannery Night";
}

// ---------- avvio ----------

async function avvia() {
  prendiElementi();
  ctx.root = dom.contenuto;
  history.scrollRestoration = "manual";

  for (const nodo of dom.nav.values()) {
    if (nodo) linkInterno(nodo, (href) => vai(withSeason(href.split("?")[0], stagioneCorrente())));
  }
  linkInterno(dom.voceAccedi, (href) => vai(href));
  linkInterno(dom.voceCambia, (href) => vai(href));

  linkInterno(dom.titoloSito, (href) => vai(href));
  dom.pulsanteAccount.addEventListener("click", () => {
    // La decisione è presa al momento del tocco, mai prima.
    if (azioneAccount(isCollegato()) === "accesso") {
      vai("/accesso");
      return;
    }
    apriMenu(dom.menu.hidden);
  });
  dom.voceEsci.addEventListener("click", async () => {
    try {
      await api.logout();
    } catch {
      // Anche se la chiamata fallisce, la sessione locale va chiusa.
    }
    impostaCollegato(null);
    prendiReturnTo();
    apriMenu(false);
    vai("/classifica");
  });

  dom.stagione.addEventListener("change", (evento) => {
    impostaStagione(Number(evento.target.value));
    vai(withSeason(normalizePath(location.pathname), evento.target.value), { sostituisci: true });
  });

  document.addEventListener("click", (evento) => {
    if (dom.menu.hidden) return;
    if (dom.menu.contains(evento.target) || dom.pulsanteAccount.contains(evento.target)) return;
    apriMenu(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") apriMenu(false);
  });

  window.addEventListener("popstate", () => disegna());

  ascolta(() => {
    // La barra e il menu cambiano quando l'accesso cambia.
    const scelta = resolveRoute(location.pathname, { authed: isCollegato(), search: location.search });
    disegnaBarra(scelta.name);
    disegnaMenu();
  });

  // Primo controllo della sessione: 401 vuol dire ospite.
  try {
    const stagioni = await api.seasons();
    cachedStagioni = Array.isArray(stagioni.seasons) ? stagioni.seasons : [];
    impostaStagioni(cachedStagioni);
    impostaStagione(stagioni.activeId ?? stagioneAttiva());
  } catch {
    cachedStagioni = [];
    impostaStagioni([]);
  }

  try {
    impostaCollegato(await api.me());
  } catch (erroreApi) {
    if (!(erroreApi instanceof ApiError) || erroreApi.status !== 401) {
      // Rete assente: si parte comunque come ospiti.
    }
    impostaCollegato(null);
  }
  impostaControllato();

  // Se l'indirizzo corrente non va bene (per esempio /home da ospite)
  // resolveRoute rimanda al percorso giusto.
  const iniziale = resolveRoute(location.pathname, { authed: isCollegato(), search: location.search });
  if (iniziale.redirect) {
    history.replaceState({}, "", withSeason(iniziale.redirect, stagioneCorrente()));
  }
  await disegna();
}

avvia();
