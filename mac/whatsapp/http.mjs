// Trustio · a parte HTTP do serviço de WhatsApp do Mac, separada do Baileys para ser testada sem
// WhatsApp de verdade (mac/test/whatsapp.test.mjs).
//
// Responde como a Evolution API no único endpoint que a função aviso-agente usa:
//   POST /message/sendText/<instância>   cabeçalho apikey, corpo {number, text} (v2) ou
//                                         {number, textMessage: {text}} (v1)
// Assim os segredos EVOLUTION_URL, EVOLUTION_INSTANCE e EVOLUTION_API_KEY continuam valendo e a
// função não muda. GET /saude diz só se o WhatsApp está conectado (sem número nem segredo).
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const LIMITE_CORPO = 64 * 1024;
const LIMITE_TEXTO = 4096;

// Mesma regra da função aviso-agente e do hermes-autorizados.sh: só dígitos, e número brasileiro
// sem DDI (10 ou 11 dígitos) ganha o 55. Fora de 12 a 15 dígitos, não é um número completo.
export function normalizarNumero(n) {
  let d = String(n ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

function iguais(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function responder(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on("data", (p) => {
      tamanho += p.length;
      if (tamanho > LIMITE_CORPO) { reject(Object.assign(new Error("grande"), { status: 413 })); return; }
      partes.push(p);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

// whatsapp: { conectado(): boolean, existe(numero): Promise<string|null> (o jid, ou null se o
// número não tem WhatsApp), enviar(jid, texto): Promise<string|undefined> (o id da mensagem) }.
export function criarServidor({ chave, instancia, whatsapp, log = () => {}, intervaloMs = 1500, prazoFilaMs = 7000, prazoConsultaMs = 4000 }) {
  if (!chave || chave.length < 16) throw new Error("chave ausente ou curta (mínimo 16 caracteres)");
  if (!instancia) throw new Error("instância ausente");
  const rota = `/message/sendText/${encodeURIComponent(instancia)}`;

  // Um envio por vez, com intervalo: rajadas de mensagens para números novos são o que mais faz o
  // WhatsApp bloquear um número.
  let fila = Promise.resolve();
  const naFila = (fn) => {
    const vez = fila.then(fn);
    fila = vez.catch(() => {}).then(() => new Promise((r) => setTimeout(r, intervaloMs)));
    return vez;
  };
  // A função aviso-agente desiste em 15 s e libera a reserva do aviso; um envio que saísse depois
  // disso viraria mensagem repetida no "Reenviar avisos". Por isso o envio só começa se quem pediu
  // ainda espera e se a vez chegou dentro de prazoFilaMs (senão 429, que a função tenta de novo
  // sabendo que nada saiu), e a consulta do número tem prazo próprio. Sobram ~4 s para o envio.
  const comPrazo = (promessa, ms) => Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("consulta demorou"), { prazo: true })), ms).unref()),
  ]);

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://local");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/saude")) {
        return responder(res, 200, { ok: true, conectado: whatsapp.conectado() });
      }
      if (!url.pathname.startsWith("/message/sendText/")) return responder(res, 404, { error: "not_found" });
      if (req.method !== "POST") return responder(res, 405, { error: "method_not_allowed" });
      if (!iguais(String(req.headers.apikey ?? ""), chave)) return responder(res, 401, { error: "unauthorized" });
      if (url.pathname !== rota) return responder(res, 404, { error: "instancia_inexistente" });

      let corpo;
      try { corpo = JSON.parse(await lerCorpo(req)); } catch (e) {
        if (e.status === 413) {
          // Responde antes de ler o resto e fecha a conexão depois da resposta.
          res.setHeader("Connection", "close");
          res.on("finish", () => req.destroy());
          return responder(res, 413, { error: "corpo_grande" });
        }
        return responder(res, 400, { error: "json_invalido" });
      }
      const numero = normalizarNumero(corpo?.number);
      if (!numero) return responder(res, 400, { error: "numero_invalido" });
      const texto = typeof corpo?.text === "string" ? corpo.text : corpo?.textMessage?.text;
      if (typeof texto !== "string" || !texto.trim()) return responder(res, 400, { error: "texto_vazio" });
      if (texto.length > LIMITE_TEXTO) return responder(res, 400, { error: "texto_grande" });
      if (!whatsapp.conectado()) return responder(res, 503, { error: "whatsapp_desconectado" });

      const chegada = Date.now();
      let desistiu = false;
      res.on("close", () => { if (!res.writableFinished) desistiu = true; });
      const resultado = await naFila(async () => {
        if (desistiu) return { status: 0 };
        if (Date.now() - chegada > prazoFilaMs) return { status: 429, corpo: { error: "fila_cheia" } };
        if (!whatsapp.conectado()) return { status: 503, corpo: { error: "whatsapp_desconectado" } };
        let jid;
        try { jid = await comPrazo(whatsapp.existe(numero), prazoConsultaMs); } catch (e) {
          if (e.prazo) return { status: 503, corpo: { error: "consulta_demorou" } };
          throw e;
        }
        if (!jid) return { status: 400, corpo: { error: "numero_sem_whatsapp" } };
        if (desistiu) return { status: 0 };
        const id = await whatsapp.enviar(jid, texto);
        return { status: 201, corpo: { key: { remoteJid: jid, fromMe: true, id: id ?? null }, status: "PENDING" } };
      });
      const destino = `${numero.slice(0, 4)}…${numero.slice(-2)}`;
      if (resultado.status === 0) { log(`envio cancelado (quem pediu desistiu) ${destino}`); return; }
      log(`envio ${resultado.status} ${destino}`);
      return responder(res, resultado.status, resultado.corpo);
    } catch (e) {
      log(`erro: ${e?.message ?? e}`);
      if (!res.headersSent) responder(res, 500, { error: "falha_no_envio" });
    }
  });
}
