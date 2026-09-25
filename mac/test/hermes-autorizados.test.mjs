// Exercita o mac/hermes-autorizados.sh com um servidor e um `hermes` falsos: nada sai para a
// rede e nada toca o Hermes de verdade. Precisa de bash, python3 e curl.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../hermes-autorizados.sh", import.meta.url));
const raiz = mkdtempSync(join(tmpdir(), "hermes-sync-"));
const home = join(raiz, "home"), hermesDir = join(home, ".hermes"), bin = join(raiz, "bin");
mkdirSync(hermesDir, { recursive: true }); mkdirSync(bin);
const envFile = join(hermesDir, ".env"), fixos = join(hermesDir, "allowed-fixos.txt");
const aplicado = join(hermesDir, "allowed-aplicado.txt"), reinicios = join(raiz, "reinicios.log");
const falhaReinicio = join(raiz, "reinicio-falha");

writeFileSync(join(home, ".trustio-hermes-sync-key"), "segredo");
writeFileSync(envFile, "WHATSAPP_ENABLED=true\nWHATSAPP_ALLOWED_USERS=5511991921181\nWHATSAPP_MODE=bot\n");
chmodSync(envFile, 0o640);
// `hermes` falso: registra cada chamada e falha quando o arquivo de falha existe.
writeFileSync(join(bin, "hermes"), `#!/bin/bash\necho "$*" >> "${reinicios}"\n[ -e "${falhaReinicio}" ] && exit 1 || exit 0\n`);
chmodSync(join(bin, "hermes"), 0o755);

// Servidor falso da função: devolve `numeros`, ou `status` de erro, e confere o segredo.
let resposta = { status: 200, numeros: [] };
const servidor = createServer((req, res) => {
  if (req.headers["x-trustio-segredo"] !== "segredo") { res.writeHead(401).end(); return; }
  if (resposta.status !== 200) { res.writeHead(resposta.status).end(); return; }
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ numeros: resposta.numeros }));
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${servidor.address().port}/`;

// O servidor roda neste processo: o script roda assíncrono para não travar o event loop.
function rodar() {
  return new Promise((resolve) => {
    const p = spawn("bash", [SCRIPT], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, TRUSTIO_HERMES_URL: url } });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    p.on("close", () => resolve(saida));
  });
}
const lista = () => (readFileSync(envFile, "utf8").match(/^WHATSAPP_ALLOWED_USERS=(.*)$/m) || [])[1];
const nReinicios = () => (existsSync(reinicios) ? readFileSync(reinicios, "utf8").trim().split("\n").filter(Boolean).length : 0);
const marcador = () => (existsSync(aplicado) ? readFileSync(aplicado, "utf8") : null);

let falhas = 0;
function check(cond, msg, extra) {
  console.log((cond ? "  ok   " : "  FALHA") + "  " + msg + (extra ? "  → " + extra : ""));
  if (!cond) falhas++;
}

// 1. Sem o arquivo de fixos, nada muda (não há semente automática).
resposta = { status: 200, numeros: ["5511900000001"] };
await rodar();
check(lista() === "5511991921181" && nReinicios() === 0, "sem allowed-fixos.txt não mexe em nada", lista());

// 2. Fixos (um sem DDI) + teste ativo: aplica, normaliza e reinicia.
writeFileSync(fixos, "5511991921181\n11976759745\n");
await rodar();
check(lista() === "5511900000001,5511976759745,5511991921181", "junta fixos e testes, com 55 no número sem DDI", lista());
check(nReinicios() === 1 && marcador() === lista(), "reinicia e marca a lista como aplicada");

// 3. Nada mudou: não reinicia.
await rodar();
check(nReinicios() === 1, "lista igual não reinicia o gateway");

// 4. Consulta falha: mantém tudo.
resposta = { status: 500 };
await rodar();
check(lista() === "5511900000001,5511976759745,5511991921181" && nReinicios() === 1, "erro na consulta mantém a lista");

// 5. Teste vence e o reinício falha: o marcador fica na lista antiga...
resposta = { status: 200, numeros: [] };
writeFileSync(falhaReinicio, "");
await rodar();
check(lista() === "5511976759745,5511991921181", "teste vencido sai do .env", lista());
check(marcador() === "5511900000001,5511976759745,5511991921181", "reinício que falhou não marca a lista como aplicada");
// ...e a execução seguinte, com o reinício funcionando, aplica sozinha.
rmSync(falhaReinicio);
await rodar();
check(marcador() === "5511976759745,5511991921181", "a execução seguinte reinicia e aplica");

// 6. .env divergente do marcador (reinício falhou e a lista voltou ao valor aplicado): corrige.
writeFileSync(falhaReinicio, "");
resposta = { status: 200, numeros: ["5511900000002"] };
await rodar();
check(lista().includes("5511900000002") && !marcador().includes("5511900000002"), "lista intermediária gravada sem reinício");
rmSync(falhaReinicio);
resposta = { status: 200, numeros: [] };
const antes = nReinicios();
await rodar();
check(lista() === "5511976759745,5511991921181" && nReinicios() === antes + 1, ".env divergente é corrigido e o gateway reinicia", lista());

// 7. Sem fixos e sem testes: sentinela, nunca "sem lista".
writeFileSync(fixos, "");
await rodar();
check(lista() === "000000000000" && marcador() === "000000000000", "lista vazia vira número inexistente e fecha o gateway", lista());

// 8. O .env mantém permissões, as outras linhas e não deixa temporários.
check((statSync(envFile).mode & 0o777) === 0o640, "permissões do .env preservadas");
check(/^WHATSAPP_MODE=bot$/m.test(readFileSync(envFile, "utf8")), "outras linhas do .env preservadas");
check(!readdirSync(hermesDir).some((f) => f.startsWith(".env.")), "sem arquivos temporários sobrando");

servidor.close();
rmSync(raiz, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
