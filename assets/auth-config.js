/* Configuração pública do backend de contas (Supabase, região sa-east-1 · São Paulo).
   A chave abaixo é a chave "publishable": pode viver no navegador. O que ela permite
   é definido pelas políticas de acesso (RLS) no banco — nada além do que cada usuário
   autenticado pode ver. As chaves secretas ficam só no servidor. */
window.TRUSTIO_AUTH = Object.freeze({
  url: "https://yxkgdgcdvngltnykleig.supabase.co",
  key: "sb_publishable_yv7Gi8GviTWdqSFbuw2Qmw_IPcEkfCs",
  chatEndpoint: "https://yxkgdgcdvngltnykleig.supabase.co/functions/v1/chat",
  appPath: "/app/",
  loginPath: "/entrar.html",
  signupPath: "/cadastro.html",
  plansPath: "/planos.html"
});
