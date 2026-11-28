import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
const raw = readFileSync(new URL('../supabase/functions/lembrete-oferta/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
const js = stripTypeScriptTypes(raw, { mode: 'strip' }) + '\nglobalThis.__mensagem = mensagem;';
const TOKEN = 'a'.repeat(40);
function harness({ fila, key = 'fixture', falha = false } = {}) {
  let handler; const sends = [], updates = [], rpcs = [];
  const db = { rpc: async (name, args) => { rpcs.push({ name, args }); return { data: fila ?? [], error: null }; },
    from: () => ({ update: (v) => ({ eq: async (_c, id) => { updates.push({ id, ...v }); return { error: null }; } }) }) };
  const ctx = { Deno: { env: { get: (n) => (n === 'RESEND_API_KEY' ? key : n === 'EMAIL_FROM' ? undefined : 'fixture') }, serve: (fn) => { handler = fn; } },
    createClient: () => db, Response, Date, AbortSignal, TextEncoder, crypto, Uint8Array, Array, JSON, Promise,
    setTimeout: (fn) => setTimeout(fn, 0),
    fetch: async (url, options) => { sends.push({ url, options, body: JSON.parse(options.body) }); return new Response(JSON.stringify(falha ? { message: 'x' } : { id: 'prov-' + sends.length }), { status: falha ? 422 : 200 }); } };
  ctx.globalThis = ctx;
  vm.runInNewContext(js, ctx);
  const invoke = (headers = { 'x-trustio-disparo': TOKEN }, method = 'POST') => handler(new Request('https://fixture.test', { method, headers }));
  return { invoke, sends, updates, rpcs, mensagem: ctx.__mensagem };
}
const L = (extra = {}) => ({ id: '00000000-0000-0000-0000-000000000001', email: 'pessoa@test', nome: 'ana maria', teste_fim: null, ...extra });

test('texto aprovado: três situações, planos, link, aviso e descadastro', () => {
  const { mensagem } = harness();
  const agora = new Date('2026-11-28T12:00:00Z');
  const a = mensagem(L(), agora), b = mensagem(L({ teste_fim: '2026-11-29T17:32:00Z' }), agora), c = mensagem(L({ teste_fim: '2026-11-20T10:00:00Z' }), agora);
  assert.equal(a.subject, 'Seu acesso à Trustio: continue por R$ 24,90');
  assert.ok(a.text.startsWith('Olá, Ana.\n\nVocê criou sua conta na Trustio, mas ainda não fez a primeira pergunta. O teste grátis de 3 dias só começa a contar quando você enviar a primeira.'));
  assert.ok(b.text.includes('Seu teste grátis da Trustio termina em 29 de novembro de 2026 às 14:32 (horário de Brasília).'), b.text);
  assert.ok(c.text.includes('Seu teste grátis da Trustio terminou.'));
  for (const m of [a, b, c]) for (const v of ['Para continuar com uma IA privada e sem censura, escolha um plano:', 'Passe 7 dias: R$ 24,90, pagamento único, não renova sozinho',
    'Mensal: R$ 79 por mês', 'Anual: R$ 790 por ano (equivale a R$ 65,83 por mês)', 'O acesso é liberado assim que o pagamento é confirmado. Use no pagamento o mesmo e-mail da sua conta.',
    'https://trustio.com.br/planos.html#pessoal', 'Quem envia as perguntas responde pelo conteúdo delas e pelo uso que faz das respostas, nos termos da lei.', 'Equipe Trustio']) {
    assert.ok(m.text.includes(v), v); assert.ok(m.html.includes(v.replace(/"/g, '&quot;')), 'html: ' + v);
  }
  assert.ok(a.text.includes('responda com "sair"')); assert.ok(a.html.includes('responda com &quot;sair&quot;'));
  assert.equal(a.reply_to, 'contato@trustio.com.br'); assert.equal(a.from, 'Trustio <no-reply@send.trustio.com.br>');
  assert.equal(a.headers['List-Unsubscribe'], '<mailto:contato@trustio.com.br?subject=sair>');
  assert.ok(!/\*/.test(a.text), 'sem asterisco');
});
test('nome estranho ou com HTML não entra na saudação', () => {
  const { mensagem } = harness();
  for (const nome of ['<script>alert(1)</script>', 'a@b.com', '', null, '12345', 'x']) {
    const m = mensagem(L({ nome }));
    assert.ok(m.text.startsWith('Olá.\n'), String(nome)); assert.ok(!m.html.includes('<script>'));
  }
  assert.ok(mensagem(L({ nome: "d'ávila souza" })).text.startsWith("Olá, D'ávila."));
});
test('sem token, com token curto ou com token já usado: nada é enviado', async () => {
  const h = harness({ fila: [] });
  assert.equal((await h.invoke({})).status, 401); assert.equal((await h.invoke({ 'x-trustio-disparo': 'curto' })).status, 401);
  assert.equal(h.rpcs.length, 0);
  assert.equal((await h.invoke()).status, 401); assert.equal(h.sends.length, 0);
  assert.equal((await h.invoke(undefined, 'GET')).status, 405);
});
test('sem chave do provedor responde 503 sem consumir o token', async () => {
  const h = harness({ fila: [L()], key: '' });
  assert.equal((await h.invoke()).status, 503); assert.equal(h.rpcs.length, 0);
});
test('envia um e-mail por linha, com chave de idempotência, e grava o resultado', async () => {
  const fila = [L(), L({ id: '00000000-0000-0000-0000-000000000002', email: 'outra@test', teste_fim: '2020-01-01T00:00:00Z' })];
  const h = harness({ fila });
  const r = await h.invoke(); assert.equal(r.status, 202); assert.deepEqual(await r.json(), { aceitos: 2 });
  assert.equal(h.rpcs[0].name, 'crm_lembrete_reservar');
  assert.equal(h.rpcs[0].args.p_token_hash, createHash('sha256').update(TOKEN).digest('hex'));
  assert.equal(h.sends.length, 2);
  assert.deepEqual(h.sends.map((s) => s.body.to[0]), ['pessoa@test', 'outra@test']);
  assert.equal(h.sends[0].options.headers['Idempotency-Key'], 'lembrete-oferta/' + fila[0].id);
  assert.deepEqual(h.updates.map((u) => [u.id, u.provider_id, u.erro]), [[fila[0].id, 'prov-1', null], [fila[1].id, 'prov-2', null]]);
  assert.ok(h.updates.every((u) => u.enviado_em));
});
test('recusa do provedor fica registrada e a linha volta para a fila', async () => {
  const h = harness({ fila: [L()], falha: true });
  assert.equal((await h.invoke()).status, 202);
  assert.equal(h.updates.length, 1); assert.equal(h.updates[0].enviado_em, undefined);
  assert.equal(h.updates[0].reservado_em, null); assert.match(h.updates[0].erro, /422/);
});
