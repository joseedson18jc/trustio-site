// Atribuição de primeiro toque: assets/atribuicao.js (captura), funil.js (meta dos eventos) e
// conta.js (metadata do cadastro), rodados num contexto vm com location/localStorage simulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const fonte = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ATRIB = fonte('assets/atribuicao.js');
const FUNIL = fonte('assets/funil.js');
const CONTA = fonte('assets/conta.js');
const plano = (x) => (x == null ? x : JSON.parse(JSON.stringify(x))); // objeto do vm → objeto daqui
const DIA = 24 * 60 * 60 * 1000;

function armazenamento(mapa, privado = false) {
  return {
    getItem: (k) => { if (privado) throw new Error('SecurityError'); return mapa.has(k) ? mapa.get(k) : null; },
    setItem: (k, v) => { if (privado) throw new Error('QuotaExceededError'); mapa.set(k, String(v)); },
    removeItem: (k) => mapa.delete(k),
  };
}

// Uma aba do navegador: `local` é o localStorage (compartilhe o Map para simular visitas seguidas).
function aba(url, { referrer = '', local = new Map(), privado = false, extra = {} } = {}) {
  const u = new URL(url);
  const enviados = [];
  const ctx = {
    location: { href: u.href, origin: u.origin, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash },
    document: { referrer, cookie: '' },
    localStorage: armazenamento(local, privado),
    sessionStorage: armazenamento(new Map(), privado),
    URL, URLSearchParams, console,
    fetch: (destino, opts) => { enviados.push({ destino, corpo: JSON.parse(opts.body) }); return Promise.resolve({ ok: true }); },
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, local, enviados, rodar: (src) => vm.runInContext(src, ctx) };
}
const visita = (url, opcoes) => { const a = aba(url, opcoes); a.rodar(ATRIB); return a; };
const primeiro = (local) => JSON.parse(local.get('tr-1toque'));

test('normaliza UTMs: minúsculas, sem acento, só [a-z0-9._-], até 64; referrer só o domínio; landing sem query', () => {
  const longo = 'X'.repeat(200);
  const { local, ctx } = visita('https://trustio.com.br/ia-sem-censura.html?utm_source=Instagram&utm_medium=SOCIAL'
    + '&utm_campaign=Lan%C3%A7amento%20B2C&utm_content=%3Cscript%3Ealert(1)%3C%2Fscript%3E&utm_term=' + longo,
  { referrer: 'https://l.instagram.com/?u=https%3A%2F%2Ftrustio.com.br&e=ana%40x.com' });
  const t = primeiro(local);
  assert.equal(t.utm_source, 'instagram');
  assert.equal(t.utm_medium, 'social');
  assert.equal(t.utm_campaign, 'lancamento-b2c');
  assert.equal(t.utm_content, 'script-alert-1-script');
  assert.equal(t.utm_term, 'x'.repeat(64));
  assert.equal(t.ref_host, 'l.instagram.com');
  assert.equal(t.landing, '/ia-sem-censura.html');
  assert.ok(!Number.isNaN(Date.parse(t.toque_em)));
  assert.deepEqual(plano(ctx.TRUSTIO_ATRIB.ler()), t);
});

test('primeiro toque não é sobrescrito; o último toque com UTM fica em `ultimo`', () => {
  const local = new Map();
  visita('https://trustio.com.br/?utm_source=instagram&utm_medium=social&utm_campaign=lancamento-b2c-out26&utm_content=w1-ig-01', { local });
  visita('https://trustio.com.br/planos.html?utm_source=tiktok&utm_medium=social&utm_content=w2-tt-03-b', { local });
  const { ctx } = visita('https://trustio.com.br/cadastro.html', { local, referrer: 'https://www.google.com/' }); // direta: não muda nada
  const lido = plano(ctx.TRUSTIO_ATRIB.ler());
  assert.equal(lido.utm_source, 'instagram');
  assert.equal(lido.utm_content, 'w1-ig-01');
  assert.equal(lido.landing, '/');
  assert.equal(lido.ultimo.utm_source, 'tiktok');
  assert.equal(lido.ultimo.utm_content, 'w2-tt-03-b');
});

test('visita direta antes da campanha: primeiro toque fica direto, a campanha aparece em `ultimo`', () => {
  const local = new Map();
  visita('https://trustio.com.br/', { local });
  const { ctx } = visita('https://trustio.com.br/?utm_source=x&utm_medium=social', { local });
  const lido = plano(ctx.TRUSTIO_ATRIB.ler());
  assert.equal(lido.utm_source, undefined);
  assert.equal(lido.ultimo.utm_source, 'x');
});

test('primeiro toque com mais de 90 dias é substituído', () => {
  const local = new Map([['tr-1toque', JSON.stringify({ utm_source: 'velho', landing: '/', toque_em: new Date(Date.now() - 91 * DIA).toISOString() })]]);
  visita('https://trustio.com.br/?utm_source=novo', { local });
  assert.equal(primeiro(local).utm_source, 'novo');
});

test('o próprio site, o login e o pagamento não contam como origem', () => {
  for (const referrer of ['https://trustio.com.br/planos.html', 'https://www.trustio.com.br/', 'https://accounts.google.com/o/oauth2',
    'https://mjdaluioyutnxlyomzyd.supabase.co/auth/v1/verify', 'https://checkout.stripe.com/c/pay', 'nao-e-url']) {
    assert.equal(primeiro(visita('https://trustio.com.br/', { referrer }).local).ref_host, undefined, referrer);
  }
  assert.equal(primeiro(visita('https://trustio.com.br/', { referrer: 'https://www.google.com/' }).local).ref_host, 'www.google.com');
});

test('?ref= de afiliado sem UTM vira afiliado/parceria/<cupom> e grava o cookie também onde não há app.js', () => {
  const a = visita('https://trustio.com.br/ia-sem-censura.html?ref=luisc10');
  assert.match(a.ctx.document.cookie, /^trustio_ref=LUISC10; Max-Age=7776000; Path=\/; SameSite=Lax; Secure$/);
  const t = primeiro(a.local);
  assert.deepEqual([t.utm_source, t.utm_medium, t.utm_content], ['afiliado', 'parceria', 'luisc10']);

  const comUtm = visita('https://trustio.com.br/?ref=LUISC10&utm_source=youtube&utm_medium=video');
  assert.equal(primeiro(comUtm.local).utm_source, 'youtube');
  assert.match(comUtm.ctx.document.cookie, /trustio_ref=LUISC10/);

  const invalido = visita('https://trustio.com.br/?ref=%3Cscript%3E');
  assert.equal(invalido.ctx.document.cookie, '');
  assert.equal(primeiro(invalido.local).utm_source, undefined);
});

test('volta do Google/link de e-mail e o /app não capturam; o /app só lê', () => {
  const volta = visita('https://trustio.com.br/entrar.html#access_token=abc&type=signup', { referrer: 'https://mail.google.com/' });
  assert.equal(volta.local.size, 0);
  assert.equal(visita('https://trustio.com.br/entrar.html#error_description=cancelado').local.size, 0);

  const local = new Map();
  visita('https://trustio.com.br/?utm_source=reddit&utm_medium=comunidade', { local });
  const app = visita('https://trustio.com.br/app/?utm_source=outro', { local });
  assert.equal(primeiro(local).utm_source, 'reddit');
  assert.equal(plano(app.ctx.TRUSTIO_ATRIB.ler()).utm_source, 'reddit');
  assert.equal(visita('https://trustio.com.br/en/app/?utm_source=outro').local.size, 0);
});

test('modo privado (storage bloqueado) não quebra a página', () => {
  const a = visita('https://trustio.com.br/?utm_source=instagram', { privado: true });
  assert.equal(a.ctx.TRUSTIO_ATRIB.ler(), null);
});

test('limpar() aceita só os campos conhecidos no formato certo (metadata e storage são editáveis)', () => {
  const { ctx } = visita('https://trustio.com.br/');
  const L = ctx.TRUSTIO_ATRIB.limpar;
  assert.deepEqual(plano(L({ utm_source: '<b>x</b>', utm_medium: 'social', email: 'ana@x.com', landing: '/x?y=1',
    ref_host: 'l.instagram.com', toque_em: '2026-10-26T12:00:00.000Z', ultimo: { utm_source: 'tiktok', nome: 'Ana' } })),
  { utm_medium: 'social', ref_host: 'l.instagram.com', toque_em: '2026-10-26T12:00:00.000Z', ultimo: { utm_source: 'tiktok' } });
  assert.equal(L(null), null);
  assert.equal(L('instagram'), null);
  assert.equal(L({ utm_source: 'A'.repeat(65) }), null);
});

// ─── funil.js ──────────────────────────────────────────────────────────────
const AUTH = { url: 'https://abcd.supabase.co', key: 'sb_publishable_x', lang: 'pt' };
const USER = (extra = {}) => ({ id: '00000000-0000-4000-8000-000000000001', email_confirmed_at: '2026-10-26T12:05:00Z',
  created_at: '2026-10-26T12:00:00Z', user_metadata: {}, ...extra });

function abrirApp(user, local = new Map()) {
  local.set('sb-abcd-auth-token', JSON.stringify({ user }));
  const a = aba('https://trustio.com.br/app/', { local, extra: { TRUSTIO_AUTH: AUTH } });
  a.rodar(ATRIB);
  a.rodar(FUNIL);
  return a.enviados.map((e) => e.corpo[0]);
}

test('signup_complete em outro navegador usa o metadata do cadastro (fonte_atrib=metadata)', () => {
  const atribuicao = { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'lancamento-b2c-out26', utm_content: 'w1-ig-01',
    landing: '/ia-sem-censura.html', toque_em: '2026-10-26T11:58:00.000Z', utm_term: '<script>' };
  const [ev] = abrirApp(USER({ user_metadata: { nome: 'Ana', atribuicao } }));
  assert.equal(ev.evento, 'signup_complete');
  assert.deepEqual(ev.meta, { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'lancamento-b2c-out26', utm_content: 'w1-ig-01',
    landing: '/ia-sem-censura.html', toque_em: '2026-10-26T11:58:00.000Z',
    user_id: USER().id, criado_em: USER().created_at, lang: 'pt', fonte_atrib: 'metadata' });
});

test('Google (sem metadata, mesmo navegador) usa o localStorage (fonte_atrib=local); sem nada, "nenhuma"', () => {
  const local = new Map();
  visita('https://trustio.com.br/voice.html?utm_source=youtube&utm_medium=video&utm_content=w1-yt-02', { local });
  const [google] = abrirApp(USER(), local);
  assert.equal(google.meta.fonte_atrib, 'local');
  assert.equal(google.meta.utm_source, 'youtube');
  assert.equal(google.meta.landing, '/voice.html');

  const [nada] = abrirApp(USER());
  assert.deepEqual(nada.meta, { user_id: USER().id, criado_em: USER().created_at, lang: 'pt', fonte_atrib: 'nenhuma' });
  assert.equal(abrirApp(USER({ email_confirmed_at: null })).length, 0, 'sem e-mail confirmado, sem evento');
});

test('signup_start leva a atribuição e marca conta_existente sem esconder um cadastro novo depois', () => {
  const a = aba('https://trustio.com.br/cadastro.html?utm_source=x&utm_medium=social&utm_content=w1-x-01', { extra: { TRUSTIO_AUTH: AUTH } });
  a.rodar(ATRIB);
  a.rodar(FUNIL);
  a.ctx.TRUSTIO_FUNIL.inicio({ conta_existente: true });
  a.ctx.TRUSTIO_FUNIL.inicio({ conta_existente: false });
  a.ctx.TRUSTIO_FUNIL.inicio();
  const eventos = a.enviados.map((e) => e.corpo[0]);
  assert.equal(eventos.length, 2, 'um de cada tipo por aba');
  assert.equal(eventos[0].meta.conta_existente, true);
  assert.equal(eventos[1].meta.conta_existente, undefined);
  for (const ev of eventos) {
    assert.equal(ev.evento, 'signup_start');
    assert.deepEqual([ev.meta.utm_source, ev.meta.utm_content, ev.meta.landing, ev.meta.lang], ['x', 'w1-x-01', '/cadastro.html', 'pt']);
  }
});

// ─── conta.js ──────────────────────────────────────────────────────────────
async function cadastrar({ url = 'https://trustio.com.br/cadastro.html', local = new Map(), identities = [{ id: 'x' }] } = {}) {
  const chamadas = { signUp: [], inicio: [] };
  let enviar;
  const form = { addEventListener: (ev, fn) => { if (ev === 'submit') enviar = fn; }, reportValidity: () => true,
    querySelector: () => null, querySelectorAll: () => [] };
  const campos = { email: 'Ana@Exemplo.com', senha: 'senha-segura', nome: 'Ana', telefone: '', empresa: '', segmento: '' };
  const document = { documentElement: { lang: 'pt-BR' }, body: { dataset: {} }, referrer: '', cookie: '',
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => (id === 'cadastro-form' ? form : null) };
  const auth = {
    onAuthStateChange() {}, getSession: () => Promise.resolve({ data: { session: null } }),
    signUp: (args) => { chamadas.signUp.push(args); return Promise.resolve({ data: { user: { identities }, session: null }, error: null }); },
  };
  const a = aba(url, { local, extra: { document, FormData: function () { return { get: (k) => campos[k] }; },
    supabase: { createClient: () => ({ auth }) },
    TRUSTIO_AUTH: { ...AUTH, appPath: '/app/', loginPath: '/entrar.html', chaveVoltas: 'tr-voltas',
      sincronizarCookie() {}, gravarCookie() {}, destinoSeguro: (_, padrao) => padrao },
    TRUSTIO_FUNIL: { inicio: (opcoes) => chamadas.inicio.push(plano(opcoes)) } } });
  a.rodar(ATRIB);
  a.rodar(CONTA);
  enviar({ preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  return { chamadas, data: plano(chamadas.signUp[0].options.data), ler: plano(a.ctx.TRUSTIO_ATRIB.ler()) };
}

test('cadastro por e-mail leva o primeiro toque em options.data.atribuicao, com origem intacta', async () => {
  const { data, ler, chamadas } = await cadastrar({ url: 'https://trustio.com.br/cadastro.html?utm_source=linkedin&utm_medium=social&utm_content=w1-li-01' });
  assert.equal(data.origem, 'cadastro.html');
  assert.equal(data.nome, 'Ana');
  assert.deepEqual(data.atribuicao, ler);
  assert.equal(data.atribuicao.utm_source, 'linkedin');
  assert.deepEqual(chamadas.inicio, [{ conta_existente: false }]);
});

test('e-mail que já tem conta (identities vazio) marca conta_existente; sem primeiro toque, sem chave atribuicao', async () => {
  const { data, chamadas } = await cadastrar({ url: 'https://trustio.com.br/cadastro.html#access_token=x', identities: [] });
  assert.ok(!('atribuicao' in data));
  assert.deepEqual(chamadas.inicio, [{ conta_existente: true }]);
});

// ─── páginas ───────────────────────────────────────────────────────────────
test('atribuicao.js (arquivo, sem inline) entra nas páginas públicas, em entrar e no /app, antes de funil.js e conta.js', () => {
  const paginas = ['index.html', 'ia-sem-censura.html', 'planos.html', 'cadastro.html', 'voice.html', 'entrar.html', 'app/index.html',
    'en/index.html', 'en/planos.html', 'en/cadastro.html', 'en/voice.html', 'en/entrar.html', 'en/app/index.html'];
  for (const p of paginas) {
    const html = fonte(p);
    const i = html.search(/<script defer src="[^"]*assets\/atribuicao\.js\?v=[0-9a-f]{8}"><\/script>/);
    assert.ok(i > 0, p + ': sem atribuicao.js');
    for (const depois of ['assets/funil.js', 'assets/conta.js']) {
      const j = html.indexOf(depois);
      if (j >= 0) assert.ok(j > i, `${p}: ${depois} antes de atribuicao.js`);
    }
    assert.match(html, /script-src 'self'/, p + ': CSP sem script próprio');
  }
});
