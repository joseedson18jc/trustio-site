import path from 'path';
import { parseReport } from './lib/report_parser.js';

/**
 * Tier 3: Cross-Feature Combinations Test Suite
 *
 * Verifies cross-feature consistency:
 * - Every friction point in the timeline maps to an embedded screenshot and a Prioritized Matrix entry.
 * - UX Maturity Score (0-100) has an explicit category-by-category breakdown whose weighted sum / average
 *   matches the overall reported score.
 *
 * @param {object} context - Runner context with paths and options.
 * @returns {Array<object>} Test results.
 */
export async function runTier3Tests(context) {
  const { auditDir, isStrict } = context;
  const reportPath = path.join(auditDir, 'UX_AUDIT_REPORT.md');

  const results = [];

  // ==========================================
  // Test 3.1: Timeline Friction ↔ Screenshot ↔ Matrix Consistency
  // ==========================================
  const t3_1_start = Date.now();
  try {
    const report = parseReport(reportPath);

    if (!report.exists) {
      results.push({
        tier: 3,
        id: 'T3.1',
        name: 'Timeline Friction ↔ Screenshot ↔ Improvement Matrix Consistency',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t3_1_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 in progress).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else if (report.journeySteps.length === 0) {
      results.push({
        tier: 3,
        id: 'T3.1',
        name: 'Timeline Friction ↔ Screenshot ↔ Improvement Matrix Consistency',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t3_1_start,
        details: 'No journey steps parsed from report (Milestone 3 in progress).',
        error: isStrict ? new Error('No journey steps in report') : null,
      });
    } else {
      const stepsWithoutScreenshot = [];
      const unmappedFrictions = [];

      const matrixText = report.matrixItems
        .map((m) => `${m.id} ${m.recommendation} ${m.category}`)
        .join(' ')
        .toLowerCase();

      for (const step of report.journeySteps) {
        if (!step.image) {
          stepsWithoutScreenshot.push(`Step ${step.stepNum}: ${step.title}`);
        }

        // Check each friction point has corresponding presence in matrix recommendations
        for (const f of step.frictions) {
          // Extract keywords (words with length > 4)
          const words = (f.title + ' ' + f.description)
            .toLowerCase()
            .replace(/[^\w\sáéíóúâêîôûãõç]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 4 && !['usuário', 'sobre', 'está', 'muito', 'quando', 'onde', 'como'].includes(w));

          const hasMatch = words.some((word) => matrixText.includes(word));
          if (!hasMatch) {
            unmappedFrictions.push(`Step ${step.stepNum} friction: "${f.title}"`);
          }
        }
      }

      if (stepsWithoutScreenshot.length === 0 && unmappedFrictions.length === 0) {
        results.push({
          tier: 3,
          id: 'T3.1',
          name: 'Timeline Friction ↔ Screenshot ↔ Improvement Matrix Consistency',
          status: 'PASS',
          durationMs: Date.now() - t3_1_start,
          details: `All ${report.journeySteps.length} journey stages have embedded screenshots, and all documented friction points correspond to prioritized matrix recommendations.`,
          meta: {
            stepsCount: report.journeySteps.length,
            matrixItemsCount: report.matrixItems.length,
          },
        });
      } else {
        const issues = [];
        if (stepsWithoutScreenshot.length > 0) {
          issues.push(`Steps missing screenshots: [${stepsWithoutScreenshot.join(', ')}]`);
        }
        if (unmappedFrictions.length > 0) {
          issues.push(`Friction points unmapped to matrix: [${unmappedFrictions.join(', ')}]`);
        }
        results.push({
          tier: 3,
          id: 'T3.1',
          name: 'Timeline Friction ↔ Screenshot ↔ Improvement Matrix Consistency',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t3_1_start,
          details: `Consistency gap detected: ${issues.join('; ')}`,
          error: isStrict ? new Error(issues.join('; ')) : null,
          meta: { stepsWithoutScreenshot, unmappedFrictions },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 3,
      id: 'T3.1',
      name: 'Timeline Friction ↔ Screenshot ↔ Improvement Matrix Consistency',
      status: 'FAIL',
      durationMs: Date.now() - t3_1_start,
      details: `Exception checking timeline and matrix consistency: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 3.2: UX Maturity Score Mathematical & Rubric Consistency
  // ==========================================
  const t3_2_start = Date.now();
  try {
    const report = parseReport(reportPath);

    if (!report.exists) {
      results.push({
        tier: 3,
        id: 'T3.2',
        name: 'UX Maturity Score Mathematical & Rubric Consistency',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t3_2_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 in progress).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else if (!report.scoringBreakdown.found || report.scoringBreakdown.categories.length === 0) {
      results.push({
        tier: 3,
        id: 'T3.2',
        name: 'UX Maturity Score Mathematical & Rubric Consistency',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t3_2_start,
        details: 'No category scoring breakdown table found in report.',
        error: isStrict ? new Error('Missing scoring breakdown table in report') : null,
      });
    } else {
      const { categories, overallScoreReported, calculatedAverage, mathMatches, difference } = report.scoringBreakdown;

      // Check boundary conditions (0 <= score <= 100)
      const outOfBounds = categories.filter((c) => c.score < 0 || c.score > 100);
      const isOverallValid = overallScoreReported !== null && overallScoreReported >= 0 && overallScoreReported <= 100;

      if (outOfBounds.length > 0) {
        results.push({
          tier: 3,
          id: 'T3.2',
          name: 'UX Maturity Score Mathematical & Rubric Consistency',
          status: 'FAIL',
          durationMs: Date.now() - t3_2_start,
          details: `Category scores out of bounds [0-100]: ${outOfBounds.map((c) => `${c.name}=${c.score}`).join(', ')}`,
          error: new Error('Scores out of range 0-100'),
        });
      } else if (!isOverallValid) {
        results.push({
          tier: 3,
          id: 'T3.2',
          name: 'UX Maturity Score Mathematical & Rubric Consistency',
          status: 'FAIL',
          durationMs: Date.now() - t3_2_start,
          details: `Overall score reported is missing or invalid: ${overallScoreReported}`,
          error: new Error('Invalid overall score'),
        });
      } else if (mathMatches) {
        results.push({
          tier: 3,
          id: 'T3.2',
          name: 'UX Maturity Score Mathematical & Rubric Consistency',
          status: 'PASS',
          durationMs: Date.now() - t3_2_start,
          details: `UX Maturity Score verified: reported overall score ${overallScoreReported}/100 matches category breakdown (${categories.length} dimensions, avg=${calculatedAverage}/100, delta=${difference}).`,
          meta: { categories, overallScoreReported, calculatedAverage, difference },
        });
      } else {
        results.push({
          tier: 3,
          id: 'T3.2',
          name: 'UX Maturity Score Mathematical & Rubric Consistency',
          status: 'FAIL',
          durationMs: Date.now() - t3_2_start,
          details: `Scoring arithmetic discrepancy: reported overall score ${overallScoreReported}/100 does not match category average ${calculatedAverage}/100 (diff: ${difference} points > 1 tolerance).`,
          error: new Error(`Scoring mismatch: reported ${overallScoreReported} != average ${calculatedAverage}`),
          meta: { categories, overallScoreReported, calculatedAverage, difference },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 3,
      id: 'T3.2',
      name: 'UX Maturity Score Mathematical & Rubric Consistency',
      status: 'FAIL',
      durationMs: Date.now() - t3_2_start,
      details: `Exception verifying score consistency: ${err.message}`,
      error: err,
    });
  }

  return results;
}
