# Dispatch: Worker M1 — Design Tokens, Breakpoint Matrix & WCAG Contrast

## Role & Mission
You are the Implementation Worker for Milestone 1 of the Trustio platform refactoring project.
Your working directory is: `/Users/joseedson/github/trustio-site/.agents/teamwork/worker_m1`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Input Documents
Read the following authoritative documents before starting:
- `/Users/joseedson/github/trustio-site/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/Users/joseedson/github/trustio-site/PROJECT.md`
- `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_1/handoff.md` (Tokens & Breakpoint Matrix Plan)
- `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_2/handoff.md` (WCAG Contrast & Layering Plan)
- `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_3/handoff.md` (CSP Utility Classes Plan)

## File Ownership
You exclusively own and may edit the following files:
- `design-system/tokens.json`
- `assets/styles.css`
- `assets/console.css`
- `assets/ia-sem-censura.css`
- `assets/ia-sem-censura.js`
- `ia-sem-censura.html` and `en/ia-sem-censura.html` (if applicable)

## Implementation Scope
1. **Design System Tokens (`tokens.json`)**:
   Add the 4-tier breakpoint matrix under a top-level `"breakpoint"` object as specified by Explorer M1-1:
   ```json
   "breakpoint": {
     "sm": { "$value": "768px", "$type": "dimension", "$description": "Mobile max-width (< 768px)" },
     "md": { "$value": "1024px", "$type": "dimension", "$description": "Tablet max-width (< 1024px)" },
     "lg": { "$value": "1440px", "$type": "dimension", "$description": "Desktop standard (< 1440px)" },
     "xl": { "$value": "1440px", "$type": "dimension", "$description": "Wide desktop min-width (>= 1440px)" }
   }
   ```
2. **Normalize `@media` Queries in `assets/styles.css`**:
   Normalize all 34 `@media` statements in `assets/styles.css` into the unified 4-tier matrix:
   - Mobile: `@media (max-width: 767px)`
   - Tablet: `@media (min-width: 768px) and (max-width: 1023px)`
   - Desktop: `@media (min-width: 1024px)`
   - Wide: `@media (min-width: 1440px)`
   Keep special media features intact (`prefers-reduced-motion: reduce`, `hover: none`, `print`).
3. **WCAG AA Contrast Fixes**:
   - `assets/styles.css` line 2427: Change `.insight` opacity from `.5` to `1` (or elevate text contrast so `.insight p` and `.insight .note` exceed 4.5:1 against dark backgrounds).
   - `assets/styles.css` line 2958 & 2967: Elevate `.button:disabled` text color to `#8d98aa` on dark backgrounds (and `#4f5c72` on light backgrounds).
   - `assets/console.css` line 170: Elevate `.code .c` comments from `#66738a` to `#8d9ab0` (>= 4.5:1).
   - `assets/styles.css`: Set `.brazil-commitment { isolation: isolate; }` and ensure dot-grid pseudo-elements have `z-index: -1; pointer-events: none;` so dots never puncture text or intercept pointer events.
4. **CSP Compliance & Inline Style Elimination**:
   - In `ia-sem-censura.html` (and `en/ia-sem-censura.html`), replace all 16 `data-style="..."` occurrences with static CSS utility or component classes.
   - In `assets/ia-sem-censura.css`, add the matching CSS classes.
   - In `assets/ia-sem-censura.js`, remove the `$$("[data-style]").forEach(...)` runtime CSSOM mutation loop.
   - Ensure zero inline `style="..."` attributes and zero inline `<script>` tags across all platform HTML pages.
5. **Verification**:
   - Run `node scripts/stamp-asset-versions.mjs` to update asset hashes.
   - Run `npm run stamp:check` (must pass with code 0).
   - Run `npm run validate` (must pass with code 0).
   - Verify WCAG contrast mathematically and CSP compliance with automated scripts.

Write your complete handoff report to `/Users/joseedson/github/trustio-site/.agents/teamwork/worker_m1/handoff.md`.


## 2026-10-02T01:47:02Z
You are Worker M1 for the Trustio platform refactoring project.
Your working directory is: /Users/joseedson/github/trustio-site/.agents/teamwork/worker_m1

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read the authoritative user request at: /Users/joseedson/github/trustio-site/.agents/teamwork/ORIGINAL_REQUEST.md
Read the project master plan at: /Users/joseedson/github/trustio-site/PROJECT.md
Read your dispatch details at: /Users/joseedson/github/trustio-site/.agents/teamwork/worker_m1/DISPATCH.md
Read Explorer M1-1's handoff report at: /Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_1/handoff.md
Read Explorer M1-2's handoff report at: /Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_2/handoff.md
Read Explorer M1-3's handoff report at: /Users/joseedson/github/trustio-site/.agents/teamwork/explorer_m1_3/handoff.md

Your file ownership:
- design-system/tokens.json
- assets/styles.css
- assets/console.css
- assets/ia-sem-censura.css
- assets/ia-sem-censura.js
- ia-sem-censura.html (and en/ia-sem-censura.html if applicable)

Execute the complete implementation for Milestone 1:
1. Update tokens.json with 4-tier breakpoint matrix (sm: 768px, md: 1024px, lg: 1440px, xl: 1440px).
2. Refactor all 34 @media queries in assets/styles.css to the unified 4-tier matrix (< 768px, 768px-1023px, >= 1024px, >= 1440px).
3. Fix WCAG contrast: .insight opacity, .button:disabled color (#8d98aa), .code .c (#8d9ab0), and dot grid pseudo-elements layering (isolation: isolate, z-index: -1, pointer-events: none).
4. Eliminate all 16 data-style attributes in ia-sem-censura.html, define static CSS classes in assets/ia-sem-censura.css, and remove CSSOM loop from assets/ia-sem-censura.js.
5. Run `node scripts/stamp-asset-versions.mjs`, `npm run stamp:check`, `npm run validate`, and contrast/CSP verification scripts.

Document all modified files, diffs, and verification commands in your handoff report:
/Users/joseedson/github/trustio-site/.agents/teamwork/worker_m1/handoff.md
Send a completion message back when done.
