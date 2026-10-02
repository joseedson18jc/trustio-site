// Phase 2 — journeys J1–J6. Read-only. Every step is logged to data/steps.jsonl.
// Usage: node scripts/journeys.mjs [J1 J2 ...]
import fs from 'node:fs';
import path from 'node:path';
import { BASE, DATA, SHOTS, launch, newContext, instrument, warm, shoot, fullShot, shotName, sleep, log, guard, stripeLedger, stripeMark } from './lib.mjs';

const STEPS = path.join(DATA, 'steps.jsonl');
const CONTRAST = path.join(DATA, 'contrast'); fs.mkdirSync(CONTRAST, { recursive: true });
const only = process.argv.slice(2);
const want = (j) => !only.length || only.includes(j);
const step = (o) => { log(STEPS, o); console.log(o.journey, o.step, o.vp, o.theme, '→', o.shots?.atf || o.note || ''); };

// Text visible in the first viewport (for the 5-second test)
const firstViewportText = () => {
  const out = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const n = walker.currentNode; const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue; const el = n.parentElement; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.bottom > 0 && r.top < innerHeight && r.width > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && !el.closest('script,style,#mobile-menu')) out.push(t); }
  return [...new Set(out)].join(' | ').slice(0, 1500);
};
const ctasInViewport = () => [...document.querySelectorAll('a.button, a[class*=btn], button.button, main a[href]')].filter((a) => { const r = a.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && !a.closest('header'); }).map((a) => ({ text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), h: Math.round(a.getBoundingClientRect().height), y: Math.round(a.getBoundingClientRect().top) }));

// Contrast sampling: element clip at CSS scale + declared colours; the Python pass computes the rendered ratio.
async function sampleContrast(page, tag, selectors) {
  for (const [label, sel] of selectors) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) continue;
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      const info = await loc.evaluate((el) => { const cs = getComputedStyle(el); let bg = 'transparent', p = el; while (p) { const c = getComputedStyle(p).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break; } p = p.parentElement; } return { color: cs.color, bgDeclared: bg, fontSize: cs.fontSize, fontWeight: cs.fontWeight, text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) }; });
      const file = `${tag}__${label}.png`;
      await loc.screenshot({ path: path.join(CONTRAST, file), scale: 'css', timeout: 5000 });
      log(path.join(DATA, 'contrast.jsonl'), { tag, label, sel, file, ...info });
    } catch (e) { log(path.join(DATA, 'contrast.jsonl'), { tag, label, sel, error: String(e.message).slice(0, 120) }); }
  }
}

async function open(browser, vp, url, { journey, theme = 'dark', allowStripe = false } = {}) {
  const ctx = await newContext(browser, vp, { journey, allowStripe });
  const page = await ctx.newPage(); instrument(page, { phase: journey, vp, theme });
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => 'ERR ' + String(e.message).split('\n')[0] }));
  if (theme === 'light') {
    const t = page.locator('.theme-toggle').first();
    await t.click(); await sleep(600);
  }
  return { ctx, page, status: res.status() };
}
const themeState = (page) => page.evaluate(() => ({ dataTheme: document.documentElement.getAttribute('data-theme'), stored: (() => { try { return localStorage.getItem('trustio-theme'); } catch { return 'n/a'; } })(), pressed: document.querySelector('.theme-toggle')?.getAttribute('aria-pressed'), label: document.querySelector('.theme-toggle')?.getAttribute('aria-label') }));

const browser = await launch();

// ───────────────────────── J1 Home — first-5-seconds
if (want('J1')) for (const vp of ['desktop', 'mobile']) for (const theme of ['dark', 'light']) {
  const J = 'J1';
  const { ctx, page, status } = await open(browser, vp, BASE + '/', { journey: J, theme });
  await sleep(2500); // the "5 seconds": let the hero settle as a visitor would see it
  const fvt = await page.evaluate(firstViewportText); const ctas = await page.evaluate(ctasInViewport);
  const s1 = await shoot(page, J, 1, 'hero', vp, theme, { full: false });
  await warm(page);
  s1.full = shotName(J, 1, 'hero-full', vp, theme); await fullShot(page, s1.full);
  step({ journey: J, step: 1, vp, theme, url: page.url(), status, action: `Fresh visit to / (${theme}); wait 2.5 s; read first viewport`, expected: 'Visitor can say what Trustio is, who it is for, and what to do next', firstViewportText: fvt, ctasInViewport: ctas, themeState: await themeState(page), shots: s1 });
  if (theme === 'dark' || vp === 'desktop') await sampleContrast(page, `home-${vp}-${theme}`, [['eyebrow', '.hero .eyebrow'], ['hero-lead', '.hero p:not(.eyebrow)'], ['kicker', '.section-kicker, .kicker, .label'], ['muted-p', 'main section p'], ['footer-small', 'footer small, footer p'], ['footer-link', 'footer a']]);

  // 02 second banner (seats)
  const banner = page.locator('h2:has-text("Seats individuais")').first();
  if (await banner.count()) { await banner.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -120)); await sleep(1600); }
  const bannerInfo = await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((x) => /Seats individuais/.test(x.innerText)); if (!h) return null; const sec = h.closest('section') || h.parentElement; return { text: sec.innerText.replace(/\s+/g, ' ').slice(0, 700), links: [...sec.querySelectorAll('a')].map((a) => [a.innerText.replace(/\s+/g, ' ').trim(), a.getAttribute('href')]), y: Math.round(h.getBoundingClientRect().top + scrollY) }; });
  step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Scroll to second banner ("Seats individuais")', expected: 'Banner states the individual offer and links to its page (/seats.html)', banner: bannerInfo, shots: { atf: (await shoot(page, J, 2, 'second-banner', vp, theme, { full: false })).atf, full: s1.full } });

  // 03 navigation
  await page.evaluate(() => scrollTo(0, 0)); await sleep(400);
  if (vp === 'mobile') {
    await page.locator('.menu-toggle').first().click(); await sleep(600);
    const s = await shoot(page, J, 3, 'nav-open', vp, theme);
    step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Open mobile menu', expected: 'Short, prioritised menu with a clear primary action', menu: await page.evaluate(() => [...document.querySelectorAll('#mobile-menu a')].map((a) => a.innerText.replace(/\s+/g, ' ').trim())), shots: s });
    await page.locator('.menu-toggle').first().click(); await sleep(400);
  } else {
    await page.locator('header nav a').nth(1).hover().catch(() => {}); await sleep(300);
    const s = await shoot(page, J, 3, 'nav', vp, theme, { full: false });
    const header = await page.evaluate(() => ({ items: [...document.querySelectorAll('header a, header button')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()), headerH: Math.round(document.querySelector('header').getBoundingClientRect().height) }));
    step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Scan the desktop header', expected: '≤7 top-level items, one primary CTA', header, shots: { ...s, full: s1.full } });
  }
  // 04 who is it for (two paths) + CTAs
  const paths = page.locator('#para-quem').first();
  if (await paths.count()) { await paths.scrollIntoViewIfNeeded(); await sleep(1600); }
  const s4 = await shoot(page, J, 4, 'two-paths', vp, theme, { full: false });
  step({ journey: J, step: 4, vp, theme, url: page.url(), action: 'Follow "Ver os dois caminhos" to #para-quem', expected: 'B2C and B2B paths are distinct, each with one clear CTA', ctasInViewport: await page.evaluate(ctasInViewport), shots: { ...s4, full: s1.full } });
  // 05 sticky header mid-page
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.45)); await sleep(1600);
  const s5 = await shoot(page, J, 5, 'sticky-header', vp, theme, { full: false });
  const sticky = await page.evaluate(() => { const h = document.querySelector('header'); const r = h.getBoundingClientRect(); return { position: getComputedStyle(h).position, top: Math.round(r.top), height: Math.round(r.height), visible: r.bottom > 0 }; });
  step({ journey: J, step: 5, vp, theme, url: page.url(), action: 'Scroll to 45% of the page', expected: 'Header stays reachable; a CTA is always one tap away', sticky, shots: { ...s5, full: s1.full } });
  await ctx.close();
}

// ───────────────────────── J2 VoiceAI
if (want('J2')) for (const vp of ['desktop', 'mobile']) {
  const J = 'J2', theme = 'dark';
  const { ctx, page, status } = await open(browser, vp, BASE + '/voice.html', { journey: J });
  await sleep(2500);
  const fvt = await page.evaluate(firstViewportText);
  const s1 = await shoot(page, J, 1, 'voice-hero', vp, theme, { full: false }); await warm(page);
  s1.full = shotName(J, 1, 'voice-hero-full', vp, theme); await fullShot(page, s1.full);
  step({ journey: J, step: 1, vp, theme, url: page.url(), status, action: 'Land on /voice.html', expected: 'Clear what the VoiceAI product does and how to try it', firstViewportText: fvt, ctasInViewport: await page.evaluate(ctasInViewport), shots: s1 });
  // 02 orb idle
  const orb = page.locator('[data-hero-orb]').first();
  await orb.scrollIntoViewIfNeeded(); await sleep(1500);
  const idle = await page.evaluate(() => ({ state: document.querySelector('[data-state]')?.innerText, pressed: document.querySelector('[data-hero-orb]')?.getAttribute('aria-pressed'), picks: [...document.querySelectorAll('[data-pick]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()), canvas: !!document.querySelector('[data-hero-orb] canvas') }));
  const s2 = await shoot(page, J, 2, 'orb-idle', vp, theme, { full: false });
  step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Observe the hero orb idle state', expected: 'Affordance says "tap to hear"; voice choices visible', idle, shots: { ...s2, full: s1.full } });
  // 03 one interaction (desktop only — one interaction per demo)
  if (vp === 'desktop') {
    const t0 = Date.now(); await orb.click(); await sleep(3500);
    const playing = await page.evaluate(() => { const a = document.querySelector('audio') || [...document.querySelectorAll('audio')][0]; return { state: document.querySelector('[data-state]')?.innerText, caption: document.querySelector('[data-caption]')?.innerText, pressed: document.querySelector('[data-hero-orb]')?.getAttribute('aria-pressed'), stage: document.querySelector('.stage-orb')?.className }; });
    const s3 = await shoot(page, J, 3, 'orb-first-response', vp, theme, { full: false });
    step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'ONE click on the hero orb; observe first response for 3.5 s; session ended by closing the page', expected: 'Audio plays, live caption, visible progress', playing, sessionSeconds: ((Date.now() - t0) / 1000).toFixed(1), shots: { ...s3, full: s1.full } });
  } else {
    step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Orb tap on mobile', expected: '—', note: 'stopped by guardrail: one interaction per demo already used on desktop', guardrail: true, shots: { atf: s2.atf, full: s1.full } });
  }
  // 04 channel cards (hover only on desktop; no taps — cards also play audio)
  const channels = page.locator('h2:has-text("Todos os canais")').first();
  if (await channels.count()) { await channels.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, 200)); await sleep(1600); }
  const cardInfo = await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((x) => /Todos os canais/.test(x.innerText)); const sec = h?.closest('section'); if (!sec) return null; const cards = [...sec.querySelectorAll('a, button, [role=button], [tabindex], article, li')].slice(0, 20); return { count: cards.length, items: cards.map((c) => ({ tag: c.tagName.toLowerCase(), text: c.innerText.replace(/\s+/g, ' ').trim().slice(0, 70), href: c.getAttribute('href'), role: c.getAttribute('role') })) }; });
  if (vp === 'desktop') { const c = page.locator('section:has(h2:has-text("Todos os canais")) [tabindex], section:has(h2:has-text("Todos os canais")) a').first(); await c.hover().catch(() => {}); await sleep(600); }
  const s4 = await shoot(page, J, 4, 'channel-cards', vp, theme, { full: false });
  step({ journey: J, step: 4, vp, theme, url: page.url(), action: vp === 'desktop' ? 'Hover first channel card' : 'View channel cards (no tap: cards play audio)', expected: 'Cards read as interactive and reveal insight', cardInfo, shots: { ...s4, full: s1.full } });
  // 05 hand-off to voice.trustio.com.br/credito-jus (screenshot only)
  const handoffs = await page.evaluate(() => [...document.querySelectorAll('a[href*="voice.trustio.com.br"]')].map((a) => ({ text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.href, target: a.target })));
  const hp = await ctx.newPage(); instrument(hp, { phase: J, vp, theme });
  let hstatus; try { const r = await hp.goto('https://voice.trustio.com.br/credito-jus', { waitUntil: 'load', timeout: 30000 }); hstatus = r?.status(); } catch (e) { hstatus = 'ERR ' + String(e.message).split('\n')[0].slice(0, 140); }
  await sleep(1000);
  const s5 = await shoot(hp, J, 5, 'handoff-credito-jus', vp, theme);
  step({ journey: J, step: 5, vp, theme, url: 'https://voice.trustio.com.br/credito-jus', action: 'Open the "Chamada real" hand-off (screenshot only, no interaction)', expected: 'Live demo page loads', handoffs, result: hstatus, shots: s5 });
  // 06 console hand-off ("Construir meu agente") — screenshot only
  const cp = await ctx.newPage(); instrument(cp, { phase: J, vp, theme });
  let cstatus; try { const r = await cp.goto(BASE + '/console/', { waitUntil: 'networkidle', timeout: 30000 }); cstatus = r?.status(); } catch (e) { cstatus = 'ERR ' + String(e.message).split('\n')[0]; }
  await sleep(1200);
  const s6 = await shoot(cp, J, 6, 'console-handoff', vp, theme);
  step({ journey: J, step: 6, vp, theme, url: cp.url(), action: 'Open "Construir meu agente" (/console/) — screenshot only', expected: 'Console or clear sign-up gate', result: cstatus, firstViewportText: await cp.evaluate(firstViewportText), shots: s6 });
  await ctx.close();
}

// ───────────────────────── J3 Plans & pricing (+ Stripe hand-off, each link once)
if (want('J3')) for (const vp of ['desktop', 'mobile']) for (const theme of ['dark', 'light']) {
  const J = 'J3';
  const { ctx, page, status } = await open(browser, vp, BASE + '/planos.html', { journey: J, theme });
  await sleep(2000);
  const fvt = await page.evaluate(firstViewportText);
  const s1 = await shoot(page, J, 1, 'planos', vp, theme, { full: false }); await warm(page);
  s1.full = shotName(J, 1, 'planos-full', vp, theme); await fullShot(page, s1.full);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab], .segmented a, .segmented button, [data-seg], a[href="#pessoal"], a[href="#empresas"]')].map((t) => ({ text: t.innerText.replace(/\s+/g, ' ').trim(), sel: t.getAttribute('aria-selected'), href: t.getAttribute('href') })));
  step({ journey: J, step: 1, vp, theme, url: page.url(), status, action: 'Land on /planos.html', expected: 'B2C vs B2B split obvious above the fold', firstViewportText: fvt, tabs, shots: s1 });
  if (theme === 'dark' || vp === 'desktop') await sampleContrast(page, `planos-${vp}-${theme}`, [['price-note', '.price small, .plan small, .plan .note, .card small'], ['pay-methods', '.pay, .methods, .plan-foot'], ['table-cell', 'table td'], ['faq', 'details p, .faq p']]);
  // 02 switch to "Para você"
  const toB2C = page.locator('button:has-text("Para você")').first();
  let switched = false; if (await toB2C.count()) { await page.evaluate(() => scrollTo(0, 0)); await toB2C.click().catch(() => {}); switched = true; await sleep(900); }
  const s2 = await shoot(page, J, 2, 'para-voce', vp, theme);
  step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Click "Para você" (B2C)', expected: 'B2C plans shown; monthly/7-day/annual comparable', switched, ctasInViewport: await page.evaluate(ctasInViewport), shots: s2 });
  // 03 early-access promise
  const ea = page.locator('text=Estado de hoje').first();
  if (await ea.count()) { await ea.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {}); await page.evaluate(() => scrollBy(0, -80)); await sleep(1600); }
  const eaText = await page.evaluate(() => { const n = [...document.querySelectorAll('p, div')].find((x) => /Estado de hoje/.test(x.innerText) && x.innerText.length < 600); return n?.innerText.replace(/\s+/g, ' ').trim(); });
  const s3 = await shoot(page, J, 3, 'early-access', vp, theme, { full: false });
  step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Read the early-access / state-of-today block', expected: 'Dates 23/09 and 01/10 unambiguous; what you get today is explicit', eaText, shots: { ...s3, full: s2.full } });
  // 04 B2B comparison table
  await page.evaluate(() => scrollTo(0, 0)); await page.locator('button:has-text("Para empresas")').first().click().catch(() => {}); await sleep(800);
  const tbl = page.locator('table').first();
  if (await tbl.count()) { await tbl.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {}); await sleep(1600); }
  const tblInfo = await page.evaluate(() => { const t = document.querySelector('table'); if (!t) return null; const w = t.closest('div'); return { tableW: Math.round(t.getBoundingClientRect().width), wrapW: Math.round(w.getBoundingClientRect().width), wrapOverflowX: getComputedStyle(w).overflowX, wrapTabindex: w.getAttribute('tabindex') }; });
  const s4 = await shoot(page, J, 4, 'compare-table', vp, theme, { full: false });
  step({ journey: J, step: 4, vp, theme, url: page.url(), action: 'Scroll to "Comparativo · empresas" table', expected: 'Readable without horizontal scroll, or with a visible scroll cue', tblInfo, shots: { ...s4, full: s1.full } });
  await ctx.close();

  // 05 Stripe hand-off — dark only; B2B links at desktop (P2), B2C links at mobile (P1). Each link opened once.
  if (theme !== 'dark') continue;
  const plan = vp === 'desktop' ? ['Assinar Starter', 'Assinar Pro', 'Assinar Dedicado', 'Contratar diagnóstico'] : ['Pré-assinar · entrar em 23/09', 'Comprar passe', 'Pré-assinar · entrar em 23/09#2'];
  let n = 5;
  for (const label of plan) {
    const s = await open(browser, vp, BASE + '/planos.html', { journey: J, allowStripe: true });
    if (vp === 'mobile') { await s.page.locator('button:has-text("Para você")').first().click().catch(() => {}); await sleep(600); }
    const [txt, idx] = label.split('#');
    const links = s.page.locator(`a[href*="buy.stripe.com"]:has-text("${txt}")`);
    const link = links.nth(idx ? Number(idx) - 1 : 0);
    if (!(await link.count())) { step({ journey: J, step: n, vp, theme, action: `Find CTA "${label}"`, note: 'CTA not found', shots: {} }); await s.ctx.close(); n++; continue; }
    const href = await link.getAttribute('href');
    if (stripeLedger()[href]) { step({ journey: J, step: n, vp, theme, action: `Open ${href}`, note: 'stopped by guardrail: link already opened once', guardrail: true, shots: {} }); await s.ctx.close(); n++; continue; }
    await link.scrollIntoViewIfNeeded(); await sleep(300);
    const before = await shoot(s.page, J, n, 'cta-' + txt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + (idx ? '-annual' : ''), vp, theme, { full: false });
    stripeMark(href, { label, vp, at: new Date().toISOString() });
    guard({ journey: J, action: 'stripe-open-once', url: href, label });
    const popupP = s.ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await link.click();
    const pop = await popupP; const sp = pop || s.page;
    await sp.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); await sleep(3000);
    const sText = await sp.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200)).catch(() => '');
    const sShots = await shoot(sp, J, n, 'stripe-' + txt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + (idx ? '-annual' : ''), vp, theme);
    step({ journey: J, step: n, vp, theme, url: sp.url(), action: `Click "${label}" → Stripe hosted checkout (page load only; no typing, no Pay/Assinar)`, expected: 'Checkout shows Trustio branding, BRL price and the promised methods (Pix, Apple Pay, Google Pay)', stripeText: sText, openedInNewTab: !!pop, ctaShot: before.atf, shots: sShots });
    await s.ctx.close(); n++;
  }
}

// ───────────────────────── J4 Waitlist & demo triggers (never submit)
if (want('J4')) for (const vp of ['desktop', 'mobile']) {
  const J = 'J4', theme = 'dark';
  const { ctx, page, status } = await open(browser, vp, BASE + '/espera.html', { journey: J });
  await sleep(2000);
  const s1 = await shoot(page, J, 1, 'espera', vp, theme);
  const counters = await page.evaluate(() => ({ count: document.querySelector('[data-count]')?.innerText, attrs: { ...document.querySelector('[data-count]')?.dataset }, countdown: document.querySelector('[data-countdown]')?.innerText.replace(/\s+/g, ' ') }));
  step({ journey: J, step: 1, vp, theme, url: page.url(), status, action: 'Land on /espera.html', expected: 'Purpose, benefit and effort ("30 segundos") clear; form visible', firstViewportText: await page.evaluate(firstViewportText), counters, shots: s1 });
  await sampleContrast(page, `espera-${vp}-${theme}`, [['label', 'form label'], ['hint-optional', 'form label small, form label em, form .hint, form small'], ['legal-note', 'form p, .form-note, .consent']]);
  // 02 required-field validation without submitting: focus/blur + reportValidity() (does not submit)
  await page.locator('#w-nome').scrollIntoViewIfNeeded();
  await page.locator('#w-nome').focus(); await page.locator('#w-email').focus(); await page.locator('#w-tel').focus(); await sleep(300);
  const v2 = await page.evaluate(() => { const f = document.getElementById('espera-form'); const ok = f.checkValidity(); const inv = [...f.querySelectorAll(':invalid')].map((e) => ({ name: e.name, msg: e.validationMessage })); const custom = [...f.querySelectorAll('[role=alert], .error, [aria-invalid=true], [aria-live]')].map((e) => ({ cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) })); return { valid: ok, invalid: inv, customErrorUI: custom }; });
  await page.evaluate(() => document.getElementById('espera-form').reportValidity()); await sleep(400);
  const s2 = await shoot(page, J, 2, 'empty-validation', vp, theme, { full: false });
  step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Tab through empty required fields; call reportValidity() (no submit)', expected: 'Inline, specific error messages next to fields', validation: v2, shots: { ...s2, full: s1.full } });
  // 03 invalid email
  await page.locator('#w-nome').fill('Teste Auditoria'); await page.locator('#w-email').fill('teste@'); await page.locator('#w-tel').focus(); await sleep(400);
  const v3 = await page.evaluate(() => { const e = document.getElementById('w-email'); return { emailValid: e.validity.valid, msg: e.validationMessage, ariaInvalid: e.getAttribute('aria-invalid'), describedby: e.getAttribute('aria-describedby'), borderColor: getComputedStyle(e).borderColor }; });
  const s3 = await shoot(page, J, 3, 'invalid-email', vp, theme, { full: false });
  step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Type "Teste Auditoria" + invalid e-mail "teste@", move focus', expected: 'E-mail field flags the error on blur with guidance', validation: v3, shots: { ...s3, full: s1.full } });
  // 04 phone format
  await page.locator('#w-tel').fill('11'); await page.locator('#w-obs').focus(); await sleep(300);
  const v4 = await page.evaluate(() => { const e = document.getElementById('w-tel'); return { value: e.value, valid: e.validity.valid, pattern: e.pattern, inputmode: e.inputMode }; });
  step({ journey: J, step: 4, vp, theme, url: page.url(), action: 'Type an incomplete phone "11"', expected: 'Mask or validation hint for Brazilian mobile', validation: v4, shots: { atf: s3.atf, full: s1.full } });
  // 05 B2B segmentation
  await page.locator('#w-email').fill('teste@exemplo.com');
  await page.locator('label:has(input[name=tipo]):has-text("Para minha empresa")').first().click(); await sleep(500);
  const v5 = await page.evaluate(() => { const f = document.getElementById('espera-form'); const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }; return { visibleFields: [...f.elements].filter((e) => (e.name || e.id) && e.type !== 'hidden' && e.name !== '_honey' && vis(e)).map((e) => e.name + (e.required ? '*' : '')), segOptions: [...(document.getElementById('w-seg')?.options || [])].map((o) => o.text), segRequired: document.getElementById('w-seg')?.required, formValid: f.checkValidity() }; });
  const s5 = await shoot(page, J, 5, 'b2b-segment', vp, theme);
  step({ journey: J, step: 5, vp, theme, url: page.url(), action: 'Choose "Para minha empresa"', expected: 'Segment appears and is clearly required; B2C-only choices hide', validation: v5, shots: s5 });
  // 06 B2C + pré-assinar, stop before submit
  await page.locator('label:has(input[name=tipo]):has-text("Para mim")').first().click(); await sleep(400);
  const pre = page.locator('label:has(input[name=acesso]):has-text("Pré-assinar")').first(); if (await pre.count()) { await pre.click(); await sleep(500); }
  const v6 = await page.evaluate(() => { const f = document.getElementById('espera-form'); const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const btn = f.querySelector('button[type=submit], button:not([type]), input[type=submit]'); return { visibleFields: [...f.elements].filter((e) => (e.name || e.id) && e.type !== 'hidden' && e.name !== '_honey' && vis(e)).map((e) => e.name + (e.required ? '*' : '')), submitLabel: btn?.innerText.replace(/\s+/g, ' ').trim(), formValid: f.checkValidity(), consent: f.innerText.match(/(privacidade|LGPD|consent)[^.]*\./i)?.[0] }; });
  const sb = page.locator('#espera-form button[type=submit], #espera-form button:not([type])').first(); await sb.scrollIntoViewIfNeeded().catch(() => {}); await sleep(300);
  const s6 = await shoot(page, J, 6, 'prefilled-stop-before-submit', vp, theme);
  step({ journey: J, step: 6, vp, theme, url: page.url(), action: 'B2C + "Pré-assinar" with fake data; STOP — submit not clicked, Enter not pressed', expected: 'Clear what happens next (payment link by e-mail vs. direct checkout)', validation: v6, guardrail: true, note: 'stopped by guardrail before submit', shots: s6 });
  // 07 planos.html embedded waitlist
  const p7 = await ctx.newPage(); instrument(p7, { phase: J, vp, theme });
  await p7.goto(BASE + '/planos.html#espera-form', { waitUntil: 'networkidle' }); await sleep(1200);
  await p7.locator('#espera-form').first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(500);
  const s7 = await shoot(p7, J, 7, 'planos-embedded-waitlist', vp, theme, { full: false });
  step({ journey: J, step: 7, vp, theme, url: p7.url(), action: 'Waitlist form embedded on /planos.html', expected: 'Same fields and promise as /espera.html', fields: await p7.evaluate(() => [...document.querySelectorAll('#espera-form [name]')].filter((e) => e.type !== 'hidden' && e.name !== '_honey').map((e) => e.name)), shots: { ...s7, full: shotName('J3', 1, 'planos-full', vp, 'dark') } });
  // 08 demo / contact triggers → home #contato
  const p8 = await ctx.newPage(); instrument(p8, { phase: J, vp, theme });
  await p8.goto(BASE + '/#contato', { waitUntil: 'networkidle' }); await sleep(1500);
  await p8.locator('#contato').scrollIntoViewIfNeeded().catch(() => {}); await sleep(600);
  const contato = await p8.evaluate(() => { const c = document.getElementById('contato'); return c ? { text: c.innerText.replace(/\s+/g, ' ').slice(0, 600), links: [...c.querySelectorAll('a, form')].map((a) => a.tagName + ' ' + (a.getAttribute('href') || a.getAttribute('action'))) } : null; });
  const s8 = await shoot(p8, J, 8, 'contato-demo', vp, theme, { full: false });
  step({ journey: J, step: 8, vp, theme, url: p8.url(), action: 'Follow "Falar com a Trustio" / "Falar com um arquiteto" (#contato)', expected: 'A demo-booking path (form or scheduler) for B2B', contato, shots: { ...s8, full: shotName('J1', 1, 'hero-full', vp, 'dark') } });
  // 09 cadastro (primary home CTA "Criar conta grátis") — observe only
  const p9 = await ctx.newPage(); instrument(p9, { phase: J, vp, theme });
  await p9.goto(BASE + '/cadastro.html', { waitUntil: 'networkidle' }); await sleep(1200);
  const s9 = await shoot(p9, J, 9, 'cadastro', vp, theme);
  step({ journey: J, step: 9, vp, theme, url: p9.url(), action: 'Open /cadastro.html (target of the home primary CTA) — observe only, no account created', expected: 'Relationship between "conta", "lista de espera" and "pré-assinatura" is explained', firstViewportText: await p9.evaluate(firstViewportText), forms: await p9.evaluate(() => [...document.querySelectorAll('form')].map((f) => ({ id: f.id, fields: [...f.elements].map((e) => e.name || e.type).filter(Boolean) }))), guardrail: true, note: 'no login / no account creation', shots: s9 });
  await ctx.close();
}

// ───────────────────────── J5 Trust & legal
if (want('J5')) for (const vp of ['desktop', 'mobile']) {
  const J = 'J5', theme = 'dark';
  const claimsRe = /(ISO ?\d{4,5}[^.|]{0,60}|LGPD[^.|]{0,60}|ANPD[^.|]{0,60}|PCI[^.|]{0,40}|SOC ?2[^.|]{0,40}|certifica[^.|]{0,80}|CNPJ[^.|]{0,40}|Encarregad[^.|]{0,80}|DPO[^.|]{0,40}|xAI[^.|]{0,80}|hospedad[^.|]{0,80}|SLA[^.|]{0,40}|99,9[^.|]{0,40}|nunca[^.|]{0,80}|zero reten[^.|]{0,60}|criptograf[^.|]{0,60})/gi;
  let i = 1;
  for (const [slug, url, sel] of [['juridico', '/juridico/'], ['manifesto', '/manifesto.html'], ['fundador', '/fundador.html'], ['seguranca', '/#seguranca', '#seguranca'], ['footer', '/', 'footer'], ['privacidade', '/privacidade.html']]) {
    const { ctx, page, status } = await open(browser, vp, BASE + url, { journey: J });
    await sleep(1500); await warm(page);
    if (sel) { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(1600); }
    const claims = await page.evaluate((src) => { const re = new RegExp(src, 'gi'); const scope = document.querySelector('main') ? document.body : document.body; return [...new Set((scope.innerText.match(re) || []).map((s) => s.replace(/\s+/g, ' ').trim()))].slice(0, 40); }, claimsRe.source);
    const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => /iso|lgpd|anpd|xai|seal|selo/i.test(i.src + i.alt)).map((i) => ({ src: i.getAttribute('src'), alt: i.alt, linked: !!i.closest('a'), href: i.closest('a')?.getAttribute('href') || null })));
    const full = !sel || slug === 'seguranca' ? true : false;
    const sh = sel ? { ...(await shoot(page, J, i, slug, vp, theme, { full: false })), full: slug === 'footer' ? shotName('J1', 1, 'hero-full', vp, 'dark') : shotName('J1', 1, 'hero-full', vp, 'dark') } : await shoot(page, J, i, slug, vp, theme, { full });
    step({ journey: J, step: i, vp, theme, url: page.url(), status, action: `Read ${slug} as a skeptical ${vp === 'desktop' ? 'B2B buyer (P2)' : 'B2C visitor (P1)'}`, expected: 'Claims are specific and verifiable (certificate id, issuer, CNPJ, DPO contact, sub-processors)', claims, sealImages: imgs, firstViewportText: sel ? undefined : await page.evaluate(firstViewportText), shots: sh });
    await ctx.close(); i++;
  }
}

// ───────────────────────── J6 Mobile navigation (+ desktop keyboard/sticky/overflow)
if (want('J6')) {
  const J = 'J6', theme = 'dark';
  { // mobile
    const vp = 'mobile';
    const { ctx, page } = await open(browser, vp, BASE + '/', { journey: J }); await sleep(1500);
    const s1 = await shoot(page, J, 1, 'header', vp, theme, { full: false });
    step({ journey: J, step: 1, vp, theme, url: page.url(), action: 'Mobile header at rest', expected: 'Logo, primary CTA, menu; ≥44 px targets', header: await page.evaluate(() => [...document.querySelectorAll('header a, header button')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => ({ t: (a.innerText || a.getAttribute('aria-label')).trim(), w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) }))), shots: { ...s1, full: shotName('J1', 1, 'hero-full', vp, 'dark') } });
    const tg = page.locator('.menu-toggle').first(); await tg.click(); await sleep(600);
    const menu = await page.evaluate(() => { const m = document.getElementById('mobile-menu'); const r = m.getBoundingClientRect(); const items = [...m.querySelectorAll('a,button')].map((a) => ({ t: a.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width) })); return { menuH: Math.round(r.height), scrollH: m.scrollHeight, vh: innerHeight, bodyLocked: getComputedStyle(document.body).overflow, focusInside: m.contains(document.activeElement), items }; });
    const s2 = await shoot(page, J, 2, 'menu-open', vp, theme);
    step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Tap menu toggle', expected: 'Menu fits one screen, scroll locked, focus moves into menu', menu, expanded: await tg.getAttribute('aria-expanded'), shots: s2 });
    await page.keyboard.press('Escape'); await sleep(400);
    const escClosed = await tg.getAttribute('aria-expanded');
    const s3 = await shoot(page, J, 3, 'menu-escape', vp, theme, { full: false });
    step({ journey: J, step: 3, vp, theme, url: page.url(), action: 'Press Escape with menu open', expected: 'Menu closes, focus returns to toggle', expandedAfter: escClosed, activeEl: await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName), shots: { ...s3, full: s2.full } });
    if (escClosed === 'true') { await tg.click(); await sleep(300); }
    await tg.click(); await sleep(500);
    await page.locator('#mobile-menu a[href="#seguranca"]').first().click(); await sleep(1400);
    const after = await page.evaluate(() => ({ hash: location.hash, expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'), secTop: Math.round(document.getElementById('seguranca')?.getBoundingClientRect().top), headerH: Math.round(document.querySelector('header').getBoundingClientRect().height) }));
    const s4 = await shoot(page, J, 4, 'menu-anchor-seguranca', vp, theme, { full: false });
    step({ journey: J, step: 4, vp, theme, url: page.url(), action: 'Tap "Segurança" in the menu', expected: 'Menu closes; section heading not hidden under sticky header', after, shots: { ...s4, full: shotName('J1', 1, 'hero-full', vp, 'dark') } });
    // 05 tap-target overlay (audit annotation: red = < 24 px, amber = < 44 px)
    await page.evaluate(() => scrollTo(0, 0)); await warm(page);
    const tt = await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '.__t24{outline:2px solid #ff3b3b!important;outline-offset:1px} .__t44{outline:2px dashed #ffb454!important;outline-offset:1px}'; document.head.appendChild(st); let a = 0, b = 0; const list = []; document.querySelectorAll('a[href],button,input,select,textarea,[role=button]').forEach((el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return; const inline = getComputedStyle(el).display === 'inline' && el.closest('p,li,small'); const m = Math.min(r.width, r.height); if (m < 24 && !inline) { el.classList.add('__t24'); a++; list.push([el.innerText.trim().slice(0, 40) || el.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]); } else if (m < 44 && !inline) { el.classList.add('__t44'); b++; } }); return { under24: a, under44: b, samples24: list.slice(0, 15) }; });
    const s5 = await shoot(page, J, 5, 'tap-targets-annotated', vp, theme);
    step({ journey: J, step: 5, vp, theme, url: page.url(), action: 'Annotate tap targets (audit overlay: red <24 px, amber <44 px; inline text links excluded)', expected: 'No non-inline target under 24×24 (WCAG 2.2 SC 2.5.8); ideally ≥44', tapTargets: tt, shots: s5 });
    await ctx.close();
    // 06 overflow at 390 px on every page (visual check of the widest offenders)
    for (const [slug, url] of [['planos-table', '/planos.html'], ['modelos-table', '/modelos.html']]) {
      const o = await open(browser, vp, BASE + url, { journey: J }); await sleep(1000);
      await o.page.locator('table').first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(500);
      const info = await o.page.evaluate(() => { const t = document.querySelector('table'); const w = t.parentElement; return { docScrollW: document.documentElement.scrollWidth, vw: innerWidth, tableW: Math.round(t.getBoundingClientRect().width), wrapper: w.className, wrapperOverflow: getComputedStyle(w).overflowX, focusable: w.hasAttribute('tabindex'), scrollHint: !!w.querySelector('[class*=hint],[class*=scroll]') }; });
      const sh = await shoot(o.page, J, 6, 'overflow-' + slug, vp, theme, { full: false });
      step({ journey: J, step: 6, vp, theme, url: o.page.url(), action: `Check horizontal overflow on ${url}`, expected: 'No page-level horizontal scroll; wide tables contained with a cue', overflow: info, shots: { ...sh, full: shotName('J3', 1, 'planos-full', vp, 'dark') } });
      await o.ctx.close();
    }
  }
  { // desktop keyboard + sticky
    const vp = 'desktop';
    const { ctx, page } = await open(browser, vp, BASE + '/', { journey: J }); await sleep(1500);
    await page.keyboard.press('Tab'); await sleep(300);
    const f1 = await page.evaluate(() => ({ el: document.activeElement.innerText?.trim(), outline: getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineColor, visible: document.activeElement.getBoundingClientRect().top >= 0 }));
    const s1 = await shoot(page, J, 1, 'keyboard-skip-link', vp, theme, { full: false });
    step({ journey: J, step: 1, vp, theme, url: page.url(), action: 'Press Tab once', expected: 'Visible "skip to content" link', focus: f1, shots: { ...s1, full: shotName('J1', 1, 'hero-full', vp, 'dark') } });
    const order = []; for (let k = 0; k < 16; k++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return (a.innerText || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 40) + ' [' + cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.boxShadow.slice(0, 30) + ']'; })); }
    const s2 = await shoot(page, J, 2, 'keyboard-focus-ring', vp, theme, { full: false });
    step({ journey: J, step: 2, vp, theme, url: page.url(), action: 'Tab ×16 through header and hero (no Enter pressed)', expected: 'Logical order; visible focus ring on every stop', order, shots: { ...s2, full: shotName('J1', 1, 'hero-full', vp, 'dark') } });
    await ctx.close();
  }
}

await browser.close();
console.log('done', only.join(',') || 'all');
