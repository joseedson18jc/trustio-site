// Trustio · funil primeiro-party: signup_start → signup_complete → trial_activated.
// O Web Analytics do Cloudflare só conta pageviews e o WhatsApp in-app reporta como "direct",
// então o funil é gravado na tabela eventos_funil do Supabase com a chave publishable.
// Cada evento sai uma vez por visitante/usuário (guardas no storage) para não duplicar.
(function () {
  "use strict";
  var cfg = window.TRUSTIO_AUTH;
  if (!cfg || !cfg.url || !cfg.key) return;

  function grava(evento, meta) {
    try {
      fetch(cfg.url + "/rest/v1/eventos_funil", {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: "Bearer " + cfg.key,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify([{ evento: evento, meta: meta || {} }]),
        keepalive: true
      }).catch(function () {});
    } catch (_) { /* funil nunca atrapalha a página */ }
  }

  function jaMarcado(chave, area) {
    try { return (area === "l" ? localStorage : sessionStorage).getItem(chave) === "1"; }
    catch (_) { return false; }
  }
  function marca(chave, area) {
    try { (area === "l" ? localStorage : sessionStorage).setItem(chave, "1"); }
    catch (_) { /* modo privado */ }
  }

  // signup_start — o conta.js chama quando o signUp chega ao backend sem erro.
  window.TRUSTIO_FUNIL = Object.freeze({
    inicio: function () {
      if (jaMarcado("funil-signup-start")) return;
      marca("funil-signup-start");
      grava("signup_start", { lang: cfg.lang });
    }
  });

  // signup_complete — no /app, com sessão de e-mail confirmado; uma vez por usuário.
  if (location.pathname.indexOf("/app") === 0 || location.pathname === "/app" ||
      location.pathname.indexOf("/en/app") === 0 || location.pathname === "/en/app") {
    try {
      var ref = cfg.url.replace(/^https:\/\/([^\.]+)\..*$/, "$1");
      var bruto = localStorage.getItem("sb-" + ref + "-auth-token");
      var user = bruto && JSON.parse(bruto).user;
      var confirmado = user && (user.email_confirmed_at || user.confirmed_at);
      if (user && confirmado && !jaMarcado("funil-ok-" + user.id, "l")) {
        marca("funil-ok-" + user.id, "l");
        grava("signup_complete", { user_id: user.id, criado_em: user.created_at, lang: cfg.lang });
      }
    } catch (_) { /* sem sessão legível, sem evento */ }
  }
})();
