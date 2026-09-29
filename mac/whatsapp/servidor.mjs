// Trustio · serviço de WhatsApp do Mac (Baileys), no lugar da Evolution API.
//
// Conecta como aparelho vinculado de um WhatsApp (QR code ou código de pareamento) e expõe, só em
// 127.0.0.1, o endpoint da Evolution que a função aviso-agente usa (ver http.mjs). O túnel da
// Cloudflare leva evolution.trustio.com.br até aqui. Mensagens recebidas são ignoradas: o serviço
// só envia o aviso de boas-vindas do teste do Agentio.
//
// Configuração em ~/.trustio-whatsapp/config.json (criado pelo instalar.sh, modo 600):
//   { "chave": "<EVOLUTION_API_KEY>", "instancia": "<EVOLUTION_INSTANCE>", "porta": 8080 }
// A sessão do WhatsApp fica em ~/.trustio-whatsapp/sessao/. Para parear por código em vez de QR:
//   WA_PAREAR=5511999999999 node servidor.mjs
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { criarServidor, normalizarNumero } from "./http.mjs";

const DIR = process.env.WA_DIR ?? join(homedir(), ".trustio-whatsapp");
const SESSAO = join(DIR, "sessao");
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

const config = JSON.parse(readFileSync(join(DIR, "config.json"), "utf8"));
const porta = Number(config.porta ?? 8080);

let sock = null;
let conectado = false;
let tentativas = 0;
let pedidoDeCodigo = false;

async function conectar() {
  // Cada socket novo pede o próprio código de pareamento (o anterior morre com a conexão).
  pedidoDeCodigo = false;
  const { state, saveCreds } = await useMultiFileAuthState(SESSAO);
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "error" }),
    browser: Browsers.macOS("Trustio"),
    // Sem "online" permanente: o celular continua recebendo as notificações.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const numero = normalizarNumero(process.env.WA_PAREAR);
      if (numero && !pedidoDeCodigo) {
        pedidoDeCodigo = true;
        try {
          const codigo = await sock.requestPairingCode(numero);
          log(`código de pareamento: ${codigo}  (WhatsApp → Aparelhos conectados → Conectar com número de telefone)`);
        } catch (e) {
          // Sem código, o próximo QR tenta de novo.
          pedidoDeCodigo = false;
          log(`falha ao pedir o código: ${e.message}`);
        }
      } else if (!numero) {
        log("escaneie o QR no WhatsApp → Aparelhos conectados → Conectar um aparelho:");
        qrcode.generate(qr, { small: true });
      }
    }
    if (connection === "open") {
      conectado = true; tentativas = 0;
      log(`conectado ao WhatsApp (${(sock.user?.id ?? "").split(":")[0].split("@")[0].replace(/^(\d{4})\d+(\d{2})$/, "$1…$2")})`);
    }
    if (connection === "close") {
      conectado = false;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        // A sessão foi desconectada pelo celular: as credenciais não servem mais. Apaga e volta a
        // pedir um QR novo (no log) para parear de novo.
        log("sessão desconectada pelo celular; apagando a sessão para parear de novo");
        rmSync(SESSAO, { recursive: true, force: true });
      }
      tentativas += 1;
      const espera = Math.min(300, 2 ** Math.min(tentativas, 8)) * 1000;
      log(`conexão fechada (código ${codigo ?? "?"}); nova tentativa em ${espera / 1000} s`);
      setTimeout(() => conectar().catch((e) => log(`falha ao conectar: ${e.message}`)), espera);
    }
  });
}

const servidor = criarServidor({
  chave: config.chave,
  instancia: config.instancia,
  log,
  whatsapp: {
    conectado: () => conectado,
    existe: async (numero) => {
      const [r] = (await sock.onWhatsApp(numero)) ?? [];
      return r?.exists ? r.jid : null;
    },
    enviar: async (jid, texto) => (await sock.sendMessage(jid, { text: texto }))?.key?.id,
  },
});

// Só na interface local: quem chega de fora passa pelo túnel da Cloudflare.
servidor.listen(porta, "127.0.0.1", () => log(`ouvindo em http://127.0.0.1:${porta} (instância ${config.instancia})`));
servidor.on("error", (e) => { log(`não abriu a porta ${porta}: ${e.message}`); process.exit(1); });

if (!existsSync(join(SESSAO, "creds.json"))) log("sem sessão salva: aguarde o QR (ou o código, com WA_PAREAR)");
conectar().catch((e) => { log(`falha ao conectar: ${e.message}`); process.exit(1); });

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => { log("encerrando"); servidor.close(); sock?.end?.(undefined); process.exit(0); });
}
