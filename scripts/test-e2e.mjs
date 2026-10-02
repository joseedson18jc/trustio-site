#!/usr/bin/env node
/**
 * TRUSTIO PLATFORM REFACTORING — E2E TEST RUNNER
 * 
 * Comprehensive opaque-box E2E test suite covering Tiers 1-4:
 * - Tier 1: Feature Coverage (>= 5 tests per feature for R1, R2, R3, R4)
 * - Tier 2: Boundary & Corner Cases (BVA, extreme viewports, transitions)
 * - Tier 3: Cross-Feature Interactions (drawer+FAB, table+theme, resize+trap)
 * - Tier 4: Real-World Application Workloads (User journeys across 12 pages)
 * 
 * Execution:
 *   node scripts/test-e2e.mjs
 *   node scripts/test-e2e.mjs --strict
 *   node scripts/test-e2e.mjs --tier=1
 *   node scripts/test-e2e.mjs --json
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from '../tests/e2e/lib/static-server.mjs';
import { launchBrowser } from '../tests/e2e/lib/browser-launcher.mjs';
import { runTier1Tests } from '../tests/e2e/tier1-coverage.mjs';
import { runTier2Tests } from '../tests/e2e/tier2-boundaries.mjs';
import { runTier3Tests } from '../tests/e2e/tier3-interactions.mjs';
import { runTier4Tests } from '../tests/e2e/tier4-workloads.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ANSI Color constants
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const MAGENTA = '\x1b[35m';

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${BOLD}Trustio Platform Refactoring — E2E Test Suite Runner${RESET}

Usage:
  node scripts/test-e2e.mjs [options]

Options:
  --strict         Strict sign-off mode: fail (exit code 1) on any pending milestone defect
  --json           Output full test results as JSON for CI and automated tooling
  --tier=<1|2|3|4> Run only tests belonging to the specified tier
  --filter=<regex> Run only tests whose ID or title matches the regular expression
  --verbose        Print detailed metadata and payload inspection for each test
  --help, -h       Display this help documentation
`);
  process.exit(0);
}

const isStrict = args.includes('--strict');
const isJson = args.includes('--json');
const isVerbose = args.includes('--verbose');

let targetTier = null;
const tierArg = args.find((a) => a.startsWith('--tier='));
if (tierArg) {
  targetTier = parseInt(tierArg.split('=')[1], 10);
}

let filterRegex = null;
const filterArg = args.find((a) => a.startsWith('--filter='));
if (filterArg) {
  try {
    filterRegex = new RegExp(filterArg.split('=')[1], 'i');
  } catch (err) {
    console.error(`Invalid --filter regex: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const overallStart = Date.now();
  let serverHandle = null;
  let browserHandle = null;

  // Graceful termination handling
  const cleanUp = async () => {
    if (browserHandle) {
      try { await browserHandle.close(); } catch {}
    }
    if (serverHandle) {
      try { await serverHandle.close(); } catch {}
    }
  };

  process.on('SIGINT', async () => {
    await cleanUp();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await cleanUp();
    process.exit(143);
  });

  try {
    // 1. Start ephemeral HTTP static server
    serverHandle = await startStaticServer(rootDir);
    const { port, baseUrl } = serverHandle;

    // 2. Launch headless Google Chrome via playwright-core
    browserHandle = await launchBrowser({ headless: true });
    const { browser } = browserHandle;

    const context = {
      rootDir,
      port,
      baseUrl,
      browser,
      isStrict,
      isVerbose,
    };

    if (!isJson) {
      console.log(`${BOLD}${CYAN}================================================================================${RESET}`);
      console.log(`${BOLD}${CYAN} TRUSTIO PLATFORM REFACTORING — COMPREHENSIVE E2E TEST SUITE${RESET}`);
      console.log(`${GRAY} Timestamp:        ${new Date().toISOString()}${RESET}`);
      console.log(`${GRAY} Ephemeral Server: ${baseUrl} (serving ${rootDir})${RESET}`);
      console.log(`${GRAY} Headless Engine:  Google Chrome ${browser.version()}${RESET}`);
      console.log(`${GRAY} Execution Mode:   ${isStrict ? `${RED}STRICT (Defects = Fail)${RESET}` : `${YELLOW}PROGRESSIVE (Defects = Pending Escalation)${RESET}`}${RESET}`);
      if (targetTier) console.log(`${GRAY} Filtered Tier:    Tier ${targetTier}${RESET}`);
      if (filterRegex) console.log(`${GRAY} Filter Pattern:   ${filterRegex}${RESET}`);
      console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);
    }

    const tiers = [
      { tier: 1, name: 'TIER 1: FEATURE COVERAGE (R1, R2, R3, R4)', runner: runTier1Tests },
      { tier: 2, name: 'TIER 2: BOUNDARY & CORNER CASES (BVA & TRANSITIONS)', runner: runTier2Tests },
      { tier: 3, name: 'TIER 3: CROSS-FEATURE INTERACTIONS & REFRACTIVE FLOWS', runner: runTier3Tests },
      { tier: 4, name: 'TIER 4: REAL-WORLD APPLICATION WORKLOADS (12 USER JOURNEYS)', runner: runTier4Tests },
    ];

    const allResults = [];

    for (const t of tiers) {
      if (targetTier && targetTier !== t.tier) continue;

      if (!isJson) {
        console.log(`${BOLD}─── ${t.name} ──────────────────────────────────────────────────${RESET}`);
      }

      let tierResults = [];
      try {
        tierResults = await t.runner(context);
      } catch (err) {
        tierResults.push({
          id: `T${t.tier}.CRASH`,
          code: 'RUNNER-CRASH',
          name: `${t.name} Runner Execution`,
          tier: t.tier,
          feature: 'ALL',
          status: 'FAIL',
          durationMs: 0,
          details: `Tier runner crashed: ${err.message}`,
          error: err,
        });
      }

      for (const res of tierResults) {
        if (filterRegex && !filterRegex.test(res.id) && !filterRegex.test(res.name)) {
          continue;
        }

        allResults.push(res);

        if (!isJson) {
          let badge;
          if (res.status === 'PASS') {
            badge = `${GREEN}[ PASS ]${RESET}`;
          } else if (res.status === 'PENDING') {
            badge = `${YELLOW}[ PEND ]${RESET}`;
          } else {
            badge = `${RED}[ FAIL ]${RESET}`;
          }

          console.log(` ${badge} ${BOLD}${res.id}${RESET} ${GRAY}[${res.code}]${RESET} - ${res.name} ${GRAY}(${res.durationMs}ms)${RESET}`);
          if (res.details) {
            console.log(`          ${GRAY}↳ ${res.details}${RESET}`);
          }
          if (res.defect && res.status !== 'PASS') {
            console.log(`          ${YELLOW}↳ Defect [${res.milestone || 'TBD'}]: Expected ${res.defect.expected}, Actual: ${res.defect.actual}${RESET}`);
          }
          if (res.error) {
            console.log(`          ${RED}↳ Error: ${res.error.message}${RESET}`);
          }
        }
      }

      if (!isJson) console.log();
    }

    const durationTotalMs = Date.now() - overallStart;
    const passedCount = allResults.filter((r) => r.status === 'PASS').length;
    const pendingCount = allResults.filter((r) => r.status === 'PENDING').length;
    const failedCount = allResults.filter((r) => r.status === 'FAIL').length;
    const totalCount = allResults.length;

    if (isJson) {
      const jsonReport = {
        timestamp: new Date().toISOString(),
        durationMs: durationTotalMs,
        isStrict,
        summary: {
          total: totalCount,
          passed: passedCount,
          pending: pendingCount,
          failed: failedCount,
        },
        results: allResults,
      };
      console.log(JSON.stringify(jsonReport, null, 2));
    } else {
      console.log(`${BOLD}================================================================================${RESET}`);
      console.log(`${BOLD} E2E TEST SUITE EXECUTION SUMMARY${RESET}`);
      console.log(`${BOLD}================================================================================${RESET}`);
      console.log(` Total Assertions:  ${BOLD}${totalCount}${RESET}`);
      console.log(` Passed:            ${GREEN}${BOLD}${passedCount}${RESET}`);
      console.log(` Pending / Defects: ${YELLOW}${BOLD}${pendingCount}${RESET} (Awaiting milestone completion)`);
      console.log(` Hard Failures:     ${failedCount > 0 ? RED : GREEN}${BOLD}${failedCount}${RESET}`);
      console.log(` Execution Time:    ${(durationTotalMs / 1000).toFixed(2)}s\n`);

      // If pending defects exist, print organized defect escalation punch list
      const defects = allResults.filter((r) => r.status === 'PENDING' || r.status === 'FAIL');
      if (defects.length > 0) {
        console.log(`${BOLD}${YELLOW}─── ESCALATED IMPLEMENTATION DEFECTS PUNCH LIST ─────────────────────────${RESET}`);
        console.log(`${GRAY}The following defects require remediation by the milestone implementing agents:${RESET}\n`);

        const byMilestone = {};
        for (const d of defects) {
          const m = d.milestone || 'General';
          if (!byMilestone[m]) byMilestone[m] = [];
          byMilestone[m].push(d);
        }

        for (const [m, list] of Object.entries(byMilestone)) {
          console.log(` ${BOLD}${MAGENTA}Milestone ${m}:${RESET}`);
          for (const item of list) {
            console.log(`   • ${BOLD}${item.id}${RESET} [${item.code}]: ${item.name}`);
            if (item.defect) {
              console.log(`     ${GRAY}Expected:${RESET} ${item.defect.expected}`);
              console.log(`     ${GRAY}Actual:  ${RESET} ${item.defect.actual}`);
            } else if (item.details) {
              console.log(`     ${GRAY}Issue:   ${RESET} ${item.details}`);
            }
          }
          console.log();
        }
      }

      if (failedCount > 0 || (isStrict && pendingCount > 0)) {
        console.log(`${RED}${BOLD}VERDICT: FAILED${RESET} — Incomplete or failing specifications detected.\n`);
      } else {
        console.log(`${GREEN}${BOLD}VERDICT: OPERATIONAL${RESET} — E2E suite executed cleanly; test harness fully verified.\n`);
      }
    }

    await cleanUp();

    if (failedCount > 0 || (isStrict && pendingCount > 0)) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (fatalErr) {
    await cleanUp();
    if (!isJson) {
      console.error(`${RED}${BOLD}Fatal Test Runner Exception:${RESET}`, fatalErr);
    } else {
      console.log(JSON.stringify({ error: fatalErr.message, stack: fatalErr.stack }));
    }
    process.exit(1);
  }
}

main();
