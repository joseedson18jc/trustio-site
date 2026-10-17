// Trustio · voz das respostas (Supabase Edge Function), 17 out 2026.
// Recebe o texto de uma resposta do chat e devolve o áudio MP3 falado em português.
// Provedores (provedores.ts): xAI primeiro (pt-BR), ElevenLabs de reserva se a xAI falhar.
// Assinantes têm um teto diário; quem está no teste ganha uma demonstração única (~3 respostas).
// As chaves nunca chegam ao navegador.
//
// Segredos (o workflow supabase.yml copia dos secrets do GitHub):
//   VOZ_XAI_API_KEY      chave da xAI só para a voz (nome próprio: XAI_API_KEY a função chat lê como
//                        chave do modelo, e os segredos do projeto valem para todas as funções)
//   XAI_VOICE_ID         voz da xAI, padrão "rex"
//   VOZ_XAI_API_KEY_RESERVA  segunda chave da xAI, tentada se a principal falhar
//   ELEVENLABS_API_KEY   reserva; ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (padrão eleven_v4_turbo)
//   VOZ_LIMITE_DIARIO    caracteres por assinante por dia, padrão 60000 (~1 hora de fala)
//   VOZ_DEMO             caracteres da demonstração única de quem está no teste, padrão 1500
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cortarNaFrase, textoParaFala } from "./texto.ts";
import { type ConfigVoz, provedoresConfigurados, sintetizar } from "./provedores.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONFIG: ConfigVoz = {
  xaiKey: (Deno.env.get("VOZ_XAI_API_KEY") ?? "").trim(),
  xaiVoz: (Deno.env.get("XAI_VOICE_ID") ?? "rex").trim(),
  xaiKey2: (Deno.env.get("VOZ_XAI_API_KEY_RESERVA") ?? "").trim(),
  elevenKey: (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim(),
  elevenVoz: (Deno.env.get("ELEVENLABS_VOICE_ID") ?? "").trim(),
  elevenModelo: (Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_v4_turbo").trim(),
};
const LIMITE_DIARIO = Math.max(1000, Number(Deno.env.get("VOZ_LIMITE_DIARIO") ?? "60000") || 60000);
const DEMO = Math.max(0, Number(Deno.env.get("VOZ_DEMO") ?? "1500") || 0);
const MAX_POR_PEDIDO = 3000;
const MAX_DEMO_POR_RESPOSTA = 500;   // a demonstração cobre ~3 respostas de verdade, não uma resposta longa

const ALLOWED_ORIGINS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://trustio.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-Voz-Demo, X-Voz-Restante, X-Voz-Provedor",
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

  // GET: o chat pergunta se a voz está ligada e quanto da demonstração ainda resta (sem gastar nada).
  if (req.method === "GET") {
    const configurada = provedoresConfigurados(CONFIG).length > 0;
    const { data: situacao } = await admin.rpc("voz_situacao", { p_user_id: user.id, p_demo: DEMO });
    return json(200, { configurada, acesso: situacao?.acesso ?? "teste", demo_restante: situacao?.demo_restante ?? 0 }, origin);
  }

  if (!provedoresConfigurados(CONFIG).length) return json(503, { error: "voz_nao_configurada" }, origin);
  // As mesmas portas do chat: e-mail confirmado e chat aberto para esta conta (acesso_do_chat).
  if (!user.email_confirmed_at) return json(403, { error: "email_nao_confirmado" }, origin);
  const { data: liberacao, error: liberacaoErro } = await admin.rpc("acesso_do_chat", { p_user_id: user.id });
  if (liberacaoErro || !liberacao?.aberto) return json(403, { error: "chat_ainda_fechado" }, origin);
  let body: { texto?: unknown; idioma?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "pedido_invalido" }, origin); }
  const { data: situacao } = await admin.rpc("voz_situacao", { p_user_id: user.id, p_demo: DEMO });
  const teto = situacao?.acesso === "livre" ? MAX_POR_PEDIDO : MAX_DEMO_POR_RESPOSTA;
  const texto = cortarNaFrase(textoParaFala(typeof body.texto === "string" ? body.texto : ""), teto);
  if (!texto) return json(400, { error: "texto_vazio" }, origin);
  const idioma = body.idioma === "en" ? "en" : "pt";

  const { data: reserva, error: reservaErro } = await admin.rpc("reservar_voz", {
    p_user_id: user.id, p_caracteres: texto.length, p_limite: LIMITE_DIARIO, p_demo: DEMO,
  });
  if (reservaErro || !reserva) { console.error("reservar_voz", reservaErro); return json(503, { error: "voz_indisponivel" }, origin); }
  if (!reserva.ok) {
    const status = reserva.error === "voz_demo_esgotada" ? 402 : reserva.error === "voz_limite_diario" ? 429 : 403;
    return json(status, { error: reserva.error, usados: reserva.usados, limite: reserva.limite }, origin);
  }

  try {
    const { resposta, provedor } = await sintetizar(texto, idioma, CONFIG);
    return new Response(resposta.body, {
      status: 200,
      headers: { ...cors(origin), "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
                 "X-Voz-Demo": reserva.demo ? "1" : "0", "X-Voz-Restante": String(reserva.restante ?? ""),
                 "X-Voz-Provedor": provedor },
    });
  } catch (err) {
    await admin.rpc("devolver_voz", { p_user_id: user.id, p_caracteres: texto.length, p_demo: !!reserva.demo });
    const codigo = err instanceof Error ? err.message : "voz_indisponivel";
    const falhas = (err as { falhas?: string[] })?.falhas ?? [];
    return json(codigo === "voz_nao_configurada" ? 503 : 502, { error: codigo, falhas }, origin);
  }
});
