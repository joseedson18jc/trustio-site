// Trustio · atribuição de primeiro toque: de onde veio quem se cadastra.
// Nas páginas públicas e em entrar.html, guarda uma vez (90 dias) as UTMs do endereço, o domínio
// da página anterior e a página de entrada. O conta.js leva isso ao cadastro (metadata da conta) e
// o funil.js ao meta de signup_start/signup_complete. No /app o script só lê, não captura.
// Nada de nome, e-mail ou query string inteira: só os campos abaixo, normalizados.
(function () {
  "use strict";
  var CHAVE = "tr-1toque";        // primeiro toque: gravado uma vez
  var CHAVE_ULTIMO = "tr-ultimo"; // último toque com UTM: uma visita direta não trava a campanha
  var VALIDADE_MS = 90 * 24 * 60 * 60 * 1000;
  var REF_DIAS = 90;
  var REF_VALIDO = /^[A-Z]{2,12}\d{2,4}$/; // o mesmo de assets/app.js
  var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var VALOR = /^[a-z0-9._-]{1,64}$/;
  var HOST = /^[a-z0-9.-]{1,64}$/;
  var CAMINHO = /^\/[a-z0-9._\/-]{0,63}$/;
  var DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  // O próprio site e as voltas de login/pagamento não contam como origem.
  var HOST_NEUTRO = /(^|\.)(trustio\.com\.br|supabase\.co|accounts\.google\.com|stripe\.com)$/;

  // Minúsculas, sem acento, só [a-z0-9._-], até 64. "<script>" vira "script".
  function normaliza(v) {
    return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  }

  function caminho(p) {
    var c = String(p || "/").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9._\/-]+/g, "-").slice(0, 64);
    return CAMINHO.test(c) ? c : "/";
  }

  function hostDeOrigem(referrer) {
    try {
      var h = new URL(referrer).hostname.toLowerCase();
      if (!HOST.test(h) || h === location.hostname || HOST_NEUTRO.test(h)) return "";
      return h;
    } catch (_) { return ""; }
  }

  // Aceita só os campos conhecidos, no formato que este script grava. Serve para o que vem do
  // localStorage e do metadata da conta (os dois são editáveis por quem usa o navegador).
  function limpar(bruto) {
    if (!bruto || typeof bruto !== "object") return null;
    var limpo = {};
    UTM.forEach(function (k) { if (VALOR.test(bruto[k] || "")) limpo[k] = bruto[k]; });
    if (HOST.test(bruto.ref_host || "")) limpo.ref_host = bruto.ref_host;
    if (CAMINHO.test(bruto.landing || "")) limpo.landing = bruto.landing;
    if (DATA.test(bruto.toque_em || "")) limpo.toque_em = bruto.toque_em;
    if (bruto.ultimo && typeof bruto.ultimo === "object") {
      var u = {};
      UTM.forEach(function (k) { if (VALOR.test(bruto.ultimo[k] || "")) u[k] = bruto.ultimo[k]; });
      if (DATA.test(bruto.ultimo.toque_em || "")) u.toque_em = bruto.ultimo.toque_em;
      if (u.utm_source) limpo.ultimo = u;
    }
    return Object.keys(limpo).length ? limpo : null;
  }

  function lerChave(chave) {
    try {
      var t = limpar(JSON.parse(localStorage.getItem(chave) || "null"));
      if (!t || !t.toque_em || Date.now() - Date.parse(t.toque_em) > VALIDADE_MS) return null;
      return t;
    } catch (_) { return null; }
  }

  function gravar(chave, toque) {
    try { localStorage.setItem(chave, JSON.stringify(toque)); } catch (_) { /* modo privado */ }
  }

  // Primeiro toque válido, com o último toque com UTM em `ultimo` quando as UTMs forem outras.
  function ler() {
    var primeiro = lerChave(CHAVE);
    if (!primeiro) return null;
    var ultimo = lerChave(CHAVE_ULTIMO);
    var outro = ultimo && UTM.some(function (k) { return (ultimo[k] || "") !== (primeiro[k] || ""); });
    if (ultimo && ultimo.utm_source && outro) {
      var u = {};
      UTM.concat("toque_em").forEach(function (k) { if (ultimo[k]) u[k] = ultimo[k]; });
      primeiro.ultimo = u;
    }
    return primeiro;
  }

  function capturar() {
    var p = location.pathname;
    if (/^\/(en\/)?app(\/|$)/.test(p)) return;
    // Volta do Google ou link de e-mail: a página anterior é o login ou o webmail, não a origem.
    if (/access_token|error_description|type=/.test(location.hash || "")) return;

    var qs = new URLSearchParams(location.search);
    var toque = {};
    UTM.forEach(function (k) { var v = normaliza(qs.get(k)); if (v) toque[k] = v; });
    var ref = String(qs.get("ref") || "").toUpperCase();
    if (REF_VALIDO.test(ref)) {
      // Indicação de afiliado (?ref=LUISC10): mesmo cookie do app.js, também nas páginas sem ele.
      try { document.cookie = "trustio_ref=" + ref + "; Max-Age=" + REF_DIAS * 86400 + "; Path=/; SameSite=Lax; Secure"; }
      catch (_) { /* sem cookie, sem atribuição */ }
      if (!toque.utm_source) {
        toque = { utm_source: "afiliado", utm_medium: "parceria", utm_content: ref.toLowerCase() };
      }
    }
    var host = hostDeOrigem(document.referrer);
    if (host) toque.ref_host = host;
    toque.landing = caminho(p);
    toque.toque_em = new Date().toISOString();

    if (!lerChave(CHAVE)) gravar(CHAVE, toque);
    if (toque.utm_source) gravar(CHAVE_ULTIMO, toque);
  }

  try { capturar(); } catch (_) { /* atribuição nunca atrapalha a página */ }

  window.TRUSTIO_ATRIB = Object.freeze({ ler: ler, limpar: limpar });
})();
