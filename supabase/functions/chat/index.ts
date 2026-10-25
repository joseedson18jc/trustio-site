// Trustio · função de chat (Supabase Edge Function, projeto mjdaluioyutnxlyomzyd · sa-east-1).
// Recebe a mensagem do cliente autenticado, reserva a cota do plano de forma atômica, chama o modelo
// (qualquer API compatível com OpenAI: xAI, OpenAI, vLLM…) e devolve a resposta em streaming.
// A chave do modelo nunca chega ao navegador.
//
// Segredos (Dashboard → Edge Functions → Secrets):
//   LLM_API_KEY   obrigatório  (aceita XAI_API_KEY como alternativa)
//   LLM_BASE_URL  opcional     padrão https://api.x.ai/v1
//   LLM_MODEL     opcional     padrão grok-4
//
// O nome do modelo pode vir também do banco (app_settings.llm_model, só admins leem), que tem
// prioridade: muda na hora, sem esperar a propagação dos segredos nem o workflow que os regrava.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  FERRAMENTA_BUSCA, NOME_FERRAMENTA, SEM_BUSCA, type Resultado,
  aceitaPedidosDeBusca, buscarNaWeb, instrucoesDeBusca, lerArgumentos, linhaDeFontes, resultadosParaModelo, rodadaSemResposta,
  semNarracaoDeBusca,
} from "./busca.ts";
import { SKILLS, blocoDaSkill, skillDoPedido } from "./skills.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_API_KEY = Deno.env.get("TRUSTIO_LLM_API_KEY") ?? Deno.env.get("LLM_API_KEY") ?? Deno.env.get("XAI_API_KEY") ?? "";
const LLM_BASE_URL = (Deno.env.get("TRUSTIO_LLM_BASE_URL") ?? Deno.env.get("LLM_BASE_URL") ?? "https://api.x.ai/v1").replace(/\/$/, "");
const LLM_MODEL = (Deno.env.get("TRUSTIO_LLM_MODEL") ?? Deno.env.get("LLM_MODEL") ?? "grok-4").trim();

// Nome do modelo que vai na chamada, nesta ordem: app_settings.llm_model; o que o próprio
// servidor anuncia em GET /models (com um modelo só na lista, vale esse; com vários, como num
// provedor na nuvem, vale LLM_MODEL se estiver na lista); LLM_MODEL. Servidores como o
// mlx_vlm.server só atendem com o nome exato do modelo carregado: qualquer outro eles tentam
// carregar e falham. O resultado de /models fica guardado por 10 minutos.
let modeloDescoberto: { id: string; em: number } | null = null;
// deno-lint-ignore no-explicit-any
async function modeloDoBanco(admin: any): Promise<string | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "llm_model").maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value.trim() : null;
}
// Modelos que a pessoa pode escolher no chat, todos atendidos pelo mesmo LLM_BASE_URL. Vêm,
// nesta ordem: do próprio servidor do modelo (GET /models com "trustio_modelos": o gateway da
// Trustio anuncia os modos dele, ex.: Flash e Heavy Thinking); de app_settings.modelos_chat,
// lista definida pelo admin ([{ id, rotulo, descricao }]). Sem nenhuma, só o modelo padrão.
// icone: nome curto da marca do modelo (o site mostra assets/modelos/<icone>.svg, se conhecer).
type ModeloEscolhivel = { id: string; rotulo: string; descricao?: string; descricao_en?: string; icone?: string; padrao?: boolean };
function normalizarModelos(lista: unknown): ModeloEscolhivel[] {
  return (Array.isArray(lista) ? lista : [])
    .map((m: { id?: unknown; rotulo?: unknown; descricao?: unknown; descricao_en?: unknown; icone?: unknown; padrao?: unknown }) => ({
      id: String(m?.id ?? "").trim().slice(0, 200),
      rotulo: String(m?.rotulo ?? m?.id ?? "").trim().slice(0, 60),
      descricao: m?.descricao ? String(m.descricao).trim().slice(0, 160) : undefined,
      descricao_en: m?.descricao_en ? String(m.descricao_en).trim().slice(0, 160) : undefined,
      icone: typeof m?.icone === "string" && /^[a-z0-9-]{1,24}$/.test(m.icone) ? m.icone : undefined,
      padrao: m?.padrao === true ? true : undefined,
    }))
    .filter((m: ModeloEscolhivel) => m.id && m.rotulo)
    .slice(0, 12);
}
// GET /models do servidor, guardado por 10 minutos (ids anunciados e modos escolhíveis). Se a
// consulta falhar ou demorar, vale o último catálogo bom: lentidão não pode trocar o modo escolhido.
// contexto: janela por plano que o servidor anuncia ("trustio_contexto": { teste, pago }), se anunciar.
type Contexto = { teste: number; pago: number };
let catalogo: { ids: string[]; escolhas: ModeloEscolhivel[]; contexto: Contexto | null; em: number } | null = null;
function lerContexto(c: unknown): Contexto | null {
  const t = Number((c as { teste?: unknown })?.teste), p = Number((c as { pago?: unknown })?.pago);
  return t > 0 && p > 0 ? { teste: Math.floor(t), pago: Math.floor(p) } : null;
}
async function catalogoDoServidor(timeoutMs: number): Promise<{ ids: string[]; escolhas: ModeloEscolhivel[]; contexto: Contexto | null } | null> {
  if (catalogo && Date.now() - catalogo.em < 10 * 60_000) return catalogo;
  try {
    const r = await fetch(`${LLM_BASE_URL}/models`, {
      headers: { "Authorization": `Bearer ${LLM_API_KEY}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return catalogo;
    const j = await r.json();
    const ids: string[] = (Array.isArray(j?.data) ? j.data : []).map((m: { id?: unknown }) => String(m?.id ?? "")).filter(Boolean);
    catalogo = { ids, escolhas: normalizarModelos(j?.trustio_modelos), contexto: lerContexto(j?.trustio_contexto), em: Date.now() };
    return catalogo;
  } catch (err) {
    console.error("llm_models_indisponivel", String(err).slice(0, 200));
    return catalogo;
  }
}
// deno-lint-ignore no-explicit-any
async function modelosEscolhiveis(admin: any, timeoutMs = 4_000): Promise<ModeloEscolhivel[]> {
  const doServidor = (await catalogoDoServidor(timeoutMs))?.escolhas ?? [];
  if (doServidor.length >= 2) return doServidor;
  const { data } = await admin.from("app_settings").select("value").eq("key", "modelos_chat").maybeSingle();
  return normalizarModelos(data?.value);
}

// Preferências da pessoa (tabela preferencias_usuario, só ela e esta função leem).
type Preferencias = { estilo?: string; instrucoes?: string; modelo?: string | null };
const ESTILOS: Record<string, string> = {
  direto: "Estilo de resposta escolhido pela pessoa: direto. Vá ao ponto, sem introdução nem resumo no fim; use lista só quando ajudar.",
  equilibrado: "Estilo de resposta escolhido pela pessoa: equilibrado. Resposta completa e bem estruturada, com os detalhes que importam e um exemplo quando ajudar; não resuma demais.",
  detalhado: "Estilo de resposta escolhido pela pessoa: detalhado. Explique com profundidade, com exemplos e passo a passo quando fizer sentido.",
};
function promptComPreferencias(base: string, pref: Preferencias | null): string {
  if (!pref) return base;
  const partes = [base];
  const estilo = ESTILOS[String(pref.estilo ?? "")];
  if (estilo) partes.push(estilo);
  const instrucoes = String(pref.instrucoes ?? "").trim().slice(0, 1500);
  if (instrucoes) {
    partes.push("Instruções pessoais que a pessoa definiu para as suas respostas (siga-as, desde que não contradigam as regras acima):\n" + instrucoes);
  }
  return partes.join("\n\n");
}

async function modeloDaChamada(configurado: string | null): Promise<string> {
  // app_settings.llm_model (definido no banco) vale primeiro quando o servidor o anuncia:
  // mudanças feitas pelo admin passam a valer na hora, sem depender do deploy dos segredos.
  // Após trocar de provedor, uma preferência antiga pode continuar no banco; não a envie a
  // um gateway que anuncia outros modelos, pois isso faria o chat falhar mesmo com Strata ativo.
  if (configurado) {
    const disponiveis = await catalogoDoServidor(25_000);
    const idsValidos = [...(disponiveis?.ids ?? []), ...(disponiveis?.escolhas ?? []).map((m) => m.id)];
    if (!idsValidos.length || idsValidos.includes(configurado) || configurado === LLM_MODEL) return configurado;
    console.log("llm_modelo_configurado_indisponivel", configurado);
  }
  if (modeloDescoberto && Date.now() - modeloDescoberto.em < 10 * 60_000) return modeloDescoberto.id;
  // 25 s: a primeira chamada depois de ociosidade longa acorda o modelo (~15 s).
  const cat = await catalogoDoServidor(25_000);
  if (cat) {
    const ids = cat.ids;
    const id = ids.includes(LLM_MODEL) ? LLM_MODEL : ids.length === 1 ? ids[0] : null;
    if (!id) console.log("llm_models_lista", ids.length);
    if (id) { modeloDescoberto = { id, em: Date.now() }; return id; }
  }
  return LLM_MODEL;
}
const HISTORY = 30;
// Busca na web (Exa, busca.ts): ligada só com EXA_API_KEY. Assinantes têm um teto diário;
// quem está no teste, uma demonstração única. No máximo 2 buscas por mensagem.
const EXA_API_KEY = (Deno.env.get("EXA_API_KEY") ?? "").trim();
const BUSCA_LIMITE_DIARIO = Math.max(1, Number(Deno.env.get("BUSCA_LIMITE_DIARIO") ?? "100") || 100);
const BUSCA_DEMO = Math.max(0, Number(Deno.env.get("BUSCA_DEMO") ?? "3") || 0);
// 19 out 2026: era 2; o modelo dizia "vou tentar mais buscas" e parava. Cada busca ainda conta na cota.
const MAX_BUSCAS_POR_MENSAGEM = 5;
// Triagem da busca (19 out 2026): antes da chamada normal, uma chamada SEM raciocínio decide se a
// pergunta pede busca. Pediu: a busca começa sem o modelo ter pensado à toa (sem os fatos). Começou a
// responder: a leitura para no primeiro texto e a pergunta segue para a chamada normal, com raciocínio.
const MAX_TOKENS_TRIAGEM = 160;
// Modelos que respondem com os resultados da busca sem raciocínio (o Heavy continua pensando).
const MODELOS_SEM_RACIOCINIO_APOS_BUSCA = new Set(["trustio-flash"]);
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
const MAX_AUDIO = 10 * 1024 * 1024;
const MAX_CHAT_REQUEST = 20 * 1024 * 1024;
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/webm", "audio/aac", "audio/3gpp"]);
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|flac|webm|aac|3gp)$/i;
// Erro que indica nome de modelo desconhecido pelo servidor (ex.: mlx_vlm tentando carregar outro
// modelo: "Failed to load model…"; OpenAI/xAI: "model_not_found").
function ehErroDeNomeDoModelo(status: number, detalhe: string) {
  return [400, 404, 422].includes(status) && !ehContextoCheio(status, detalhe) &&
    /failed to load model|model[_ ]not[_ ]found|does not exist|unknown model|no such model|cached snapshot/i.test(detalhe);
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
// deno-lint-ignore no-explicit-any
async function liberacao(admin: any, userId: string): Promise<Liberacao> {
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
  // Teste grátis por tempo: fim do teste (null para pagos e equipe) e duração em dias.
  trial_ends_at?: string | null; trial_days?: number;
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
      // Modelos que a pessoa pode escolher (lista do admin). Vazia: só o padrão.
      modelos: configurado ? await modelosEscolhiveis(admin) : [],
      // O modelo efetivo (banco, /models do servidor ou LLM_MODEL), o mesmo que a conversa usa.
      // Sem consultar o servidor: a verificação não pode esperar um GET /models lento.
      modelo: ehAdmin && configurado ? (await modeloDoBanco(admin)) ?? modeloDescoberto?.id ?? LLM_MODEL : null,
      provedor: ehAdmin && configurado ? new URL(LLM_BASE_URL).host : null,
    }, origin);
  }

  if (!user.email_confirmed_at) return json(403, { error: "email_nao_confirmado" }, origin);

  const requestSize = Number(req.headers.get("content-length") ?? 0);
  if (requestSize > MAX_CHAT_REQUEST) return json(413, { error: "mensagem_longa" }, origin);
  let body: { conversation_id?: string; message?: string; imagens?: unknown; modelo?: unknown; fala?: unknown; skill?: unknown };
  let audio: File | null = null;
  let audioLanguage: "pt" | "en" = "pt";
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (/^multipart\/form-data\b/i.test(contentType)) {
      const form = await req.formData();
      const rawAudio = form.get("audio");
      if (rawAudio !== null && !(rawAudio instanceof File)) return json(400, { error: "audio_invalido" }, origin);
      audio = rawAudio instanceof File ? rawAudio : null;
      audioLanguage = form.get("audio_language") === "en" ? "en" : "pt";
      let imagens: unknown = form.get("imagens");
      if (typeof imagens === "string" && imagens) {
        try { imagens = JSON.parse(imagens); } catch { return json(400, { error: "imagem_invalida" }, origin); }
      }
      body = {
        conversation_id: String(form.get("conversation_id") ?? "") || undefined,
        message: String(form.get("message") ?? ""),
        imagens,
        modelo: String(form.get("modelo") ?? ""),
        // Gravação do microfone do chat (assets/voz.js): "1" = fala; "conversa" = conversa por voz.
        fala: String(form.get("fala") ?? ""),
        // Skill ativa (Skills para baixar): só o id; ausente = mantém a da conversa.
        ...(form.has("skill") ? { skill: String(form.get("skill") ?? "") } : {}),
      };
    } else {
      body = await req.json();
    }
  } catch { return json(400, { error: "bad_json" }, origin); }
  let message = String(body.message ?? "").trim();
  // 40 mil caracteres: mensagem com até 3 anexos lidos por OCR no navegador (o texto de
  // cada anexo é cortado em 12 mil, e o total dos anexos em 30 mil, antes de sair da página).
  if (message.length > 40000) return json(413, { error: "mensagem_longa" }, origin);
  // Fotos anexadas: até 3 cópias reduzidas (JPEG/PNG/WebP em data: URL) para o modelo ver
  // a imagem. Não são gravadas: o histórico guarda só o texto da mensagem.
  // No envio por formulário (áudio), form.get("imagens") devolve null quando não há fotos: null também é "nenhuma".
  const imagens = body.imagens == null ? [] : body.imagens;
  if (!Array.isArray(imagens) || imagens.length > 3 ||
      !imagens.every((u) => typeof u === "string" && u.length <= MAX_IMAGEM && RE_IMAGEM.test(u))) {
    return json(400, { error: "imagem_invalida" }, origin);
  }
  if (audio) {
    if (audio.size <= 0) return json(400, { error: "audio_invalido" }, origin);
    if (audio.size > MAX_AUDIO) return json(413, { error: "audio_grande_demais" }, origin);
    if (!AUDIO_MIMES.has(audio.type.toLowerCase()) && !AUDIO_EXT.test(audio.name)) {
      return json(400, { error: "audio_formato_invalido" }, origin);
    }
  }
  // Fala gravada no chat: a transcrição É a mensagem (não um anexo a analisar). "conversa" pede
  // também respostas curtas, em tom de conversa, porque elas serão lidas em voz alta.
  const fala = body.fala === "conversa" ? "conversa" : body.fala === "1" ? "1" : "";
  const semTextoDigitado = !message;
  if (!message && (audio || imagens.length)) message = "Analise o conteúdo do anexo.";
  if (!message) return json(400, { error: "mensagem_vazia" }, origin);

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
    return json(status, { error: reservation.error, used: reservation.used,
      trial_ends_at: reservation.trial_ends_at ?? null, trial_days: reservation.trial_days ?? null }, origin);
  }
  const leadId = reservation.lead_id!;
  const release = () => admin.rpc("release_chat_message", { p_lead_id: leadId });

  let transcricaoAudio = "";
  if (audio) {
    try {
      const form = new FormData();
      form.append("file", audio, audio.name || "audio");
      form.append("response_format", "json");
      form.append("language", audioLanguage);
      form.append("temperature", "0");
      form.append("prompt", audioLanguage === "pt"
        ? "Português do Brasil. O nome da empresa é Trustio, escrito T-R-U-S-T-I-O. Preserve nomes próprios, números, datas e valores exatamente como foram falados."
        : "English. Preserve proper names, numbers, dates, and amounts exactly as spoken.");
      const r = await fetch(`${LLM_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${LLM_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) {
        console.error("audio_transcription_error", r.status);
        await release();
        return json(502, { error: "audio_indisponivel" }, origin);
      }
      const result = await r.json().catch(() => null) as { text?: unknown } | null;
      transcricaoAudio = typeof result?.text === "string" ? result.text.trim() : "";
      if (!transcricaoAudio) {
        await release();
        return json(422, { error: "audio_sem_fala" }, origin);
      }
      const nome = (audio.name || "áudio").replace(/[^\p{L}\p{N}._ -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "áudio";
      if (fala) message = semTextoDigitado ? transcricaoAudio : `${message}\n\n${transcricaoAudio}`;
      else message += `\n\n[[anexo: Áudio — ${nome} · transcrição automática]]\n${transcricaoAudio}\n[[/anexo]]`;
      if (message.length > 40000) {
        await release();
        return json(413, { error: "mensagem_longa" }, origin);
      }
    } catch (err) {
      console.error("audio_transcription_fetch_error", String(err).slice(0, 120));
      await release();
      return json(502, { error: "audio_indisponivel" }, origin);
    }
  }

  // Skill pedida nesta mensagem: "" = nenhuma; id do catálogo = essa; ausente ou id desconhecido = mantém a da conversa.
  const skillPedida = skillDoPedido(body.skill);
  let skillAtiva: string | null = null;
  // Conversa (cria se necessário; confere que pertence ao usuário).
  let conversationId = body.conversation_id ?? null;
  if (conversationId) {
    const { data: conv } = await admin.from("conversations").select("id,skill").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) conversationId = null;
    else {
      const salva = typeof conv.skill === "string" && Object.hasOwn(SKILLS, conv.skill) ? conv.skill : null;
      skillAtiva = skillPedida === undefined ? salva : skillPedida;
      if (skillPedida !== undefined && skillPedida !== (conv.skill ?? null)) {
        const { error } = await admin.from("conversations").update({ skill: skillPedida }).eq("id", conversationId);
        if (error) console.error("skill_conversa", error);
      }
    }
  }
  if (!conversationId) {
    // Título pelo que a pessoa escreveu, sem o texto dos anexos.
    const base = message.split("\n\n[[anexo: ")[0].trim() || message;
    const title = base.length > 60 ? base.slice(0, 57).trimEnd() + "…" : base;
    skillAtiva = skillPedida ?? null;
    const { data: conv, error } = await admin.from("conversations").insert({ user_id: user.id, title, skill: skillAtiva }).select("id").single();
    if (error || !conv) { await release(); return json(500, { error: "conversa_nao_criada" }, origin); }
    conversationId = conv.id;
  }

  const { data: history } = await admin.from("messages").select("role,content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY - 1);
  const { data: promptRow } = await admin.from("app_settings").select("value").eq("key", "system_prompt").maybeSingle();
  const { data: prefRow } = await admin.from("preferencias_usuario").select("estilo,instrucoes,modelo")
    .eq("user_id", user.id).maybeSingle();
  const pref = (prefRow ?? null) as Preferencias | null;
  // Modelo escolhido pela pessoa: o do seletor do chat (nesta mensagem) ou o salvo nas preferências.
  // Vale só se ainda estiver na lista; senão, o padrão.
  // "" no envio = a pessoa escolheu o padrão no seletor (vale mesmo antes de a preferência ser gravada).
  const pedido = typeof body.modelo === "string" ? body.modelo.slice(0, 200) || null : pref?.modelo ?? null;
  // 25 s, como a descoberta do modelo logo abaixo: a primeira consulta depois de muito tempo pode
  // acordar o servidor, e um tempo curto aqui faria a escolha cair para o padrão sem motivo.
  const escolhido = pedido ? (await modelosEscolhiveis(admin, 25_000)).find((m) => m.id === pedido)?.id ?? null : null;
  const modeloConfigurado = escolhido ?? await modeloDoBanco(admin);
  let modelo = await modeloDaChamada(modeloConfigurado);
  console.log("llm_modelo", modelo);
  // Janela do plano: o servidor da Trustio anuncia uma para o teste e outra para assinantes, e
  // recebe o plano em cada pedido (ele mesmo barra o que passar da janela do teste). Servidor que
  // não anuncia (outro provedor) não recebe o campo, e vale LLM_CONTEXTO.
  const plano = reservation.subscriber ? "pago" : "teste";
  const contextoDoServidor = (await catalogoDoServidor(25_000))?.contexto ?? null;
  const janela = contextoDoServidor ? contextoDoServidor[plano] : LLM_CONTEXTO;
  // Busca na web: com a chave da Exa, só no servidor da Trustio (o formato de ferramentas foi testado
  // nele) e sem fotos. A ferramenta só é oferecida ao modelo se a conta ainda puder buscar hoje.
  type SituacaoBusca = { pode?: boolean; acesso?: string };
  const buscaSituacao: SituacaoBusca | null = EXA_API_KEY && contextoDoServidor && !imagens.length
    ? await admin.rpc("busca_situacao", { p_user_id: user.id, p_limite: BUSCA_LIMITE_DIARIO, p_demo: BUSCA_DEMO })
        .then(({ data, error }: { data: unknown; error: unknown }) => {
          if (error) console.error("busca_situacao", error);
          return (data ?? null) as SituacaoBusca | null;
        })
    : null;
  const buscaLigada = !!buscaSituacao?.pode;
  let hoje = new Date().toISOString().slice(0, 10);
  if (buscaLigada) {
    try { hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" }).format(new Date()); }
    catch { /* fica a data ISO */ }
  }
  const systemPrompt = [
    promptComPreferencias(
      typeof promptRow?.value === "string" ? promptRow.value : "Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil.",
      pref,
    ),
    "Priorize a precisão factual. Não invente dados, fontes ou detalhes; não apresente inferências como fatos; indique incerteza quando houver e evite afirmações absolutas sem fundamento.",
    ...(skillAtiva ? [blocoDaSkill(skillAtiva)] : []),
    ...(buscaLigada ? [instrucoesDeBusca(hoje, fala === "conversa")] : buscaSituacao?.acesso === "teste" ? [SEM_BUSCA] : []),
    ...(fala === "conversa" ? ["A pessoa está conversando com você por voz e a sua resposta será lida em voz alta. Responda em tom de conversa, curto (de duas a quatro frases), sem listas, tabelas, código, fórmulas nem Markdown."] : []),
  ].join("\n\n");

  const anteriores = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).reverse().map((m) => ({ role: m.role, content: m.role === "assistant" ? semNarracaoDeBusca(m.content) : m.content })),
  ];
  type OpcoesDaChamada = { semRaciocinio?: boolean; maxTokens?: number };
  const pedirModelo = (mensagens: unknown[], comBusca: boolean, opcoes: OpcoesDaChamada = {}) => fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo, messages: mensagens, stream: true, temperature: 0.2,
      ...(comBusca ? { tools: [FERRAMENTA_BUSCA] } : {}),
      stream_options: { include_usage: true },
      ...(opcoes.maxTokens ? { max_tokens: opcoes.maxTokens } : LLM_MAX_TOKENS ? { max_tokens: LLM_MAX_TOKENS } : {}),
      ...(LLAMA_TIMINGS ? { timings_per_token: true } : {}),
      ...(contextoDoServidor ? { trustio_plano: plano } : {}),
      // Conversa por voz: o servidor da Trustio responde sem raciocínio, para a fala começar na hora.
      ...(contextoDoServidor && fala === "conversa" ? { trustio_voz: true } : {}),
      // Triagem e respostas do Flash depois da busca: sem raciocínio (o gateway da Trustio entende o campo).
      ...(contextoDoServidor && opcoes.semRaciocinio ? { trustio_sem_raciocinio: true } : {}),
    }),
  });
  const chamarModelo = (ultima: unknown) => pedirModelo([...anteriores, { role: "user", content: ultima }], buscaLigada);
  // Triagem só com busca ligada (que já exige o servidor da Trustio e nenhuma foto) e fora da conversa
  // por voz, que já responde sem raciocínio. Se a chamada de triagem falhar, cai para a normal.
  let triagemAtiva = buscaLigada && fala !== "conversa";
  const chamarTriagem = () => pedirModelo([...anteriores, { role: "user", content: message }], true,
    { semRaciocinio: true, maxTokens: MAX_TOKENS_TRIAGEM });

  let upstream!: Response;
  let detail = "";
  const tentar = async () => {
    detail = "";
    if (imagens.length) {
      // Foto: texto + imagem no formato OpenAI. Se a visão não responder, falha claramente
      // em vez de tentar responder só com OCR e dar a impressão de que viu a imagem.
      upstream = await chamarModelo([
        { type: "text", text: message },
        ...imagens.map((url) => ({ type: "image_url", image_url: { url } })),
      ]);
      if (!upstream.ok || !upstream.body) {
        detail = await upstream.text().catch(() => "");
        console.error("llm_sem_imagem", upstream.status, detail.slice(0, 300));
      }
    } else {
      upstream = triagemAtiva ? await chamarTriagem() : await chamarModelo(message);
    }
  };
  try {
    await tentar();
    // Nome vindo do GET /models guardado: se o servidor trocou de modelo nesse meio tempo, a
    // chamada falha. Descarta o nome guardado, pergunta de novo e, se mudou, tenta mais uma vez.
    // (O nome definido no banco, ou o escolhido pela pessoa na lista do admin, não é trocado aqui.)
    // Só quando o erro aponta para o nome do modelo: limite de uso, servidor fora do ar ou
    // contexto cheio não passam por aqui (não adianta, e custaria mais uma espera).
    if ((!upstream.ok || !upstream.body) && !modeloConfigurado && modeloDescoberto) {
      if (!detail) detail = await upstream.text().catch(() => "");
      if (ehErroDeNomeDoModelo(upstream.status, detail)) {
        modeloDescoberto = null;
        catalogo = null;
        const novo = await modeloDaChamada(null);
        if (novo !== modelo) {
          console.log("llm_modelo_trocado", modelo, "→", novo);
          modelo = novo;
          await tentar();
        }
      }
    }
    // A triagem falhou por outro motivo (não contexto cheio): tenta a chamada normal antes de desistir.
    if ((!upstream.ok || !upstream.body) && triagemAtiva) {
      if (!detail) detail = await upstream.text().catch(() => "");
      if (!ehContextoCheio(upstream.status, detail)) {
        console.error("triagem_falhou", upstream.status, detail.slice(0, 200));
        triagemAtiva = false;
        await tentar();
      }
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
      return json(409, { error: "contexto_cheio", janela }, origin);
    }
    if (imagens.length) return json(503, { error: "imagem_indisponivel" }, origin);
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
    start(controller) {
      saida = controller;
      send({ conversation_id: convId, limite: LLM_MAX_TOKENS, modelo, skill: skillAtiva,
        ...(transcricaoAudio ? { mensagem_usuario: message } : {}) });
    },
    // Navegador foi embora: só para de enviar; a leitura do modelo segue.
    cancel() { aberto = false; },
  });

  const trabalho = (async () => {
    // Rodadas: a resposta do modelo pode ser um pedido de busca (tool_calls). Aí a função busca,
    // devolve os resultados como mensagem "tool" e lê a próxima resposta, até ele responder em texto.
    let atual = upstream;
    let buscasFeitas = 0;
    let erroRodada: string | null = null;
    const resultadosUsados: Resultado[] = [];
    const conversaDaBusca: unknown[] = [...anteriores, { role: "user", content: message }];
    let rodadaDeTriagem = triagemAtiva;
    // A rodada atual ofereceu a ferramenta de busca? Só então um pedido de busca do modelo vale (21 out 2026).
    let ferramentaNaRodada = buscaLigada;
    let rodada = 0;
    // Se o servidor do modelo cair no meio de uma rodada sem ter escrito nada (sem finish_reason), a
    // função espera ele voltar (relança sozinho em ~10 s) e repete a mesma chamada uma vez (19 out 2026).
    let refazerRodada: (() => Promise<Response>) | null = imagens.length ? null
      : triagemAtiva ? chamarTriagem : () => chamarModelo(message);
    let jaRefez = false;
    const inicioDoTrabalho = Date.now();
    let inicioDoFinal = 0;   // a narração antes de uma busca aparece na tela, mas não vai para o histórico
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
    rodadas: while (true) {
    rodada++;
    const reader = atual.body!.getReader();
    let buffer = "";
    const chamadas: { id: string; nome: string; args: string }[] = [];
    const inicioDaRodada = full.length;
    let triagemRespondeu = false;
    let pedidoIgnorado = false;
    fim = null;
    try {
      leitura: while (true) {
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
            // Pedido de busca chega em pedaços (id e nome no primeiro, argumentos espalhados).
            if (aceitaPedidosDeBusca(ferramentaNaRodada, rodada) && Array.isArray(d.tool_calls)) {
              for (const tc of d.tool_calls) {
                const i = Number.isInteger(tc?.index) ? tc.index : 0;
                if (i < 0 || i > 7) continue;
                const c = chamadas[i] ?? (chamadas[i] = { id: "", nome: "", args: "" });
                if (typeof tc.id === "string" && tc.id) c.id = tc.id;
                if (typeof tc.function?.name === "string") c.nome += tc.function.name;
                if (typeof tc.function?.arguments === "string") c.args += tc.function.arguments;
              }
            } else if (buscaLigada && Array.isArray(d.tool_calls) && d.tool_calls.length) {
              pedidoIgnorado = true;
            }
            // Triagem: nada dela vai ao navegador nem conta tokens. Texto antes de qualquer pedido de
            // busca = a pergunta não pede busca: para de ler e vai para a chamada normal.
            if (rodadaDeTriagem) {
              if (Number(pedaco.usage?.prompt_tokens) > 0 && tokensPrompt === null) tokensPrompt = Number(pedaco.usage.prompt_tokens);
              if (typeof d.content === "string" && d.content.trim() && !chamadas.length) { triagemRespondeu = true; break leitura; }
              continue;
            }
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
            // Só o prompt da primeira rodada: os resultados da busca não são reenviados na próxima
            // pergunta, então não contam para a sessão.
            if (Number(pedaco.usage?.prompt_tokens) > 0 && tokensPrompt === null) tokensPrompt = Number(pedaco.usage.prompt_tokens);
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
    const pedidos = chamadas.filter((c) => c && c.nome);
    if (rodadaDeTriagem) {
      rodadaDeTriagem = false;
      if (triagemRespondeu || interrompido || !pedidos.length) {
        // Sem busca: fecha a triagem (o servidor para de gerar) e faz a chamada normal, com raciocínio.
        await reader.cancel().catch(() => {});
        interrompido = false;
        console.log("triagem_direta", Date.now() - inicioDoTrabalho, "ms");
        refazerRodada = () => pedirModelo(conversaDaBusca, buscaLigada);
        ferramentaNaRodada = buscaLigada;
        try {
          atual = await pedirModelo(conversaDaBusca, buscaLigada);
        } catch (err) {
          console.error("llm_fetch_error_triagem", err);
          erroRodada = "modelo_indisponivel";
          break rodadas;
        }
        if (!atual.ok || !atual.body) {
          const det = await atual.text().catch(() => "");
          console.error("llm_error_triagem", atual.status, det.slice(0, 300));
          erroRodada = ehContextoCheio(atual.status, det) ? "contexto_cheio" : "modelo_indisponivel";
          break rodadas;
        }
        continue rodadas;
      }
      console.log("triagem_busca", Date.now() - inicioDoTrabalho, "ms");
    }
    if (!pedidos.length && !fim && full.length === inicioDaRodada && refazerRodada && !jaRefez) {
      jaRefez = true;
      console.error("modelo_caiu_na_rodada", interrompido ? "interrompido" : "sem_fim", Date.now() - inicioDoTrabalho, "ms");
      await reader.cancel().catch(() => {});
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const ok = await fetch(`${LLM_BASE_URL}/models`, { headers: { "Authorization": `Bearer ${LLM_API_KEY}` }, signal: AbortSignal.timeout(3000) })
          .then((r) => r.ok).catch(() => false);
        if (ok) break;
      }
      try {
        atual = await refazerRodada();
        if (atual.ok && atual.body) { interrompido = false; console.log("modelo_refeito"); continue rodadas; }
        console.error("modelo_refeito_falhou", atual.status);
      } catch (err) { console.error("modelo_refeito_erro", err); }
      erroRodada = "modelo_indisponivel";
      break rodadas;
    }
    if (!interrompido && !pedidos.length && rodadaSemResposta(pedidoIgnorado, full.slice(inicioDaRodada))) {
      console.error("busca_pedido_ignorado_sem_resposta", rodada);
      erroRodada = "modelo_indisponivel";
    }
    if (interrompido || !pedidos.length) break rodadas;

    // O modelo pediu busca. A leitura acima já terminou (o servidor da Trustio atende um pedido por vez).
    const lista = pedidos.map((c, i) => ({ ...c, id: c.id || `busca_${buscasFeitas}_${i}` }));
    conversaDaBusca.push({
      role: "assistant", content: full.slice(inicioDaRodada),
      tool_calls: lista.map((c) => ({ id: c.id, type: "function", function: { name: c.nome, arguments: c.args } })),
    });
    // Texto escrito antes do pedido de busca ("Vou pesquisar…") fica separado do que vem depois.
    if (full.length > inicioDaRodada && !/\n\s*$/.test(full)) { full += "\n\n"; send({ delta: "\n\n", n: tokens }); }
    inicioDoFinal = full.length;
    for (const c of lista) {
      let conteudo: string;
      if (c.nome !== NOME_FERRAMENTA) conteudo = "Ferramenta desconhecida.";
      else if (buscasFeitas >= MAX_BUSCAS_POR_MENSAGEM) conteudo = "Limite de buscas desta mensagem atingido: responda com o que já tem.";
      else {
        const { consulta, atual: agora } = lerArgumentos(c.args, message);
        buscasFeitas++;
        send({ buscando: consulta, n: tokens });
        const { data: vaga, error: vagaErro } = await admin.rpc("reservar_busca", { p_user_id: user.id, p_limite: BUSCA_LIMITE_DIARIO, p_demo: BUSCA_DEMO });
        if (vagaErro || !vaga?.ok) {
          if (vagaErro) console.error("reservar_busca", vagaErro);
          conteudo = vaga?.error === "busca_demo_esgotada"
            ? "A demonstração da busca na web acabou. Responda sem pesquisar e diga que a busca na web é para assinantes."
            : "Não foi possível pesquisar agora (limite de buscas). Responda com o que você sabe e avise isso.";
        } else {
          try {
            const inicioDaBusca = Date.now();
            const rs = await buscarNaWeb(consulta, agora, EXA_API_KEY, fetch, { curta: fala === "conversa" });
            console.log("busca_ok", rs.length, vaga.demo ? "demo" : "livre", Date.now() - inicioDaBusca, "ms", agora ? "agora" : "cache");
            resultadosUsados.push(...rs);
            conteudo = resultadosParaModelo(consulta, rs);
            send({ busca_resultados: rs.length });
          } catch (err) {
            const e = err as { status?: number; detalhe?: string; message?: string };
            console.error("busca_falhou", e.status ?? e.message, e.detalhe ?? "");
            await admin.rpc("devolver_busca", { p_user_id: user.id, p_demo: !!vaga.demo });
            conteudo = "A busca na web falhou agora. Responda com o que você sabe e avise que não conseguiu pesquisar.";
          }
        }
      }
      conversaDaBusca.push({ role: "tool", tool_call_id: c.id, content: conteudo });
    }
    // Próxima rodada: com a ferramenta só se ainda couber outra busca; senão ele tem de responder.
    const comBuscaAinda = buscasFeitas < MAX_BUSCAS_POR_MENSAGEM;
    ferramentaNaRodada = comBuscaAinda;
    const conversaAgora = [...conversaDaBusca];
    refazerRodada = () => pedirModelo(conversaAgora, comBuscaAinda, { semRaciocinio: MODELOS_SEM_RACIOCINIO_APOS_BUSCA.has(modelo) });
    try {
      atual = await refazerRodada();
    } catch (err) {
      console.error("llm_fetch_error_busca", err);
      erroRodada = "modelo_indisponivel";
      break rodadas;
    }
    if (!atual.ok || !atual.body) {
      const det = await atual.text().catch(() => "");
      console.error("llm_error_busca", atual.status, det.slice(0, 300));
      erroRodada = ehContextoCheio(atual.status, det) ? "contexto_cheio" : "modelo_indisponivel";
      break rodadas;
    }
    }
    if (raciocinioRetido) soltarRaciocinio(true);

    // Fontes: se a resposta usou a busca e não citou nenhum link, a linha de fontes entra no fim
    // (e fica salva no histórico). Na conversa por voz, não: links não se falam.
    if (full && resultadosUsados.length && fala !== "conversa" && !erroRodada) {
      const fontes = linhaDeFontes(full, resultadosUsados);
      if (fontes) { full += fontes; send({ delta: fontes, n: tokens }); }
    }

    if (full) {
      await admin.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: full.slice(inicioDoFinal).trim() || full, model: modelo });
      await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      if (interrompido) send({ error: "stream_interrompido" });
      // A segunda rodada (depois da busca) falhou, mas a primeira já tinha escrito algo: avisa.
      else if (erroRodada) send({ error: erroRodada, ...(erroRodada === "contexto_cheio" ? { janela } : {}) });
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
        janela,
        remaining: reservation.remaining ?? null,
        limit: reservation.subscriber ? null : reservation.limit,
        trial_ends_at: reservation.trial_ends_at ?? null,
      });
    } else {
      // Nada de texto. Só devolve a pergunta à cota se nada chegou ao navegador: raciocínio
      // já entregue conta como uso (sem isso, pedir só o raciocínio virava pergunta grátis).
      console.error(interrompido ? "stream_interrompido_sem_texto" : "llm_resposta_vazia");
      if (!pensando && !buscasFeitas) await release();
      send({ error: erroRodada ?? (interrompido ? "stream_interrompido" : "resposta_vazia"), ...(erroRodada === "contexto_cheio" ? { janela } : {}) });
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
