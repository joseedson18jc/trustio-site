// Backend falso do /app para testes de navegador: fala o suficiente de Supabase (auth, PostgREST
// e a função chat em streaming) para a página real rodar sem tocar em produção nem gastar teste.
// Nada aqui é enviado ao servidor de verdade: o auth-config.js é servido apontando para este mock.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const REF = 'mjdaluioyutnxlyomzyd';
const USER_ID = '11111111-1111-4111-8111-111111111111';

export function novoEstado(extra = {}) {
  return {
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'teste@exemplo.com',
      email_confirmed_at: '2026-10-01T12:00:00Z', user_metadata: { nome: 'Ana Teste' }, app_metadata: {} },
    lead: { nome: 'Ana Teste', email: 'teste@exemplo.com', telefone: null, tipo: 'b2c', status: 'novo', papel: 'teste',
      plano: null, pago_chat_ate: null, pago_agentio_ate: null, pago_plano: null, acesso_modo: null, acesso_fim: null,
      mensagens_usadas: 0, teste_fim: null, onboarding_seen_at: null, whatsapp_numero: null,
      whatsapp_trial_status: null, whatsapp_trial_restante: null },
    prefs: null,
    conversations: [],          // { id, user_id, title, created_at, updated_at, skill }
    messages: [],               // { conversation_id, role, content, created_at, model }
    chat: { atrasoMs: 150, falhaNoMeio: false, resposta: 'Resposta de teste.' },
    chamadas: [],               // "METHOD caminho" de tudo o que a página pediu
    perguntas: 0,               // POSTs à função chat: o que gastaria o teste grátis
    ...extra,
  };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cors(), ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range' };
}
function lerCorpo(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });
}
function filtro(q, campo) { const v = q.get(campo); return v && v.startsWith('eq.') ? v.slice(3) : null; }
function linhas(req, res, lista) {
  const um = String(req.headers.accept || '').includes('vnd.pgrst.object');
  const prefer = String(req.headers.prefer || '');
  const extra = prefer.includes('count=exact') ? { 'Content-Range': `0-${Math.max(0, lista.length - 1)}/${lista.length}` } : {};
  if (req.method === 'HEAD') { res.writeHead(200, { ...cors(), ...extra }); return res.end(); }
  if (um) return lista.length ? json(res, 200, lista[0], extra) : json(res, 406, { code: 'PGRST116', message: 'no rows' });
  return json(res, 200, lista, extra);
}

export async function iniciarMock(estado) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname, q = url.searchParams;
    if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
    estado.chamadas.push(req.method + ' ' + p);
    if (!API.test(p)) return arquivo(req, res, p);
    const corpo = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await lerCorpo(req) : '';
    let dados = null; try { dados = corpo ? JSON.parse(corpo) : null; } catch { dados = null; }

    // ---- auth
    if (p === '/auth/v1/user') {
      if (req.method === 'PUT' && dados && dados.data) Object.assign(estado.user.user_metadata, dados.data);
      return json(res, 200, estado.user);
    }
    if (p === '/auth/v1/token') return json(res, 200, sessao(estado));
    if (p === '/auth/v1/logout') return json(res, 204);
    if (p === '/auth/v1/settings') return json(res, 200, { external: { google: true, email: true } });

    // ---- rpc
    if (p === '/rest/v1/rpc/free_trial_days') return json(res, 200, 3);
    if (p === '/rest/v1/rpc/mark_onboarding_seen') { estado.lead.onboarding_seen_at = new Date().toISOString(); return json(res, 200, null); }
    if (p.startsWith('/rest/v1/rpc/')) return json(res, 200, null);

    // ---- tabelas
    if (p === '/rest/v1/crm_leads') {
      if (req.method === 'PATCH' && dados) { Object.assign(estado.lead, dados); return json(res, 204); }
      return linhas(req, res, [estado.lead]);
    }
    if (p === '/rest/v1/admins') return linhas(req, res, []);
    if (p === '/rest/v1/preferencias_usuario') {
      if (req.method === 'POST' || req.method === 'PATCH') { estado.prefs = { ...(estado.prefs || {}), ...(Array.isArray(dados) ? dados[0] : dados) }; return json(res, 201, [estado.prefs]); }
      return linhas(req, res, estado.prefs ? [estado.prefs] : []);
    }
    if (p === '/rest/v1/conversations') {
      const id = filtro(q, 'id');
      if (req.method === 'DELETE') {
        estado.conversations = id ? estado.conversations.filter((c) => c.id !== id) : [];
        estado.messages = estado.messages.filter((m) => estado.conversations.some((c) => c.id === m.conversation_id));
        return json(res, 204);
      }
      if (req.method === 'PATCH' && dados) { estado.conversations.filter((c) => c.id === id).forEach((c) => Object.assign(c, dados)); return json(res, 204); }
      let lista = estado.conversations.filter((c) => !id || c.id === id);
      lista = [...lista].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      return linhas(req, res, lista);
    }
    if (p === '/rest/v1/messages') {
      const cid = filtro(q, 'conversation_id');
      return linhas(req, res, estado.messages.filter((m) => m.conversation_id === cid));
    }
    if (p.startsWith('/rest/v1/')) return linhas(req, res, []);
    if (p.startsWith('/storage/')) return json(res, 404, { error: 'not_found' });

    // ---- funções
    if (p === '/functions/v1/chat' && req.method === 'GET') return json(res, 200, { chat_aberto: true, configurado: true, modelos: [] });
    if (p === '/functions/v1/chat' && req.method === 'POST') return responderChat(estado, dados || {}, res);
    if (p.startsWith('/functions/v1/')) return json(res, 200, { configurada: false, acesso: 'teste', demo_restante: 0 });
    return json(res, 404, { error: 'nao_mockado', caminho: p });
  });
  estados.set(server, estado);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, estado, close: () => new Promise((r) => server.close(r)) };
}

// O próprio site, na mesma origem do mock: a CSP da página (connect-src 'self') vale como em produção.
const RAIZ = path.resolve(new URL('../../..', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };
const API = /^\/(auth|rest|functions|storage)\/v1\//;
function arquivo(req, res, p) {
  estadoDe(req).chamadas.pop();   // arquivo do site não é chamada de backend
  let alvo = path.join(RAIZ, decodeURIComponent(p));
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
  if (!fs.existsSync(alvo)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  let corpo = fs.readFileSync(alvo);
  // O auth-config.js aponta para este servidor em vez de produção.
  if (p.endsWith('/assets/auth-config.js')) corpo = Buffer.from(String(corpo).split(`https://${REF}.supabase.co`).join(`http://${req.headers.host}`));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : corpo);
}
const estados = new WeakMap();
function estadoDe(req) { return estados.get(req.socket.server); }

// A função chat de verdade: cria a conversa ANTES de começar a responder e só depois transmite.
function responderChat(estado, dados, res) {
  estado.perguntas++;
  const agora = new Date().toISOString();
  let id = dados.conversation_id;
  if (!id || !estado.conversations.some((c) => c.id === id)) {
    id = `c0000000-0000-4000-8000-${String(estado.conversations.length + 1).padStart(12, '0')}`;
    const base = String(dados.message || '').trim();
    estado.conversations.push({ id, user_id: estado.user.id, title: base.length > 60 ? base.slice(0, 57).trimEnd() + '…' : base, created_at: agora, updated_at: agora, skill: null });
  }
  estado.messages.push({ conversation_id: id, role: 'user', content: String(dados.message || ''), created_at: agora, model: null });
  if (!estado.lead.teste_fim) estado.lead.teste_fim = new Date(Date.now() + 3 * 864e5).toISOString();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', ...cors() });
  const send = (d) => res.write('data: ' + JSON.stringify(d) + '\n\n');
  send({ conversation_id: id, limite: 8192, modelo: 'trustio-flash', skill: null });
  const partes = estado.chat.resposta.split(' ');
  let i = 0;
  const passo = () => {
    if (estado.chat.falhaNoMeio && i >= 1) { res.destroy(); return; }   // conexão cai no meio da resposta
    if (i < partes.length) { send({ delta: (i ? ' ' : '') + partes[i], n: i + 1 }); i++; return setTimeout(passo, estado.chat.atrasoMs); }
    estado.messages.push({ conversation_id: id, role: 'assistant', content: estado.chat.resposta, created_at: new Date().toISOString(), model: 'trustio-flash' });
    estado.conversations.filter((c) => c.id === id).forEach((c) => { c.updated_at = new Date().toISOString(); });
    send({ done: true, conversation_id: id, n: partes.length, trial_ends_at: estado.lead.teste_fim });
    res.end();
  };
  setTimeout(passo, estado.chat.atrasoMs);
}

function sessao(estado) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: estado.user.id, exp, role: 'authenticated', email: estado.user.email })}.assinatura`;
  return { access_token: token, refresh_token: 'refresh-de-teste', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: estado.user };
}

// Abre /app (ou /en/app) já com sessão. Site e backend falso na mesma origem; nada sai para a rede.
export async function abrirApp(browser, mock, { en = false, viewport = { width: 1280, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport, locale: en ? 'en-US' : 'pt-BR' });
  // A chave do supabase-js segue o host do backend: sb-<primeiro rótulo do host>-auth-token.
  await ctx.addInitScript(([chave, valor]) => { try { localStorage.setItem(chave, valor); } catch { /* sem storage */ } },
    [`sb-${new URL(mock.base).hostname.split('.')[0]}-auth-token`, JSON.stringify(sessao(mock.estado))]);
  await ctx.route('**/*', (route) => (route.request().url().startsWith(mock.base) ? route.fallback() : route.abort()));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_(FAILED|ABORTED|BLOCKED)/.test(m.text())) erros.push('console: ' + m.text()); });
  await page.goto(mock.base + (en ? '/en' : '') + '/app/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.chat-shell[data-state="ready"]', { timeout: 15000 });
  return { ctx, page, erros };
}
