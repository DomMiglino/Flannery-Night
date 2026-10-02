// PASSO 3: Worker. Le API sono in src/router.ts; il resto arriva
// dagli static assets di public/ (interfaccia nel passo 4).
// Il percorso dell'area di amministrazione e' ADMIN_PATH, deciso al passo 5.

import { adminPath, type Env } from "./env";
import { fail, MSG } from "./http";
import { handleApi } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    // Percorso riservato: la pagina arriva nel passo 5.
    if (url.pathname === adminPath(env)) {
      return fail(404, MSG.badRequest);
    }
    const assets = env.ASSETS as { fetch(r: Request): Promise<Response> } | undefined;
    if (assets) return assets.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};