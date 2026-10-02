#!/usr/bin/env node
/**
 * Automated Headless Overflow & Layout Integrity Test Suite
 * 
 * Verifies that all 12 platform pages have zero horizontal scroll violations
 * (scrollWidth <= innerWidth and no clipped overflowing elements) across
 * the 6 target viewports: 360px, 375px, 390px, 768px, 1024px, 1440px.
 * 
 * Requirements:
 * - Node.js >= 22 (ESM)
 * - Google Chrome (installed at /Applications/Google Chrome.app or system PATH)
 * - playwright-core (available in npx cache or node_modules)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');

// Fallback search paths for playwright-core
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  const npxCacheBase = path.join(process.env.HOME || '', '.npm/_npx');
  let found = false;
  if (fs.existsSync(npxCacheBase)) {
    for (const dir of fs.readdirSync(npxCacheBase)) {
      const candidate = path.join(npxCacheBase, dir, 'node_modules/playwright-core');
      if (fs.existsSync(candidate)) {
        ({ chromium } = require(candidate));
        found = true;
        break;
      }
    }
  }
  if (!found) {
    console.error('Error: playwright-core not found in node_modules or ~/.npm/_npx');
    process.exit(1);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// 1. Start ephemeral static server
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/') p = '/index.html';
  else if (p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '.html';
  const filePath = path.join(root, p);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404).end('Not Found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// 2. Launch headless browser
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const pages = [
  'index.html',
  'voice.html',
  'planos.html',
  'seats.html',
  'espera.html',
  'cadastro.html',
  'entrar.html',
  'manifesto.html',
  'juridico/index.html',
  'fundador.html',
  'modelos.html',
  'privacidade.html',
];

const viewports = [
  { width: 360, height: 800, name: '360px (compact mobile)' },
  { width: 375, height: 812, name: '375px (iPhone SE)' },
  { width: 390, height: 844, name: '390px (iPhone modern)' },
  { width: 768, height: 1024, name: '768px (tablet portrait)' },
  { width: 1024, height: 768, name: '1024px (tablet landscape)' },
  { width: 1440, height: 900, name: '1440px (desktop standard)' },
];

console.log('================================================================================');
console.log(' TRUSTIO HEADLESS HORIZONTAL OVERFLOW VERIFICATION');
console.log(` Target: 12 pages × 6 viewports = 72 test assertions`);
console.log('================================================================================\n');

const violations = [];
const pageInstance = await browser.newPage();

for (const pg of pages) {
  process.stdout.write(`Testing ${pg.padEnd(22)} `);
  let pageFailures = 0;

  for (const vp of viewports) {
    await pageInstance.setViewportSize({ width: vp.width, height: vp.height });
    await pageInstance.goto(`http://127.0.0.1:${port}/${pg}`, { waitUntil: 'load' });
    await pageInstance.waitForTimeout(80);

    const result = await pageInstance.evaluate((width) => {
      // Check 1: root scrollWidth vs innerWidth
      const de = document.documentElement;
      const rootOver = de.scrollWidth - window.innerWidth;

      // Check 2: unmasked overflow if body has overflow-x: hidden
      const bodyStyle = getComputedStyle(document.body);
      const isMasked = bodyStyle.overflowX === 'hidden';

      let unmaskedOver = 0;
      let offenders = [];

      // Scan all body elements for boundary breach
      document.querySelectorAll('body *').forEach((el) => {
        // Skip hidden or zero-size elements
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        if (cs.position === 'fixed') return;

        if (r.right > window.innerWidth + 1) {
          const delta = Math.round(r.right - window.innerWidth);
          if (delta > unmaskedOver) unmaskedOver = delta;
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
          offenders.push(`${tag}${id}${cls} (+${delta}px, w=${Math.round(r.width)})`);
        }
      });

      return {
        rootOver: Math.max(0, rootOver),
        unmaskedOver,
        isMasked,
        offenders: offenders.slice(0, 4),
      };
    }, vp.width);

    if (result.rootOver > 0 || (result.isMasked && result.unmaskedOver > 0)) {
      pageFailures++;
      violations.push({
        page: pg,
        viewport: vp.width,
        vpName: vp.name,
        rootOver: result.rootOver,
        unmaskedOver: result.unmaskedOver,
        offenders: result.offenders,
      });
      process.stdout.write(`❌[${vp.width}px] `);
    } else {
      process.stdout.write(`✅[${vp.width}px] `);
    }
  }
  console.log(pageFailures === 0 ? ' PASS' : ` FAIL (${pageFailures})`);
}

await browser.close();
server.close();

console.log('\n================================================================================');
console.log(' OVERFLOW AUDIT SUMMARY');
console.log('================================================================================');
console.log(` Total Assertions:  ${pages.length * viewports.length}`);
console.log(` Violations Found:  ${violations.length}`);

if (violations.length > 0) {
  console.log('\nDetailed Violation Breakdown:');
  for (const v of violations) {
    console.log(`- ${v.page} @ ${v.vpName}: rootOver=${v.rootOver}px, unmaskedOver=${v.unmaskedOver}px`);
    if (v.offenders.length > 0) {
      console.log(`  ↳ Offending Elements: ${v.offenders.join(', ')}`);
    }
  }
  console.log('\nVerdict: FAILED — Horizontal overflow / clipping detected.');
  process.exit(1);
} else {
  console.log('\nVerdict: PASSED — 0 horizontal scroll violations detected across all routes.');
  process.exit(0);
}
