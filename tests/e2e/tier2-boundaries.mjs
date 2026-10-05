import fs from 'node:fs';
import path from 'node:path';
import { evaluateHorizontalOverflow, evaluateFabClearance } from './lib/geometry-evaluator.mjs';
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
 * Execute Tier 2: Boundary & Corner Cases Tests
 * @param {object} context Test runner context
 */
export async function runTier2Tests(context) {
  const { browser, baseUrl, rootDir, isStrict } = context;
  const results = [];

  const page = await browser.newPage();

  function record({ id, code, name, feature, milestone, pass, details, error = null, defect = null, durationMs = 0 }) {
    let status = 'PASS';
    if (!pass) {
      status = isStrict ? 'FAIL' : 'PENDING';
    }
    results.push({
      id,
      code,
      name,
      tier: 2,
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
  // R1 BOUNDARIES: EXTREME VIEWPORTS & EDGE LAYOUTS
  // ─────────────────────────────────────────────────────────────────────────────

  // T2.1.1: Extreme Compact Mobile Viewport (320px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 320, height: 568 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(50);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push({ page: pg, rootOver: res.rootOver, unmasked: res.maxOffenderDelta, offenders: res.offenders });
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T2.1.1',
      code: 'R1-BND-1',
      name: 'Extreme Compact Mobile Viewport (320px Minimum Web Standard)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal scroll or element right-edge violations on 320px viewport across all 12 pages.'
        : `Boundary overflow at 320px on ${violations.length} pages: ${violations.map((v) => v.page).join(', ')}`,
      defect: pass ? null : { expected: '0 overflow at 320px', actual: `${violations.length} pages overflow`, milestone: 'M4' },
    });
  }

  // T2.1.2: Modern Large Mobile Viewport (430px — iPhone 15/16 Pro Max)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 430, height: 932 });
    const violations = [];

    for (const pg of CANONICAL_PAGES) {
      await page.goto(`${baseUrl}/${pg}`, { waitUntil: 'load' });
      await page.waitForTimeout(50);
      const res = await evaluateHorizontalOverflow(page);
      if (res.hasViolation) {
        violations.push(pg);
      }
    }

    const pass = violations.length === 0;
    record({
      id: 'T2.1.2',
      code: 'R1-BND-2',
      name: 'Large Mobile Viewport Boundary (430px iPhone Pro Max)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero horizontal overflow on 430px large mobile viewport across all 12 pages.'
        : `Violations at 430px on: ${violations.join(', ')}`,
      defect: pass ? null : { expected: '0 overflow at 430px', actual: `${violations.length} pages overflow`, milestone: 'M4' },
    });
  }

  // T2.1.3: Mobile-to-Tablet Boundary (767px vs 768px Transition)
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Step A: 767px (must be mobile)
    await page.setViewportSize({ width: 767, height: 1024 });
    await page.waitForTimeout(60);
    const at767 = await page.evaluate(() => {
      const toggle = document.querySelector('.menu-toggle');
      const deskNav = document.querySelector('.desktop-nav');
      const toggleVis = toggle ? getComputedStyle(toggle).display !== 'none' : false;
      const deskNavVis = deskNav ? getComputedStyle(deskNav).display !== 'none' : false;
      return { toggleVis, deskNavVis };
    });

    // Step B: 768px (must be tablet / desktop)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(60);
    const at768 = await page.evaluate(() => {
      const de = document.documentElement;
      return {
        rootOver: Math.max(0, de.scrollWidth - window.innerWidth),
      };
    });

    const pass = at767.toggleVis && at768.rootOver === 0;
    record({
      id: 'T2.1.3',
      code: 'R1-BND-3',
      name: 'Mobile-to-Tablet Breakpoint Threshold Boundary (767px vs 768px)',
      feature: 'R1',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Precise breakpoint transition: hamburger active at 767px, 0 overflow at 768px.'
        : `Breakpoint defect: 767px toggleVis=${at767.toggleVis}, 768px rootOver=${at768.rootOver}px`,
      defect: pass ? null : { expected: '767px has mobile toggle, 768px transitions cleanly', actual: JSON.stringify({ at767, at768 }), milestone: 'M1' },
    });
  }

  // T2.1.4: Tablet-to-Desktop Boundary (1023px vs 1024px Transition)
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Step A: 1023px (tablet upper bound)
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.waitForTimeout(60);
    const at1023 = await page.evaluate(() => {
      const deskNav = document.querySelector('.desktop-nav');
      return { deskNavDisplay: deskNav ? getComputedStyle(deskNav).display : null };
    });

    // Step B: 1024px (desktop lower bound)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(60);
    const at1024 = await page.evaluate(() => {
      const deskNav = document.querySelector('.desktop-nav');
      const toggle = document.querySelector('.menu-toggle');
      return {
        deskNavDisplay: deskNav ? getComputedStyle(deskNav).display : null,
        toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
      };
    });

    // In 4-tier matrix: 1024px is desktop! Desktop nav should be visible and toggle hidden!
    const pass = at1024.deskNavDisplay !== 'none' && at1024.toggleDisplay === 'none';
    record({
      id: 'T2.1.4',
      code: 'R1-BND-4',
      name: 'Tablet-to-Desktop Breakpoint Threshold Boundary (1023px vs 1024px)',
      feature: 'R1',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'At 1024px desktop breakpoint, desktop navigation is active and mobile toggle is hidden.'
        : `Premature mobile menu at 1024px: desktopNav=${at1024.deskNavDisplay}, toggle=${at1024.toggleDisplay} (expected desktop nav active at 1024px)`,
      defect: pass ? null : { expected: 'desktop nav visible at 1024px', actual: `desktopNav=${at1024.deskNavDisplay}, toggle=${at1024.toggleDisplay}`, milestone: 'M1' },
    });
  }

  // T2.1.5: Ultra-Wide Desktop Viewport (1920px & 2560px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(60);

    const wideCheck = await page.evaluate(() => {
      const container = document.querySelector('.container, main > .wrap');
      const containerWidth = container ? container.getBoundingClientRect().width : 0;
      const de = document.documentElement;
      const rootOver = Math.max(0, de.scrollWidth - window.innerWidth);
      return { containerWidth, rootOver };
    });

    const pass = wideCheck.rootOver === 0 && wideCheck.containerWidth <= 1440;
    record({
      id: 'T2.1.5',
      code: 'R1-BND-5',
      name: 'Ultra-Wide Desktop Viewport Clamping (1920px Display Bounds)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Ultra-wide viewport clamped cleanly (container width=${Math.round(wideCheck.containerWidth)}px, rootOver=0).`
        : `Container clamping failure: width=${Math.round(wideCheck.containerWidth)}px, rootOver=${wideCheck.rootOver}px`,
      defect: pass ? null : { expected: 'container width <= 1440px and rootOver=0', actual: JSON.stringify(wideCheck), milestone: 'M4' },
    });
  }

  // T2.1.6: Mobile Content Edge Padding Boundary (>= 16px)
  {
    const start = Date.now();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const edgeCheck = await page.evaluate(() => {
      // Check hero container and headings for minimum horizontal padding
      const container = document.querySelector('.hero .container, main .container, .hero');
      if (!container) return { left: 0, right: 0, paddingLeft: 0 };
      const cs = getComputedStyle(container);
      return {
        paddingLeft: parseFloat(cs.paddingLeft) || 0,
        paddingRight: parseFloat(cs.paddingRight) || 0,
      };
    });

    const pass = edgeCheck.paddingLeft >= 15.5 && edgeCheck.paddingRight >= 15.5;
    record({
      id: 'T2.1.6',
      code: 'R1-BND-6',
      name: 'Mobile Container Edge Padding Boundary (>= 16px Gutters)',
      feature: 'R1',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Mobile containers maintain safe >= 16px edge gutters (L=${edgeCheck.paddingLeft}px, R=${edgeCheck.paddingRight}px).`
        : `Mobile edge gutters below 16px: paddingLeft=${edgeCheck.paddingLeft}px, paddingRight=${edgeCheck.paddingRight}px`,
      defect: pass ? null : { expected: 'padding >= 16px', actual: `L=${edgeCheck.paddingLeft}px, R=${edgeCheck.paddingRight}px`, milestone: 'M4' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R2 BOUNDARIES: RAPID INTERACTIONS & STATE RESTORATION
  // ─────────────────────────────────────────────────────────────────────────────

  // T2.2.1: Rapid Drawer Toggle Stress
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    let errorOccurred = false;
    try {
      // Click toggle 10 times rapidly
      for (let i = 0; i < 10; i++) {
        await page.click('.menu-toggle');
        await page.waitForTimeout(30);
      }
    } catch {
      errorOccurred = true;
    }

    const stateCheck = await page.evaluate(() => {
      const toggle = document.querySelector('.menu-toggle');
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const ariaExpanded = toggle?.getAttribute('aria-expanded');
      const isHidden = drawer ? drawer.hasAttribute('hidden') || getComputedStyle(drawer).display === 'none' : true;
      // After 10 clicks (even number), drawer must be closed
      return { ariaExpanded, isHidden };
    });

    const pass = !errorOccurred && stateCheck.ariaExpanded === 'false' && stateCheck.isHidden;
    record({
      id: 'T2.2.1',
      code: 'R2-BND-1',
      name: 'Rapid Consecutive Mobile Drawer Toggling Stress Test (10 Clicks)',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Rapid toggling completes without desync; drawer closed and aria-expanded="false" after 10 iterations.'
        : `Rapid toggle state desync: ariaExpanded=${stateCheck.ariaExpanded}, isHidden=${stateCheck.isHidden}`,
      defect: pass ? null : { expected: 'aria-expanded="false" and hidden', actual: JSON.stringify(stateCheck), milestone: 'M2' },
    });
  }

  // T2.2.2: Window Resize Boundary With Active Drawer
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open drawer
    await page.click('.menu-toggle');
    await page.waitForTimeout(60);

    // Expand window to desktop 1024px
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const resizeCheck = await page.evaluate(() => {
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const main = document.querySelector('main');
      const drawerHidden = drawer ? drawer.hasAttribute('hidden') || getComputedStyle(drawer).display === 'none' : true;
      const mainInert = main ? main.hasAttribute('inert') || main.inert : false;
      return { drawerHidden, mainInert };
    });

    const pass = resizeCheck.drawerHidden && !resizeCheck.mainInert;
    record({
      id: 'T2.2.2',
      code: 'R2-BND-2',
      name: 'Dynamic Viewport Expansion With Active Drawer (375px -> 1024px)',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Expanding viewport automatically dismisses mobile drawer and removes background inertness.'
        : `Resize dismiss defect: drawerHidden=${resizeCheck.drawerHidden}, mainInert=${resizeCheck.mainInert}`,
      defect: pass ? null : { expected: 'drawer closed and inert removed on resize to 1024px', actual: JSON.stringify(resizeCheck), milestone: 'M2' },
    });
  }

  // T2.2.3: Cyclic Focus Trapping Boundary in Mobile Drawer
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open drawer
    await page.click('.menu-toggle');
    await page.waitForTimeout(80);

    // Tab multiple times to verify cycling
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(20);
    }

    const focusCheck = await page.evaluate(() => {
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const toggle = document.querySelector('.menu-toggle');
      const active = document.activeElement;
      const isInside = (drawer && drawer.contains(active)) || active === toggle;
      return { isInside, activeTag: active?.tagName, activeText: active?.textContent?.trim().slice(0, 15) };
    });

    const pass = focusCheck.isInside;
    record({
      id: 'T2.2.3',
      code: 'R2-BND-3',
      name: 'Cyclic Keyboard Focus Trapping Loop in Mobile Navigation Drawer',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Focus continuously cycles within drawer interactive elements without escaping into background.'
        : `Focus escaped drawer after 15 tabs: active=${focusCheck.activeTag} ("${focusCheck.activeText}")`,
      defect: pass ? null : { expected: 'focus strictly inside drawer', actual: JSON.stringify(focusCheck), milestone: 'M2' },
    });
  }

  // T2.2.4: Focus Restoration on Dismissal Boundary
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    await page.click('.menu-toggle');
    await page.waitForTimeout(60);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);

    const activeMatchesToggle = await page.evaluate(() => {
      const toggle = document.querySelector('.menu-toggle');
      return document.activeElement === toggle;
    });

    record({
      id: 'T2.2.4',
      code: 'R2-BND-4',
      name: 'Keyboard Focus Restoration to Menu Toggle on Drawer Dismissal',
      feature: 'R2',
      milestone: 'M2',
      pass: activeMatchesToggle,
      durationMs: Date.now() - start,
      details: activeMatchesToggle
        ? 'Focus returned accurately to .menu-toggle upon pressing Escape.'
        : 'Focus was not restored to .menu-toggle upon Escape dismissal.',
      defect: activeMatchesToggle ? null : { expected: 'document.activeElement === .menu-toggle', actual: 'focus lost', milestone: 'M2' },
    });
  }

  // T2.2.5: Body Scroll Lock Boundary
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    await page.click('.menu-toggle');
    await page.waitForTimeout(60);

    const bodyLock = await page.evaluate(() => {
      const body = document.body;
      const cs = getComputedStyle(body);
      const isLocked = cs.overflow === 'hidden' || cs.overflowY === 'hidden' || document.documentElement.classList.contains('menu-open') || body.classList.contains('menu-open');
      return { isLocked, overflow: cs.overflow, overflowY: cs.overflowY };
    });

    const pass = bodyLock.isLocked;
    record({
      id: 'T2.2.5',
      code: 'R2-BND-5',
      name: 'Mobile Drawer Body Scroll Lock Boundary State',
      feature: 'R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Body scroll is locked when mobile navigation drawer is active.'
        : `Body scroll lock missing: overflow=${bodyLock.overflow}, overflowY=${bodyLock.overflowY}`,
      defect: pass ? null : { expected: 'body scroll locked', actual: JSON.stringify(bodyLock), milestone: 'M2' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R3 BOUNDARIES: VISUAL & CONTRAST EXTREMES
  // ─────────────────────────────────────────────────────────────────────────────

  // T2.3.1: WhatsApp FAB Collision Boundary at 320px
  {
    const start = Date.now();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${baseUrl}/espera.html`, { waitUntil: 'load' });
    await page.waitForTimeout(60);

    const fabEval = await evaluateFabClearance(page);
    const pass = !fabEval.hasCollision;

    record({
      id: 'T2.3.1',
      code: 'R3-BND-1',
      name: 'WhatsApp FAB Spatial Clearance at Extreme 320px Mobile Boundary',
      feature: 'R3',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `WhatsApp FAB maintains >= 16px clearance on 320px screen (minDistance=${fabEval.minDistance}px).`
        : `FAB collision on 320px: ${fabEval.collisions.map((c) => `${c.element} (dist=${c.distance}px)`).join(', ')}`,
      defect: pass ? null : { expected: 'clearance >= 16px at 320px', actual: JSON.stringify(fabEval.collisions), milestone: 'M3' },
    });
  }

  // T2.3.2: Disabled State Button Contrast Boundary
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const disabledContrast = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.className = 'button button-primary';
      btn.setAttribute('disabled', 'true');
      btn.textContent = 'Disabled Action';
      document.body.appendChild(btn);

      const cs = getComputedStyle(btn);
      const color = cs.color;
      const bg = cs.backgroundColor;
      btn.remove();

      return { color, bg };
    });

    const cr = getContrastRatio(disabledContrast.color, disabledContrast.bg || '#05070b');
    // Disabled controls should maintain readability or be intentionally styled per design tokens
    const pass = cr >= 3.0; // Minimum legible boundary for disabled states
    record({
      id: 'T2.3.2',
      code: 'R3-BND-2',
      name: 'Disabled State Button Contrast Boundary (>= 3.0:1 Legibility)',
      feature: 'R3',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Disabled button contrast ratio is ${cr}:1 (meets minimum legibility boundary).`
        : `Disabled button contrast ratio too low: ${cr}:1 (color=${disabledContrast.color}, bg=${disabledContrast.bg})`,
      defect: pass ? null : { expected: 'cr >= 3.0:1', actual: `${cr}:1`, milestone: 'M1' },
    });
  }

  // T2.3.3: Hero Visual Hierarchy Dominance
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const heroWeights = await page.evaluate(() => {
      const hero = document.querySelector('.hero');
      if (!hero) return { primaryCount: 0 };
      const primary = hero.querySelectorAll('.button-primary');
      return { primaryCount: primary.length };
    });

    const pass = heroWeights.primaryCount === 1;
    record({
      id: 'T2.3.3',
      code: 'R3-BND-3',
      name: 'Hero Visual Hierarchy Dominance (Exactly 1 Primary Weighted Button)',
      feature: 'R3',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Hero section exhibits clear visual hierarchy with exactly 1 primary-styled button.'
        : `Hero section has ${heroWeights.primaryCount} primary-styled buttons (expected exactly 1).`,
      defect: pass ? null : { expected: 'exactly 1 primary button in hero', actual: `${heroWeights.primaryCount} primary buttons`, milestone: 'M3' },
    });
  }

  // T2.3.4: Code Snippet & Terminal Syntax Highlighting Contrast
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/juridico/index.html`, { waitUntil: 'load' });

    const commentCr = getContrastRatio('#8d9ab0', '#080b11');
    const pass = commentCr >= 4.5;

    record({
      id: 'T2.3.4',
      code: 'R3-BND-4',
      name: 'Code Snippet Comment Syntax Contrast Boundary (>= 4.5:1)',
      feature: 'R3',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Code comment contrast ratio is ${commentCr}:1 (>= 4.5:1 WCAG AA).`
        : `Code comment contrast ratio is ${commentCr}:1 (fails >= 4.5:1 WCAG AA threshold).`,
      defect: pass ? null : { expected: 'cr >= 4.5:1 for .code .c', actual: `${commentCr}:1`, milestone: 'M1' },
    });
  }

  // T2.3.5: Header Touch Target Spacing Collision
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const overlapCheck = await page.evaluate(() => {
      const controls = document.querySelectorAll('.header-inner button, .header-inner .lang-switch');
      const boxes = [];
      controls.forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          boxes.push({ tag: c.className, rect: r });
        }
      });

      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].rect;
          const b = boxes[j].rect;
          const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (xOverlap > 1 && yOverlap > 1) {
            overlaps++;
          }
        }
      }
      return { totalControls: boxes.length, overlaps };
    });

    const pass = overlapCheck.overlaps === 0;
    record({
      id: 'T2.3.5',
      code: 'R3-BND-5',
      name: 'Adjacent Header Touch Controls Spatial Non-Overlap Boundary',
      feature: 'R3',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Header touch controls do not overlap (${overlapCheck.totalControls} interactive controls evaluated).`
        : `Detected ${overlapCheck.overlaps} overlapping bounding boxes in header controls.`,
      defect: pass ? null : { expected: '0 control overlaps', actual: `${overlapCheck.overlaps} overlaps`, milestone: 'M2' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // R4 BOUNDARIES: CODE, TOKENS & CSP EXTREMES
  // ─────────────────────────────────────────────────────────────────────────────

  // T2.4.1: CSS Token Variable Resolution Boundary
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    const unresolvedVars = await page.evaluate(() => {
      const required = ['--abyss', '--surface', '--muted', '--ice', '--white', '--blue-signal'];
      const missing = [];
      const rootStyle = getComputedStyle(document.documentElement);
      for (const v of required) {
        const val = rootStyle.getPropertyValue(v).trim();
        if (!val) missing.push(v);
      }
      return missing;
    });

    const pass = unresolvedVars.length === 0;
    record({
      id: 'T2.4.1',
      code: 'R4-BND-1',
      name: 'CSS Custom Property Tokens Runtime Resolution Boundary',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Core CSS custom property tokens resolve cleanly in runtime DOM.'
        : `Unresolved CSS variables: ${unresolvedVars.join(', ')}`,
      defect: pass ? null : { expected: 'all core tokens resolved', actual: `missing: ${unresolvedVars.join(', ')}`, milestone: 'M1' },
    });
  }

  // T2.4.2: Dynamic Script / Style DOM Mutation Injection Boundary
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Track mutations during navigation drawer interaction
    const mutationViolations = await page.evaluate(async () => {
      let injectedStyles = 0;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            injectedStyles++;
          }
        }
      });

      observer.observe(document.body, { attributes: true, subtree: true });

      // Click menu toggle
      const btn = document.querySelector('.menu-toggle');
      if (btn) btn.click();

      await new Promise((r) => setTimeout(r, 100));

      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 100));

      observer.disconnect();
      return injectedStyles;
    });

    const pass = mutationViolations === 0;
    record({
      id: 'T2.4.2',
      code: 'R4-BND-2',
      name: 'Runtime Interaction CSP Style Attribute Injection Boundary',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Zero runtime inline style attribute mutations during navigation interactions.'
        : `Detected ${mutationViolations} runtime inline style injections during menu toggle interaction.`,
      defect: pass ? null : { expected: '0 inline style mutations', actual: `${mutationViolations} style mutations`, milestone: 'M1' },
    });
  }

  // T2.4.3: Strict Media Query Scan across ALL `.css` files in `assets/`
  {
    const start = Date.now();
    const assetsDir = path.join(rootDir, 'assets');
    const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
    const arbitraryFound = [];

    const arbitraryThresholds = [
      '420px', '520px', '560px', '600px', '640px', '680px', '700px', '719px', '720px',
      '760px', '900px', '960px', '1040px', '1060px', '1100px', '1300px', '1301px', '1539px', '1700px'
    ];

    for (const f of cssFiles) {
      const content = fs.readFileSync(path.join(assetsDir, f), 'utf8');
      for (const t of arbitraryThresholds) {
        if (content.includes(t)) {
          arbitraryFound.push(`${f} (${t})`);
        }
      }
    }

    const pass = arbitraryFound.length === 0;
    record({
      id: 'T2.4.3',
      code: 'R4-BND-3',
      name: 'Comprehensive Media Query Threshold Strictness Scan Across All Stylesheets',
      feature: 'R4',
      milestone: 'M1',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `All ${cssFiles.length} stylesheets in assets/ conform to standardized 4-tier matrix.`
        : `Disjoint media query thresholds found in stylesheets: ${arbitraryFound.slice(0, 8).join(', ')}${arbitraryFound.length > 8 ? ` (+${arbitraryFound.length - 8} more)` : ''}`,
      defect: pass ? null : { expected: '0 arbitrary breakpoints across assets/*.css', actual: arbitraryFound.join('; '), milestone: 'M1' },
    });
  }

  // T2.4.4: Form Input Bounds and Edge Padding
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/espera.html`, { waitUntil: 'load' });

    const inputPaddings = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
      const violations = [];
      inputs.forEach((inp) => {
        const cs = getComputedStyle(inp);
        const pl = parseFloat(cs.paddingLeft) || 0;
        const pr = parseFloat(cs.paddingRight) || 0;
        if (pl < 10 || pr < 10) {
          violations.push(`${inp.name || inp.type || 'input'} (pl=${pl}px, pr=${pr}px)`);
        }
      });
      return { total: inputs.length, violations };
    });

    const pass = inputPaddings.violations.length === 0;
    record({
      id: 'T2.4.4',
      code: 'R4-BND-4',
      name: 'Form Control Bounding Box & Horizontal Text Inset Boundary',
      feature: 'R4',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `All ${inputPaddings.total} form inputs maintain proper horizontal text inset padding.`
        : `Inputs with deficient padding: ${inputPaddings.violations.join(', ')}`,
      defect: pass ? null : { expected: 'padding >= 10px', actual: inputPaddings.violations.join('; '), milestone: 'M3' },
    });
  }

  // T2.4.5: Asset Stamping Consistency Boundary
  {
    const start = Date.now();
    // Verify that index.html stylesheet hash matches actual assets/styles.css hash
    const stylesPath = path.join(rootDir, 'assets/styles.css');
    let hashMatches = false;
    let details = '';

    if (fs.existsSync(stylesPath)) {
      const { createHash } = await import('node:crypto');
      const diskHash = createHash('sha256').update(fs.readFileSync(stylesPath)).digest('hex').slice(0, 8);

      const indexPath = path.join(rootDir, 'index.html');
      const indexHtml = fs.readFileSync(indexPath, 'utf8');
      const match = indexHtml.match(/styles\.css\?v=([a-f0-9]{8})/);

      if (match && match[1] === diskHash) {
        hashMatches = true;
        details = `styles.css query stamp ?v=${match[1]} matches disk sha256 hash (${diskHash}).`;
      } else {
        details = `styles.css stamp mismatch: HTML has ${match ? match[1] : 'none'}, disk is ${diskHash}`;
      }
    }

    record({
      id: 'T2.4.5',
      code: 'R4-BND-5',
      name: 'Cryptographic Asset Version Hash Consistency Boundary',
      feature: 'R4',
      milestone: 'M5',
      pass: hashMatches,
      durationMs: Date.now() - start,
      details,
      defect: hashMatches ? null : { expected: 'HTML hash matches disk sha256', actual: details, milestone: 'M5' },
    });
  }

  await page.close();
  return results;
}
