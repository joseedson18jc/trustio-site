// Exercita a parte HTTP do serviço de WhatsApp do Mac (mac/whatsapp/http.mjs) com um WhatsApp
// falso: nada sai para a rede e o Baileys nem é carregado.
import { criarServidor, normalizarNumero } from "../whatsapp/http.mjs";

const CHAVE = "chave-de-teste-0123456789";
const enviados = [];
const semWhatsapp = new Set(["5511900000009"]);
let conectado = true;
let falhaNoEnvio = false;

const servidor = criarServidor({
  chave: CHAVE,
  instancia: "trustio",
  whatsapp: {
    conectado: () => conectado,
    existe: async (numero) => (semWhatsapp.has(numero) ? null : `${numero}@s.whatsapp.net`),
    enviar: async (jid, texto) => {
      if (falhaNoEnvio) throw new Error("socket fechado");
      enviados.push({ jid, texto, em: Date.now() });
      return `ID${enviados.length}`;
    },
  },
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;

// Mesma chamada da função aviso-agente (corpo com "text" e "textMessage").
function enviar(corpo, { chave = CHAVE, instancia = "trustio", metodo = "POST", bruto } = {}) {
  return fetch(`${base}/message/sendText/${instancia}`, {
    method: metodo,
    headers: { apikey: chave, "Content-Type": "application/json" },
    body: metodo === "POST" ? (bruto ?? JSON.stringify(corpo)) : undefined,
  });
}

let falhas = 0;
async function check(cond, msg, extra) {
  const ok = await cond;
  console.log((ok ? "  ok   " : "  FALHA") + "  " + msg + (extra ? "  → " + extra : ""));
  if (!ok) falhas++;
}
const status = async (p) => (await p).status;
const erro = async (p) => (await (await p).json()).error;

// Números: a mesma regra da função aviso-agente.
await check(normalizarNumero("(11) 98888-7777") === "5511988887777", "número sem DDI ganha o 55");
await check(normalizarNumero("5511988887777") === "5511988887777", "número completo fica igual");
await check(normalizarNumero("123") === null && normalizarNumero("1193838383883300") === null, "número curto ou longo demais é recusado");

// Saúde: pública, sem número nem segredo.
const saude = await (await fetch(`${base}/saude`)).json();
await check(saude.ok === true && saude.conectado === true && Object.keys(saude).length === 2, "GET /saude só diz se está conectado", JSON.stringify(saude));

// Autenticação e rota.
await check((await status(enviar({ number: "11988887777", text: "oi" }, { chave: "errada" }))) === 401, "chave errada → 401");
await check((await status(enviar({ number: "11988887777", text: "oi" }, { chave: "" }))) === 401, "sem chave → 401");
await check((await status(enviar({ number: "11988887777", text: "oi" }, { instancia: "outra" }))) === 404, "instância errada → 404");
await check((await status(enviar(null, { metodo: "GET" }))) === 405, "GET no envio → 405");
await check((await status(fetch(`${base}/instance/fetchInstances`))) === 404, "outras rotas da Evolution → 404");

// Validação do corpo.
await check((await erro(enviar(null, { bruto: "{não é json" }))) === "json_invalido", "JSON inválido → json_invalido");
await check((await erro(enviar({ number: "123", text: "oi" }))) === "numero_invalido", "número inválido → numero_invalido");
await check((await erro(enviar({ number: "11988887777", text: "   " }))) === "texto_vazio", "texto vazio → texto_vazio");
await check((await erro(enviar({ number: "11988887777", text: "x".repeat(5000) }))) === "texto_grande", "texto grande → texto_grande");
await check((await status(enviar(null, { bruto: JSON.stringify({ number: "11988887777", text: "x".repeat(70000) }) }))) === 413, "corpo acima de 64 KB → 413");

// Envio.
const r = await enviar({ number: "11988887777", text: "Olá!", textMessage: { text: "Olá!" } });
const corpo = await r.json();
await check(r.status === 201 && corpo.key?.id === "ID1", "envio aceito → 201 com o id da mensagem", JSON.stringify(corpo));
await check(enviados[0]?.jid === "5511988887777@s.whatsapp.net" && enviados[0]?.texto === "Olá!", "manda para o número com 55", JSON.stringify(enviados[0]));
await check((await status(enviar({ number: "5511977776666", textMessage: { text: "v1" } }))) === 201 && enviados[1]?.texto === "v1", "aceita o formato v1 (textMessage)");
await check((await erro(enviar({ number: "11900000009", text: "oi" }))) === "numero_sem_whatsapp" && enviados.length === 2, "número sem WhatsApp → 400, nada enviado");

// Um envio por vez, com intervalo entre eles.
const antes = enviados.length;
await Promise.all([enviar({ number: "11911110001", text: "a" }), enviar({ number: "11911110002", text: "b" })]);
const [a, b] = enviados.slice(antes);
await check(a && b && b.em - a.em >= 1400, "envios simultâneos saem em fila, com intervalo", b && a ? `${b.em - a.em} ms` : "");

// Falhas do WhatsApp.
falhaNoEnvio = true;
await check((await erro(enviar({ number: "11988887777", text: "oi" }))) === "falha_no_envio", "erro no socket → 500 falha_no_envio");
falhaNoEnvio = false;
conectado = false;
await check((await status(enviar({ number: "11988887777", text: "oi" }))) === 503, "desconectado → 503");

// A chave curta não sobe o servidor.
let recusou = false;
try { criarServidor({ chave: "curta", instancia: "x", whatsapp: {} }); } catch { recusou = true; }
await check(recusou, "chave com menos de 16 caracteres é recusada");

servidor.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
