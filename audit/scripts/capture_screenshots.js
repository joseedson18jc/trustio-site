/**
 * Automated Screenshot Catalog Capture Script for trustio.com.br UX Audit
 * 
 * Uses playwright-core with system Google Chrome.
 * Captures 24 high-resolution screenshots (16 desktop @ 2x, 8 mobile @ 3x).
 * 
 * Execution:
 * NODE_PATH=/Users/joseedson/.npm/_npx/e41f203b7505f1fb/node_modules node /Users/joseedson/github/trustio-site/audit/scripts/capture_screenshots.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, '../screenshots');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function captureCatalog() {
  console.log('🚀 Starting Trustio UX Screenshot Catalog Capture...');
  console.log(`📂 Destination: ${OUTPUT_DIR}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ==========================================
    // 1. DESKTOP VIEWPORT (1440x900 @ 2x DPR)
    // ==========================================
    console.log('\n🖥️ Setting up Desktop context (1440x900 @ 2x)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });

    const dPage = await desktopContext.newPage();

    // S01: Home Hero Desktop (Above the Fold)
    console.log('📸 [1/24] Capturing 01-home-hero-desktop.png...');
    await dPage.goto('https://trustio.com.br/', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '01-home-hero-desktop.png'),
      fullPage: false
    });

    // S02: Home Full Desktop (Full Page Scroll)
    console.log('📸 [2/24] Capturing 02-home-full-desktop.png...');
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '02-home-full-desktop.png'),
      fullPage: true
    });

    // S03: Voice Hero Desktop
    console.log('📸 [3/24] Capturing 03-voice-hero-desktop.png...');
    await dPage.goto('https://trustio.com.br/voice.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1500); // Allow WebGL orb to initialize
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '03-voice-hero-desktop.png'),
      fullPage: false
    });

    // S04: Voice Interactive Desktop (transcripts / drawer expanded)
    console.log('📸 [4/24] Capturing 04-voice-interactive-desktop.png...');
    // Click channel button to expand channel drawer
    const channelBtn = await dPage.$('.ch-btn[data-ch="whatsapp"]') || await dPage.$('.ch-btn[data-ch="phone"]');
    if (channelBtn) {
      await channelBtn.click();
      await dPage.waitForTimeout(800);
    }
    const chDetail = await dPage.$('#ch-detail');
    if (chDetail) {
      await chDetail.scrollIntoViewIfNeeded();
      await dPage.waitForTimeout(500);
    }
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '04-voice-interactive-desktop.png'),
      fullPage: false
    });

    // S05: Voice Full Desktop
    console.log('📸 [5/24] Capturing 05-voice-full-desktop.png...');
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '05-voice-full-desktop.png'),
      fullPage: true
    });

    // S06: Planos Empresas Desktop (B2B default)
    console.log('📸 [6/24] Capturing 06-planos-empresas-desktop.png...');
    await dPage.goto('https://trustio.com.br/planos.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '06-planos-empresas-desktop.png'),
      fullPage: false
    });

    // S07: Planos Pessoal Desktop (click B2C tab)
    console.log('📸 [7/24] Capturing 07-planos-pessoal-desktop.png...');
    const pessoalTab = await dPage.$('#tab-pessoal') || 
                       await dPage.$('button[data-seg="pessoal"]') || 
                       await dPage.$('button[data-tab="pessoal"]');
    if (pessoalTab) {
      await pessoalTab.click();
      await dPage.waitForTimeout(800);
    }
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '07-planos-pessoal-desktop.png'),
      fullPage: false
    });

    // S08: Seats Desktop
    console.log('📸 [8/24] Capturing 08-seats-desktop.png...');
    await dPage.goto('https://trustio.com.br/seats.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '08-seats-desktop.png'),
      fullPage: false
    });

    // S09: Manifesto Desktop
    console.log('📸 [9/24] Capturing 09-manifesto-desktop.png...');
    await dPage.goto('https://trustio.com.br/manifesto.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '09-manifesto-desktop.png'),
      fullPage: false
    });

    // S10: Jurídico Desktop
    console.log('📸 [10/24] Capturing 10-juridico-desktop.png...');
    await dPage.goto('https://trustio.com.br/juridico/', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '10-juridico-desktop.png'),
      fullPage: false
    });

    // S11: Fundador Desktop
    console.log('📸 [11/24] Capturing 11-fundador-desktop.png...');
    await dPage.goto('https://trustio.com.br/fundador.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '11-fundador-desktop.png'),
      fullPage: false
    });

    // S12: Modelos Desktop
    console.log('📸 [12/24] Capturing 12-modelos-desktop.png...');
    await dPage.goto('https://trustio.com.br/modelos.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '12-modelos-desktop.png'),
      fullPage: false
    });

    // S13: Espera Desktop (waitlist pre-submission)
    console.log('📸 [13/24] Capturing 13-espera-desktop.png...');
    await dPage.goto('https://trustio.com.br/espera.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    const esperaForm = await dPage.$('#espera-form');
    if (esperaForm) {
      await esperaForm.scrollIntoViewIfNeeded();
      await dPage.waitForTimeout(500);
    }
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '13-espera-desktop.png'),
      fullPage: false
    });

    // S14: Cadastro Desktop (registration pre-submission)
    console.log('📸 [14/24] Capturing 14-cadastro-desktop.png...');
    await dPage.goto('https://trustio.com.br/cadastro.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    const cadastroCard = await dPage.$('.conta-card') || await dPage.$('#cadastro-form');
    if (cadastroCard) {
      await cadastroCard.scrollIntoViewIfNeeded();
      await dPage.waitForTimeout(500);
    }
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '14-cadastro-desktop.png'),
      fullPage: false
    });

    // S15: Entrar Desktop (login pre-submission)
    console.log('📸 [15/24] Capturing 15-entrar-desktop.png...');
    await dPage.goto('https://trustio.com.br/entrar.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    const entrarCard = await dPage.$('.conta-card') || await dPage.$('#entrar-form');
    if (entrarCard) {
      await entrarCard.scrollIntoViewIfNeeded();
      await dPage.waitForTimeout(500);
    }
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '15-entrar-desktop.png'),
      fullPage: false
    });

    // S16: 404 Desktop (demonstrating 404 / legal gap)
    console.log('📸 [16/24] Capturing 16-404-desktop.png...');
    await dPage.goto('https://trustio.com.br/termos.html', { waitUntil: 'networkidle' });
    await dPage.waitForTimeout(1000);
    await dPage.screenshot({
      path: path.join(OUTPUT_DIR, '16-404-desktop.png'),
      fullPage: false
    });

    await desktopContext.close();

    // ==========================================
    // 2. MOBILE VIEWPORT (390x844 @ 3x DPR)
    // ==========================================
    console.log('\n📱 Setting up Mobile context (390x844 @ 3x, isMobile: true)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    });

    const mPage = await mobileContext.newPage();

    // S17: Home Mobile (hero)
    console.log('📸 [17/24] Capturing 17-home-mobile.png...');
    await mPage.goto('https://trustio.com.br/', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '17-home-mobile.png'),
      fullPage: false
    });

    // S18: Home Nav Mobile (menu toggled open)
    console.log('📸 [18/24] Capturing 18-home-nav-mobile.png...');
    const menuToggle = await mPage.$('.menu-toggle');
    if (menuToggle) {
      await menuToggle.click();
      await mPage.waitForTimeout(800); // Allow drawer transition
    }
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '18-home-nav-mobile.png'),
      fullPage: false
    });

    // S19: Voice Mobile
    console.log('📸 [19/24] Capturing 19-voice-mobile.png...');
    await mPage.goto('https://trustio.com.br/voice.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1500);
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '19-voice-mobile.png'),
      fullPage: false
    });

    // S20: Planos Mobile
    console.log('📸 [20/24] Capturing 20-planos-mobile.png...');
    await mPage.goto('https://trustio.com.br/planos.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    const planGrid = await mPage.$('.plan-grid');
    if (planGrid) {
      await planGrid.scrollIntoViewIfNeeded();
      await mPage.waitForTimeout(500);
    }
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '20-planos-mobile.png'),
      fullPage: false
    });

    // S21: Seats Mobile
    console.log('📸 [21/24] Capturing 21-seats-mobile.png...');
    await mPage.goto('https://trustio.com.br/seats.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '21-seats-mobile.png'),
      fullPage: false
    });

    // S22: Espera Mobile (waitlist form)
    console.log('📸 [22/24] Capturing 22-espera-mobile.png...');
    await mPage.goto('https://trustio.com.br/espera.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    const mEsperaForm = await mPage.$('#espera-form');
    if (mEsperaForm) {
      await mEsperaForm.scrollIntoViewIfNeeded();
      await mPage.waitForTimeout(500);
    }
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '22-espera-mobile.png'),
      fullPage: false
    });

    // S23: Cadastro Mobile (registration form)
    console.log('📸 [23/24] Capturing 23-cadastro-mobile.png...');
    await mPage.goto('https://trustio.com.br/cadastro.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    const mCadastroForm = await mPage.$('#cadastro-form') || await mPage.$('.conta-card');
    if (mCadastroForm) {
      await mCadastroForm.scrollIntoViewIfNeeded();
      await mPage.waitForTimeout(500);
    }
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '23-cadastro-mobile.png'),
      fullPage: false
    });

    // S24: Entrar Mobile (login form)
    console.log('📸 [24/24] Capturing 24-entrar-mobile.png...');
    await mPage.goto('https://trustio.com.br/entrar.html', { waitUntil: 'networkidle' });
    await mPage.waitForTimeout(1000);
    const mEntrarForm = await mPage.$('#entrar-form') || await mPage.$('.conta-card');
    if (mEntrarForm) {
      await mEntrarForm.scrollIntoViewIfNeeded();
      await mPage.waitForTimeout(500);
    }
    await mPage.screenshot({
      path: path.join(OUTPUT_DIR, '24-entrar-mobile.png'),
      fullPage: false
    });

    await mobileContext.close();

    console.log('\n✅ Successfully captured all 24 screenshots!');
  } finally {
    await browser.close();
  }
}

captureCatalog().catch((err) => {
  console.error('❌ Capture script encountered an error:', err);
  process.exit(1);
});
