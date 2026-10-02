#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { runTier1Tests } from './tier1_coverage.test.js';
import { runTier2Tests } from './tier2_boundaries.test.js';
import { runTier3Tests } from './tier3_cross_feature.test.js';
import { runTier4Tests } from './tier4_real_world.test.js';

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultAuditDir = path.resolve(__dirname, '..');

// Parse CLI flags
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const isStrict = args.includes('--strict');
const isVerbose = args.includes('--verbose');

let targetTier = null;
const tierArg = args.find((a) => a.startsWith('--tier='));
if (tierArg) {
  targetTier = parseInt(tierArg.split('=')[1], 10);
}

const dirArg = args.find((a) => a.startsWith('--dir='));
const auditDir = dirArg ? path.resolve(dirArg.split('=')[1]) : defaultAuditDir;

const context = {
  auditDir,
  isStrict,
  isVerbose,
};

// ANSI Color constants
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

async function main() {
  const startTime = Date.now();
  const allResults = [];

  const tierRunners = [
    { tier: 1, name: 'TIER 1: FEATURE COVERAGE', runner: runTier1Tests },
    { tier: 2, name: 'TIER 2: BOUNDARY & CORNER CASES', runner: runTier2Tests },
    { tier: 3, name: 'TIER 3: CROSS-FEATURE COMBINATIONS', runner: runTier3Tests },
    { tier: 4, name: 'TIER 4: REAL-WORLD ACCEPTANCE SCENARIOS', runner: runTier4Tests },
  ];

  if (!isJson) {
    console.log(`${BOLD}${CYAN}================================================================================${RESET}`);
    console.log(`${BOLD}${CYAN} TRUSTIO UX AUDIT — OPAQUE-BOX E2E VERIFICATION SUITE${RESET}`);
    console.log(`${GRAY} Execution Timestamp: ${new Date().toISOString()}${RESET}`);
    console.log(`${GRAY} Target Audit Dir:    ${auditDir}${RESET}`);
    console.log(`${GRAY} Execution Mode:      ${isStrict ? 'STRICT (Pending = Fail)' : 'PROGRESSIVE (Pending Allowed for In-Flight Milestones)'}${RESET}`);
    if (targetTier) {
      console.log(`${GRAY} Filtered to Tier:    ${targetTier}${RESET}`);
    }
    console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);
  }

  for (const { tier, name, runner } of tierRunners) {
    if (targetTier && targetTier !== tier) continue;

    if (!isJson) {
      console.log(`${BOLD}─── ${name} ──────────────────────────────────────────────────${RESET}`);
    }

    try {
      const tierResults = await runner(context);
      allResults.push(...tierResults);

      if (!isJson) {
        for (const res of tierResults) {
          let badge;
          if (res.status === 'PASS') {
            badge = `${GREEN}[ PASS ]${RESET}`;
          } else if (res.status === 'PENDING') {
            badge = `${YELLOW}[ PEND ]${RESET}`;
          } else {
            badge = `${RED}[ FAIL ]${RESET}`;
          }

          console.log(` ${badge} ${BOLD}${res.id}${RESET} - ${res.name} ${GRAY}(${res.durationMs}ms)${RESET}`);
          if (res.details) {
            console.log(`          ${GRAY}↳ ${res.details}${RESET}`);
          }
          if (res.error && res.status === 'FAIL') {
            console.log(`          ${RED}↳ Error: ${res.error.message}${RESET}`);
          }
          if (isVerbose && res.meta) {
            console.log(`          ${GRAY}↳ Meta: ${JSON.stringify(res.meta)}${RESET}`);
          }
        }
        console.log('');
      }
    } catch (err) {
      const failedResult = {
        tier,
        id: `T${tier}.X`,
        name: `Suite Execution for Tier ${tier}`,
        status: 'FAIL',
        durationMs: 0,
        details: `Unhandled runner crash: ${err.message}`,
        error: err,
      };
      allResults.push(failedResult);

      if (!isJson) {
        console.log(` ${RED}[ CRASH ]${RESET} Unhandled error running Tier ${tier}: ${err.message}\n`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const passed = allResults.filter((r) => r.status === 'PASS').length;
  const pending = allResults.filter((r) => r.status === 'PENDING').length;
  const failed = allResults.filter((r) => r.status === 'FAIL').length;
  const total = allResults.length;

  const summary = {
    total,
    passed,
    pending,
    failed,
    durationMs,
    allPassed: failed === 0 && (!isStrict || pending === 0),
  };

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          auditDir,
          isStrict,
          summary,
          results: allResults,
        },
        null,
        2
      )
    );
  } else {
    console.log(`${BOLD}────────────────────────────────────────────────────────────────────────────────${RESET}`);
    console.log(`${BOLD} E2E TEST SUITE SUMMARY${RESET}`);
    console.log(`${BOLD}────────────────────────────────────────────────────────────────────────────────${RESET}`);
    console.log(` Total Assertions:  ${total}`);
    console.log(` ${GREEN}Passed:${RESET}            ${passed}`);
    console.log(` ${YELLOW}Pending:${RESET}           ${pending} ${pending > 0 ? '(Awaiting M1/M3 deliverable completion)' : ''}`);
    console.log(` ${failed > 0 ? RED : GRAY}Failed:${RESET}            ${failed}`);
    console.log(` Duration:          ${durationMs}ms`);

    let verdictColor = GREEN;
    let verdictText = 'PASSED (100% SATISFIED)';
    if (failed > 0) {
      verdictColor = RED;
      verdictText = 'FAILED (Defects Detected)';
    } else if (pending > 0) {
      verdictColor = YELLOW;
      verdictText = isStrict ? 'FAILED (Strict Mode: Unresolved Pending)' : 'IN PROGRESS (Deliverables Pending Downstream Workers)';
    }

    console.log(` Verdict:           ${BOLD}${verdictColor}${verdictText}${RESET}`);
    console.log(`${BOLD}${CYAN}================================================================================${RESET}\n`);
  }

  // Determine exit code
  if (failed > 0) {
    process.exit(1);
  }
  if (isStrict && pending > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(2);
});
