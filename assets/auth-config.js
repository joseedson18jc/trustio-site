/* Configuração pública do backend de contas (Supabase, região sa-east-1 · São Paulo).
   A chave abaixo é a chave "publishable": pode viver no navegador. O que ela permite
   é definido pelas políticas de acesso (RLS) no banco — nada além do que cada usuário
   autenticado pode ver. As chaves secretas ficam só no servidor.

   Os caminhos seguem o idioma da página: quem se cadastra em /en/ confirma o e-mail,
   entra e sai sempre na versão em inglês. */
(function () {
  var prefixo = /^en\b/i.test(document.documentElement.lang) ? "/en" : "";
  window.TRUSTIO_AUTH = Object.freeze({
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
