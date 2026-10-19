// Trustio · funil primeiro-party: signup_start → signup_complete → trial_activated.
// O Web Analytics do Cloudflare só conta pageviews e o WhatsApp in-app reporta como "direct",
// então o funil é gravado na tabela eventos_funil do Supabase com a chave publishable.
// Cada evento sai uma vez por visitante/usuário (guardas no storage) para não duplicar; o banco
// ainda descarta um segundo signup_complete do mesmo usuário vindo de outro navegador.
// A atribuição (UTMs, domínio de origem, página de entrada) vem do atribuicao.js, carregado antes.
(function () {
  "use strict";
  var cfg = window.TRUSTIO_AUTH;
  if (!cfg || !cfg.url || !cfg.key) return;
  var ATRIB = window.TRUSTIO_ATRIB;

  // Novo objeto: meta + campos de atribuição (sem sobrescrever o que o meta já tem).
  function comAtribuicao(meta, atribuicao) {
    var saida = {};
    Object.keys(atribuicao || {}).forEach(function (k) { saida[k] = atribuicao[k]; });
    Object.keys(meta).forEach(function (k) { saida[k] = meta[k]; });
    return saida;
  }

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

  // signup_start — o conta.js chama quando o signUp chega ao backend sem erro. conta_existente:
  // o e-mail já tinha conta (o Supabase responde igual, com identities vazio); tem guarda própria
  // para não esconder um cadastro de verdade feito depois na mesma aba.
  window.TRUSTIO_FUNIL = Object.freeze({
    inicio: function (opcoes) {
      var existente = Boolean(opcoes && opcoes.conta_existente);
      var guarda = existente ? "funil-signup-start-existente" : "funil-signup-start";
      if (jaMarcado(guarda)) return;
      marca(guarda);
      var meta = { lang: cfg.lang };
      if (existente) meta.conta_existente = true;
      grava("signup_start", comAtribuicao(meta, ATRIB && ATRIB.ler()));
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
        // Quem se cadastra no navegador do Instagram confirma o e-mail em outro navegador, com outro
        // localStorage: o metadata da conta (gravado no cadastro) vem primeiro. Google não tem
        // metadata, mas volta no mesmo navegador: aí vale o localStorage.
        var doCadastro = ATRIB && ATRIB.limpar(user.user_metadata && user.user_metadata.atribuicao);
        var local = !doCadastro && ATRIB && ATRIB.ler();
        var meta = { user_id: user.id, criado_em: user.created_at, lang: cfg.lang,
          fonte_atrib: doCadastro ? "metadata" : local ? "local" : "nenhuma" };
        grava("signup_complete", comAtribuicao(meta, doCadastro || local));
      }
    } catch (_) { /* sem sessão legível, sem evento */ }
  }
})();
