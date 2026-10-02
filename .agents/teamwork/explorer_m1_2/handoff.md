# Handoff Report: Milestone 1 — WCAG AA Contrast & Pattern Layering

**Author**: Explorer M1-2  
**Working Directory**: `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_2`  
**Target Milestone**: Milestone 1 (WCAG AA Contrast & Pattern Layering)  
**Deliverable**: Concrete CSS modifications, Stacking Context architecture, and Mathematical Contrast Proofs for `.insight`, `.button:disabled`, `.code .c`, and dot-grid pattern pseudo-elements.

---

## 1. Observation

Direct investigation of the stylesheet codebase, HTML templates, and design audit documents (`audit/REAVALIACAO-DESIGN-2026-10.md`) reveals four specific WCAG AA contrast failures and a critical stacking-context gap:

### 1.1. `.insight` Card Resting State (`assets/styles.css:2422-2434`)
In `/Users/joseedson/github/trustio-site/assets/styles.css`:
```css
2422: .insight {
2423:   display: grid;
2424:   gap: var(--space-8);
2425:   margin-top: var(--space-20);
2426:   /* visível em tom baixo: o espaço reservado não parece vazio, e o hover só realça */
2427:   opacity: .5;
2428:   transform: translateY(6px);
2429:   transition: opacity 240ms var(--ease), transform 240ms var(--ease);
2430: }
2431: 
2432: .has-insight:hover .insight,
2433: .has-insight:focus-within .insight { opacity: 1; transform: none; }
```
- In resting state, `opacity: .5` causes every child text element to composite 50% against the parent card surface (`--surface-raised` `#10141c` or `--abyss` `#05070b`).
- Child elements declared in lines 2435-2464:
  - `.insight-label`: `color: var(--blue-signal)` (`#5ea7ff`). Blended at 50% on `#05070b` $\to$ `#325685`, relative luminance $L = 0.0919$, background $L = 0.0021$. Contrast ratio = **2.72:1** (**FAILS WCAG AA < 4.5:1**).
  - `.insight p`: `color: var(--muted-strong)` (`#bdc5d1`). Blended at 50% on `#05070b` $\to$ `#61666e`, relative luminance $L = 0.1317$. Contrast ratio = **3.49:1** (**FAILS WCAG AA < 4.5:1**).
  - `.insight .note`: `color: var(--label-color)` (`#8d98aa`). Blended at 50% on `#05070b` $\to$ `#494f5b`, relative luminance $L = 0.0791$. Contrast ratio = **2.48:1** (**FAILS WCAG AA < 4.5:1**).
  - On `--surface-raised` (`#10141c`), contrast ratios remain severely sub-compliant: label is **2.77:1**, paragraph is **3.54:1**, note is **2.50:1**.

### 1.2. `.button:disabled` Resting State (`assets/styles.css:2953-2967`)
In `/Users/joseedson/github/trustio-site/assets/styles.css`:
```css
2953: .button:disabled,
2954: .button[aria-disabled="true"] {
2955:   border-color: rgba(160, 179, 211, 0.12);
2956:   background: rgba(148, 178, 230, 0.06);
2957:   box-shadow: none;
2958:   color: #6e7888;
2959:   cursor: not-allowed;
2960:   transform: none;
2961: }
...
2966: [data-theme="light"] .button:disabled,
2967: [data-theme="light"] .button[aria-disabled="true"] { border-color: rgba(10, 29, 61, 0.12); background: rgba(10, 29, 61, 0.05); color: #7b8699; }
```
- In dark mode: `color: #6e7888` on button background `rgba(148, 178, 230, 0.06)` composited over `--abyss` (`#05070b` $\to$ `#0e1118`, $L=0.0056$) yields contrast **4.23:1** (**FAILS WCAG AA < 4.5:1**). Composited over `--surface-raised` (`#10141c` $\to$ `#181d28`, $L=0.0123$) yields contrast **3.78:1** (**FAILS WCAG AA < 4.5:1**).
- In light mode: `color: #7b8699` on button background `rgba(10, 29, 61, 0.05)` composited over `--surface` (`#ffffff` $\to$ `#f3f4f5`, $L=0.9035$) yields contrast **3.34:1** (**FAILS WCAG AA < 4.5:1**). On `--surface-raised` (`#eef2f8`), contrast drops to **2.97:1**.

### 1.3. `.code .c` Code Comments (`assets/console.css:168-170`)
In `/Users/joseedson/github/trustio-site/assets/console.css`:
```css
168: .events,.code{font-family:var(--mono);font-size:11px;line-height:1.65;color:#c3ccdb;background:#080b11;border:1px solid var(--line);border-radius:10px;padding:12px;margin:0;overflow-x:auto;max-height:170px;overflow-y:auto;white-space:pre-wrap}
169: .events{color:#8d9ab0}
170: .code .k{color:#5ea7ff}.code .s{color:#9ad0ff}.code .c{color:#66738a}
```
- Background of `.code` is `#080b11` ($L = 0.0033$).
- `.code .c` uses `color: #66738a` ($L = 0.1692$).
- Contrast ratio: $(0.1692 + 0.05) / (0.0033 + 0.05) =$ **4.11:1** (**FAILS WCAG AA < 4.5:1**).
- Notice line 169 immediately preceding line 170 already uses `#8d9ab0` for `.events` ($L = 0.3191$, ratio **6.92:1**).

### 1.4. Pattern Pseudo-Elements Stacking Layering (`assets/styles.css:1367-1500` & `3022-3038`)
Inspection of `assets/styles.css` lines 3022-3038 shows that an initial stacking isolation block was introduced:
```css
3028: .manifesto-preview { isolation: isolate; }
3029: .manifesto-preview::before { z-index: -1; }
3030: .contact-card { isolation: isolate; }
3031: .contact-pattern { z-index: -1; }
3032: .capability-card { isolation: isolate; }
3033: .card-visual { z-index: -1; }
3034: .manifesto-finale { isolation: isolate; }
3035: .finale-lines { z-index: -1; }
3036: .error-shell { isolation: isolate; }
3037: .error-dots { z-index: -1; }
```
However, inspection of `manifesto.html` (lines 176-193) and `assets/styles.css` (lines 1491-1493) reveals:
```css
1491: .brazil-commitment { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-deep); overflow: hidden; }
1492: .brazil-commitment::before { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(94,167,255,.2) 1px, transparent 1.4px); background-size: 30px 30px; content: ""; mask-image: linear-gradient(90deg, black, transparent 60%); opacity: .25; }
1493: .brazil-commitment-inner { position: relative; z-index: 2; display: grid; grid-template-columns: .7fr 1fr; align-items: center; gap: 100px; }
```
- **Finding**: `.brazil-commitment` is completely **missing** from the isolation block in lines 3028-3037.
- `.brazil-commitment` lacks `isolation: isolate;` and `.brazil-commitment::before` lacks `z-index: -1;`.
- Furthermore, none of the pattern elements declare `pointer-events: none;`, creating potential click/touch and selection interception zones.

---

## 2. Logic Chain

1. **Root Cause of `.insight` Contrast Deficit**:
   - The token colors used inside `.insight` (`--blue-signal` `#5ea7ff`, `--muted-strong` `#bdc5d1`, `--label-color` `#8d98aa`) have solid, high-contrast values when fully opaque (8.11:1, 11.59:1, and 6.92:1 on abyss).
   - The contrast violation was introduced purely by CSS rule `opacity: .5;` at line 2427 to create an artificial "dimmed resting state".
   - Removing `opacity: .5;` (or setting `opacity: 1;`) immediately restores natural token contrast:
     - `.insight p` reaches **11.59:1** (WCAG AAA).
     - `.insight .note` reaches **6.92:1** (WCAG AA).
     - `.insight-label` reaches **8.11:1** (WCAG AAA).
   - The interactive hover affordance is preserved without contrast penalty via `transform: translateY(4px)` $\to$ `transform: none` and existing border highlights.

2. **Root Cause of `.button:disabled` Contrast Deficit**:
   - In dark mode, `#6e7888` has relative luminance $L = 0.1853$. Over dark surfaces with 6% white/blue tint, this produces a ratio of 3.78:1 to 4.23:1.
   - Upgrading the text color to `#8d98aa` (which matches `--label-color`) elevates relative luminance to $L = 0.3102$:
     - On `--abyss` `#05070b`: $(0.3102 + 0.05) / (0.0056 + 0.05) =$ **6.48:1** ($\ge 4.5:1$, PASS AA).
     - On `--surface-raised` `#10141c`: $(0.3102 + 0.05) / (0.0123 + 0.05) =$ **5.79:1** ($\ge 4.5:1$, PASS AA).
   - In light mode (`[data-theme="light"]`), the current color `#7b8699` ($L = 0.2356$) against `#f3f4f5` ($L = 0.9035$) gives only 3.34:1. Changing to `#4f5c72` ($L = 0.1053$, matching light mode `--label-color`) yields **6.14:1** on `#ffffff` and **5.45:1** on `#eef2f8` ($\ge 4.5:1$, PASS AA).
   - Applying `color: var(--label-color)` directly unifies both dark and light modes cleanly under design system tokens.

3. **Root Cause of `.code .c` Contrast Deficit**:
   - In `assets/console.css`, the code block background is fixed at `#080b11`.
   - Comment color `#66738a` ($L = 0.1692$) produces 4.11:1.
   - Upgrading `.code .c` to `#8d9ab0` ($L = 0.3191$), which is already declared on line 169 for `.events`, yields $(0.3191 + 0.05) / (0.0033 + 0.05) =$ **6.92:1** ($\ge 4.5:1$, PASS AA).
   - This achieves full WCAG AA compliance while reinforcing palette unity across the console panel.

4. **Mechanics of Stacking Context & Dot Grid Puncturing**:
   - Under the CSS 2.1 Stacking Context Specification (§ 9.9.1), the painting order within a stacking context is:
     1. Background & borders of element establishing the context.
     2. Positioned descendants with `z-index < 0` (negative z-index).
     3. Non-positioned in-flow block-level descendants.
     4. Non-positioned floating descendants.
     5. Non-positioned in-flow inline descendants (text glyphs, spans, strings).
     6. Positioned descendants with `z-index: 0` or `z-index: auto`.
     7. Positioned descendants with `z-index > 0`.
   - Without `z-index: -1`, an absolutely positioned pseudo-element (`::before`) paints at level 6 (above in-flow text at level 5). The dot-grid pattern rasterizes directly over text glyphs, causing perceived contrast drop and ragged character edges.
   - When `isolation: isolate` is set on the container, a fresh stacking context is created. Setting `z-index: -1` on the pattern forces it into level 2.
   - Result: The pattern renders strictly **above** the container's solid/gradient background (level 1), but strictly **beneath** all text, copy, cards, and UI elements (levels 3, 5, 7). The dots can never puncture text.
   - Adding `pointer-events: none;` prevents invisible overlay bounding boxes from hijacking pointer clicks or text selection.

5. **Mathematical Verification Derivation**:
   - Every contrast calculation follows the W3C WCAG 2.1 formula with linear sRGB transformation and alpha blending compositing. All proposed colors have been mathematically verified to clear $\ge 4.5:1$ with margin.

---

## 3. Caveats

- **Scope Boundary**: As an Explorer agent, no direct modifications were committed to production files (`assets/styles.css`, `assets/console.css`). This report contains the exact, copy-pasteable CSS specifications for the implementer agent.
- **Light Theme Disabled State**: The dispatch explicitly highlighted dark surfaces for `.button:disabled` (`#8d98aa`). However, our investigation proved that light theme disabled buttons (`#7b8699`, 3.34:1) also fail WCAG AA. We have provided the tandem light-mode remedy using `--label-color` (`#4f5c72`) to prevent incomplete compliance.
- **Hover Micro-interaction**: Eliminating `opacity: .5` means cards in resting state display crisp, legible text at all times. The interactive hover effect is seamlessly maintained by `transform: translateY(4px) -> transform: none` alongside existing card border transitions.

---

## 4. Conclusion & Concrete CSS Proposals

### 4.1. Exact Modification: `.insight` in `assets/styles.css`
Target: Lines 2422-2434 of `assets/styles.css`.

#### Current Code (Before):
```css
.insight {
  display: grid;
  gap: var(--space-8);
  margin-top: var(--space-20);
  /* visível em tom baixo: o espaço reservado não parece vazio, e o hover só realça */
  opacity: .5;
  transform: translateY(6px);
  transition: opacity 240ms var(--ease), transform 240ms var(--ease);
}

.has-insight:hover .insight,
.has-insight:focus-within .insight { opacity: 1; transform: none; }
```

#### Proposed Code (After):
```css
.insight {
  display: grid;
  gap: var(--space-8);
  margin-top: var(--space-20);
  /* Totalmente legível em repouso (>= 4.5:1 WCAG AA); hover realça sutilmente */
  opacity: 1;
  transform: translateY(4px);
  transition: transform 240ms var(--ease);
}

.has-insight:hover .insight,
.has-insight:focus-within .insight { opacity: 1; transform: none; }
```

---

### 4.2. Exact Modification: `.button:disabled` in `assets/styles.css`
Target: Lines 2953-2967 of `assets/styles.css`.

#### Current Code (Before):
```css
.button:disabled,
.button[aria-disabled="true"] {
  border-color: rgba(160, 179, 211, 0.12);
  background: rgba(148, 178, 230, 0.06);
  box-shadow: none;
  color: #6e7888;
  cursor: not-allowed;
  transform: none;
}
.button:disabled::before,
.button[aria-disabled="true"]::before { display: none; }
.button:disabled > span[aria-hidden="true"],
.button[aria-disabled="true"] > span[aria-hidden="true"] { background: rgba(148, 178, 230, 0.06); box-shadow: none; }
[data-theme="light"] .button:disabled,
[data-theme="light"] .button[aria-disabled="true"] { border-color: rgba(10, 29, 61, 0.12); background: rgba(10, 29, 61, 0.05); color: #7b8699; }
```

#### Proposed Code (After):
```css
.button:disabled,
.button[aria-disabled="true"] {
  border-color: rgba(160, 179, 211, 0.12);
  background: rgba(148, 178, 230, 0.06);
  box-shadow: none;
  color: #8d98aa; /* WCAG AA >= 4.5:1 (5.79:1 a 6.48:1 em superfícies escuras) */
  cursor: not-allowed;
  transform: none;
}
.button:disabled::before,
.button[aria-disabled="true"]::before { display: none; }
.button:disabled > span[aria-hidden="true"],
.button[aria-disabled="true"] > span[aria-hidden="true"] { background: rgba(148, 178, 230, 0.06); box-shadow: none; }
[data-theme="light"] .button:disabled,
[data-theme="light"] .button[aria-disabled="true"] { border-color: rgba(10, 29, 61, 0.12); background: rgba(10, 29, 61, 0.05); color: #4f5c72; /* WCAG AA >= 4.5:1 (5.45:1 a 6.14:1 no tema claro) */ }
```

---

### 4.3. Exact Modification: `.code .c` in `assets/console.css`
Target: Line 170 of `assets/console.css`.

#### Current Code (Before):
```css
.code .k{color:#5ea7ff}.code .s{color:#9ad0ff}.code .c{color:#66738a}
```

#### Proposed Code (After):
```css
.code .k{color:#5ea7ff}.code .s{color:#9ad0ff}.code .c{color:#8d9ab0}
```

---

### 4.4. Exact Modification: Pattern Pseudo-Elements Stacking Layering in `assets/styles.css`
Target: Lines 3022-3038 of `assets/styles.css`.

#### Current Code (Before):
```css
/* ── Reavaliação de design 2026-10 (RA3/F04): padrões decorativos sob o texto ──
   Camadas absolutas de pontos/grade (manifesto-preview, contact-pattern,
   card-visual, finale-lines, error-dots) pintavam por cima de glifos e
   parágrafos: elemento posicionado pinta acima de conteúdo estático. Com
   isolation no hospedeiro + z-index:-1 na camada, o padrão fica entre o
   fundo do bloco e o texto. */
.manifesto-preview { isolation: isolate; }
.manifesto-preview::before { z-index: -1; }
.contact-card { isolation: isolate; }
.contact-pattern { z-index: -1; }
.capability-card { isolation: isolate; }
.card-visual { z-index: -1; }
.manifesto-finale { isolation: isolate; }
.finale-lines { z-index: -1; }
.error-shell { isolation: isolate; }
.error-dots { z-index: -1; }
```

#### Proposed Code (After):
```css
/* ── Reavaliação de design 2026-10 (RA3/F04): padrões decorativos sob o texto ──
   Camadas absolutas de pontos/grade (manifesto-preview, contact-pattern,
   brazil-commitment, card-visual, finale-lines, error-dots) pintavam por cima de glifos e
   parágrafos: elemento posicionado pinta acima de conteúdo estático. Com
   isolation no hospedeiro + z-index:-1 na camada, o padrão fica estritamente entre o
   fundo do bloco e o texto, sem nunca perfurar glifos. pointer-events:none impede trapping de cliques. */
.manifesto-preview { isolation: isolate; }
.manifesto-preview::before { z-index: -1; pointer-events: none; }
.contact-card { isolation: isolate; }
.contact-pattern { z-index: -1; pointer-events: none; }
.brazil-commitment { isolation: isolate; }
.brazil-commitment::before { z-index: -1; pointer-events: none; }
.capability-card { isolation: isolate; }
.card-visual { z-index: -1; pointer-events: none; }
.manifesto-finale { isolation: isolate; }
.finale-lines { z-index: -1; pointer-events: none; }
.error-shell { isolation: isolate; }
.error-dots { z-index: -1; pointer-events: none; }
```

---

## 5. Verification Method & Mathematical Proof

### 5.1. Mathematical Contrast Ratio Formulas

#### Step 1: sRGB to Linear Channel Expansion
Given an 8-bit hex color `#RRGGBB`, each channel $C \in \{R, G, B\}$ is normalized to $C_{\text{sRGB}} = \frac{C_{8\text{bit}}}{255}$.  
The linearized channel value $C_{\text{linear}}$ is defined by:
$$C_{\text{linear}} = \begin{cases}
\dfrac{C_{\text{sRGB}}}{12.92}, & C_{\text{sRGB}} \le 0.04045 \\[1em]
\left(\dfrac{C_{\text{sRGB}} + 0.055}{1.055}\right)^{2.4}, & C_{\text{sRGB}} > 0.04045
\end{cases}$$

#### Step 2: Relative Luminance ($L$)
Using the CIE 1931 photopic curve coefficients:
$$L = 0.2126 \times R_{\text{linear}} + 0.7152 \times G_{\text{linear}} + 0.0722 \times B_{\text{linear}}$$
where $0.0 \le L \le 1.0$ ($L = 0$ for black, $L = 1$ for white).

#### Step 3: Alpha Blending Compositing (for semi-transparent overlays or element opacity)
When a foreground color $C_{\text{fg}}$ with alpha or opacity $\alpha \in [0, 1]$ sits above a solid opaque background $C_{\text{bg}}$:
$$C_{i, \text{blended}} = \text{round}\Big(\alpha \times C_{i, \text{fg}} + (1 - \alpha) \times C_{i, \text{bg}}\Big), \quad \text{for } i \in \{R, G, B\}$$
The blended RGB is then converted via Steps 1 & 2 to obtain the effective luminance $L_{\text{blended}}$.

#### Step 4: Contrast Ratio ($CR$)
Between two luminances $L_1$ and $L_2$ where $L_1 \ge L_2$:
$$CR = \frac{L_1 + 0.05}{L_2 + 0.05}$$
- **WCAG AA Compliance Criterion**: $CR \ge 4.50:1$ for regular text ($< 18\text{pt}$ / $< 24\text{px}$).
- **WCAG AAA Compliance Criterion**: $CR \ge 7.00:1$ for regular text.

---

### 5.2. Mathematical Verification Matrix

| Component / Selector | State | Text Hex / Opacity | Background Hex | $L_{\text{fg}}$ | $L_{\text{bg}}$ | Contrast Ratio | WCAG AA Status |
|---|---|---|---|---|---|---|---|
| `.insight p` | **Current** | `#bdc5d1` @ $\alpha = 0.5$ | `#05070b` | 0.1317 | 0.0021 | **3.49:1** | **FAIL** (< 4.5:1) |
| `.insight .note` | **Current** | `#8d98aa` @ $\alpha = 0.5$ | `#05070b` | 0.0791 | 0.0021 | **2.48:1** | **FAIL** (< 4.5:1) |
| `.insight-label` | **Current** | `#5ea7ff` @ $\alpha = 0.5$ | `#05070b` | 0.0919 | 0.0021 | **2.72:1** | **FAIL** (< 4.5:1) |
| `.insight p` | **Proposed** | `#bdc5d1` @ $\alpha = 1.0$ | `#05070b` | 0.5535 | 0.0021 | **11.59:1** | **PASS** (AAA) |
| `.insight .note` | **Proposed** | `#8d98aa` @ $\alpha = 1.0$ | `#05070b` | 0.3102 | 0.0021 | **6.92:1** | **PASS** (AA) |
| `.insight-label` | **Proposed** | `#5ea7ff` @ $\alpha = 1.0$ | `#05070b` | 0.3724 | 0.0021 | **8.11:1** | **PASS** (AAA) |
| `.insight p` | **Proposed** | `#bdc5d1` @ $\alpha = 1.0$ | `#10141c` | 0.5535 | 0.0069 | **10.60:1** | **PASS** (AAA) |
| `.insight .note` | **Proposed** | `#8d98aa` @ $\alpha = 1.0$ | `#10141c` | 0.3102 | 0.0069 | **6.33:1** | **PASS** (AA) |
| `.button:disabled` (dark) | **Current** | `#6e7888` | `#0e1118` (btn on abyss) | 0.1853 | 0.0056 | **4.23:1** | **FAIL** (< 4.5:1) |
| `.button:disabled` (dark) | **Current** | `#6e7888` | `#181d28` (btn on raised) | 0.1853 | 0.0123 | **3.78:1** | **FAIL** (< 4.5:1) |
| `.button:disabled` (dark) | **Proposed** | `#8d98aa` | `#0e1118` (btn on abyss) | 0.3102 | 0.0056 | **6.48:1** | **PASS** (AA) |
| `.button:disabled` (dark) | **Proposed** | `#8d98aa` | `#181d28` (btn on raised) | 0.3102 | 0.0123 | **5.79:1** | **PASS** (AA) |
| `.button:disabled` (light)| **Current** | `#7b8699` | `#f3f4f5` (btn on white) | 0.2356 | 0.9035 | **3.34:1** | **FAIL** (< 4.5:1) |
| `.button:disabled` (light)| **Proposed** | `#4f5c72` | `#f3f4f5` (btn on white) | 0.1053 | 0.9035 | **6.14:1** | **PASS** (AA) |
| `.code .c` | **Current** | `#66738a` | `#080b11` | 0.1692 | 0.0033 | **4.11:1** | **FAIL** (< 4.5:1) |
| `.code .c` | **Proposed** | `#8d9ab0` | `#080b11` | 0.3191 | 0.0033 | **6.92:1** | **PASS** (AA) |

---

### 5.3. Automated Executable Verification Script

Run this command directly in the repository root to verify all contrast ratios mathematically:

```bash
node -e '
function toRgb(color) {
  if (Array.isArray(color)) return color;
  const hex = color.replace("#", "");
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function sRGBtoLin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function relLuminance(rgb) {
  rgb = toRgb(rgb);
  return 0.2126 * sRGBtoLin(rgb[0]) + 0.7152 * sRGBtoLin(rgb[1]) + 0.0722 * sRGBtoLin(rgb[2]);
}
function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(rgb1);
  const l2 = relLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function blend(fg, bg, opacity) {
  const f = toRgb(fg);
  const b = toRgb(bg);
  return [
    Math.round(f[0] * opacity + b[0] * (1 - opacity)),
    Math.round(f[1] * opacity + b[1] * (1 - opacity)),
    Math.round(f[2] * opacity + b[2] * (1 - opacity))
  ];
}

const tests = [
  { name: ".insight p @ 1.0 on #05070b", fg: "#bdc5d1", bg: "#05070b", min: 4.5 },
  { name: ".insight .note @ 1.0 on #05070b", fg: "#8d98aa", bg: "#05070b", min: 4.5 },
  { name: ".insight label @ 1.0 on #05070b", fg: "#5ea7ff", bg: "#05070b", min: 4.5 },
  { name: ".button:disabled (#8d98aa) on abyss btn bg", fg: "#8d98aa", bg: blend("#94b2e6", "#05070b", 0.06), min: 4.5 },
  { name: ".button:disabled (#8d98aa) on raised btn bg", fg: "#8d98aa", bg: blend("#94b2e6", "#10141c", 0.06), min: 4.5 },
  { name: ".button:disabled light (#4f5c72) on light btn bg", fg: "#4f5c72", bg: blend("#0a1d3d", "#ffffff", 0.05), min: 4.5 },
  { name: ".code .c (#8d9ab0) on #080b11", fg: "#8d9ab0", bg: "#080b11", min: 4.5 },
];

let failed = 0;
for (const t of tests) {
  const cr = contrastRatio(t.fg, t.bg);
  const pass = cr >= t.min;
  console.log(`${pass ? "PASS" : "FAIL"}: ${t.name} -> ${cr.toFixed(2)}:1 (required >= ${t.min}:1)`);
  if (!pass) failed++;
}
if (failed > 0) process.exit(1);
console.log("\nAll Milestone 1 contrast requirements verified successfully!");
'
```

### 5.4. Stacking Context Layout Verification
To verify that pattern pseudo-elements are correctly isolated and never puncture text:
```bash
grep -n -A 15 "Reavaliação de design 2026-10 (RA3/F04)" assets/styles.css
```
**Invalidation conditions**:
- Any occurrence of `.insight { opacity: .5 }` remaining in `assets/styles.css`.
- Any occurrence of `.button:disabled` with `color: #6e7888`.
- Any occurrence of `.code .c` with `color: #66738a`.
- Absence of `.brazil-commitment { isolation: isolate; }` or `.brazil-commitment::before { z-index: -1; }` from the isolation section.
- Failure of `npm run validate` or `npm run stamp:check`.
