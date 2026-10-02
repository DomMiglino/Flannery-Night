export interface Env {
  DB: D1Database;
}

// PASSO 1: Worker segnaposto. Le API vere arrivano nei passi successivi.
// Gli static assets in public/ sono serviti da Cloudflare; qui rispondiamo
// solo alle chiamate /api/* con un JSON di stato.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ ok: true, service: "Flannery Night v2", step: 1 });
    }
    // Lascia servire gli static assets; se non trovati, 404 JSON.
    const asset = await (env as unknown as { ASSETS?: { fetch(r: Request): Promise<Response> } }).ASSETS?.fetch(request);
    if (asset) return asset;
    return new Response("Not found", { status: 404 });
  },
};
