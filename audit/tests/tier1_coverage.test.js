import path from 'path';
import fs from 'fs';
import { parseReport } from './lib/report_parser.js';
import { inspectScreenshotsDir } from './lib/png_utils.js';

/**
 * Tier 1: Feature Coverage Test Suite
 *
 * Verifies that all required public flows are evaluated, high-resolution screenshots exist
 * for each flow, and UX_AUDIT_REPORT.md contains all required structural sections.
 *
 * @param {object} context - Runner context with paths and options.
 * @returns {Array<object>} Test results.
 */
export async function runTier1Tests(context) {
  const { auditDir, isStrict } = context;
  const reportPath = path.join(auditDir, 'UX_AUDIT_REPORT.md');
  const screenshotsDir = path.join(auditDir, 'screenshots');

  const results = [];

  // ==========================================
  // Test 1.1: Public Flows Evaluation Coverage
  // ==========================================
  const t1_1_start = Date.now();
  try {
    const report = parseReport(reportPath);
    if (!report.exists) {
      results.push({
        tier: 1,
        id: 'T1.1',
        name: 'Public Flows Evaluation Coverage in UX_AUDIT_REPORT.md',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t1_1_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (waiting for Milestone 3 completion).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else {
      const missingFlows = [];
      if (!report.flowsCovered.home) missingFlows.push('Home (Landing)');
      if (!report.flowsCovered.voice) missingFlows.push('VoiceAI (/voice.html)');
      if (!report.flowsCovered.planos) missingFlows.push('Planos (/planos.html)');
      if (!report.flowsCovered.seats) missingFlows.push('Seats (/seats.html)');
      if (!report.flowsCovered.preSubmission.espera) missingFlows.push('Pre-submission: Espera (/espera.html)');
      if (!report.flowsCovered.preSubmission.cadastro) missingFlows.push('Pre-submission: Cadastro (/cadastro.html)');
      if (!report.flowsCovered.preSubmission.entrar) missingFlows.push('Pre-submission: Entrar (/entrar.html)');
      if (!report.flowsCovered.legalManifesto) missingFlows.push('Legal/Manifesto (/manifesto.html or /juridico/)');

      if (missingFlows.length === 0) {
        results.push({
          tier: 1,
          id: 'T1.1',
          name: 'Public Flows Evaluation Coverage in UX_AUDIT_REPORT.md',
          status: 'PASS',
          durationMs: Date.now() - t1_1_start,
          details: 'All required public flows evaluated: Home, VoiceAI, Planos, Seats, Pre-submission (espera, cadastro, entrar), and Legal/Manifesto.',
          meta: report.flowsCovered,
        });
      } else {
        results.push({
          tier: 1,
          id: 'T1.1',
          name: 'Public Flows Evaluation Coverage in UX_AUDIT_REPORT.md',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t1_1_start,
          details: `Incomplete flow evaluation in report. Missing: ${missingFlows.join(', ')}`,
          error: isStrict ? new Error(`Missing flows: ${missingFlows.join(', ')}`) : null,
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 1,
      id: 'T1.1',
      name: 'Public Flows Evaluation Coverage in UX_AUDIT_REPORT.md',
      status: 'FAIL',
      durationMs: Date.now() - t1_1_start,
      details: `Exception while checking flows: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 1.2: High-Resolution Screenshots Existence
  // ==========================================
  const t1_2_start = Date.now();
  try {
    const screenshotInspection = inspectScreenshotsDir(screenshotsDir);
    if (!screenshotInspection.exists || screenshotInspection.count === 0) {
      results.push({
        tier: 1,
        id: 'T1.2',
        name: 'High-Resolution Screenshots Existence for All Required Flows',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t1_2_start,
        details: 'No screenshots found in screenshots/ directory (waiting for Milestone 1 capture).',
        error: isStrict ? new Error('Empty or missing screenshots directory') : null,
      });
    } else {
      const existingNames = screenshotInspection.files.map((f) => f.fileName.toLowerCase());

      const flowChecks = {
        home: existingNames.some((n) => n.includes('home')),
        voice: existingNames.some((n) => n.includes('voice')),
        planos: existingNames.some((n) => n.includes('plano')),
        seats: existingNames.some((n) => n.includes('seat')),
        espera: existingNames.some((n) => n.includes('espera')),
        cadastro: existingNames.some((n) => n.includes('cadastro')),
        entrar: existingNames.some((n) => n.includes('entrar')),
        legalManifesto: existingNames.some((n) => n.includes('manifesto') || n.includes('juridico') || n.includes('termos') || n.includes('404')),
      };

      const missingScreenshots = [];
      if (!flowChecks.home) missingScreenshots.push('Home');
      if (!flowChecks.voice) missingScreenshots.push('VoiceAI');
      if (!flowChecks.planos) missingScreenshots.push('Planos');
      if (!flowChecks.seats) missingScreenshots.push('Seats');
      if (!flowChecks.espera) missingScreenshots.push('Pre-submission Espera');
      if (!flowChecks.cadastro) missingScreenshots.push('Pre-submission Cadastro');
      if (!flowChecks.entrar) missingScreenshots.push('Pre-submission Entrar');
      if (!flowChecks.legalManifesto) missingScreenshots.push('Legal/Manifesto');

      if (missingScreenshots.length === 0) {
        results.push({
          tier: 1,
          id: 'T1.2',
          name: 'High-Resolution Screenshots Existence for All Required Flows',
          status: 'PASS',
          durationMs: Date.now() - t1_2_start,
          details: `Screenshots verified for all flows (${screenshotInspection.count} files present).`,
          meta: { totalFiles: screenshotInspection.count, flowChecks },
        });
      } else {
        results.push({
          tier: 1,
          id: 'T1.2',
          name: 'High-Resolution Screenshots Existence for All Required Flows',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t1_2_start,
          details: `Partial screenshot catalog (${screenshotInspection.count} present). Missing captures for: ${missingScreenshots.join(', ')} (Worker M1 in progress).`,
          error: isStrict ? new Error(`Missing screenshots for: ${missingScreenshots.join(', ')}`) : null,
          meta: { totalFiles: screenshotInspection.count, flowChecks, missingScreenshots },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 1,
      id: 'T1.2',
      name: 'High-Resolution Screenshots Existence for All Required Flows',
      status: 'FAIL',
      durationMs: Date.now() - t1_2_start,
      details: `Exception while checking screenshots: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 1.3: UX Audit Report Required Sections
  // ==========================================
  const t1_3_start = Date.now();
  try {
    const report = parseReport(reportPath);
    if (!report.exists) {
      results.push({
        tier: 1,
        id: 'T1.3',
        name: 'UX Audit Report Required Sections Structure',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t1_3_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 pending).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else {
      const missingSections = [];
      if (!report.requiredSections.executiveSummary) missingSections.push('Executive Summary');
      if (!report.requiredSections.overallUxScore) missingSections.push('Overall UX Maturity Score (0-100)');
      if (!report.requiredSections.userJourneyTimeline) missingSections.push('Step-by-Step User Journey Timeline');
      if (!report.requiredSections.usabilityHeuristicsAndIa) missingSections.push('Usability Heuristics & IA Evaluation');
      if (!report.requiredSections.prioritizedImprovementMatrix) missingSections.push('Prioritized Improvement Matrix');

      if (missingSections.length === 0) {
        results.push({
          tier: 1,
          id: 'T1.3',
          name: 'UX Audit Report Required Sections Structure',
          status: 'PASS',
          durationMs: Date.now() - t1_3_start,
          details: 'All required sections present: Executive Summary, UX Maturity Score, Journey Timeline, Usability Heuristics & IA, and Prioritized Matrix.',
          meta: report.requiredSections,
        });
      } else {
        results.push({
          tier: 1,
          id: 'T1.3',
          name: 'UX Audit Report Required Sections Structure',
          status: isStrict ? 'FAIL' : 'PENDING',
          durationMs: Date.now() - t1_3_start,
          details: `Incomplete report structure. Missing or incomplete sections: ${missingSections.join(', ')} (Worker M3 in progress).`,
          error: isStrict ? new Error(`Missing report sections: ${missingSections.join(', ')}`) : null,
          meta: { requiredSections: report.requiredSections, missingSections },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 1,
      id: 'T1.3',
      name: 'UX Audit Report Required Sections Structure',
      status: 'FAIL',
      durationMs: Date.now() - t1_3_start,
      details: `Exception while checking report sections: ${err.message}`,
      error: err,
    });
  }

  return results;
}
