// Trustio · voz das respostas (Supabase Edge Function), 17 out 2026.
// Recebe o texto de uma resposta do chat, confere que a conta tem acesso livre (assinante etc.),
// reserva os caracteres no teto diário e devolve o áudio MP3 da ElevenLabs em streaming.
// A chave da ElevenLabs nunca chega ao navegador.
//
// Segredos (o workflow supabase.yml copia dos secrets do GitHub):
//   ELEVENLABS_API_KEY   obrigatório para a voz funcionar (sem ele, 503 voz_nao_configurada)
//   ELEVENLABS_VOICE_ID  obrigatório: a voz escolhida (masculina, grave, clara)
//   ELEVENLABS_MODEL     opcional, padrão eleven_v4_turbo (baixa latência, aceita language_code pt)
//   VOZ_LIMITE_DIARIO    opcional, caracteres por conta por dia, padrão 60000 (~1 hora de fala)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cortarNaFrase, textoParaFala } from "./texto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim();
const VOICE_ID = (Deno.env.get("ELEVENLABS_VOICE_ID") ?? "").trim();
const MODEL = (Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_v4_turbo").trim();
const LIMITE_DIARIO = Math.max(1000, Number(Deno.env.get("VOZ_LIMITE_DIARIO") ?? "60000") || 60000);
const MAX_POR_PEDIDO = 3000;

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "method_not_allowed" }, origin);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" }, origin);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "unauthorized" }, origin);

  // GET: o chat pergunta se a voz está ligada no servidor (sem gastar nada).
  if (req.method === "GET") return json(200, { configurada: !!(API_KEY && VOICE_ID), limite_diario: LIMITE_DIARIO }, origin);

  if (!API_KEY || !VOICE_ID) return json(503, { error: "voz_nao_configurada" }, origin);
  let body: { texto?: unknown; idioma?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "pedido_invalido" }, origin); }
  const texto = cortarNaFrase(textoParaFala(typeof body.texto === "string" ? body.texto : ""), MAX_POR_PEDIDO);
  if (!texto) return json(400, { error: "texto_vazio" }, origin);
  const idioma = body.idioma === "en" ? "en" : "pt";

  const { data: reserva, error: reservaErro } = await admin.rpc("reservar_voz", {
    p_user_id: user.id, p_caracteres: texto.length, p_limite: LIMITE_DIARIO,
  });
  if (reservaErro || !reserva) { console.error("reservar_voz", reservaErro); return json(503, { error: "voz_indisponivel" }, origin); }
  if (!reserva.ok) {
    const status = reserva.error === "voz_so_assinantes" ? 402 : reserva.error === "voz_limite_diario" ? 429 : 403;
    return json(status, { error: reserva.error, usados: reserva.usados, limite: reserva.limite }, origin);
  }
  const devolver = () => admin.rpc("devolver_voz", { p_user_id: user.id, p_caracteres: texto.length });

  let resposta: Response;
  try {
    resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}/stream?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({
        text: texto, model_id: MODEL, language_code: idioma,
        // Voz firme e clara: estabilidade alta o bastante para não oscilar, sem ficar robótica.
        voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
      }),
    });
  } catch (err) {
    console.error("elevenlabs_rede", err);
    await devolver();
    return json(502, { error: "voz_indisponivel" }, origin);
  }
  if (!resposta.ok || !resposta.body) {
    console.error("elevenlabs_status", resposta.status, (await resposta.text().catch(() => "")).slice(0, 300));
    await devolver();
    return json(502, { error: "voz_indisponivel" }, origin);
  }
  return new Response(resposta.body, {
    status: 200,
    headers: { ...cors(origin), "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
               "X-Voz-Usados": String(reserva.usados), "X-Voz-Limite": String(reserva.limite),
               "Access-Control-Expose-Headers": "X-Voz-Usados, X-Voz-Limite" },
  });
});
