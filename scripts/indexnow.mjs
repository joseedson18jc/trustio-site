#!/usr/bin/env node
// Avisa Bing, Yandex, Seznam, Naver e os demais buscadores do IndexNow que páginas do site
// mudaram, para serem rastreadas de novo em horas, não semanas. O índice do Bing também
// alimenta a busca do ChatGPT, o Copilot e o DuckDuckGo.
//
// A chave é o nome do arquivo <chave>.txt na raiz do site (o conteúdo é a própria chave); o
// buscador baixa esse arquivo para confirmar que o aviso veio do dono do domínio.
//
// Uso:  node scripts/indexnow.mjs --all                    # todas as URLs do sitemap.xml
//       node scripts/indexnow.mjs --changed <de> <até>     # páginas alteradas ou apagadas entre
//                                                          # dois commits, e URLs que entraram ou
//                                                          # saíram do sitemap
//       … --wait      antes de avisar, espera o site publicado (a chave no ar e, no --changed,
//                     cada página nova ou alterada servida por um deploy posterior ao commit, e
//                     cada página apagada respondendo 404)
//       … --dry-run   mostra o que enviaria, sem enviar
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { arquivoDaUrl, caminhoDaUrl } from "./sitemap.mjs";

const root = resolve(import.meta.dirname, "..");
const HOST = "trustio.com.br";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const esperar = args.includes("--wait");

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" });
const urlsDoSitemap = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const chave = (await readdir(root)).map((f) => f.match(/^([0-9a-f]{32})\.txt$/)?.[1]).find(Boolean);
if (!chave) { console.error("Arquivo de chave <32 hex>.txt não encontrado na raiz."); process.exit(1); }

const atuais = urlsDoSitemap(await readFile(join(root, "sitemap.xml"), "utf8"));
let urls = atuais;
let momentoDoCommit = 0;

const i = args.indexOf("--changed");
if (i !== -1) {
  const [de, ate] = [args[i + 1], args[i + 2]];
  let anteriores = [];
  try { anteriores = urlsDoSitemap(git("show", `${de}:sitemap.xml`)); } catch { /* sitemap não existia */ }
  // Arquivos alterados, criados ou apagados (o caminho antigo de um arquivo renomeado também conta).
  const alterados = new Set(git("diff", "--name-only", "--no-renames", de, ate).split("\n").filter(Boolean));
  const antes = new Set(anteriores), depois = new Set(atuais);
  urls = [...new Set([...anteriores, ...atuais])].filter((url) =>
    alterados.has(caminhoDaUrl(url)) || antes.has(url) !== depois.has(url));
  momentoDoCommit = Number(git("log", "-1", "--format=%ct", ate).trim()) * 1000;
} else if (!args.includes("--all")) {
  console.error("Use --all ou --changed <de> <até>.");
  process.exit(1);
}

if (!urls.length) { console.log("Nenhuma página do sitemap mudou; nada a avisar."); process.exit(0); }
console.log(`${dryRun ? "Enviaria" : "Enviando"} ${urls.length} URL(s):`);
for (const url of urls) console.log(`  ${url}${arquivoDaUrl(url) ? "" : " (apagada)"}`);
if (dryRun) process.exit(0);

// O parâmetro fura o cache da CDN; o GitHub Pages ignora a query e serve o arquivo.
async function consultar(url) {
  const alvo = new URL(url);
  alvo.searchParams.set("indexnow", String(Date.now()));
  try { return await fetch(alvo, { method: "GET", redirect: "manual", cache: "no-store" }); } catch { return null; }
}

async function publicado(url) {
  const r = await consultar(url);
  if (!r) return false;
  if (!arquivoDaUrl(url)) return r.status === 404;
  const modificado = Date.parse(r.headers.get("last-modified") ?? "");
  return r.status === 200 && (!momentoDoCommit || modificado >= momentoDoCommit);
}

if (esperar) {
  const limite = Date.now() + 15 * 60 * 1000;
  const pendentes = new Set([`https://${HOST}/${chave}.txt`, ...(momentoDoCommit ? urls : [])]);
  while (pendentes.size) {
    for (const url of [...pendentes]) {
      const ok = url.endsWith(`/${chave}.txt`)
        ? (await (await consultar(url))?.text())?.trim() === chave
        : await publicado(url);
      if (ok) pendentes.delete(url);
    }
    if (!pendentes.size) break;
    if (Date.now() > limite) {
      console.error(`O site não publicou a tempo (15 min). Ainda pendentes:\n  ${[...pendentes].join("\n  ")}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.log("Site publicado; avisando.");
}

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
