// Worker. Le API sono in src/router.ts; il resto arriva dagli static
// assets di public/ (interfaccia a pagina singola).

import { type Env } from "./env";
import { withSecurityHeaders } from "./http";
import { handleApi } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withSecurityHeaders(await handleApi(request, env, url));
    }
    // Tutte le rotte dell'interfaccia arrivano dagli asset con gestione
    // a pagina singola; i percorsi sconosciuti ricadono su index.html.
    const assets = env.ASSETS as { fetch(r: Request): Promise<Response> } | undefined;
    if (assets) return withSecurityHeaders(await assets.fetch(request));
    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  },
};
