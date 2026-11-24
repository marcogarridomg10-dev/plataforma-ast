/*
 * Adaptador de IA para publicar la Plataforma AST fuera de claude.ai (GitHub Pages).
 * Ofrece a la página las mismas funciones que tenía dentro de claude.ai:
 *   - "sample":    consultas a Claude (API de Anthropic, directa o por servidor intermedio)
 *   - "downloads": descarga de archivos Excel y PDF
 *   - "db"/"user": no existen aquí; el historial se guarda en el navegador (localStorage)
 * Además agrega el botón "⚙ IA" para configurar la conexión y respaldar el historial.
 */
(function () {
  "use strict";
  if (window.claude && window.claude.use) return; // dentro de claude.ai se usa lo nativo

  var CFG = Object.assign({
    PROXY_URL: "", PEDIR_CODIGO: true, MAX_IMAGENES: 20,
    MODELOS: { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" }
  }, window.AST_CONFIG || {});
  CFG.PROXY_URL = String(CFG.PROXY_URL || "").trim().replace(/\/+$/, "");
  var MODO = CFG.PROXY_URL ? "servidor" : "clave";
  var K_CLAVE = "ast.ia.clave", K_CODIGO = "ast.ia.codigo";

  var store = {
    get: function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    set: function (k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); return true; } catch (e) { return false; } }
  };

  function configurado() {
    if (MODO === "clave") return !!store.get(K_CLAVE);
    return !CFG.PEDIR_CODIGO || !!store.get(K_CODIGO);
  }
  var ultimoError = null;
  function fallo(code, detalle) { var e = new Error(detalle || code); e.code = code; ultimoError = code; return e; }

  /* ---------- Imágenes a base64 ---------- */
  var TIPOS_OK = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  function blobBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function aJpeg(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        var s = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(fallo("image_rejected")); }, "image/jpeg", 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(fallo("image_rejected")); };
      im.src = url;
    });
  }
  async function bloqueImagen(blob) {
    if (TIPOS_OK.indexOf(blob.type) < 0) blob = await aJpeg(blob);
    return { type: "image", source: { type: "base64", media_type: blob.type, data: await blobBase64(blob) } };
  }

  /* ---------- Llamada a Claude con respuesta progresiva ---------- */
  async function llamar(input, opts, comoJson) {
    opts = opts || {};
    ultimoError = null;
    if (!configurado()) { abrirPanel(); throw fallo("not_configured"); }
    var tier = CFG.MODELOS[opts.modelTier] ? opts.modelTier : "default";
    var msgs = typeof input === "string" ? [{ role: "user", content: input }]
      : (input || []).map(function (m) { return { role: m.role, content: String(m.content) }; });
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw fallo("upstream_error");
    var imgs = Array.isArray(opts.images) ? opts.images.slice(0, CFG.MAX_IMAGENES) : [];
    if (imgs.length) {
      var bloques = [];
      for (var i = 0; i < imgs.length; i++) bloques.push(await bloqueImagen(imgs[i]));
      var ult = msgs[msgs.length - 1];
      ult.content = bloques.concat([{ type: "text", text: ult.content }]);
    }
    var cuerpo = {
      model: opts.model || CFG.MODELOS[tier],
      max_tokens: tier === "quick" ? 2048 : 16000,
      stream: true,
      messages: msgs
    };
    if (comoJson) cuerpo.system = "Responde únicamente con un objeto JSON válido. No agregues texto antes ni después, ni bloques de código.";

    var url, headers = { "content-type": "application/json" };
    if (MODO === "servidor") {
      url = CFG.PROXY_URL + "/v1/messages";
      if (CFG.PEDIR_CODIGO) headers["x-codigo-acceso"] = store.get(K_CODIGO);
    } else {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = store.get(K_CLAVE);
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }

    var resp;
    try {
      resp = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(cuerpo), signal: opts.signal });
    } catch (e) {
      if (e && e.name === "AbortError") throw fallo("cancelled");
      throw fallo("upstream_error", "red");
    }
    if (!resp.ok) throw await errorHttp(resp);

    var lector = resp.body.getReader(), dec = new TextDecoder(), buf = "", texto = "", stop = null;
    try {
      for (;;) {
        var r = await lector.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var lineas = buf.split("\n"); buf = lineas.pop();
        for (var j = 0; j < lineas.length; j++) {
          var l = lineas[j].trim();
          if (l.indexOf("data:") !== 0) continue;
          var ev; try { ev = JSON.parse(l.slice(5)); } catch (e) { continue; }
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
            texto += ev.delta.text;
            if (typeof opts.onText === "function") { try { opts.onText({ text: texto, delta: ev.delta.text }); } catch (e) {} }
          } else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) {
            stop = ev.delta.stop_reason;
          } else if (ev.type === "error") {
            var t = ev.error && ev.error.type;
            throw fallo(t === "overloaded_error" ? "overloaded" : t === "rate_limit_error" ? "rate_limited" : "upstream_error");
          }
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw fallo("cancelled");
      throw e && e.code ? e : fallo("upstream_error");
    }
    if (stop === "refusal") throw fallo("refused");
    return { text: texto, truncated: stop === "max_tokens" };
  }

  async function errorHttp(resp) {
    var msg = "", tipo = "";
    try { var j = await resp.json(); msg = (j.error && j.error.message) || j.mensaje || ""; tipo = (j.error && j.error.type) || ""; } catch (e) {}
    var m = msg.toLowerCase(), s = resp.status;
    if (s === 401) return fallo(MODO === "servidor" ? "acceso_denegado" : "invalid_key", msg);
    if (s === 403) return fallo(MODO === "servidor" ? "acceso_denegado" : "invalid_key", msg);
    if (s === 429) return fallo("rate_limited", msg);
    if (s === 413 || m.indexOf("too long") >= 0 || m.indexOf("too large") >= 0) return fallo("prompt_too_large", msg);
    if (m.indexOf("credit") >= 0 || m.indexOf("billing") >= 0) return fallo("sin_saldo", msg);
    if (s === 400 && m.indexOf("image") >= 0) return fallo("image_rejected", msg);
    if (s === 404 || m.indexOf("model") >= 0) return fallo("modelo", msg);
    if (s === 529 || tipo === "overloaded_error") return fallo("overloaded", msg);
    return fallo("upstream_error", msg);
  }

  function extraerJson(texto) {
    var t = String(texto || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    return undefined;
  }

  var sample = function (input, opts) { return llamar(input, opts, false); };
  sample.json = async function (input, opts) {
    var r = await llamar(input, opts, true);
    if (!r.text.trim()) throw fallo("empty_completion");
    var v = extraerJson(r.text);
    if (v === undefined) throw fallo("invalid_json");
    return v;
  };
  sample.limits = async function () { return { images: { maxCount: CFG.MAX_IMAGENES } }; };

  /* ---------- Descargas ---------- */
  var downloads = {
    save: async function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data]);
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = o.filename || "archivo"; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    }
  };

  window.claude = {
    use: function (nombre) {
      if (nombre === "sample") return Promise.resolve(sample);
      if (nombre === "downloads") return Promise.resolve(downloads);
      return Promise.resolve(null); // db, user y demás: no disponibles fuera de claude.ai
    }
  };

  /* ---------- Panel "⚙ IA" ---------- */
  var dlg = null;
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k]; else if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }
  function estilos() {
    var css = "#iaBtn{margin-left:8px;background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}" +
      "#iaBtn .pt{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#c0392b;vertical-align:middle}#iaBtn.ok .pt{background:#2ecc71}" +
      "#iaDlg{max-width:560px;width:calc(100% - 32px);border:1px solid var(--line,#dfe4ea);border-radius:10px;padding:0;background:var(--surf,#fff);color:var(--ink,#0f1b2a);font-family:inherit}" +
      "#iaDlg::backdrop{background:rgba(15,27,42,.55)}#iaDlg .hd{background:var(--navy,#0f2a44);color:#fff;padding:14px 18px;font-weight:600}" +
      "#iaDlg .bd{padding:16px 18px}#iaDlg h4{margin:16px 0 6px;font-size:14px}#iaDlg p{margin:6px 0;font-size:13px;line-height:1.45}" +
      "#iaDlg input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line2,#c5ced8);border-radius:6px;font:inherit;background:var(--surf2,#f7f9fb);color:inherit}" +
      "#iaDlg .fila{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#iaDlg button{padding:7px 12px;border-radius:6px;border:1px solid var(--line2,#c5ced8);background:var(--surf2,#f7f9fb);color:inherit;font:inherit;font-size:13px;cursor:pointer}" +
      "#iaDlg button.p{background:var(--pri,#0f2a44);border-color:var(--pri,#0f2a44);color:#fff}#iaDlg .est{font-size:13px;padding:8px 10px;border-radius:6px;background:var(--surf2,#f7f9fb);border:1px solid var(--line,#dfe4ea)}" +
      "#iaDlg .av{font-size:12px;color:var(--mute,#5b6878)}#iaDlg .ft{padding:12px 18px;border-top:1px solid var(--line,#dfe4ea);text-align:right}";
    document.head.appendChild(el("style", { text: css }));
  }
  function refrescarBoton() {
    var b = document.getElementById("iaBtn"); if (!b) return;
    b.classList.toggle("ok", configurado());
    b.title = configurado() ? "IA configurada" : "Configura la IA para usar el análisis automático";
  }
  function setEstado(t) { var e = document.getElementById("iaEst"); if (e) e.textContent = t; }

  function construirPanel() {
    dlg = el("dialog", { id: "iaDlg", "aria-labelledby": "iaTit" });
    var bd = el("div", { class: "bd" });
    var modoTxt = MODO === "servidor"
      ? "Modo servidor: la plataforma se conecta a Claude a través del servidor de tu empresa. No necesitas clave de API."
      : "Modo clave personal: cada persona usa su propia clave de API de Anthropic. La clave se guarda solo en este navegador y no se sube a GitHub.";
    bd.appendChild(el("p", { text: modoTxt }));
    bd.appendChild(el("div", { id: "iaEst", class: "est", text: configurado() ? "Estado: configurada." : "Estado: sin configurar." }));

    if (MODO === "clave") {
      var inp = el("input", { id: "iaClave", type: "password", autocomplete: "off", placeholder: "sk-ant-…", "aria-label": "Clave de API de Anthropic" });
      bd.appendChild(el("h4", { text: "Clave de API de Anthropic" }));
      bd.appendChild(inp);
      bd.appendChild(el("p", { class: "av", text: "Obtén una clave en console.anthropic.com (requiere saldo prepagado). No captures tu clave en equipos compartidos." }));
      var g = el("button", { class: "p", type: "button", text: "Guardar clave" });
      g.onclick = function () { var v = inp.value.trim(); if (!v) { setEstado("Escribe la clave antes de guardar."); return; } store.set(K_CLAVE, v); inp.value = ""; setEstado("Clave guardada en este navegador."); refrescarBoton(); };
      var bo = el("button", { type: "button", text: "Borrar clave" });
      bo.onclick = function () { store.set(K_CLAVE, ""); setEstado("Clave borrada de este navegador."); refrescarBoton(); };
      bd.appendChild(el("div", { class: "fila" }, [g, bo]));
    } else if (CFG.PEDIR_CODIGO) {
      var inc = el("input", { id: "iaCodigo", type: "password", autocomplete: "off", "aria-label": "Código de acceso" });
      bd.appendChild(el("h4", { text: "Código de acceso" }));
      bd.appendChild(inc);
      bd.appendChild(el("p", { class: "av", text: "Pídelo al administrador de la plataforma (Seguridad Industrial)." }));
      var gc = el("button", { class: "p", type: "button", text: "Guardar código" });
      gc.onclick = function () { var v = inc.value.trim(); if (!v) { setEstado("Escribe el código antes de guardar."); return; } store.set(K_CODIGO, v); inc.value = ""; setEstado("Código guardado en este navegador."); refrescarBoton(); };
      var bc = el("button", { type: "button", text: "Borrar código" });
      bc.onclick = function () { store.set(K_CODIGO, ""); setEstado("Código borrado de este navegador."); refrescarBoton(); };
      bd.appendChild(el("div", { class: "fila" }, [gc, bc]));
    }

    var pr = el("button", { type: "button", text: "Probar conexión" });
    pr.onclick = async function () {
      setEstado("Probando conexión…");
      try { var r = await llamar("Responde solo con la palabra OK.", { modelTier: "quick" }, false); setEstado(/ok/i.test(r.text) ? "Conexión correcta con Claude." : "Claude respondió, pero de forma inesperada."); }
      catch (e) { setEstado("Sin conexión: " + (MENSAJES[e.code] || MENSAJES.upstream_error)); }
    };
    bd.appendChild(el("div", { class: "fila" }, [pr]));

    bd.appendChild(el("h4", { text: "Respaldo del historial" }));
    bd.appendChild(el("p", { text: "En esta versión los AST se guardan solo en este navegador. Descarga un respaldo con frecuencia o para pasarlos a otro equipo." }));
    var ex = el("button", { type: "button", text: "Descargar respaldo" });
    ex.onclick = function () {
      var datos = { formato: "plataforma-ast-respaldo", fecha: new Date().toISOString(), historial: leerJson("ast.historial") || [], borrador: leerJson("ast.borrador") };
      downloads.save({ filename: "respaldo-AST-" + new Date().toISOString().slice(0, 10) + ".json", data: new Blob([JSON.stringify(datos)], { type: "application/json" }) });
      setEstado("Respaldo descargado (" + datos.historial.length + " AST).");
    };
    var fi = el("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    fi.onchange = async function () {
      var f = fi.files && fi.files[0]; fi.value = ""; if (!f) return;
      try {
        var d = JSON.parse(await f.text());
        if (!d || d.formato !== "plataforma-ast-respaldo" || !Array.isArray(d.historial)) throw 0;
        var act = leerJson("ast.historial") || [], ids = {};
        act.forEach(function (x) { ids[x.id] = true; });
        var nuevos = d.historial.filter(function (x) { return x && x.id && !ids[x.id]; });
        localStorage.setItem("ast.historial", JSON.stringify(nuevos.concat(act)));
        setEstado("Se importaron " + nuevos.length + " AST. Recarga la página para verlos en el Historial.");
      } catch (e) { setEstado("El archivo no es un respaldo válido de la Plataforma AST."); }
    };
    var im = el("button", { type: "button", text: "Importar respaldo" });
    im.onclick = function () { fi.click(); };
    bd.appendChild(el("div", { class: "fila" }, [ex, im, fi]));

    var cerrar = el("button", { type: "button", text: "Cerrar" });
    cerrar.onclick = function () { dlg.close(); };
    dlg.appendChild(el("div", { class: "hd", id: "iaTit", text: "Configuración de la IA" }));
    dlg.appendChild(bd);
    dlg.appendChild(el("div", { class: "ft" }, [cerrar]));
    document.body.appendChild(dlg);
  }
  function leerJson(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function abrirPanel() {
    if (!dlg) construirPanel();
    setEstado(configurado() ? "Estado: configurada." : "Estado: sin configurar. " + (MODO === "clave" ? "Captura tu clave de API para usar el análisis con IA." : "Captura el código de acceso para usar el análisis con IA."));
    if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); } }
  }

  var MENSAJES = {
    not_configured: "falta configurar la IA.",
    invalid_key: "la clave de API no es válida o fue revocada.",
    acceso_denegado: "el código de acceso no es válido o esta página no está autorizada en el servidor.",
    sin_saldo: "la cuenta de Anthropic no tiene saldo suficiente.",
    rate_limited: "se alcanzó un límite de uso; espera un momento.",
    overloaded: "el servicio está saturado; inténtalo en unos minutos.",
    modelo: "el modelo configurado no está disponible; revisa config.js.",
    upstream_error: "no se pudo conectar con el servicio."
  };

  /* ---------- Textos de la página pensados para claude.ai ---------- */
  var ALERTA = {
    not_configured: "Falta configurar la IA. Usa el botón ⚙ IA de la barra superior, o captura el AST manualmente.",
    invalid_key: "La clave de API no es válida o fue revocada. Revísala en el botón ⚙ IA.",
    acceso_denegado: "El código de acceso no es válido o esta página no está autorizada en el servidor. Revísalo en el botón ⚙ IA.",
    sin_saldo: "La cuenta de Anthropic no tiene saldo suficiente para la consulta.",
    overloaded: "El servicio de IA está saturado. Inténtalo en unos minutos.",
    modelo: "El modelo de IA configurado no está disponible. Revisa config.js."
  };
  var TXT_HIST = "Los AST se guardan solo en este navegador. Descarga un respaldo con frecuencia desde el botón ⚙ IA.";
  function corregirTextos() {
    var hw = document.getElementById("histWhere");
    if (hw && /claude\.ai/.test(hw.textContent) && hw.textContent !== TXT_HIST) hw.textContent = TXT_HIST;
    ["aiMsg", "msg", "expMsg"].forEach(function (id) {
      var box = document.getElementById(id); if (!box) return;
      var al = box.querySelector(".alert"); if (!al || al.dataset.iaOk) return;
      var t = al.lastChild;
      if (id !== "expMsg" && ultimoError && ALERTA[ultimoError] && t && t.nodeType === 3) { t.textContent = ALERTA[ultimoError]; al.dataset.iaOk = "1"; return; }
      if (t && t.nodeType === 3 && /claude\.ai/.test(t.textContent)) {
        t.textContent = id === "expMsg" ? "Recarga la página e inténtalo de nuevo." : "Configura la IA con el botón ⚙ IA de la barra superior, o captura el AST manualmente.";
        al.dataset.iaOk = "1";
      }
    });
  }

  function iniciar() {
    estilos();
    try { new MutationObserver(corregirTextos).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
    corregirTextos();
    var nav = document.getElementById("nav");
    var b = el("button", { id: "iaBtn", type: "button" }, [el("span", { class: "pt" }), document.createTextNode("⚙ IA")]);
    b.onclick = abrirPanel;
    if (nav) nav.appendChild(b); else document.body.appendChild(b);
    refrescarBoton();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
