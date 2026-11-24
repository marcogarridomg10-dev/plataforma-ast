/*
 * Configuración de la Plataforma AST para GitHub Pages
 * -----------------------------------------------------
 * Este archivo es PÚBLICO (cualquiera puede verlo en el repositorio).
 * NUNCA escribas aquí tu clave de API de Anthropic.
 *
 * Modo 1 · Servidor intermedio (recomendado para compartir con tu equipo)
 *   Publica el Worker de la carpeta /worker en Cloudflare y pega su dirección
 *   en PROXY_URL, por ejemplo: "https://ast-ia.tu-cuenta.workers.dev"
 *   La clave de API queda guardada en Cloudflare, no en la página.
 *
 * Modo 2 · Clave personal
 *   Deja PROXY_URL vacío. Cada persona captura su propia clave de API
 *   en el botón "⚙ IA" de la plataforma; se guarda solo en su navegador.
 */
window.AST_CONFIG = {
  // Dirección del servidor intermedio (Worker). Vacío = cada usuario usa su propia clave.
  PROXY_URL: "",

  // true = el servidor pide un código de acceso (definido en Cloudflare como CODIGO_ACCESO).
  PEDIR_CODIGO: true,

  // Modelos de Claude que usa cada tipo de consulta.
  MODELOS: {
    quick:   "claude-haiku-5-5",   // preguntas previas (rápido y económico)
    default: "claude-sonnet-5-5",  // análisis normal
    complex: "claude-opus-5-5"     // casilla "análisis profundo"
  },

  // Máximo de imágenes (fotos + fotogramas de video) por consulta.
  MAX_IMAGENES: 20
};
