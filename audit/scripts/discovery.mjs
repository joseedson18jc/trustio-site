// Phase 0/1 — page inventory, nav map, CTA inventory, link check, axe-core, overflow + tap targets.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, OUT, DATA, launch, newContext, instrument, warm, writeJSON, sleep } from './lib.mjs';

const AXE = fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const AXE_DIR = path.join(OUT, 'axe'); fs.mkdirSync(AXE_DIR, { recursive: true });

const sitemap = await (await fetch(BASE + '/sitemap.xml').catch(() => null))?.text?.();
const PAGES = ['/', '/juridico/', '/modelos.html', '/manifesto.html', '/fundador.html', '/voice.html', '/planos.html', '/espera.html', '/cadastro.html', '/entrar.html', '/privacidade.html', '/seats.html'];
const EXPECTED_BY_BRIEF = ['/', '/juridico/', '/modelos.html', '/voice.html', '/planos.html', '/espera.html', '/manifesto.html', '/fundador.html', '/seats.html'];

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '').replace(/\//g, '_'));

const collect = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const region = (el) => {
    if (el.closest('#mobile-menu')) return 'mobile-menu';
    if (el.closest('header')) return 'header';
    if (el.closest('footer')) return 'footer';
    const s = el.closest('section[id], section, main > div'); return 'main' + (s && s.id ? '#' + s.id : '');
  };
  const txt = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const isCTA = (el) => el.tagName === 'BUTTON' || /btn|button|cta|pill|primary|secondary/i.test(el.className || '') || /[↗↓→]\s*$/.test(txt(el));
  const els = [...document.querySelectorAll('a[href], button, input[type=submit]')];
  const links = els.map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: txt(el), href: el.getAttribute('href') ? new URL(el.getAttribute('href'), location.href).href : null, rawHref: el.getAttribute('href'), cls: String(el.className || '').slice(0, 80), region: region(el), visible: vis(el), aboveFold: vis(el) && r.top + scrollY < innerHeight, cta: isCTA(el), w: Math.round(r.width), h: Math.round(r.height), target: el.getAttribute('target') || '' };
  });
  const h1 = [...document.querySelectorAll('h1')].map((h) => h.innerText.replace(/\s+/g, ' ').trim());
  const heads = [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ' ' + h.innerText.replace(/\s+/g, ' ').trim().slice(0, 100));
  const overflowers = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 8).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(' ')[0] + ' right=' + Math.round(el.getBoundingClientRect().right));
  const small = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button]')].filter(vis).map((el) => { const r = el.getBoundingClientRect(); const inline = getComputedStyle(el).display === 'inline' && !!el.closest('p, li, small, dd'); return { t: txt(el) || el.name || el.type, w: Math.round(r.width), h: Math.round(r.height), inline, region: region(el) }; });
  const forms = [...document.querySelectorAll('form')].map((f) => ({ id: f.id, action: f.getAttribute('action'), method: f.getAttribute('method'), fields: [...f.elements].filter((e) => e.name || e.id).map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type, name: e.name, id: e.id, required: e.required, autocomplete: e.autocomplete, label: (e.labels && e.labels[0] ? e.labels[0].innerText : e.getAttribute('aria-label') || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80), placeholder: e.placeholder || '' })) }));
  const imgs = [...document.querySelectorAll('img')].map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt'), w: i.naturalWidth }));
  const meta = { title: document.title, lang: document.documentElement.lang, description: document.querySelector('meta[name=description]')?.content || '', canonical: document.querySelector('link[rel=canonical]')?.href || '', theme: document.documentElement.getAttribute('data-theme') || 'dark(default)' };
  return { meta, h1, heads, links, overflow: { scrollWidth: document.documentElement.scrollWidth, innerWidth, overflowers }, small, forms, imgs, docHeight: document.documentElement.scrollHeight };
};

const browser = await launch();
const inventory = {};
for (const vp of ['desktop', 'mobile']) {
  for (const p of PAGES) {
    const ctx = await newContext(browser, vp, { journey: 'discovery', bypassCSP: true });
    const page = await ctx.newPage(); instrument(page, { phase: 'discovery', vp, page: p });
    const t0 = Date.now();
    const res = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ status: () => 'ERR ' + e.message.split('\n')[0] }));
    const loadMs = Date.now() - t0;
    await warm(page);
    const data = await page.evaluate(collect);
    // mobile menu map
    if (vp === 'mobile') {
      const toggle = page.locator('.menu-toggle').first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click(); await sleep(500);
        data.mobileMenu = await page.evaluate(() => [...document.querySelectorAll('#mobile-menu a, #mobile-menu button')].map((a) => ({ text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') })));
        data.menuExpanded = await toggle.getAttribute('aria-expanded');
      }
    }
    // axe-core (WCAG 2.0/2.1/2.2 A + AA)
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] }));
    fs.writeFileSync(path.join(AXE_DIR, `${slug(p)}-${vp}.json`), JSON.stringify({ url: axe.url, timestamp: axe.timestamp, testEngine: axe.testEngine, violations: axe.violations, incomplete: axe.incomplete }, null, 1));
    inventory[`${vp}:${p}`] = { status: res.status(), loadMs, ...data, axeSummary: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
    console.log(vp, p, res.status(), loadMs + 'ms', 'links', data.links.length, 'axe', axe.violations.length);
    await ctx.close();
  }
}
writeJSON('inventory.json', inventory);

// ---- link check (internal + external). Stripe links and the POST endpoint are excluded by guardrail.
const all = new Map();
for (const [k, v] of Object.entries(inventory)) for (const l of v.links) if (l.href) { const e = all.get(l.href) || { href: l.href, text: l.text, pages: new Set() }; e.pages.add(k.split(':')[1]); all.set(l.href, e); }
const ctx = await newContext(browser, 'desktop', { journey: 'linkcheck' });
const results = [];
const htmlCache = {};
for (const e of all.values()) {
  const u = e.href; const pages = [...e.pages];
  if (/^mailto:|^tel:|^javascript:/.test(u)) { results.push({ href: u, status: 'skipped (mailto/tel)', pages }); continue; }
  if (/stripe\.com/.test(u)) { results.push({ href: u, status: 'skipped by guardrail (Stripe live link — opened once in J3 only)', pages }); continue; }
  if (/api\.trustio\.com\.br\/signup/.test(u)) { results.push({ href: u, status: 'skipped by guardrail (POST endpoint)', pages }); continue; }
  const [base, hash] = u.split('#');
  let status;
  try { const r = await ctx.request.get(base, { timeout: 20000, maxRedirects: 5 }); status = r.status(); if (/trustio\.com\.br/.test(base) && r.ok()) htmlCache[base] = await r.text(); }
  catch (err) { status = 'ERR ' + String(err.message).split('\n')[0].slice(0, 120); }
  let anchor = null;
  if (hash && htmlCache[base]) anchor = new RegExp(`id=["']${hash}["']`).test(htmlCache[base]) ? 'ok' : 'MISSING';
  results.push({ href: u, status, anchor, pages });
}
await ctx.close();
writeJSON('linkcheck.json', results);
const bad = results.filter((r) => (typeof r.status === 'number' && r.status >= 400) || String(r.status).startsWith('ERR') || r.anchor === 'MISSING');
console.log('links checked', results.length, 'problems', bad.length);
console.log(JSON.stringify(bad, null, 1));
writeJSON('pages.json', { sitemapHasSeats: /seats\.html/.test(sitemap || ''), expectedByBrief: EXPECTED_BY_BRIEF, sitemapPages: PAGES });
await browser.close();
