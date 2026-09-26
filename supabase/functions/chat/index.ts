// Trustio · função de chat (Supabase Edge Function, projeto mjdaluioyutnxlyomzyd · sa-east-1).
// Recebe a mensagem do cliente autenticado, reserva a cota do plano de forma atômica, chama o modelo
// (qualquer API compatível com OpenAI: xAI, OpenAI, vLLM…) e devolve a resposta em streaming.
// A chave do modelo nunca chega ao navegador.
//
// Segredos (Dashboard → Edge Functions → Secrets):
//   LLM_API_KEY   obrigatório  (aceita XAI_API_KEY como alternativa)
//   LLM_BASE_URL  opcional     padrão https://api.x.ai/v1
//   LLM_MODEL     opcional     padrão grok-4
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? Deno.env.get("XAI_API_KEY") ?? "";
const LLM_BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? "https://api.x.ai/v1").replace(/\/$/, "");
const LLM_MODEL = (Deno.env.get("LLM_MODEL") ?? "grok-4").trim();

// Nome do modelo que vai na chamada. O servidor próprio (mlx_vlm.server) só reusa o modelo
// carregado se o campo "model" for idêntico ao id com que foi aberto; qualquer outro nome ele
// tenta carregar do cache e falha. Por isso o id é lido de GET /models do próprio servidor:
// com um modelo só na lista, vale esse; com vários (provedor na nuvem), vale LLM_MODEL se
// estiver na lista. Sem resposta, LLM_MODEL. Guardado por 10 minutos.
let modeloDescoberto: { id: string; em: number } | null = null;
async function modeloDaChamada(configurado: string | null): Promise<string> {
  // app_settings.llm_model (definido no banco) vale primeiro: muda na hora, sem depender da
  // propagação dos segredos da função nem do workflow que os regrava a cada deploy.
  if (configurado) return configurado;
  if (modeloDescoberto && Date.now() - modeloDescoberto.em < 10 * 60_000) return modeloDescoberto.id;
  try {
    // 25 s: a primeira chamada depois de ociosidade longa acorda o modelo (~15 s).
    const r = await fetch(`${LLM_BASE_URL}/models`, {
      headers: { "Authorization": `Bearer ${LLM_API_KEY}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (r.ok) {
      const j = await r.json();
      const ids: string[] = (Array.isArray(j?.data) ? j.data : []).map((m: { id?: unknown }) => String(m?.id ?? "")).filter(Boolean);
      const id = ids.includes(LLM_MODEL) ? LLM_MODEL : ids.length === 1 ? ids[0] : null;
      if (!id) console.log("llm_models_lista", ids.length);
      if (id) { modeloDescoberto = { id, em: Date.now() }; return id; }
    }
  } catch (err) {
    console.error("llm_models_indisponivel", String(err).slice(0, 200));
  }
  return LLM_MODEL;
}
const HISTORY = 30;
// Teto de tokens por resposta, opcional e explícito: só com o segredo LLM_MAX_TOKENS a
// função limita o modelo, e só então o chat mostra a porcentagem da resposta (contra esse
// teto, porque o tamanho final não é conhecido de antemão). Sem o segredo, não há teto.
const tetoConfigurado = Number(Deno.env.get("LLM_MAX_TOKENS"));
const LLM_MAX_TOKENS = tetoConfigurado > 0 ? Math.min(32768, Math.max(256, Math.floor(tetoConfigurado))) : null;
// Contexto do modelo (llama-server -c), opcional: com o segredo LLM_CONTEXTO o chat mostra
// quanto da sessão já foi usado e, quando ela enche, pede uma sessão nova numa aba nova.
const contextoConfigurado = Number(Deno.env.get("LLM_CONTEXTO"));
const LLM_CONTEXTO = contextoConfigurado > 0 ? Math.floor(contextoConfigurado) : null;
// Contagem exata de tokens durante a geração: o llama.cpp a manda em cada trecho com
// timings_per_token. É um parâmetro só dele, e um provedor que recusa campos
// desconhecidos derrubaria o chat; por isso só vai com LLM_SERVIDOR = "llama.cpp".
const LLAMA_TIMINGS = (Deno.env.get("LLM_SERVIDOR") ?? "").trim().toLowerCase() === "llama.cpp";

// Fotos do chat: data: URL de imagem, cada uma com até ~1,5 MB (a página manda JPEG de até 1280 px).
const RE_IMAGEM = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGEM = 1_500_000;
const AVISO_SEM_IMAGEM = "[Aviso do sistema: a pessoa anexou foto(s), mas o servidor do modelo não aceitou imagens nesta mensagem. " +
  "Você recebeu só o texto lido delas, se havia. Se precisar ver a foto para responder, diga isso com franqueza.]";
// Recusa de imagem pelo servidor do modelo (modelo só de texto): 4xx, ou 5xx cujo erro fala
// de imagem. Chave inválida, limite de uso, servidor fora do ar e contexto cheio não contam:
// repetir só com o texto não resolveria e descartaria a foto à toa.
// O erro que fala de imagem vale em qualquer status: o servidor MLX em uso responde 404
// "Only 'text' content type is supported." a uma mensagem com foto.
function ehRecusaDeImagem(status: number, detalhe: string) {
  if (ehContextoCheio(status, detalhe)) return false;
  if (/image|imagem|vision|multimodal|image_url|content.?(part|type)|mmproj|clip/i.test(detalhe)) return true;
  if ([401, 403, 404, 408, 429].includes(status)) return false;
  return status >= 400 && status < 500;
}
// Conversa maior que o contexto do modelo.
function ehContextoCheio(status: number, detalhe: string) {
  return status === 400 && /exceed_context_size|context (size|length)|maximum context/i.test(detalhe);
}

const ALLOWED_ORIGINS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://trustio.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

type Liberacao = {
  aberto: boolean; motivo?: string; abre_em?: string | null;
  antecipado_em?: string | null; pre_assinante?: boolean;
};

// Uma fonte só para "esta conta pode conversar agora": a função acesso_do_chat no banco.
// Se a consulta falhar, o chat fica fechado — melhor recusar do que abrir antes da data.
async function liberacao(admin: ReturnType<typeof createClient>, userId: string): Promise<Liberacao> {
  const { data, error } = await admin.rpc("acesso_do_chat", { p_user_id: userId });
  if (error || !data) {
    console.error("acesso_do_chat_error", error);
    return { aberto: false, motivo: "indisponivel" };
  }
  return data as Liberacao;
}

type Reservation = {
  ok: boolean; error?: string; lead_id?: string; used?: number; limit?: number;
  subscriber?: boolean; remaining?: number | null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "method_not_allowed" }, origin);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" }, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "unauthorized" }, origin);

  // Verificação de saúde. O chat usa para avisar que ainda não abriu, antes de a pessoa escrever.
  // Nenhum segredo sai daqui: para o cliente, apenas sim ou não; o nome do modelo e o host do
  // provedor ficam restritos a administradores, que são quem precisa deles no painel mestre.
  if (req.method === "GET") {
    const { data: ehAdmin } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    const configurado = LLM_API_KEY.length > 0;
    const acesso = await liberacao(admin, user.id);
    return json(200, {
      ok: true,
      // Só está aberto quando a data já chegou para esta conta E existe modelo para responder.
      chat_aberto: acesso.aberto && configurado,
      motivo: acesso.aberto ? (configurado ? acesso.motivo : "sem_modelo") : acesso.motivo,
      abre_em: acesso.abre_em ?? null,
      antecipado_em: acesso.antecipado_em ?? null,
      pre_assinante: acesso.pre_assinante ?? false,
      modelo_configurado: configurado,
      modelo: ehAdmin && configurado ? LLM_MODEL : null,
      provedor: ehAdmin && configurado ? new URL(LLM_BASE_URL).host : null,
    }, origin);
  }

  if (!user.email_confirmed_at) return json(403, { error: "email_nao_confirmado" }, origin);

  let body: { conversation_id?: string; message?: string; imagens?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }, origin); }
  const message = String(body.message ?? "").trim();
  if (!message) return json(400, { error: "mensagem_vazia" }, origin);
  // 40 mil caracteres: mensagem com até 3 anexos lidos por OCR no navegador (o texto de
  // cada anexo é cortado em 12 mil, e o total dos anexos em 30 mil, antes de sair da página).
  if (message.length > 40000) return json(413, { error: "mensagem_longa" }, origin);
  // Fotos anexadas: até 3 cópias reduzidas (JPEG/PNG/WebP em data: URL) para o modelo ver
  // a imagem. Não são gravadas: o histórico guarda só o texto da mensagem.
  const imagens = body.imagens === undefined ? [] : body.imagens;
  if (!Array.isArray(imagens) || imagens.length > 3 ||
      !imagens.every((u) => typeof u === "string" && u.length <= MAX_IMAGEM && RE_IMAGEM.test(u))) {
    return json(400, { error: "imagem_invalida" }, origin);
  }

  // Sem chave do modelo nada é consumido nem gravado.
  if (!LLM_API_KEY) return json(503, { error: "modelo_nao_configurado" }, origin);

  // As datas anunciadas no site valem aqui, não só no texto: ter a chave configurada
  // para atender o acesso antecipado não pode abrir o chat para todo mundo. Vem antes
  // da reserva de cota, então uma tentativa fora da data não consome nada.
  const acesso = await liberacao(admin, user.id);
  if (!acesso.aberto) {
    return json(403, {
      error: "chat_ainda_fechado",
      motivo: acesso.motivo,
      abre_em: acesso.abre_em ?? null,
      antecipado_em: acesso.antecipado_em ?? null,
      pre_assinante: acesso.pre_assinante ?? false,
    }, origin);
  }

  // Reserva a cota ANTES de chamar o modelo, numa única instrução no banco
  // (requisições paralelas não passam pelo mesmo contador). Cria o lead se faltar.
  const { data: reservationData, error: reservationError } = await admin.rpc("reserve_chat_message", { p_user_id: user.id });
  if (reservationError || !reservationData) {
    console.error("reserve_error", reservationError);
    return json(500, { error: "cota_indisponivel" }, origin);
  }
  const reservation = reservationData as Reservation;
  if (!reservation.ok) {
    const status = reservation.error === "trial_esgotado" ? 402 : 403;
    return json(status, { error: reservation.error, used: reservation.used, limit: reservation.limit }, origin);
  }
  const leadId = reservation.lead_id!;
  const release = () => admin.rpc("release_chat_message", { p_lead_id: leadId });

  // Conversa (cria se necessário; confere que pertence ao usuário).
  let conversationId = body.conversation_id ?? null;
  if (conversationId) {
    const { data: conv } = await admin.from("conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) conversationId = null;
  }
  if (!conversationId) {
    // Título pelo que a pessoa escreveu, sem o texto dos anexos.
    const base = message.split("\n\n[[anexo: ")[0].trim() || message;
    const title = base.length > 60 ? base.slice(0, 57).trimEnd() + "…" : base;
    const { data: conv, error } = await admin.from("conversations").insert({ user_id: user.id, title }).select("id").single();
    if (error || !conv) { await release(); return json(500, { error: "conversa_nao_criada" }, origin); }
    conversationId = conv.id;
  }

  const { data: history } = await admin.from("messages").select("role,content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY - 1);
  const { data: promptRow } = await admin.from("app_settings").select("value").eq("key", "system_prompt").maybeSingle();
  const { data: modeloRow } = await admin.from("app_settings").select("value").eq("key", "llm_model").maybeSingle();
  const modeloConfigurado = typeof modeloRow?.value === "string" && modeloRow.value.trim() ? modeloRow.value.trim() : null;
  const systemPrompt = typeof promptRow?.value === "string" ? promptRow.value : "Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil.";

  const anteriores = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).reverse().map((m) => ({ role: m.role, content: m.content })),
  ];
  const modelo = await modeloDaChamada(modeloConfigurado);
  console.log("llm_modelo", modelo);
  const chamarModelo = (ultima: unknown) => fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo, messages: [...anteriores, { role: "user", content: ultima }], stream: true, temperature: 0.7,
      stream_options: { include_usage: true },
      ...(LLM_MAX_TOKENS ? { max_tokens: LLM_MAX_TOKENS } : {}),
      ...(LLAMA_TIMINGS ? { timings_per_token: true } : {}),
    }),
  });

  let upstream: Response;
  let detail = "";
  try {
    if (imagens.length) {
      // Com fotos: texto + imagens no formato da API da OpenAI. Servidor que não aceita
      // imagem (modelo só de texto) recusa; aí vai de novo só o texto, com um aviso ao
      // modelo de que as fotos não chegaram — a pessoa recebe resposta do mesmo jeito.
      upstream = await chamarModelo([
        { type: "text", text: message },
        ...imagens.map((url) => ({ type: "image_url", image_url: { url } })),
      ]);
      if (!upstream.ok || !upstream.body) {
        detail = await upstream.text().catch(() => "");
        console.error("llm_sem_imagem", upstream.status, detail.slice(0, 300));
        if (ehRecusaDeImagem(upstream.status, detail)) {
          upstream = await chamarModelo(message + "\n\n" + AVISO_SEM_IMAGEM);
          detail = "";
        }
      }
    } else {
      upstream = await chamarModelo(message);
    }
  } catch (err) {
    console.error("llm_fetch_error", err);
    await release();
    return json(502, { error: "modelo_indisponivel" }, origin);
  }
  if (!upstream.ok || !upstream.body) {
    detail = detail || await upstream.text().catch(() => "");
    console.error("llm_error", upstream.status, detail.slice(0, 500));
    await release();
    // Conversa maior que o contexto do modelo: não é falha do modelo; o chat pede uma sessão nova.
    if (ehContextoCheio(upstream.status, detail)) {
      return json(409, { error: "contexto_cheio", janela: LLM_CONTEXTO }, origin);
    }
    return json(502, { error: "modelo_indisponivel", status: upstream.status }, origin);
  }

  // O modelo aceitou: a mensagem do usuário entra no histórico.
  await admin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let full = "";
  const convId = conversationId;

  // A leitura do modelo não depende de o navegador continuar conectado: se a pessoa
  // recarrega ou fecha a aba no meio, a resposta termina de chegar e fica salva no
  // histórico (antes, a conexão fechada descartava tudo). Enviar para o navegador é
  // melhor esforço; ler, salvar e fechar a conta da cota é obrigação.
  let saida: ReadableStreamDefaultController<Uint8Array> | null = null;
  let aberto = true;
  const send = (obj: unknown) => {
    if (!aberto || !saida) return;
    try { saida.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
    catch { aberto = false; }
  };
  const fechar = () => {
    if (!aberto || !saida) return;
    aberto = false;
    try { saida.close(); } catch { /* já fechado */ }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) { saida = controller; send({ conversation_id: convId, limite: LLM_MAX_TOKENS }); },
    // Navegador foi embora: só para de enviar; a leitura do modelo segue.
    cancel() { aberto = false; },
  });

  const trabalho = (async () => {
    const reader = upstream.body!.getReader();
    let buffer = "";
    let pensando = false;
    let interrompido = false;
    let fim: string | null = null;
    // Tokens gerados: o número exato do modelo quando ele informa (timings/usage);
    // senão, um por trecho recebido.
    let tokens = 0;
    let trechos = 0;
    let trechosRaciocinio = 0;
    // Tokens do raciocínio, à parte: num trecho com raciocínio e texto juntos, os tokens
    // novos são divididos pelo tamanho de cada parte; tokens que chegam só no total final
    // (usage), pela proporção de trechos de raciocínio. O número do provedor, se vier, vale.
    let tokensRaciocinio = 0;
    // Tokens do prompt (sistema + histórico + pergunta), quando o modelo informa no fim.
    let tokensPrompt: number | null = null;

    // O raciocínio vai ao navegador, mas o prompt de sistema não deve sair por ele: frases
    // do prompt citadas literalmente viram "[instrução interna]". Para pegar uma frase
    // que chega em pedaços, os últimos caracteres (o tamanho da maior frase) ficam
    // retidos até a frase poder ser conferida inteira. Paráfrases não são pegas, então o
    // prompt de sistema não deve conter segredo.
    const frasesDoPrompt = systemPrompt.split(/(?<=[.!?;:])\s+|\n+/).map((f) => f.trim()).filter((f) => f.length >= 24);
    const retencao = frasesDoPrompt.reduce((m, f) => Math.max(m, f.length), 0);
    let raciocinioRetido = "";
    const soltarRaciocinio = (tudo: boolean) => {
      for (const f of frasesDoPrompt) raciocinioRetido = raciocinioRetido.split(f).join("[instrução interna]");
      const corte = tudo ? raciocinioRetido.length : Math.max(0, raciocinioRetido.length - retencao);
      if (corte > 0) {
        send({ raciocinio: raciocinioRetido.slice(0, corte), n: tokens, nr: tokensRaciocinio });
        raciocinioRetido = raciocinioRetido.slice(corte);
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const pedaco = JSON.parse(payload) ?? {};
            const escolha = pedaco.choices?.[0] ?? {};
            const d = escolha.delta ?? {};
            if (escolha.finish_reason) fim = escolha.finish_reason;
            const raciocinio = d.reasoning_content || d.reasoning;
            if (d.content || raciocinio) trechos++;
            if (raciocinio) trechosRaciocinio++;
            const antes = tokens;
            tokens = Math.max(tokens, trechos, Number(pedaco.timings?.predicted_n) || 0, Number(pedaco.usage?.completion_tokens) || 0);
            const novos = tokens - antes;
            if (raciocinio) {
              tokensRaciocinio += d.content ? Math.round(novos * raciocinio.length / (raciocinio.length + d.content.length)) : novos;
            } else if (!d.content && novos > 0 && trechos > 0) {
              tokensRaciocinio += Math.round(novos * trechosRaciocinio / trechos);
            }
            const raciocinioInformado = Number(pedaco.usage?.completion_tokens_details?.reasoning_tokens);
            if (raciocinioInformado > 0) tokensRaciocinio = raciocinioInformado;
            tokensRaciocinio = Math.min(tokensRaciocinio, tokens);
            if (Number(pedaco.usage?.prompt_tokens) > 0) tokensPrompt = Number(pedaco.usage.prompt_tokens);
            // Modelos com raciocínio mandam esse trecho em outro campo, antes do texto. Vai ao
            // navegador, que o mostra à parte; não entra no histórico nem no contexto.
            if (raciocinio) {
              if (!pensando) { pensando = true; send({ pensando: true }); }
              raciocinioRetido += raciocinio;
              soltarRaciocinio(false);
            }
            if (d.content) {
              if (raciocinioRetido) soltarRaciocinio(true);
              full += d.content;
              send({ delta: d.content, n: tokens });
            } else if (!raciocinio && pedaco.usage) {
              send({ n: tokens });
            }
          } catch { /* fragmento incompleto */ }
        }
      }
    } catch (err) {
      interrompido = true;
      console.error("stream_error", err);
    }
    if (raciocinioRetido) soltarRaciocinio(true);

    if (full) {
      await admin.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: full, model: modelo });
      await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      if (interrompido) send({ error: "stream_interrompido" });
      send({
        done: true,
        conversation_id: convId,
        // "length": a resposta bateu no teto de tokens e pode ter sido cortada.
        fim,
        n: tokens,
        nr: tokensRaciocinio,
        // Contexto que a próxima pergunta vai ocupar: prompt + resposta salva. O raciocínio
        // não é salvo nem reenviado, então não conta.
        contexto: tokensPrompt === null ? null : tokensPrompt + Math.max(0, tokens - tokensRaciocinio),
        janela: LLM_CONTEXTO,
        remaining: reservation.remaining ?? null,
        limit: reservation.subscriber ? null : reservation.limit,
      });
    } else {
      // Nada de texto: a mensagem não conta na cota e o navegador recebe o motivo.
      console.error(interrompido ? "stream_interrompido_sem_texto" : "llm_resposta_vazia");
      await release();
      send({ error: interrompido ? "stream_interrompido" : "resposta_vazia" });
    }
    fechar();
  })();
  // Mantém a função viva até o fim da leitura, mesmo com o navegador desconectado.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(trabalho);

  return new Response(stream, {
    headers: { ...cors(origin), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
