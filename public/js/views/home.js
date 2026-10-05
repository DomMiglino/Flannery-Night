// Passo 4: home, visibile solo con l'accesso. Il mio esagono, il nome,
// il ruolo, l'overall e quanti voti ho ricevuto. Nient'altro.

import { ApiError, api } from "../api.js";
import { clear, el } from "../dom.js";
import { valoriDaVoto, votiPerTarget } from "../ratings.js";
import { errore, riepilogo, scheletro } from "../ui.js";

export async function renderHome(root, ctx) {
  if (!ctx.collegato()) {
    ctx.navigate("/classifica", { sostituisci: true });
    return;
  }
  clear(root);
  root.append(scheletro(4));

  const me = ctx.me();
  try {
    const scheda = await api.player(me.id, ctx.stagione());
    let mio = null;
    try {
      const voti = (await api.myVotes()).votes || [];
      mio = votiPerTarget(voti).get(scheda.id) || null;
    } catch (erroreApi) {
      if (erroreApi instanceof ApiError && erroreApi.status === 401) {
        ctx.sessioneScaduta();
        return;
      }
    }

    clear(root);
    root.append(
      riepilogo({
        nome: scheda.name,
        ruolo: scheda.role,
        flag: scheda.flag,
        mediane: scheda,
        mio: valoriDaVoto(mio),
        overall: scheda.overall,
        voti: scheda.votes,
      }),
    );
  } catch (erroreApi) {
    clear(root);
    root.append(
      errore(erroreApi instanceof ApiError && erroreApi.status === 401 ? "Accesso non consentito" : "Non riesco a caricare i dati", () =>
        renderHome(root, ctx),
      ),
    );
  }
}