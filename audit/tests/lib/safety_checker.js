import fs from 'fs';
import path from 'path';

/**
 * Checks Luhn algorithm validity for a given numeric string.
 *
 * @param {string} numStr
 * @returns {boolean}
 */
export function isValidLuhn(numStr) {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Known credit card prefix patterns:
 * Visa: 4... (13 or 16 digits)
 * Mastercard: 51-55 or 2221-2720 (16 digits)
 * Amex: 34 or 37 (15 digits)
 * Diners: 300-305, 36, 38 (14-16 digits)
 * Elo: 4011, 4312, 4389, 4514, 4576, 5041, 5066, 5090, 6277, 6362, 6363, 6504, 6505, 6516, 6550 (16 digits)
 * Hipercard: 606282 (16 digits)
 */
const CARD_PREFIX_REGEX = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|2(?:22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|6504|6505|6516|6550)[0-9]{12}|606282[0-9]{10})$/;

/**
 * Scans a single text content for safety violations:
 * - Credit card PANs with valid Luhn
 * - Private key headers
 * - Live production API keys (Stripe, GitHub, Supabase service keys)
 * - Live payment execution calls
 *
 * @param {string} content - Text content to scan.
 * @param {string} [sourcePath='inline'] - Identifier for reporting.
 * @returns {Array<object>} List of detected violations.
 */
export function scanTextForSafety(content, sourcePath = 'inline') {
  const violations = [];

  // 1. Scan for Credit Card PANs
  // Match candidate digit sequences (with optional dashes or spaces)
  const candidatePanRegex = /\b(?:\d[ -]*?){13,19}\b/g;
  let match;
  while ((match = candidatePanRegex.exec(content)) !== null) {
    const rawMatch = match[0];
    const digitsOnly = rawMatch.replace(/\D/g, '');

    // Skip all identical digits (e.g. 0000000000000000) or test cards explicitly marked as test
    if (/^(\d)\1+$/.test(digitsOnly)) continue;

    // Check if it matches known card prefixes AND passes Luhn
    if (CARD_PREFIX_REGEX.test(digitsOnly) && isValidLuhn(digitsOnly)) {
      // Exclude obvious timestamp/ID patterns unless they look like cards
      violations.push({
        type: 'CREDIT_CARD_PAN',
        source: sourcePath,
        detail: `Potential valid credit card PAN detected: ${digitsOnly.slice(0, 4)}...${digitsOnly.slice(-4)}`,
      });
    }
  }

  // 2. Scan for Private Keys
  const privateKeyRegex = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;
  if (privateKeyRegex.test(content)) {
    violations.push({
      type: 'PRIVATE_KEY',
      source: sourcePath,
      detail: 'Private key header found in file content',
    });
  }

  // 3. Scan for Live Stripe API keys
  const stripeLiveRegex = /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g;
  if (stripeLiveRegex.test(content)) {
    violations.push({
      type: 'LIVE_STRIPE_KEY',
      source: sourcePath,
      detail: 'Live Stripe secret key pattern detected (sk_live_ / rk_live_)',
    });
  }

  // 4. Scan for GitHub Personal Access Tokens
  const ghTokenRegex = /\bghp_[0-9a-zA-Z]{36}\b/g;
  if (ghTokenRegex.test(content)) {
    violations.push({
      type: 'GITHUB_PAT',
      source: sourcePath,
      detail: 'Live GitHub Personal Access Token detected (ghp_)',
    });
  }

  // 5. Scan for live payment executions in code (not documentation)
  // Looking for live charge creations or capture calls that aren't commented or dry-run
  const livePaymentCallRegex = /\bstripe\.(?:charges|paymentIntents)\.(?:create|confirm)\s*\(\s*\{(?![^}]*['"]test['"])/g;
  if (livePaymentCallRegex.test(content)) {
    violations.push({
      type: 'LIVE_PAYMENT_EXECUTION',
      source: sourcePath,
      detail: 'Live Stripe payment execution invocation detected in script',
    });
  }

  return violations;
}

/**
 * Recursively scans directory for safety violations in all text files.
 *
 * @param {string} rootDir - Root directory to scan.
 * @param {object} [options]
 * @param {Array<string>} [options.extensions] - Allowed extensions.
 * @param {Array<string>} [options.ignoreDirs] - Directory names to skip.
 * @returns {object} Scan summary and list of violations.
 */
export function scanDirectoryForSafety(rootDir, options = {}) {
  const allowedExts = options.extensions || ['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.sh', '.html'];
  const ignoreDirs = new Set(options.ignoreDirs || ['.git', 'node_modules', '.agents']);

  const violations = [];
  let filesScanned = 0;

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExts.includes(ext)) {
          filesScanned++;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const fileViolations = scanTextForSafety(content, fullPath);
            if (fileViolations.length > 0) {
              violations.push(...fileViolations);
            }
          } catch {
            // Ignore unreadable/binary files
          }
        }
      }
    }
  }

  walk(rootDir);

  return {
    safe: violations.length === 0,
    filesScanned,
    violations,
  };
}
