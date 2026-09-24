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
  const falhar = new Set(); // prefixos cujo put falha, para simular erro do KV
  return {
    dados, falhar,
    async get(k) { return dados.has(k) ? dados.get(k).v : null; },
    async put(k, v, o = {}) {
      if ([...falhar].some((p) => k.startsWith(p))) throw new Error("kv indisponível");
      dados.set(k, { v: String(v), ttl: o.expirationTtl });
    },
    async delete(k) { dados.delete(k); },
  };
}
const kv = kvFalso();
const envKV = { ...env, ARMAZENAMENTO: "kv", SIGNUPS: kv };
const chaves = (prefixo) => [...kv.dados.keys()].filter((k) => k.startsWith(prefixo));
const leadKV = (e) => JSON.parse(kv.dados.get("lead:" + e)?.v || "null");
const linkDe = (m) => (m?.html || "").match(/confirm\?token=([a-f0-9]{64})/)?.[1];
const tokensDe = (e) => chaves("token:").filter((k) => JSON.parse(kv.dados.get(k).v).email === e);
const confirma = async (t) => (await worker.fetch(req("GET", "/confirm?token=" + t), envKV)).status;
const inscreve = async (corpo) => worker.fetch(req("POST", "/signup", JSON.stringify(corpo)), envKV);
const comResendFalhando = async (fn) => {
  globalThis.fetch = async (u, o) => u.includes("resend") ? new Response("erro", { status: 500 }) : fetchBom(u, o);
  try { return await fn(); } finally { globalThis.fetch = fetchBom; }
};

d = await (await worker.fetch(req("GET", "/saude"), envKV)).json();
ok(d.armazenamento === "kv" && d.kv === true, "/saude mostra o modo kv");

const P = "pessoa.kv@exemplo.com.br";
rpcs = []; enviados = [];
const inscricao = {
  _honey: "", origem: "espera.html", nome: "Pessoa KV", email: " Pessoa.KV@Exemplo.com.BR ", telefone: "",
  tipo: "B2C — para mim", plano: "Mensal R$ 79", acesso: "Lista gratuita — acesso em 1º/10",
};
r = await inscreve(inscricao);
d = await r.json();
let lk = leadKV(P);
ok(r.status === 200 && d.ok, "kv: POST /signup aceita");
ok(rpcs.length === 0, "kv: não chama o Supabase");
ok(chaves("lead:").length === 1 && lk?.status === "pendente" && lk.nome === "Pessoa KV" && lk.tipo === "b2c",
   "kv: um lead pendente gravado", JSON.stringify(lk));
ok(/Mensal R\$ 79/.test(lk?.notas || ""), "kv: extras viram notas");
const t1 = linkDe(enviados[0]);
ok(enviados.length === 1 && kv.dados.has("token:" + t1) && kv.dados.get("token:" + t1).ttl > 0, "kv: um e-mail, token gravado com validade");
ok(kv.dados.get("atual:" + P)?.v === t1 && kv.dados.get("envio:" + P)?.ttl >= 60, "kv: link atual e marca de envio gravados");

r = await inscreve(inscricao);
ok(r.status === 200 && enviados.length === 1 && chaves("lead:").length === 1 && tokensDe(P).length === 1,
   "kv: reenvio imediato não duplica lead, token nem e-mail");

// depois do intervalo: link novo, o anterior deixa de valer
kv.dados.delete("envio:" + P);
r = await inscreve({ email: P, telefone: "+55 11 90000-0000" });
const t2 = linkDe(enviados[1]);
lk = leadKV(P);
ok(r.status === 200 && enviados.length === 2 && t2 !== t1 && tokensDe(P).length === 1, "kv: depois do intervalo, link novo e o antigo apagado");
ok(lk.nome === "Pessoa KV" && lk.telefone === "+55 11 90000-0000" && lk.origem === "espera.html",
   "kv: campo vazio não apaga, campo novo entra, origem mantida");
ok(await confirma(t1) === 400, "kv: link antigo não confirma");
ok(await confirma(t2) === 200, "kv: link novo confirma");
lk = leadKV(P);
ok(lk.status === "confirmado" && lk.confirmado_em && kv.dados.has("confirmado:" + P) && !tokensDe(P).length && !kv.dados.has("atual:" + P),
   "kv: lead confirmado, chave confirmado: gravada, tokens apagados");
ok(await confirma(t2) === 400, "kv: o mesmo link não vale duas vezes");

kv.dados.delete("envio:" + P);
r = await inscreve(inscricao);
ok(r.status === 200 && enviados.length === 2 && leadKV(P).status === "confirmado",
   "kv: quem já confirmou não recebe outro e-mail nem volta a pendente");

// corrida: uma inscrição regravou o lead como pendente depois da confirmação
kv.dados.set("lead:" + P, { v: JSON.stringify({ ...leadKV(P), status: "pendente" }) });
r = await inscreve(inscricao);
ok(r.status === 200 && enviados.length === 2, "kv: confirmado: vale mesmo com o lead regravado como pendente");

// link vencido
await inscreve({ email: "vence@exemplo.com.br" });
const tv = linkDe(enviados.at(-1));
kv.dados.set("token:" + tv, { v: JSON.stringify({ email: "vence@exemplo.com.br", expira_em: new Date(Date.now() - 1000).toISOString() }) });
ok(await confirma(tv) === 410, "kv: link vencido diz que expirou");

// falha da Resend na primeira inscrição: erro honesto, lead salvo, nova tentativa envia
r = await comResendFalhando(() => inscreve({ email: "falha.kv@exemplo.com.br", nome: "Falha" }));
ok(r.status === 502 && (await r.json()).error === "email_nao_enviado" && leadKV("falha.kv@exemplo.com.br")?.nome === "Falha"
   && !tokensDe("falha.kv@exemplo.com.br").length && !kv.dados.has("envio:falha.kv@exemplo.com.br"),
   "kv: envio falhou → erro honesto, lead salvo, sem token órfão nem marca de envio");
let antes = enviados.length;
r = await inscreve({ email: "falha.kv@exemplo.com.br" });
ok(r.status === 200 && enviados.length === antes + 1, "kv: nova tentativa depois da falha envia");

// reenvio que falha: o link entregue continua valendo e os dados novos não se perdem
const R = "reenvio@exemplo.com.br";
await inscreve({ email: R, origem: "planos.html" });
const tr = linkDe(enviados.at(-1));
kv.dados.delete("envio:" + R);
r = await comResendFalhando(() => inscreve({ email: R, empresa: "Empresa Nova" }));
ok(r.status === 502 && tokensDe(R).length === 1 && kv.dados.get("atual:" + R)?.v === tr,
   "kv: reenvio que falha mantém o link anterior e não deixa token órfão");
ok(leadKV(R).empresa === "Empresa Nova" && leadKV(R).origem === "planos.html", "kv: reenvio que falha ainda grava os dados novos");
ok(await confirma(tr) === 200, "kv: o link anterior confirma depois da falha");

// o e-mail saiu mas a escrita seguinte do KV falhou: o link entregue confirma mesmo assim
const Q = "quebra@exemplo.com.br";
kv.falhar.add("envio:"); kv.falhar.add("atual:");
r = await inscreve({ email: Q });
kv.falhar.clear();
const tq = linkDe(enviados.at(-1));
ok(r.status === 200 && await confirma(tq) === 200, "kv: link entregue confirma mesmo se a escrita pós-envio falhar");

// confirmação: se gravar o lead falhar, nada fica marcado e o link continua valendo
const C = "confirma.falha@exemplo.com.br";
await inscreve({ email: C });
const tc = linkDe(enviados.at(-1));
kv.falhar.add("lead:");
r = await worker.fetch(req("GET", "/confirm?token=" + tc), envKV);
kv.falhar.clear();
ok(r.status === 503 && !kv.dados.has("confirmado:" + C) && leadKV(C).status === "pendente", "kv: confirmação que falha não deixa marca de confirmado");
ok(await confirma(tc) === 200 && kv.dados.has("confirmado:" + C), "kv: o mesmo link confirma na nova tentativa");

// formulário sem JavaScript no modo kv
r = await worker.fetch(req("POST", "/signup", "email=sem-js.kv%40exemplo.com.br&_next=%2Fobrigado.html%3Flista%3Despera",
  "application/x-www-form-urlencoded"), envKV);
ok(r.status === 303 && leadKV("sem-js.kv@exemplo.com.br")?.status === "pendente", "kv: sem JavaScript grava e redireciona");

r = await worker.fetch(req("POST", "/signup", JSON.stringify({ email: "x@exemplo.com.br" })), { ...env, ARMAZENAMENTO: "kv" });
ok(r.status === 503, "kv sem o binding SIGNUPS: indisponível, sem fingir sucesso");
ok(await confirma("nao-hex") === 400, "kv: token fora do formato recusado");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
