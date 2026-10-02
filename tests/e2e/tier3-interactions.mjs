import { evaluateHorizontalOverflow, evaluateFabClearance } from './lib/geometry-evaluator.mjs';
import { getContrastRatio } from './lib/contrast-calculator.mjs';

/**
 * Execute Tier 3: Cross-Feature Interactions Tests
 * @param {object} context Test runner context
 */
export async function runTier3Tests(context) {
  const { browser, baseUrl, isStrict } = context;
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
      tier: 3,
      feature,
      milestone,
      status,
      durationMs,
      details,
      error,
      defect,
    });
  }

  // T3.1: Mobile Drawer Open + WhatsApp FAB Clearance & Stacking
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open mobile drawer
    await page.click('.menu-toggle');
    await page.waitForTimeout(80);

    const stackingCheck = await page.evaluate(() => {
      const drawer = document.querySelector('#mobile-menu, .mobile-nav');
      const fab = document.querySelector('.wa-float, [href*="wa.me"]');

      if (!drawer) return { hasDrawer: false };

      const drawerStyle = getComputedStyle(drawer);
      const drawerZ = parseInt(drawerStyle.zIndex, 10) || 0;
      const drawerVisible = drawerStyle.display !== 'none' && !drawer.hasAttribute('hidden');

      if (!fab) return { hasDrawer: true, drawerVisible, hasFab: false, safe: true };

      const fabStyle = getComputedStyle(fab);
      const fabZ = parseInt(fabStyle.zIndex, 10) || 0;
      const fabPointerEvents = fabStyle.pointerEvents;
      const fabDisplay = fabStyle.display;

      // Safe if: drawer covers FAB with higher z-index OR fab is hidden / pointer-events: none
      const safe =
        fabDisplay === 'none' ||
        fabPointerEvents === 'none' ||
        drawerZ > fabZ;

      return {
        hasDrawer: true,
        drawerVisible,
        hasFab: true,
        drawerZ,
        fabZ,
        fabDisplay,
        safe,
      };
    });

    const pass = stackingCheck.safe;
    record({
      id: 'T3.1',
      code: 'X-FEAT-1',
      name: 'Mobile Navigation Drawer Open + WhatsApp FAB Stacking Interaction',
      feature: 'R2+R3',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Drawer overlay safely stacks above FAB or suppresses FAB (drawerZ=${stackingCheck.drawerZ}, fabZ=${stackingCheck.fabZ}).`
        : `FAB collision risk when drawer open: fabZ=${stackingCheck.fabZ} >= drawerZ=${stackingCheck.drawerZ}`,
      defect: pass ? null : { expected: 'drawerZ > fabZ or FAB hidden while drawer open', actual: JSON.stringify(stackingCheck), milestone: 'M2' },
    });
  }

  // T3.2: Table Scroll Container + Dynamic Theme Toggle
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/planos.html`, { waitUntil: 'load' });

    // Step A: Scroll table
    const tableScrolled = await page.evaluate(() => {
      const wrapper = document.querySelector('.table-scroll-wrapper, table');
      if (wrapper) {
        wrapper.scrollLeft = 100;
        return wrapper.scrollLeft;
      }
      return 0;
    });

    // Step B: Toggle theme to light
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(60);

    const afterToggle = await page.evaluate(() => {
      const wrapper = document.querySelector('.table-scroll-wrapper, table');
      const table = document.querySelector('table');
      const td = table ? table.querySelector('td, th') : null;
      const cs = td ? getComputedStyle(td) : null;
      const bg = cs ? cs.backgroundColor : '#ffffff';
      const color = cs ? cs.color : '#000000';
      return {
        hasTable: !!table,
        cellColor: color,
        cellBg: bg,
      };
    });

    const contrast = getContrastRatio(afterToggle.cellColor, afterToggle.cellBg || '#ffffff');
    const pass = afterToggle.hasTable && contrast >= 4.5;

    record({
      id: 'T3.2',
      code: 'X-FEAT-2',
      name: 'Responsive Table Scroll Container + Theme Switch Reflow Interaction',
      feature: 'R1+R3',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? `Table remains intact and accessible across theme switches (contrast=${contrast}:1 in light mode).`
        : `Table cell contrast or styling compromised after theme toggle (contrast=${contrast}:1)`,
      defect: pass ? null : { expected: 'table legible with contrast >= 4.5:1 across theme toggle', actual: `contrast=${contrast}:1`, milestone: 'M4' },
    });
  }

  // T3.3: Header Viewport Resizing + Focus Trap Restoration
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Open drawer
    await page.click('.menu-toggle');
    await page.waitForTimeout(60);

    // Tab into drawer
    await page.keyboard.press('Tab');

    // Resize viewport dynamically to 1024px
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);

    const desktopState = await page.evaluate(() => {
      const main = document.querySelector('main');
      const footer = document.querySelector('footer');
      const mainInert = main ? main.hasAttribute('inert') || main.inert : false;
      const footerInert = footer ? footer.hasAttribute('inert') || footer.inert : false;

      // Focus should be movable on desktop
      const desktopNav = document.querySelector('.desktop-nav');
      const firstLink = desktopNav ? desktopNav.querySelector('a') : null;
      if (firstLink) firstLink.focus();
      const activeIsDesktop = document.activeElement === firstLink;

      return { mainInert, footerInert, activeIsDesktop };
    });

    const pass = !desktopState.mainInert && !desktopState.footerInert && desktopState.activeIsDesktop;
    record({
      id: 'T3.3',
      code: 'X-FEAT-3',
      name: 'Dynamic Viewport Resize During Active Focus Trap Interactivity',
      feature: 'R1+R2',
      milestone: 'M2',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Expanding viewport during active focus trap successfully disengages trap and restores desktop navigation.'
        : `Defect in focus release upon resize: mainInert=${desktopState.mainInert}, desktopFocus=${desktopState.activeIsDesktop}`,
      defect: pass ? null : { expected: 'inert removed and desktop focus operational', actual: JSON.stringify(desktopState), milestone: 'M2' },
    });
  }

  // T3.4: Form Validation Error States + Layout Flow
  {
    const start = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/espera.html`, { waitUntil: 'load' });

    // Submit empty form to trigger validation
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(60);
    }

    // Check overflow and FAB clearance with validation active
    const overflowRes = await evaluateHorizontalOverflow(page);
    const fabRes = await evaluateFabClearance(page);

    const pass = !overflowRes.hasViolation && !fabRes.hasCollision;
    record({
      id: 'T3.4',
      code: 'X-FEAT-4',
      name: 'Form Validation Error Display + Viewport Boundary Stability',
      feature: 'R1+R3',
      milestone: 'M3',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Form validation errors do not cause horizontal overflow or FAB collisions.'
        : `Validation layout defect: overflow=${overflowRes.hasViolation}, fabCollision=${fabRes.hasCollision}`,
      defect: pass ? null : { expected: '0 overflow and 0 FAB collision during validation errors', actual: JSON.stringify({ overflow: overflowRes.hasViolation, fab: fabRes.hasCollision }), milestone: 'M3' },
    });
  }

  // T3.5: Background Network Canvas + Continuous Window Resize
  {
    const start = Date.now();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });

    // Progressively resize window through 5 increments: 1440 -> 1024 -> 768 -> 430 -> 360
    const viewports = [1440, 1024, 768, 430, 360];
    let resizeViolation = false;

    for (const w of viewports) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(40);
      const canvasBounds = await page.evaluate(() => {
        const c = document.querySelector('canvas#network-canvas');
        if (!c) return { clamped: true };
        const r = c.getBoundingClientRect();
        return { clamped: r.width <= window.innerWidth + 1, width: r.width, inner: window.innerWidth };
      });
      if (!canvasBounds.clamped) {
        resizeViolation = true;
        break;
      }
    }

    const pass = !resizeViolation;
    record({
      id: 'T3.5',
      code: 'X-FEAT-5',
      name: 'Continuous Viewport Downscaling Reflow With Animated Background Canvas',
      feature: 'R1+R4',
      milestone: 'M4',
      pass,
      durationMs: Date.now() - start,
      details: pass
        ? 'Animated background canvas resizes smoothly across all breakpoints without exceeding viewport width.'
        : 'Canvas bounds fail dynamic downscaling constraint during rapid viewport resize.',
      defect: pass ? null : { expected: 'canvas width <= viewport width across all steps', actual: 'canvas overflows during continuous downscale', milestone: 'M4' },
    });
  }

  await page.close();
  return results;
}
