#!/usr/bin/env node
// Carimba `?v=<hash>` nos links locais de CSS/JS das páginas (e nos @import de CSS), para que
// qualquer alteração em um asset invalide o cache do navegador/CDN no próximo deploy.
//
// O hash é derivado do conteúdo do arquivo (8 hex de SHA-256): só muda quando o asset muda.
// Idempotente — rodar duas vezes não altera nada. GitHub Pages, Vercel e o worker
// (`url.pathname`) ignoram a query string, então o arquivo servido é o mesmo.
//
// Uso:  node scripts/stamp-asset-versions.mjs          # reescreve os arquivos
//       node scripts/stamp-asset-versions.mjs --check  # só reporta; sai com 1 se houver algo desatualizado
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vercel", "upload", "validation", "voice-mvp"]);
const ASSET_RE = /\.(?:css|js)$/i;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...await walk(join(dir, entry.name)));
    } else if (/\.(?:html|css)$/i.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const hashCache = new Map();
async function hashOf(file) {
  if (!hashCache.has(file)) {
    hashCache.set(file, createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 8));
  }
  return hashCache.get(file);
}

function isLocal(url) {
  return !/^(?:[a-z]+:)?\/\//i.test(url) && !url.startsWith("data:") && !url.startsWith("#");
}

async function resolveAsset(fromFile, url) {
  const target = url.startsWith("/") ? join(root, url) : resolve(dirname(fromFile), url);
  try {
    if ((await stat(target)).isFile()) return target;
  } catch {
    /* não existe */
  }
  return null;
}

// Substitui `url?v=...` (ou `url`) por `url?v=<hash>` em cada ocorrência encontrada por `re`.
async function stamp(file, source, re, pick) {
  let changed = source;
  const missing = [];
  const matches = [...source.matchAll(re)];
  for (const m of matches) {
    const { url, rebuild } = pick(m);
    if (!isLocal(url)) continue;
    const target = await resolveAsset(file, url);
    if (!target) { missing.push(url); continue; }
    const next = rebuild(`${url}?v=${await hashOf(target)}`);
    if (next !== m[0]) changed = changed.replace(m[0], next);
  }
  return { changed, missing };
}

const CSS_IMPORT_RE = /@import\s+(?:url\()?\s*(["']?)([^"')?\s]+\.css)(\?[^"')\s]*)?\1\s*\)?/gi;
const HTML_REF_RE = /\b(href|src)=(["'])([^"'?]+\.(?:css|js))(\?[^"']*)?\2/gi;

const files = await walk(root);
const cssFiles = files.filter((f) => f.endsWith(".css"));
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const report = [];
const warnings = [];

// 1) @import dentro de CSS — repete até estabilizar (um CSS que importa outro muda de hash quando o importado muda).
for (let pass = 0; pass < 5; pass++) {
  let touched = false;
  for (const file of cssFiles) {
    const source = await readFile(file, "utf8");
    const { changed, missing } = await stamp(file, source, CSS_IMPORT_RE, (m) => ({
      url: m[2],
      rebuild: (u) => m[0].replace(m[2] + (m[3] ?? ""), u),
    }));
    missing.forEach((u) => warnings.push(`${relative(root, file)}: @import não encontrado: ${u}`));
    if (changed !== source) {
      touched = true;
      hashCache.delete(file);
      if (!check) await writeFile(file, changed);
      else hashCache.set(file, createHash("sha256").update(changed).digest("hex").slice(0, 8));
      report.push(relative(root, file));
    }
  }
  if (!touched) break;
}

// 2) href/src nas páginas.
for (const file of htmlFiles) {
  const source = await readFile(file, "utf8");
  const { changed, missing } = await stamp(file, source, HTML_REF_RE, (m) => ({
    url: m[3],
    rebuild: (u) => `${m[1]}=${m[2]}${u}${m[2]}`,
  }));
  missing.forEach((u) => warnings.push(`${relative(root, file)}: asset não encontrado: ${u}`));
  if (changed !== source) {
    if (!check) await writeFile(file, changed);
    report.push(relative(root, file));
  }
}

for (const w of warnings) console.warn(`aviso: ${w}`);
if (report.length === 0) {
  console.log("Versões dos assets já estão em dia.");
} else if (check) {
  console.error(`Versões desatualizadas em ${report.length} arquivo(s) — rode \`npm run stamp\`:\n  ${[...new Set(report)].join("\n  ")}`);
  process.exit(1);
} else {
  console.log(`Versões carimbadas em ${new Set(report).size} arquivo(s):\n  ${[...new Set(report)].join("\n  ")}`);
}
