# Plataforma AST con IA

Plataforma web para elaborar **Análisis de Seguridad en el Trabajo (AST)** con apoyo de inteligencia artificial. El usuario describe la actividad o sube fotos o un video. La IA identifica peligros y riesgos y propone controles con base en las NOM-STPS, ISO 45001 y otras normas internacionales. RI, C, RR, la clasificación y la validación se calculan con código. El resultado se exporta a Excel y a PDF listo para firma.

> Documento generado con apoyo de IA: valida siempre el AST antes de usarlo y verifica la versión vigente de cada NOM en el DOF y la STPS.

## Contenido del repositorio

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La plataforma completa (diseño, cálculo, exportación a Excel y PDF). Dentro de `<head>`, justo después de `<title>`, debe llevar esta línea: `<script src="config.js"></script><script src="ia-adaptador.js"></script>` |
| `config.js` | Configuración: modo de conexión con la IA y modelos. **Es público: nunca pongas aquí una clave.** |
| `ia-adaptador.js` | Conecta la plataforma con la API de Claude fuera de claude.ai y agrega el botón **⚙ IA**. |
| `worker/worker.js` | Servidor intermedio opcional (Cloudflare Worker) que guarda la clave de API de la empresa. |
| `.nojekyll` | Indica a GitHub Pages que publique los archivos tal cual. |

---

## 1. Subir a GitHub y publicar con GitHub Pages

1. Entra a GitHub y crea un repositorio nuevo, por ejemplo `plataforma-ast`. Para usar GitHub Pages con cuenta gratuita, el repositorio debe ser **Public**.
2. En el repositorio, elige **Add file → Upload files**. Arrastra todos los archivos y la carpeta `worker`. El archivo `.nojekyll` está oculto: si no aparece, créalo con **Add file → Create new file**, con nombre `.nojekyll` y sin contenido.
3. Haz clic en **Commit changes**.
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y guarda.
5. En uno o dos minutos la plataforma queda en:
   `https://TU-USUARIO.github.io/plataforma-ast/`

Comparte ese enlace con tu equipo. Funciona en computadora, tableta y celular.

---

## 2. Conectar la IA (elige un modo)

Sin conexión a la IA, la plataforma funciona en **modo manual**: captura del AST, cálculo, historial y exportación. Para usar el análisis automático con texto, fotos o video, elige uno de estos dos modos.

### Modo A · Clave personal (el más rápido para probar)

- Deja `PROXY_URL: ""` en `config.js`. Así viene por defecto.
- Cada usuario abre **⚙ IA** y captura su propia clave de API de Anthropic. La clave se obtiene en <https://console.anthropic.com> y requiere saldo prepagado.
- La clave se guarda **solo en el navegador de esa persona**. No se sube a GitHub ni la ven los demás.
- No conviene usar este modo en computadoras compartidas.

### Modo B · Servidor intermedio de la empresa (recomendado para compartir)

Con este modo los usuarios no necesitan clave. La clave de la empresa queda protegida en Cloudflare, y el servidor solo responde a tu página y a quien tenga el código de acceso.

1. Crea una cuenta gratuita en <https://dash.cloudflare.com>.
2. Entra a **Workers & Pages → Create → Create Worker** (plantilla "Hello World"), ponle un nombre (por ejemplo `ast-ia`) y haz clic en **Deploy**.
3. Haz clic en **Edit code**, reemplaza todo el contenido con el de `worker/worker.js` y vuelve a hacer clic en **Deploy**.
4. En **Settings → Variables and Secrets** agrega:
   - `ANTHROPIC_API_KEY` (tipo *Secret*): la clave de API de la empresa.
   - `ORIGENES_PERMITIDOS` (tipo *Text*): `https://TU-USUARIO.github.io`, sin la ruta del repositorio y sin `/` al final.
   - `CODIGO_ACCESO` (tipo *Secret*): un código que darás a tu equipo. Si no lo agregas, cambia `PEDIR_CODIGO` a `false` en `config.js`.
5. Copia la dirección del Worker (por ejemplo `https://ast-ia.tu-cuenta.workers.dev`) y pégala en `config.js`:
   ```js
   PROXY_URL: "https://ast-ia.tu-cuenta.workers.dev",
   ```
6. Guarda el cambio en GitHub (edita `config.js` con el lápiz y haz clic en **Commit changes**).
7. Cada usuario abre **⚙ IA**, captura el código de acceso y presiona **Probar conexión**.

**Costos:** GitHub Pages y el plan gratuito de Cloudflare Workers no tienen costo para este uso. Cada análisis consume créditos de la API de Anthropic, según el modelo y la cantidad de imágenes. Para controlar el gasto, define un límite mensual en la consola de Anthropic.

---

## 3. Historial y respaldos

En esta versión cada AST se guarda **en el navegador de cada usuario** (localStorage). En **⚙ IA → Respaldo del historial** puedes:
- **Descargar respaldo**: un archivo `.json` con todos los AST guardados.
- **Importar respaldo**: agrega los AST de un respaldo sin duplicar los existentes.

Si se borran los datos del navegador, también se borra el historial. Descarga respaldos con frecuencia.

## 4. Modelos de IA

En `config.js` puedes cambiar los modelos:
- `quick`: preguntas previas (Claude Haiku).
- `default`: análisis normal (Claude Sonnet).
- `complex`: casilla **Análisis profundo** (Claude Opus).

Si usas el Modo B y cambias un modelo, agrégalo también a `MODELOS_PERMITIDOS` en `worker/worker.js`.

## 5. Privacidad

Las fotos, los videos (convertidos en fotogramas) y las descripciones se envían a la API de Anthropic para el análisis. Antes de publicar la plataforma, confirma que esto cumpla con las políticas de tu empresa sobre imágenes de planta y del personal.
