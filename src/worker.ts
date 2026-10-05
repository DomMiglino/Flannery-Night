// PASSO 3/4: Worker. Le API sono in src/router.ts; il resto arriva
// dagli static assets di public/ (interfaccia del passo 4).
// Il percorso dell'area di amministrazione e' ADMIN_PATH, deciso al passo 5.

import { adminPath, type Env } from "./env";
import { fail, MSG, withSecurityHeaders } from "./http";
import { handleApi } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withSecurityHeaders(await handleApi(request, env, url));
    }
    // Percorso riservato: la pagina arriva nel passo 5.
    if (url.pathname === adminPath(env)) {
      return withSecurityHeaders(fail(404, MSG.badRequest));
    }
    // Le rotte dell'interfaccia (/classifica, /giocatori, ...) non sono file:
    // in wrangler.toml gli asset rispondono index.html per ogni percorso
    // che non è /api/* e non è un file esistente.
    const assets = env.ASSETS as { fetch(r: Request): Promise<Response> } | undefined;
    if (assets) return withSecurityHeaders(await assets.fetch(request));
    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  },
};