import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../assets/crm.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  var auditDlg ='), source.indexOf('  // Grava um campo'));
function harness(rpc) {
  const nodes = new Map(), timers = new Map(); let timer = 0;
  const $ = key => {
    if (!nodes.has(key)) nodes.set(key, { value: '', dataset: { id: 'lead' }, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, showModal() {}, close() { this.listeners.close(); } });
    return nodes.get(key);
  };
  const l = { user_id: 'user', email: 'a@test', nome: 'A' };
  const ctx = { $, sb: { rpc }, dlg: $('[detail]'), eu: { papel: 'admin', id: 'admin' }, lead: () => l,
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    fmt: s => s, setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(ctx); vm.runInContext(block, ctx);
  return { ctx, $, timers };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function query(range) { return { select() { return this; }, order() { return this; }, range }; }
test('busca literal preserva entidades, caixa e segurança em mensagens/anexos', () => {
  const { ctx } = harness();
  assert.equal(ctx.marcar('amp &', 'amp'), '<mark>amp</mark> &amp;');
  assert.equal(ctx.marcar('<script>&', '<script>'), '<mark>&lt;script&gt;</mark>&amp;');
  assert.equal(ctx.marcar('A+B a+b', 'a+b'), '<mark>A+B</mark> <mark>a+b</mark>');
  assert.equal(ctx.marcar('&amp;', '&'), '<mark>&amp;</mark>amp;');
  assert.equal(ctx.corpoMensagem('[[anexo: doc]]\namp &\n[[/anexo]]', 'amp'), '<details class="audit-anexo"><summary>Anexo: doc</summary><pre><mark>amp</mark> &amp;</pre></details>');
});
test('paginação inclui mais de 20.000 linhas e desempata por id', async () => {
  const calls = [], orders = [];
  const { ctx } = harness((name, args) => ({ select() { return this; }, order(col) { orders.push(col); return this; }, range(a, b) {
    calls.push([name, args.p_user_id, a, b]); return Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(1000, 20001 - a)) }, (_, i) => ({ id: a + i })) });
  } }));
  const rows = await ctx.todasAsLinhas('messages', 'id', 'user', 0);
  assert.equal(rows.length, 20001); assert.equal(rows.at(-1).id, 20000); assert.equal(calls.length, 21);
  assert.equal(calls[0][0], 'crm_investigar_messages'); assert.deepEqual(orders.slice(0, 2), ['created_at', 'id']);
});
test('página exata consulta a seguinte e erros não geram histórico parcial', async () => {
  let calls = 0;
  const { ctx } = harness(() => query(() => Promise.resolve({ data: calls++ === 0 ? Array(1000).fill({}) : [] })));
  assert.equal((await ctx.todasAsLinhas('messages', 'id', 'user', 0)).length, 1000); assert.equal(calls, 2);
  ctx.sb.rpc = () => query(() => Promise.resolve({ error: new Error('falha') }));
  await assert.rejects(ctx.todasAsLinhas('messages', 'id', 'user', 0), /falha/);
});
test('reabertura do mesmo lead ignora sucesso e erro antigos e limpa debounce', async () => {
  const requests = [];
  const { ctx, $, timers } = harness(() => query(() => new Promise((resolve, reject) => requests.push({ resolve, reject }))));
  ctx.abrirAuditoria(); $('[data-audit-busca]').listeners.input(); assert.equal(timers.size, 1);
  $('[data-audit]').close(); assert.equal(timers.size, 0);
  ctx.abrirAuditoria();
  requests[2].resolve({ data: [] }); requests[3].resolve({ data: [{ id: 'new', content: 'atual', role: 'user', created_at: 'agora' }] }); await flush();
  requests[0].resolve({ data: [] }); requests[1].resolve({ data: [{ id: 'old' }] }); await flush();
  assert.equal(ctx.audit.msgs[0].id, 'new');
  assert.equal($('[data-audit-baixar]').disabled, false);
  ctx.abrirAuditoria(); $('[data-audit]').close(); ctx.abrirAuditoria();
  ctx.lead = () => ({ user_id: 'other', email: 'b@test', nome: 'B' });
  $('[data-audit]').close(); ctx.abrirAuditoria();
  requests[4].reject(new Error('erro antigo')); requests[5].resolve({ data: [] }); await flush();
  assert.equal($('[data-audit-status]').textContent, 'Carregando conversas e mensagens…');
});
test('RPCs exigem admin no servidor e não restauram leitura geral', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261010150000_crm_investigacao.sql', import.meta.url), 'utf8');
  for (const table of ['conversations', 'messages']) {
    const fn = sql.slice(sql.indexOf(`create or replace function public.crm_investigar_${table}`));
    assert.match(fn, /security definer set search_path = public/);
    assert.match(fn, /auth.uid\(\) is null or not public.is_admin\(\)/);
    assert.match(fn, /errcode = '42501'/); assert.match(fn, /where t.user_id = p_user_id/);
    assert.ok(fn.indexOf('raise exception') < fn.indexOf('return query'));
    assert.ok(sql.includes(`revoke all on function public.crm_investigar_${table}(uuid) from public, anon, authenticated`));
    assert.ok(sql.includes(`grant execute on function public.crm_investigar_${table}(uuid) to authenticated`));
  }
  assert.doesNotMatch(sql, /create policy/i);
});

test('resumo e JSON usam o histórico completo, além do limite visual de 400', () => {
  const { ctx, $ } = harness();
  ctx.audit.lead = { user_id: 'user', email: 'a@test' };
  ctx.audit.msgs = Array.from({ length: 20001 }, (_, i) => ({ id: i, role: 'user', content: 'mensagem', created_at: String(i) }));
  let exported;
  ctx.Blob = class { constructor(parts) { exported = JSON.parse(parts[0]); } };
  ctx.URL = { createObjectURL: () => 'blob:test' };
  ctx.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  ctx.hoje = () => '2026-10-10';
  ctx.resumoAuditoria(); ctx.renderAuditoria(); ctx.baixarAuditoria();
  assert.match($('[data-audit-resumo]').innerHTML, /20001/);
  assert.match($('[data-audit-resumo]').innerHTML, /Última atividade<\/dt><dd>20000/);
  assert.match($('[data-audit-status]').textContent, /400 de 20001/);
  assert.equal(exported.mensagens.length, 20001);
  assert.equal(exported.mensagens.at(-1).id, 20000);
});
