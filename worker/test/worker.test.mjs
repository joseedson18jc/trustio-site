// Exercita o worker com fetch simulado: nada sai para a rede.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

// 10 · modo D1 (provisório): o SQL real roda no SQLite do Node, com chaves estrangeiras
//      ligadas como no D1, e db.batch() é uma transação
function d1Falso() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(readFileSync(new URL("../migrations/0001_lista_de_espera.sql", import.meta.url), "utf8"));
  const falhar = []; // expressões: um comando que casar falha, como uma escrita do D1 que cai
  const executar = (q, args) => {
    if (falhar.some((re) => re.test(q))) throw new Error("d1 indisponível");
    const st = sql.prepare(q);
    if (/^\s*SELECT/i.test(q)) return { results: st.all(...args), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(st.run(...args).changes) } };
  };
  const preparar = (q) => {
    let args = [];
    const st = {
      q, get args() { return args; },
      bind(...a) { args = a.map((v) => v ?? null); return st; },
      async first() { return executar(q, args).results[0] ?? null; },
      async run() { return executar(q, args); },
      async all() { return executar(q, args); },
    };
    return st;
  };
  return {
    sql, falhar,
    prepare: preparar,
    async batch(sts) {
      sql.exec("BEGIN");
      try { const r = sts.map((st) => executar(st.q, st.args)); sql.exec("COMMIT"); return r; }
      catch (e) { sql.exec("ROLLBACK"); throw e; }
    },
  };
}
function kvFalso() {
  const dados = new Map();
  return {
    dados,
    async get(k) { return dados.has(k) ? dados.get(k) : null; },
    async put(k, v) { dados.set(k, String(v)); },
    async delete(k) { dados.delete(k); },
  };
}
const db = d1Falso();
const kv = kvFalso();
const envD1 = { ...env, ARMAZENAMENTO: "d1", DB: db, SIGNUPS: kv };
const leadD1 = (e) => db.sql.prepare("SELECT * FROM leads WHERE email = ?").get(e);
const linksDe = (e) => db.sql.prepare("SELECT token FROM links WHERE email = ?").all(e).map((l) => l.token);
const linkDe = (m) => (m?.html || "").match(/confirm\?token=([a-f0-9]{64})/)?.[1];
const confirma = async (t) => (await worker.fetch(req("GET", "/confirm?token=" + t), envD1)).status;
const inscreve = async (corpo) => worker.fetch(req("POST", "/signup", JSON.stringify(corpo)), envD1);
const envelhecer = (e) => db.sql.prepare("UPDATE leads SET ultimo_link_em = '2000-01-01T00:00:00.000Z' WHERE email = ?").run(e);
const comResendFalhando = async (fn) => {
  globalThis.fetch = async (u, o) => u.includes("resend") ? new Response("erro", { status: 500 }) : fetchBom(u, o);
  try { return await fn(); } finally { globalThis.fetch = fetchBom; }
};
const comD1Falhando = async (re, fn) => {
  db.falhar.push(re);
  try { return await fn(); } finally { db.falhar.length = 0; }
};

d = await (await worker.fetch(req("GET", "/saude"), envD1)).json();
ok(d.armazenamento === "d1" && d.d1 === true, "/saude mostra o modo d1");

const P = "pessoa.d1@exemplo.com.br";
rpcs = []; enviados = [];
const inscricao = {
  _honey: "", origem: "espera.html", nome: "Pessoa D1", email: " Pessoa.D1@Exemplo.com.BR ", telefone: "",
  tipo: "B2C — para mim", plano: "Mensal R$ 79", acesso: "Lista gratuita — acesso em 1º/10",
};
r = await inscreve(inscricao);
d = await r.json();
let ld = leadD1(P);
ok(r.status === 200 && d.ok && rpcs.length === 0, "d1: POST /signup aceita, sem chamar o Supabase");
ok(ld?.status === "pendente" && ld.nome === "Pessoa D1" && ld.tipo === "b2c" && ld.origem === "espera.html" && ld.ultimo_link_em,
   "d1: lead pendente gravado", JSON.stringify(ld));
ok(/Mensal R\$ 79/.test(ld?.notas || ""), "d1: extras viram notas");
const t1 = linkDe(enviados[0]);
ok(enviados.length === 1 && linksDe(P).join() === t1, "d1: um e-mail, com o link gravado");

r = await inscreve(inscricao);
ok(r.status === 200 && enviados.length === 1 && linksDe(P).length === 1, "d1: reenvio imediato não duplica link nem e-mail");

envelhecer(P);
r = await inscreve({ email: P, telefone: "+55 11 90000-0000", origem: "planos.html" });
const t2 = linkDe(enviados[1]);
ld = leadD1(P);
ok(r.status === 200 && enviados.length === 2 && t2 !== t1 && linksDe(P).join() === t2, "d1: depois do intervalo, link novo e o anterior apagado");
ok(ld.nome === "Pessoa D1" && ld.telefone === "+55 11 90000-0000" && ld.origem === "espera.html",
   "d1: campo vazio não apaga, campo novo entra, a primeira origem fica");
ok(await confirma(t1) === 400, "d1: link substituído não confirma");
ok(await confirma(t2) === 200, "d1: link atual confirma");
ld = leadD1(P);
ok(ld.status === "confirmado" && ld.confirmado_em && !linksDe(P).length, "d1: lead confirmado e links apagados");
ok(await confirma(t2) === 400, "d1: o mesmo link não vale duas vezes");

envelhecer(P);
r = await inscreve(inscricao);
ok(r.status === 200 && enviados.length === 2 && leadD1(P).status === "confirmado" && !linksDe(P).length,
   "d1: quem já confirmou não recebe outro e-mail nem volta a pendente");

// link vencido
await inscreve({ email: "vence@exemplo.com.br" });
const tv = linkDe(enviados.at(-1));
db.sql.prepare("UPDATE links SET expira_em = '2000-01-01T00:00:00.000Z' WHERE token = ?").run(tv);
ok(await confirma(tv) === 410, "d1: link vencido diz que expirou");

// falha da Resend na primeira inscrição: erro honesto, lead salvo, trava liberada
const F = "falha.d1@exemplo.com.br";
r = await comResendFalhando(() => inscreve({ email: F, nome: "Falha" }));
ok(r.status === 502 && (await r.json()).error === "email_nao_enviado" && leadD1(F)?.nome === "Falha"
   && !linksDe(F).length && leadD1(F).ultimo_link_em === null,
   "d1: envio falhou → erro honesto, lead salvo, sem link órfão, trava liberada");
let antes = enviados.length;
r = await inscreve({ email: F });
ok(r.status === 200 && enviados.length === antes + 1, "d1: nova tentativa depois da falha envia");

// reenvio que falha: o link entregue continua valendo e os dados novos ficam
const R = "reenvio.d1@exemplo.com.br";
await inscreve({ email: R, origem: "planos.html" });
const tr = linkDe(enviados.at(-1));
envelhecer(R);
r = await comResendFalhando(() => inscreve({ email: R, empresa: "Empresa Nova" }));
ok(r.status === 502 && linksDe(R).join() === tr, "d1: reenvio que falha mantém só o link anterior");
ok(leadD1(R).empresa === "Empresa Nova" && leadD1(R).origem === "planos.html", "d1: reenvio que falha ainda grava os dados novos");
ok(await confirma(tr) === 200, "d1: o link anterior confirma depois da falha");

// o e-mail saiu mas a baixa dos links anteriores falhou: o link novo confirma
const Q = "quebra.d1@exemplo.com.br";
await inscreve({ email: Q });
const tq1 = linkDe(enviados.at(-1));
envelhecer(Q);
r = await comD1Falhando(/^DELETE FROM links WHERE email = \?1 AND token <> \?2/, () => inscreve({ email: Q }));
const tq2 = linkDe(enviados.at(-1));
ok(r.status === 200 && linksDe(Q).length === 2, "d1: baixa pós-envio falhou → a inscrição responde ok");
ok(await confirma(tq2) === 200 && !linksDe(Q).length && await confirma(tq1) === 400,
   "d1: o link novo confirma e a confirmação apaga também o anterior");

// a inscrição inteira falha no D1: nada é gravado nem enviado
antes = enviados.length;
r = await comD1Falhando(/INSERT INTO links/, () => inscreve({ email: "nada@exemplo.com.br", nome: "Nada" }));
ok(r.status === 502 && !leadD1("nada@exemplo.com.br") && enviados.length === antes, "d1: falha no batch da inscrição não grava nada pela metade");

// a confirmação falha no D1: nada muda e o mesmo link confirma depois
const C = "confirma.d1@exemplo.com.br";
await inscreve({ email: C });
const tc = linkDe(enviados.at(-1));
ok(await comD1Falhando(/^DELETE FROM links WHERE email = \?1 AND EXISTS/, () => confirma(tc)) === 503
   && leadD1(C).status === "pendente" && linksDe(C).length === 1, "d1: confirmação que falha não deixa nada pela metade");
ok(await confirma(tc) === 200 && leadD1(C).status === "confirmado", "d1: o mesmo link confirma na nova tentativa");

// links gravados no KV antes da troca continuam confirmando
const K = "antigo.kv@exemplo.com.br", tk = "c".repeat(64);
kv.dados.set("token:" + tk, JSON.stringify({ email: K }));
kv.dados.set("lead:" + K, JSON.stringify({ email: K, nome: "Antigo", origem: "espera.html", status: "pendente", criado_em: "2026-09-24T07:40:00.000Z",
  token: tk, token_expira_em: new Date(Date.now() + 3600e3).toISOString() }));
ok(await confirma(tk) === 200 && leadD1(K)?.status === "confirmado" && leadD1(K).nome === "Antigo" && !kv.dados.has("token:" + tk),
   "d1: link antigo do KV confirma e o lead entra no D1");
ok(await confirma(tk) === 400, "d1: o link antigo do KV não vale duas vezes");
const tk2 = "d".repeat(64);
kv.dados.set("token:" + tk2, JSON.stringify({ email: "vencido.kv@exemplo.com.br" }));
kv.dados.set("lead:vencido.kv@exemplo.com.br", JSON.stringify({ token: tk2, token_expira_em: "2000-01-01T00:00:00.000Z" }));
ok(await confirma(tk2) === 410, "d1: link antigo do KV vencido diz que expirou");
const tk3 = "e".repeat(64);
kv.dados.set("token:" + tk3, JSON.stringify({ email: "sem-prazo.kv@exemplo.com.br" }));
kv.dados.set("lead:sem-prazo.kv@exemplo.com.br", JSON.stringify({ token: tk3 }));
ok(await confirma(tk3) === 410, "d1: link antigo do KV sem prazo não vale para sempre");

const tk4 = "f".repeat(64);
kv.dados.set("token:" + tk4, JSON.stringify({ email: "prazo-na-chave.kv@exemplo.com.br", expira_em: new Date(Date.now() + 3600e3).toISOString() }));
kv.dados.set("lead:prazo-na-chave.kv@exemplo.com.br", JSON.stringify({ email: "prazo-na-chave.kv@exemplo.com.br", status: "pendente" }));
ok(await confirma(tk4) === 200 && leadD1("prazo-na-chave.kv@exemplo.com.br")?.status === "confirmado",
   "d1: link do KV com o prazo na chave do token também confirma");

// quem só existe no KV entra no D1 como estava antes de uma nova inscrição
const KC = "confirmado.kv@exemplo.com.br";
kv.dados.set("lead:" + KC, JSON.stringify({ email: KC, nome: "Confirmado KV", empresa: "Empresa KV", origem: "planos.html",
  status: "confirmado", confirmado_em: "2026-09-24T07:37:00.000Z", criado_em: "2026-09-24T07:36:00.000Z" }));
antes = enviados.length;
r = await inscreve({ email: KC, telefone: "+55 11 91111-1111" });
ld = leadD1(KC);
ok(r.status === 200 && enviados.length === antes && ld?.status === "confirmado" && ld.confirmado_em === "2026-09-24T07:37:00.000Z",
   "d1: confirmado no KV continua confirmado e não recebe outro link", JSON.stringify(ld));
ok(ld.nome === "Confirmado KV" && ld.empresa === "Empresa KV" && ld.origem === "planos.html" && ld.telefone === "+55 11 91111-1111",
   "d1: campos do KV preservados, campo novo entra");
const KM = "marca.kv@exemplo.com.br";
kv.dados.set("confirmado:" + KM, JSON.stringify({ confirmado_em: "2026-09-24T07:38:00.000Z" }));
kv.dados.set("lead:" + KM, JSON.stringify({ email: KM, status: "pendente" }));
r = await inscreve({ email: KM });
ok(r.status === 200 && enviados.length === antes && leadD1(KM)?.status === "confirmado", "d1: a marca confirmado: do KV também vale");
const KP = "pendente.kv@exemplo.com.br";
kv.dados.set("lead:" + KP, JSON.stringify({ email: KP, nome: "Pendente KV", origem: "espera.html", status: "pendente" }));
r = await inscreve({ email: KP, origem: "planos.html" });
ok(r.status === 200 && enviados.length === antes + 1 && leadD1(KP)?.nome === "Pendente KV" && leadD1(KP).origem === "espera.html",
   "d1: pendente no KV recebe link novo, com os campos e a origem do KV");

// formulário sem JavaScript, binding ausente, token fora do formato
r = await worker.fetch(req("POST", "/signup", "email=sem-js.d1%40exemplo.com.br&_next=%2Fobrigado.html%3Flista%3Despera",
  "application/x-www-form-urlencoded"), envD1);
ok(r.status === 303 && leadD1("sem-js.d1@exemplo.com.br")?.status === "pendente", "d1: sem JavaScript grava e redireciona");
r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "x@exemplo.com.br" })), { ...env, ARMAZENAMENTO: "d1" });
ok(r.status === 503, "d1 sem o binding DB: indisponível, sem fingir sucesso");
ok(await confirma("nao-hex") === 400, "d1: token fora do formato recusado");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
