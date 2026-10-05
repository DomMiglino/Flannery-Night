// PASSO 5a: Worker. Le API sono in src/router.ts; il resto arriva
// dagli static assets di public/ (interfaccia).
// Il percorso dell'area di gestione e' ADMIN_PATH ("/copilota"):
// come le altre rotte dell'interfaccia, serve la pagina singola e
// la vista decide cosa mostrare in base all'accesso.

import { type Env } from "./env";
import { withSecurityHeaders } from "./http";
import { handleApi } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withSecurityHeaders(await handleApi(request, env, url));
    }
    // Tutte le rotte dell'interfaccia (inclusa quella dell'area di
    // gestione) arrivano dagli asset con gestione a pagina singola.
    const assets = env.ASSETS as { fetch(r: Request): Promise<Response> } | undefined;
    if (assets) return withSecurityHeaders(await assets.fetch(request));
    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  },
};
