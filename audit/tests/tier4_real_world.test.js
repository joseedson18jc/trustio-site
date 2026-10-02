import path from 'path';
import { parseReport } from './lib/report_parser.js';

/**
 * Tier 4: Real-World Acceptance Scenarios Test Suite
 *
 * Verifies SOTA recommendations matrix (Quick Wins vs SOTA Architectural Enhancements,
 * with explicit Impact and Effort ratings) and actionable technical depth across the four
 * core pillars (Design Tokens, Conversion Flow, Micro-Interactions, Trust Signals).
 *
 * @param {object} context - Runner context with paths and options.
 * @returns {Array<object>} Test results.
 */
export async function runTier4Tests(context) {
  const { auditDir, isStrict } = context;
  const reportPath = path.join(auditDir, 'UX_AUDIT_REPORT.md');

  const results = [];

  // ==========================================
  // Test 4.1: SOTA Recommendations Dual-Horizon Matrix
  // ==========================================
  const t4_1_start = Date.now();
  try {
    const report = parseReport(reportPath);

    if (!report.exists) {
      results.push({
        tier: 4,
        id: 'T4.1',
        name: 'SOTA Recommendations Dual-Horizon Matrix (Impact & Effort Ratings)',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t4_1_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 in progress).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else if (report.matrixItems.length === 0) {
      results.push({
        tier: 4,
        id: 'T4.1',
        name: 'SOTA Recommendations Dual-Horizon Matrix (Impact & Effort Ratings)',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t4_1_start,
        details: 'No Prioritized Improvement Matrix table found in report (Milestone 3 in progress).',
        error: isStrict ? new Error('No matrix items in report') : null,
      });
    } else {
      // Check for Quick Wins vs SOTA Architectural / Strategic items
      const hasQuickWins = report.matrixItems.some(
        (m) =>
          /quick win|baixo|m[íi]nimo|<5 min|imediata|p0|curto prazo/i.test(m.effort) ||
          /quick win|imediata|p0/i.test(m.priority)
      );

      const hasArchitecturalOrStrategic = report.matrixItems.some(
        (m) =>
          /arquitetural|sota|alto|muito alto|m[ée]dio|estrutural|longo prazo/i.test(m.impact) &&
          /m[ée]dio|alto|estrutural/i.test(m.effort)
      );

      // Check each row has Impact and Effort specified
      const itemsMissingRatings = report.matrixItems.filter(
        (m) => !m.impact || m.impact.trim() === '' || !m.effort || m.effort.trim() === ''
      );

      if (hasQuickWins && hasArchitecturalOrStrategic && itemsMissingRatings.length === 0) {
        results.push({
          tier: 4,
          id: 'T4.1',
          name: 'SOTA Recommendations Dual-Horizon Matrix (Impact & Effort Ratings)',
          status: 'PASS',
          durationMs: Date.now() - t4_1_start,
          details: `Prioritized matrix includes ${report.matrixItems.length} recommendations spanning both Quick Wins and SOTA Architectural Enhancements, each with explicit Impact and Effort ratings.`,
          meta: {
            itemsCount: report.matrixItems.length,
            hasQuickWins,
            hasArchitecturalOrStrategic,
          },
        });
      } else {
        const issues = [];
        if (!hasQuickWins) issues.push('Missing explicit Quick Wins (low effort / immediate impact)');
        if (!hasArchitecturalOrStrategic) issues.push('Missing SOTA Architectural / Strategic Enhancements');
        if (itemsMissingRatings.length > 0) {
          issues.push(`${itemsMissingRatings.length} items missing Impact or Effort ratings`);
        }
        results.push({
          tier: 4,
          id: 'T4.1',
          name: 'SOTA Recommendations Dual-Horizon Matrix (Impact & Effort Ratings)',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t4_1_start,
          details: `Matrix structure gaps: ${issues.join('; ')}`,
          error: isStrict ? new Error(issues.join('; ')) : null,
          meta: { issues },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 4,
      id: 'T4.1',
      name: 'SOTA Recommendations Dual-Horizon Matrix (Impact & Effort Ratings)',
      status: 'FAIL',
      durationMs: Date.now() - t4_1_start,
      details: `Exception verifying SOTA matrix: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 4.2: Actionable Depth Across Core Pillars
  // ==========================================
  const t4_2_start = Date.now();
  try {
    const report = parseReport(reportPath);

    if (!report.exists) {
      results.push({
        tier: 4,
        id: 'T4.2',
        name: 'Actionable Technical Depth Across Core Pillars',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t4_2_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 in progress).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else {
      const pillars = report.sotaPillars;
      const uncoveredPillars = [];

      if (!pillars.designTokens.found) uncoveredPillars.push('Design Tokens (typography, contrast, clamp, font scale)');
      if (!pillars.conversionFlow.found) uncoveredPillars.push('Conversion Flow (funnel unification, CTA visibility, waitlist vs signup)');
      if (!pillars.microInteractions.found) uncoveredPillars.push('Micro-Interactions (interactive audio orb, pulse, hover tooltips)');
      if (!pillars.trustSignals.found) uncoveredPillars.push('Trust Signals (ISO 27001, LGPD, ANPD, founder credentials, payment guarantees)');

      if (uncoveredPillars.length === 0) {
        results.push({
          tier: 4,
          id: 'T4.2',
          name: 'Actionable Technical Depth Across Core Pillars',
          status: 'PASS',
          durationMs: Date.now() - t4_2_start,
          details: 'Verified concrete actionable depth across all 4 pillars: Design Tokens, Conversion Flow, Micro-Interactions, and Trust Signals.',
          meta: pillars,
        });
      } else {
        results.push({
          tier: 4,
          id: 'T4.2',
          name: 'Actionable Technical Depth Across Core Pillars',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t4_2_start,
          details: `Insufficient depth in audit report for pillars: ${uncoveredPillars.join('; ')} (Milestone 3 authoring in progress).`,
          error: isStrict ? new Error(`Uncovered pillars: ${uncoveredPillars.join('; ')}`) : null,
          meta: { pillars, uncoveredPillars },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 4,
      id: 'T4.2',
      name: 'Actionable Technical Depth Across Core Pillars',
      status: 'FAIL',
      durationMs: Date.now() - t4_2_start,
      details: `Exception verifying core pillars: ${err.message}`,
      error: err,
    });
  }

  return results;
}
