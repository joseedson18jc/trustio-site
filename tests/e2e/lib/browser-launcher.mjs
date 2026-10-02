import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
];

/**
 * Resolve playwright-core module dynamically.
 */
export async function getPlaywrightChromium() {
  // 1. Try standard require / import
  try {
    const pw = require('playwright-core');
    if (pw?.chromium) return pw.chromium;
  } catch {}

  // 2. Try NPX cache search
  const homeDir = process.env.HOME || '';
  const npxCacheBase = path.join(homeDir, '.npm/_npx');
  if (fs.existsSync(npxCacheBase)) {
    try {
      const dirs = fs.readdirSync(npxCacheBase);
      for (const d of dirs) {
        const candidate = path.join(npxCacheBase, d, 'node_modules/playwright-core');
        if (fs.existsSync(candidate)) {
          try {
            const pw = require(candidate);
            if (pw?.chromium) return pw.chromium;
          } catch {}
        }
      }
    } catch {}
  }

  // 3. Known local candidate locations
  const knownCandidates = [
    path.join(homeDir, 'neurociencia-channel/agenttube/node_modules/playwright-core'),
    path.join(homeDir, 'neurociencia-channel/autosocial/node_modules/playwright-core'),
    path.join(homeDir, 'OrnithAgent/agent/node_modules/playwright-core'),
    path.join(homeDir, 'linkedin-agent/node_modules/playwright-core'),
    path.join(homeDir, '.bun/install/cache/playwright-core'),
  ];

  for (const cand of knownCandidates) {
    if (fs.existsSync(cand)) {
      try {
        const pw = require(cand);
        if (pw?.chromium) return pw.chromium;
      } catch {}
    }
  }

  throw new Error(
    'playwright-core could not be located in standard node_modules, ~/.npm/_npx cache, or local candidate paths.'
  );
}

/**
 * Locate system Chrome binary path.
 */
export function getChromeExecutablePath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Launch headless Google Chrome via playwright-core.
 * @param {object} options
 * @returns {Promise<{ browser: import('playwright-core').Browser, close: () => Promise<void> }>}
 */
export async function launchBrowser(options = {}) {
  const chromium = await getPlaywrightChromium();
  const chromePath = getChromeExecutablePath();

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  const launchOptions = {
    headless: options.headless !== undefined ? options.headless : true,
    args: launchArgs,
  };

  if (chromePath) {
    launchOptions.executablePath = chromePath;
  } else {
    launchOptions.channel = 'chrome';
  }

  const browser = await chromium.launch(launchOptions);

  return {
    browser,
    close: async () => {
      try {
        await browser.close();
      } catch {}
    },
  };
}
