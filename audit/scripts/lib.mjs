// Shared helpers for the Trustio read-only UX audit.
// Guardrails are enforced in code, not just by convention:
//  - every form submit is cancelled in the page (capture-phase listener + prototype overrides)
//  - any non-GET request to FormSubmit, api.trustio.com.br or Supabase is aborted at the network layer
//  - Stripe hosts are blocked unless the context was created with allowStripe=true
//  - each Stripe payment link can be opened at most once (persisted ledger)
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'https://trustio.com.br';
import { fileURLToPath } from 'node:url';
export const OUT = process.env.AUDIT_OUT || fileURLToPath(new URL('..', import.meta.url)); // audit/ by default
export const SHOTS = path.join(OUT, 'screenshots');
export const DATA = path.join(OUT, 'data');
for (const d of [SHOTS, DATA]) fs.mkdirSync(d, { recursive: true });

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  mobile: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
};

const GUARD_LOG = path.join(DATA, 'guardrail-log.jsonl');
const STRIPE_LEDGER = path.join(DATA, 'stripe-ledger.json');
export const EVENTS = path.join(DATA, 'events.jsonl');

export function log(file, obj) { fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n'); }
export const guard = (obj) => log(GUARD_LOG, obj);

export async function launch() {
  return chromium.launch({
    ...(process.env.AUDIT_PROXY ? { proxy: { server: process.env.AUDIT_PROXY } } : {}),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

// Fresh context = true first visit (no cookies, no storage).
export async function newContext(browser, vp, { allowStripe = false, journey = '', bypassCSP = false } = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'dark', ignoreHTTPSErrors: false, bypassCSP });
  await ctx.clearCookies();
  await ctx.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    const block = (how, form) => { console.warn('[AUDIT-GUARD] blocked form submission via ' + how + ' on #' + (form && (form.id || form.className))); };
    document.addEventListener('submit', (e) => { e.preventDefault(); e.stopImmediatePropagation(); block('submit-event', e.target); }, true);
    HTMLFormElement.prototype.submit = function () { block('form.submit()', this); };
    HTMLFormElement.prototype.requestSubmit = function () { block('form.requestSubmit()', this); };
  });
  await ctx.route('**/*', (route) => {
    const req = route.request();
    const u = req.url(); const m = req.method();
    const isStripe = /(^https?:\/\/)(buy|checkout|pay)\.stripe\.com/.test(u);
    if (/formsubmit\.co/.test(u) && m !== 'GET') { guard({ journey, action: 'abort', reason: 'FormSubmit non-GET', url: u, method: m }); return route.abort(); }
    if (/api\.trustio\.com\.br/.test(u) && m !== 'GET') { guard({ journey, action: 'abort', reason: 'waitlist API non-GET', url: u, method: m }); return route.abort(); }
    if (/supabase\.co/.test(u) && m !== 'GET') { guard({ journey, action: 'abort', reason: 'Supabase non-GET (auth/chat)', url: u, method: m }); return route.abort(); }
    if (/trustio\.com\.br/.test(u) && m === 'POST') { guard({ journey, action: 'abort', reason: 'POST to trustio', url: u }); return route.abort(); }
    if (isStripe && !allowStripe) { guard({ journey, action: 'abort', reason: 'Stripe navigation outside the one-time checkout capture', url: u }); return route.abort(); }
    return route.continue();
  });
  return ctx;
}

// Attach console / network / error capture to a page.
export function instrument(page, meta) {
  page.on('console', (msg) => { if (['error', 'warning'].includes(msg.type())) log(EVENTS, { kind: 'console-' + msg.type(), text: msg.text().slice(0, 500), url: page.url(), ...meta }); });
  page.on('pageerror', (err) => log(EVENTS, { kind: 'pageerror', text: String(err).slice(0, 500), url: page.url(), ...meta }));
  page.on('requestfailed', (req) => log(EVENTS, { kind: 'requestfailed', req: req.url(), failure: req.failure()?.errorText, url: page.url(), ...meta }));
  page.on('response', (res) => { if (res.status() >= 400) log(EVENTS, { kind: 'http-' + res.status(), req: res.url(), url: page.url(), ...meta }); });
}

// Scroll through the page to trigger lazy/reveal content, then back to top.
export async function warm(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight; const step = Math.round(innerHeight * 0.8);
    for (let y = 0; y < h; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400));
  });
}

export const shotName = (j, step, slug, vp, theme) => `${j}-${String(step).padStart(2, '0')}-${slug}-${vp}-${theme}.png`;

// Above-the-fold at device DPR + full page at CSS scale (keeps files committable; documented in the report).
export async function shoot(page, j, step, slug, vp, theme, { full = true } = {}) {
  const atf = shotName(j, step, slug, vp, theme);
  await page.screenshot({ path: path.join(SHOTS, atf), animations: 'allow' });
  const out = { atf };
  if (full) {
    const fp = shotName(j, step, slug + '-full', vp, theme);
    await fullShot(page, fp);
    out.full = fp;
  }
  return out;
}

// Full-page capture: scroll-reveal blocks are forced visible and transitions frozen for the capture only,
// otherwise off-screen .reveal sections render blank in a stitched full-page image (documented in the report).
export async function fullShot(page, name) {
  await page.evaluate(() => { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible')); const s = document.createElement('style'); s.id = '__audit_freeze'; s.textContent = '*,*::before,*::after{transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); });
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true, scale: 'css' });
  await page.evaluate(() => document.getElementById('__audit_freeze')?.remove());
}

export function stripeLedger() { try { return JSON.parse(fs.readFileSync(STRIPE_LEDGER, 'utf8')); } catch { return {}; } }
export function stripeMark(url, info) { const l = stripeLedger(); if (l[url]) throw new Error('GUARDRAIL: Stripe link already opened once: ' + url); l[url] = info; fs.writeFileSync(STRIPE_LEDGER, JSON.stringify(l, null, 2)); }

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const writeJSON = (name, obj) => fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj, null, 2));
