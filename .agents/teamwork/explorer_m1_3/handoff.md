# Explorer M1-3 — Handoff Report: CSP Compliance & Inline Style Elimination Strategy

## 1. Observation

### 1.1. CSP Context & Production HTML Audit
- **Content-Security-Policy Directives**:
  In `scripts/build-worker.mjs` line 85 and platform headers, the CSP is configured as:
  ```http
  Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self' https://api.trustio.com.br https://mjdaluioyutnxlyomzyd.supabase.co https://cloudflareinsights.com; font-src 'self' data: https://fonts.gstatic.com https://db.onlinewebfonts.com; form-action 'self' mailto: https://formsubmit.co https://api.trustio.com.br; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; object-src 'none'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com https://db.onlinewebfonts.com; upgrade-insecure-requests
  ```
  Neither `style-src` nor `script-src` includes `'unsafe-inline'`.

- **Comprehensive Codebase Audit Across 38 Production HTML Templates**:
  Execution of automated AST/regex analysis across all 38 production HTML templates (`index.html`, `modelos.html`, `voice.html`, `agentio.html`, `planos.html`, `espera.html`, `manifesto.html`, `fundador.html`, `privacidade.html`, `seats.html`, `cadastro.html`, `entrar.html`, `obrigado.html`, `404.html`, `juridico/index.html`, `app/index.html`, `console/index.html`, `crm/index.html`, `admin/index.html`, `ia-sem-censura.html`, and their corresponding `en/` mirrors) verified:
  - **Inline `style="..."` attributes**: **0 occurrences** across all 38 files.
  - **Inline executable `<script>` blocks**: **0 occurrences** across all 38 files (the only non-external scripts are SEO metadata data blocks `<script type="application/ld+json">` in `planos.html:31` and `obrigado.html:29`, which are non-executable and permitted under CSP).
  - **`data-style="..."` workaround attributes**: **Exactly 16 occurrences across 13 lines**, strictly isolated within `ia-sem-censura.html`.

- **Runtime CSSOM Mutation Loop in `assets/ia-sem-censura.js`**:
  Lines 7-9 of `assets/ia-sem-censura.js` contain an explicit runtime bypass:
  ```javascript
  // A CSP do site (style-src 'self') bloqueia o atributo style="…": os estilos pontuais da página
  // vêm em data-style e são aplicados pelo CSSOM, que a CSP permite.
  $$("[data-style]").forEach(function (el) { el.style.cssText = el.getAttribute("data-style"); });
  ```
  Additionally, lines 294-295 perform inline style mutations on playback state changes:
  ```javascript
  $(".p-pause", play).style.display = p ? "" : "none";
  $(".p-play", play).style.display = p ? "none" : "";
  ```

- **Standalone Stylesheet Scope**:
  `ia-sem-censura.html` is an independent landing page that loads `assets/ia-sem-censura.css` and `assets/whatsapp-suporte.css` (it does **not** load `assets/styles.css`). Any new utility or component rules targeting this page must be declared in `assets/ia-sem-censura.css`.

---

### 1.2. Complete Catalog of `data-style` Occurrences in `ia-sem-censura.html`

The table below catalogs all 16 occurrences across 13 lines in `ia-sem-censura.html`:

| # | Line | Element / Context | Raw HTML Snippet | Declared Style | Purpose / Role |
|---|---|---|---|---|---|
| 1 | 36 | `svg` (Symbols definition) | `<svg width="0" height="0" data-style="position:absolute" aria-hidden="true">` | `position:absolute` | Hides SVG `<defs>` and `<symbol>` container off-flow to prevent layout disruption. |
| 2 | 115 | `svg.x` (Hero decorative icon 1) | `<svg class="x" data-style="left:8%;top:22%" viewBox="0 0 18 18" ...>` | `left:8%;top:22%` | Positions first floating "+" cross icon in the hero banner. |
| 3 | 116 | `svg.x` (Hero decorative icon 2) | `<svg class="x" data-style="right:9%;top:64%" viewBox="0 0 18 18" ...>` | `right:9%;top:64%` | Positions second floating "+" cross icon in the hero banner. |
| 4 | 139 | `svg.circuit` (Section 01 diagram) | `<svg class="circuit rv" data-style="right:0;top:40px;width:420px;height:180px" ...>` | `right:0;top:40px;width:420px;height:180px` | Coordinates and dimensions of circuit illustration at section header. |
| 5 | 166 | `span.st` (Pipeline user node) | `<div class="pn q">...<span class="st" data-style="color:var(--accent-text)">enviada</span></div>` | `color:var(--accent-text)` | Blue accent text for "enviada" badge in question pipeline card. |
| 6 | 246 | `svg.p-play` (Stepper play button) | `<svg class="p-play" viewBox="0 0 24 24" fill="currentColor" data-style="display:none">` | `display:none` | Hides play SVG when audio/animation starts in playing state. |
| 7 | 292 | `circle.ring` (Ring "Você" inner core) | `<circle class="ring" cx="220" cy="220" r="46" data-style="stroke-dasharray:none;opacity:.6"/>` | `stroke-dasharray:none;opacity:.6` | Solid line and 60% opacity for center circle ring (overriding default dashed `3 7`). |
| 8 | 303 | `span.label` (Card "O que muda") | `<span class="label" data-style="color:var(--ok)">O que muda</span>` | `color:var(--ok)` | Green brand label text for the positive changes card. |
| 9 | 312 | `span.label` (Card "O que não muda") | `<span class="label" data-style="color:var(--warn)">O que não muda</span>` | `color:var(--warn)` | Amber brand label text for the preserved constraints card. |
| 10a | 338 | `i` (Browser mock sidebar bar 1) | `<i data-style="width:80%"></i>` | `width:80%` | Bar length for faux conversation thread 1 in browser mockup. |
| 10b | 338 | `i` (Browser mock sidebar bar 2) | `<i data-style="width:65%"></i>` | `width:65%` | Bar length for faux conversation thread 2 in browser mockup. |
| 10c | 338 | `i` (Browser mock sidebar bar 3) | `<i data-style="width:88%"></i>` | `width:88%` | Bar length for faux conversation thread 3 in browser mockup. |
| 10d | 338 | `i` (Browser mock sidebar bar 4) | `<i data-style="width:55%"></i>` | `width:55%` | Bar length for faux conversation thread 4 in browser mockup. |
| 11 | 350 | `h3.h3` (Chat card title) | `<h3 class="h3" data-style="margin-top:14px">IA privada e sem censura*</h3>` | `margin-top:14px` | Spatial separation between `.tag` pill and `h3` heading. |
| 12 | 371 | `h3.h3` (Agentio card title) | `<h3 class="h3" data-style="margin-top:14px">Um agente que faz por você</h3>` | `margin-top:14px` | Spatial separation between `.tag` pill and `h3` heading. |
| 13 | 509 | `p.kicker` (Final CTA kicker) | `<p class="kicker" data-style="justify-content:center">O próximo passo</p>` | `justify-content:center` | Centered flex alignment for kicker inside `.final` card. |

---

## 2. Logic Chain

1. **Origins of the `data-style` Bypass**:
   Under strict CSP `style-src 'self'`, the browser blocks `style="..."` attributes on DOM elements. Because the platform author aimed to pass static linter checks while rapidly prototyping `ia-sem-censura.html`, they introduced `data-style="..."` as a container attribute and executed `$$("[data-style]").forEach(...)` in `assets/ia-sem-censura.js:9` to parse and apply styles via CSSOM (`el.style.cssText`).

2. **Negative Architectural & UX Consequences**:
   - **Flash of Unstyled Content (FOUC)**: Layout attributes (`width: 420px`, `position: absolute`, `display: none`, `width: 80%`) do not apply until JavaScript executes, creating visual jumping during page load.
   - **No-JS Fragility**: If client-side JavaScript fails, is disabled, or is delayed on cellular networks, the browser mockup sidebar lines render at default width, both play and pause icons show simultaneously, and SVG definitions occupy flow space.
   - **Violation of CSP Intent**: While CSSOM manipulation avoids an explicit CSP header block, circumventing declarative styling via runtime DOM property injection breaks the principle of static style separation and auditable CSP compliance.

3. **CSS Layering Strategy (Component CSS vs Utility Classes)**:
   - For items with unique semantic roles (`.circuit`, `.hero .x`, `.pn.q .st`, `.rings [data-ring="voce"] .ring`, `.b-side i:nth-child(...)`, `.duo .card .txt .h3`, `.final .kicker`), writing direct component CSS rules in `assets/ia-sem-censura.css` eliminates the need to pollute the HTML with artificial classes.
   - For generic visual modifiers (`.text-ok`, `.text-warn`, `.text-accent`, `.d-none`, `.justify-center`), defining standard, reusable utility classes creates a maintainable design system pattern that can also be adopted in `assets/styles.css`.
   - For the interactive play/pause toggle (line 246), replacing `display: none` and JS `style.display` mutation with a declarative class state (`#st-play.paused`) eliminates all runtime CSSOM manipulation.

4. **Safety & Zero-Regression Verification**:
   Auditing the other 37 platform HTML files confirmed they already have 0 inline styles and 0 inline scripts. Therefore, refactoring `ia-sem-censura.html` and removing `assets/ia-sem-censura.js:8-9` achieves 100% CSP compliance platform-wide.

---

## 3. Caveats

1. **Transactional Email Templates (`supabase/templates/`)**:
   `supabase/templates/*.html` contain inline styles (`style="..."`). This is standard and required for HTML email clients (Gmail, Outlook, Apple Mail), which do not execute under web browser CSP headers. These templates are exempt from web CSP requirements.
2. **Design System Internal Documentation (`design-system/fundamentos/`)**:
   Files in `design-system/fundamentos/*.html` contain inline styles showing dynamic swatches and spacing widths (e.g. `<i style="width: 12px"></i>`). These are development visualizers not included in the public routing bundle or Cloudflare Worker static assets.
3. **Dynamic CSSOM Canvas/Progress in `assets/ia-sem-censura.js`**:
   Line 40 (`bar.style.transform = ...`) and line 314 (randomized `#dust` particle coordinates) mutate inline CSSOM properties dynamically during runtime animation. CSP `style-src 'self'` does not restrict programmatic CSSOM manipulation (`element.style.transform`), only static inline markup (`<style>` / `style="..."`). These animations remain valid and functional.

---

## 4. Conclusion & Implementation Recommendations

We provide two concrete, drop-in implementation proposals. **Recommendation: Approach A (Semantic Component CSS + Standard Utilities)** offers the cleanest markup and zero FOUC.

### 4.1. Implementation Proposals for `assets/ia-sem-censura.css`

#### Approach A: Semantic Component CSS + Standard Utilities (Recommended)
Add the following rules to `/Users/joseedson/github/trustio-site/assets/ia-sem-censura.css`:

```css
/* ==========================================================================
   CSP Compliance Rules (replacing runtime data-style in ia-sem-censura.html)
   ========================================================================== */

/* 1. SVG Definitions container (line 36) */
.svg-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 2 & 3. Hero floating decorative crosses (lines 115, 116) */
.hero .x:first-of-type { left: 8%; top: 22%; }
.hero .x:last-of-type  { right: 9%; top: 64%; }

/* 4. Section 01 circuit diagram position & bounds (line 139) */
.sec .circuit {
  right: 0;
  top: 40px;
  width: 420px;
  height: 180px;
}

/* 5. Question node status label (line 166) - group with existing .pn.model .st */
.pn.q .st {
  color: var(--accent-text);
}

/* 6. Stepper play/pause state toggle (line 246 & ia-sem-censura.js) */
#st-play .p-play { display: none; }
#st-play.is-paused .p-play { display: block; }
#st-play.is-paused .p-pause { display: none; }

/* 7. Rings diagram inner core ring (line 292) */
.rings [data-ring="voce"] .ring {
  stroke-dasharray: none;
  opacity: .6;
}

/* 8 & 9. Standard Color Utilities (lines 303, 312) */
.text-ok   { color: var(--ok) !important; }
.text-warn { color: var(--warn) !important; }
.text-accent { color: var(--accent-text) !important; }

/* 10. Browser mock sidebar conversation bars (line 338) */
.b-side i:nth-child(2) { width: 80%; }
.b-side i:nth-child(3) { width: 65%; }
.b-side i:nth-child(4) { width: 88%; }
.b-side i:nth-child(5) { width: 55%; }

/* 11 & 12. Duo card heading top margin (lines 350, 371) */
.duo .card .txt .h3 {
  margin-top: 14px;
}

/* 13. Final CTA kicker alignment (line 509) */
.final .kicker {
  justify-content: center;
}
```

---

#### Approach B: Pure Utility Class Alternative
If strict utility classing is preferred for all 13 lines, define the following utility block in `assets/ia-sem-censura.css` (and optionally `assets/styles.css`):

```css
/* Utility classes for data-style replacement */
.u-pos-abs      { position: absolute; }
.u-hero-x1      { left: 8%; top: 22%; }
.u-hero-x2      { right: 9%; top: 64%; }
.u-circuit-top  { right: 0; top: 40px; width: 420px; height: 180px; }
.text-accent    { color: var(--accent-text) !important; }
.u-d-none       { display: none !important; }
.u-ring-solid   { stroke-dasharray: none; opacity: .6; }
.text-ok        { color: var(--ok) !important; }
.text-warn      { color: var(--warn) !important; }
.w-80           { width: 80%; }
.w-65           { width: 65%; }
.w-88           { width: 88%; }
.w-55           { width: 55%; }
.mt-14          { margin-top: 14px !important; }
.justify-center { justify-content: center !important; }
```

---

### 4.2. Exact HTML Modifications for `ia-sem-censura.html`

With Approach A, the HTML changes in `/Users/joseedson/github/trustio-site/ia-sem-censura.html` are minimal and elegant:

```diff
--- a/ia-sem-censura.html
+++ b/ia-sem-censura.html
@@ -36,1 +36,1 @@
- <svg width="0" height="0" data-style="position:absolute" aria-hidden="true">
+ <svg class="svg-defs" width="0" height="0" aria-hidden="true">

@@ -115,2 +115,2 @@
-   <svg class="x" data-style="left:8%;top:22%" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="currentColor"/></svg>
-   <svg class="x" data-style="right:9%;top:64%" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="currentColor"/></svg>
+   <svg class="x" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="currentColor"/></svg>
+   <svg class="x" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="currentColor"/></svg>

@@ -139,1 +139,1 @@
-   <svg class="circuit rv" data-style="right:0;top:40px;width:420px;height:180px" viewBox="0 0 420 180" aria-hidden="true">
+   <svg class="circuit rv" viewBox="0 0 420 180" aria-hidden="true">

@@ -166,1 +166,1 @@
-           <div class="pn q"><div><b>Sua pergunta</b><small>“Qual dose de paracetamol já é risco?”</small></div><span class="st" data-style="color:var(--accent-text)">enviada</span></div>
+           <div class="pn q"><div><b>Sua pergunta</b><small>“Qual dose de paracetamol já é risco?”</small></div><span class="st">enviada</span></div>

@@ -246,1 +246,1 @@
-           <button class="round" id="st-play" type="button" aria-label="Pausar"><svg class="p-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg><svg class="p-play" viewBox="0 0 24 24" fill="currentColor" data-style="display:none"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg></button>
+           <button class="round" id="st-play" type="button" aria-label="Pausar"><svg class="p-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg><svg class="p-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg></button>

@@ -292,1 +292,1 @@
-         <g data-ring="voce"><circle class="core" cx="220" cy="220" r="46"/><circle class="ring" cx="220" cy="220" r="46" data-style="stroke-dasharray:none;opacity:.6"/><text class="core-t" x="220" y="216" text-anchor="middle">Sua</text><text class="core-t" x="220" y="232" text-anchor="middle">pergunta</text></g>
+         <g data-ring="voce"><circle class="core" cx="220" cy="220" r="46"/><circle class="ring" cx="220" cy="220" r="46"/><text class="core-t" x="220" y="216" text-anchor="middle">Sua</text><text class="core-t" x="220" y="232" text-anchor="middle">pergunta</text></g>

@@ -303,1 +303,1 @@
-         <span class="label" data-style="color:var(--ok)">O que muda</span>
+         <span class="label text-ok">O que muda</span>

@@ -312,1 +312,1 @@
-         <span class="label" data-style="color:var(--warn)">O que não muda</span>
+         <span class="label text-warn">O que não muda</span>

@@ -338,1 +338,1 @@
-               <div class="b-side"><i class="on"></i><i data-style="width:80%"></i><i data-style="width:65%"></i><i data-style="width:88%"></i><i data-style="width:55%"></i></div>
+               <div class="b-side"><i class="on"></i><i></i><i></i><i></i><i></i></div>

@@ -350,1 +350,1 @@
-           <h3 class="h3" data-style="margin-top:14px">IA privada e sem censura*</h3>
+           <h3 class="h3">IA privada e sem censura*</h3>

@@ -371,1 +371,1 @@
-           <h3 class="h3" data-style="margin-top:14px">Um agente que faz por você</h3>
+           <h3 class="h3">Um agente que faz por você</h3>

@@ -509,1 +509,1 @@
-       <p class="kicker" data-style="justify-content:center">O próximo passo</p>
+       <p class="kicker">O próximo passo</p>
```

---

### 4.3. Exact Modifications for `assets/ia-sem-censura.js`

1. **Delete lines 7-9** in `/Users/joseedson/github/trustio-site/assets/ia-sem-censura.js`:
```diff
--- a/assets/ia-sem-censura.js
+++ b/assets/ia-sem-censura.js
@@ -7,3 +7,0 @@
-  // A CSP do site (style-src 'self') bloqueia o atributo style="…": os estilos pontuais da página
-  // vêm em data-style e são aplicados pelo CSSOM, que a CSP permite.
-  $$("[data-style]").forEach(function (el) { el.style.cssText = el.getAttribute("data-style"); });
```

2. **Refactor lines 294-295** to toggle `.is-paused` class on `#st-play` instead of direct `.style.display` assignment:
```diff
--- a/assets/ia-sem-censura.js
+++ b/assets/ia-sem-censura.js
@@ -293,4 +290,2 @@
     function setPlay(p) {
       playing = p;
       play.setAttribute("aria-label", p ? "Pausar" : "Reproduzir");
-      $(".p-pause", play).style.display = p ? "" : "none";
-      $(".p-play", play).style.display = p ? "none" : "";
+      play.classList.toggle("is-paused", !p);
     }
```

---

## 5. Verification Method

### 5.1. Automated Verification Script
Implementers can execute this automated check directly via Node.js to independently verify zero inline styles, zero `data-style` bypasses, and zero unapproved inline scripts across all 38 production pages:

```bash
node -e '
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXCLUDE = new Set(["node_modules", ".git", ".gemini", ".agents", "audit", "supabase", "design-system"]);

function getFiles(dir) {
  let res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !EXCLUDE.has(e.name)) res.push(...getFiles(full));
    else if (e.isFile() && e.name.endsWith(".html")) res.push(path.relative(ROOT, full));
  }
  return res;
}

const files = getFiles(ROOT);
let violations = [];

for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
  lines.forEach((l, idx) => {
    const num = idx + 1;
    if (/(?<![\w-])style\s*=\s*["\x27]/i.test(l)) violations.push({ type: "INLINE_STYLE", file: f, line: num, text: l.trim() });
    if (/data-style\s*=\s*["\x27]/i.test(l)) violations.push({ type: "DATA_STYLE_WORKAROUND", file: f, line: num, text: l.trim() });
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(l) && !/type\s*=\s*["\x27]application\/ld\+json["\x27]/i.test(l)) {
      violations.push({ type: "INLINE_SCRIPT", file: f, line: num, text: l.trim() });
    }
  });
}

// Check JS file for mutation loop
const jsContent = fs.readFileSync("assets/ia-sem-censura.js", "utf8");
if (/data-style/.test(jsContent)) {
  violations.push({ type: "JS_CSSOM_MUTATION_LOOP", file: "assets/ia-sem-censura.js", line: 0, text: "Reference to data-style found in JS" });
}

if (violations.length === 0) {
  console.log(`PASS: All ${files.length} production HTML templates and JS assets are 100% CSP compliant!`);
  process.exit(0);
} else {
  console.error(`FAIL: Found ${violations.length} CSP violations:`);
  violations.forEach(v => console.error(` [${v.type}] ${v.file}:${v.line} -> ${v.text}`));
  process.exit(1);
}
'
```

### 5.2. Asset Stamping & Production Validation
After modifying `ia-sem-censura.html`, `assets/ia-sem-censura.css`, and `assets/ia-sem-censura.js`:
```bash
# 1. Update asset content hashes in HTML tags
npm run stamp

# 2. Verify stamps are fresh and consistent
npm run stamp:check

# 3. Validate worker bundle and CSP headers
npm run validate
```

### 5.3. Invalidation Conditions
The refactoring is considered invalid if any of the following occur:
1. `data-style="..."` is found anywhere in `ia-sem-censura.html` or any other `.html` file.
2. Any `style="..."` attribute is introduced into any production HTML file.
3. Any `<script>` tag without an `src` attribute (other than `type="application/ld+json"`) exists in any production HTML file.
4. `assets/ia-sem-censura.js` retains the `$$("[data-style]").forEach(...)` CSSOM mutation loop.
5. `npm run stamp:check` or `npm run validate` exits with non-zero status.
