// Teste de navegador da casca do /app: guia de primeiros passos, lista de conversas,
// Minha conta (abas), Planos e Avisos. Roda a página real contra um backend falso local
// (tests/e2e/lib/app-mock.mjs): não toca em produção e não gasta teste grátis de ninguém.
//
//   npm run test:app            (precisa de playwright-core e de um Chrome/Chromium)
//   CHROME_PATH=/caminho/chrome npm run test:app
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlaywrightChromium, getChromeExecutablePath } from './lib/browser-launcher.mjs';
import { iniciarMock, novoEstado, abrirApp } from './lib/app-mock.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TELAS = {
  desktop: { width: 1280, height: 800 },
  baixa: { width: 1024, height: 560 },
  celular: { width: 390, height: 844 },
  estreita: { width: 320, height: 568 },
};

let ok = 0;
const falhas = [];
function confere(cond, nome, detalhe = '') {
  if (cond) { ok++; return; }
  falhas.push(nome + (detalhe ? ' → ' + detalhe : ''));
  console.log('  ✗ ' + nome + (detalhe ? ' → ' + detalhe : ''));
}

const chromium = await getPlaywrightChromium();
const exe = process.env.CHROME_PATH || getChromeExecutablePath();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(exe ? { executablePath: exe } : {}) });

const antigo = (extra = {}) => novoEstado({ ...extra, lead: { ...novoEstado().lead, onboarding_seen_at: '2026-10-02T12:00:00Z', ...(extra.lead || {}) } });
const guiaAberto = (page) => page.evaluate(() => !!document.querySelector('dialog[data-guia][open]'));
const passo = (page) => page.evaluate(() => { const e = document.querySelector('[data-guia-etapa]:not([hidden])'); return e ? Number(e.dataset.guiaEtapa) : 0; });
const dentroDaTela = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
}, sel);
async function abrirMenuSePreciso(page) {
  if (!(await page.locator('[data-side-open]').isVisible())) return;
  await page.click('[data-side-open]');
  // A barra lateral entra deslizando: espera ela parar.
  await page.waitForFunction(() => Math.abs(document.querySelector('#side').getBoundingClientRect().left) < 1, null, { timeout: 3000 }).catch(() => {});
}
async function espera(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (!cond() && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}
async function cenario(nome, estado, opcoes, fn) {
  const mock = await iniciarMock(estado);
  const { ctx, page, erros } = await abrirApp(browser, mock, opcoes);
  const antes = falhas.length;
  try { await fn({ page, mock, estado: mock.estado }); }
  catch (e) { confere(false, nome + ': exceção', String(e && e.message).split('\n')[0]); }
  confere(erros.length === 0, nome + ': sem erros no console', erros.join(' | '));
  console.log((falhas.length === antes ? '✓ ' : '✗ ') + nome);
  await ctx.close(); await mock.close();
}

// 1 ─ Primeiro acesso: o guia abre sozinho, anda pelos passos e não envia nenhuma pergunta.
for (const [tela, viewport] of Object.entries(TELAS)) {
  for (const en of [false, true]) {
    await cenario(`primeiro acesso · ${tela} · ${en ? 'EN' : 'PT'}`, novoEstado(), { en, viewport }, async ({ page, estado }) => {
      await page.waitForSelector('dialog[data-guia][open]', { timeout: 5000 });
      confere(await passo(page) === 1, 'abre no passo 1');
      confere((await page.textContent('[data-guia-contador]')).includes(en ? 'Step 1 of 4' : 'Passo 1 de 4'), 'contador do passo');
      confere((await page.textContent('[data-guia-ola]')).includes('Ana'), 'cumprimenta pelo primeiro nome');
      confere((await page.textContent('[data-guia-teste]')).includes('3'), 'mostra os dias do teste');
      confere(await page.locator('[data-guia-voltar]').isHidden(), 'sem "Voltar" no passo 1');
      for (const n of [2, 3, 4]) {
        await page.click('[data-guia-avancar]');
        confere(await passo(page) === n, 'avança para o passo ' + n);
        confere(await dentroDaTela(page, '[data-guia-avancar]') || await page.evaluate(() => { const g = document.querySelector('[data-guia]'); return g.scrollHeight > g.clientHeight; }),
          'botão de avançar alcançável no passo ' + n);
        confere(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral no passo ' + n);
      }
      confere(await page.locator('[data-guia-pular]').isHidden(), 'sem "Pular" no último passo');
      confere(await page.locator('[data-guia-relogio]').isVisible(), 'avisa que o relógio só começa na 1ª pergunta');
      await page.click('[data-guia-voltar]');
      confere(await passo(page) === 3, '"Voltar" volta um passo');
      // Estilo das respostas grava na hora.
      await page.check('input[name="guia-estilo"][value="direto"]');
      await page.waitForFunction(() => /salvo|saved/i.test(document.querySelector('[data-guia-status]').textContent), null, { timeout: 5000 });
      confere(estado.prefs && estado.prefs.estilo === 'direto', 'estilo salvo nas preferências', JSON.stringify(estado.prefs));
      await page.click('[data-guia-avancar]');
      await page.click('[data-guia-exemplo="texto"]');
      confere(!(await guiaAberto(page)), 'escolher um começo fecha o guia');
      confere((await page.inputValue('#prompt')).length > 20, 'o começo entra como rascunho na caixa');
      confere(estado.perguntas === 0, 'nenhuma pergunta enviada (teste intacto)', String(estado.perguntas));
      confere(estado.lead.teste_fim === null, 'relógio do teste não começou');
      await page.waitForFunction(() => true); await espera(() => estado.lead.onboarding_seen_at !== null);
      confere(estado.lead.onboarding_seen_at !== null, 'guia marcado como visto no servidor');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.chat-shell[data-state="ready"]');
      await page.waitForTimeout(400);
      confere(!(await guiaAberto(page)), 'não reabre sozinho depois de visto');
    });
  }
}

// 2 ─ Teclado e formas de fechar.
await cenario('guia · teclado, Esc, fundo e pular', novoEstado(), {}, async ({ page, estado }) => {
  await page.waitForSelector('dialog[data-guia][open]');
  await page.keyboard.press('ArrowRight');
  confere(await passo(page) === 2, 'seta direita avança');
  await page.keyboard.press('ArrowLeft');
  confere(await passo(page) === 1, 'seta esquerda volta');
  await page.keyboard.press('Escape');
  confere(!(await guiaAberto(page)), 'Esc fecha');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'prompt', null, { timeout: 2000 }).catch(() => {});
  confere(await page.evaluate(() => document.activeElement && document.activeElement.id === 'prompt'), 'foco volta para a caixa de mensagem');
  await page.click('[data-ob-open]');
  confere(await guiaAberto(page), '"Instruções" reabre o guia');
  await page.mouse.click(8, 8);
  confere(!(await guiaAberto(page)), 'clique no fundo fecha');
  await page.click('[data-ob-open]');
  await page.click('[data-guia-pular]');
  confere(!(await guiaAberto(page)), '"Pular o guia" fecha');
  await page.click('[data-ob-open]');
  await page.click('[data-guia-fechar]');
  confere(!(await guiaAberto(page)), 'o × fecha');
  confere(estado.perguntas === 0, 'nada enviado');
});

// 3 ─ "Instruções" com conversa aberta: abre por cima e a conversa continua lá.
for (const [tela, viewport] of [['desktop', TELAS.desktop], ['celular', TELAS.celular]]) {
  const comConversa = antigo({
    conversations: [{ id: 'c0000000-0000-4000-8000-000000000001', user_id: novoEstado().user.id, title: 'Conversa antiga', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', skill: null }],
    messages: [
      { conversation_id: 'c0000000-0000-4000-8000-000000000001', role: 'user', content: 'Pergunta guardada', created_at: '2026-11-01T10:00:00Z', model: null },
      { conversation_id: 'c0000000-0000-4000-8000-000000000001', role: 'assistant', content: 'Resposta guardada', created_at: '2026-11-01T10:00:05Z', model: 'flash' },
    ],
  });
  await cenario(`Instruções com conversa aberta · ${tela}`, comConversa, { viewport }, async ({ page, estado }) => {
    await page.waitForTimeout(300);
    confere(!(await guiaAberto(page)), 'usuário antigo: o guia não abre sozinho');
    await abrirMenuSePreciso(page);
    await page.click('.conv-item');
    await page.waitForFunction(() => document.body.textContent.includes('Resposta guardada'), null, { timeout: 5000 });
    await abrirMenuSePreciso(page);
    await page.click('[data-ob-open]');
    confere(await guiaAberto(page), 'clique em "Instruções" abre o guia');
    confere(await dentroDaTela(page, '[data-guia-avancar]'), 'guia visível na tela');
    await page.keyboard.press('Escape');
    confere(await page.evaluate(() => document.body.textContent.includes('Resposta guardada')), 'a conversa aberta continua na tela');
    confere((await page.textContent('[data-conv-title]')).includes('Conversa antiga'), 'título da conversa mantido');
    confere(estado.perguntas === 0, 'nada enviado');
  });
}

// 4 ─ Conversa nova aparece na lista durante a resposta, sem recarregar.
await cenario('conversa nova aparece na hora', antigo({ chat: { atrasoMs: 350, falhaNoMeio: false, resposta: 'um dois tres quatro cinco seis' } }), {}, async ({ page, estado }) => {
  confere(await page.locator('.conv-row').count() === 0, 'lista começa vazia');
  await page.fill('#prompt', 'Minha primeira pergunta de teste');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.conv-row', { timeout: 1500 }).catch(() => {});
  confere(await page.locator('.conv-row').count() === 1, 'aparece na lista ainda durante a resposta');
  confere((await page.textContent('.conv-item')).includes('Minha primeira pergunta'), 'com o título da pergunta');
  confere((await page.textContent('[data-conv-title]')).includes('Minha primeira pergunta'), 'título no topo');
  await page.waitForFunction(() => !document.querySelector('[data-send]').disabled, null, { timeout: 8000 });
  confere(await page.locator('.conv-row').count() === 1, 'continua uma só depois de terminar (sem duplicar)');
  confere(estado.perguntas === 1, 'uma pergunta enviada');
  // Segunda conversa, com a conexão caindo no meio: o servidor já criou a conversa.
  await page.click('[data-new]');
  estado.chat.falhaNoMeio = true;
  await page.fill('#prompt', 'Segunda conversa que cai no meio');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.conv-row').length === 2, null, { timeout: 6000 }).catch(() => {});
  confere(await page.locator('.conv-row').count() === 2, 'conversa de envio que falhou também fica na lista', `${await page.locator('.conv-row').count()} na tela, ${estado.conversations.length} no banco`);
  estado.chat.falhaNoMeio = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.chat-shell[data-state="ready"]');
  await page.waitForFunction(() => document.querySelectorAll('.conv-row').length === 2, null, { timeout: 5000 }).catch(() => {});
  confere(await page.locator('.conv-row').count() === 2, 'lista igual depois de recarregar');
});

// 5 ─ Conversa criada em outra aba aparece ao voltar para esta.
await cenario('lista atualiza ao voltar para a aba', antigo(), {}, async ({ page, estado }) => {
  estado.conversations.push({ id: 'c0000000-0000-4000-8000-000000000009', user_id: estado.user.id, title: 'Feita no celular', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), skill: null });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);
  confere(await page.locator('.conv-row').count() === 0, 'não recarrega a lista a cada foco (intervalo mínimo)');
  await page.clock.install().catch(() => {});
  await page.clock.fastForward(25000).catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelectorAll('.conv-row').length === 1, null, { timeout: 5000 }).catch(() => {});
  confere(await page.locator('.conv-row').count() === 1, 'conversa de outro aparelho aparece ao voltar');
});

// 6 ─ Minha conta: abas, teclado, salvar, validações, em quatro tamanhos de tela e nos dois idiomas.
for (const [tela, viewport] of Object.entries(TELAS)) {
  for (const en of tela === 'desktop' || tela === 'celular' ? [false, true] : [false]) {
    await cenario(`Minha conta · ${tela} · ${en ? 'EN' : 'PT'}`, antigo(), { en, viewport }, async ({ page, estado }) => {
      await abrirMenuSePreciso(page);
      await page.click('.side-link[data-conta-open]');
      await page.waitForSelector('dialog[data-conta][open]');
      const abas = ['perfil', 'preferencias', 'conversas', 'seguranca'];
      for (const a of abas) {
        await page.click(`[data-tab="${a}"]`);
        const est = await page.evaluate((nome) => ({
          sel: document.querySelector(`[data-tab="${nome}"]`).getAttribute('aria-selected'),
          visiveis: [...document.querySelectorAll('[data-painel]')].filter((p) => !p.hidden).map((p) => p.dataset.painel),
          tabindex: [...document.querySelectorAll('[role=tab]')].filter((t) => t.tabIndex === 0).length,
        }), a);
        confere(est.sel === 'true' && est.visiveis.length === 1 && est.visiveis[0] === a && est.tabindex === 1, `aba ${a}: seleção e painel certos`, JSON.stringify(est));
        confere(await dentroDaTela(page, `[data-tab="${a}"]`), `aba ${a} inteira na tela`);
      }
      const faixa = await page.evaluate(() => { const t = document.querySelector('.conta-tabs'); return t.scrollWidth - t.clientWidth; });
      confere(faixa <= 1, 'as quatro abas cabem sem cortar', faixa + 'px sobrando');
      confere(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral');
      // Teclado na faixa de abas.
      await page.focus('[data-tab="seguranca"]');
      await page.keyboard.press('ArrowRight');
      confere(await page.evaluate(() => document.activeElement.dataset.tab) === 'perfil', 'seta direita dá a volta');
      await page.keyboard.press('ArrowLeft');
      confere(await page.evaluate(() => document.activeElement.dataset.tab) === 'seguranca', 'seta esquerda dá a volta');
      await page.keyboard.press('Home');
      confere(await page.evaluate(() => document.activeElement.dataset.tab) === 'perfil', 'Home vai para a primeira');
      await page.keyboard.press('End');
      confere(await page.evaluate(() => document.activeElement.dataset.tab) === 'seguranca', 'End vai para a última');
      // Troca rápida: nunca fica com dois painéis ou nenhum.
      for (let i = 0; i < 24; i++) await page.click(`[data-tab="${abas[i % 4]}"]`, { delay: 0 });
      confere(await page.evaluate(() => [...document.querySelectorAll('[data-painel]')].filter((p) => !p.hidden).length) === 1, 'troca rápida de abas mantém um painel só');
      // Preferências: salva.
      await page.click('[data-tab="preferencias"]');
      await page.check('[data-pref-form] input[name="estilo"][value="detalhado"]');
      await page.click('[data-pref-form] button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[data-pref-status]').textContent.trim().length > 0 && !/…/.test(document.querySelector('[data-pref-status]').textContent), null, { timeout: 5000 }).catch(() => {});
      confere(estado.prefs && estado.prefs.estilo === 'detalhado', 'preferências gravadas', JSON.stringify(estado.prefs));
      // Segurança: senhas diferentes não saem do navegador.
      await page.click('[data-tab="seguranca"]');
      const antes = estado.chamadas.filter((c) => c.startsWith('PUT /auth/v1/user')).length;
      await page.fill('#conta-senha', 'valor-de-teste-1');
      await page.fill('#conta-senha2', 'valor-de-teste-2');
      await page.click('[data-senha-form] button[type="submit"]');
      await page.waitForTimeout(300);
      confere((await page.textContent('[data-senha-status]')).trim().length > 0, 'avisa que as senhas não conferem');
      confere(estado.chamadas.filter((c) => c.startsWith('PUT /auth/v1/user')).length === antes, 'senha divergente não é enviada');
      // Conversas: sem conversas, apagar fica desligado.
      await page.click('[data-tab="conversas"]');
      confere(await page.locator('[data-apagar-todas]').isDisabled(), '"Apagar tudo" desligado sem conversas');
      // Fechar: ×, Esc e fundo.
      await page.click('[data-conta-fechar]');
      confere(!(await page.evaluate(() => document.querySelector('[data-conta]').open)), 'o × fecha a conta');
      await abrirMenuSePreciso(page);
      await page.click('.side-link[data-conta-open]');
      confere(await page.evaluate(() => document.querySelector('[data-tab="perfil"]').getAttribute('aria-selected')) === 'true', 'reabre sempre em Perfil');
      await page.keyboard.press('Escape');
      confere(!(await page.evaluate(() => document.querySelector('[data-conta]').open)), 'Esc fecha a conta');
      confere(estado.perguntas === 0, 'nada enviado ao chat');
    });
  }
}

// 7 ─ Apagar todas: cancelar não apaga; confirmar apaga e a lista esvazia.
await cenario('Minha conta · apagar todas', antigo({
  conversations: [1, 2, 3].map((n) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, user_id: novoEstado().user.id, title: 'Conversa ' + n, created_at: '2026-11-01T10:00:00Z', updated_at: `2026-11-0${n}T10:00:00Z`, skill: null })),
}), {}, async ({ page, estado }) => {
  let resposta = false;
  page.on('dialog', (d) => (resposta ? d.accept() : d.dismiss()));
  await page.waitForFunction(() => document.querySelectorAll('.conv-row').length === 3);
  await page.click('.side-link[data-conta-open]');
  await page.click('[data-tab="conversas"]');
  await page.waitForFunction(() => !document.querySelector('[data-apagar-todas]').disabled);
  await page.click('[data-apagar-todas]');
  await page.waitForTimeout(400);
  confere(estado.conversations.length === 3, 'cancelar a confirmação não apaga nada');
  resposta = true;
  await page.click('[data-apagar-todas]');
  await page.waitForFunction(() => document.querySelectorAll('.conv-row').length === 0, null, { timeout: 5000 }).catch(() => {});
  confere(estado.conversations.length === 0 && await page.locator('.conv-row').count() === 0, 'confirmar apaga e a barra lateral esvazia');
});

// 8 ─ Planos e Avisos na barra lateral.
for (const [tela, viewport] of Object.entries(TELAS)) {
  for (const en of [false, true]) {
    await cenario(`Planos e Avisos · ${tela} · ${en ? 'EN' : 'PT'}`, antigo(), { en, viewport }, async ({ page, mock }) => {
      await abrirMenuSePreciso(page);
      const href = await page.evaluate(() => document.querySelector('.side-foot a.side-link[href*="planos"], a.side-link[href*="planos"]').href);
      confere(href === mock.base + (en ? '/en' : '') + '/planos.html', 'link Planos aponta para a página certa', href);
      const r = await page.request.get(href);
      confere(r.status() === 200 && /<title>/.test(await r.text()), 'página de planos existe (200)', String(r.status()));
      confere(await dentroDaTela(page, 'a.side-link[href*="planos"]'), 'link Planos visível e clicável');
      const resumo = '.side-legal-det > summary';
      for (let i = 0; i < 3; i++) {
        await page.click(resumo);
        await page.waitForTimeout(250);
        confere(await page.evaluate(() => document.querySelector('.side-legal-det').open), 'Avisos abre (' + (i + 1) + ')');
        const texto = '.side-legal-det > :not(summary)';
        confere(await dentroDaTela(page, texto), 'texto dos Avisos visível na tela depois de abrir (' + (i + 1) + ')');
        await page.click(resumo);
        confere(!(await page.evaluate(() => document.querySelector('.side-legal-det').open)), 'Avisos fecha (' + (i + 1) + ')');
      }
      await page.click(resumo);
      const aviso = await page.textContent('.side-legal-det');
      confere(!/\*/.test(aviso), 'texto dos Avisos sem asterisco solto');
      confere(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem rolagem lateral');
      const links = await page.evaluate(() => [...document.querySelectorAll('.side-legal-det a[href]')].map((a) => a.href));
      for (const l of links.filter((u) => u.startsWith(mock.base))) {
        const rr = await page.request.get(l);
        confere(rr.status() === 200, 'link dos Avisos responde 200', l.replace(mock.base, ''));
      }
    });
  }
}

// 9 ─ Usuário com plano pago e usuário com teste encerrado: o guia diz a coisa certa.
await cenario('guia · plano ativo', novoEstado({ lead: { ...novoEstado().lead, pago_chat_ate: '2027-12-31T00:00:00Z', pago_plano: 'pessoal', plano: 'pessoal' } }), {}, async ({ page }) => {
  await page.waitForSelector('dialog[data-guia][open]');
  const t = await page.textContent('[data-guia-teste]');
  confere(!/teste grátis/i.test(t), 'não fala de teste grátis para quem tem plano', t);
  await page.click('[data-guia-avancar]'); await page.click('[data-guia-avancar]'); await page.click('[data-guia-avancar]');
  confere(await page.locator('[data-guia-relogio]').isHidden(), 'sem aviso de relógio para quem tem plano');
});

await browser.close();

// 10 ─ Sem estilo inline no HTML (a CSP da página bloquearia).
for (const arq of ['app/index.html', 'en/app/index.html']) {
  const html = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
  const trecho = html.slice(html.indexOf('data-guia'), html.indexOf('data-gate'));
  confere(!/\sstyle=|<style|\son[a-z]+=/.test(trecho), arq + ': guia sem style/handlers inline');
}

console.log(`\n${ok} verificações ok, ${falhas.length} falha(s).`);
if (falhas.length) { console.log(falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); }
