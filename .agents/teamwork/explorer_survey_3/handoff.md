# Handoff Report: Test Infrastructure, Tooling, Headless Verification & Horizontal Overflow

**Document:** `handoff.md`  
**Agent:** `explorer_survey_3`  
**Milestone:** Survey & Architecture Exploration  
**Working Directory:** `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_3`  
**Date:** 2026-10-02  

---

## 1. Observation

### 1.1 `package.json` Scripts & Dependencies
- **File:** `/Users/joseedson/github/trustio-site/package.json` (lines 6–19, 23–25):
  ```json
  "scripts": {
    "build": "node scripts/build-worker.mjs",
    "build:static": "vite build",
    "validate": "node scripts/validate-artifact.mjs",
    "stamp": "node scripts/stamp-asset-versions.mjs",
    "stamp:check": "node scripts/stamp-asset-versions.mjs --check",
    "sitemap": "node scripts/sitemap.mjs",
    "sitemap:check": "node scripts/sitemap.mjs --check",
    "indexnow": "node scripts/indexnow.mjs --all",
    "i18n": "node scripts/i18n.mjs",
    "i18n:check": "node scripts/i18n.mjs --check",
    "test:worker": "node worker/test/worker.test.mjs",
    "test:mac": "node mac/test/hermes-autorizados.test.mjs && node mac/test/whatsapp.test.mjs"
  },
  "engines": {
    "node": ">=22.13"
  },
  "devDependencies": {
    "vite": "7.0.6"
  }
  ```
- **Verbatim Error on `npm test`:**
  Command: `npm test`
  Output:
  ```
  npm error Missing script: "test"
  npm error 
  npm error To see a list of scripts, run:
  npm error   npm run
  ```
  Exited with code 1.
- **Dependency Inventory:**
  - Production `dependencies`: None (`undefined`).
  - `devDependencies`: `"vite": "7.0.6"` only.
  - Lint / formatting scripts: None present (no ESLint, Prettier, or Stylelint configured).
  - Directory state: `/Users/joseedson/github/trustio-site/node_modules` does not exist on disk (`ls: node_modules: No such file or directory`).

### 1.2 Existing Test Implementations
1. **Cloudflare Worker Unit Tests (`worker/test/worker.test.mjs`)**:
   - Zero external npm dependencies. Uses native Node.js ESM and `node:sqlite` (`DatabaseSync`) to simulate Cloudflare D1 in-memory, mock `fetch` for Resend and Supabase RPC, and an inline `ok()` assertion runner.
   - Command: `node worker/test/worker.test.mjs`
   - Result: Exited with code 0 (`todos os casos passaram`).
2. **Mac Gateway & WhatsApp Tests (`mac/test/hermes-autorizados.test.mjs`, `mac/test/whatsapp.test.mjs`)**:
   - Zero external npm dependencies. Uses native Node.js `node:http`, `node:child_process`, and mock Baileys HTTP server.
   - Command: `npm run test:mac`
   - Result: Exited with code 0 (`todos os casos passaram`).
3. **Artifact Validator (`scripts/validate-artifact.mjs`)**:
   - Zero external npm dependencies. Validates production bundle `dist/server/index.js`, hosting manifest `dist/.openai/hosting.json`, 32 routes/aliases, and strict CSP headers.
   - Command: `npm run validate`
   - Result: Exited with code 0 (`Trustio production artifact is valid.`).
4. **Audit E2E Verification Suite (`audit/tests/run_e2e_tests.js`)**:
   - Opaque-box auditor suite parsing markdown AST and validating binary PNG chunks. Documented in `audit/TEST_INFRA.md`.
5. **Headless Browser & Tooling Availability**:
   - System Chrome: Google Chrome 154.0.8037.93 is installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
   - Playwright / `playwright-core`: Installed and cached at `/Users/joseedson/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core` (Version 1.63.0).
   - JSDOM: Not installed. Furthermore, JSDOM does not implement a layout or rendering engine (`scrollWidth`, `clientWidth`, and `getBoundingClientRect()` return 0; `@media` queries and CSS wrapping are uncomputed), making JSDOM incapable of layout overflow detection.

### 1.3 `npm run stamp` Deep-Dive
- **File:** `/Users/joseedson/github/trustio-site/scripts/stamp-asset-versions.mjs` (123 lines).
- **Mechanism:**
  - Traverses the project filesystem (ignoring `node_modules`, `dist`, `.git`, `.vercel`, `upload`, `validation`).
  - Identifies CSS `@import` (`CSS_IMPORT_RE = /@import\s+(?:url\()?\s*(["']?)([^"')?\s]+\.css)(\?[^"')\s]*)?\1\s*\)?/gi`) and HTML asset references (`HTML_REF_RE = /\b(href|src)=(["'])([^"'?]+\.(?:css|js))(\?[^"']*)?\2/gi`).
  - Computes 8-character hex SHA-256 hash of the target asset on disk: `createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 8)`.
  - Replaces reference with `url?v=<hash>`.
  - CSS `@import` operates iteratively (up to 5 passes) until transitive hash changes stabilize.
- **Criteria for Passing:**
  - Running `node scripts/stamp-asset-versions.mjs --check` (or `npm run stamp:check`):
    - If all referenced asset hashes match their target file contents, prints `Versões dos assets já estão em dia.` and exits with code 0.
    - If any reference hash is missing or out of date, prints `Versões desatualizadas em X arquivo(s) — rode npm run stamp:` with file list, and exits with code 1.
  - Verification run:
    Command: `node scripts/stamp-asset-versions.mjs --check`
    Result: Exited code 0 (`Versões dos assets já estão em dia.`).

### 1.4 Horizontal Overflow Detection & Root-Cause Analysis
- **Masked Viewport Overflow Observation**:
  - `assets/styles.css` line 261 explicitly sets:
    ```css
    body {
      min-width: 320px;
      margin: 0;
      overflow-x: hidden;
      ...
    }
    ```
  - When `body { overflow-x: hidden; }` is active in modern Chromium, `window.scrollX` is pinned to 0 and `document.documentElement.scrollWidth` equals `window.innerWidth`. The horizontal scrollbar is hidden, but overflowing child elements are clipped off-screen on mobile devices and touch browsers.
- **Empirical Execution of 72 Assertions (12 Pages × 6 Viewports)**:
  - We engineered and executed `.agents/teamwork/explorer_survey_3/test-overflow.mjs`, which starts an ephemeral zero-dependency Node HTTP static server on `127.0.0.1:0`, drives headless Google Chrome via `playwright-core`, and inspects both `rootOver` and element right-edge boundaries (`getBoundingClientRect().right > window.innerWidth + 1`).
  - Results across 72 tests: **27 violations detected across 5 pages; 7 pages passed cleanly**.
  - **Passing Pages (0 violations across 360px, 375px, 390px, 768px, 1024px, 1440px)**:
    1. `/voice.html` (PASS)
    2. `/seats.html` (PASS)
    3. `/espera.html` (PASS)
    4. `/cadastro.html` (PASS)
    5. `/entrar.html` (PASS)
    6. `/manifesto.html` (PASS)
    7. `/privacidade.html` (PASS)
  - **Failing Pages & Offending Elements**:
    1. `index.html`: Fails on all 6 viewports (360px–1440px):
       - `canvas#network-canvas` (extends +32px beyond right edge on every viewport: w=392 at 360px, w=1472 at 1440px).
       - `div.tb-earth` (extends up to +936px beyond viewport on desktop: w=3312px at 1440px; +234px on 360px: w=828px).
       - `div.manifesto-glow` (fixed 950px width glow filter, extends +295px on 360px).
       - `div.contact-pattern` (extends +104px to +156px across all viewports).
    2. `planos.html`: Fails on mobile viewports (360px, 375px, 390px):
       - `table` (unresponsive comparison table fixed at w=640px: extends +297px on 360px, +282px on 375px, +267px on 390px).
    3. `juridico/index.html`: Fails on all 6 viewports:
       - `div.legal-orbit` (orbital visual graphic fixed at w=420px: extends +250px on 360px–390px, +144px on 1440px).
       - `canvas#network-canvas` (+32px on all viewports).
       - `div.contact-pattern` (+74px to +103px).
    4. `fundador.html`: Fails on all 6 viewports:
       - `canvas#network-canvas` (+32px on all viewports).
       - `div.contact-pattern` (+67px to +94px).
    5. `modelos.html`: Fails on all 6 viewports:
       - `table.voice-compare` (fixed comparison table w=774px: extends +432px on 360px, +417px on 375px, +402px on 390px, +34px on 768px).
       - `canvas#network-canvas` (+32px).
       - `div.contact-pattern` (+79px to +97px).

### 1.5 Additional Tooling Observations
- `scripts/sitemap.mjs --check`: Currently exits with code 1 because unstaged Git changes cause `<lastmod>` timestamps in `sitemap.xml` to lag behind the current working tree date. Running `npm run sitemap` updates them.
- `scripts/i18n.mjs --check`: Exits with code 0 (`17 páginas · 0 texto(s) sem tradução`).
- Strict CSP Enforcement: In `scripts/build-worker.mjs` line 85, CSP does not contain `'unsafe-inline'` for styles. Any inline `style="..."` attribute violates production CSP and is rejected by the browser.

---

## 2. Logic Chain

1. **Step 1: Test Command Deficiency in `package.json`**:
   - `ORIGINAL_REQUEST.md` line 38 defines the acceptance criterion: `Passes npm test and npm run stamp without any CSP violations.`
   - However, Observation 1.1 confirms that running `npm test` fails with `npm error Missing script: "test"`.
   - *Inference*: A canonical `"test"` script must be added to `package.json` that unifies all verification gates (worker tests, mac tests, stamp verification, and horizontal overflow checks).

2. **Step 2: Dependency & Execution Architecture**:
   - Observation 1.1 reveals zero production dependencies and an unpopulated root `node_modules`.
   - Observation 1.2 demonstrates that the existing project tests (`worker.test.mjs`, `hermes-autorizados.test.mjs`, `whatsapp.test.mjs`) purposefully use zero external packages, relying strictly on Node.js built-ins (`node:sqlite`, `node:http`, `node:crypto`).
   - *Inference*: To maintain portability, speed, and consistency with repository architecture, our horizontal overflow testing tool should also remain zero-external-dependency, executing via a native Node HTTP server and utilizing the already cached Playwright/system Chrome without forcing a heavy `npm install` on the user's environment.

3. **Step 3: Inadequacy of Naive Root `scrollWidth` Assertions**:
   - Observation 1.4 proves that `body { overflow-x: hidden; }` prevents `window.scrollX` and suppresses `document.documentElement.scrollWidth > window.innerWidth`.
   - A naive test checking only `document.documentElement.scrollWidth > window.innerWidth` falsely reports 0 violations across all 12 pages.
   - However, scanning actual element bounding rectangles reveals that 5 pages have major layout boundary violations: tables extending up to 774px wide on 360px screens (+432px overflow), orbits extending +250px, and canvas extending +32px.
   - *Inference*: Robust overflow verification must inspect element geometry (`getBoundingClientRect().right > window.innerWidth + 1`) and/or test with unmasked `overflow-x: visible` on body/html.

4. **Step 4: Identification of Refactoring Targets**:
   - Observation 1.4 isolates the exact CSS components requiring refactoring by the downstream styling and HTML agents:
     a) Fixed-width tables (`table` in `planos.html` [640px] and `table.voice-compare` in `modelos.html` [774px]) require horizontal scroll containers with visual swipe cues (`overflow-x: auto`) or responsive card stacking on viewports `< 768px`.
     b) Visual decorations (`div.tb-earth`, `div.manifesto-glow`, `div.legal-orbit`, `div.contact-pattern`) must be constrained within their parent containers using `overflow: hidden; max-width: 100%` or positioned with percentage/clip-path rather than fixed widths.
     c) Background interactive canvas (`canvas#network-canvas`) has an inline or computed width that exceeds the viewport by exactly 32px (likely `calc(100vw + 32px)` or unconstrained canvas resize listener); it must be clamped to `width: 100%; max-width: 100vw`.

5. **Step 5: Verification of Prototype Script**:
   - The standalone runner `.agents/teamwork/explorer_survey_3/test-overflow.mjs` successfully executed 72 assertions in under 30 seconds, accurately discriminating between the 7 fully responsive pages and the 5 failing pages.
   - *Inference*: This script can be adopted directly into `scripts/test-overflow.mjs` and wired into `npm test`.

---

## 3. Caveats

1. **Local Server vs. Production CDN**:
   - Testing against `http://127.0.0.1:<port>` evaluates the current disk files. It does not measure CDN-injected scripts (such as Cloudflare Web Analytics beacons) or CloudFront video streams that require an active internet connection.
2. **WebGL Software Rendering**:
   - The 3D audio orb on `voice.html` relies on WebGL. In headless environments without physical GPUs, SwiftShader software emulation flags (`--enable-unsafe-swiftshader --use-angle=swiftshader`) are mandatory to prevent renderer crashes.
3. **Touch Action & Drawer State**:
   - The overflow test evaluates pages in their initial loaded state (drawer closed). Separate interaction assertions must be run for the mobile drawer in its open state (`aria-expanded="true"`).

---

## 4. Conclusion

1. **Test Infrastructure Readiness**:
   - Node.js runtime (v26.9.0) and Google Chrome (v154) are fully operational.
   - Project scripts currently lack an `npm test` entry point in `package.json`, causing standard CI/developer test invocations to fail.
   - Existing unit tests (`test:worker`, `test:mac`) and asset tooling (`stamp:check`, `i18n:check`, `validate`) pass completely.
2. **Horizontal Overflow Reality**:
   - The platform has **27 active layout boundary violations across 5 of the 12 platform pages** (`index.html`, `planos.html`, `juridico/index.html`, `fundador.html`, `modelos.html`).
   - The remaining 7 pages (`voice.html`, `seats.html`, `espera.html`, `cadastro.html`, `entrar.html`, `manifesto.html`, `privacidade.html`) already pass 100% of all viewport checks (360px–1440px).
   - The primary offenders are:
     - Hardcoded desktop comparison tables (`planos.html`, `modelos.html`) on mobile screens (`< 768px`).
     - Fixed-dimension orbital/glow graphics (`div.tb-earth`, `div.manifesto-glow`, `div.legal-orbit`, `div.contact-pattern`).
     - A 32px width overrun in `canvas#network-canvas`.
3. **Actionable Implementation Plan for Downstream Agents**:
   - **For CSS/Design System Agent**:
     - Normalize table containers to scroll horizontally with `overflow-x: auto; max-width: 100%`.
     - Constrain decorative background layers (`.tb-earth`, `.manifesto-glow`, `.legal-orbit`, `.contact-pattern`) with `max-width: 100vw; overflow: hidden; pointer-events: none`.
     - Fix `canvas#network-canvas` sizing to `width: 100%; max-width: 100%`.
     - Eliminate inline styles to satisfy strict CSP.
   - **For Tooling / Integration Agent**:
     - Place `.agents/teamwork/explorer_survey_3/test-overflow.mjs` into `scripts/test-overflow.mjs`.
     - Update `package.json` to define:
       ```json
       "test": "node worker/test/worker.test.mjs && node mac/test/hermes-autorizados.test.mjs && node mac/test/whatsapp.test.mjs && node scripts/test-overflow.mjs",
       "test:overflow": "node scripts/test-overflow.mjs"
       ```
     - Run `npm run stamp` whenever HTML/CSS asset links are updated.
     - Run `npm run i18n` whenever PT pages are modified to keep EN mirrors in sync.

---

## 5. Verification Method

To independently verify all claims made in this report, execute the following commands in `/Users/joseedson/github/trustio-site`:

1. **Verify `npm test` Missing Script Failure**:
   ```bash
   npm test
   ```
   *Expected result*: Exits with code 1 (`npm error Missing script: "test"`).

2. **Verify Existing Tests Pass**:
   ```bash
   node worker/test/worker.test.mjs
   npm run test:mac
   node scripts/stamp-asset-versions.mjs --check
   node scripts/i18n.mjs --check
   node scripts/validate-artifact.mjs
   ```
   *Expected result*: All 5 commands exit with code 0.

3. **Verify Headless Horizontal Overflow Prototype & Inspect Violations**:
   ```bash
   node .agents/teamwork/explorer_survey_3/test-overflow.mjs
   ```
   *Expected result*:
   - Runs 72 assertions (12 pages × 6 viewports: 360, 375, 390, 768, 1024, 1440).
   - Reports 7 passing pages (`voice.html`, `seats.html`, `espera.html`, `cadastro.html`, `entrar.html`, `manifesto.html`, `privacidade.html`).
   - Reports 5 failing pages (`index.html`, `planos.html`, `juridico/index.html`, `fundador.html`, `modelos.html`) with the exact 27 element boundary violations detailed in Section 1.4.
   - Exits with code 1 until the layout refactoring is applied.

4. **Verify Asset Stamping**:
   ```bash
   npm run stamp:check
   ```
   *Expected result*: Exits with code 0 (`Versões dos assets já estão em dia.`).
