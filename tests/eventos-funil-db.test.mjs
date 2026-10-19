// eventos_funil depois de 20261019120000: o site não forja trial_activated, signup_complete conta
// uma vez por usuário e o webhook registra o pagamento com as UTMs do cadastro, sem o e-mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = new PGlite();
  // O mínimo do Supabase que as migrações usam: papéis, auth.users, extensions, is_admin(),
  // crm_leads e comissoes. Os grants imitam os padrões do Supabase (o RLS é quem filtra).
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema extensions; create function extensions.gen_random_uuid() returns uuid language sql as $$ select gen_random_uuid() $$;
    grant usage on schema extensions to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function public.is_admin() returns boolean language sql stable as $$ select false $$;
    create table public.crm_leads(id uuid primary key default gen_random_uuid(), user_id uuid, email text);
    create unique index on public.crm_leads (lower(email));
    create table public.comissoes(stripe_session_id text primary key, atribuicao text);`);
  await db.exec(migration('20261001200000_eventos_funil.sql'));
  await db.exec(migration('20261019120000_eventos_funil_atribuicao.sql'));
  await db.exec(`grant insert on public.eventos_funil to anon, authenticated;
    grant select, insert on public.eventos_funil to service_role;`);
  for (const [n, email] of [[1, 'ana@exemplo.com'], [2, 'beto@exemplo.com'], [3, 'caio@exemplo.com']]) {
    await db.query('insert into auth.users values ($1, $2)', [uid(n), email]);
    await db.query('insert into public.crm_leads (user_id, email) values ($1, $2)', [uid(n), email]);
  }
  const como = (papel) => db.exec(`reset role; ${papel ? `set role ${papel};` : ''}`);
  const grava = (evento, meta) => db.query('insert into public.eventos_funil (evento, meta) values ($1, $2)', [evento, meta]);
  const linhas = async (evento) => {
    await como(null);
    return (await db.query('select meta from public.eventos_funil where evento = $1 order by criado_em, id', [evento])).rows.map((r) => r.meta);
  };
  return { db, como, grava, linhas };
}

test('site (anon) grava signup_start e signup_complete, mas não trial_activated', async () => {
  const { como, grava, linhas } = await setup();
  await como('anon');
  await grava('signup_start', { lang: 'pt', utm_source: 'instagram' });
  await grava('signup_complete', { user_id: uid(1), fonte_atrib: 'local' });
  await assert.rejects(grava('trial_activated', { tipo: 'pagamento', stripe_session: 'cs_forjada' }), /row-level security/);
  await como('authenticated');
  await assert.rejects(grava('trial_activated', { tipo: 'pagamento' }), /row-level security/);
  assert.equal((await linhas('signup_start')).length, 1);
  assert.equal((await linhas('signup_complete')).length, 1);
  assert.equal((await linhas('trial_activated')).length, 0);
});

test('signup_complete repetido (outro navegador) ou de usuário inexistente é descartado sem erro', async () => {
  const { como, grava, linhas } = await setup();
  await como('anon');
  await grava('signup_complete', { user_id: uid(1), fonte_atrib: 'metadata', utm_source: 'instagram' });
  await grava('signup_complete', { user_id: uid(1), fonte_atrib: 'nenhuma' });  // navegador B
  await grava('signup_complete', { user_id: uid(2), fonte_atrib: 'local' });
  await grava('signup_complete', { user_id: uid(99), fonte_atrib: 'local' });   // conta que não existe
  await grava('signup_complete', { user_id: '<script>', fonte_atrib: 'local' });
  const sc = await linhas('signup_complete');
  assert.deepEqual(sc.map((m) => [m.user_id, m.fonte_atrib]), [[uid(1), 'metadata'], [uid(2), 'local']]);
});

test('registrar_trial_activated: só service_role; copia UTMs do cadastro, sem e-mail; idempotente', async () => {
  const { db, como, grava, linhas } = await setup();
  await como('anon');
  await grava('signup_complete', { user_id: uid(1), criado_em: '2026-10-26T12:00:00Z', fonte_atrib: 'metadata',
    utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'lancamento-b2c-out26', utm_content: 'w1-ig-01',
    ref_host: 'l.instagram.com', landing: '/ia-sem-censura.html', utm_term: '<script>alert(1)</script>', email: 'vazou@x.com' });
  await grava('signup_complete', { user_id: uid(2), fonte_atrib: 'local' });

  const chama = (args) => db.query('select public.registrar_trial_activated($1, $2, $3, $4) as r', args).then((x) => x.rows[0].r);
  await como('anon');
  await assert.rejects(chama(['cs_1', 'ana@exemplo.com', 'price_anual', 71100]), /permission denied/);
  await como('authenticated');
  await assert.rejects(chama(['cs_1', 'ana@exemplo.com', 'price_anual', 71100]), /permission denied/);

  await como(null);
  await db.query("insert into public.comissoes values ('cs_1', 'cupom')");
  await como('service_role');
  assert.deepEqual(await chama(['cs_1', ' ANA@exemplo.com ', 'price_anual', 71100]), { ok: true, registrado: true, fonte_atrib: 'metadata' });
  assert.equal((await chama(['cs_1', 'ana@exemplo.com', 'price_anual', 71100])).motivo, 'repetido');  // a Stripe reentrega
  assert.equal((await chama(['cs_2', 'beto@exemplo.com', 'price_mensal', 7900])).fonte_atrib, 'local');
  assert.equal((await chama(['cs_3', 'sem-conta@exemplo.com', null, 2490])).fonte_atrib, 'nenhuma');
  assert.equal((await chama(['', 'ana@exemplo.com', null, 0])).error, 'sem_sessao');

  const pagos = await linhas('trial_activated');
  assert.equal(pagos.length, 3);
  assert.deepEqual(pagos[0], { tipo: 'pagamento', stripe_session: 'cs_1', price_id: 'price_anual', valor_centavos: 71100,
    atrib_afiliado: 'cupom', fonte_atrib: 'metadata', utm_source: 'instagram', utm_medium: 'social',
    utm_campaign: 'lancamento-b2c-out26', utm_content: 'w1-ig-01', ref_host: 'l.instagram.com', landing: '/ia-sem-censura.html' });
  assert.deepEqual(pagos[2], { tipo: 'pagamento', stripe_session: 'cs_3', valor_centavos: 2490, atrib_afiliado: 'nenhum', fonte_atrib: 'nenhuma' });
  assert.ok(!JSON.stringify(pagos).includes('@'), 'nenhum e-mail no meta');
  assert.ok(!JSON.stringify(pagos).includes('script'), 'valor fora do formato não é copiado');
});
