// Exercita o porteiro com fetch simulado: nada sai para a rede.
// Gera um par de chaves ES256 de verdade, publica a pública num JWKS falso e assina tokens
// como o Supabase assinaria — assim a verificação de assinatura é testada de ponta a ponta.
import gate, { lerCookie, _limparCaches } from "../src/index.js";

const SUPA = "https://exemplo.supabase.co";
const env = { SUPABASE_URL: SUPA, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste" };
const KID = "chave-teste";

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwkPublica = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: KID, alg: "ES256", use: "sig" };

const b64url = (dados) => Buffer.from(dados).toString("base64url");
const agora = () => Math.floor(Date.now() / 1000);

async function token({ sub = "u1", exp = agora() + 3600, iss = SUPA + "/auth/v1", aud = "authenticated", kid = KID, alg = "ES256" } = {}) {
  const cab = b64url(JSON.stringify({ alg, kid, typ: "JWT" }));
  const corpo = b64url(JSON.stringify({ sub, exp, iss, aud, role: "authenticated" }));
  const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, new TextEncoder().encode(cab + "." + corpo));
  return cab + "." + corpo + "." + b64url(new Uint8Array(assinatura));
}

let papeis = {};          // sub → papel devolvido por meu_papel
let chamadas = [];
let usuarioHs256Valido = true;

globalThis.fetch = async (entrada, opts = {}) => {
  const u = String(entrada instanceof Request ? entrada.url : entrada);
  chamadas.push(u);
  if (u === SUPA + "/auth/v1/.well-known/jwks.json") return new Response(JSON.stringify({ keys: [jwkPublica] }));
  if (u === SUPA + "/rest/v1/rpc/meu_papel") {
    const h = new Headers(opts.headers);
    const t = (h.get("authorization") || "").replace("Bearer ", "");
    const sub = JSON.parse(Buffer.from(t.split(".")[1], "base64url")).sub;
    return new Response(JSON.stringify(papeis[sub] || "teste"));
  }
  if (u === SUPA + "/auth/v1/user") return new Response("{}", { status: usuarioHs256Valido ? 200 : 401 });
  if (u.startsWith("https://trustio.com.br/")) {
    return new Response("<html>pagina</html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "public, max-age=600" } });
  }
  throw new Error("fetch inesperado: " + u);
};

const req = (caminho, cookie) =>
  new Request("https://trustio.com.br" + caminho, { headers: cookie ? { cookie } : {} });

let falhas = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) console.log("  ✓ " + msg);
  else { falhas++; console.error("  ✗ " + msg + (extra ? " — " + extra : "")); }
};
const caso = async (nome, fn) => {
  console.log(nome);
  chamadas = []; papeis = {}; usuarioHs256Valido = true; _limparCaches();
  await fn();
};

await caso("lerCookie", () => {
  ok(lerCookie("a=1; tr_sess=abc.def; b=2", "tr_sess") === "abc.def", "acha o cookie no meio");
  ok(lerCookie("tr_sessao=x", "tr_sess") === null, "não confunde prefixo");
  ok(lerCookie(null, "tr_sess") === null, "sem cabeçalho → null");
});

await caso("página pública passa direto, sem verificar nada", async () => {
  const r = await gate.fetch(req("/planos.html"), env);
  ok(r.status === 200, "200");
  ok(!chamadas.some((c) => c.includes("supabase")), "não consulta o Supabase");
});

await caso("/app sem cookie → login com next", async () => {
  const r = await gate.fetch(req("/app/?recovery=1"), env);
  ok(r.status === 302, "302", String(r.status));
  ok(r.headers.get("location") === "/entrar.html?next=%2Fapp%2F%3Frecovery%3D1", "next preserva caminho e query", r.headers.get("location"));
  ok(/no-store/.test(r.headers.get("cache-control") || ""), "redirect não vai para cache");
});

await caso("/en/app sem cookie → login em inglês", async () => {
  const r = await gate.fetch(req("/en/app/"), env);
  ok(r.headers.get("location") === "/en/entrar.html?next=%2Fen%2Fapp%2F", "vai para /en/entrar.html", r.headers.get("location"));
});

await caso("/app com token válido → página, sem cache compartilhado", async () => {
  const r = await gate.fetch(req("/app/", "tr_sess=" + (await token())), env);
  ok(r.status === 200, "200", String(r.status));
  ok(r.headers.get("cache-control") === "private, no-store", "cache-control privado", r.headers.get("cache-control"));
});

await caso("token expirado → login", async () => {
  const r = await gate.fetch(req("/app/", "tr_sess=" + (await token({ exp: agora() - 5 }))), env);
  ok(r.status === 302, "302", String(r.status));
});

await caso("token adulterado (payload trocado) → login", async () => {
  const [cab, , sig] = (await token({ sub: "u1" })).split(".");
  const falso = b64url(JSON.stringify({ sub: "admin", exp: agora() + 3600, iss: SUPA + "/auth/v1", aud: "authenticated" }));
  const r = await gate.fetch(req("/app/", "tr_sess=" + cab + "." + falso + "." + sig), env);
  ok(r.status === 302, "302", String(r.status));
});

await caso("token de outro emissor → login", async () => {
  const r = await gate.fetch(req("/app/", "tr_sess=" + (await token({ iss: "https://outro.supabase.co/auth/v1" }))), env);
  ok(r.status === 302, "302", String(r.status));
});

await caso("lixo no cookie → login", async () => {
  const r = await gate.fetch(req("/app/", "tr_sess=nao-e-um-jwt"), env);
  ok(r.status === 302, "302", String(r.status));
});

await caso("JSON válido mas não-objeto no token (corpo null) → login, sem exceção", async () => {
  for (const lixo of ["e30.bnVsbA.AA", "bnVsbA.e30.AA", "W10.W10.AA"]) {
    const r = await gate.fetch(req("/app/", "tr_sess=" + lixo), env);
    ok(r.status === 302, lixo + " → 302", String(r.status));
  }
});

await caso("/admin com papel teste → 403", async () => {
  papeis.u1 = "teste";
  const r = await gate.fetch(req("/admin/", "tr_sess=" + (await token())), env);
  ok(r.status === 403, "403", String(r.status));
});

await caso("/admin com admin → 200", async () => {
  papeis.u2 = "admin";
  const r = await gate.fetch(req("/admin/", "tr_sess=" + (await token({ sub: "u2" }))), env);
  ok(r.status === 200, "200", String(r.status));
});

await caso("/crm: colaborador entra, cliente não", async () => {
  papeis.c = "colaborador"; papeis.k = "cliente";
  const a = await gate.fetch(req("/crm/", "tr_sess=" + (await token({ sub: "c" }))), env);
  const b = await gate.fetch(req("/crm/", "tr_sess=" + (await token({ sub: "k" }))), env);
  ok(a.status === 200, "colaborador 200", String(a.status));
  ok(b.status === 403, "cliente 403", String(b.status));
});

await caso("/admin sem cookie → login (não 403)", async () => {
  const r = await gate.fetch(req("/admin/"), env);
  ok(r.status === 302 && r.headers.get("location") === "/entrar.html?next=%2Fadmin%2F", "302 para login", r.headers.get("location"));
});

await caso("/console continua público", async () => {
  const r = await gate.fetch(req("/console/"), env);
  ok(r.status === 200, "200");
});

await caso("/application.html não é confundido com /app", async () => {
  const r = await gate.fetch(req("/application.html"), env);
  ok(r.status === 200, "200");
});

await caso("token HS256 (chave legada) é conferido no /auth/v1/user", async () => {
  const t = await token({ alg: "HS256", kid: undefined });
  const r = await gate.fetch(req("/app/", "tr_sess=" + t), env);
  ok(r.status === 200, "válido → 200", String(r.status));
  ok(chamadas.includes(SUPA + "/auth/v1/user"), "consultou /auth/v1/user");
  _limparCaches(); usuarioHs256Valido = false;
  const r2 = await gate.fetch(req("/app/", "tr_sess=" + t), env);
  ok(r2.status === 302, "recusado → 302", String(r2.status));
});

await caso("JWKS fica em cache entre requisições", async () => {
  const t = await token();
  await gate.fetch(req("/app/", "tr_sess=" + t), env);
  await gate.fetch(req("/app/", "tr_sess=" + t), env);
  ok(chamadas.filter((c) => c.endsWith("jwks.json")).length === 1, "um só fetch do JWKS");
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\ntudo certo");
