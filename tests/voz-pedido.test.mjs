// Atendimento da função de voz (supabase/functions/voz/pedido.ts, ligado ao Deno.serve por index.ts):
// cada resposta que o chat pode receber, com um cliente do Supabase e um sintetizador simulados.
import test from "node:test";
import assert from "node:assert/strict";
import { criarAtendente } from "../supabase/functions/voz/pedido.ts";

const ORIGEM = "https://trustio.com.br";
const CONFIG = { xaiKey: "x", xaiVoz: "rex" };
const USUARIO = { id: "u1", email_confirmed_at: "2026-10-01" };

// Cliente falso: `rpcs` diz o que cada função do banco devolve ({ data, error }) ou uma função que pode lançar.
function montar({ usuario = USUARIO, rpcs = {}, sintetizarFn, config = CONFIG } = {}) {
  const padrao = {
    acesso_do_chat: { data: { aberto: true }, error: null },
    voz_situacao: { data: { acesso: "livre", demo_restante: 0 }, error: null },
    reservar_voz: { data: { ok: true, demo: false, restante: 59000 }, error: null },
    devolver_voz: { data: null, error: null },
  };
  const chamadas = [];
  const admin = {
    auth: { getUser: async () => (usuario ? { data: { user: usuario }, error: null } : { data: { user: null }, error: { message: "jwt" } }) },
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      const r = nome in rpcs ? rpcs[nome] : padrao[nome];
      return typeof r === "function" ? r(args) : r;
    },
  };
  const falados = [];
  const atender = criarAtendente({
    criarAdmin: () => admin, config, limiteDiario: 60000, demo: 1500,
    sintetizarFn: sintetizarFn ?? (async (texto, idioma) => { falados.push({ texto, idioma }); return { resposta: new Response("mp3"), provedor: "xai" }; }),
  });
  return { atender, chamadas, falados };
}
// Pedido com a forma do Request (method, headers, text): assim dá para mandar o content-length que se quiser.
function pedido({ method = "POST", corpo = JSON.stringify({ texto: "Olá, tudo bem?" }), token = "tok", tamanho } = {}) {
  const headers = new Headers({ origin: ORIGEM });
  if (token) headers.set("authorization", "Bearer " + token);
  if (tamanho !== undefined) headers.set("content-length", String(tamanho));
  return { method, headers, text: async () => corpo };
}
const comCors = (r) => assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGEM);
const semLog = async (fn) => { const antes = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = antes; } };

test("pedido certo: áudio com os cabeçalhos de cota e CORS", async () => {
  const m = montar();
  const r = await m.atender(pedido());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "audio/mpeg");
  assert.equal(r.headers.get("X-Voz-Provedor"), "xai");
  assert.equal(r.headers.get("X-Voz-Restante"), "59000");
  comCors(r);
  assert.equal(await r.text(), "mp3");
  assert.deepEqual(m.falados, [{ texto: "Olá, tudo bem?", idioma: "pt" }]);
  assert.equal(m.chamadas.find((c) => c.nome === "reservar_voz").args.p_caracteres, "Olá, tudo bem?".length);
});

test("sem token ou com token inválido: 401, sem tocar no banco", async () => {
  let m = montar();
  assert.equal((await m.atender(pedido({ token: "" }))).status, 401);
  m = montar({ usuario: null });
  assert.equal((await m.atender(pedido())).status, 401);
  assert.equal(m.chamadas.length, 0);
});

test("GET: diz se a voz está ligada e o acesso, sem reservar nada", async () => {
  const m = montar({ rpcs: { voz_situacao: { data: { acesso: "teste", demo_restante: 700 }, error: null } } });
  const r = await m.atender(pedido({ method: "GET" }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { configurada: true, acesso: "teste", demo_restante: 700 });
  assert.ok(!m.chamadas.some((c) => c.nome === "reservar_voz"));
});

test("voz sem provedor, e-mail sem confirmar, chat fechado: recusa antes de ler o corpo", async () => {
  assert.equal((await montar({ config: {} }).atender(pedido())).status, 503);
  const semEmail = await montar({ usuario: { id: "u1", email_confirmed_at: null } }).atender(pedido());
  assert.deepEqual([semEmail.status, (await semEmail.json()).error], [403, "email_nao_confirmado"]);
  const fechado = await montar({ rpcs: { acesso_do_chat: { data: { aberto: false }, error: null } } }).atender(pedido());
  assert.deepEqual([fechado.status, (await fechado.json()).error], [403, "chat_ainda_fechado"]);
});

test("ponto 13: corpo acima de 64 kB devolve 413, pelo content-length ou pelo tamanho lido", async () => {
  let m = montar();
  let r = await m.atender(pedido({ tamanho: 64 * 1024 + 1 }));
  assert.deepEqual([r.status, (await r.json()).error], [413, "pedido_grande"]);
  comCors(r);
  m = montar();
  r = await m.atender(pedido({ corpo: JSON.stringify({ texto: "a".repeat(64 * 1024) }) }));   // sem content-length
  assert.equal(r.status, 413);
  assert.ok(!m.chamadas.some((c) => c.nome === "reservar_voz"), "nada é reservado");
  r = await montar().atender(pedido({ tamanho: 64 * 1024, corpo: JSON.stringify({ texto: "Oi." }) }));
  assert.equal(r.status, 200, "no limite ainda passa");
});

test("ponto 13: corpo que não é um objeto JSON devolve 400", async () => {
  for (const corpo of ["", "{", "null", "5", "\"texto\""]) {
    const r = await montar().atender(pedido({ corpo }));
    assert.deepEqual([r.status, (await r.json()).error], [400, "pedido_invalido"], JSON.stringify(corpo));
  }
  const vazio = await montar().atender(pedido({ corpo: JSON.stringify({ texto: "```js\nx\n```" }) }));
  assert.deepEqual([vazio.status, (await vazio.json()).error], [400, "texto_vazio"]);
});

test("ponto 9: voz_situacao com erro (ou sem dados) devolve 503 em vez de cortar a fala em 500 caracteres", async () => {
  const longo = "Uma frase comum de resposta. ".repeat(60);   // ~1700 caracteres: caberia para assinante, não na demonstração
  for (const situacao of [{ data: null, error: { message: "timeout" } }, { data: null, error: null }]) {
    const m = montar({ rpcs: { voz_situacao: situacao } });
    const r = await semLog(() => m.atender(pedido({ corpo: JSON.stringify({ texto: longo }) })));
    assert.deepEqual([r.status, (await r.json()).error], [503, "voz_indisponivel"]);
    comCors(r);
    assert.ok(!m.chamadas.some((c) => c.nome === "reservar_voz"), "nada é reservado");
    assert.equal(m.falados.length, 0, "nada é falado");
  }
  const m = montar();
  await m.atender(pedido({ corpo: JSON.stringify({ texto: longo }) }));
  assert.ok(m.falados[0].texto.length > 1000, "assinante ouve o texto inteiro");
  const demo = montar({ rpcs: { voz_situacao: { data: { acesso: "teste", demo_restante: 1500 }, error: null } } });
  await demo.atender(pedido({ corpo: JSON.stringify({ texto: longo }) }));
  assert.ok(demo.falados[0].texto.length <= 500, "na demonstração o teto é 500");
});

test("reserva recusada: 402 na demonstração esgotada, 429 no limite do dia; reserva com erro: 503", async () => {
  const caso = async (reserva) => (await semLog(() => montar({ rpcs: { reservar_voz: reserva } }).atender(pedido()))).status;
  assert.equal(await caso({ data: { ok: false, error: "voz_demo_esgotada" }, error: null }), 402);
  assert.equal(await caso({ data: { ok: false, error: "voz_limite_diario" }, error: null }), 429);
  assert.equal(await caso({ data: { ok: false, error: "voz_so_assinantes" }, error: null }), 403);
  assert.equal(await caso({ data: null, error: { message: "x" } }), 503);
});

test("ponto 9: provedores falharam; a cota é devolvida e a resposta sai com CORS mesmo se a devolução falhar ou lançar", async () => {
  const falhou = async () => { throw Object.assign(new Error("voz_indisponivel"), { falhas: ["xai:prazo"] }); };
  const casos = {
    "devolução certa": { data: null, error: null },
    "devolução com erro do banco": { data: null, error: { message: "500" } },
    "devolução que lança (rede)": () => { throw new Error("fetch failed"); },
  };
  for (const [nome, devolver] of Object.entries(casos)) {
    const m = montar({ sintetizarFn: falhou, rpcs: { devolver_voz: devolver } });
    const r = await semLog(() => m.atender(pedido()));
    assert.equal(r.status, 502, nome);
    comCors(r);
    assert.deepEqual(await r.json(), { error: "voz_indisponivel", falhas: ["xai:prazo"] }, nome);
    const d = m.chamadas.find((c) => c.nome === "devolver_voz");
    assert.deepEqual(d.args, { p_user_id: "u1", p_caracteres: "Olá, tudo bem?".length, p_demo: false }, nome);
  }
});

test("OPTIONS e método estranho", async () => {
  const m = montar();
  const o = await m.atender(pedido({ method: "OPTIONS" }));
  assert.equal(o.status, 204); comCors(o);
  assert.equal((await m.atender(pedido({ method: "DELETE" }))).status, 405);
});
