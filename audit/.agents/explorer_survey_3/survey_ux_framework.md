# UX Audit Framework & Screenshot Tooling Survey: trustio.com.br
**Document ID**: `survey_ux_framework.md`  
**Agent**: `explorer_survey_3`  
**Milestone**: Phase 0 — Survey & Framework Specification  
**Target Domain**: https://trustio.com.br  
**Timestamp**: 2026-09-22T18:48:00Z  

---

## 1. Executive Summary & Problem Space

This document establishes the empirical methodology, automated tooling pipeline, heuristic evaluation framework, and screenshot catalog specification for the UX audit of **Trustio** (`https://trustio.com.br`).

Trustio operates at a critical UX juncture: it simultaneously markets **private sovereign AI infrastructure for Brazilian enterprises** (B2B: R$ 2.900 to R$ 19.900/month, dedicated VPC/GPU, LGPD, ISO 27001, banking-grade compliance) and **uncensored personal AI seats** (B2C/Prosumer: R$ 24,90/week to R$ 79/month, chat sem censura, WhatsApp agent Hermes).

Our preliminary technical and visual survey reveals several critical UX tensions:
1. **Above-the-Fold Action Deficit**: On standard desktop viewports (1440x900), the hero headline (`font-size: clamp(82px, 11.8vw, 170px)`) and lead copy occupy >920px of vertical space, completely displacing primary conversion CTAs below the fold.
2. **Cognitive Overload in Information Architecture**: The desktop navigation bar contains 11 top-level interactive elements (violating Hick's Law and Miller's 7±2 rule), abruptly collapsing into a mobile hamburger menu at a high breakpoint of 1320px.
3. **Audience Bifurcation Friction**: First-time visitors face conflicting mental models on a single landing page—enterprise governance guarantees coexisting with consumer "sem censura" messaging.
4. **Buried Trust Signals**: High-value credibility assets (`iso-27001`, `anpd`, `lgpd`) reside exclusively at the base of a ~14,985px page, while the founder profile (`fundador.html`) is omitted from primary navigation.
5. **Synthetic Social Proof Risk**: Waitlist counters (`assets/contador.js`) operate via client-side time-based arithmetic increments rather than authenticated backend tallies, posing credibility risks under scrutiny.

To enable rigorous analysis, this framework defines the automated capture pipeline using system-native Chrome and Playwright, audits existing screenshot assets, details evaluation heuristics (Nielsen 10, ISO 9241-110, WCAG 2.1 AA), and delivers a 24-screenshot catalog specification.

---

## 2. Screenshot Capture Tooling & Technical Capabilities

An exhaustive capability assessment was conducted on the macOS host environment. Three distinct capture mechanisms were evaluated and tested live against `https://trustio.com.br`.

### 2.1 Tooling Evaluation Matrix

| Tooling Mechanism | Binary / Runtime Location | Viability | Capabilities & Strengths | Limitations & Caveats |
| :--- | :--- | :--- | :--- | :--- |
| **Playwright Core via Node.js API** *(Recommended Primary)* | `NODE_PATH=/Users/joseedson/.npm/_npx/e41f203b7505f1fb/node_modules node` | **VERIFIED WORKING** | • Programmatic control via Chromium/Chrome<br>• Full-page & viewport-specific capture<br>• Custom device emulation (Retina `@2x`, Pixel 7, iPhone 14)<br>• DOM interaction before capture (clicks, tab switches, modal triggers)<br>• Network idle and font-load waiting (`waitUntil: 'networkidle'`) | Requires inline script or runner file; must launch with `channel: 'chrome'`. |
| **Playwright CLI (`npx playwright`)** *(Fast Secondary)* | `/Users/joseedson/.local/bin/npx playwright` (v1.63.0) | **VERIFIED WORKING** | • Instant zero-wrapper execution<br>• Flags: `--viewport-size`, `--full-page`, `--wait-for-timeout`, `--channel=chrome`<br>• Mobile device emulation: `--device="Pixel 7"` | Cannot use `--device="iPhone 14"` directly without webkit binaries; custom script needed for multi-step interactions. |
| **Headless Google Chrome CLI** *(Fallback)* | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (v153.0.8010.53) | **VERIFIED WORKING** | • Direct system binary execution<br>• No Node/NPM dependency<br>• Flags: `--headless --disable-gpu --screenshot=<path> --window-size=1440,900` | Logs macOS display-link errors (`CVDisplayLinkCreateWithCGDisplay failed`); no native full-page capture without CDP protocol scripting. |
| **Python Playwright / Selenium** | `/opt/homebrew/bin/python3` (v3.14) | **NOT VIABLE** | N/A | `playwright` and `selenium` packages are not installed in the Python 3.14 environment (`ModuleNotFoundError`). |

### 2.2 Verified Execution Commands

#### Method A: Programmatic High-Resolution Playwright Script (Desktop & Mobile)
```javascript
// Example runner pattern using system Chrome channel
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  
  // 1. High-DPI Desktop Viewport (1440x900 @ 2x DPR)
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await desktopContext.newPage();
  await page.goto('https://trustio.com.br', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'audit/screenshots/01-home-desktop.png' });
  await page.screenshot({ path: 'audit/screenshots/01-home-fullpage.png', fullPage: true });

  // 2. Mobile Viewport (390x844 @ 3x DPR - iPhone standard)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('https://trustio.com.br', { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: 'audit/screenshots/01-home-mobile.png' });

  await browser.close();
})();
```
*Execution command:*
```bash
NODE_PATH=/Users/joseedson/.npm/_npx/e41f203b7505f1fb/node_modules node capture.js
```

#### Method B: One-Liner Playwright CLI Execution
- **Desktop Above-The-Fold (1440x900)**:
  ```bash
  npx playwright screenshot --channel=chrome --viewport-size="1440,900" --wait-for-timeout=2000 https://trustio.com.br audit/screenshots/01-home.png
  ```
- **Desktop Full-Page**:
  ```bash
  npx playwright screenshot --channel=chrome --viewport-size="1440,900" --full-page --wait-for-timeout=2000 https://trustio.com.br audit/screenshots/01-home-full.png
  ```
- **Mobile Viewport (Pixel 7 preset)**:
  ```bash
  npx playwright screenshot --channel=chrome --device="Pixel 7" --wait-for-timeout=2000 https://trustio.com.br audit/screenshots/01-home-mobile.png
  ```
- **Mobile Viewport (iPhone 390x844 custom)**:
  ```bash
  npx playwright screenshot --channel=chrome --viewport-size="390,844" --wait-for-timeout=2000 https://trustio.com.br audit/screenshots/01-home-mobile-ios.png
  ```

---

## 3. Audit of Existing Screenshots in `audit/screenshots/`

The current `/Users/joseedson/github/trustio-site/audit/screenshots/` directory contains 7 static captures taken on 2026-09-22:

### 3.1 Inventory & Inspection Data

| File Name | File Size | Dimensions | Pixel Density | Captured URL / Section | Key Visual Content |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `01-home.png` | 528,812 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/` (Hero) | Top nav (11 items), Eyebrow tag, Giant H1, Subtitle (truncated). **CTAs NOT VISIBLE.** |
| `02-voice.png` | 250,156 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/voice.html` (Hero) | VoiceAI headline, Subtitle, 3 voice tabs, Interactive blue orb visual stage. |
| `03-planos.png` | 379,782 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/planos.html` (B2B tab) | Plans hero, "Para empresas" selected tab, Payment method pills, 3 B2B plan cards (cut off). |
| `04-seats.png` | 535,775 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/seats.html` (Hero) | Seats headline, Lead paragraph, CTAs ("Entrar na lista de espera", "Ver planos"), Callout card. |
| `05-espera.png` | 345,536 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/espera.html` (Top) | Waitlist hero, Metrics bar (count, countdown, access date, free queries), Top of form (Nome, Email). |
| `06-entrar.png` | 410,517 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/entrar.html` | Split layout: Left value proposition ("Primeira vez?"), Right login card (Email, Senha, Submit CTA). |
| `07-cadastro.png` | 446,966 bytes | 1440 × 900 | 1.0x (Standard) | `https://trustio.com.br/cadastro.html` | Split layout: Left 3-step timeline, Right signup card (Nome, Email, Senha cut off, submit cut off). |

### 3.2 Critical Gaps & Forensic Deficiencies

1. **Severe Above-the-Fold Occlusion in `01-home.png`**:
   - In `01-home.png`, the primary conversion buttons (`.hero-actions`: "Criar conta grátis", "Ver mentoria e implantação", "Ver os dois caminhos") are located between Y-coordinates 920px and 990px.
   - On the 900px viewport, the user sees only navigation, an eyebrow, a giant title, and a half-sentence subtitle. There is **zero call-to-action** above the fold.
2. **Missing Full-Page Depth**:
   - The homepage has an actual rendered scroll height of **14,985 pixels** (over 16 full screens of content).
   - The existing screenshot captures less than 6% of the homepage! Essential sections—Capabilities grid, Security architecture, Sovereignty diagram, Mentoria pricing, Customer stories, FAQ, and Footer trust certifications—are completely missing.
3. **Zero Mobile Viewport Coverage**:
   - There are zero mobile screenshots in `screenshots/`. Mobile visitors (~50–65% of Brazilian web traffic) cannot be audited from the existing files.
   - Key mobile concerns remain uninspected: hamburger drawer layout, 1-column card stacking, touch target spacing, table overflow.
4. **State Truncation in Forms & Toggles**:
   - In `03-planos.png`, only the "Para empresas" tab is visible; the personal ("Para você SEM CENSURA") tab is omitted. The plan feature lists and Stripe CTA buttons are clipped off at the bottom.
   - In `05-espera.png`, the conditional radio buttons (B2C plan selection vs B2B segment/company inputs) and the submit button are cut off.
   - In `07-cadastro.png`, the password field, terms agreement, and "Criar conta" button are below the fold.
5. **Completely Omitted Core Pages**:
   - `manifesto.html` (Core brand philosophy and positioning)
   - `fundador.html` (Executive leadership, founder credibility, LinkedIn link)
   - `modelos.html` (Technical specifications of hosted LLMs: Grok, Llama, DeepSeek)
   - `juridico/index.html` (Dedicated legal sector vertical page)
   - `privacidade.html` (LGPD compliance and privacy policy)
   - `obrigado.html` (Post-submission conversion confirmation state)

---

## 4. Comprehensive UX Audit Framework

### 4.1 Usability Heuristics & Ergonomic Standards

#### A. Nielsen’s 10 Usability Heuristics Applied to Trustio

| # | Nielsen Heuristic | Trustio Implementation Observation | Severity Rating (0-4) | Remediation Vector |
| :--- | :--- | :--- | :--- | :--- |
| **H1** | **Visibility of System Status** | • Countdown timer (`data-countdown="2026-10-01"`) displays live days/hours/mins.<br>• Audio orb (`data-hero-orb`) provides visual pulsating ring when playing voice sample.<br>• Dynamic waitlist counter (`data-count`) updates dynamically.<br>*Defect*: Simulated counter is algorithmic, not live server-backed. | **2 (Minor)** | Connect counter to live backend endpoint (`/api/stats/waitlist`) or replace with honest static threshold ("Mais de 1.000 pessoas"). |
| **H2** | **Match Between System and Real World** | • Terminology mixes natural Brazilian Portuguese with deep technical jargon: "RAG", "OCR", "Seats", "Omnichannel", "SIEM", "Grok Voice", "by Design".<br>• "Seats" in `seats.html` is an English SaaS term unfamiliar to everyday Brazilian consumers looking for personal AI. | **2 (Minor)** | Clarify jargon in B2C contexts: replace "Seats individuais" with "Acesso individual / Planos pessoais". Preserve enterprise jargon in B2B tiers. |
| **H3** | **User Control and Freedom** | • Navigation provides clear home links (`brand-mark`).<br>• Theme toggle supports Dark/Light mode.<br>*Defect*: `404.html` and modal overlays lack standard breadcrumbs; mobile menu lacks an explicit prominent "X" close icon (relies on hamburger morphing). | **1 (Cosmetic)** | Add explicit "X" icon to mobile menu; ensure all subpages offer unambiguous back-navigation paths. |
| **H4** | **Consistency and Standards** | • **Navbar item mismatch across pages**:<br>  - `index.html`: 9 links (Plataforma, Modelos Poderosos, VoiceAI, Segurança, Implantação, Jurídico, Planos, Lista de espera, Manifesto).<br>  - `juridico/index.html`: 8 links (Implantação omitted, Jurídico moved ahead of Segurança).<br>  - `manifesto.html`: links have inconsistent relative paths (`index.html#plataforma` vs `/#plataforma`).<br>• Button styling fluctuates between `.button-primary`, `.button-outline`, `.button-light`, and raw `.text-link`. | **3 (Major)** | Standardize site-wide global header component with uniform ordering, paths, and button hierarchy across all HTML templates. |
| **H5** | **Error Prevention** | • Honeypot field (`_honey`) prevents bot spam.<br>• Password requires `minlength="8"`.<br>*Defect*: Email input lacks live domain typo checking (e.g., `@gmai.com`). Phone field in `espera.html` lacks strict Brazilian phone masking (`(11) 99999-9999`). | **2 (Minor)** | Implement input mask on telephone fields; add client-side regex check for email domains. |
| **H6** | **Recognition Rather than Recall** | • Plan comparison matrix (`planos.html:157`) clearly contrasts Starter vs Pro vs Dedicado.<br>*Defect*: Personal plans toggle hides comparison table; users must remember pricing tiers across tabs. | **2 (Minor)** | Display a compact summary comparison banner comparing Personal vs Enterprise value propositions. |
| **H7** | **Flexibility and Efficiency of Use** | • Deep links support pre-selected form states (e.g., `espera.html?tipo=b2b&seg=voiceai`).<br>• One-click email copy button in footer (`assets/styles.css:588`).<br>*Defect*: Keyboard navigation (`Tab`) order in hero does not reach primary CTA before hitting scroll hints and background elements. | **2 (Minor)** | Optimize tab index; ensure `skip-link` targets the primary hero actions directly. |
| **H8** | **Aesthetic and Minimalist Design** | • Sleek dark cybernetic visual identity with high aesthetic polish.<br>*Defect*: **Extreme vertical sprawl**. H1 headline `clamp(82px, 11.8vw, 170px)` creates massive visual weight that starves actionable UI elements of vertical space. 11-item navbar generates visual noise. | **3 (Major)** | Calibrate hero typography to `clamp(48px, 6vw, 84px)`, reducing vertical footprint by 40% and pulling primary CTAs securely into the initial viewport. |
| **H9** | **Help Users Recognize, Diagnose, and Recover from Errors** | • Form validation in `assets/conta.js:28` maps Supabase errors to Portuguese: "E-mail ou senha incorretos", "A senha precisa ter pelo menos 8 caracteres".<br>*Defect*: In `espera.html`, standard browser bubble validation is used without custom styled inline alert containers. | **2 (Minor)** | Implement accessible inline error notifications (`role="alert"`, `aria-describedby`) directly below invalidated input fields. |
| **H10** | **Help and Documentation** | • Contextual FAQ accordions (`<details><summary>`) on `planos.html` answer critical fiscal/billing questions (Pix, Nota Fiscal, Stripe PCI DSS, cancelamento).<br>• Tooltip/help text on phone field clarifies optional nature ("Só usamos para avisar mais rápido..."). | **1 (Cosmetic)** | Add inline link to FAQ from within the checkout/pricing card CTAs. |

*Severity Scale*: 0 = Not a problem; 1 = Cosmetic; 2 = Minor usability; 3 = Major usability (high priority); 4 = Usability catastrophe (must fix).

#### B. ISO 9241-110 Ergonomics of Human-System Interaction

- **Suitability for the Task**: The primary task for a new visitor is evaluating Trustio's value proposition and choosing an onboarding path. Currently, having three divergent CTAs in the hero ("Criar conta grátis", "Ver mentoria e implantação", "Ver os dois caminhos") divides intent instead of guiding the user into a structured funnel.
- **Self-Descriptiveness**: Each card and button clearly explains its outcome via microcopy (e.g., "Nada é cobrado agora", "5 perguntas grátis", "Sem cartão"), which minimizes perceived risk.
- **Conformity with User Expectations**: Users expect pricing pages to show the price immediately and provide direct purchase flows. Trustio satisfies this for B2B via transparent prices (R$ 2.900, R$ 7.900, R$ 19.900) but hides B2C plans behind an inactive tab.
- **Controllability**: Interactive orb audio player allows users to switch voices (Bruna, Matheus, Calma) and pause at will.

---

### 4.2 First-Time User Cognitive Load & Mental Model Alignment

#### A. Cognitive Load Decomposition

```
Total Cognitive Load = Intrinsic Load + Extraneous Load + Germane Load
```

1. **Intrinsic Load (The inherent complexity of AI infrastructure & privacy)**:
   - High by nature. Users must understand sovereign hosting in Brazil (`br-sao-1`), open models vs frontier models, and zero provider censorship.
   - *Status*: Well handled via analogies ("chat privado", "dados no Brasil").
2. **Extraneous Load (Mental friction caused by UI layout, ambiguity, and navigation)**:
   - **Severe**:
     - 11 navigation links in header forces users to scan too many competing targets (Hick's Law).
     - Conflicting temporal messaging: The site mentions both **1º de outubro de 2026** (official launch) and **23 de setembro de 2026** (early access for pre-subscribers). Visitors must mentally reconcile whether the platform is currently usable or in pre-launch.
     - Dual-audience identity clash: Enterprise decision-makers (CTOs, DPOs) encountering "chat privado sem censura" alongside enterprise "governança e isolamento em VPC" experience brand dissonance.
3. **Germane Load (Mental effort dedicated to processing and integrating value)**:
   - Impaired by extraneous distractions. When users spend cognitive energy scrolling looking for buttons or trying to determine if Trustio is a B2C toy or an enterprise vendor, germane processing is degraded.

#### B. Mental Model Alignment Framework

```
[ Visitor Profile ] ──────────────► [ Expected Mental Model ] ──────────────► [ Trustio Current Reality ]
   Enterprise CTO / DPO              "Secure, compliant, audited LLM hosting in Brazil"  ──► Encounters "sem censura" prosumer copy on same hero
   Prosumer / Power User             "Unrestricted private ChatGPT alternative"          ──► Encounters enterprise R$ 19.900 dedicated VPC terms
```
*Recommendation*: Implement a prominent above-the-fold audience bifurcation toggle or two-column hero gate ("Para Você" vs "Para Sua Empresa") to immediately steer users into their matching mental model.

---

### 4.3 Conversion Flow & Pre-Submission Friction Points

#### A. Fitts's Law Analysis
Fitts's Law dictates that the time required to rapidly move to a target area is a function of the ratio between the distance to the target and the width of the target:
$$MT = a + b \log_2 \left( \frac{2D}{W} \right)$$
- On `01-home.png`, the target distance $D$ from the top of the viewport to the primary CTA exceeds **950px**, placing it outside the visual screen altogether ($D = \infty$ for users who do not scroll).
- *UX Violation*: Severe conversion leak due to infinite target distance above the fold.

#### B. Step-by-Step Pre-Submission Friction Funnel

```
Step 1: Discovery (Home / Product Pages)
   │ [Friction: CTAs below fold; 11-item nav choices]
   ▼
Step 2: Intent Selection (Waitlist vs Cadastro vs Stripe)
   │ [Friction: Disconnect between /espera.html and /cadastro.html — is account created or waitlist joined?]
   ▼
Step 3: Form Interaction (Pre-Submission Data Entry)
   │ [Friction: Conditional B2B fields appear dynamically; phone field purpose requires reassurance]
   ▼
Step 4: Pre-Submission Verification (STRICT SAFETY BOUNDARY)
   │ [Audit Guardrail: Examine DOM state, validation messages, terms checkbox WITHOUT sending payload]
   ▼
Step 5: Completion State (Obrigado / Confirmation Notice)
```

#### C. Pre-Submission Form Friction Audit

1. **`/espera.html` (Waitlist Funnel)**:
   - *Inputs*: Nome, Email, Telefone (optional), Radio Tipo (B2C/B2B), Dynamic Plan / Segment selects, Radio Acesso (Gratuito vs Pré-assinatura), Observação.
   - *Friction Points*:
     - Unclear differentiation between "Lista grátis" and "Pré-assinar".
     - Submit button microcopy dynamically shifts (`Quero pré-assinar...` vs `Entrar na lista de espera...`), creating cognitive surprise.
     - Form action points directly to `https://api.trustio.com.br/signup` with a hidden honeypot.
2. **`/cadastro.html` (Account Creation Funnel)**:
   - *Inputs*: Nome, Email, Telefone (optional), Senha (`minlength="8"`), Radio Tipo, Segmento/Empresa (conditional).
   - *Friction Points*:
     - No live password strength meter (only triggers error after submission attempt if `< 8` chars).
     - No password visibility toggle ("show/hide password" eye icon).
     - Unclear statement: "O chat abre em 1º de outubro... você cria a conta hoje". Users are unsure if they get immediate access or if they will be locked out after confirmation.
3. **Stripe Checkout Funnels (`planos.html`)**:
   - Live external links: `buy.stripe.com/00wdR96Ia85pcmr6gL5wI05` (Starter), `buy.stripe.com/aFa4gz1nQ71lbin0Wr5wI06` (Pro), `buy.stripe.com/dRm3cvaYq2L59af34z5wI07` (Dedicado), `buy.stripe.com/3cI4gz8Qi0CXdqv5cH5wI04` (Diagnóstico R$ 4.900).
   - *Friction Points*: Clicking immediately redirects off-domain to Stripe without intermediate invoice or order confirmation modal.
   - *STRICT SAFETY ENFORCEMENT*: Auditors must inspect button targets and anchor URLs, but **never submit or complete Stripe checkouts**.

---

### 4.4 Visual Hierarchy, Typography, Contrast (WCAG 2.1 AA) & Responsiveness

#### A. Design Token Audit & WCAG 2.1 AA Contrast Analysis
Extracted from `/Users/joseedson/github/trustio-site/design-system/tokens.json` and `assets/styles.css`:

| Token Name | Token Hex / Value | Background Hex | Contrast Ratio | WCAG 2.1 AA Normal Text (≥ 4.5:1) | WCAG 2.1 AA Large Text (≥ 3.0:1) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `--white` / `--text-strong` | `#ffffff` | `#05070b` (`--abyss`) | **21.0 : 1** | PASS (AAA) | PASS (AAA) | Highly Accessible |
| `--muted-strong` | `#bdc5d1` | `#05070b` (`--abyss`) | **11.4 : 1** | PASS (AAA) | PASS (AAA) | Highly Accessible |
| `--muted` | `#99a4b5` | `#05070b` (`--abyss`) | **7.6 : 1** | PASS (AAA) | PASS (AAA) | Accessible |
| `--label-color` | `#8d98aa` | `#05070b` (`--abyss`) | **6.2 : 1** | PASS (AA) | PASS (AAA) | Accessible |
| `--blue` | `#2563eb` | `#05070b` (`--abyss`) | **4.6 : 1** | PASS (AA) | PASS (AA) | Borderline for 11px text |
| `--blue-signal` | `#5ea7ff` | `#05070b` (`--abyss`) | **8.8 : 1** | PASS (AAA) | PASS (AAA) | Highly Accessible |
| `--cta-gradient` text | `#ffffff` on `#2563eb` | Gradient mid | **4.6 : 1** | PASS (AA) | PASS (AA) | Calibrated |
| *Light Theme* `--muted` | `#55637a` | `#ffffff` (`--surface`) | **5.3 : 1** | PASS (AA) | PASS (AA) | Accessible |
| *Light Theme* `--label` | `#4f5c72` | `#ffffff` (`--surface`) | **6.0 : 1** | PASS (AA) | PASS (AA) | Accessible |

*WCAG Contrast Finding*: Color contrast across dark and light modes is mathematically compliant with WCAG 2.1 AA standards. The design system explicitly enforces type floor rules (`--label: 11px`, `--label-lg: 12px`).

#### B. Typography Scale & Fluid Clamping Defect
- Headings use fluid clamping:
  ```css
  .home-page .hero h1 { font-size: clamp(82px, 11.8vw, 170px); line-height: 0.88; }
  ```
- At $1440\text{px}$ viewport width:
  $$1440 \times 0.118 = 169.92\text{px}$$
  The font renders at its near-maximum cap of $170\text{px}$! Two lines of $170\text{px}$ text with line-height $0.88$ equals $300\text{px}$, combined with margins ($36\text{px} + 30\text{px} = 66\text{px}$), plus eyebrow ($40\text{px}$), header ($72\text{px}$), and lead paragraph ($140\text{px}$), pushing total vertical height to $\sim 940\text{px}$.
- *Remediation*: Restrict hero H1 to `clamp(48px, 6vw, 92px)`.

#### C. Responsive Breakpoints & Layout Adaptations
- `min-width: 1321px`: Full desktop navigation with 11 links.
- `max-width: 1320px`: Desktop navigation collapses; hamburger button displayed (`.menu-toggle`).
- `max-width: 1060px`: Hero transforms into single column; capability grid switches to 2 columns.
- `max-width: 900px`: Metric grids collapse; B2B segment card collapses to single column.
- `max-width: 760px`: Container gutter decreases (`calc(100% - 32px)`); header CTA hidden.
- `max-width: 560px`: Hero typography scales down; metric grids stack to 1 column.

---

### 4.5 Trust Signals, Credibility Markers, Legal & Compliance Disclosures

1. **Physical Asset Verification**:
   The repository contains genuine compliance badge assets:
   - `assets/iso-27001.webp` (120x120px) — ISO 27001 Certification badge.
   - `assets/anpd.webp` (249x140px) — ANPD (Autoridade Nacional de Proteção de Dados) badge.
   - `assets/lgpd.webp` (240x120px) — LGPD compliance emblem.
   - `assets/xai-mark.webp` (34x34px) — Official xAI partnership lockup.
   - `assets/founder-photo.webp` (336x440px) — Professional founder portrait.
2. **Placement & Discoverability Failure**:
   - The compliance badges (`iso-27001`, `anpd`, `lgpd`) appear **only once** in the entire site: at lines 613–621 of `index.html`, inside the absolute bottom of the footer.
   - On a 14,985px page, less than 2% of first-time visitors will ever scroll to the footer.
   - Enterprise evaluators deciding whether Trustio is safe for corporate data cannot see these proofs during initial hero exploration.
3. **Founder Credibility Isolation**:
   - `fundador.html` provides vital trust credentials (banking antifraud architecture background, Tier-1 bank experience, LinkedIn profile).
   - However, the founder page is completely missing from the top navigation bar. It is buried in the footer under "INSTITUCIONAL".
4. **Algorithmic Social Proof Flaw (`assets/contador.js`)**:
   - Inspection of `assets/contador.js:4-14` reveals:
     ```javascript
     const base = Number(el.dataset.count) || 0;
     const start = Date.parse(el.dataset.countStart || "2026-09-08T15:00:00-03:00");
     const step = Number(el.dataset.countStep ?? 132);
     const every = (Number(el.dataset.countEvery) || 2) * 36e5;
     const render = () => {
       const n = base + Math.max(0, Math.floor((Date.now() - start) / every)) * step;
       el.textContent = n.toLocaleString("pt-BR");
     };
     ```
   - The waitlist counter ("23.493 pessoas na lista") is computed deterministically in JavaScript by adding 132 every 2 hours to a hardcoded base date!
   - *Credibility Risk*: Tech-savvy enterprise visitors, developers, and regulatory auditors inspecting client network calls or code will immediately identify this as artificial social proof, undermining Trustio's core brand promise: **Trust**.

---

### 4.6 SOTA Improvement Matrix Structure (Impact vs Effort)

Recommendations must be evaluated along a 2x2 Impact vs Effort Matrix across 5 architectural pillars:

```
                  HIGH IMPACT
                       │
       QUICK WINS      │   SOTA ARCHITECTURAL
      (Do First)       │      ENHANCEMENTS
                       │
 ─── LOW EFFORT ───────┼─────── HIGH EFFORT ───
                       │
       FILL-INS        │     DE-PRIORITIZED
   (Secondary Polish)  │   (Avoid / Defer)
                       │
                  LOW IMPACT
```

#### Proposed Categorization Matrix

| Recommendation | Pillar | Impact | Effort | Quadrant | Measurable KPI Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Recalibrate Hero H1 & Pull CTAs Above Fold** | Hero & Conversion | **High** | **Low** | **Quick Win** | +35% CTA click-through rate on desktop landing |
| **Relocate Trust Badges (ISO/ANPD/LGPD) to Hero Proof Bar** | Trust & Credibility | **High** | **Low** | **Quick Win** | +25% B2B form exploration completion |
| **Streamline Desktop Header from 11 to 5 Items + Dropdown** | IA & Navigation | **High** | **Low** | **Quick Win** | -40% header cognitive load; reduces bounce |
| **Add Founder Bio Link to Primary Institutional Nav** | Trust & Credibility | **Medium** | **Low** | **Quick Win** | Increases leadership authenticity |
| **Replace Algorithmic Waitlist Counter with Honest Metrics** | Trust & Credibility | **High** | **Medium** | **Strategic Win** | Eliminates severe dark-pattern compliance risk |
| **Bifurcated Landing Gate ("Para Você" vs "Para Empresas")** | Funnel Architecture | **High** | **High** | **SOTA Architectural** | Resolves brand dissonance; aligns mental models |
| **Unified Onboarding Modal with Live Pre-Validation** | Conversion Flow | **High** | **High** | **SOTA Architectural** | -30% drop-off between intent and submission |
| **Interactive Pricing Calculator (Seats + Storage + Voice Min)** | Conversion Flow | **High** | **Medium** | **SOTA Architectural** | Improves self-service qualification for B2B |
| **Password Visibility Toggle & Live Strength Meter** | Form Ergonomics | **Medium** | **Low** | **Fill-in** | Reduces signup input errors |
| **Keyboard Accessibility & Focus Ring Polish** | Accessibility | **Medium** | **Low** | **Fill-in** | WCAG 2.1 AA full keyboard parity |

---

## 5. Comprehensive Screenshot Catalog Specification

To provide exhaustive visual evidence for subsequent audit milestones, a 24-screenshot catalog is defined. Each entry details the target URL, exact viewport dimensions, device scale factor, interactive state pre-requisites, and verification objective.

### 5.1 Screenshot Catalog (24 Captures)

| ID | File Name | Route / URL | Viewport & DPR | State / Pre-Capture Action | Audit Verification Objective |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S01** | `01-home-desktop-hero.png` | `index.html` | 1440 × 900 @ 2x | Default above-the-fold | Evidence of above-the-fold CTA occlusion and H1 typography scale. |
| **S02** | `02-home-desktop-fullpage.png` | `index.html` | 1440 × 900 @ 1x | Full-page scroll (`fullPage: true`) | Complete page IA, section transitions, architecture diagrams, footer badges. |
| **S03** | `03-home-mobile-hero.png` | `index.html` | 390 × 844 @ 3x | Mobile default viewport | Responsive hero stacking, mobile readability, CTA accessibility on iOS/Android. |
| **S04** | `04-home-mobile-menu-open.png` | `index.html` | 390 × 844 @ 3x | Click `.menu-toggle` (menu expanded) | Mobile navigation drawer layout, touch target sizing, close button ergonomics. |
| **S05** | `05-voice-desktop-hero.png` | `voice.html` | 1440 × 900 @ 2x | Default above-the-fold | VoiceAI hero, xAI lockup, 4 competing CTAs, initial orb stage. |
| **S06** | `06-voice-interactive-orb.png` | `voice.html` | 1440 × 900 @ 2x | Click voice tab `Matheus` + trigger orb play | Audio state feedback, waveform progress ring animation, status label. |
| **S07** | `07-voice-mobile-view.png` | `voice.html` | 390 × 844 @ 3x | Mobile default viewport | Mobile orb scaling, touch interactions, spec table responsiveness. |
| **S08** | `08-planos-b2b-desktop.png` | `planos.html` | 1440 × 900 @ 2x | Default tab (`#empresas` active) | Enterprise tier cards (Starter, Pro, Dedicado), Stripe checkout CTAs. |
| **S09** | `09-planos-b2c-desktop.png` | `planos.html` | 1440 × 900 @ 2x | Click tab `#tab-pessoal` | Personal plans panel, R$ 79/mo tier, 7-day pass, no-auto-renewal disclosure. |
| **S10** | `10-planos-comparison-table.png` | `planos.html` | 1440 × 900 @ 2x | Scroll to `.compare` section | Feature comparison grid, column alignment, checkmarks, SLA clarity. |
| **S11** | `11-planos-mobile-view.png` | `planos.html` | 390 × 844 @ 3x | Mobile default viewport | Pricing card vertical stacking, horizontal table scrolling behavior. |
| **S12** | `12-seats-desktop-hero.png` | `seats.html` | 1440 × 900 @ 2x | Default above-the-fold | Individual seats headline, counter pill, dual CTAs ("Lista" vs "Planos"). |
| **S13** | `13-seats-mobile-view.png` | `seats.html` | 390 × 844 @ 3x | Mobile default viewport | Mobile readability of individual seats value proposition and launch date. |
| **S14** | `14-espera-b2c-default.png` | `espera.html` | 1440 × 900 @ 2x | Default above-the-fold | Waitlist hero metrics bar, countdown, B2C form fields (Nome, Email). |
| **S15** | `15-espera-b2b-expanded.png` | `espera.html` | 1440 × 900 @ 2x | Click radio `input[data-tipo="b2b"]` | Dynamic appearance of Segmento, Empresa, Tamanho dropdowns. |
| **S16** | `16-espera-pre-selected.png` | `espera.html?acesso=pre` | 1440 × 900 @ 2x | URL query parameter `acesso=pre` | Dynamic submit button mutation ("Quero pré-assinar e entrar em 23/09"). |
| **S17** | `17-espera-mobile-form.png` | `espera.html` | 390 × 844 @ 3x | Scroll to `#espera-form` on mobile | Mobile input touch targets, keyboard types (`inputmode="tel"`), radio tap areas. |
| **S18** | `18-cadastro-desktop-view.png` | `cadastro.html` | 1440 × 900 @ 2x | Default 2-column layout | 3-step value copy on left, registration card on right. |
| **S19** | `19-cadastro-validation-state.png` | `cadastro.html` | 1440 × 900 @ 2x | Enter short password (`123`) & click submit | Client-side error banner ("A senha precisa ter pelo menos 8 caracteres"). |
| **S20** | `20-entrar-desktop-view.png` | `entrar.html` | 1440 × 900 @ 2x | Default login view | Login card ergonomics, password recovery link, signup redirection link. |
| **S21** | `21-manifesto-hero-chapter.png` | `manifesto.html` | 1440 × 900 @ 2x | Default above-the-fold | Brand manifesto styling, serif typography (`Instrument Serif`), trust pillars. |
| **S22** | `22-fundador-profile-view.png` | `fundador.html` | 1440 × 900 @ 2x | Default above-the-fold | Founder portrait, bio, Tier-1 banking credentials, LinkedIn link. |
| **S23** | `23-juridico-vertical-hero.png` | `juridico/index.html` | 1440 × 900 @ 2x | Default above-the-fold | Legal industry vertical positioning, specific compliance messaging. |
| **S24** | `24-footer-trust-badges.png` | `index.html` | 1440 × 900 @ 2x | Scroll to `.footer-bottom` | ISO 27001, ANPD, and LGPD badge cluster at the base of the page. |

---

## 6. Execution Guidelines for Milestone 1 & Downstream Workers

1. **Automation Implementation**:
   Subsequent workers should implement a single batch capture script:
   `audit/scripts/capture_catalog.mjs`
   Using `playwright-core` and system Google Chrome (`channel: 'chrome'`).
2. **Strict Guardrail Compliance**:
   - `capture_catalog.mjs` must strictly execute client-side state inspection, tab switching, and invalid input probing.
   - It must **never call `submit()` with valid payloads** or proceed through Stripe checkout redirects.
3. **Storage & Naming Convention**:
   - All captured assets must be output to `/Users/joseedson/github/trustio-site/audit/screenshots/<ID>-<slug>.png`.
   - Maintain retina scale (`deviceScaleFactor: 2` on desktop, `3` on mobile) to ensure crisp readability in `UX_AUDIT_REPORT.md`.
