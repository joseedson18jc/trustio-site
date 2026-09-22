// Exercita o worker com fetch simulado: nada sai para a rede.
import worker from "../src/index.js";

const env = {
  SUPABASE_URL: "https://exemplo.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico",
  RESEND_API_KEY: "chave-resend",
  EMAIL_FROM: "Trustio <no-reply@send.trustio.com.br>",
  SITE_URL: "https://trustio.com.br",
  API_URL: "https://api.trustio.com.br",
};

let enviados = [];
let rpcs = [];
let respostaRpc = { ok: true, token: "a".repeat(64) };

globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes("/rest/v1/rpc/")) {
    rpcs.push({ nome: u.split("/rpc/")[1], args: JSON.parse(opts.body) });
    return new Response(JSON.stringify(respostaRpc), { status: 200 });
  }
  if (u.includes("api.resend.com")) {
    enviados.push(JSON.parse(opts.body));
    return new Response("{}", { status: 200 });
  }
  throw new Error("fetch inesperado: " + u);
};

const req = (metodo, caminho, corpo, tipo = "application/json") =>
  new Request("https://api.trustio.com.br" + caminho, {
    method: metodo,
    headers: { origin: "https://trustio.com.br", ...(corpo ? { "content-type": tipo } : {}) },
    body: corpo,
  });

let falhas = 0;
const ok = (cond, msg, extra = "") => {
  console.log((cond ? "  ok   " : "  FALHA") + "  " + msg + (extra ? "  → " + extra : ""));
  if (!cond) falhas++;
};

// 1 · saúde e o formato do link
let r = await worker.fetch(req("GET", "/saude"), env);
let d = await r.json();
ok(r.status === 200, "/saude responde 200");
ok(d.supabase && d.resend, "/saude confirma configuração");
ok(d.exemplo_de_link === "https://api.trustio.com.br/confirm?token=TOKEN_DE_EXEMPLO",
   "link de exemplo bem formado", d.exemplo_de_link);
ok(!/[}{]/.test(d.exemplo_de_link), "link sem chave sobrando (o bug antigo)");

// 2 · inscrição por JSON
enviados = []; rpcs = [];
r = await worker.fetch(req("POST", "/signup", JSON.stringify({
  email: " Pessoa@Exemplo.com.BR ", nome: "Pessoa Teste", whatsapp: "+55 11 90000-0000",
  tipo: "Para minha empresa", segmento: "Jurídico", acesso: "Pré-assinatura", plano: "mensal",
  observacao: "urgente", origem: "espera.html",
})), env);
d = await r.json();
ok(r.status === 200 && d.ok, "POST /signup aceita");
ok(rpcs[0]?.nome === "registrar_optin", "chamou registrar_optin");
ok(rpcs[0]?.args.p_email === "pessoa@exemplo.com.br", "e-mail normalizado", rpcs[0]?.args.p_email);
ok(rpcs[0]?.args.p_tipo === "b2b", "empresa vira b2b");
ok(rpcs[0]?.args.p_telefone === "+55 11 90000-0000", "whatsapp vira telefone");
ok(/Pré-assinatura/.test(rpcs[0]?.args.p_notas || ""), "extras viram notas", rpcs[0]?.args.p_notas);
const link = (enviados[0]?.html || "").match(/https:\/\/api\.trustio\.com\.br\/confirm\?token=[a-f0-9]+/)?.[0];
ok(enviados.length === 1, "um e-mail enviado");
ok(link === "https://api.trustio.com.br/confirm?token=" + "a".repeat(64), "link do e-mail correto", link);
ok(!/token=\*\*\*|token=[^"'\s]*[}{]/.test(enviados[0]?.html || ""), "e-mail sem link malformado");
ok(enviados[0]?.from.includes("send.trustio.com.br"), "remetente no domínio verificado");
ok(Boolean(enviados[0]?.text), "e-mail tem versão em texto");

// 3 · armadilha de robô
enviados = [];
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "robo@exemplo.com.br", _honey: "x" })), env);
ok((await r.json()).ok && enviados.length === 0, "honeypot: responde ok e não envia nada");

// 4 · já confirmado antes: não reenvia, e responde igual
enviados = []; respostaRpc = { ok: true, ja_confirmado: true };
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "ja@exemplo.com.br" })), env);
ok((await r.json()).ok && enviados.length === 0, "quem já confirmou não recebe outro e-mail");

// 5 · formulário sem JavaScript
respostaRpc = { ok: true, token: "b".repeat(64) };
r = await worker.fetch(req("POST", "/signup", "email=sem-js%40exemplo.com.br&_next=https%3A%2F%2Ftrustio.com.br%2Fobrigado.html",
  "application/x-www-form-urlencoded"), env);
ok(r.status === 303 && r.headers.get("location") === "https://trustio.com.br/obrigado.html",
   "sem JavaScript, redireciona", r.headers.get("location"));

// 6 · falha no envio não mente que deu certo
const fetchBom = globalThis.fetch;
globalThis.fetch = async (u, o) => u.includes("resend") ? new Response("dominio nao verificado", { status: 403 }) : fetchBom(u, o);
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "falha@exemplo.com.br" })), env);
d = await r.json();
ok(r.status === 502 && d.error === "email_nao_enviado", "envio falhou → erro honesto", d.error);
globalThis.fetch = fetchBom;

// 7 · confirmação
respostaRpc = { ok: true, email: "pessoa@exemplo.com.br" };
r = await worker.fetch(req("GET", "/confirm?token=" + "a".repeat(64)), env);
let html = await r.text();
ok(r.status === 200 && /Inscrição confirmada/.test(html), "token válido confirma");

respostaRpc = { ok: false, error: "token_expirado" };
r = await worker.fetch(req("GET", "/confirm?token=velho"), env);
ok(r.status === 410 && /expirado/i.test(await r.text()), "token expirado diz que expirou");

respostaRpc = { ok: false, error: "token_invalido" };
r = await worker.fetch(req("GET", "/confirm?token=errado"), env);
ok(r.status === 400 && /inválido/i.test(await r.text()), "token errado recusa");

r = await worker.fetch(req("GET", "/confirm"), env);
ok(r.status === 400 && /incompleto/i.test(await r.text()), "sem token explica o que houve");

// 8 · rota desconhecida e CORS
r = await worker.fetch(req("GET", "/nada"), env);
ok(r.status === 404, "rota desconhecida devolve 404");
r = await worker.fetch(req("OPTIONS", "/signup"), env);
ok(r.status === 204 && r.headers.get("access-control-allow-origin") === "https://trustio.com.br", "preflight ok");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
