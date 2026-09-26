import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workerPath = resolve(root, "dist/server/index.js");
const manifestPath = resolve(root, "dist/.openai/hosting.json");

await access(workerPath);
const hosting = JSON.parse(await readFile(manifestPath, "utf8"));
if (!hosting.project_id) throw new Error("Hosting manifest is missing project_id.");

const worker = (await import(`${workerPath}?validation=${Date.now()}`)).default;
if (!worker || typeof worker.fetch !== "function") throw new Error("Worker must export a callable fetch function.");

for (const [path, expectedStatus, expectedType] of [
  ["/", 200, "text/html"],
  ["/manifesto.html", 200, "text/html"],
  ["/privacidade.html", 200, "text/html"],
  ["/seats.html", 200, "text/html"],
  ["/juridico/", 200, "text/html"],
  ["/voice.html", 200, "text/html"],
  ["/agentio.html", 200, "text/html"],
  ["/planos.html", 200, "text/html"],
  ["/console/", 200, "text/html"],
  ["/cadastro.html", 200, "text/html"],
  ["/entrar.html", 200, "text/html"],
  ["/app/", 200, "text/html"],
  ["/crm/", 200, "text/html"],
  ["/admin/", 200, "text/html"],
  ["/assets/vendor/supabase.js", 200, "text/javascript"],
  ["/assets/styles.css", 200, "text/css"],
  ["/assets/juridico.css", 200, "text/css"],
  ["/assets/app.js", 200, "text/javascript"],
  ["/missing-page", 404, "text/html"],
  ["/en", 200, "text/html"],
  ["/en/", 200, "text/html"],
  ["/en/voice", 200, "text/html"],
  ["/en/agentio.html", 200, "text/html"],
  ["/en/planos.html", 200, "text/html"],
  ["/en/juridico/", 200, "text/html"],
  ["/en/console/", 200, "text/html"],
  ["/en/app/", 200, "text/html"],
  ["/en/cadastro", 200, "text/html"],
  ["/en/seats", 200, "text/html"],
  ["/en/crm/", 404, "text/html"],
  ["/en/missing-page", 404, "text/html"],
]) {
  const response = await worker.fetch(new Request(`https://trustio.example${path}`));
  if (response.status !== expectedStatus) throw new Error(`${path} returned ${response.status}.`);
  if (!response.headers.get("content-type")?.startsWith(expectedType)) {
    throw new Error(`${path} returned the wrong content type.`);
  }
}

// Aliases que redirecionam para a página canônica (a página usa caminhos relativos, então
// não pode ser servida sob /agentio/).
for (const [path, expectedLocation] of [
  ["/agentio", "/agentio.html"],
  ["/agentio/", "/agentio.html"],
  ["/agentio/?utm=x", "/agentio.html?utm=x"],
  ["/en/agentio", "/en/agentio.html"],
  ["/en/agentio/", "/en/agentio.html"],
]) {
  const response = await worker.fetch(new Request(`https://trustio.example${path}`));
  if (response.status !== 308) throw new Error(`${path} returned ${response.status}, expected 308.`);
  const location = new URL(response.headers.get("location") ?? "", "https://trustio.example");
  if (location.origin !== "https://trustio.example" || location.pathname + location.search !== expectedLocation) {
    throw new Error(`${path} redirected to ${response.headers.get("location")}, expected ${expectedLocation}.`);
  }
}

// O Cloudflare injeta o script do Web Analytics em todas as páginas; a CSP (a do cabeçalho do
// worker e a da própria página do chat) precisa liberar o script e o envio, senão o chat some
// das estatísticas sem nenhum outro sinal.
const ANALYTICS = [["script-src", "https://static.cloudflareinsights.com"], ["connect-src", "https://cloudflareinsights.com"]];
const diretiva = (csp, nome) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(nome + " ")) ?? "").split(/\s+/);
for (const path of ["/app/", "/en/app/"]) {
  const response = await worker.fetch(new Request(`https://trustio.example${path}`));
  const header = response.headers.get("content-security-policy") ?? "";
  const meta = (await response.text()).match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? "";
  for (const [onde, csp] of [["cabeçalho", header], ["meta", meta]]) {
    for (const [nome, origem] of ANALYTICS) {
      if (!diretiva(csp, nome).includes(origem)) throw new Error(`${path}: CSP (${onde}) não libera ${origem} em ${nome}.`);
    }
  }
}

console.log("Trustio production artifact is valid.");
