# Test Infrastructure & Methodology: Trustio Platform Refactoring

**Document ID:** `TEST_INFRA.md`  
**Owner:** `test_writer_e2e`  
**Milestone:** Parallel E2E Testing Track (M6 Scope Prepared in Parallel)  
**Target Repository:** `/Users/joseedson/github/trustio-site`  
**Execution Runtime:** Node.js (v26.9.0, ESM native) + `playwright-core` (v1.63.0) + Google Chrome (v154.0.8037.93)  
**Runner Entrypoint:** `scripts/test-e2e.mjs`  

---

## 1. Executive Overview & Design Principles

The Trustio Platform Refactoring Test Infrastructure provides an independent, opaque-box end-to-end verification suite designed to rigorously evaluate all architectural requirements mandated by `ORIGINAL_REQUEST.md` and `PROJECT.md`.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                    TRUSTIO E2E TEST ARCHITECTURE (TIERS 1–4)                      │
├───────────────────────────────────────────────────────────────────────────────────┤
│  TIER 1: FEATURE COVERAGE (>= 5 per feature)                                      │
│  • R1: Viewport & Overflow across 12 canonical pages (360px, 768px, 1024px, 1440) │
│  • R2: Navigation & Mobile Drawer (Hierarchy <= 5, ARIA dialog, Focus Trapping)  │
│  • R3: Visual Polish & Contrast (Single Hero CTA, WCAG AA >= 4.5:1, FAB >= 16px) │
│  • R4: CSS 4-Tier Matrix & CSP (tokens.json, normalized queries, zero inline)     │
├───────────────────────────────────────────────────────────────────────────────────┤
│  TIER 2: BOUNDARY & CORNER CASES (BVA & Category-Partition)                       │
│  • Extreme mobile widths (320px minimum, 430px iPhone Pro Max)                    │
│  • Breakpoint thresholds (767px mobile vs 768px tablet, 1023px vs 1024px desktop) │
│  • Interactive boundaries (rapid 10-toggle stress, window resize dismiss, scroll) │
│  • Token resolution, runtime CSP mutations, cryptographic asset stamp parity      │
├───────────────────────────────────────────────────────────────────────────────────┤
│  TIER 3: CROSS-FEATURE INTERACTIONS (Refractive Flows)                            │
│  • Mobile drawer open + WhatsApp FAB clearance and z-index stacking               │
│  • Table horizontal scroll container + dynamic theme toggle (light/dark contrast) │
│  • Viewport dynamic resize during active keyboard focus trapping                  │
│  • Form validation error states + viewport boundary flow                          │
│  • Animated background canvas + continuous window downscale reflow                │
├───────────────────────────────────────────────────────────────────────────────────┤
│  TIER 4: REAL-WORLD APPLICATION WORKLOADS (User Journeys)                         │
│  • 12 Canonical User Journeys: Home, Jurídico, Modelos, Manifesto, Fundador,      │
│    VoiceAI, Planos, Espera, Cadastro, Entrar, Privacidade, Seats                  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Core Engineering Principles

1. **Opaque-Box Headless Verification**:
   The test suite evaluates the platform strictly from an external user and browser perspective. It launches an ephemeral HTTP server, drives real Google Chrome via the Chrome DevTools Protocol / Playwright, computes live DOM bounding client rects, queries accessibility tree attributes (`role`, `aria-*`), and measures computed sRGB luminance contrast.
2. **Zero Root Dependency Footprint**:
   The test suite executes with zero root `npm install` requirements. It dynamically discovers Playwright from existing system/NPX caches and connects directly to the system Google Chrome binary (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
3. **Progressive Testability & Milestone Traceability**:
   Tests are mapped to specific milestones (M1 through M5). The suite supports two execution paradigms:
   - **Progressive Mode** (default): Runs all 61 assertions across the 4 tiers. Passes compliant features, and marks in-flight milestone gaps as `PENDING` with an organized defect punch list, allowing parallel track visibility without false fatal aborts.
   - **Strict Mode** (`--strict`): Exits with code `1` if any test fails or has an unresolved defect. Used for milestone gatekeeping and final M6 sign-off.
4. **Ephemerality & Zero Side Effects**:
   Every test execution dynamically binds an HTTP server to an OS-assigned port (`127.0.0.1:0`), opens isolated browser contexts, and cleanly disposes of resources on termination or signal (`SIGINT`/`SIGTERM`).

---

## 2. Methodology & Test Techniques

The test suite synthesizes four formal software testing methodologies:

1. **Category-Partitioning**:
   System inputs and UI states are divided into discrete equivalence partitions:
   - *Viewports*: Compact Mobile (`320px`, `360px`), Standard Mobile (`375px`, `390px`), Large Mobile (`430px`), Tablet Portrait (`768px`), Desktop Standard (`1024px`), Wide Desktop (`1440px`), Ultra-Wide (`1920px`).
   - *Themes*: Dark Default (`[data-theme="dark"]` / `--abyss`) and Light Mode (`[data-theme="light"]`).
   - *Navigation States*: Closed, Open, Transitioning, Resized.
2. **Boundary Value Analysis (BVA)**:
   Tests exercise the exact inflection points between responsive rules:
   - `767px` (upper limit of mobile media query `max-width: 767px`) vs. `768px` (lower limit of tablet matrix `min-width: 768px`).
   - `1023px` (upper limit of tablet matrix) vs. `1024px` (lower limit of desktop matrix `min-width: 1024px`).
   - `320px` (absolute minimum web viewport width).
   - `16px` (minimum spatial clearance boundary for FAB).
   - `4.5:1` (WCAG AA normal text contrast threshold) and `3.0:1` (disabled state boundary).
3. **Pairwise & Interaction Testing**:
   Combines cross-cutting features that interact at runtime:
   - Mobile navigation modal overlay $\times$ WhatsApp floating action button stacking.
   - Table horizontal scroll container state $\times$ CSS theme switching.
   - Dynamic window resizing $\times$ Keyboard focus trapping.
4. **Real-World Workloads**:
   Full synthetic user journeys simulating authentic engagement (reading, clicking hero CTAs, scrolling deep into sections, toggling theme, typing into consultation forms, interacting with model tables and seat sliders) across all 12 platform pages.

---

## 3. Directory Layout & Module Structure

```
trustio-site/
├── scripts/
│   └── test-e2e.mjs                 # Unified CLI runner entrypoint
├── tests/
│   └── e2e/
│       ├── lib/
│       │   ├── static-server.mjs    # Ephemeral HTTP file server (127.0.0.1:0)
│       │   ├── browser-launcher.mjs # Dynamic Playwright & Google Chrome launcher
│       │   ├── contrast-calculator.mjs # WCAG 2.1 relative luminance & contrast ratio
│       │   └── geometry-evaluator.mjs  # DOM bounding rect, overflow, & FAB clearance
│       ├── tier1-coverage.mjs       # Tier 1: Feature Coverage (R1, R2, R3, R4)
│       ├── tier2-boundaries.mjs     # Tier 2: Boundary & Corner Cases (BVA)
│       ├── tier3-interactions.mjs   # Tier 3: Cross-Feature Interactions
│       └── tier4-workloads.mjs      # Tier 4: Real-World Workload User Journeys
├── TEST_INFRA.md                    # Infrastructure & methodology documentation
└── TEST_READY.md                    # Verification readiness declaration
```

---

## 4. Comprehensive Assertion Catalog (61 Assertions)

### Tier 1: Feature Coverage (23 Assertions)
- **R1: Viewport & Overflow**
  - `T1.1.1` [R1-FEAT-1]: Canonical Pages HTTP 200 & Doctype Integrity (12 pages).
  - `T1.1.2` [R1-FEAT-2]: Mobile Baseline Viewport Integrity (360px: 0 scrollWidth / right-edge overflow).
  - `T1.1.3` [R1-FEAT-3]: Tablet Portrait Viewport Integrity (768px: 0 overflow across 12 pages).
  - `T1.1.4` [R1-FEAT-4]: Desktop Standard Viewport Integrity (1024px: 0 overflow across 12 pages).
  - `T1.1.5` [R1-FEAT-5]: Desktop Wide Viewport Integrity (1440px: 0 overflow across 12 pages).
  - `T1.1.6` [R1-FEAT-6]: Responsive Table Container Wrapper Protection (`.table-scroll-wrapper` on `planos.html` & `modelos.html`).
  - `T1.1.7` [R1-FEAT-7]: Dynamic Interactive Network Canvas Clamping (`canvas#network-canvas`).
- **R2: Navigation & Mobile Drawer**
  - `T1.2.1` [R2-FEAT-1]: Desktop Navigation Hierarchy & Link Cardinality ($\le 5$ top-level links).
  - `T1.2.2` [R2-FEAT-2]: Mobile Menu Toggle ARIA Attributes Contract (`aria-expanded`, `aria-controls`, `aria-label`).
  - `T1.2.3` [R2-FEAT-3]: Mobile Drawer Modal Dialog Semantics (`role="dialog"`, `aria-modal="true"`).
  - `T1.2.4` [R2-FEAT-4]: Mobile Drawer Keyboard Focus Trapping & Background Inertness.
  - `T1.2.5` [R2-FEAT-5]: Mobile Drawer Escape Key Dismissal & Focus Restoration.
  - `T1.2.6` [R2-FEAT-6]: Primary Navigation Controls Touch Target Dimension ($\ge 48$px).
- **R3: Visual Polish & Contrast**
  - `T1.3.1` [R3-FEAT-1]: Hero Section Single Primary CTA Consolidation.
  - `T1.3.2` [R3-FEAT-2]: WCAG AA Contrast Ratio ($\ge 4.5:1$) for Dark Theme Text Elements (`--muted`, `.insight`, `.button:disabled`, `.code .c`).
  - `T1.3.3` [R3-FEAT-3]: WCAG AA Contrast Ratio ($\ge 4.5:1$) for Light Mode Text Elements.
  - `T1.3.4` [R3-FEAT-4]: WhatsApp Floating Action Button Spatial Clearance ($\ge 16$px).
  - `T1.3.5` [R3-FEAT-5]: Header Partner Badges Harmonization & Bloat Elimination.
- **R4: CSS Architecture & CSP**
  - `T1.4.1` [R4-FEAT-1]: Design System 4-Tier Breakpoint Tokens Declaration (`sm`, `md`, `lg`, `xl`).
  - `T1.4.2` [R4-FEAT-2]: CSS Breakpoint Matrix Normalization (Elimination of arbitrary thresholds).
  - `T1.4.3` [R4-FEAT-3]: Strict CSP Compliance — Zero Inline Style Attributes.
  - `T1.4.4` [R4-FEAT-4]: Strict CSP Compliance — Zero Inline Executable Script Tags.
  - `T1.4.5` [R4-FEAT-5]: Asset Stamping Hash Integrity (`?v=<hash>` query strings).

### Tier 2: Boundary & Corner Cases (21 Assertions)
- **R1 Boundaries**
  - `T2.1.1` [R1-BND-1]: Extreme Compact Mobile Viewport (320px Minimum Web Standard).
  - `T2.1.2` [R1-BND-2]: Large Mobile Viewport Boundary (430px iPhone Pro Max).
  - `T2.1.3` [R1-BND-3]: Mobile-to-Tablet Breakpoint Threshold Boundary (767px vs 768px).
  - `T2.1.4` [R1-BND-4]: Tablet-to-Desktop Breakpoint Threshold Boundary (1023px vs 1024px).
  - `T2.1.5` [R1-BND-5]: Ultra-Wide Desktop Viewport Clamping (1920px Display Bounds).
  - `T2.1.6` [R1-BND-6]: Mobile Container Edge Padding Boundary ($\ge 16$px Gutters).
- **R2 Boundaries**
  - `T2.2.1` [R2-BND-1]: Rapid Consecutive Mobile Drawer Toggling Stress Test (10 Clicks).
  - `T2.2.2` [R2-BND-2]: Dynamic Viewport Expansion With Active Drawer (375px $\to$ 1024px).
  - `T2.2.3` [R2-BND-3]: Cyclic Keyboard Focus Trapping Loop in Mobile Navigation Drawer.
  - `T2.2.4` [R2-BND-4]: Keyboard Focus Restoration to Menu Toggle on Drawer Dismissal.
  - `T2.2.5` [R2-BND-5]: Mobile Drawer Body Scroll Lock Boundary State.
- **R3 Boundaries**
  - `T2.3.1` [R3-BND-1]: WhatsApp FAB Spatial Clearance at Extreme 320px Mobile Boundary.
  - `T2.3.2` [R3-BND-2]: Disabled State Button Contrast Boundary ($\ge 3.0:1$ Legibility).
  - `T2.3.3` [R3-BND-3]: Hero Visual Hierarchy Dominance (Exactly 1 Primary Weighted Button).
  - `T2.3.4` [R3-BND-4]: Code Snippet Comment Syntax Contrast Boundary ($\ge 4.5:1$).
  - `T2.3.5` [R3-BND-5]: Adjacent Header Touch Controls Spatial Non-Overlap Boundary.
- **R4 Boundaries**
  - `T2.4.1` [R4-BND-1]: CSS Custom Property Tokens Runtime Resolution Boundary.
  - `T2.4.2` [R4-BND-2]: Runtime Interaction CSP Style Attribute Injection Boundary.
  - `T2.4.3` [R4-BND-3]: Comprehensive Media Query Threshold Strictness Scan Across All Stylesheets.
  - `T2.4.4` [R4-BND-4]: Form Control Bounding Box & Horizontal Text Inset Boundary.
  - `T2.4.5` [R4-BND-5]: Cryptographic Asset Version Hash Consistency Boundary.

### Tier 3: Cross-Feature Interactions (5 Assertions)
- `T3.1` [X-FEAT-1]: Mobile Navigation Drawer Open + WhatsApp FAB Stacking Interaction.
- `T3.2` [X-FEAT-2]: Responsive Table Scroll Container + Theme Switch Reflow Interaction.
- `T3.3` [X-FEAT-3]: Dynamic Viewport Resize During Active Focus Trap Interactivity.
- `T3.4` [X-FEAT-4]: Form Validation Error Display + Viewport Boundary Stability.
- `T3.5` [X-FEAT-5]: Continuous Viewport Downscaling Reflow With Animated Background Canvas.

### Tier 4: Real-World Application Workloads (12 Assertions)
- `T4.1` [JOURNEY-01]: Home Landing End-to-End User Journey (`index.html`).
- `T4.2` [JOURNEY-02]: Legal Vertical Compliance User Journey (`juridico/index.html`).
- `T4.3` [JOURNEY-03]: AI Model Showcase & Spec Comparison Journey (`modelos.html`).
- `T4.4` [JOURNEY-04]: Brand Manifesto Editorial Reading Journey (`manifesto.html`).
- `T4.5` [JOURNEY-05]: Founder Profile & Credibility Verification Journey (`fundador.html`).
- `T4.6` [JOURNEY-06]: VoiceAI Interactive Product Deep-Dive Journey (`voice.html`).
- `T4.7` [JOURNEY-07]: Subscription Plans & Pricing Evaluation Journey (`planos.html`).
- `T4.8` [JOURNEY-08]: Waitlist Consultation Intake Form Journey (`espera.html`).
- `T4.9` [JOURNEY-09]: Account Registration Flow User Journey (`cadastro.html`).
- `T4.10` [JOURNEY-10]: Authentication Login Portal Journey (`entrar.html`).
- `T4.11` [JOURNEY-11]: Privacy Policy & LGPD Legal Document Journey (`privacidade.html`).
- `T4.12` [JOURNEY-12]: Individual Seat Allocation & Calculator Journey (`seats.html`).

---

## 5. Execution Guide & CLI Commands

### Standard Progressive Run (Default)
Executes all 61 assertions, displaying ANSI formatted test execution logs, tier summaries, and an organized defect punch list for in-flight milestones:
```bash
node scripts/test-e2e.mjs
```

### Strict Mode (Final M6 Verification & Gatekeeping)
Exits with code `1` if any test is non-passing or pending:
```bash
node scripts/test-e2e.mjs --strict
```

### Filtered Tier Execution
Execute a single tier in isolation:
```bash
node scripts/test-e2e.mjs --tier=1    # Tier 1 Feature Coverage
node scripts/test-e2e.mjs --tier=2    # Tier 2 Boundary & Corner Cases
node scripts/test-e2e.mjs --tier=3    # Tier 3 Cross-Feature Interactions
node scripts/test-e2e.mjs --tier=4    # Tier 4 Real-World Workloads
```

### Pattern Matching Filter
Run only specific test IDs or names:
```bash
node scripts/test-e2e.mjs --filter="T1.1"      # Viewport tests
node scripts/test-e2e.mjs --filter="JOURNEY"   # User journeys
node scripts/test-e2e.mjs --filter="R2"        # Navigation tests
```

### Machine-Readable JSON Mode
Generates raw JSON for CI/CD pipelines, dashboards, or parallel agent ingest:
```bash
node scripts/test-e2e.mjs --json > test-results.json
```
