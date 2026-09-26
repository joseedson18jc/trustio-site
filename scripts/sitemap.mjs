#!/usr/bin/env node
// Atualiza o <lastmod> de cada URL do sitemap.xml com a data do último commit que mexeu na
// página correspondente (ou hoje, se ela tem alteração ainda não commitada). Assim o Google e o
// Bing sabem o que mudou de verdade, em vez de ver datas paradas de semanas atrás.
//
// Uso:  node scripts/sitemap.mjs          # reescreve o sitemap.xml
//       node scripts/sitemap.mjs --check  # só reporta; sai com 1 se houver data desatualizada
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const ORIGEM = "https://trustio.com.br/";

// https://trustio.com.br/juridico/ → juridico/index.html; …/en/modelos.html → en/modelos.html
export function arquivoDaUrl(url) {
  if (!url.startsWith(ORIGEM)) return null;
  let caminho = url.slice(ORIGEM.length);
  if (caminho === "" || caminho.endsWith("/")) caminho += "index.html";
  return existsSync(join(root, caminho)) ? caminho : null;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function dataDoArquivo(arquivo) {
  const hoje = new Date().toISOString().slice(0, 10);
  if (git("status", "--porcelain", "--", arquivo)) return hoje;
  return git("log", "-1", "--format=%cs", "--", arquivo) || hoje;
}

// Só roda quando chamado direto; o scripts/indexnow.mjs importa apenas arquivoDaUrl.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const caminhoSitemap = join(root, "sitemap.xml");
  const original = await readFile(caminhoSitemap, "utf8");
  const desatualizadas = [];
  const semArquivo = [];

  const novo = original.replace(/<url>([\s\S]*?)<\/url>/g, (bloco, corpo) => {
    const loc = corpo.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const arquivo = loc && arquivoDaUrl(loc);
    if (!arquivo) { semArquivo.push(loc); return bloco; }
    const data = dataDoArquivo(arquivo);
    const atual = corpo.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (atual === data) return bloco;
    desatualizadas.push(`${loc}: ${atual ?? "(sem data)"} → ${data}`);
    return atual
      ? bloco.replace(`<lastmod>${atual}</lastmod>`, `<lastmod>${data}</lastmod>`)
      : bloco.replace(/(<loc>[^<]+<\/loc>)/, `$1\n    <lastmod>${data}</lastmod>`);
  });

  for (const loc of semArquivo) console.error(`sem arquivo para ${loc}`);
  if (check) {
    for (const linha of desatualizadas) console.error(`desatualizado: ${linha}`);
    if (desatualizadas.length || semArquivo.length) process.exit(1);
    console.log("Datas do sitemap já estão em dia.");
  } else {
    if (novo !== original) await writeFile(caminhoSitemap, novo);
    console.log(desatualizadas.length ? `Datas atualizadas em ${desatualizadas.length} URL(s).` : "Datas do sitemap já estão em dia.");
    for (const linha of desatualizadas) console.log(`  ${linha}`);
    if (semArquivo.length) process.exit(1);
  }
}
