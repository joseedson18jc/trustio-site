// assets/auth-config.js roda no navegador (sem módulo): aqui ele é avaliado num contexto
// com window/document/location falsos, e as funções expostas em TRUSTIO_AUTH são exercitadas.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const fonte = readFileSync(new URL("../assets/auth-config.js", import.meta.url), "utf8");

function carregar({ lang = "pt-BR", protocolo = "https:", caminho = "/entrar.html", guardado = {} } = {}) {
  const cookies = [];
  const sessao = { ...guardado };
  const ctx = {
    document: {
      documentElement: { lang },
      set cookie(v) { cookies.push(v); },
      get cookie() { return ""; },
    },
    location: { protocol: protocolo, pathname: caminho },
    sessionStorage: {
      getItem: (k) => (k in sessao ? sessao[k] : null),
      setItem: (k, v) => { sessao[k] = String(v); },
      removeItem: (k) => { delete sessao[k]; },
    },
    Date,
    Math,
  };
  ctx.window = ctx;
  vm.runInNewContext(fonte, ctx);
  return { cfg: ctx.TRUSTIO_AUTH, cookies, sessao };
}

let falhas = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) console.log("  ✓ " + msg);
  else { falhas++; console.error("  ✗ " + msg + (extra ? " — " + extra : "")); }
};

console.log("destinoSeguro");
{
  const { cfg } = carregar();
  const d = (v) => cfg.destinoSeguro(v, "/app/");
  ok(d("/app/?recovery=1") === "/app/?recovery=1", "caminho interno com query passa");
  ok(d("/admin/") === "/admin/", "/admin/ passa");
  ok(d("/en/app/") === "/en/app/", "/en/app/ passa");
  ok(d(null) === "/app/", "vazio → padrão");
  ok(d("//evil.com") === "/app/", "protocol-relative recusado");
  ok(d("/\\evil.com") === "/app/", "barra invertida recusada");
  ok(d("https://evil.com/") === "/app/", "URL absoluta recusada");
  ok(d("javascript:alert(1)") === "/app/", "javascript: recusado");
  ok(d("/app/#x") === "/app/", "fragmento recusado");
  ok(d("app/") === "/app/", "relativo recusado");
}

console.log("gravarCookie");
{
  const { cfg, cookies } = carregar();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  cfg.gravarCookie({ access_token: "aaa.bbb.ccc", expires_at: exp });
  const c = cookies.at(-1);
  ok(c.startsWith("tr_sess=aaa.bbb.ccc;"), "grava o token", c);
  ok(/; Path=\//.test(c) && /SameSite=Lax/.test(c) && /; Secure/.test(c), "Path, SameSite e Secure", c);
  const maxAge = Number((c.match(/Max-Age=(\d+)/) || [])[1]);
  ok(maxAge > 3590 && maxAge <= 3600, "Max-Age segue a validade do token", String(maxAge));

  cfg.gravarCookie(null);
  ok(/^tr_sess=;.*Max-Age=0/.test(cookies.at(-1)), "sem sessão → apaga", cookies.at(-1));
}

console.log("http local não marca Secure");
{
  const { cfg, cookies } = carregar({ protocolo: "http:" });
  cfg.gravarCookie({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 60 });
  ok(!/Secure/.test(cookies.at(-1)), "sem Secure em http://localhost", cookies.at(-1));
}

console.log("sincronizarCookie");
{
  const { cfg, cookies } = carregar();
  let ouvinte;
  cfg.sincronizarCookie({ auth: { onAuthStateChange: (fn) => { ouvinte = fn; } } });
  ouvinte("TOKEN_REFRESHED", { access_token: "novo", expires_at: Math.floor(Date.now() / 1000) + 3600 });
  ok(cookies.at(-1).startsWith("tr_sess=novo;"), "renova no TOKEN_REFRESHED");
  ouvinte("SIGNED_OUT", null);
  ok(/Max-Age=0/.test(cookies.at(-1)), "apaga no SIGNED_OUT");
}

console.log("disjuntor de voltas");
{
  const cheio = { "tr-voltas": "[1,2]" };
  ok(carregar({ caminho: "/app/", guardado: cheio }).sessao["tr-voltas"] === undefined, "chegar em /app/ zera o contador");
  ok(carregar({ caminho: "/admin/", guardado: cheio }).sessao["tr-voltas"] === undefined, "chegar em /admin/ zera o contador");
  ok(carregar({ caminho: "/entrar.html", guardado: cheio }).sessao["tr-voltas"] === "[1,2]", "na página de login o contador fica");
  ok(carregar({ caminho: "/en/cadastro.html", guardado: cheio }).sessao["tr-voltas"] === "[1,2]", "no cadastro o contador fica");
  ok(carregar().cfg.chaveVoltas === "tr-voltas", "chave exposta para o conta.js");
}

console.log("idioma");
{
  const { cfg } = carregar({ lang: "en" });
  ok(cfg.loginPath === "/en/entrar.html" && cfg.appPath === "/en/app/", "caminhos em inglês continuam");
}

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\ntudo certo");
