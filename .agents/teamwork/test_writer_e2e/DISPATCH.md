# Dispatch: E2E Test Writer (Parallel Testing Track)

## Role & Objectives
You are the E2E Test Writer for the Trustio platform refactoring project.
You operate on the parallel E2E Testing Track.

## Authoritative Inputs
- Read: `/Users/joseedson/github/trustio-site/.agents/teamwork/ORIGINAL_REQUEST.md`
- Read: `/Users/joseedson/github/trustio-site/PROJECT.md`
- Working directory: `/Users/joseedson/github/trustio-site/.agents/teamwork/test_writer_e2e`

## Mandate & Scope
1. Implement the comprehensive opaque-box E2E test suite covering all 4 tiers from `PROJECT.md`:
   - **Tier 1: Feature Coverage (>= 5 per feature)**: R1 (Viewport & Overflow across 12 pages), R2 (Navigation & Mobile Drawer), R3 (Visual Polish, WCAG AA Contrast, Single Hero CTA, WhatsApp FAB clearance >= 16px), R4 (CSS 4-tier matrix, CSP compliance zero inline styles/scripts, `npm run stamp`).
   - **Tier 2: Boundary & Corner Cases (>= 5 per feature)**: Extreme mobile widths (320px, 360px, 430px), tablet boundaries (767px vs 768px), desktop boundaries (1023px vs 1024px, 1300px, 1440px), empty form states, edge-to-edge content.
   - **Tier 3: Cross-Feature Interactions**: Mobile drawer open + FAB collision check; Table scroll container + theme toggle; Header responsiveness + keyboard focus trapping.
   - **Tier 4: Real-World Application Workloads**: User journeys across all 12 platform pages (`index.html`, `juridico/index.html`, `modelos.html`, `manifesto.html`, `fundador.html`, `voice.html`, `planos.html`, `espera.html`, `cadastro.html`, `entrar.html`, `privacidade.html`, `seats.html`).
2. Build the test suite as a runnable, robust Node.js runner (e.g., using `playwright-core` and Google Chrome at `/Applications/Google Chrome.app`, with zero required root `node_modules` installations, starting an ephemeral local HTTP server on `127.0.0.1:0`). Place the runner script in `scripts/test-e2e.mjs` or `tests/e2e/runner.mjs`.
3. Create `TEST_INFRA.md` at project root (`/Users/joseedson/github/trustio-site/TEST_INFRA.md`) following the template in Project Pattern.
4. When the test suite is fully designed and operational, create `TEST_READY.md` at project root (`/Users/joseedson/github/trustio-site/TEST_READY.md`).
5. Write your complete handoff report to:
   `/Users/joseedson/github/trustio-site/.agents/teamwork/test_writer_e2e/handoff.md`.


## 2026-10-02T01:41:11Z
You are the E2E Test Writer on the parallel E2E Testing Track for the Trustio platform refactoring project.
Your working directory is: /Users/joseedson/github/trustio-site/.agents/teamwork/test_writer_e2e
Read the authoritative user request at: /Users/joseedson/github/trustio-site/.agents/teamwork/ORIGINAL_REQUEST.md
Read the project master plan at: /Users/joseedson/github/trustio-site/PROJECT.md
Read your dispatch assignment at: /Users/joseedson/github/trustio-site/.agents/teamwork/test_writer_e2e/DISPATCH.md

Your mission is to construct the comprehensive opaque-box E2E test suite:
1. Methodology: Category-Partition + BVA + Pairwise + Real-World Workload testing across all 4 tiers (Tiers 1-4) addressing R1, R2, R3, R4.
2. Build the runner in `scripts/test-e2e.mjs` (using playwright-core and Google Chrome at /Applications/Google Chrome.app, with an ephemeral Node HTTP server on 127.0.0.1:0).
3. Create `TEST_INFRA.md` at project root (/Users/joseedson/github/trustio-site/TEST_INFRA.md).
4. When test cases are implemented and runner is operational, publish `TEST_READY.md` at project root (/Users/joseedson/github/trustio-site/TEST_READY.md).
5. Write your handoff report to:
/Users/joseedson/github/trustio-site/.agents/teamwork/test_writer_e2e/handoff.md
Send a completion message back when done.
