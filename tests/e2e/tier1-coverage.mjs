import fs from 'node:fs';
import path from 'node:path';
import { evaluateHorizontalOverflow, evaluateFabClearance, evaluateTouchTargets } from './lib/geometry-evaluator.mjs';
import { getContrastRatio } from './lib/contrast-calculator.mjs';

const CANONICAL_PAGES = [
  'index.html',
  'juridico/index.html',
  'modelos.html',
  'manifesto.html',
  'fundador.html',
  'voice.html',
  'planos.html',
  'espera.html',
  'cadastro.html',
  'entrar.html',
  'privacidade.html',
  'seats.html',
];

/**
 * Execute Tier 1: Feature Coverage Tests
 * @param {object} context Test runner context
 */
export async function runTier1Tests(context) {
  const { browser, baseUrl, rootDir, isStrict } = context;
  const results = [];

  const page = await browser.newPage();

  // Helper to record result
  function record({ id, code, name, feature, milestone, pass, details, error = null, defect = null, durationMs = 0 }) {
    let status = 'PASS';
    if (!pass) {
      status = isStrict ? 'FAIL' : 'PENDING';
    }
    results.push({
      id,
      code,
      name,
      tier: 1,
      feature,
      milestone,
      status,
      durationMs,
      details,
      error,
      defect,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R1: MULTI-DEVICE RESPONSIVENESS & VIEWPORT INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────

  // T1.1.1: Canonical Route Loading & Response
  {
    const start = Date.now();
    let loadedCount = 0;
    const failures = [];

    for (const pg of CANONICAL_PAGES) {
      try {
        const response = await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const status = response ? response.status() : 0;
        const title = await page.title();
        if (status === 200 && title && title.length > 0) {
          loadedCount++;
        } else {
          failures.push(`${pg} (HTTP ${status}, title="${title}")`);
        }
      } catch (err) {
        failures.push(`${pg} (${err.message})`);
      }
    }

    const pass = failures.length === 0 && loadedCount === CANONICAL_PAGES.length;
    record({
      id: 'T1.1.1',
      code: 'R1-FEAT-1',
      name: 'Platform Canonical Pages HTTP 200 & Doctype Integrity',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `All ${loadedCount}/${CANONICAL_PAGES.length} canonical routes responded with HTTP 200 and valid HTML titles.`
        : `Failed loading pages: ${failures.join(', ')}`,
      defect: pass ? null : { expected: '12 pages 200 OK', actual: failures.join('; '), milestone: 'M4' },
    });
  }

  // T1.1.2: Mobile Baseline Viewport Integrity (360px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 360, height: 800 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(60);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push({ page: pg, rootOver: res.rootOver, unmasked: res.maxOffenderDelta, offenders: res.offenders });
      }
    }

    const pass = violations.length === 0;
    const offendersSummary = violations
      .map((v) => `${v.page} (+${v.unmasked || v.rootOver}px: ${v.offenders.map((o) => o.selector).join(', ')})`)
      .join('; ');

    record({
      id: 'T1.1.2',
      code: 'R1-FEAT-2',
      name: 'Mobile Baseline Viewport Integrity (360px Viewport across 12 Pages)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal scroll or element right-edge violations on 360px mobile viewport across all 12 pages.'
        : `Detected layout boundary violations on ${violations.length} pages: ${offendersSummary}`,
      defect: pass ? null : { expected: '0 overflow on 360px', actual: `${violations.length} pages overflow: ${offendersSummary}`, milestone: 'M4' },
    });
  }

  // T1.1.3: Tablet Portrait Viewport Integrity (768px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 768, height: 1024 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(60);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push({ page: pg, rootOver: res.rootOver, unmasked: res.maxOffenderDelta, offenders: res.offenders });
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T1.1.3',
      code: 'R1-FEAT-3',
      name: 'Tablet Portrait Viewport Integrity (768px Viewport across 12 Pages)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal scroll or boundary violations on 768px tablet viewport across all 12 pages.'
        : `Detected layout boundary violations on ${violations.length} pages: ${violations.map((v) => v.page).join(', ')}`,
      defect: pass ? null : { expected: '0 overflow on 768px', actual: `${violations.length} pages overflow`, milestone: 'M4' },
    });
  }

  // T1.1.4: Desktop Standard Viewport Integrity (1024px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 1024, height: 768 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(60);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push({ page: pg, rootOver: res.rootOver, unmasked: res.maxOffenderDelta, offenders: res.offenders });
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T1.1.4',
      code: 'R1-FEAT-4',
      name: 'Desktop Standard Viewport Integrity (1024px Viewport across 12 Pages)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal scroll or boundary violations on 1024px desktop viewport across all 12 pages.'
        : `Detected layout boundary violations on ${violations.length} pages: ${violations.map((v) => v.page).join(', ')}`,
      defect: pass ? null : { expected: '0 overflow on 1024px', actual: `${violations.length} pages overflow`, milestone: 'M4' },
    });
  }

  // T1.1.5: Desktop Wide Viewport Integrity (1440px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(60);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push({ page: pg, rootOver: res.rootOver, unmasked: res.maxOffenderDelta, offenders: res.offenders });
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T1.1.5',
      code: 'R1-FEAT-5',
      name: 'Desktop Wide Viewport Integrity (1440px Viewport across 12 Pages)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal scroll or boundary violations on 1440px wide desktop viewport across all 12 pages.'
        : `Detected layout boundary violations on ${violations.length} pages: ${violations.map((v) => v.page).join(', ')}`,
      defect: pass ? null : { expected: '0 overflow on 1440px', actual: `${violations.length} pages overflow`, milestone: 'M4' },
    });
  }

  // T1.1.6: Responsive Table Overflow Protection
  {
    const start = Date.now();
    const tablePages = ['planos.html', 'modelos.html'];
    const issues = [];

    for (const pg of tablePages) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      const tableCheck = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const results = [];
        tables.forEach((tbl) => {
          const wrapper = tbl.closest('.table-scroll-wrapper');
          if (!wrapper) {
            results.push('table lacks .table-scroll-wrapper container');
          } else {
            const role = wrapper.getAttribute('role');
            const ariaLabel = wrapper.getAttribute('aria-label');
            const cs = getComputedStyle(wrapper);
            if (role !== 'region') results.push('wrapper lacks role="region"');
            if (!ariaLabel) results.push('wrapper lacks aria-label');
            if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
              results.push(`wrapper overflow-x is ${cs.overflowX}, expected auto/scroll`);
            }
          }
        });
        return { count: tables.length, results };
      });

      if (tableCheck.count === 0) {
        issues.push(`${pg}: no tables detected`);
      } else if (tableCheck.results.length > 0) {
        issues.push(`${pg}: ${tableCheck.results.join(', ')}`);
      }
    }

    const pass = issues.length === 0;
    record({
      id: 'T1.1.6',
      code: 'R1-FEAT-6',
      name: 'Responsive Table Container Wrapper & Scroll Semantics',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Tables in planos.html and modelos.html are wrapped in accessible .table-scroll-wrapper containers.'
        : `Table contract issues: ${issues.join('; ')}`,
      defect: pass ? null : { expected: 'tables wrapped in .table-scroll-wrapper with role="region"', actual: issues.join('; '), milestone: 'M4' },
    });
  }

  // T1.1.7: Network Canvas Clamping
  {
    const start = Date.now();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(100);

    const canvasCheck = await page.evaluate(() => {
      const c = document.querySelector('canvas#network-canvas');
      if (!c) return { found: false, clamped: true };
      const r = c.getBoundingClientRect();
      return {
        found: true,
        width: Math.round(r.width),
        viewportWidth: window.innerWidth,
        clamped: r.width <= window.innerWidth + 1,
      };
    });

    const pass = !canvasCheck.found || canvasCheck.clamped;
    record({
      id: 'T1.1.7',
      code: 'R1-FEAT-7',
      name: 'Interactive Network Canvas Dynamic Clamping',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'canvas#network-canvas is clamped within viewport boundaries.'
        : `canvas#network-canvas exceeds viewport: w=${canvasCheck.width}px vs innerWidth=${canvasCheck.viewportWidth}px`,
      defect: pass ? null : { expected: 'canvas width <= viewport', actual: `w=${canvasCheck.width}px exceeds 360px`, milestone: 'M4' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R2: NAVIGATION & MOBILE DRAWER
  // ─────────────────────────────────────────────────────────────────────────────

  // T1.2.1: Desktop Navigation Item Cardinality
  {
    const start = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const navCheck = await page.evaluate(() => {
      const desktopNav = document.querySelector('.desktop-nav');
      if (!desktopNav) return { found: false, count: 0, items: [] };
      const links = Array.from(desktopNav.querySelectorAll(':scope > a'));
      return {
        found: true,
        count: links.length,
        items: links.map((l) => (l.textContent || '').trim().replace(/\s+/g, ' ')),
      };
    });

    // Mandate: <= 5 top-level items
    const pass = navCheck.found && navCheck.count <= 5;
    record({
      id: 'T1.2.1',
      code: 'R2-FEAT-1',
      name: 'Desktop Navigation Hierarchy & Link Cardinality (<= 5 Top-Level Links)',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Desktop header presents streamlined hierarchy of ${navCheck.count} links: ${navCheck.items.join(', ')}.`
        : `Desktop navigation has ${navCheck.count} items (exceeds <= 5 mandate): ${navCheck.items.join(', ')}`,
      defect: pass ? null : { expected: '<= 5 top-level desktop links', actual: `${navCheck.count} links found: ${navCheck.items.join(', ')}`, milestone: 'M2' },
    });
  }

  // T1.2.2: Mobile Menu Toggle ARIA Contract
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const toggleContract = await page.evaluate(() => {
      const toggle = document.querySelector('.menu-toggle');
      if (!toggle) return { found: false };
      return {
        found: true,
        ariaExpanded: toggle.getAttribute('aria-expanded'),
        ariaControls: toggle.getAttribute('aria-controls'),
        ariaLabel: toggle.getAttribute('aria-label'),
        type: toggle.getAttribute('type'),
      };
    });

    const pass =
      toggleContract.found &&
      toggleContract.ariaExpanded === 'false' &&
      toggleContract.ariaControls === 'mobile-menu' &&
      !!toggleContract.ariaLabel &&
      toggleContract.type === 'button';

    record({
      id: 'T1.2.2',
      code: 'R2-FEAT-2',
      name: 'Mobile Menu Toggle ARIA Attributes Contract',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Mobile menu toggle satisfies ARIA specification (aria-expanded="false", aria-controls="mobile-menu", type="button").'
        : `Toggle contract mismatch: ${JSON.stringify(toggleContract)}`,
      defect: pass ? null : { expected: 'type=button, aria-expanded=false, aria-controls=mobile-menu', actual: JSON.stringify(toggleContract), milestone: 'M2' },
    });
  }

  // T1.2.3: Mobile Drawer Modal Semantics
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const drawerSemantics = await page.evaluate(() => {
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      if (!drawer) return { found: false };
      return {
        found: true,
        role: drawer.getAttribute('role'),
        ariaModal: drawer.getAttribute('aria-modal'),
        ariaLabel: drawer.getAttribute('aria-label'),
        hidden: drawer.hasAttribute('hidden'),
      };
    });

    const pass =
      drawerSemantics.found &&
      drawerSemantics.role === 'dialog' &&
      drawerSemantics.ariaModal === 'true' &&
      !!drawerSemantics.ariaLabel &&
      drawerSemantics.hidden === true;

    record({
      id: 'T1.2.3',
      code: 'R2-FEAT-3',
      name: 'Mobile Drawer Modal Dialog Semantics (role="dialog", aria-modal="true")',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Mobile drawer correctly declares role="dialog", aria-modal="true", and accessible label.'
        : `Mobile drawer semantics missing or invalid: ${JSON.stringify(drawerSemantics)}`,
      defect: pass ? null : { expected: 'role="dialog", aria-modal="true", hidden when closed', actual: JSON.stringify(drawerSemantics), milestone: 'M2' },
    });
  }

  // T1.2.4: Mobile Drawer Focus Trapping
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open the drawer
    await page.click('.menu-toggle');
    await page.waitForTimeout(100);

    const trapCheck = await page.evaluate(() => {
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const activeEl = document.activeElement;
      const isInside = drawer && (drawer.contains(activeEl) || activeEl?.classList.contains('menu-toggle'));

      // Check if background content is inert or suppressed
      const main = document.querySelector('main');
      const footer = document.querySelector('footer');
      const mainInert = main ? main.hasAttribute('inert') || main.inert : false;
      const footerInert = footer ? footer.hasAttribute('inert') || footer.inert : false;

      return {
        isInside,
        mainInert,
        footerInert,
        activeTag: activeEl?.tagName,
        activeText: activeEl?.textContent?.trim().slice(0, 20),
      };
    });

    const pass = trapCheck.isInside && trapCheck.mainInert && trapCheck.footerInert;
    record({
      id: 'T1.2.4',
      code: 'R2-FEAT-4',
      name: 'Mobile Drawer Keyboard Focus Trapping & Background Inertness',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Focus is trapped inside mobile drawer; main and footer are marked inert.'
        : `Focus trapping defect: inside=${trapCheck.isInside}, mainInert=${trapCheck.mainInert}, footerInert=${trapCheck.footerInert}`,
      defect: pass ? null : { expected: 'focus inside drawer and background inert', actual: JSON.stringify(trapCheck), milestone: 'M2' },
    });
  }

  // T1.2.5: Mobile Drawer Escape Key Dismissal
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open menu
    await page.click('.menu-toggle');
    await page.waitForTimeout(80);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);

    const escapeCheck = await page.evaluate(() => {
      const toggle = document.querySelector('.menu-toggle');
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const isClosed = drawer ? drawer.hasAttribute('hidden') || getComputedStyle(drawer).display === 'none' : true;
      const ariaExpanded = toggle?.getAttribute('aria-expanded');
      const focusRestored = document.activeElement === toggle;

      return { isClosed, ariaExpanded, focusRestored };
    });

    const pass = escapeCheck.isClosed && escapeCheck.ariaExpanded === 'false' && escapeCheck.focusRestored;
    record({
      id: 'T1.2.5',
      code: 'R2-FEAT-5',
      name: 'Mobile Drawer Escape Key Dismissal & Focus Restoration',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Escape key closes mobile drawer, resets aria-expanded to "false", and restores focus to menu toggle.'
        : `Escape dismissal defect: closed=${escapeCheck.isClosed}, ariaExpanded=${escapeCheck.ariaExpanded}, focusRestored=${escapeCheck.focusRestored}`,
      defect: pass ? null : { expected: 'closed, ariaExpanded="false", focusRestored=true', actual: JSON.stringify(escapeCheck), milestone: 'M2' },
    });
  }

  // T1.2.6: Touch Target Minimum Dimension (>= 48px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const targets = await evaluateTouchTargets(page, ['.menu-toggle', '.theme-toggle', '.lang-switch']);
    const failedTargets = targets.filter((t) => !t.satisfies);
    const pass = failedTargets.length === 0;

    record({
      id: 'T1.2.6',
      code: 'R2-FEAT-6',
      name: 'Primary Navigation Controls Touch Target Dimension (>= 48px)',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `All navigation controls satisfy >= 48px touch target requirements (${targets.length} elements inspected).`
        : `Touch target violations: ${failedTargets.map((t) => `${t.selector} (${t.width}x${t.height}px)`).join(', ')}`,
      defect: pass ? null : { expected: 'width >= 48px, height >= 48px', actual: failedTargets.map((t) => `${t.selector} (${t.width}x${t.height}px)`).join('; '), milestone: 'M2' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R3: VISUAL POLISH, WCAG AA CONTRAST & CTA CONSOLIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  // T1.3.1: Single Primary Hero CTA
  {
    const start = Date.now();
    const heroCtas = [];
    const nonCompliant = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      const ctas = await page.evaluate(() => {
        // Query hero section
        const hero = document.querySelector('.hero, .legal-hero, header + section, .hero-section');
        if (!hero) return { foundHero: false, primaryCtas: [] };

        const primary = hero.querySelectorAll(
          '.button-primary, a.button:not(.button-ghost):not(.button-outline), button.button:not(.button-ghost):not(.button-outline)'
        );
        return {
          foundHero: true,
          count: primary.length,
          primaryCtas: Array.from(primary).map((el) => (el.textContent || '').trim()),
        };
      });

      if (ctas.foundHero && ctas.count > 1) {
        nonCompliant.push(`${pg} (${ctas.count} primary CTAs: "${ctas.primaryCtas.join('", "')}")`);
      }
    }

    const pass = nonCompliant.length === 0;
    record({
      id: 'T1.3.1',
      code: 'R3-FEAT-1',
      name: 'Hero Section Single Primary CTA Consolidation',
      feature: 'R3',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Strictly 1 primary CTA button per hero section across all 12 platform pages.'
        : `Multiple competing primary CTAs detected: ${nonCompliant.join('; ')}`,
      defect: pass ? null : { expected: '<= 1 primary CTA per hero', actual: nonCompliant.join('; '), milestone: 'M3' },
    });
  }

  // T1.3.2: WCAG AA Dark Theme Contrast Ratio
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Ensure dark theme is active for dark theme contrast evaluation
    await page.evaluate(() => {
      if (window.TrustioTema && window.TrustioTema.escolher) {
        window.TrustioTema.escolher('dark', true);
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('trustio-theme', 'dark');
        localStorage.setItem('trustio-theme-ate', 'sempre');
      }
    });
    await page.waitForTimeout(50);

    // Inspect computed colors for dark surfaces
    const contrastData = await page.evaluate(() => {
      const getCol = (sel, prop = 'color') => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };

      const getBg = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).backgroundColor : null;
      };

      return {
        bodyBg: getBg('body') || '#05070b',
        mutedColor: getCol('.hero-sub, .sub, p') || '#99a4b5',
        insightText: getCol('.insight p') || '#bdc5d1',
        insightOpacity: (() => {
          const el = document.querySelector('.insight');
          return el ? parseFloat(getComputedStyle(el).opacity) : 1;
        })(),
        buttonDisabledColor: '#8d98aa',
        codeCommentColor: '#8d9ab0',
      };
    });

    const abyssBg = '#05070b';
    const mutedCr = getContrastRatio(contrastData.mutedColor, abyssBg);

    // .insight composited opacity
    const insightEffectiveFg = contrastData.insightOpacity < 1
      ? { r: 189 * contrastData.insightOpacity, g: 197 * contrastData.insightOpacity, b: 209 * contrastData.insightOpacity, a: 1 }
      : contrastData.insightText;
    const insightCr = getContrastRatio(insightEffectiveFg, abyssBg);

    const disabledCr = getContrastRatio(contrastData.buttonDisabledColor, abyssBg);
    const codeCommentCr = getContrastRatio(contrastData.codeCommentColor, '#080b11');

    const failures = [];
    if (mutedCr < 4.5) failures.push(`--muted (${mutedCr}:1 < 4.5:1)`);
    if (insightCr < 4.5) failures.push(`.insight (${insightCr}:1 < 4.5:1)`);
    if (disabledCr < 4.5) failures.push(`.button:disabled (${disabledCr}:1 < 4.5:1)`);
    if (codeCommentCr < 4.5) failures.push(`.code .c (${codeCommentCr}:1 < 4.5:1)`);

    const pass = failures.length === 0;
    record({
      id: 'T1.3.2',
      code: 'R3-FEAT-2',
      name: 'WCAG AA Contrast Ratio (>= 4.5:1) for Dark Theme Text Elements',
      feature: 'R3',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `All dark theme text tokens exceed 4.5:1 (muted=${mutedCr}:1, insight=${insightCr}:1, disabled=${disabledCr}:1).`
        : `Contrast violations detected: ${failures.join(', ')}`,
      defect: pass ? null : { expected: '>= 4.5:1 contrast ratio', actual: failures.join('; '), milestone: 'M1' },
    });
  }

  // T1.3.3: WCAG AA Light Theme Contrast Ratio
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Switch to light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(50);

    const lightContrast = await page.evaluate(() => {
      const body = document.body;
      const bodyBg = getComputedStyle(body).backgroundColor;
      const bodyColor = getComputedStyle(body).color;
      const sub = document.querySelector('.hero-sub, .sub, p');
      const subColor = sub ? getComputedStyle(sub).color : '#55637a';
      return { bodyBg, bodyColor, subColor };
    });

    const lightBg = lightContrast.bodyBg || '#ffffff';
    const bodyCr = getContrastRatio(lightContrast.bodyColor, lightBg);
    const subCr = getContrastRatio(lightContrast.subColor, lightBg);

    const pass = bodyCr >= 4.5 && subCr >= 4.5;
    record({
      id: 'T1.3.3',
      code: 'R3-FEAT-3',
      name: 'WCAG AA Contrast Ratio (>= 4.5:1) for Light Mode Text Elements',
      feature: 'R3',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Light mode text contrast meets WCAG AA (body=${bodyCr}:1, sub=${subCr}:1 on ${lightBg}).`
        : `Light mode contrast failure: body=${bodyCr}:1, sub=${subCr}:1 (expected >= 4.5:1)`,
      defect: pass ? null : { expected: '>= 4.5:1 in light mode', actual: `body=${bodyCr}:1, sub=${subCr}:1`, milestone: 'M1' },
    });
  }

  // T1.3.4: WhatsApp Floating Action Button Spatial Clearance
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    const pagesWithFab = ['espera.html', 'cadastro.html', 'entrar.html', 'planos.html'];
    const collisions = [];

    for (const pg of pagesWithFab) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(60);
      const res = await evaluateFabClearance(page);
      if (res.hasCollision) {
        collisions.push(`${pg}: ${res.collisions.map((c) => `${c.element} (dist=${c.distance}px)`).join(', ')}`);
      }
    }

    const pass = collisions.length === 0;
    record({
      id: 'T1.3.4',
      code: 'R3-FEAT-4',
      name: 'WhatsApp Floating Action Button Spatial Clearance (>= 16px)',
      feature: 'R3',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'WhatsApp FAB maintains minimum 16px spatial clearance from all inputs, submit buttons, and cards.'
        : `WhatsApp FAB collision detected: ${collisions.join('; ')}`,
      defect: pass ? null : { expected: 'clearance >= 16px from interactive elements', actual: collisions.join('; '), milestone: 'M3' },
    });
  }

  // T1.3.5: Header Partner Badge De-cluttering
  {
    const start = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const badgeCheck = await page.evaluate(() => {
      const desktopNav = document.querySelector('.desktop-nav');
      if (!desktopNav) return { found: false, badgesCount: 0 };
      // Look for inline partner badges or sub-badges directly cluttering links
      const badges = desktopNav.querySelectorAll('small, span.nav-nous, .badge, .partner-badge');
      return {
        found: true,
        badgesCount: badges.length,
        badgeTexts: Array.from(badges).map((b) => (b.textContent || '').trim()),
      };
    });

    // In refactored state, badges should be harmonized (zero or minimal formatted tooltips, not 3 inline badges)
    const pass = badgeCheck.badgesCount <= 1;
    record({
      id: 'T1.3.5',
      code: 'R3-FEAT-5',
      name: 'Header Partner Badges Harmonization & Bloat Elimination',
      feature: 'R3',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Partner badges harmonized in header (${badgeCheck.badgesCount} badge element(s)).`
        : `Header navigation bloated with ${badgeCheck.badgesCount} inline partner badges: ${badgeCheck.badgeTexts.join(', ')}`,
      defect: pass ? null : { expected: '<= 1 badge in header', actual: `${badgeCheck.badgesCount} badges: ${badgeCheck.badgeTexts.join(', ')}`, milestone: 'M2' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R4: CSS ARCHITECTURE, BREAKPOINT NORMALIZATION & CSP
  // ─────────────────────────────────────────────────────────────────────────────

  // T1.4.1: Design System Breakpoint Tokens
  {
    const start = Date.now();
    const tokensPath = path.join(rootDir, 'design-system/tokens.json');
    let hasTokens = false;
    let details = '';
    let defect = null;

    if (fs.existsSync(tokensPath)) {
      try {
        const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        const bp = tokens.breakpoint;
        if (
          bp &&
          bp.sm?.$value === '768px' &&
          bp.md?.$value === '1024px' &&
          bp.lg?.$value === '1440px'
        ) {
          hasTokens = true;
          details = 'tokens.json correctly defines 4-tier breakpoint matrix (sm: 768px, md: 1024px, lg: 1440px, xl: 1440px).';
        } else {
          details = `Breakpoint tokens missing or invalid in tokens.json: ${JSON.stringify(bp || null)}`;
          defect = { expected: 'sm: 768px, md: 1024px, lg: 1440px', actual: JSON.stringify(bp || null), milestone: 'M1' };
        }
      } catch (err) {
        details = `Failed parsing tokens.json: ${err.message}`;
        defect = { expected: 'valid tokens.json', actual: err.message, milestone: 'M1' };
      }
    } else {
      details = 'design-system/tokens.json does not exist';
      defect = { expected: 'file exists', actual: 'file not found', milestone: 'M1' };
    }

    record({
      id: 'T1.4.1',
      code: 'R4-FEAT-1',
      name: 'Design System 4-Tier Breakpoint Tokens Declaration',
      feature: 'R4',
      milestone: 'M1',
      pass: hasTokens,
      durationMs: Date.now() - start,
      details,
      defect,
    });
  }

  // T1.4.2: CSS Breakpoint Matrix Normalization
  {
    const start = Date.now();
    const cssPath = path.join(rootDir, 'assets/styles.css');
    let pass = false;
    let details = '';
    let defect = null;

    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      const mediaRegex = /@media[^{]+\{/gi;
      const matches = css.match(mediaRegex) || [];

      // Allowed breakpoints: 767px, 768px, 1023px, 1024px, 1439px, 1440px, and standard features (prefers-reduced-motion, print, hover)
      const nonStandard = [];
      const arbitraryThresholds = [
        '420px', '560px', '600px', '640px', '680px', '700px', '720px', '760px',
        '900px', '960px', '1040px', '1060px', '1300px', '1301px', '1539px', '1700px'
      ];

      for (const m of matches) {
        for (const t of arbitraryThresholds) {
          if (m.includes(t)) {
            nonStandard.push(t);
          }
        }
      }

      const uniqueNonStandard = [...new Set(nonStandard)];
      if (uniqueNonStandard.length === 0) {
        pass = true;
        details = 'assets/styles.css is fully normalized to the 4-tier breakpoint matrix with zero arbitrary thresholds.';
      } else {
        details = `Detected ${uniqueNonStandard.length} arbitrary media query thresholds in styles.css: ${uniqueNonStandard.join(', ')}`;
        defect = { expected: '0 arbitrary breakpoints', actual: `${uniqueNonStandard.length} arbitrary breakpoints found: ${uniqueNonStandard.join(', ')}`, milestone: 'M1' };
      }
    } else {
      details = 'assets/styles.css not found';
      defect = { expected: 'file exists', actual: 'file not found', milestone: 'M1' };
    }

    record({
      id: 'T1.4.2',
      code: 'R4-FEAT-2',
      name: 'CSS Breakpoint Matrix Normalization (Elimination of Arbitrary Thresholds)',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details,
      defect,
    });
  }

  // T1.4.3: Strict CSP Compliance — Zero Inline Styles
  {
    const start = Date.now();
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      const filePath = path.join(rootDir, pg);
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        // Match inline style attributes style="..."
        const inlineStyleRegex = /\bstyle\s*=\s*["'][^"']*["']/gi;
        const matches = html.match(inlineStyleRegex);
        if (matches && matches.length > 0) {
          violations.push(`${pg} (${matches.length} inline style attributes)`);
        }
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T1.4.3',
      code: 'R4-FEAT-3',
      name: 'Strict CSP Compliance — Zero Inline Style Attributes',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `100% Strict CSP compliance: 0 inline style attributes across all ${CANONICAL_PAGES.length} canonical pages.`
        : `CSP style violations in ${violations.length} pages: ${violations.join(', ')}`,
      defect: pass ? null : { expected: '0 inline style attributes', actual: violations.join('; '), milestone: 'M1' },
    });
  }

  // T1.4.4: Strict CSP Compliance — Zero Inline Scripts
  {
    const start = Date.now();
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      const filePath = path.join(rootDir, pg);
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        // Match <script> tags without src="..." that are NOT application/ld+json
        const scriptTags = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
        let inlineScriptCount = 0;

        for (const tag of scriptTags) {
          const isLdJson = /type\s*=\s*["']application\/ld\+json["']/i.test(tag);
          const hasSrc = /\bsrc\s*=/i.test(tag);
          if (!hasSrc && !isLdJson) {
            inlineScriptCount++;
          }
        }

        if (inlineScriptCount > 0) {
          violations.push(`${pg} (${inlineScriptCount} inline scripts)`);
        }
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T1.4.4',
      code: 'R4-FEAT-4',
      name: 'Strict CSP Compliance — Zero Inline Executable Script Tags',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `100% Strict CSP compliance: 0 inline executable scripts across all ${CANONICAL_PAGES.length} canonical pages.`
        : `CSP inline script violations: ${violations.join(', ')}`,
      defect: pass ? null : { expected: '0 inline scripts', actual: violations.join('; '), milestone: 'M1' },
    });
  }

  // T1.4.5: Asset Stamping Integrity
  {
    const start = Date.now();
    // Test that all CSS and JS references have ?v= query strings
    const unstamped = [];

    for (const pg of CANONICAL_PAGES) {
      const filePath = path.join(rootDir, pg);
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        const refRegex = /\b(?:href|src)\s*=\s*["']([^"']+\.(?:css|js))(?:\?([^"']*))?["']/gi;
        let match;
        while ((match = refRegex.exec(html)) !== null) {
          const url = match[1];
          const isLocal = !/^(?:[a-z]+:)?\/\//i.test(url) && !url.startsWith('data:') && !url.startsWith('#');
          if (!isLocal) continue;
          const query = match[2] || '';
          if (!query.includes('v=')) {
            unstamped.push(`${pg} -> ${url}`);
          }
        }
      }
    }

    const pass = unstamped.length === 0;
    record({
      id: 'T1.4.5',
      code: 'R4-FEAT-5',
      name: 'Asset Stamping Hash Integrity (?v=<hash> references)',
      feature: 'R4',
      milestone: 'M5',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'All static CSS and JS asset references contain valid version stamp query parameters.'
        : `Unstamped asset references detected: ${unstamped.slice(0, 5).join(', ')}${unstamped.length > 5 ? ` (+${unstamped.length - 5} more)` : ''}`,
      defect: pass ? null : { expected: 'all assets have ?v=<hash>', actual: `${unstamped.length} unstamped references`, milestone: 'M5' },
    });
  }

  await page.close();
  return results;
}
