# Dispatch: Explorer Survey 3 — Testing, Tooling, Headless Verification & Overflow

## Assigned Scope
Investigate tooling, verification scripts, and test infrastructure in `/Users/joseedson/github/trustio-site`.
Map:
1. `package.json` scripts: `npm test`, `npm run stamp`, build steps, dependencies.
2. Existing test suites or headless browser scripts (Puppeteer, Playwright, JSDOM, etc.).
3. How `npm run stamp` works and what checks it performs.
4. Horizontal scroll / overflow testing methods (`scrollWidth > innerWidth`) across viewports (360px, 375px, 390px, 768px, 1024px, 1440px+).
5. Known layout overflow risk areas, long strings, un-wrapped text, table/card overflow.
6. Write your report to `/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_3/handoff.md`.


## 2026-10-02T01:30:38Z
You are Survey Explorer 3 for the Trustio platform refactoring project.
Your working directory is: /Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_3
Read the authoritative user request at: /Users/joseedson/github/trustio-site/.agents/teamwork/ORIGINAL_REQUEST.md
Read your dispatch details at: /Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_3/DISPATCH.md

Your task is to thoroughly inspect the test infrastructure, scripts, and verification tooling in /Users/joseedson/github/trustio-site:
1. Inspect `package.json`: scripts (`npm test`, `npm run stamp`, lint, etc.), installed dependencies, devDependencies.
2. Investigate how tests are currently implemented: headless browser, Playwright/Puppeteer, JSDOM, or custom scripts.
3. Investigate `npm run stamp`: what does it check? What constitutes passing?
4. Investigate horizontal overflow detection (`scrollWidth > innerWidth` across viewports 360px, 375px, 390px, 768px, 1024px, 1440px+). How can we test this programmatically across all 12 pages?
5. Identify any potential test runner limitations, execution commands, and environment requirements.

Do NOT modify any code. Write your complete handoff report to:
/Users/joseedson/github/trustio-site/.agents/teamwork/explorer_survey_3/handoff.md
Send a completion message back when done.
