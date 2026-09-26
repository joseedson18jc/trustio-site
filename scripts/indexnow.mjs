#!/usr/bin/env node
// Avisa Bing, Yandex, Seznam, Naver e os demais buscadores do IndexNow que páginas do site
// mudaram, para serem rastreadas de novo em horas, não semanas. O índice do Bing também
// alimenta a busca do ChatGPT, o Copilot e o DuckDuckGo.
//
// A chave é o nome do arquivo <chave>.txt na raiz do site (o conteúdo é a própria chave); o
// buscador baixa esse arquivo para confirmar que o aviso veio do dono do domínio.
//
// Uso:  node scripts/indexnow.mjs --all                    # todas as URLs do sitemap.xml
//       node scripts/indexnow.mjs --changed <de> <até>     # só as páginas alteradas entre dois commits
//       node scripts/indexnow.mjs --dry-run …              # mostra o que enviaria, sem enviar
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { arquivoDaUrl } from "./sitemap.mjs";

const root = resolve(import.meta.dirname, "..");
const HOST = "trustio.com.br";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const chave = (await readdir(root)).map((f) => f.match(/^([0-9a-f]{32})\.txt$/)?.[1]).find(Boolean);
if (!chave) { console.error("Arquivo de chave <32 hex>.txt não encontrado na raiz."); process.exit(1); }

const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
const todas = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

let urls = todas;
const i = args.indexOf("--changed");
if (i !== -1) {
  const [de, ate] = [args[i + 1], args[i + 2]];
  const alterados = new Set(execFileSync("git", ["diff", "--name-only", de, ate], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean));
  urls = todas.filter((url) => alterados.has(arquivoDaUrl(url)));
} else if (!args.includes("--all")) {
  console.error("Use --all ou --changed <de> <até>.");
  process.exit(1);
}

if (!urls.length) { console.log("Nenhuma página do sitemap mudou; nada a avisar."); process.exit(0); }
console.log(`${dryRun ? "Enviaria" : "Enviando"} ${urls.length} URL(s):`);
for (const url of urls) console.log(`  ${url}`);
if (dryRun) process.exit(0);

const resposta = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: chave, keyLocation: `https://${HOST}/${chave}.txt`, urlList: urls }),
});
// 200 e 202 são sucesso (202: chave ainda em validação). 403: arquivo da chave não encontrado no site.
console.log(`IndexNow respondeu ${resposta.status} ${resposta.statusText}`);
if (resposta.status !== 200 && resposta.status !== 202) {
  console.error(await resposta.text());
  process.exit(1);
}
