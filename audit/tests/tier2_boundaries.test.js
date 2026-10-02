import path from 'path';
import fs from 'fs';
import { scanDirectoryForSafety } from './lib/safety_checker.js';
import { inspectScreenshotsDir, validatePngFile } from './lib/png_utils.js';
import { parseReport } from './lib/report_parser.js';

/**
 * Tier 2: Boundary & Corner Cases Test Suite
 *
 * Verifies guardrail and safety compliance (zero credentials/payment leaks),
 * binary PNG image integrity (valid headers, dimensions, >10KB), and
 * markdown link integrity (all referenced images exist on disk).
 *
 * @param {object} context - Runner context with paths and options.
 * @returns {Array<object>} Test results.
 */
export async function runTier2Tests(context) {
  const { auditDir, isStrict } = context;
  const reportPath = path.join(auditDir, 'UX_AUDIT_REPORT.md');
  const screenshotsDir = path.join(auditDir, 'screenshots');

  const results = [];

  // ==========================================
  // Test 2.1: Safety & Guardrail Enforcement
  // ==========================================
  const t2_1_start = Date.now();
  try {
    const safetyResult = scanDirectoryForSafety(auditDir, {
      extensions: ['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.sh', '.html'],
      ignoreDirs: ['.git', 'node_modules', '.agents'],
    });

    if (safetyResult.safe) {
      results.push({
        tier: 2,
        id: 'T2.1',
        name: 'Guardrail & Safety Verification (Zero Leaks/Transactions)',
        status: 'PASS',
        durationMs: Date.now() - t2_1_start,
        details: `Clean safety scan across ${safetyResult.filesScanned} files. Zero real credentials, credit card PANs, or live payment executions found.`,
        meta: { filesScanned: safetyResult.filesScanned },
      });
    } else {
      const summary = safetyResult.violations.map((v) => `[${v.type}] ${v.source}: ${v.detail}`).join('; ');
      results.push({
        tier: 2,
        id: 'T2.1',
        name: 'Guardrail & Safety Verification (Zero Leaks/Transactions)',
        status: 'FAIL',
        durationMs: Date.now() - t2_1_start,
        details: `Safety violations detected: ${summary}`,
        error: new Error(`Detected ${safetyResult.violations.length} safety violations: ${summary}`),
        meta: { violations: safetyResult.violations },
      });
    }
  } catch (err) {
    results.push({
      tier: 2,
      id: 'T2.1',
      name: 'Guardrail & Safety Verification (Zero Leaks/Transactions)',
      status: 'FAIL',
      durationMs: Date.now() - t2_1_start,
      details: `Exception during safety scan: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 2.2: Image Integrity & Dimension Validation
  // ==========================================
  const t2_2_start = Date.now();
  try {
    const inspection = inspectScreenshotsDir(screenshotsDir);

    if (!inspection.exists || inspection.count === 0) {
      results.push({
        tier: 2,
        id: 'T2.2',
        name: 'Screenshot Image Binary & Dimension Integrity (>10KB, Valid PNG)',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t2_2_start,
        details: 'No screenshots found in screenshots/ directory to validate.',
        error: isStrict ? new Error('No screenshots available for integrity check') : null,
      });
    } else if (inspection.invalidCount === 0) {
      const sample = inspection.files[0];
      results.push({
        tier: 2,
        id: 'T2.2',
        name: 'Screenshot Image Binary & Dimension Integrity (>10KB, Valid PNG)',
        status: 'PASS',
        durationMs: Date.now() - t2_2_start,
        details: `All ${inspection.count} screenshot files passed binary integrity: valid PNG headers, IHDR chunk, dimensions > 0 (e.g. ${sample.width}x${sample.height}), and file size > 10KB.`,
        meta: {
          totalFiles: inspection.count,
          validCount: inspection.validCount,
          files: inspection.files.map((f) => ({
            name: f.fileName,
            size: f.size,
            dimensions: `${f.width}x${f.height}`,
          })),
        },
      });
    } else {
      const invalidFiles = inspection.files.filter((f) => !f.valid);
      const errors = invalidFiles.map((f) => `${f.fileName}: ${f.error}`).join('; ');
      results.push({
        tier: 2,
        id: 'T2.2',
        name: 'Screenshot Image Binary & Dimension Integrity (>10KB, Valid PNG)',
        status: 'FAIL',
        durationMs: Date.now() - t2_2_start,
        details: `${invalidFiles.length} screenshot files failed binary integrity check: ${errors}`,
        error: new Error(`Failed screenshot integrity: ${errors}`),
        meta: { invalidFiles },
      });
    }
  } catch (err) {
    results.push({
      tier: 2,
      id: 'T2.2',
      name: 'Screenshot Image Binary & Dimension Integrity (>10KB, Valid PNG)',
      status: 'FAIL',
      durationMs: Date.now() - t2_2_start,
      details: `Exception during screenshot integrity validation: ${err.message}`,
      error: err,
    });
  }

  // ==========================================
  // Test 2.3: Link Integrity in UX_AUDIT_REPORT.md
  // ==========================================
  const t2_3_start = Date.now();
  try {
    const report = parseReport(reportPath);

    if (!report.exists) {
      results.push({
        tier: 2,
        id: 'T2.3',
        name: 'Embedded Image Link Integrity in UX_AUDIT_REPORT.md',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t2_3_start,
        details: 'UX_AUDIT_REPORT.md does not exist yet (Milestone 3 in progress).',
        error: isStrict ? new Error('Missing UX_AUDIT_REPORT.md') : null,
      });
    } else if (report.images.length === 0) {
      results.push({
        tier: 2,
        id: 'T2.3',
        name: 'Embedded Image Link Integrity in UX_AUDIT_REPORT.md',
        status: isStrict ? 'FAIL' : 'PENDING',
        durationMs: Date.now() - t2_3_start,
        details: 'No image references found in UX_AUDIT_REPORT.md.',
        error: isStrict ? new Error('Zero images referenced in audit report') : null,
      });
    } else {
      const brokenLinks = [];
      const validLinks = [];

      for (const img of report.images) {
        let resolvedPath;
        if (path.isAbsolute(img.src)) {
          resolvedPath = img.src;
        } else {
          // Normalize leading ./ or audit/ if present
          const cleanSrc = img.src.replace(/^audit\//, '').replace(/^\.\//, '');
          resolvedPath = path.resolve(auditDir, cleanSrc);
        }

        if (fs.existsSync(resolvedPath)) {
          validLinks.push({ src: img.src, resolvedPath });
        } else {
          brokenLinks.push({ src: img.src, resolvedPath });
        }
      }

      if (brokenLinks.length === 0) {
        results.push({
          tier: 2,
          id: 'T2.3',
          name: 'Embedded Image Link Integrity in UX_AUDIT_REPORT.md',
          status: 'PASS',
          durationMs: Date.now() - t2_3_start,
          details: `All ${report.images.length} embedded images in UX_AUDIT_REPORT.md exist and resolve to valid files on disk.`,
          meta: { totalImages: report.images.length, validLinks },
        });
      } else {
        const brokenDesc = brokenLinks.map((b) => b.src).join(', ');
        results.push({
          tier: 2,
          id: 'T2.3',
          name: 'Embedded Image Link Integrity in UX_AUDIT_REPORT.md',
          status: 'FAIL',
          durationMs: Date.now() - t2_3_start,
          details: `Broken image links detected in report: ${brokenDesc}`,
          error: new Error(`Broken image references: ${brokenDesc}`),
          meta: { brokenLinks, validLinks },
        });
      }
    }
  } catch (err) {
    results.push({
      tier: 2,
      id: 'T2.3',
      name: 'Embedded Image Link Integrity in UX_AUDIT_REPORT.md',
      status: 'FAIL',
      durationMs: Date.now() - t2_3_start,
      details: `Exception checking image link integrity: ${err.message}`,
      error: err,
    });
  }

  return results;
}
