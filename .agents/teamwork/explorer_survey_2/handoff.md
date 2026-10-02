# Survey Explorer 2 — Handoff Report: CSS Architecture, Design System Tokens & WCAG/CSP Audit

## 1. Observation

### 1.1. Design System Tokens (`design-system/tokens.json`)
Direct inspection of `/Users/joseedson/github/trustio-site/design-system/tokens.json` (438 lines, 11,746 bytes) reveals:
- **Breakpoint definitions**: **None**. There is zero declaration of responsive breakpoints in `tokens.json` (`grep -i "breakpoint" tokens.json` yields 0 results).
- **Layout tokens**: Only one token is defined in `layout` (lines 235-244):
  ```json
  "layout": {
    "container": {
      "$value": "min(1180px, calc(100vw - 48px))",
      "$type": "dimension"
    }
  }
  ```
- **Color tokens**:
  - Dark surfaces: `--abyss: #05070b` (line 26), `--surface: #0b0e14` (line 30), `--surface-raised: #10141c` (line 34), `--surface-blue: #0b1730` (line 38), `--surface-deep: #071020` (line 74), `--surface-footer: #040609` (line 94), `--surface-band: #070a10` (line 98).
  - Text tokens: `--muted: #99a4b5` (line 50), `--muted-strong: #bdc5d1` (line 54), `--label-color: #8d98aa` (line 66), `--ice: #f4f6fa` (line 42), `--white: #ffffff` (line 46), `--text-strong: #ffffff` (line 70), `--blue-signal: #5ea7ff` (line 10), `--accent-text: #9dc8ff` (line 420).
  - Light mode overrides (lines 388-434): `--abyss: #f4f6fa`, `--surface: #ffffff`, `--surface-raised: #eef2f8`, `--surface-blue: #e3ecfb`, `--muted: #55637a`, `--muted-strong: #33405a`, `--label-color: #4f5c72`, `--ice: #0a1d3d`, `--text-strong: #05070b`.
- **Spacing scale**: Lines 273-338 define 16 tokens from `--space-4: 4px` to `--space-140: 140px`.
- **Typography scale**: Lines 263-272 define only `--label: 11px` and `--label-lg: 12px`. Heading and body scales are missing from `tokens.json`.

### 1.2. CSS Architecture & Media Query Catalog (`assets/styles.css`)
Inspection of `/Users/joseedson/github/trustio-site/assets/styles.css` (3,021 lines, 128,621 bytes) shows a monolithic architecture. 

A total of **34 `@media` statements** exist in `styles.css`. Among them, **16 distinct arbitrary viewport width thresholds** are used across 27 responsive queries:
1. `max-width: 420px`: lines 2085, 3007
2. `max-width: 560px`: lines 1926, 2830
3. `max-width: 600px`: line 2153
4. `max-width: 640px`: line 2179
5. `max-width: 680px`: line 2288
6. `max-width: 700px`: lines 2371, 2576, 2746, 2791
7. `max-width: 720px`: line 2849
8. `max-width: 760px`: lines 1990, 3002
9. `max-width: 900px`: lines 1921, 2621, 2641, 2651, 2679, 2709
10. `max-width: 960px`: lines 2158, 2593
11. `max-width: 1040px`: line 2287
12. `max-width: 1060px`: line 1965
13. `max-width: 1300px`: line 1956
14. `min-width: 1301px`: line 1938
15. `min-width: 1301px and (max-width: 1539px)`: line 1944
16. `min-width: 1700px`: line 1950

Other media features in `styles.css`:
- `prefers-reduced-motion: reduce`: lines 2104, 2189, 2685, 3016
- `hover: none`: line 2481
- `print`: line 2111

Additionally, external CSS files in `assets/` declare separate disjoint queries:
- `assets/whatsapp-suporte.css:36`: `@media (max-width: 719px)`
- `assets/console.css:172, 173, 184`: `max-width: 1100px`, `max-width: 900px`, `max-width: 640px`
- `assets/crm.css:124, 200, 201`: `max-width: 720px`, `max-width: 900px`
- `assets/chat.css:126, 138, 308`: `max-width: 900px`, `max-width: 420px`, `max-width: 600px`
- `assets/voice-base.css:142, 143`: `max-width: 960px`, `max-width: 520px`

#### Header Breakpoint Discrepancy:
`assets/styles.css` lines 1933-1937 document the reason for the `1300px` mobile hamburger breakpoint:
> "Cabeçalho: oito itens (com os pares VoiceAI, Agentio e IA sem censura) + Entrar + CTA + idioma + tema precisam de ~1470px. A faixa do cabeçalho cresce até 1520px (1600px em telas largas), mais larga que o container de conteúdo; entre 1301px e 1539px o CTA do cabeçalho sai (o contato continua na página) e o menu aperta um pouco; abaixo de 1301px, o menu hambúrguer assume (breakpoint espelhado em app.js)."

This `1300px` breakpoint is hardcoded in `assets/app.js` line 55:
```javascript
window.addEventListener("resize", () => {
  if (window.innerWidth > 1300) closeMenu();
});
```
This forces all tablets and medium laptops (768px to 1300px) into mobile drawer navigation because the desktop bar is congested with 8 navigation links, 3 badges, and multiple control buttons.

### 1.3. WCAG AA Contrast Evaluation (>= 4.5:1 Requirement)
Programmatic calculation of relative luminance $L = 0.2126 R + 0.7152 G + 0.0722 B$ (sRGB to linear) and contrast ratio $(L_1 + 0.05)/(L_2 + 0.05)$ yielded:

#### Base Dark Token Contrast on `--abyss` (`#05070b`):
- `--white` (`#ffffff`): **20.16:1** (PASS AA, PASS AAA)
- `--ice` (`#f4f6fa`): **18.63:1** (PASS AA, PASS AAA)
- `--muted-strong` (`#bdc5d1`): **11.59:1** (PASS AA, PASS AAA)
- `--accent-text` (`#9dc8ff`): **11.65:1** (PASS AA, PASS AAA)
- `--blue-signal` (`#5ea7ff`): **8.11:1** (PASS AA, PASS AAA)
- `--muted` (`#99a4b5`): **8.00:1** (PASS AA, PASS AAA)
- Fallback `--muted` (`#a9b4c6` in `planos.css` & `styles.css:2751`): **9.51:1** (PASS AA, PASS AAA)
- `--label-color` (`#8d98aa`): **6.92:1** (PASS AA, FAILS AAA)

#### Direct WCAG AA Failures Discovered in Components:
1. **`.insight` resting state (`assets/styles.css:2427`)**:
   ```css
   .insight {
     opacity: .5;
     transform: translateY(6px);
   }
   .insight p { color: var(--muted-strong); font-size: 13.5px; }
   .insight .note { color: var(--label-color); font-family: var(--mono); }
   ```
   At 50% opacity composited against `--abyss` (`#05070b`):
   - `.insight p` (`#bdc5d1` at 50% on `#05070b` $\to$ `#61666e`): Contrast is **3.36:1** (**FAILS WCAG AA >= 4.5:1**).
   - `.insight .note` (`#8d98aa` at 50% on `#05070b` $\to$ `#494f5b`): Contrast is **2.42:1** (**FAILS WCAG AA >= 4.5:1**).
2. **`.button:disabled` (`assets/styles.css:2958`)**:
   `color: #6e7888` on `#05070b` $\to$ Contrast is **4.40:1** (**FAILS WCAG AA >= 4.5:1**). On `--surface-raised` (`#10141c`), contrast drops to **3.95:1**.
3. **`.code .c` (`assets/console.css:170`)**:
   `color: #66738a` on `#080b11` $\to$ Contrast is **4.03:1** (**FAILS WCAG AA >= 4.5:1**).
4. **Light mode token leaking onto dark surfaces**:
   In `:root[data-theme="light"]`, `--muted` is redefined as `#55637a`. If applied against dark backgrounds (`#05070b`), contrast is **2.98:1** (severe failure). While line 194 re-scopes `--muted: #99a4b5` for `.api-terminal, .server-panel, .contact-card, .manifesto-finale, .layer-control, .voice-cta`, other dark sections or callouts risk displaying illegible text if not explicitly re-scoped.
5. **Background dot-grid pattern visual interference** (confirmed in `audit/REAVALIACAO-DESIGN-2026-10.md` F04):
   Pseudo-elements (`manifesto-preview::before`, `contact-pattern`, `brazil-commitment::before`) render positive z-index dot grids over text characters, physically degrading perceived legibility and local contrast.

### 1.4. CSP Compliance & Inline Styles/Scripts Audit
- **CSP Policy**: Checked in `index.html:10`, `manifesto.html:10`, `scripts/validate-artifact.mjs:83-93`, and `scripts/build-worker.mjs:85`:
  `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'`
  Notice: Neither `'unsafe-inline'` nor `'unsafe-eval'` is permitted.
- **Production HTML Scan**:
  - Across all 38 production HTML templates, there are **0 inline `style="..."` attributes** and **0 inline `<script>...</script>` tags**.
  - **Runtime JS Workaround Found in `ia-sem-censura.html`**:
    Lines 36, 115, 116, 139, 166, 246, 292, 303, 312, 338, 350, 371, 509 use `data-style="..."` (e.g. `data-style="position:absolute"`, `data-style="color:var(--accent-text)"`).
    In `assets/ia-sem-censura.js` lines 8-9:
    ```javascript
    // vêm em data-style e são aplicados pelo CSSOM, que a CSP permite.
    $$("[data-style]").forEach(function (el) { el.style.cssText = el.getAttribute("data-style"); });
    ```
    This circumvents static validation by mutating CSSOM at runtime. This causes FOUC, breaks when JS is blocked, and violates modular styling separation.

### 1.5. Floating Action Button Collision (`assets/whatsapp-suporte.css`)
- In `assets/whatsapp-suporte.css:6-9`:
  ```css
  .wa-float {
    position: fixed;
    z-index: 90;
    right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
  ```
- In `cadastro.html` (lines 120-190) and `espera.html`, the 56px FAB collides with card borders and form submit buttons on mobile screens, confirming finding F06 of the UX audit.

---

## 2. Logic Chain

1. **Tokens Gap to CSS Divergence**:
   Because `design-system/tokens.json` lacks breakpoint tokens, developers had no single source of truth for responsive thresholds. Over time, CSS authors introduced arbitrary breakpoint values ad-hoc whenever a specific element overflowed or looked cramped (e.g. 420px for Martian Mono tracking, 560px for lang-switch icon, 600px for terminal wrapping, 640px for server hardware panel, 680px for models grid, 700px for seats and legal, 720px for footer legal, 760px for general mobile, 900px for b2b segment, 960px for api-band, 1040px for 2-column models, 1060px for hero grid, 1300px for hamburger, 1539px for header-cta, 1700px for ultra-wide header).

2. **Root Cause of Congested Navigation & Hamburger Bloat**:
   `index.html` lines 117-130 put 8 page links, 3 partner badges (`<small>`, `nous-research.webp`), a login link, a primary CTA, a language switch, and a theme toggle all into `.site-header`. At standard desktop viewports (1024px–1280px), this row requires over 1470px. Authors compensated by stretching `.header-inner` to 1520px–1600px (violating the 1180px `--container` token) and forcing the hamburger menu to take over at 1300px.
   Streamlining top-level items to $\le 5$ (e.g., Plataforma, Soluções, Preços, Sobre, Entrar) restores the desktop menu to standard laptop screens (1024px+), eliminating the artificial 1300px breakpoint.

3. **Contrast Failure Root Cause**:
   The base color token `--muted: #99a4b5` has an 8.0:1 contrast against `#05070b`, easily meeting WCAG AA (4.5:1). The failure occurs when `.insight` applies `opacity: .5` to mimic a subtle resting card state. 50% opacity of `#bdc5d1` on `#05070b` results in effective color `#61666e` with contrast 3.36:1, falling far below the 4.5:1 threshold.
   Similarly, `.button:disabled` uses `#6e7888` (4.40:1 on abyss, 3.95:1 on surface-raised), and `console.css` uses `#66738a` (4.03:1).
   Fixing `.insight` to use full opacity with a dedicated compliant color token (such as `--muted-strong` without opacity, or adjusting the minimum opacity floor to 0.72) brings the contrast to $\ge 4.5:1$.

4. **CSP Architecture Root Cause**:
   The CSP `style-src 'self'` is strictly enforced in HTTP headers and `<meta>` tags. While `styles.css` is CSP-compliant, `ia-sem-censura.html` avoided adding utility classes by using `data-style="..."` + `el.style.cssText` in JavaScript. Refactoring these inline data styles into discrete utility CSS rules eliminates runtime DOM mutations and ensures 100% CSP compliance.

---

## 3. Caveats

- `design-system/` is documented as a synchronization bundle for `claude.ai/design` (`design-system/README.md:4`), not directly imported by HTML pages at runtime. However, `ORIGINAL_REQUEST.md` R4 explicitly mandates aligning CSS refactoring with `design-system/tokens.json`. Adding breakpoint tokens to `tokens.json` establishes the contract.
- Email templates in `supabase/templates/` contain inline styles (`style="..."`), but email clients do not run under web browser CSP headers. These are out of scope for web CSP compliance.
- No source code modifications were performed during this survey phase (read-only investigation per protocol).

---

## 4. Conclusion & Proposed Architecture

### 4.1. Token Normalization (`design-system/tokens.json`)
Add a standard `"breakpoint"` group to `tokens.json`:
```json
"breakpoint": {
  "sm": { "$value": "768px", "$type": "dimension", "$description": "Mobile max-width (< 768px)" },
  "md": { "$value": "1024px", "$type": "dimension", "$description": "Tablet max-width (< 1024px)" },
  "lg": { "$value": "1440px", "$type": "dimension", "$description": "Desktop standard (< 1440px)" },
  "xl": { "$value": "1440px", "$type": "dimension", "$description": "Wide desktop min-width (>= 1440px)" }
}
```

### 4.2. Unified 4-Tier Breakpoint Matrix
Replace all 16 arbitrary thresholds across `assets/styles.css` and sub-CSS files with 4 standardized tiers:
| Tier | Name | Query Target | Viewports Covered | Key Responsibilities |
|---|---|---|---|---|
| **Tier 1** | **Mobile** | `@media (max-width: 767px)` | 360px, 375px, 390px, 430px | Single-column grids, full-width buttons, hamburger menu active, touch targets $\ge 48\text{px}$, reduced padding (16px gutters). |
| **Tier 2** | **Tablet** | `@media (min-width: 768px) and (max-width: 1023px)` | 768px, 820px, 900px, 960px | 2-column capability and metric grids, hamburger menu active, comfortable touch padding. |
| **Tier 3** | **Desktop** | `@media (min-width: 1024px)` | 1024px, 1200px, 1280px, 1366px | Full horizontal navigation bar active ($\le 5$ items), 3-column card grids, split hero layouts, header container aligned with `--container`. |
| **Tier 4** | **Wide** | `@media (min-width: 1440px)` | 1440px, 1600px, 1920px | Expanded display typography, max container bound (1280px or 1440px), enhanced breathing room. |

### 4.3. Contrast Remediations (WCAG AA >= 4.5:1)
1. **`.insight` (`assets/styles.css:2427`)**:
   Change resting `opacity: .5` to `opacity: .75` or replace with full opacity and `color: var(--muted-strong)`. At `opacity: .75`, effective contrast of `#bdc5d1` on `#05070b` is **6.8:1** (PASS AA).
2. **`.button:disabled` (`assets/styles.css:2958`)**:
   Elevate text color from `#6e7888` (4.40:1) to `#8d98aa` (6.92:1 on abyss, 6.33:1 on surface-raised).
3. **`console.css:170`**:
   Elevate `.code .c` from `#66738a` (4.03:1) to `#8d9ab0` (5.8:1).
4. **Pattern Pseudo-Elements (`assets/styles.css:1368, 2054, etc.`)**:
   Add `z-index: 0` (with relative positioned text at `z-index: 1`) or `z-index: -1` to prevent dot-grids from visually puncturing text.
5. **WhatsApp FAB Clearance (`assets/whatsapp-suporte.css:8-9`)**:
   Update `.wa-float` to include `margin-bottom: env(safe-area-inset-bottom)` and add a 80px bottom scroll clearance buffer on form pages (`cadastro.html`, `espera.html`) so the button never sits directly on top of input fields or submit buttons.

### 4.4. Deep Modular CSS Structure
Refactor the 3,021-line monolithic `assets/styles.css` into deep modules using `@import` (fully supported by `scripts/stamp-asset-versions.mjs` lines 70-98):
```
assets/css/
├── tokens.css          # CSS Custom Properties from tokens.json (dark + light theme)
├── reset.css           # Modern box-sizing, optical font sizing, focus rings
├── typography.css      # @font-face rules and responsive type scales
├── layout.css          # Container, 4-tier grid system, header, footer
├── components/
│   ├── buttons.css     # .button, .button-primary, .button-ghost, .button-small, pill shapes
│   ├── cards.css       # .capability-card, .model-card, .pillar-card, .insight (contrast fixed)
│   ├── navigation.css  # Streamlined desktop nav + accessible mobile drawer
│   └── fab.css         # .wa-float support button with viewport clearance
└── pages/
    ├── home.css        # Home hero, canvas, b2b segments, mentoria
    ├── manifesto.css   # Manifesto hero, chapters, declaration
    └── legal.css       # Privacy and legal copy layout
```
Entrypoint `assets/styles.css` will import these modules cleanly, maintaining backwards compatibility with HTML `<link>` tags and `npm run stamp`.

---

## 5. Verification Method

1. **Verify Media Query Count and Unification**:
   Run ripgrep on `assets/styles.css` to confirm all media queries adhere strictly to the 4-tier matrix:
   ```bash
   grep -n "@media" assets/styles.css
   ```
   Invalidation condition: Any viewport width query other than `767px`, `768px`, `1024px`, or `1440px`.

2. **Verify WCAG Contrast Mathematically**:
   Execute Node.js contrast verification script against updated tokens and rules:
   ```bash
   node -e '
   const hexToLuminance = hex => {
     const [r, g, b] = hex.replace("#","").match(/.{2}/g).map(v => parseInt(v, 16)/255).map(c => c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
     return 0.2126*r + 0.7152*g + 0.0722*b;
   };
   const cr = (h1, h2) => (Math.max(hexToLuminance(h1), hexToLuminance(h2)) + 0.05) / (Math.min(hexToLuminance(h1), hexToLuminance(h2)) + 0.05);
   console.log("Muted on Abyss:", cr("#99a4b5", "#05070b").toFixed(2));
   console.log("Muted-Strong on Abyss:", cr("#bdc5d1", "#05070b").toFixed(2));
   '
   ```
   Invalidation condition: Any text color on its parent background with ratio < 4.5:1.

3. **Verify CSP Compliance (Zero Inline Styles / Zero Inline Scripts)**:
   ```bash
   node -e '
   const fs = require("fs");
   const files = ["index.html", "cadastro.html", "entrar.html", "espera.html", "fundador.html", "ia-sem-censura.html", "manifesto.html", "modelos.html", "planos.html", "privacidade.html", "seats.html", "voice.html"];
   let errs = 0;
   files.forEach(f => {
     const t = fs.readFileSync(f, "utf8");
     if (/(?<!data-)style\s*=\s*["\x27]/.test(t)) { console.error(`Inline style in ${f}`); errs++; }
     if (/<script(?![^>]*\bsrc\s*=)[^>]*>(?![\s\S]*application\/ld\+json)/.test(t)) { console.error(`Inline script in ${f}`); errs++; }
   });
   if (!errs) console.log("All platform HTML files are 100% CSP compliant.");
   '
   ```
   Invalidation condition: Any `style="..."` attribute or executable inline `<script>`.

4. **Verify Asset Stamping and Worker Artifact**:
   ```bash
   npm run stamp:check
   npm run validate
   ```
   Both commands must pass with exit code 0.
