# Test Infrastructure & Methodology: Trustio UX Audit

**Document ID:** `TEST_INFRA.md`  
**Owner:** `test_writer_e2e`  
**Milestone:** E2E Testing Track  
**Working Directory:** `/Users/joseedson/github/trustio-site/audit`  
**Execution Runtime:** Node.js (v26.9.0, ESM native)

---

## 1. Executive Overview & Design Principles

The Trustio UX Audit Test Infrastructure provides an independent, opaque-box verification suite designed to rigorously evaluate all deliverables mandated by `ORIGINAL_REQUEST.md` and `PROJECT.md`.

### Core Engineering Principles
1. **Opaque-Box Verification**: The test suite evaluates artifacts from an external auditor perspective. It parses observable markdown AST structures, scans raw binary PNG chunks, and inspects filesystem artifacts without relying on private implementation details.
2. **Zero-Dependency Native Execution**: Built purely on native Node.js capabilities (`fs`, `path`, `crypto`, `Buffer`), ensuring lightning-fast execution (<50ms), portability across developer and CI environments, and zero dependency rot.
3. **Progressive Testability**: Supports the parallel agent architecture. Tests distinguish between:
   - **PASS**: Deliverable exists and satisfies all specifications.
   - **PENDING**: Deliverable belongs to an in-flight milestone (e.g. M3 report authoring) and will be validated upon milestone completion, preventing premature CI breakage while providing diagnostic guidance.
   - **FAIL**: Artifact exists but violates safety, binary integrity, mathematical consistency, or specification constraints.
4. **Dual-Mode Exit Strategy**:
   - **Progressive Mode** (default): Exits `0` if all completed deliverables pass and remaining items are gracefully pending.
   - **Strict Mode** (`--strict`): Exits `1` if any item is pending or failing (used for final M4 sign-off).

---

## 2. Four-Tier Test Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TIER 1: FEATURE COVERAGE                        │
│   • Public Flows Evaluation  • Screenshot Existence  • Report Sections  │
├────────────────────────────────────────────────────────────────────────┤
│                     TIER 2: BOUNDARY & CORNER CASES                    │
│   • Safety & Guardrails     • Binary PNG Integrity  • Link Integrity   │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 3: CROSS-FEATURE COMBINATIONS                   │
│   • Friction ↔ Image ↔ Matrix Consistency  • UX Maturity Math Rubric   │
├────────────────────────────────────────────────────────────────────────┤
│                 TIER 4: REAL-WORLD ACCEPTANCE SCENARIOS                │
│   • Dual-Horizon SOTA Matrix (Impact/Effort)  • 4 Core Pillars Depth   │
└────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage
- **T1.1: Public Flows Evaluation Coverage**: Verifies that `UX_AUDIT_REPORT.md` evaluates the primary public discovery journeys:
  1. Home Page (`/` / Landing)
  2. VoiceAI Deep-Dive (`/voice.html`)
  3. Plans & Pricing (`/planos.html`)
  4. Individual Seats (`/seats.html`)
  5. Pre-Submission Onboarding (`/espera.html`, `/cadastro.html`, `/entrar.html`)
  6. Legal / Brand Pages (`/manifesto.html` or `/juridico/`)
- **T1.2: High-Resolution Screenshot Catalog Existence**: Verifies that `audit/screenshots/` contains captures for all required public flows. Supports both the initial baseline captures and the full 24-capture high-DPI catalog.
- **T1.3: UX Audit Report Required Structural Sections**: Verifies that `UX_AUDIT_REPORT.md` includes:
  1. Executive Summary
  2. Overall UX Maturity Score (0-100)
  3. Step-by-Step User Journey Timeline
  4. Usability Heuristics & IA Evaluation
  5. Prioritized Improvement Matrix

### Tier 2: Boundary & Corner Cases
- **T2.1: Safety & Guardrail Verification**: Scans all repository files and scripts for:
  - Valid credit card numbers (PANs) matching Visa, Mastercard, Amex, Elo, and Hipercard verified against the **Luhn algorithm**.
  - Private key certificates (`BEGIN PRIVATE KEY`).
  - Live production tokens (Stripe `sk_live_`, GitHub tokens `ghp_`).
  - Live payment execution invocations (e.g. `stripe.paymentIntents.confirm`).
- **T2.2: Screenshot Binary & Dimension Integrity**: Validates each file ending in `.png` in `audit/screenshots/`:
  - Enforces minimum file size > 10KB (10,240 bytes) to prevent empty or truncated captures.
  - Validates 8-byte PNG header (`89 50 4E 47 0D 0A 1A 0A`).
  - Reads and validates the `IHDR` chunk.
  - Extracts and asserts width > 0 and height > 0 (e.g. 1440x900, 2880x1800, 1170x2532).
- **T2.3: Embedded Image Link Integrity**: Parses all markdown image links (`![alt](path)`) and HTML `<img>` tags in `UX_AUDIT_REPORT.md` and verifies that each referenced asset exists as a readable file on disk.

### Tier 3: Cross-Feature Combinations
- **T3.1: Friction Point ↔ Embedded Screenshot ↔ Matrix Consistency**:
  - Verifies that every step in the user journey timeline contains an embedded screenshot image.
  - Verifies that all friction points and usability defects documented in the journey timeline map to an actionable recommendation in the Prioritized Improvement Matrix.
- **T3.2: UX Maturity Score Mathematical & Rubric Consistency**:
  - Extracts the category breakdown table from the report.
  - Asserts all category scores fall strictly in the range `[0, 100]`.
  - Calculates the weighted/arithmetic score across all dimensions and verifies that the reported overall score matches within ±1 point rounding tolerance.

### Tier 4: Real-World Acceptance Scenarios
- **T4.1: SOTA Recommendations Dual-Horizon Matrix**:
  - Asserts that the Prioritized Improvement Matrix contains both **Quick Wins** (low effort, immediate conversion gains) and **SOTA Architectural Enhancements** (structural, strategic improvements).
  - Asserts that every single recommendation item has explicit **Impact** and **Effort** ratings.
- **T4.2: Actionable Technical Depth Across Core Pillars**: Verifies in-depth analysis and concrete recommendations across four essential UX domains:
  1. *Design Tokens*: typography scale (`clamp`), fonts (`Geist`, `Instrument Serif`), contrast, spacing.
  2. *Conversion Flow*: CTA placement, funnel unification (waitlist vs registration), friction reduction.
  3. *Micro-Interactions*: interactive audio orb pulses, hover cues, status transitions.
  4. *Trust Signals*: ISO 27001, LGPD, ANPD, founder background, payment badges, data sovereignty.

---

## 3. Directory & File Inventory

```
audit/tests/
├── lib/
│   ├── png_utils.js             # RFC 2083 PNG binary parser & dimension extractor
│   ├── report_parser.js         # Semantic markdown AST & table parser
│   └── safety_checker.js        # Luhn PAN validator & credential/payment scanner
├── tier1_coverage.test.js       # Tier 1 suite implementation
├── tier2_boundaries.test.js     # Tier 2 suite implementation
├── tier3_cross_feature.test.js  # Tier 3 suite implementation
├── tier4_real_world.test.js     # Tier 4 suite implementation
└── run_e2e_tests.js             # Master CLI runner with formatting & JSON export
```

---

## 4. Execution Commands

### Standard Execution (Terminal Report)
```bash
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js
```
*Outputs colored terminal summary with per-assertion status, execution time, and diagnostic notes.*

### Strict Execution (Fail on Pending)
```bash
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js --strict
```
*Enforces 100% completion across all milestones; exits code `1` if any assertion is pending.*

### Machine-Readable JSON Output
```bash
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js --json
```
*Outputs clean JSON payload with timestamps, per-test metadata, and summary counters.*

### Filter by Specific Tier
```bash
# Run Tier 1 only
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js --tier=1

# Run Tier 2 only (Safety & Binary Integrity)
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js --tier=2
```

### Verbose Debugging Mode
```bash
node /Users/joseedson/github/trustio-site/audit/tests/run_e2e_tests.js --verbose
```
