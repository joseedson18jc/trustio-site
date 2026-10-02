# Handoff Report: Survey Explorer 1 — Pages, Navigation & UI Structure

**Agent:** Survey Explorer 1 (`explorer_survey_1`)  
**Date:** 2026-10-02  
**Milestone:** Discovery & Architectural Survey  
**Target File:** `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_1/handoff.md`  
**Handoff Type:** Hard (Survey Complete)

---

## 1. Observation

### 1.1 Complete Platform Page Catalog (12 Canonical Pages + 2 Supplementary)

Inspection of `audit/lighthouse/`, `audit/scripts/discovery.mjs:10`, `sitemap.xml`, and the repository root confirms the 12 canonical platform pages and 2 supplementary public routes:

| # | Route | Local File Path | Page Type / Purpose | Header Structure | Hero CTAs Count | Mobile Drawer | FAB Present |
|---|-------|-----------------|---------------------|------------------|-----------------|---------------|-------------|
| 1 | `/` | `index.html` | Platform Home / Landing | 8 links + 3 badges + 4 actions | 3 CTAs (1 primary, 1 ghost, 1 link) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 2 | `/juridico/` | `juridico/index.html` | Legal Vertical Landing | 7 links + 3 badges + 4 actions | 2 CTAs (1 primary, 1 link) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 3 | `/modelos.html` | `modelos.html` | Model Showcase & Catalog | 8 links + 3 badges + 4 actions | 2 CTAs (1 primary, 1 link) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 4 | `/manifesto.html` | `manifesto.html` | Brand Manifesto / Principles | 8 links + 3 badges + 4 actions | 0 CTAs (editorial) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 5 | `/fundador.html` | `fundador.html` | Founder Background & Bio | 8 links + 3 badges + 4 actions | 2 CTAs (1 primary, 1 link, both ext) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 6 | `/voice.html` | `voice.html` | VoiceAI Product Deep-Dive | 8 links + 3 badges + 4 actions | 4 CTAs (2 buttons, 1 link + 1 stage) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 7 | `/planos.html` | `planos.html` | Pricing & Checkout Gateway | 8 links + 3 badges + 4 actions | 0 in hero (4 tier cards below) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 8 | `/espera.html` | `espera.html` | Lead Consultation & Intake | 8 links + 3 badges + 4 actions | 0 in hero (1 submit in form below) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 9 | `/cadastro` | `cadastro.html` | Free Account Creation | 8 links + 3 badges + 4 actions | 0 in hero (1 submit in form below) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 10 | `/entrar.html` | `entrar.html` | User Login & Auth Portal | 8 links + 3 badges + 4 actions | 0 in hero (1 submit in card below) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 11 | `/privacidade.html` | `privacidade.html` | Privacy Policy / LGPD | 8 links + 3 badges + 4 actions | 0 CTAs (legal text) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| 12 | `/seats.html` | `seats.html` | Individual Seat Allocation | 8 links + 3 badges + 4 actions | 3 CTAs (1 primary, 2 links) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| *13* | `/agentio.html` | `agentio.html` | *Supplementary: Agentio / Hermes* | 8 links (titles) + 4 actions | 2 CTAs (1 primary, 1 outline) | Yes (`.mobile-nav`) | Yes (`.wa-float`) |
| *14* | `/ia-sem-censura.html` | `ia-sem-censura.html` | *Supplementary: Uncensored AI Guide* | Divergent `.hdr` (8 links + subnav) | 3 CTAs (1 primary, 1 ghost, 1 link) | Divergent (`.mnav`) | Yes (`.wa-float`) |

---

### 1.2 Desktop Header Bar Congestion & Breakpoint Distortions

Direct inspection of `index.html` lines 110–139 and `assets/styles.css` reveals acute congestion:

1. **Constituent Elements in Desktop Header (`.header-inner`):**
   - Brand lockup: `a.brand` with 34px SVG mark + "Trustio" wordmark (`index.html:112-115`).
   - 8 primary navigation anchors inside `.desktop-nav` (`index.html:117-126`):
     - `a[href="#plataforma"]` ("Plataforma")
     - `a[href="voice.html"].nav-voice` ("VoiceAI") + `<small>powered by xAI</small>`
     - `a[href="agentio.html"].nav-agentio` ("Agentio") + `<small>by</small><span class="nav-nous"></span>`
     - `a[href="ia-sem-censura.html"].nav-ia` ("IA sem censura") + `<small>novo</small>`
     - `a[href="#seguranca"]` ("Segurança")
     - `a[href="#implantacao"]` ("Implantação")
     - `a[href="planos.html"]` ("Planos")
     - `a[href="manifesto.html"]` ("Manifesto")
   - 4 utility and action controls:
     - `a.header-login` ("Entrar") (`index.html:128`)
     - `a.header-cta` (`button button-small button-ghost` "Falar com a Trustio") (`index.html:129`)
     - `a.lang-switch` (PT/EN toggle button) (`index.html:131`)
     - `button.theme-toggle` (Light/Dark toggle) (`index.html:132-135`)
     - `button.menu-toggle` (Mobile hamburger toggle) (`index.html:136-138`)

2. **Total Element Count:**
   - 12 visible interactive items on desktop (1 brand + 8 nav links + 1 login + 1 CTA + 1 language switch + 1 theme toggle).
   - Width requirement: The codebase author documents verbatim in `assets/styles.css:1933-1937`:
     ```css
     /* Cabeçalho: oito itens (com os pares VoiceAI, Agentio e IA sem censura) + Entrar + CTA + idioma
        + tema precisam de ~1470px. A faixa do cabeçalho cresce até 1520px (1600px em telas largas), mais
        larga que o container de conteúdo; entre 1301px e 1539px o CTA do cabeçalho sai (o contato
        continua na página) e o menu aperta um pouco; abaixo de 1301px, o menu hambúrguer assume
        (breakpoint espelhado em app.js). */
     ```

3. **Anomalous Responsive Workarounds:**
   - In `assets/styles.css:1944-1948`, between **1301px and 1539px**, `.header-cta` is forcibly suppressed (`display: none;`) to keep the nav on one line.
   - At **1300px** (`@media (max-width: 1300px)` in `assets/styles.css:1956-1963`), `.desktop-nav` is hidden entirely, forcing standard laptop viewports (1024px–1280px) into the mobile hamburger menu prematurely.

---

### 1.3 Mobile Navigation Drawer & A11y Status

Direct inspection of `assets/app.js:10-56`, `assets/styles.css:552-602`, and the HTML templates reveals the following mobile navigation state:

1. **DOM Structure:**
   - Trigger: `<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Abrir menu"><span></span><span></span></button>`.
   - Drawer container: `<nav class="mobile-nav" id="mobile-menu" aria-label="Navegação para dispositivos móveis" hidden>`.
   - Contains all 8–10 links stacked vertically (`font-size: 21.5px`, `padding: 18px 4px`, border-bottom divider).

2. **Touch-Target Sizing Measurements:**
   - Trigger `.menu-toggle`:
     `assets/styles.css:554-555`: `width: 44px; height: 44px;` (**FAILS** the $\ge 48\text{px}$ touch-target mandate).
   - Header control `.theme-toggle`:
     `assets/styles.css:228-229`: `width: 44px; height: 44px;` (**FAILS** the $\ge 48\text{px}$ mandate).
   - Header control `.lang-switch`:
     `assets/styles.css:2831`: `width: 44px; padding: 0;`; topbar `.lang-switch` is `height: 34px` (`assets/styles.css:2838`) (**FAILS** the $\ge 48\text{px}$ mandate).
   - Drawer links `.mobile-nav a`:
     `assets/styles.css:594`: `padding: 18px var(--space-4); font-size: 21.5px;`. Total height is $\approx 18 + 26 + 18 = 62\text{px}$ (**PASSES** $\ge 48\text{px}$).

3. **ARIA & Keyboard Focus Trapping:**
   - ARIA attributes: `.menu-toggle` correctly toggles `aria-expanded="true|false"` and `aria-label="Abrir menu|Fechar menu"` (`assets/app.js:25-26, 41-42`).
   - Focus initiation: `mobileMenu.querySelector("a, button")?.focus()` focuses the first link upon opening (`assets/app.js:47`).
   - Escape key: `document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(true); })` (`assets/app.js:82-84`).
   - **Critical Focus Trap Defect:**
     - The background disabling function is: `const contentBehindMenu = () => document.querySelectorAll("main, footer")` (`assets/app.js:19`).
     - Only `main` and `footer` receive `inert = true`.
     - The `<header>` element itself is **NOT inert** and contains `.brand`, `.header-login`, `.lang-switch`, `.theme-toggle`, and `.menu-toggle` preceding `#mobile-menu` in the DOM order.
     - When tabbing backward (`Shift+Tab`) from the top drawer link, focus escapes into `.menu-toggle`, `.theme-toggle`, `.lang-switch`, and `.brand`.
     - When tabbing forward (`Tab`) past the last drawer link ("Entrar"), focus escapes the document and jumps to browser chrome.
     - `#mobile-menu` lacks `role="dialog"` and `aria-modal="true"`.

---

### 1.4 Hero Section Analysis: Primary vs. Secondary CTAs

Inspection of the hero sections across all 12 platform pages:

| Page | Hero Selector | Heading / Kicker | Primary CTA | Secondary / Ghost CTAs | Tertiary / Text Links | Hero CTA Count | Compliance with R3 (1 Primary CTA) |
|---|---|---|---|---|---|---|---|
| `index.html` | `.hero.section-shell` | "IA pessoal e empresarial. Sob seu controle." | `button-primary`: "Criar conta grátis" (`cadastro.html`) | `button-ghost`: "Ver mentoria e implantação" (`#mentoria`) | `text-link`: "Ver os dois caminhos" (`#para-quem`) | **3** | **VIOLATION**: 2 buttons competing |
| `juridico/index.html` | `.legal-hero.section-shell` | "IA jurídica. Sob seu controle." | `button-primary`: "Planejar uma implantação jurídica" (`#contato`) | None | `text-link`: "Ver como funciona" (`#como-funciona`) | **2** | Pass (1 primary button + 1 inline guide link) |
| `modelos.html` | `.models-hero.section-shell` | "Modelos Poderosos" | `button-primary`: "Ver os modelos" (`#fronteira`) | None | `text-link`: "Como a API funciona" (`index.html#api`) | **2** | Pass (1 primary button + 1 link) |
| `manifesto.html` | `.manifesto-hero.section-shell` | "Manifesto" | None (Editorial paper) | None | None | **0** | Pass (Editorial reader flow) |
| `fundador.html` | `.founder-hero.section-shell` | "José Edson da Costa" | `button-primary`: "LinkedIn" (external) | None | `text-link`: "Portfólio" (external) | **2** | Pass (1 primary button + 1 link) |
| `voice.html` | `.voice-hero.section-shell` | "Agentes que resolvem de verdade..." | `button-primary`: "Abrir o Agent Builder" (`console/`) | `button-outline`: "Ouvir o agente" (`#demo`); Stage `button-outline`: "Criar um agente assim" (`console/`) | `text-link`: "Solicitar implantação do VoiceAI" (`espera.html`) | **4** | **VIOLATION**: 3 buttons + 1 link in hero grid |
| `planos.html` | `.plans-hero.section-shell` | "Infraestrutura privada de IA. Contratada em minutos." | Segment tabs: "Para empresas" vs "Para você" | None in hero container; 4 pricing card buttons immediately below | None | **0** in hero | Pass (Segment controller above pricing matrix) |
| `espera.html` | `.plans-hero.section-shell` | "Comece a usar a Trustio..." | None in hero; Form submit: "Solicitar contato" (`#espera-form`) | None | Inline link: "Criar conta agora" (`cadastro.html`) | **0** in hero | Pass (Lead form container) |
| `cadastro.html` | `.plans-hero.conta-hero` | "Crie sua conta agora..." | None in hero; Form submit: "Criar conta e receber o link" | None | Inline link: "Ver planos" (`planos.html#pessoal`) | **0** in hero | Pass (Single conversion funnel) |
| `entrar.html` | `.plans-hero.conta-hero` | "Entrar. Você cai direto no seu portal." | None in hero; Form submit: "Entrar no chat" | None | Links: "Esqueci a senha", "Criar conta" | **0** in hero | Pass (Login funnel) |
| `privacidade.html` | `.legal-hero` | "Como tratamos os seus dados..." | None | None | None | **0** | Pass (Legal documentation) |
| `seats.html` | `.seats-banner.section-shell` | "IA privada e sem censura*..." | `button-primary`: "Criar conta grátis" (`cadastro.html`) | None | 2 `text-link`: "Ver planos e preços", "Preciso de ajuda..." | **3** | Borderline: 1 primary button + 2 text links |
| *`agentio.html`* | `.ag-hero.section-shell` | "Um agente que faz por você..." | `button-primary`: "Testar 3 dias no WhatsApp" (`app/`) | `button-outline`: "Ver planos do Agentio" (`planos.html#agentio`) | None | **2** | Borderline: 2 buttons |
| *`ia-sem-censura.html`* | `.hero#topo` | "IA sem censura. Não é IA sem regras." | `btn-primary`: "Criar conta grátis" (`cadastro.html`) | `btn-ghost`: "Ver o caminho de uma pergunta" (`#como-funciona`) | `tlink`: "Ver planos" (`#planos`) | **3** | **VIOLATION**: 2 buttons + 1 link |

---

### 1.5 WhatsApp Floating Action Button (FAB) Implementation & Collisions

1. **Implementation & Styling:**
   - File: `assets/whatsapp-suporte.css:5-39`.
   - Tag: `<a class="wa-float" href="https://wa.me/5512982689849" target="_blank" rel="noopener" aria-label="Suporte 24/7 pelo WhatsApp: +55 12 98268-9849" title="Suporte 24/7 pelo WhatsApp">`.
   - Positioning:
     ```css
     .wa-float {
       position: fixed;
       z-index: 90;
       right: max(18px, env(safe-area-inset-right));
       bottom: max(18px, env(safe-area-inset-bottom));
       min-width: 56px;
       height: 56px;
       padding: 0 16px;
       border-radius: 999px;
       background: #15803d; /* 5:1 contrast */
       box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18);
     }
     @media (max-width: 719px) {
       .wa-float { width: 56px; padding: 0; }
       .wa-float-texto { display: none; }
     }
     ```
2. **Observed Collision Points:**
   - **`cadastro.html` & `entrar.html`:**
     In viewports $\le 768\text{px}$ (and on short screens $\le 800\text{px}$ height), the form card (`.conta-card`) occupies the lower right quadrant. The `.wa-float` button (56px circle + 28px shadow blur) overlaps input fields (e.g. `#c-tel`, `#c-senha`), the submit button, or the password recovery links.
     *Confirmed by `audit/REAVALIACAO-DESIGN-2026-10.md:63-65` (F06): "grok viu sobre o campo de e-mail em Cadastro".*
   - **`planos.html`:**
     In single-column mobile view and 3-column desktop viewports below 1200px height, `.wa-float` hovers directly over the price and CTA button of the rightmost card (Dedicado R$ 19.900/mês or Diagnóstico R$ 4.900).
   - **`espera.html`:**
     Overlays the radio option groups in `#espera-form` and the submit button when scrolled to the form foot.
   - **All Pages (Footer Collision):**
     When scrolling to the page bottom, `.wa-float` hovers over `.footer-legal` address lines and social media links.
   - **Violation of R3 Acceptance Criteria:**
     "Floating Action Buttons (FAB) maintain minimum 16px clearance from input fields and card boundaries across all screen sizes."
     Current clearance: **0px (direct physical overlap)**.

---

### 1.6 Partner Badges: Display, Styling & Noise

1. **Header Navigation Badges:**
   - `assets/styles.css:2294-2306`:
     - `.nav-voice small`: `font-family: var(--mono); font-size: var(--label); letter-spacing: .1em; text-transform: uppercase; color: var(--blue-signal); margin-left: 6px;` -> Displays `<small>powered by xAI</small>`.
     - `.nav-agentio`: `<small>by</small><span class="nav-nous" role="img" aria-label="Nous Research"></span>` -> Embeds a 22px mask image `nous-research.webp`.
     - `.nav-ia small`: `font-family: var(--mono); font-size: var(--label); color: var(--blue-signal);` -> Displays `<small>novo</small>`.
   - **UX Impact:** Inlines three distinct secondary vendor tags directly inside top-level menu items. This triples the visual scanning weight and adds $\approx 180\text{px}$ of unnecessary horizontal width to the header.

2. **In-Page Partner Badges:**
   - `voice.html:94, 105-108`: `.xspace-lockup` with `powered by xAI` and `.tech-vendor` lockup featuring `assets/xai-mark.png` (34x34px).
   - `agentio.html:91`: `.ag-lockup` with `Agentio by Nous Research`.
   - `index.html:719-726` (and all other footers): `.iso-badge` with `assets/iso-27001.webp` (120x120px) and `assets/lgpd.webp` (240x120px).
     - Styling: `assets/styles.css:1719-1725`: `height: 44px; filter: brightness(0) invert(0.72); opacity: 0.55;`. Harmonious monochrome treatment.

---

### 1.7 Touch Targets & Collision Vulnerability Audit

Inspection of touch-target dimensions across the platform reveals systematic sub-48px violations:

| Component / Selector | Current Dimensions | Target Requirement | Pass / Fail | File Location |
|---|---|---|---|---|
| `.menu-toggle` (Header hamburger) | $44\text{px} \times 44\text{px}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:554-555` |
| `.theme-toggle` (Theme switch) | $44\text{px} \times 44\text{px}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:228-229` |
| `.lang-switch` (Mobile viewport) | $44\text{px} \text{ width} \times 34\text{px} \text{ height}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:2831, 2838` |
| `.button-small` (Header CTA / cards) | $\text{min-height: } 44\text{px}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:2936` |
| `.lead-pick label` (Form radio pills) | $\text{padding: } 11\text{px } 14\text{px} (\text{height } \approx 42\text{px})$ | $\ge 48\text{px}$ | **FAIL** | `assets/planos.css:83` |
| `.footer-links a` (Footer nav) | $\text{min-height: } 24\text{px}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:1431` |
| `.footer-social a` (Footer social) | $\text{min-height: } 24\text{px}$ | $\ge 48\text{px}$ | **FAIL** | `assets/styles.css:2844` |
| `.copy-email` (Contact email copy) | $\text{min-height: } 50\text{px}, \text{min-width: } 44\text{px}$ | $\ge 48\text{px}$ | Borderline (width $44\text{px}$) | `assets/styles.css:1395` |
| `ia-sem-censura .round` (Buttons) | $44\text{px} \times 44\text{px}$ ($40\text{px}$ at $\le 380\text{px}$) | $\ge 48\text{px}$ | **FAIL** | `assets/ia-sem-censura.css:143, 154` |
| `ia-sem-censura .sub-links a` | $\text{padding: } 6\text{px } 12\text{px} (\text{height } \approx 30\text{px})$ | $\ge 48\text{px}$ | **FAIL** | `assets/ia-sem-censura.css:138` |
| `.mobile-nav a` (Drawer links) | $\text{padding: } 18\text{px } 4\text{px} (\text{height } \approx 62\text{px})$ | $\ge 48\text{px}$ | **PASS** | `assets/styles.css:594` |
| `.hero-actions > .button` | $\text{min-height: } 56\text{px}$ | $\ge 48\text{px}$ | **PASS** | `assets/styles.css:2942` |
| `.lead-form input[type=text/email]` | $\text{min-height: } 50\text{px}$ | $\ge 48\text{px}$ | **PASS** | `assets/planos.css:76, 108` |

---

## 2. Logic Chain

1. **From Observation 1.2 (Header Congestion) to Root Cause:**
   - Observation: 12 discrete interactive elements inside `.header-inner` demand $\sim 1470\text{px}$ width.
   - Consequence: To prevent horizontal wrapping, authors introduced artificial CSS hacks: hiding `.header-cta` between 1301px–1539px and triggering `.desktop-nav { display: none; }` at 1300px.
   - Inference: Standard laptop screens (1024px–1280px) are deprived of desktop navigation despite having ample screen real estate. Downstream refactoring must reduce the primary desktop nav to $\le 5$ top-level items, allowing the desktop nav to comfortably fit within 1024px+ viewports without dropping the header CTA.

2. **From Observation 1.3 (Mobile Navigation Deficiencies) to Accessibility Remediation:**
   - Observation: `contentBehindMenu()` only sets `inert = true` on `main` and `footer`. Elements in `<header>` preceding `#mobile-menu` remain active and focusable in the tab sequence. There is no `keydown` cycle trap, and `#mobile-menu` lacks modal ARIA roles.
   - Consequence: Keyboard and screen-reader users experience focus leakage into the background header chrome and browser address bar.
   - Inference: Downstream refactoring must upgrade `#mobile-menu` into a true modal dialog (`role="dialog"`, `aria-modal="true"`), add an active keydown focus-trap handler (cycling focus between the close button and drawer links), and expand `.menu-toggle`, `.theme-toggle`, and `.lang-switch` to $\ge 48\text{px}$.

3. **From Observation 1.4 (Hero Section CTAs) to Conversion Consolidation:**
   - Observation: `index.html` offers 3 actions (2 buttons + 1 link), `voice.html` offers 4 actions (3 buttons + 1 link), and `ia-sem-censura.html` offers 3 actions.
   - Consequence: Visitors face choice overload (Hick's Law), dividing conversion momentum between "Criar conta grátis", "Ver mentoria", and "Ver os dois caminhos".
   - Inference: Aligned with Requirement R3, each hero must establish exactly **one primary CTA button** (e.g., "Criar conta grátis" on Home, "Abrir o Agent Builder" on VoiceAI), with secondary options represented solely by a single lightweight inline text-link.

4. **From Observation 1.5 (WhatsApp FAB Collisions) to Layout Guardrails:**
   - Observation: `.wa-float` has `position: fixed; bottom: 18px; right: 18px; z-index: 90;` across all pages with zero layout clearance. In `cadastro.html`, `entrar.html`, `espera.html`, and `planos.html`, it directly covers inputs, submit buttons, and card content.
   - Consequence: Users on mobile and short desktop viewports suffer tap jamming, accidental WhatsApp launches, or inability to click submit buttons.
   - Inference: The FAB requires dynamic or structural clearance: either reserving padding-bottom on card/form containers, concealing the FAB until after initial scroll, or docking it as a static header/footer element on transactional form pages.

5. **From Observation 1.6 & 1.7 (Partner Badges & Touch Targets) to Visual Polish:**
   - Observation: 3 inline text badges in the header clutter typography and inflate width. Multiple interactive controls (`.menu-toggle`, `.theme-toggle`, `.lang-switch`, `.button-small`, `.lead-pick label`, `.footer-links a`) measure $24\text{px}$–$44\text{px}$ in height.
   - Consequence: WCAG 2.5.5 / 2.5.8 touch target failures and visual distraction.
   - Inference: Partner badges should be moved to subtle tooltips, title attributes, or dedicated in-page partner rows. All interactive targets must be padded or scaled to minimum $48\text{px} \times 48\text{px}$ clickable bounding boxes.

---

## 3. Caveats

1. **Read-Only Scope:** This investigation is strictly diagnostic. No HTML, CSS, or JS files were modified.
2. **Canonical vs. Supplementary Pages:** While the brief specifies "all 12 platform pages", the codebase contains 14 relevant public pages. To ensure complete architectural integrity, both `agentio.html` and `ia-sem-censura.html` were audited alongside the 12 canonical pages.
3. **Internal Tools Excluded:** Internal administrative/operator pages (`admin/`, `crm/`, `console/`, `app/`) and test checkout mocks (`planos-teste.html`) were not included in public platform responsiveness scope, per `scripts/i18n.mjs:28-30`.

---

## 4. Conclusion

The Trustio platform exhibits robust foundational visual styling and high-contrast typography, but suffers from two significant structural UX flaws:

1. **Header Congestion & Breakpoint Prematurity:** The desktop header carries 12 distinct interactive elements and 3 partner badges, forcing an uncharacteristically high mobile breakpoint ($1300\text{px}$) and suppression of primary CTAs on laptops.
2. **Interactive Target & Boundary Collisions:** Mobile navigation lacks true keyboard focus trapping; header toggles and footer links measure $24\text{px}$–$44\text{px}$ (failing the $48\text{px}$ requirement); and the WhatsApp FAB creates direct physical collisions with form inputs and card boundaries on `cadastro.html`, `entrar.html`, `espera.html`, and `planos.html`.

### Concrete Architectural Recommendations for Implementers:
1. **Condense Desktop Header to 5 Primary Items:**
   - Recommended top-level items: `Plataforma`, `VoiceAI`, `Modelos`, `Planos`, `Jurídico`.
   - Consolidate sub-pages: Move `Manifesto` and `Fundador` exclusively to the footer. Convert `Segurança` and `Implantação` into anchor links within a clean dropdown or keep them within the home structure.
   - Remove `<small>` partner badges from nav links; replace with clean tooltip or sub-text.
   - Lower desktop breakpoint from $1300\text{px}$ to $1024\text{px}$.
2. **Upgrade Mobile Drawer (`mobile-nav`):**
   - Add `role="dialog"` and `aria-modal="true"` to `#mobile-menu`.
   - Implement true bidirectional focus trap in `assets/app.js` (intercepting `Tab` on last item and `Shift+Tab` on close button).
   - Enforce minimum $48\text{px} \times 48\text{px}$ tap targets for `.menu-toggle`, `.theme-toggle`, and `.lang-switch`.
3. **Enforce Single Primary CTA per Hero:**
   - Standardize `index.html` to 1 primary button ("Criar conta grátis") + 1 secondary text-link.
   - Standardize `voice.html` to 1 primary button ("Abrir o Agent Builder") + 1 secondary demo action.
4. **Implement 16px FAB Clearance:**
   - On transactional pages (`cadastro.html`, `entrar.html`, `espera.html`), dock the support button into the header/footer or add dynamic hide-on-focus logic.
   - On content/pricing pages, ensure container `padding-bottom` guarantees $\ge 16\text{px}$ spatial clearance from cards and interactive elements.
5. **Normalize Touch Targets:**
   - Update `.button-small`, `.lead-pick label`, and footer links to $\ge 48\text{px}$ tap height.

---

## 5. Verification Method

To independently verify the observations and conclusions in this report:

1. **Verify Asset Versions & Build Cleanliness:**
   ```bash
   node scripts/stamp-asset-versions.mjs --check
   ```
   *Expected result: Exits 0 with "Versões dos assets já estão em dia."*

2. **Verify Desktop Header Element Count:**
   ```bash
   grep -n "desktop-nav" index.html
   ```
   Inspect lines 117–126 to verify 8 anchor tags and 3 `<small>` badges.

3. **Verify Mobile Navigation Touch Targets:**
   Inspect `assets/styles.css:554-555` (`.menu-toggle`) and `assets/styles.css:228-229` (`.theme-toggle`) to verify $44\text{px} \times 44\text{px}$ dimensions.

4. **Verify Focus Trapping Defect:**
   Inspect `assets/app.js:18-50`. Verify `contentBehindMenu()` only targets `main, footer`, leaving `<header>` interactive during drawer activation.

5. **Verify FAB Positioning & Collisions:**
   Inspect `assets/whatsapp-suporte.css:5-10`. Verify fixed positioning `bottom: max(18px, env(...)); right: max(18px, env(...));`. Open `cadastro.html` or `planos.html` at 390px viewport width and observe overlap with form cards.

6. **Invalidation Conditions:**
   - If desktop header items are already reduced to $\le 5$ items in any branch, re-measure header width.
   - If `.menu-toggle` and header controls are already sized $\ge 48\text{px}$, update the touch target audit table.
