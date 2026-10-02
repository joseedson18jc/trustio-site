# Project Plan: Trustio Platform Refactoring & Redesign

## Goal
Comprehensive design, UX, mobile/desktop responsiveness review, and complete codebase refactoring for Trustio platform meeting all R1-R4 requirements and acceptance criteria.

## Workstreams

### Track 1: Implementation Track
- **Phase 0: Survey & Scope Mapping**
  - Dispatch 3 parallel Explorers to inspect existing HTML pages (all 12 pages), styles.css, tokens.json, navigation scripts, and test scripts.
  - Synthesize reports into `PROJECT.md` Feature Inventory & Architecture.
- **Phase 1: Decomposition & Interface Contracts**
  - Define clear module boundaries and contracts.
- **Milestone 1: Design Tokens & Deep Modular CSS Refactoring (R4)**
  - Unify 15 scattered media queries into 4-tier matrix from tokens.json.
  - Ensure zero inline styles/scripts, strict CSP compliance.
- **Milestone 2: Navigation & Accessible Header (R2)**
  - Streamline desktop header to <= 5 top-level items.
  - Implement accessible mobile drawer (`mobile-nav`) with 48px touch targets, ARIA states, and keyboard focus trap.
- **Milestone 3: Visual Polish, WCAG AA Contrast & CTA Consolidation (R3)**
  - Single primary CTA per hero.
  - Elevate `--muted` and text contrast above 4.5:1 against dark backgrounds.
  - WhatsApp FAB clearance >= 16px from inputs and cards; harmonize partner badges.
- **Milestone 4: Multi-Device Viewport Integrity across all 12 Pages (R1)**
  - Eliminate all horizontal overflow (`scrollWidth <= innerWidth`) on 360px, 375px, 390px, 768px, 1024px, 1440px+.
  - Apply `overflow-wrap: anywhere` and prevent clipping/collisions.
- **Final Milestone: 100% E2E Test Suite Pass & Adversarial Hardening (Tier 5)**
  - Pass all Tiers 1-4 tests published by E2E track.
  - Run Tier 5 adversarial testing with Challengers.
  - Final Forensic Audit.

### Track 2: E2E Testing Track (Parallel)
- Setup automated headless test runner (e.g. Puppeteer/Playwright or custom Node runner checking scrollWidth, computed styles, ARIA, touch targets).
- Build Tier 1 (Feature coverage >= 5 per feature).
- Build Tier 2 (Boundary & corner cases).
- Build Tier 3 (Cross-feature interactions).
- Build Tier 4 (Real-world user scenarios).
- Publish `TEST_READY.md`.
