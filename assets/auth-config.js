/* Configuração pública do backend de contas (Supabase, região sa-east-1 · São Paulo).
   A chave abaixo é a chave "publishable": pode viver no navegador. O que ela permite
   é definido pelas políticas de acesso (RLS) no banco — nada além do que cada usuário
   autenticado pode ver. As chaves secretas ficam só no servidor.

   Os caminhos seguem o idioma da página: quem se cadastra em /en/ confirma o e-mail,
   entra e sai sempre na versão em inglês. */
(function () {
  var prefixo = /^en\b/i.test(document.documentElement.lang) ? "/en" : "";

  /* Para onde voltar depois do login (?next=). Só caminhos deste site: começa com uma barra,
     nunca duas (//evil.com), sem esquema, barra invertida ou fragmento. Qualquer outra coisa
     cai no padrão — um link de login nunca pode mandar o usuário para fora. */
  var CAMINHO_INTERNO = /^\/(?!\/)[A-Za-z0-9\-._~\/?=&%+]*$/;
  function destinoSeguro(bruto, padrao) {
    var v = String(bruto || "");
    return CAMINHO_INTERNO.test(v) ? v : padrao;
  }

  /* Cópia do access token num cookie, para o worker porteiro (gate/) decidir no servidor se
     entrega /app, /admin e /crm. Não abre nada novo: o mesmo token já está no localStorage, e
     o que ele permite continua definido pelas políticas RLS. Validade = a do próprio token. */
  var COOKIE = "tr_sess";
  function gravarCookie(sessao) {
    var seguro = location.protocol === "https:" ? "; Secure" : "";
    if (sessao && sessao.access_token) {
      var resta = Math.max(0, (sessao.expires_at || 0) - Math.floor(Date.now() / 1000));
      document.cookie = COOKIE + "=" + sessao.access_token + "; Path=/; Max-Age=" + resta + "; SameSite=Lax" + seguro;
    } else {
      document.cookie = COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax" + seguro;
    }
  }
  function sincronizarCookie(sb) {
    sb.auth.onAuthStateChange(function (_evento, sessao) { gravarCookie(sessao); });
  }

  window.TRUSTIO_AUTH = Object.freeze({
    destinoSeguro: destinoSeguro,
    gravarCookie: gravarCookie,
    sincronizarCookie: sincronizarCookie,
    url: "https://mjdaluioyutnxlyomzyd.supabase.co",
    key: "sb_publishable_mmbbWAm8vvNMsvSle89ITg_DkVcmDHW",
    chatEndpoint: "https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/chat",
    lang: prefixo ? "en" : "pt",
    appPath: prefixo + "/app/",
    loginPath: prefixo + "/entrar.html",
    signupPath: prefixo + "/cadastro.html",
    plansPath: prefixo + "/planos.html"
  });
})();
