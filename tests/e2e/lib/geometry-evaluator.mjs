/**
 * Headless Geometry & DOM Spatial Evaluator
 * Injected into Playwright page evaluation context.
 */

/**
 * Audit horizontal overflow on current page at current viewport.
 */
export async function evaluateHorizontalOverflow(page) {
  return await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const innerWidth = window.innerWidth;
    const rootScrollWidth = de.scrollWidth;
    const rootOver = Math.max(0, rootScrollWidth - innerWidth);

    const bodyStyle = getComputedStyle(body);
    const isMasked = bodyStyle.overflowX === 'hidden' || de.style.overflowX === 'hidden';

    let maxOffenderDelta = 0;
    const offenders = [];

    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (cs.position === 'fixed') continue;

      // Check if right edge exceeds innerWidth + 1px tolerance
      if (r.right > innerWidth + 1) {
        const delta = Math.round(r.right - innerWidth);
        if (delta > maxOffenderDelta) maxOffenderDelta = delta;

        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';

        offenders.push({
          selector: `${tag}${id}${cls}`,
          delta,
          width: Math.round(r.width),
          right: Math.round(r.right),
        });
      }
    }

    return {
      innerWidth,
      rootScrollWidth,
      rootOver,
      isMasked,
      maxOffenderDelta,
      offenders: offenders.slice(0, 6),
      hasViolation: rootOver > 0 || (isMasked && maxOffenderDelta > 0),
    };
  });
}

/**
 * Check spatial clearance of WhatsApp FAB from interactive inputs, submit buttons, and cards.
 * Minimum required clearance is 16px.
 */
export async function evaluateFabClearance(page) {
  return await page.evaluate(() => {
    const fab = document.querySelector('.wa-float, [aria-label*="WhatsApp" i], [href*="wa.me"]');
    if (!fab) {
      return { found: false, minDistance: Infinity, collisions: [] };
    }

    const fabRect = fab.getBoundingClientRect();
    if (fabRect.width === 0 || fabRect.height === 0) {
      return { found: true, visible: false, minDistance: Infinity, collisions: [] };
    }

    const collisions = [];
    let minDistance = Infinity;

    // Scan interactive target elements: inputs, selects, textareas, submit buttons, cards
    const targets = document.querySelectorAll(
      'input, select, textarea, button[type="submit"], .button-primary, .pricing-card, .plan-card, .contact-card'
    );

    for (const target of targets) {
      if (target === fab || fab.contains(target)) continue;

      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(target);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      // Axis-aligned bounding box distance
      const dx = Math.max(0, Math.max(fabRect.left - r.right, r.left - fabRect.right));
      const dy = Math.max(0, Math.max(fabRect.top - r.bottom, r.top - fabRect.bottom));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDistance) minDistance = dist;

      // Minimum clearance is 16px
      if (dist < 16) {
        const tag = target.tagName.toLowerCase();
        const id = target.id ? `#${target.id}` : '';
        const cls = target.className && typeof target.className === 'string'
          ? '.' + target.className.trim().split(/\s+/)[0]
          : '';
        collisions.push({
          element: `${tag}${id}${cls}`,
          distance: Math.round(dist * 10) / 10,
          targetRect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }
        });
      }
    }

    return {
      found: true,
      visible: true,
      fabRect: { top: Math.round(fabRect.top), left: Math.round(fabRect.left), width: Math.round(fabRect.width), height: Math.round(fabRect.height) },
      minDistance: Math.round(minDistance * 10) / 10,
      collisions,
      hasCollision: collisions.length > 0,
    };
  });
}

/**
 * Check touch target minimum size (>= 48px).
 */
export async function evaluateTouchTargets(page, selectorList) {
  return await page.evaluate((selectors) => {
    const results = [];
    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;

        const w = Math.round(r.width * 10) / 10;
        const h = Math.round(r.height * 10) / 10;
        const satisfies = w >= 47.5 && h >= 47.5; // 0.5px subpixel tolerance

        results.push({
          selector: sel,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 20),
          width: w,
          height: h,
          satisfies,
        });
      }
    }
    return results;
  }, selectorList);
}
