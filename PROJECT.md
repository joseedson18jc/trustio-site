# Project: Trustio Platform Refactoring & Redesign

## Architecture
- **Design Tokens**: `design-system/tokens.json` defines design tokens (colors, spacing, dimensions). Extended with a standardized 4-tier responsive breakpoint matrix (`sm: 768px`, `md: 1024px`, `lg: 1440px`, `xl: 1440px`).
- **CSS Architecture**: Modular stylesheet layers linked via `@import` in `assets/styles.css` (or structured sections), fully compatible with `scripts/stamp-asset-versions.mjs`. Unified under the 4-tier matrix:
  - Mobile: `@media (max-width: 767px)`
  - Tablet: `@media (min-width: 768px) and (max-width: 1023px)`
  - Desktop: `@media (min-width: 1024px)`
  - Wide: `@media (min-width: 1440px)`
- **Navigation & Mobile Drawer**: Desktop header condensed to $\le 5$ top-level links (`Plataforma`, `VoiceAI`, `Modelos`, `Planos`, `Jurídico`) with utility actions. Mobile navigation drawer (`#mobile-menu`) operates as an accessible modal dialog (`role="dialog"`, `aria-modal="true"`) with minimum 48px touch targets and full keyboard focus trapping.
- **Conversion & Visual Polish**: Single primary CTA per hero section, secondary CTAs demoted to inline text links. Floating WhatsApp FAB (`.wa-float`) enforced $\ge 16$px spatial clearance from inputs, submit buttons, and cards. Partner badges harmonized.
- **Viewport Integrity**: Zero horizontal scroll violations (`scrollWidth <= innerWidth`) on viewports 360px, 375px, 390px, 768px, 1024px, 1440px+ across all 12 platform pages. Overflowing tables wrapped in horizontal scroll containers; orbital graphics and canvases constrained.
- **CSP Compliance & Quality**: 100% strict CSP compliance (zero inline `style="..."`, zero inline `<script>`). Passes `npm test`, `npm run stamp`, and `npm run validate`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Breakpoint Tokens | Add standard 4-tier breakpoint dimensions to `tokens.json` | M1 | Survey 2 |
| F02 | CSS Breakpoint Matrix | Normalize 34 arbitrary `@media` queries in `styles.css` to 4 tiers | M1 | Survey 2 / R4 |
| F03 | WCAG AA Contrast Fixes | Fix `.insight` opacity, `.button:disabled`, `.code .c`, and dot grids | M1 | Survey 2 / R3 |
| F04 | CSP Utility Classes | Refactor `ia-sem-censura.html` runtime `data-style` to CSS classes | M1 | Survey 2 / R4 |
| F05 | Desktop Header Condensation | Streamline top-level desktop links to $\le 5$ items | M2 | Survey 1 / R2 |
| F06 | Partner Badge Harmonization | Remove inline badge bloat from header links to tooltips/subtext | M2 | Survey 1 / R2 |
| F07 | Mobile Drawer Accessibility | Add `role="dialog"`, `aria-modal="true"`, and true focus trap in `app.js` | M2 | Survey 1 / R2 |
| F08 | 48px Touch Targets | Upgrade `.menu-toggle`, `.theme-toggle`, `.lang-switch`, `.button-small` to $\ge 48$px | M2 | Survey 1 / R2 |
| F09 | Hero CTA Consolidation | Enforce single primary CTA button per hero section across pages | M3 | Survey 1 / R3 |
| F10 | WhatsApp FAB Clearance | Reposition `.wa-float` to ensure $\ge 16$px clearance from inputs/cards | M3 | Survey 1 / R3 |
| F11 | Platform Touch Targets | Expand form pills, footer links, and secondary buttons to $\ge 48$px | M3 | Survey 1 / R1 |
| F12 | Table Overflow Handling | Wrap comparison tables (`planos.html`, `modelos.html`) in scroll containers | M4 | Survey 3 / R1 |
| F13 | Background Graphic Bounds | Constrain `.tb-earth`, `.manifesto-glow`, `.legal-orbit`, `.contact-pattern` | M4 | Survey 3 / R1 |
| F14 | Network Canvas Clamping | Clamp `canvas#network-canvas` to `max-width: 100%` / viewport width | M4 | Survey 3 / R1 |
| F15 | Text Wrapping (`overflow-wrap`) | Apply `overflow-wrap: anywhere` to headings and copy | M4 | Survey 3 / R1 |
| F16 | Test Infrastructure & Runner | Formalize headless overflow test script in `scripts/test-overflow.mjs` and wire `npm test` | M5 | Survey 3 / R4 |
| F17 | Asset Stamping & Sync | Run `npm run stamp` and `npm run i18n` to synchronize asset hashes and mirrors | M5 | Survey 3 / R4 |
| F18 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box headless test suite across all requirements | M6 | Project Pattern |
| F19 | Adversarial Hardening (Tier 5) | White-box adversarial testing and forensic audit verification | M6 | Project Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Design Tokens, Breakpoint Matrix & WCAG Contrast | F01, F02, F03, F04 | none | IN_PROGRESS |
| M2 | Desktop Navigation & Accessible Mobile Drawer | F05, F06, F07, F08 | M1 | PLANNED |
| M3 | Hero CTA Consolidation & WhatsApp FAB Clearance | F09, F10, F11 | M1 | PLANNED |
| M4 | Viewport Integrity & Horizontal Overflow Elimination | F12, F13, F14, F15 | M1 | PLANNED |
| M5 | Tooling, npm test & Asset Stamping | F16, F17 | M2, M3, M4 | PLANNED |
| M6 | Final E2E Suite Verification & Adversarial Hardening | F18, F19 | M5 | PLANNED |

## Interface Contracts

### Design Tokens ↔ CSS Matrix
- `tokens.json` declares:
  ```json
  "breakpoint": {
    "sm": { "$value": "768px", "$type": "dimension" },
    "md": { "$value": "1024px", "$type": "dimension" },
    "lg": { "$value": "1440px", "$type": "dimension" },
    "xl": { "$value": "1440px", "$type": "dimension" }
  }
  ```
- CSS queries map strictly to:
  - Mobile: `@media (max-width: 767px)`
  - Tablet: `@media (min-width: 768px) and (max-width: 1023px)`
  - Desktop: `@media (min-width: 1024px)`
  - Wide: `@media (min-width: 1440px)`

### Navigation DOM & ARIA Contract
- Trigger: `<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Abrir menu">`
- Drawer: `<nav class="mobile-nav" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navegação para dispositivos móveis" hidden>`
- Focus Trap: When open, tab sequence cycles strictly between close toggle and drawer interactive elements. Background `<header>`, `<main>`, `<footer>` receive `inert` or have keyboard events suppressed.

### Responsive Tables Contract
- Tables in `planos.html` and `modelos.html` must be wrapped in:
  `<div class="table-scroll-wrapper" role="region" aria-label="..." tabindex="0">`
  with CSS:
  `.table-scroll-wrapper { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }`

### Test Runner Contract (`scripts/test-overflow.mjs`)
- Exits with code 0 only when all 12 platform pages have 0 root overflow violations and 0 element right-edge violations across viewports `[360, 375, 390, 768, 1024, 1440]`.

## Code Layout
- `design-system/tokens.json`: Design system token dictionary.
- `assets/styles.css`: Core stylesheet entrypoint and modular CSS layers.
- `assets/whatsapp-suporte.css`: WhatsApp FAB positioning and safe clearance.
- `assets/app.js`: Global site scripts (navigation drawer, theme toggle, focus trapping).
- `assets/ia-sem-censura.js`: Subpage script (utility classes replacing `data-style`).
- `scripts/test-overflow.mjs`: Programmatic headless viewport and layout boundary test suite.
- `package.json`: Project scripts including `test` and `test:overflow`.
- Platform HTML pages: `index.html`, `juridico/index.html`, `modelos.html`, `manifesto.html`, `fundador.html`, `voice.html`, `planos.html`, `espera.html`, `cadastro.html`, `entrar.html`, `privacidade.html`, `seats.html` (+ `agentio.html`, `ia-sem-censura.html`).
