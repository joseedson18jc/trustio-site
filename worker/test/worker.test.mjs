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

// 5b · o destino do redirect vem do corpo da requisição: só vale o próprio site,
//      senão api.trustio.com.br vira trampolim de phishing.
const PADRAO = "https://trustio.com.br/obrigado.html?lista=espera";
for (const [bruto, esperado, caso] of [
  ["https://atacante.example/phish", PADRAO, "domínio externo recusado"],
  ["//atacante.example/phish", PADRAO, "barra dupla recusada"],
  ["https://trustio.com.br.atacante.example/x", PADRAO, "domínio parecido recusado"],
  ["javascript:alert(1)", PADRAO, "esquema javascript recusado"],
  ["http://localhost:8080/x", PADRAO, "localhost recusado em produção"],
  ["http://127.0.0.1:8765/x", PADRAO, "loopback recusado em produção"],
  ["http://trustio.com.br/x", PADRAO, "http no domínio próprio recusado"],
  ["/obrigado.html?lista=pre", "https://trustio.com.br/obrigado.html?lista=pre", "caminho relativo aceito"],
  ["https://www.trustio.com.br/obrigado.html", "https://www.trustio.com.br/obrigado.html", "subdomínio próprio aceito"],
  ["", PADRAO, "sem _next usa o padrão"],
]) {
  r = await worker.fetch(req("POST", "/signup",
    "email=redir%40exemplo.com.br&_next=" + encodeURIComponent(bruto),
    "application/x-www-form-urlencoded"), env);
  ok(r.status === 303 && r.headers.get("location") === esperado, caso, r.headers.get("location"));
}

// 5c · em desenvolvimento, o destino vale se bater com a origem de SITE_URL
const envLocal = { ...env, SITE_URL: "http://localhost:8765" };
r = await worker.fetch(req("POST", "/signup",
  "email=dev%40exemplo.com.br&_next=" + encodeURIComponent("http://localhost:8765/obrigado.html"),
  "application/x-www-form-urlencoded"), envLocal);
ok(r.headers.get("location") === "http://localhost:8765/obrigado.html",
   "em dev, a própria origem de SITE_URL é aceita", r.headers.get("location"));
r = await worker.fetch(req("POST", "/signup",
  "email=dev%40exemplo.com.br&_next=" + encodeURIComponent("http://localhost:9999/x"),
  "application/x-www-form-urlencoded"), envLocal);
ok(r.headers.get("location") === "http://localhost:8765/obrigado.html?lista=espera",
   "em dev, outra porta continua recusada", r.headers.get("location"));

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

// 9 · e-mail com formato inválido é recusado antes de gravar
rpcs = []; enviados = [];
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "sem-arroba.com.br" })), env);
ok(r.status === 400 && (await r.json()).error === "email_invalido" && !rpcs.length && !enviados.length,
   "e-mail inválido recusado sem gravar nem enviar");

// 10 · modo KV (provisório): grava no SIGNUPS em vez do Supabase
function kvFalso() {
  const dados = new Map();
  return {
    dados,
    async get(k) { return dados.has(k) ? dados.get(k).v : null; },
    async put(k, v, o = {}) { dados.set(k, { v: String(v), ttl: o.expirationTtl }); },
    async delete(k) { dados.delete(k); },
  };
}
const kv = kvFalso();
const envKV = { ...env, ARMAZENAMENTO: "kv", SIGNUPS: kv };
const chaves = (prefixo) => [...kv.dados.keys()].filter((k) => k.startsWith(prefixo));
const leadKV = (e) => JSON.parse(kv.dados.get("lead:" + e)?.v || "null");
const linkDe = (m) => (m?.html || "").match(/confirm\?token=([a-f0-9]{64})/)?.[1];

d = await (await worker.fetch(req("GET", "/saude"), envKV)).json();
ok(d.armazenamento === "kv" && d.kv === true, "/saude mostra o modo kv");

rpcs = []; enviados = [];
const inscricao = JSON.stringify({
  _honey: "", origem: "espera.html", nome: "Pessoa KV", email: " Pessoa.KV@Exemplo.com.BR ", telefone: "",
  tipo: "B2C — para mim", plano: "Mensal R$ 79", acesso: "Lista gratuita — acesso em 1º/10",
});
r = await worker.fetch(req("POST", "/signup", inscricao), envKV);
d = await r.json();
let lk = leadKV("pessoa.kv@exemplo.com.br");
ok(r.status === 200 && d.ok, "kv: POST /signup aceita");
ok(rpcs.length === 0, "kv: não chama o Supabase");
ok(chaves("lead:").length === 1 && lk?.status === "pendente" && lk.nome === "Pessoa KV" && lk.tipo === "b2c",
   "kv: um lead pendente gravado", JSON.stringify(lk));
ok(/Mensal R\$ 79/.test(lk?.notas || ""), "kv: extras viram notas");
ok(enviados.length === 1 && linkDe(enviados[0]) === lk?.token, "kv: um e-mail com o token do lead");
ok(kv.dados.has("token:" + lk?.token) && kv.dados.get("token:" + lk?.token).ttl > 0, "kv: token gravado com validade");
ok(kv.dados.get("envio:pessoa.kv@exemplo.com.br")?.ttl >= 60, "kv: marca de envio com TTL válido no KV");

// envio repetido logo em seguida: mesmo lead, nenhum e-mail a mais
r = await worker.fetch(req("POST", "/signup", inscricao), envKV);
ok(r.status === 200 && (await r.json()).ok, "kv: reenvio imediato responde ok");
ok(enviados.length === 1 && chaves("lead:").length === 1 && chaves("token:").length === 1,
   "kv: reenvio imediato não duplica lead, token nem e-mail");

// passado o intervalo, um link novo sai e o antigo deixa de valer
const tokenVelho = lk.token;
kv.dados.delete("envio:pessoa.kv@exemplo.com.br");
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "pessoa.kv@exemplo.com.br", telefone: "+55 11 90000-0000" })), envKV);
lk = leadKV("pessoa.kv@exemplo.com.br");
ok(r.status === 200 && enviados.length === 2 && lk.token !== tokenVelho, "kv: depois do intervalo, envia link novo");
ok(lk.nome === "Pessoa KV" && lk.telefone === "+55 11 90000-0000", "kv: campo vazio não apaga, campo novo entra");
ok(!kv.dados.has("token:" + tokenVelho) && chaves("lead:").length === 1, "kv: token antigo removido, ainda um lead só");

r = await worker.fetch(req("GET", "/confirm?token=" + tokenVelho), envKV);
ok(r.status === 400, "kv: link antigo não confirma");
r = await worker.fetch(req("GET", "/confirm?token=" + lk.token), envKV);
ok(r.status === 200 && /Inscrição confirmada/.test(await r.text()), "kv: link novo confirma");
lk = leadKV("pessoa.kv@exemplo.com.br");
ok(lk.status === "confirmado" && lk.confirmado_em && !lk.token && !chaves("token:").length && kv.dados.has("confirmado:pessoa.kv@exemplo.com.br"), "kv: lead confirmado, token apagado, chave confirmado: gravada");
r = await worker.fetch(req("GET", "/confirm?token=" + linkDe(enviados[1])), envKV);
ok(r.status === 400, "kv: o mesmo link não vale duas vezes");

kv.dados.delete("envio:pessoa.kv@exemplo.com.br");
r = await worker.fetch(req("POST", "/signup", inscricao), envKV);
ok(r.status === 200 && enviados.length === 2 && leadKV("pessoa.kv@exemplo.com.br").status === "confirmado",
   "kv: quem já confirmou não recebe outro e-mail nem volta a pendente");

// link vencido
await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "vence@exemplo.com.br" })), envKV);
const vence = leadKV("vence@exemplo.com.br");
kv.dados.set("lead:vence@exemplo.com.br", { v: JSON.stringify({ ...vence, token_expira_em: new Date(Date.now() - 1000).toISOString() }) });
r = await worker.fetch(req("GET", "/confirm?token=" + vence.token), envKV);
ok(r.status === 410, "kv: link vencido diz que expirou");

// falha no envio: erro honesto, sem marca de envio, e a nova tentativa manda o e-mail
globalThis.fetch = async (u, o) => u.includes("resend") ? new Response("erro", { status: 500 }) : fetchBom(u, o);
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "falha.kv@exemplo.com.br" })), envKV);
ok(r.status === 502 && (await r.json()).error === "email_nao_enviado" && !kv.dados.has("envio:falha.kv@exemplo.com.br"),
   "kv: envio falhou → erro honesto e sem marca de envio");
globalThis.fetch = fetchBom;
const antes = enviados.length;
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "falha.kv@exemplo.com.br" })), envKV);
ok(r.status === 200 && enviados.length === antes + 1, "kv: nova tentativa depois da falha envia");

// reenvio que falha não derruba o link que já tinha chegado
await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "reenvio@exemplo.com.br", origem: "planos.html" })), envKV);
const primeiro = leadKV("reenvio@exemplo.com.br").token;
kv.dados.delete("envio:reenvio@exemplo.com.br");
globalThis.fetch = async (u, o) => u.includes("resend") ? new Response("erro", { status: 500 }) : fetchBom(u, o);
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "reenvio@exemplo.com.br" })), envKV);
globalThis.fetch = fetchBom;
ok(r.status === 502 && leadKV("reenvio@exemplo.com.br").token === primeiro && chaves("token:").filter((k) => kv.dados.get(k).v.includes("reenvio@")).length === 1,
   "kv: reenvio que falha mantém o link anterior e não deixa token órfão");
ok(leadKV("reenvio@exemplo.com.br").origem === "planos.html", "kv: inscrição sem origem não apaga a origem registrada");
r = await worker.fetch(req("GET", "/confirm?token=" + primeiro), envKV);
ok(r.status === 200, "kv: o link anterior ainda confirma depois da falha");

// corrida: uma inscrição regrava o lead como pendente depois da confirmação
kv.dados.set("lead:reenvio@exemplo.com.br", { v: JSON.stringify({ ...leadKV("reenvio@exemplo.com.br"), status: "pendente", token: primeiro }) });
kv.dados.delete("envio:reenvio@exemplo.com.br");
const antesCorrida = enviados.length;
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "reenvio@exemplo.com.br" })), envKV);
ok(r.status === 200 && enviados.length === antesCorrida && kv.dados.has("confirmado:reenvio@exemplo.com.br"),
   "kv: a confirmação sobrevive a um lead regravado e não gera e-mail novo");

// formulário sem JavaScript no modo kv
r = await worker.fetch(req("POST", "/signup", "email=sem-js.kv%40exemplo.com.br&_next=%2Fobrigado.html%3Flista%3Despera",
  "application/x-www-form-urlencoded"), envKV);
ok(r.status === 303 && leadKV("sem-js.kv@exemplo.com.br")?.status === "pendente", "kv: sem JavaScript grava e redireciona");

r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "x@exemplo.com.br" })), { ...env, ARMAZENAMENTO: "kv" });
ok(r.status === 503, "kv sem o binding SIGNUPS: indisponível, sem fingir sucesso");

r = await worker.fetch(req("GET", "/confirm?token=nao-hex"), envKV);
ok(r.status === 400, "kv: token fora do formato recusado");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
