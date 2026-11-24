/*
 * Servidor intermedio (Cloudflare Worker) para la Plataforma AST.
 * Guarda la clave de API de Anthropic fuera de la página y solo atiende
 * a la dirección de tu plataforma en GitHub Pages.
 *
 * Variables a definir en Cloudflare (Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY    (Secret)  clave de API de tu empresa: sk-ant-...
 *   ORIGENES_PERMITIDOS  (Text)    p. ej. https://tu-usuario.github.io
 *                                  (varias separadas por coma)
 *   CODIGO_ACCESO        (Secret)  opcional; si existe, la plataforma lo pide
 */
const MODELOS_PERMITIDOS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
const MAX_TOKENS = 16000;

function cors(origen) {
  return {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-codigo-acceso",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function error(status, type, message, origen) {
  return new Response(JSON.stringify({ error: { type, message } }), {
    status, headers: { "content-type": "application/json", ...(origen ? cors(origen) : {}) }
  });
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get("Origin") || "";
    const permitidos = String(env.ORIGENES_PERMITIDOS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
    const ok = permitidos.includes(origen);

    if (request.method === "OPTIONS") {
      return ok ? new Response(null, { status: 204, headers: cors(origen) }) : new Response(null, { status: 403 });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/messages") return error(404, "not_found", "Ruta no válida", ok ? origen : "");
    if (!ok) return error(403, "forbidden", "Origen no autorizado", "");
    if (env.CODIGO_ACCESO && request.headers.get("x-codigo-acceso") !== env.CODIGO_ACCESO) {
      return error(403, "forbidden", "Código de acceso no válido", origen);
    }
    if (!env.ANTHROPIC_API_KEY) return error(500, "config", "Falta ANTHROPIC_API_KEY en el Worker", origen);

    let entrada;
    try { entrada = await request.json(); } catch (e) { return error(400, "invalid_request_error", "JSON inválido", origen); }
    if (!MODELOS_PERMITIDOS.includes(entrada.model)) return error(400, "invalid_request_error", "Modelo no permitido", origen);
    if (!Array.isArray(entrada.messages) || !entrada.messages.length) return error(400, "invalid_request_error", "Sin mensajes", origen);

    const cuerpo = {
      model: entrada.model,
      max_tokens: Math.min(Number(entrada.max_tokens) || 2048, MAX_TOKENS),
      stream: entrada.stream === true,
      messages: entrada.messages
    };
    if (typeof entrada.system === "string") cuerpo.system = entrada.system;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(cuerpo)
    });
    const h = new Headers(cors(origen));
    h.set("content-type", r.headers.get("content-type") || "application/json");
    // 401 de Anthropic = problema de la clave del servidor, no del usuario
    const status = r.status === 401 ? 500 : r.status;
    return new Response(r.body, { status, headers: h });
  }
};
