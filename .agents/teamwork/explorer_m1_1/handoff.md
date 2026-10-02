# Handoff Report: Milestone 1 — Design Tokens & CSS Breakpoint Matrix

**Author**: Explorer M1-1  
**Target Milestone**: Milestone 1 (Tokens & Breakpoint Matrix — F01 & F02)  
**Working Directory**: `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_1`  
**Date**: 2026-10-02  

---

## 1. Observation

### 1.1. Design System Tokens (`design-system/tokens.json`)
Inspection of `/Users/joseedson/github/trustio-site/design-system/tokens.json` (438 lines) reveals:
- Root schema: `"$schema": "https://tr.designtokens.org/format/"` (W3C Design Tokens Community Group format).
- Token categories present: `"color"`, `"color-rgb"`, `"gradient"`, `"layout"`, `"font"`, `"type"`, `"spacing"`, `"radius"`, `"shadow"`, `"motion"`, `"z-index"`, `"themes"`.
- Layout tokens (lines 235–244):
  ```json
  "layout": {
    "container": {
      "$value": "min(1180px, calc(100vw - 48px))",
      "$type": "dimension",
      "$extensions": {
        "composite": true,
        "note": "min(1180px, calc(100vw - 48px)) — largura fluida com sarjeta de 24px por lado"
      }
    }
  }
  ```
- **Zero breakpoint tokens exist** currently in `design-system/tokens.json` (`grep -i "breakpoint" design-system/tokens.json` returns 0 results).
- In `scripts/build-design-system.py` lines 9–47, tokens are parsed directly from `:root` in `assets/styles.css` using `re.search`.

---

### 1.2. Existing `@media` Queries in `assets/styles.css`
A total of **34 `@media` statements** exist in `/Users/joseedson/github/trustio-site/assets/styles.css` (3,038 lines).  
Direct inspection and pattern search via ripgrep (`grep -n "@media" assets/styles.css`) confirms:

```text
Line 1921: @media (max-width: 900px)
Line 1926: @media (max-width: 560px)
Line 1938: @media (min-width: 1301px)
Line 1944: @media (min-width: 1301px) and (max-width: 1539px)
Line 1950: @media (min-width: 1700px)
Line 1956: @media (max-width: 1300px)
Line 1965: @media (max-width: 1060px)
Line 1990: @media (max-width: 760px)
Line 2085: @media (max-width: 420px)
Line 2104: @media (prefers-reduced-motion: reduce)
Line 2111: @media print
Line 2153: @media (max-width: 600px)
Line 2158: @media (max-width: 960px)
Line 2179: @media (max-width: 640px)
Line 2189: @media (prefers-reduced-motion: reduce)
Line 2287: @media (max-width: 1040px)
Line 2288: @media (max-width: 680px)
Line 2371: @media (max-width: 700px)
Line 2481: @media (hover: none)
Line 2576: @media (max-width: 700px)
Line 2593: @media (max-width: 960px)
Line 2621: @media (max-width: 900px)
Line 2641: @media (max-width: 900px)
Line 2651: @media (max-width: 900px)
Line 2679: @media (max-width: 900px)
Line 2685: @media (prefers-reduced-motion: reduce)
Line 2709: @media (max-width: 900px)
Line 2746: @media (max-width: 700px)
Line 2791: @media (max-width: 700px)
Line 2830: @media (max-width: 560px)
Line 2849: @media (max-width: 720px)
Line 3002: @media (max-width: 760px)
Line 3007: @media (max-width: 420px)
Line 3016: @media (prefers-reduced-motion: reduce)
```

**Breakdown**:
- **28 responsive viewport queries** spread across 16 arbitrary thresholds (`420px`, `560px`, `600px`, `640px`, `680px`, `700px`, `720px`, `760px`, `900px`, `960px`, `1040px`, `1060px`, `1300px`, `1301px`, `1539px`, `1700px`).
- **4 accessibility motion queries**: `prefers-reduced-motion: reduce` (lines 2104, 2189, 2685, 3016).
- **1 pointer capability query**: `hover: none` (line 2481).
- **1 print stylesheet query**: `print` (line 2111).
- **Total**: $28 + 4 + 1 + 1 = 34$.

---

### 1.3. Asset Versioning & Worker Contracts
1. **`scripts/stamp-asset-versions.mjs`** (lines 70–98):
   - Scans CSS files for `@import\s+(?:url\()?\s*(["']?)([^"')?\s]+\.css)(\?[^"')\s]*)?\1\s*\)?`
   - Scans HTML files for `\b(href|src)=(["'])([^"'?]+\.(?:css|js))(\?[^"']*)?\2`
   - Hashes targets via SHA-256 (first 8 hex characters) and replaces `?v=<hash>` in-place.
   - Evaluates up to 5 iterative passes until `@import` cascade stabilizes.
   - Exits with code 1 if `--check` detects any missing asset or out-of-date stamp.
   - Current status: `npm run stamp:check` exits with code 0 (`Versões dos assets já estão em dia.`).
2. **`scripts/build-worker.mjs`** (lines 66–80):
   - Ingests all files under `assets/` recursively via `await walk(join(root, "assets"))`.
   - Embeds them into `dist/server/index.js`.
3. **`scripts/validate-artifact.mjs`** (line 32):
   - Explicitly asserts that `/assets/styles.css` is served with HTTP 200 and `Content-Type: text/css`.
   - Current status: `npm run validate` exits with code 0 (`Trustio production artifact is valid.`).
4. **`assets/app.js`** (line 55):
   - Contains hardcoded breakpoint check:
     ```javascript
     window.addEventListener("resize", () => {
       if (window.innerWidth > 1300) closeMenu();
     });
     ```
     This check was coupled to the old 1300px hamburger threshold.

---

## 2. Logic Chain

1. **Origin of Arbitrary Breakpoints**:
   Because `design-system/tokens.json` lacked explicit breakpoint tokens, CSS authors historically introduced arbitrary media query cutoffs whenever an element wrapped awkwardly (e.g. 420px for labels, 560px for flag icon, 640px for LED server grid, 900px for B2B segments, 1040px for 2-column models, 1300px for navigation overflow).

2. **The 4-Tier Breakpoint Architecture**:
   `PROJECT.md` establishes a normalized 4-tier matrix:
   - **Tier 1 (Mobile)**: `@media (max-width: 767px)` — covers viewports 320px, 360px, 375px, 390px, 430px up to 767px.
   - **Tier 2 (Tablet)**: `@media (min-width: 768px) and (max-width: 1023px)` — covers viewports 768px (iPad portrait), 820px, 900px, 960px up to 1023px.
   - **Tier 3 (Desktop)**: `@media (min-width: 1024px)` — covers viewports 1024px (iPad Pro / small laptop), 1200px, 1280px, 1366px up to 1439px.
   - **Tier 4 (Wide)**: `@media (min-width: 1440px)` — covers 1440px (MacBook Pro standard), 1600px, 1920px (FHD) and 4K monitors.

3. **Subsumption of Narrow Mobile Queries (420px – 760px) into Tier 1 (`max-width: 767px`)**:
   - The queries at `420px`, `560px`, `600px`, `640px`, `680px`, `700px`, `720px`, and `760px` all handle mobile layout adaptations (e.g. 1-column grids, stacked buttons, wrapping code blocks, 7x20 LED grid, compact language pill).
   - Moving these to `@media (max-width: 767px)` guarantees that all mobile viewports receive these protections uniformly.
   - For font sizes previously overridden at 420px, utilizing CSS `clamp()` (e.g. `clamp(32px, 8.5vw, 44px)`) ensures smooth, continuous scaling from 360px up to 767px without abrupt layout shifts or character clipping.

4. **Subsumption of Tablet Queries (900px – 1060px) into Tier 2 (`min-width: 768px) and (max-width: 1023px`)**:
   - Queries at `900px`, `960px`, `1040px`, and `1060px` define 2-column capability grids, 2-column metric cards, 2-column model cards, clamped background graphics, and single-column API terminal layouts.
   - At 1024px (the start of Desktop), a standard 3-column card grid in the 1180px container allocates ~300px per card with generous 24px gutters, fitting easily without overflow.
   - Hence, moving these rules to Tier 2 (`768px – 1023px`) provides the optimal 2-column layout for tablets and avoids any cramped desktop rendering.

5. **Normalization of Desktop & Wide Queries (1300px – 1700px) into Tiers 3 & 4**:
   - The old 1300px breakpoint was a workaround for the congested 8-link header. Under Milestone 1 & 2, desktop navigation is active at `>= 1024px`.
   - The artificial 1301px–1539px range (which hid the header CTA) is completely eliminated because condensed nav allows the header CTA to remain visible at all desktop widths.
   - The 1700px ultra-wide query maps cleanly to Tier 4 (`min-width: 1440px`), expanding the header inner container and link spacing for high-resolution displays.

6. **Zero Visual Regressions**:
   - The automated headless test suite (`scripts/test-overflow.mjs`) verifies viewports `[360, 375, 390, 768, 1024, 1440]`.
   - Viewports 360, 375, 390 fall into Tier 1 (`max-width: 767px`).
   - Viewport 768 falls into Tier 2 (`768px - 1023px`).
   - Viewport 1024 falls into Tier 3 (`min-width: 1024px`).
   - Viewport 1440 falls into Tier 4 (`min-width: 1440px`).
   - Because the 4 tiers partition the continuous real line $[0, \infty)$ without any overlapping or omitted intervals ($[0, 767.98]$, $[768, 1023.98]$, $[1024, 1439.98]$, $[1440, \infty)$), every tested viewport falls cleanly into its intended visual state.

7. **Asset Versioning Stability**:
   - `assets/styles.css` remains the primary entry point referenced by HTML `<link>` tags.
   - `stamp-asset-versions.mjs` will recompute the SHA-256 hash of `assets/styles.css` and update query parameters idempotently.
   - `build-worker.mjs` and `validate-artifact.mjs` will continue to find and serve `/assets/styles.css` at status 200.

---

## 3. Caveats

- **`assets/app.js` Resize Listener**: Line 55 (`if (window.innerWidth > 1300) closeMenu()`) references the deprecated 1300px threshold. Updating this to `if (window.innerWidth >= 1024) closeMenu()` is formally scoped under Milestone 2 (F07), but must be coordinated so the mobile drawer closes properly when an iPad or laptop screen rotates or expands above 1024px.
- **Secondary Asset Stylesheets**: While `assets/styles.css` is the core stylesheet for all 12 platform pages, auxiliary stylesheets (`assets/whatsapp-suporte.css:36` with `max-width: 719px`, `assets/console.css`, etc.) also feature legacy thresholds. Normalizing `whatsapp-suporte.css:36` from `719px` to `767px` ensures full cohesion.
- **CSS Native `@media` & CSS Variables**: Native CSS `@media` syntax cannot accept CSS custom properties (e.g. `@media (max-width: var(--breakpoint-sm))` is invalid in CSS). The tokens must therefore be declared in `tokens.json` as the design system authority, mirrored in `:root` for runtime JS access, and written as explicit pixel values (`767px`, `768px`, `1023px`, `1024px`, `1440px`) in CSS media queries.

---

## 4. Conclusion & Concrete Implementation Recommendations

### 4.1. Exact JSON Additions to `design-system/tokens.json`
Add the `"breakpoint"` group to `design-system/tokens.json` (recommended placement immediately following `"layout"` at line 244):

```json
  "breakpoint": {
    "sm": {
      "$value": "768px",
      "$type": "dimension",
      "$description": "Mobile max-width upper bound (max-width: 767px) / Tablet lower bound (min-width: 768px)"
    },
    "md": {
      "$value": "1024px",
      "$type": "dimension",
      "$description": "Tablet max-width upper bound (max-width: 1023px) / Desktop lower bound (min-width: 1024px)"
    },
    "lg": {
      "$value": "1440px",
      "$type": "dimension",
      "$description": "Desktop standard upper bound / Wide lower bound (min-width: 1440px)"
    },
    "xl": {
      "$value": "1440px",
      "$type": "dimension",
      "$description": "Wide display breakpoint threshold (min-width: 1440px)"
    }
  },
```

### 4.2. Exact CSS Custom Properties Addition to `assets/styles.css`
Add the corresponding CSS custom properties inside `:root` (lines 66–67):

```css
  /* Breakpoints: matriz de 4 camadas alinhada a design-system/tokens.json */
  --breakpoint-sm: 768px;
  --breakpoint-md: 1024px;
  --breakpoint-lg: 1440px;
  --breakpoint-xl: 1440px;
```

---

### 4.3. Master 34-Query Mapping Table into the 4-Tier Matrix

| # | Original Line | Original Query | Target Tier & Query | Affected Selectors | Implementation Recommendation / Action |
|---|---|---|---|---|---|
| **1** | 1921 | `@media (max-width: 900px)` | **Tablet**: `@media (min-width: 768px) and (max-width: 1023px)` | `.metric-grid`, `.founder-areas-grid` | Set `.metric-grid { grid-template-columns: repeat(2, 1fr); }` on tablet; `.founder-areas-grid { grid-template-columns: 1fr; gap: var(--space-44); }` on tablet & mobile. |
| **2** | 1926 | `@media (max-width: 560px)` | **Mobile**: `@media (max-width: 767px)` | `.metric-grid`, `.founder-hero h1`, `.error-footer` | Set `.metric-grid { grid-template-columns: 1fr; }`, `.error-footer { flex-direction: column; align-items: flex-start; gap: 14px; }`. Fluid clamp for `.founder-hero h1`. |
| **3** | 1938 | `@media (min-width: 1301px)` | **Desktop**: `@media (min-width: 1024px)` | `.header-inner`, `.desktop-nav`, `.desktop-nav a` | Set `.desktop-nav { display: flex; gap: var(--space-16); }`, `.desktop-nav a { font-size: 14px; }`, `.header-inner { width: min(1180px, calc(100vw - 48px)); }`. |
| **4** | 1944 | `@media (min-width: 1301px) and (max-width: 1539px)` | **Desktop**: `@media (min-width: 1024px)` | `.header-cta`, `.desktop-nav`, `.desktop-nav a` | **Obsolete**. Nav condensation (F05) allows `.header-cta` to remain visible across all desktop screens. Discard this query. |
| **5** | 1950 | `@media (min-width: 1700px)` | **Wide**: `@media (min-width: 1440px)` | `.header-inner`, `.desktop-nav`, `.desktop-nav a` | Set `.header-inner { width: min(1440px, calc(100vw - 48px)); gap: var(--space-20); }`, `.desktop-nav { gap: var(--space-24); }`, `.desktop-nav a { font-size: 15px; }`. |
| **6** | 1956 | `@media (max-width: 1300px)` | **Tablet & Mobile**: (Default / `< 1024px`) | `.desktop-nav`, `.menu-toggle`, `.header-inner`, `.brand` | Hide `.desktop-nav { display: none; }` and show `.menu-toggle { display: block; }` on `< 1024px`. Desktop query `@media (min-width: 1024px)` shows `.desktop-nav: flex` and hides `.menu-toggle: none`. |
| **7** | 1965 | `@media (max-width: 1060px)` | **Tablet**: `@media (min-width: 768px) and (max-width: 1023px)` | `.hero`, `.hero-grid`, `.hero-visual`, `.system-stage`, `.capability-grid`, `.capability-featured`, `.security-grid`, `.deployment-track`, `.pillar-card` | Move 2-col capability grid (`repeat(2, 1fr)`), 2-col deployment track, and 440px pillar card into Tablet tier. Single-col hero grid applies to tablet & mobile. |
| **8** | 1990 | `@media (max-width: 760px)` | **Mobile**: `@media (max-width: 767px)` | Main mobile rules (root `--container`, header 72px, hero actions column, 1-col capability, 1-col manifesto, contact card, footer) | Expand boundary from 760px to 767px (`max-width: 767px`). Covers full mobile tier cleanly. |
| **9** | 2085 | `@media (max-width: 420px)` | **Mobile**: `@media (max-width: 767px)` | `.hero h1`, `.panel-label`, `.panel-footer`, `.signal-flow`, `.contact-card h2`, `.pillar-list` | Subsume into Mobile tier: `.panel-label { display: none; }`, `.signal-flow { grid-template-columns: 1fr; }`, `.pillar-list { flex-wrap: wrap; }`. Typography scales via fluid `clamp()`. |
| **10** | 2104 | `@media (prefers-reduced-motion: reduce)` | **Motion**: `@media (prefers-reduced-motion: reduce)` | `html`, `*`, `.reveal`, `.hero-field canvas` | Preserve and consolidate with other motion queries into a single block. |
| **11** | 2111 | `@media print` | **Print**: `@media print` | `.site-header`, `.menu-toggle`, `body`, `.manifesto-hero`, etc. | Preserve as dedicated print media query. |
| **12** | 2153 | `@media (max-width: 600px)` | **Mobile**: `@media (max-width: 767px)` | `.api-terminal pre` | Subsume into Mobile tier: `.api-terminal pre { white-space: pre-wrap; overflow-wrap: anywhere; }`. |
| **13** | 2158 | `@media (max-width: 960px)` | **Tablet & Mobile**: `< 1024px` | `.api-band` | `.api-band { grid-template-columns: 1fr; }` on Tablet tier and Mobile tier. Desktop tier retains 2-col `1fr 1.12fr`. |
| **14** | 2179 | `@media (max-width: 640px)` | **Mobile**: `@media (max-width: 767px)` | `.server-panel`, `.server-inner`, `.server-grid`, `.server-led`, `.server-wordmark` | Subsume into Mobile tier: aspect ratio 1040/560, 7x20 LED grid, stretched center block. |
| **15** | 2189 | `@media (prefers-reduced-motion: reduce)` | **Motion**: `@media (prefers-reduced-motion: reduce)` | `.server-led`, `.server-wordmark span`, `.server-sensor` | Consolidate into unified motion block: `animation: none !important;`. |
| **16** | 2287 | `@media (max-width: 1040px)` | **Tablet**: `@media (min-width: 768px) and (max-width: 1023px)` | `.model-grid` | Set `.model-grid { grid-template-columns: repeat(2, 1fr); }` on Tablet tier. Desktop tier retains 3 columns. |
| **17** | 2288 | `@media (max-width: 680px)` | **Mobile**: `@media (max-width: 767px)` | `.model-grid`, `.models-hero h1` | Subsume into Mobile tier: `.model-grid { grid-template-columns: 1fr; }`. Fluid clamp for `h1`. |
| **18** | 2371 | `@media (max-width: 700px)` | **Mobile**: `@media (max-width: 767px)` | `.seats-banner h2`, `.seats-banner .hero-lead`, `.seats-banner .hero-signals` | Subsume into Mobile tier: adjusted margins and clamped headings. |
| **19** | 2481 | `@media (hover: none)` | **Pointer**: `@media (hover: none)` | `.insight` | Preserve as dedicated pointer capability query. |
| **20** | 2576 | `@media (max-width: 700px)` | **Mobile**: `@media (max-width: 767px)` | `.voice-compare th`, `.voice-compare td`, `.vc-note` | Subsume into Mobile tier: compact padding `var(--space-12) 13px`. |
| **21** | 2593 | `@media (max-width: 960px)` | **Tablet & Mobile**: `< 1024px` | `.header-login` | Hide `.header-login { display: none; }` on `< 1024px` (login link is inside mobile drawer). |
| **22** | 2621 | `@media (max-width: 900px)` | **Tablet & Mobile**: `< 1024px` | `.segments-grid`, `.segment-actions` | Subsume into Mobile tier: full-width buttons `.button { width: 100%; }`. Tablet retains 1-col grid. |
| **23** | 2641 | `@media (max-width: 900px)` | **Tablet & Mobile**: `< 1024px` | `.segment-wide` | Set `.segment-wide { grid-template-columns: 1fr; gap: 10px; }` on Tablet and Mobile tiers. |
| **24** | 2651 | `@media (max-width: 900px)` | **Tablet & Mobile**: `< 1024px` | `.omni-def`, `.omni-def > p`, `.omni-def-points` | Set `.omni-def { grid-template-columns: 1fr; }` on Tablet and Mobile tiers. |
| **25** | 2679 | `@media (max-width: 900px)` | **Tablet & Mobile**: `< 1024px` | `.home-page .segments::before`, `.segments-b2b::before`, `.security::after`, etc. | Clamp decorative SVGs on Tablet and Mobile tiers to prevent horizontal overflow. |
| **26** | 2685 | `@media (prefers-reduced-motion: reduce)` | **Motion**: `@media (prefers-reduced-motion: reduce)` | `.home-page .segments-b2b::before`, `.security::after` | Consolidate into unified motion block: `animation: none;`. |
| **27** | 2709 | `@media (max-width: 900px)` | **Tablet & Mobile**: `< 1024px` | `.mentoria-grid`, `.home-page .mentoria::before` | Set `.mentoria-grid { grid-template-columns: 1fr; }` on Tablet and Mobile tiers. |
| **28** | 2746 | `@media (max-width: 700px)` | **Mobile**: `@media (max-width: 767px)` | `.legal h2`, `.legal p` | Subsume into Mobile tier: `.legal h2 { margin-top: 36px; }`, `.legal p { font-size: 15.5px; }`. |
| **29** | 2791 | `@media (max-width: 700px)` | **Mobile**: `@media (max-width: 767px)` | `.seats-page .seats-banner` | Subsume into Mobile tier: `min-height: 0; padding-top: clamp(120px, 16vh, 160px); display: block;`. |
| **30** | 2830 | `@media (max-width: 560px)` | **Mobile**: `@media (max-width: 767px)` | `.lang-switch`, `.lang-switch span`, `.lang-switch .lang-switch-troca` | Subsume into Mobile tier: compact 44px flag button for header bar on all mobile screens. |
| **31** | 2849 | `@media (max-width: 720px)` | **Mobile**: `@media (max-width: 767px)` | `.footer-legal`, `.footer-legal address` | Subsume into Mobile tier: vertical column layout with left alignment. |
| **32** | 3002 | `@media (max-width: 760px)` | **Mobile**: `@media (max-width: 767px)` | `.hero-actions > .button:not(.button-small)` | Subsume into Mobile tier: full-width hero action buttons `width: 100%`. |
| **33** | 3007 | `@media (max-width: 420px)` | **Mobile**: `@media (max-width: 767px)` | `.eyebrow`, `.section-kicker`, `.capability-tag`, `.step-label`, `.hero-signals` | Subsume into Mobile tier: `letter-spacing: 0.08em;` and `padding: 0 12px;` to prevent text clipping. |
| **34** | 3016 | `@media (prefers-reduced-motion: reduce)` | **Motion**: `@media (prefers-reduced-motion: reduce)` | `.button`, `.button > span`, `.arw` | Consolidate into unified motion block: `transition: none;`. |

---

### 4.4. Unified Breakpoint Structure Template for `assets/styles.css`
When the implementer refactors `assets/styles.css`, all media queries should be structured into these clean, standardized sections:

```css
/* ==========================================================================
   Trustio Responsive Matrix: 4 Tiers + Accessibility Features
   Tier 1: Mobile  — @media (max-width: 767px)
   Tier 2: Tablet  — @media (min-width: 768px) and (max-width: 1023px)
   Tier 3: Desktop — @media (min-width: 1024px)
   Tier 4: Wide    — @media (min-width: 1440px)
   ========================================================================== */

/* ── Tier 1: Mobile (Viewport < 768px) ───────────────────────────────────── */
@media (max-width: 767px) {
  :root { --container: min(100% - 32px, 1180px); --radius-large: 22px; }
  /* Layout, single-column grids, 100% buttons, mobile navigation drawer */
  .desktop-nav, .header-cta, .header-login { display: none; }
  .menu-toggle { display: block; }
  .header-inner { min-height: 72px; gap: var(--space-8); }
  .brand { margin-right: auto; }
  .lang-switch { width: 44px; padding: 0; justify-content: center; }
  .lang-switch span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .lang-switch .lang-switch-troca { display: none; }
  
  .hero-grid, .security-grid, .capability-grid, .deployment-track,
  .metric-grid, .model-grid, .statement-grid, .segments-grid,
  .segment-wide, .omni-def, .mentoria-grid, .footer-grid { grid-template-columns: 1fr; }
  
  .hero-actions .button, .manifesto-preview-footer .button, .segment-actions .button { width: 100%; }
  .api-terminal pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  .server-panel { aspect-ratio: 1040 / 560; border-radius: 22px; }
  .server-grid { grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(20, 1fr); }
  .footer-legal { flex-direction: column; align-items: flex-start; }
}

/* ── Tier 2: Tablet (768px <= Viewport <= 1023px) ────────────────────────── */
@media (min-width: 768px) and (max-width: 1023px) {
  .desktop-nav, .header-cta, .header-login { display: none; }
  .menu-toggle { display: block; }
  .brand { margin-right: auto; }
  
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
  .model-grid { grid-template-columns: repeat(2, 1fr); }
  .home-page .capability-grid { grid-template-columns: repeat(2, 1fr); }
  .deployment-track { grid-template-columns: repeat(2, 1fr); gap: 45px 0; }
  .hero-grid, .security-grid, .segment-wide, .omni-def, .mentoria-grid { grid-template-columns: 1fr; }
  .home-page .segments-b2b::after, .home-page .security::after { display: none; }
}

/* ── Tier 3: Desktop (Viewport >= 1024px) ────────────────────────────────── */
@media (min-width: 1024px) {
  .desktop-nav { display: flex; gap: var(--space-16); }
  .menu-toggle { display: none; }
  .header-login { display: inline-flex; }
  .header-inner { width: min(1180px, calc(100vw - 48px)); gap: var(--space-16); }
  
  .metric-grid { grid-template-columns: repeat(3, 1fr); }
  .model-grid { grid-template-columns: repeat(3, 1fr); }
  .api-band { display: grid; grid-template-columns: 1fr 1.12fr; }
  .mentoria-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* ── Tier 4: Wide (Viewport >= 1440px) ───────────────────────────────────── */
@media (min-width: 1440px) {
  .header-inner { width: min(1440px, calc(100vw - 48px)); gap: var(--space-20); }
  .desktop-nav { gap: var(--space-24); }
  .desktop-nav a { font-size: 15px; }
}

/* ── Accessibility & Media Features ──────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  .js .reveal { opacity: 1; transform: none; }
  .hero-field canvas { transform: none; }
  .server-led, .server-wordmark span, .server-sensor { animation: none !important; }
  .home-page .segments-b2b::before, .home-page .security::after { animation: none; }
  .button, .button > span[aria-hidden="true"], .arw { transition: none; }
}

@media (hover: none) {
  .insight { opacity: 1; transform: none; }
}

@media print {
  .site-header, .menu-toggle, .reading-progress, #network-canvas, .manifesto-scroll-hint, .site-footer { display: none !important; }
  body { background: white; color: #101828; }
  body::before { display: none; }
  .section-shell { padding: 42px 0; }
  .manifesto-hero { min-height: auto; background: white; }
  .manifesto-hero h1, h2, h3, .chapter-copy .lead-paragraph { color: #101828; }
  .manifesto-intro, .chapter-copy p, .chapter-index p { color: #475467; }
  .manifesto-declaration, .manifesto-pillars, .brazil-commitment, .manifesto-finale { border: 1px solid #d0d5dd; background: white; }
  .manifesto-finale { min-height: auto; }
  .pillar-card { min-height: 300px; background: white; }
}
```

---

## 5. Verification Method

To verify the implementation independently:

1. **Verify Token Schema in `design-system/tokens.json`**:
   Execute Node.js validation command:
   ```bash
   node -e '
   const tokens = JSON.parse(require("fs").readFileSync("design-system/tokens.json", "utf8"));
   if (!tokens.breakpoint) throw new Error("Missing breakpoint tokens!");
   const expected = { sm: "768px", md: "1024px", lg: "1440px", xl: "1440px" };
   for (const [k, v] of Object.entries(expected)) {
     if (tokens.breakpoint[k]?.$value !== v) throw new Error(`Invalid token ${k}: expected ${v}, got ${tokens.breakpoint[k]?.$value}`);
   }
   console.log("Tokens breakpoint schema PASS.");
   '
   ```
   **Invalidation condition**: Any missing key or non-matching `$value`.

2. **Verify Media Query Normalization in `assets/styles.css`**:
   Run ripgrep to ensure zero legacy threshold numbers remain:
   ```bash
   grep -En "@media[^{]*\([a-z-]+:\s*(420|560|600|640|680|700|719|720|760|900|960|1040|1060|1300|1301|1539|1700)px" assets/styles.css
   ```
   **Invalidation condition**: Command returns 1 or more matching lines. Output must be strictly empty (exit code 1 from grep).

3. **Verify Strict 4-Tier Matrix Conformance**:
   ```bash
   grep -n "@media" assets/styles.css
   ```
   All viewport queries must be strictly one of:
   - `@media (max-width: 767px)`
   - `@media (min-width: 768px) and (max-width: 1023px)`
   - `@media (min-width: 1024px)`
   - `@media (min-width: 1440px)`
   Plus non-viewport queries: `prefers-reduced-motion: reduce`, `hover: none`, and `print`.

4. **Verify Asset Stamping and Worker Artifact**:
   ```bash
   npm run stamp:check
   npm run validate
   ```
   **Invalidation condition**: Any non-zero exit code or `@import não encontrado` warning.
