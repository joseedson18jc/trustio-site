/**
 * Voz em tempo real (28 out 2026): relé entre o navegador e a xAI.
 *
 *   navegador ⇄ wss://api.trustio.com.br/voz/tempo-real ⇄ wss://api.x.ai/v1/realtime
 *
 * Por que um relé e não o navegador direto na xAI: o token efêmero da xAI não fixa nada da sessão
 * (a conexão sobrevive ao vencimento e o navegador pode trocar instruções e ligar ferramentas
 * pagas). Aqui a chave fica no worker, a sessão é sempre a da Trustio (português do Brasil, sem
 * ferramentas), o tempo é contado e a conversa é desligada no teto.
 *
 * Só para assinantes (voz_acesso_livre = 'livre', e-mail confirmado). O relé reserva os segundos
 * em blocos (reservar_voz_tempo_real, VOZ_TEMPO_REAL_BLOCO_S, padrão 120 s), pede o próximo 30 s
 * antes de o atual acabar e devolve o que sobrou ao terminar. Se o worker morrer no meio (limite de
 * CPU, deploy), só o bloco em curso fica sem devolver.
 *
 * Rotas (chamadas por index.js):
 *   GET /voz/tempo-real                     situação para o botão (Authorization: Bearer <token do Supabase>)
 *   GET /voz/tempo-real?taxa=48000 Upgrade  a conversa; o token vai no subprotocolo "jwt.<token>"
 *
 * Segredo: VOZ_XAI_API_KEY (wrangler secret put). Variáveis opcionais: VOZ_TEMPO_REAL_VOZ (padrão
 * rex), VOZ_TEMPO_REAL_LIMITE_S (segundos por dia, padrão 3600), VOZ_TEMPO_REAL_MAX_S (por
 * conversa, padrão 900).
 *
 * Prazos (26 nov 2026): nada espera para sempre. Chamadas ao Supabase e a abertura da xAI falham em
 * PRAZO_REDE_MS (resposta inteira); se a xAI não confirmar a sessão em PRAZO_PRONTA_MS, a conversa termina com motivo
 * "xai" (antes, a pessoa ficava em "Conectando…" gastando o tempo reservado até o teto).
 *
 * Abuso e cota (26 nov 2026): a xAI só é aberta depois de a conta ser conferida; VOZ_LIMITADOR
 * (binding de rate limit do Cloudflare, wrangler.toml) barra excesso de conversas abertas por IP; conversa que
 * a xAI nunca confirmou não gasta a cota; devolução que falha na rede é tentada de novo.
 */

export const XAI_REALTIME = "wss://api.x.ai/v1/realtime";
const MODELO = "grok-voice-latest";
const TAXAS = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
const MAX_BLOCO = 64 * 1024;          // um bloco de áudio de 100 ms a 48 kHz tem 9,6 kB
const MAX_GUARDADO = 400;             // blocos guardados enquanto a xAI conecta (~8 s a 20 ms)
const INATIVO_MS = 60_000;            // sem áudio do navegador por 1 min (aba esquecida): desliga
const DO_CLIENTE = new Set(["input_audio_buffer.clear", "response.cancel"]);
const NAO_REPASSA = new Set(["session.created", "session.updated"]);

const INSTRUCOES = [
  "Você é a Trustio, uma assistente de voz brasileira, conversando ao vivo por áudio.",
  "Fale sempre em português do Brasil, com pronúncia brasileira natural e neutra, sem sotaque de Portugal nem estrangeiro.",
  "Responda como numa ligação: frases curtas, tom caloroso e direto, uma a três frases, a não ser que peçam mais detalhes.",
  "Não leia listas, links, símbolos nem formatação; diga números, datas e valores do jeito que um brasileiro falaria.",
  "Se não entender, peça para repetir. Se a pessoa falar outro idioma, responda nesse idioma.",
].join(" ");
const SAUDACAO = "Oi! Pode falar, estou ouvindo.";

const inteiro = (v, padrao, min) => Math.max(min, Math.floor(Number(v)) || padrao);
const limiteDia = (env) => inteiro(env.VOZ_TEMPO_REAL_LIMITE_S, 3600, 60);
const maxSessao = (env) => inteiro(env.VOZ_TEMPO_REAL_MAX_S, 900, 30);
// Reserva em blocos: se o worker morrer no meio (limite de CPU, deploy), só o bloco atual fica sem devolver.
const bloco = (env) => inteiro(env.VOZ_TEMPO_REAL_BLOCO_S, 120, 30);
const ANTECEDENCIA_S = 30;            // pede o próximo bloco 30 s antes de o atual acabar
const MIN_RESERVA_S = 10;             // reservar_voz_tempo_real recusa menos que isso
const NOVA_TENTATIVA_MS = 5_000;      // renovação que falhou na rede tenta de novo
const ESPERA_RENOVACAO_MS = 5_000;    // no fim, espera a renovação em curso até isso
const PRAZO_REDE_MS = 8_000;          // Supabase (conta, reserva, devolução) e abertura da xAI
export const PRAZO_PRONTA_MS = 12_000; // do começo do relé até a xAI confirmar a sessão (session.updated)

// Rejeita com Error("prazo") se a promessa não terminar em `ms`; aoEstourar roda nessa hora.
function noPrazo(promessa, ms, aoEstourar) {
  let relogio;
  const prazo = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => { aoEstourar?.(); rejeitar(new Error("prazo")); }, ms);
  });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(relogio));
}
// fetch com prazo para a resposta inteira (cabeçalhos e corpo): no estouro o pedido é abortado.
// Devolve { ok, status, texto }. Recebe o fetch por parâmetro para os testes.
export function pedir(f, url, init, ms = PRAZO_REDE_MS) {
  const controle = new AbortController();
  const tudo = (async () => {
    const r = await f(url, { ...init, signal: controle.signal });
    return { ok: r.ok, status: r.status, texto: await r.text() };
  })();
  return noPrazo(tudo, ms, () => controle.abort());
}

export function taxaPedida(url) {
  const t = Number(url.searchParams.get("taxa"));
  return TAXAS.includes(t) ? t : 24000;
}

// O navegador não manda cabeçalhos no WebSocket: o token do Supabase vai como subprotocolo "jwt.<token>".
export function tokenDoProtocolo(cabecalho) {
  for (const p of String(cabecalho || "").split(",")) {
    const v = p.trim();
    if (v.startsWith("jwt.")) return v.slice(4);
  }
  return "";
}

export function sessaoTrustio(taxa, env) {
  const formato = { type: "audio/pcm", rate: taxa };
  return {
    type: "session.update",
    session: {
      voice: (env.VOZ_TEMPO_REAL_VOZ || "rex").trim(),
      instructions: INSTRUCOES,
      reasoning: { effort: "none" },
      tools: [],
      turn_detection: { type: "server_vad" },
      audio: {
        input: { format: formato, transport: "binary", transcription: { language_hint: "pt-BR", keyterms: ["Trustio"] } },
        output: { format: formato, transport: "binary" },
      },
    },
  };
}

// Nos Workers, com binaryType "blob" (o padrão desta compatibility_date), o binário chega como Blob.
const ehBlob = (d) => typeof Blob !== "undefined" && d instanceof Blob;
const ehBinario = (d) => d instanceof ArrayBuffer || ArrayBuffer.isView(d) || ehBlob(d);
const tamanho = (d) => (ehBlob(d) ? d.size : d.byteLength);

// Do navegador só passam áudio e dois controles (parar a resposta, limpar o áudio pendente).
export function filtrarDoCliente(dado) {
  if (ehBinario(dado)) return tamanho(dado) <= MAX_BLOCO ? dado : null;
  if (typeof dado !== "string") return null;
  try {
    const ev = JSON.parse(dado);
    return ev && DO_CLIENTE.has(ev.type) ? JSON.stringify({ type: ev.type }) : null;
  } catch { return null; }
}

// Da xAI passa tudo, menos os eventos de sessão (que repetiriam as instruções para o navegador).
export function filtrarDaXai(dado) {
  if (ehBinario(dado)) return dado;
  if (typeof dado !== "string") return null;
  try { return NAO_REPASSA.has(JSON.parse(dado).type) ? null : dado; } catch { return null; }
}

function enviar(ws, dado) {
  try { if (ws.readyState === 1) ws.send(dado); } catch { /* o outro lado já fechou */ }
}

/**
 * Liga os dois sockets. `xai` pode ainda não estar pronto: até xaiPronta(), o áudio do navegador
 * fica guardado (a pessoa já pode começar a falar enquanto a conexão abre); `antes` traz o que o
 * navegador mandou durante o login. aoFim(segundosUsados, motivo) roda uma vez só, quando qualquer
 * lado fecha ou o tempo acaba. Se o navegador já fechou, a sessão termina na hora.
 */
export function rele({ cliente, xai: xaiInicial, segundos, total = segundos, renovar = null, taxa, env, aoFim, antes = [],
  agora = Date.now, relogio = setTimeout }) {
  const inicio = agora();
  let concedido = segundos;           // segundos já reservados no banco para esta sessão
  const decorrido = () => agora() - inicio;
  let xai = xaiInicial;
  const pedirBuffer = (ws) => { try { ws.binaryType = "arraybuffer"; } catch { /* runtime sem binaryType */ } };
  pedirBuffer(cliente);
  let pronta = false, acabou = false, configurada = false, ultimoAudio = inicio;
  let guardado = antes.map(filtrarDoCliente).filter((d) => d !== null).slice(0, MAX_GUARDADO);

  function fim(motivo) {
    if (acabou) return;
    acabou = true;
    enviar(cliente, JSON.stringify({ type: "trustio.fim", motivo }));
    try { cliente.close(motivo === "limite" ? 4000 : 1000, motivo); } catch { /* já fechado */ }
    try { xai?.close(1000, motivo); } catch { /* já fechado */ }
    // Só conta tempo de conversa que existiu: se a xAI nunca confirmou a sessão, nada é gasto.
    const usados = configurada ? Math.min(concedido, Math.ceil(decorrido() / 1000)) : 0;
    // Uma renovação em curso pode ainda reservar um bloco: espera por ela (até 5 s) para devolver tudo.
    if (!pendente) { aoFim(usados, motivo, concedido); return; }
    Promise.race([pendente, new Promise((r) => relogio(r, ESPERA_RENOVACAO_MS))])
      .then(() => aoFim(usados, motivo, concedido));
  }

  // Teto: confere quando o bloco atual acaba; se ele foi renovado nesse meio tempo, remarca.
  function teto() {
    if (acabou) return;
    const falta = concedido * 1000 - decorrido();
    if (falta <= 0) fim("limite");
    else relogio(teto, falta);
  }
  // Renovação: 30 s antes do fim do bloco, pede o próximo (sem passar do total planejado).
  let pendente = null;
  function renovarAntes() {
    if (acabou || !renovar || pendente) return;
    const pedir = Math.min(bloco(env), total - concedido);
    if (pedir < MIN_RESERVA_S) return;  // o banco não reserva menos de 10 s: a sessão acaba no concedido
    const falta = (concedido - ANTECEDENCIA_S) * 1000 - decorrido();
    if (falta > 0) { relogio(renovarAntes, falta); return; }
    let chamada;
    try { chamada = Promise.resolve(renovar(pedir)); } catch (e) { chamada = Promise.reject(e); }
    pendente = chamada.then(
      (n) => {
        pendente = null;
        // Conta o bloco mesmo se a sessão já acabou: ele foi reservado e precisa ser devolvido.
        const ganhou = Math.max(0, Math.floor(Number(n)) || 0);
        concedido += ganhou;
        if (ganhou) renovarAntes();   // sem ganho: recusado, a sessão termina no que já foi concedido
      },
      (e) => {
        pendente = null;
        console.error("voz_tempo_real_renovar", String(e));
        // Falha de rede: tenta de novo em 5 s enquanto ainda há tempo no bloco atual.
        if (!acabou && concedido * 1000 - decorrido() > NOVA_TENTATIVA_MS) relogio(renovarAntes, NOVA_TENTATIVA_MS);
      });
  }

  cliente.addEventListener("message", (ev) => {
    const dado = filtrarDoCliente(ev.data);
    if (dado === null) return;
    if (ehBinario(dado)) ultimoAudio = agora();
    if (pronta) enviar(xai, dado);
    else if (guardado.length < MAX_GUARDADO) guardado.push(dado);
  });
  cliente.addEventListener("close", () => fim("navegador"));
  cliente.addEventListener("error", () => fim("navegador"));
  if (cliente.readyState !== 1) fim("navegador");

  relogio(teto, concedido * 1000);
  renovarAntes();
  const vigia = () => {
    if (acabou) return;
    if (agora() - ultimoAudio > INATIVO_MS) fim("inativo");
    else relogio(vigia, 10_000);
  };
  relogio(vigia, 10_000);
  // A xAI não abriu, ou abriu e não confirmou a sessão: termina aqui, não no teto do bloco.
  relogio(() => { if (!configurada) fim("xai"); }, PRAZO_PRONTA_MS);

  return {
    fim,
    xaiPronta(novo) {
      if (novo) xai = novo;
      pedirBuffer(xai);
      if (acabou) { try { xai.close(1000, "fim"); } catch { /* */ } return; }
      xai.addEventListener("message", (ev) => {
        if (!configurada && typeof ev.data === "string" && ev.data.includes("\"session.updated\"")) {
          configurada = true;
          enviar(cliente, JSON.stringify({ type: "trustio.pronto", segundos: total }));
          enviar(xai, JSON.stringify({ type: "conversation.item.create", item: {
            type: "force_message", role: "assistant", interruptible: true,
            content: [{ type: "output_text", text: SAUDACAO }],
          } }));
        }
        const dado = filtrarDaXai(ev.data);
        if (dado !== null) enviar(cliente, dado);
      });
      xai.addEventListener("close", () => fim("xai"));
      xai.addEventListener("error", () => fim("xai"));
      enviar(xai, JSON.stringify(sessaoTrustio(taxa, env)));
      for (const d of guardado) enviar(xai, d);
      guardado = [];
      pronta = true;
    },
  };
}

// ---- Supabase
async function usuario(token, env, f, prazoMs = PRAZO_REDE_MS) {
  if (!token) return null;
  const r = await pedir(f, `${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  }, prazoMs);
  if (!r.ok) return null;
  const u = JSON.parse(r.texto);
  return u && u.id ? u : null;
}
async function rpc(env, f, nome, args, prazoMs = PRAZO_REDE_MS) {
  const chave = env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: chave, "Content-Type": "application/json" };
  if (String(chave).startsWith("eyJ")) h.Authorization = `Bearer ${chave}`;
  const r = await pedir(f, `${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, { method: "POST", headers: h, body: JSON.stringify(args) }, prazoMs);
  const texto = r.texto;
  if (!r.ok) throw new Error(`rpc ${nome} ${r.status}: ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

/**
 * Reserva um bloco de segundos. Quem chama espera só `prazoMs`, mas o pedido não é abortado nessa hora
 * (o banco pode já ter reservado): ele segue até ESPERA_RESERVA vezes o prazo e, se a resposta chegar
 * atrasada com um bloco reservado, o bloco é devolvido na hora em vez de ficar perdido na cota do dia.
 */
const ESPERA_RESERVA = 4;
export function reservar(env, f, userId, segundos, prazoMs = PRAZO_REDE_MS) {
  let atrasou = false;
  const pedido = rpc(env, f, "reservar_voz_tempo_real", { p_user_id: userId, p_segundos: segundos, p_limite: limiteDia(env) }, prazoMs * ESPERA_RESERVA)
    .then((r) => {
      if (atrasou && r?.ok) {
        rpc(env, f, "devolver_voz_tempo_real", { p_user_id: userId, p_dia: r.dia, p_segundos: r.segundos }, prazoMs)
          .catch((e) => console.error("voz_tempo_real_devolver_atrasada", String(e)));
      }
      return r;
    });
  return noPrazo(pedido, prazoMs, () => { atrasou = true; });
}

/**
 * Quem ganha uma sessão: chave configurada, conta válida, e-mail confirmado e a reserva no banco
 * (que confere assinante, acesso não revogado, chat aberto e o teto do dia).
 * Devolve { ok: true, usuario, reserva } ou { ok: false, motivo }.
 */
/**
 * Quanto devolver de cada bloco reservado: a sobra sai dos blocos mais novos primeiro, cada um no
 * seu dia (uma ligação pode passar da meia-noite). blocos = [{ dia, segundos }], na ordem reservada.
 */
export function devolucoes(blocos, sobra) {
  const saida = [];
  let resta = Math.max(0, Math.floor(sobra) || 0);
  for (let i = blocos.length - 1; i >= 0 && resta > 0; i--) {
    const n = Math.min(resta, blocos[i].segundos);
    if (n > 0) saida.push({ dia: blocos[i].dia, segundos: n });
    resta -= n;
  }
  return saida;
}

// aoConta() roda quando a conta foi aceita, antes da reserva: é a hora de abrir a xAI (em paralelo com a reserva).
export async function prepararSessao(token, env, f = fetch, prazoMs = PRAZO_REDE_MS, aoConta = null) {
  if (!env.VOZ_XAI_API_KEY) return { ok: false, motivo: "nao_configurada" };
  let u = null;
  try { u = await usuario(token, env, f, prazoMs); } catch (e) { console.error("voz_tempo_real_usuario", String(e)); }
  if (!u) return { ok: false, motivo: "nao_autorizado" };
  if (!u.email_confirmed_at) return { ok: false, motivo: "email_nao_confirmado" };
  aoConta?.();
  let reserva = null;
  try {
    reserva = await reservar(env, f, u.id, Math.min(bloco(env), maxSessao(env)), prazoMs);
  } catch (e) { console.error("voz_tempo_real_reserva", String(e)); }
  if (!reserva?.ok) return { ok: false, motivo: reserva?.error || "indisponivel" };
  // Sessão planejada: o teto por sessão, sem passar do que resta no dia.
  const total = Math.min(maxSessao(env), reserva.segundos + Math.max(0, Number(reserva.restante) || 0));
  return { ok: true, usuario: u, reserva, total };
}

export async function situacao(token, env, f = fetch) {
  const u = await usuario(token, env, f);
  if (!u) return null;
  const s = await rpc(env, f, "voz_tempo_real_situacao", { p_user_id: u.id, p_limite: limiteDia(env) });
  const livre = s?.acesso === "livre" && !!u.email_confirmed_at;
  return {
    disponivel: Boolean(env.VOZ_XAI_API_KEY) && livre && (s.restante ?? 0) >= 10,
    acesso: s?.acesso ?? "teste",
    restante_s: s?.restante ?? 0,
    limite_s: limiteDia(env),
    max_sessao_s: maxSessao(env),
  };
}

// Abre a conexão com a xAI. Nos Workers o fetch de upgrade usa https:// (mesmo host e caminho do wss://).
// Com prazo: se a xAI não responder, falha com "prazo"; um socket que chegar depois disso é fechado.
export async function abrirXai(env, f = fetch, prazoMs = PRAZO_REDE_MS) {
  const url = XAI_REALTIME.replace(/^wss:/, "https:") + "?model=" + MODELO;
  let atrasou = false;
  const pedido = new Promise((resolver) => resolver(f(url, { headers: { Upgrade: "websocket", Authorization: `Bearer ${env.VOZ_XAI_API_KEY}` } })))
    .then((resposta) => {
      if (atrasou && resposta.webSocket) {
        try { resposta.webSocket.accept(); resposta.webSocket.close(1000, "prazo"); } catch { /* já fechado */ }
      }
      return resposta;
    });
  const r = await noPrazo(pedido, prazoMs, () => { atrasou = true; });
  if (!r.webSocket) {
    // O motivo da recusa vem no corpo (chave sem acesso, modelo, crédito): vai para o log, cortado e com prazo curto.
    let corpo = "";
    try { corpo = String(await noPrazo(r.text(), Math.min(2000, prazoMs)) || "").trim().slice(0, 300); } catch { /* sem corpo */ }
    throw new Error(`xai_upgrade ${r.status}` + (corpo ? `: ${corpo}` : ""));
  }
  r.webSocket.accept();
  return r.webSocket;
}

const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;

// Limite de pedidos por IP. Sem o binding, ou com ele fora do ar, ninguém é barrado: a voz não cai por causa do limitador.
export async function limitado(req, env) {
  const limitador = env.VOZ_LIMITADOR;
  if (!limitador) return false;
  try {
    const { success } = await limitador.limit({ key: req.headers.get("cf-connecting-ip") || "sem-ip" });
    return !success;
  } catch (e) { console.error("voz_tempo_real_limitador", String(e)); return false; }
}

// Devolve a sobra, bloco a bloco. Falha de rede ou do banco tenta de novo; prazo estourado não, porque o
// banco pode já ter devolvido e repetir devolveria em dobro.
export async function devolverBlocos(env, f, userId, blocos, sobra, prazoMs = PRAZO_REDE_MS, tentativas = 2) {
  for (const d of devolucoes(blocos, sobra)) {
    for (let i = 1; i <= tentativas; i++) {
      try {
        await rpc(env, f, "devolver_voz_tempo_real", { p_user_id: userId, p_dia: d.dia, p_segundos: d.segundos }, prazoMs);
        break;
      } catch (e) {
        console.error("voz_tempo_real_devolver", i, String(e));
        if (e?.message === "prazo") break;
      }
    }
  }
}

export async function vozTempoReal(req, env, ctx, origin, { json, ORIGENS }) {
  const url = new URL(req.url);
  const conversa = (req.headers.get("upgrade") || "").toLowerCase() === "websocket";
  if (!conversa) {
    if (req.method !== "GET") return json(405, { error: "method_not_allowed" }, origin);
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    try {
      const s = await situacao(token, env);
      return s ? json(200, s, origin) : json(401, { error: "unauthorized" }, origin);
    } catch (e) {
      console.error("voz_tempo_real_situacao", String(e));
      return json(503, { error: "indisponivel" }, origin);
    }
  }
  if (!origin || !ORIGENS.test(origin)) return new Response("origem", { status: 403 });
  // Só a conversa entra no limite por IP (é ela que custa xAI e cota). O GET de situação fica de fora:
  // muita gente divide o mesmo IP (rede móvel, escritório) e o botão sumiria para quem não fez nada.
  if (await limitado(req, env)) return new Response("muitos_pedidos", { status: 429 });

  // Responde o 101 na hora e confere conta, cota e xAI em paralelo: a pessoa já pode falar.
  const [cliente, servidor] = Object.values(new WebSocketPair());
  servidor.accept();
  try { servidor.binaryType = "arraybuffer"; } catch { /* runtime sem binaryType */ }
  // Até o relé existir: guarda o que a pessoa já falou e percebe se ela desistiu.
  const antes = [];
  let desistiu = false;
  const guardar = (ev) => { if (antes.length < MAX_GUARDADO) antes.push(ev.data); };
  const marcar = () => { desistiu = true; };
  servidor.addEventListener("message", guardar);
  servidor.addEventListener("close", marcar);
  const token = tokenDoProtocolo(req.headers.get("sec-websocket-protocol"));
  const taxa = taxaPedida(url);
  const recusar = (motivo) => {
    enviar(servidor, JSON.stringify({ type: "trustio.fim", motivo }));
    try { servidor.close(4001, motivo); } catch { /* */ }
  };

  ctx.waitUntil((async () => {
    if (!env.VOZ_XAI_API_KEY) return recusar("nao_configurada");
    if (!JWT.test(token)) return recusar("nao_autorizado");
    // A xAI (que custa uma conexão) só abre para conta conferida, em paralelo com a reserva.
    let xaiPromessa = Promise.resolve(null);
    const p = await prepararSessao(token, env, fetch, undefined, () => {
      xaiPromessa = abrirXai(env).catch((e) => { console.error("voz_tempo_real_xai", String(e)); return null; });
    });
    const blocos = p.ok ? [{ dia: p.reserva.dia, segundos: p.reserva.segundos }] : [];
    const devolver = (sobra) => devolverBlocos(env, fetch, p.usuario.id, blocos, sobra);
    const renovar = async (pedir) => {
      const r = await reservar(env, fetch, p.usuario.id, pedir);
      if (!r?.ok) { console.log(JSON.stringify({ voz_tempo_real: "renovacao_recusada", motivo: r?.error })); return 0; }
      blocos.push({ dia: r.dia, segundos: r.segundos });
      return r.segundos;
    };
    if (!p.ok || desistiu) {
      (await xaiPromessa)?.close(1000, "fim");
      if (p.ok) return devolver(p.reserva.segundos);   // reservou, mas a pessoa já tinha fechado
      return desistiu ? undefined : recusar(p.motivo);
    }
    servidor.removeEventListener("message", guardar);
    servidor.removeEventListener("close", marcar);
    let encerrar;
    const terminou = new Promise((r) => { encerrar = r; });
    const r = rele({
      cliente: servidor, xai: null, segundos: p.reserva.segundos, total: p.total, renovar, taxa, env, antes,
      aoFim: (usados, motivo, concedido) => {
        console.log(JSON.stringify({ voz_tempo_real: "fim", usados, motivo, concedido }));
        // Devolve pelo que foi de fato reservado no banco (inclui um bloco que chegou depois do fim).
        const reservado = blocos.reduce((t, b) => t + b.segundos, 0);
        devolver(reservado - usados).finally(encerrar);
      },
    });
    const xai = await xaiPromessa;
    if (!xai) { r.fim("xai"); return terminou; }
    r.xaiPronta(xai);
    return terminou;
  })());

  return new Response(null, { status: 101, webSocket: cliente, headers: { "Sec-WebSocket-Protocol": "trustio" } });
}
