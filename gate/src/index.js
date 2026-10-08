/**
 * Trustio · Worker porteiro das páginas privadas (trustio.com.br/app, /admin, /crm)
 *
 * O site é estático (GitHub Pages atrás da Cloudflare): sem este worker, o HTML do painel
 * chega a qualquer um e só o JavaScript da página decide mostrar ou não. Os dados já eram
 * protegidos pelas políticas RLS do banco; aqui a própria página deixa de ser entregue a
 * quem não está conectado — ou, em /admin e /crm, a quem não tem o papel certo.
 *
 * Como a sessão chega até aqui
 *   O supabase-js guarda a sessão no localStorage, que o servidor não enxerga. O
 *   assets/auth-config.js copia o access token para o cookie tr_sess (mesma validade do
 *   token, renovado a cada TOKEN_REFRESHED, apagado no SIGNED_OUT).
 *
 * Verificação
 *   Tokens ES256/RS256 (chaves de assinatura novas do Supabase) são conferidos contra o JWKS
 *   público do projeto, em cache por 10 min. Token HS256 (segredo legado, que não pode
 *   viver aqui) é conferido perguntando ao próprio Supabase em /auth/v1/user.
 *   O papel vem da RPC meu_papel(), chamada com o token do usuário, em cache por 60 s.
 *
 * Sem sessão → 302 para entrar.html?next=<caminho>. O navegador mantém o #fragmento no
 * redirect, então links de e-mail (#access_token=…) chegam inteiros à página de login,
 * que grava o cookie e volta para o destino.
 *
 * Variáveis
 *   SUPABASE_URL               https://mjdaluioyutnxlyomzyd.supabase.co
 *   SUPABASE_PUBLISHABLE_KEY   chave publishable (pública; só para chamar o Supabase como o usuário)
 */

const COOKIE = "tr_sess";
const JWKS_TTL_MS = 10 * 60 * 1000;
const PAPEL_TTL_MS = 60 * 1000;
const PAPEL_MAX_ENTRADAS = 1000;

// /console fica de fora de propósito: é a demonstração pública, não usa conta.
const ROTAS = [
  { caminho: /^\/(?:en\/)?app(?:\/|$)/, papeis: null },
  { caminho: /^\/admin(?:\/|$)/, papeis: ["admin"] },
  { caminho: /^\/crm(?:\/|$)/, papeis: ["admin", "colaborador"] },
];

const ALGORITMOS = {
  ES256: { importar: { name: "ECDSA", namedCurve: "P-256" }, verificar: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { importar: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verificar: { name: "RSASSA-PKCS1-v1_5" } },
};

let cacheJwks = { chaves: null, ate: 0 };
const cachePapel = new Map(); // sub → { papel, ate }

/** Só para os testes: cada caso começa sem nada guardado. */
export function _limparCaches() {
  cacheJwks = { chaves: null, ate: 0 };
  cachePapel.clear();
}

export function lerCookie(cabecalho, nome) {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function ehObjeto(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function decodificar(token) {
  const partes = String(token).split(".");
  if (partes.length !== 3) return null;
  try {
    const texto = (p) => JSON.parse(new TextDecoder().decode(deBase64Url(p)));
    const cabecalho = texto(partes[0]);
    const corpo = texto(partes[1]);
    // JSON válido não basta: "null" ou "[]" no lugar do objeto também é recusado.
    if (!ehObjeto(cabecalho) || !ehObjeto(corpo)) return null;
    return { cabecalho, corpo, assinado: partes[0] + "." + partes[1], assinatura: deBase64Url(partes[2]) };
  } catch {
    return null;
  }
}

async function chavesPublicas(env) {
  if (cacheJwks.chaves && Date.now() < cacheJwks.ate) return cacheJwks.chaves;
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/.well-known/jwks.json");
  if (!r.ok) throw new Error("JWKS indisponível: HTTP " + r.status);
  const { keys = [] } = await r.json();
  cacheJwks = { chaves: keys, ate: Date.now() + JWKS_TTL_MS };
  return keys;
}

/** Segredo legado (HS256) ou chave que não está no JWKS: quem decide é o Supabase. */
async function confereNoSupabase(token, env) {
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token },
  });
  return r.ok;
}

async function assinaturaConfere(token, jwt, env) {
  const alg = ALGORITMOS[jwt.cabecalho.alg];
  const jwk = alg && (await chavesPublicas(env)).find((k) => k.kid === jwt.cabecalho.kid);
  if (!jwk) return confereNoSupabase(token, env);
  const chave = await crypto.subtle.importKey("jwk", jwk, alg.importar, false, ["verify"]);
  return crypto.subtle.verify(alg.verificar, chave, jwt.assinatura, new TextEncoder().encode(jwt.assinado));
}

/** Devolve { sub } se o token é do nosso projeto, está na validade e a assinatura confere. */
export async function verificarToken(token, env) {
  const jwt = decodificar(token);
  if (!jwt) return null;
  const { exp, iss, aud, sub } = jwt.corpo;
  if (typeof exp !== "number" || exp <= Date.now() / 1000) return null;
  if (iss !== env.SUPABASE_URL + "/auth/v1") return null;
  if (aud !== "authenticated" || !sub) return null;
  try {
    return (await assinaturaConfere(token, jwt, env)) ? { sub } : null;
  } catch (err) {
    console.error("porteiro: falha ao verificar token", err && err.message);
    return null;
  }
}

/** Cache limitado: some com o que venceu e, cheio, descarta o mais antigo (ordem de inserção). */
function guardarPapel(sub, papel) {
  const agora = Date.now();
  for (const [usuario, entrada] of cachePapel) {
    if (agora >= entrada.ate) cachePapel.delete(usuario);
  }
  if (!cachePapel.has(sub) && cachePapel.size >= PAPEL_MAX_ENTRADAS) {
    cachePapel.delete(cachePapel.keys().next().value);
  }
  cachePapel.set(sub, { papel, ate: agora + PAPEL_TTL_MS });
}

async function papelDe(token, sub, env) {
  const guardado = cachePapel.get(sub);
  if (guardado && Date.now() < guardado.ate) return guardado.papel;
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/meu_papel", {
    method: "POST",
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) {
    console.error("porteiro: meu_papel respondeu HTTP " + r.status);
    return null;
  }
  const papel = await r.json();
  guardarPapel(sub, papel);
  return papel;
}

function paraLogin(url) {
  const prefixo = url.pathname.startsWith("/en/") ? "/en" : "";
  const destino = prefixo + "/entrar.html?next=" + encodeURIComponent(url.pathname + url.search);
  return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
}

function semAcesso(url) {
  const en = url.pathname.startsWith("/en/");
  const html = en
    ? '<!doctype html><meta charset="utf-8"><title>No access</title><p>This account can\'t open this page. <a href="/en/app/">Go to the chat</a>.</p>'
    : '<!doctype html><meta charset="utf-8"><title>Sem acesso</title><p>Esta conta não tem acesso a esta página. <a href="/app/">Ir para o chat</a>.</p>';
  return new Response(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const rota = ROTAS.find((r) => r.caminho.test(url.pathname));
    if (!rota) return fetch(req);

    const token = lerCookie(req.headers.get("cookie"), COOKIE);
    const sessao = token && (await verificarToken(token, env));
    if (!sessao) return paraLogin(url);

    if (rota.papeis && !rota.papeis.includes(await papelDe(token, sessao.sub, env))) return semAcesso(url);

    const origem = await fetch(req);
    const resposta = new Response(origem.body, origem);
    resposta.headers.set("Cache-Control", "private, no-store");
    return resposta;
  },
};
