// Trustio · função de chat (Supabase Edge Function, projeto yxkgdgcdvngltnykleig · sa-east-1).
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
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "grok-4";
const HISTORY = 30;

const ALLOWED_ORIGINS = /^https:\/\/(?:[a-z0-9-]+\.)?trustio\.com\.br$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://trustio.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

type Reservation = {
  ok: boolean; error?: string; lead_id?: string; used?: number; limit?: number;
  subscriber?: boolean; remaining?: number | null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthorized" }, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "unauthorized" }, origin);
  if (!user.email_confirmed_at) return json(403, { error: "email_nao_confirmado" }, origin);

  let body: { conversation_id?: string; message?: string };
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }, origin); }
  const message = String(body.message ?? "").trim();
  if (!message) return json(400, { error: "mensagem_vazia" }, origin);
  if (message.length > 12000) return json(413, { error: "mensagem_longa" }, origin);

  // Sem chave do modelo nada é consumido nem gravado.
  if (!LLM_API_KEY) return json(503, { error: "modelo_nao_configurado" }, origin);

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
    const title = message.length > 60 ? message.slice(0, 57).trimEnd() + "…" : message;
    const { data: conv, error } = await admin.from("conversations").insert({ user_id: user.id, title }).select("id").single();
    if (error || !conv) { await release(); return json(500, { error: "conversa_nao_criada" }, origin); }
    conversationId = conv.id;
  }

  const { data: history } = await admin.from("messages").select("role,content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY - 1);
  const { data: promptRow } = await admin.from("app_settings").select("value").eq("key", "system_prompt").maybeSingle();
  const systemPrompt = typeof promptRow?.value === "string" ? promptRow.value : "Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).reverse().map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: true, temperature: 0.7 }),
    });
  } catch (err) {
    console.error("llm_fetch_error", err);
    await release();
    return json(502, { error: "modelo_indisponivel" }, origin);
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("llm_error", upstream.status, detail.slice(0, 500));
    await release();
    return json(502, { error: "modelo_indisponivel", status: upstream.status }, origin);
  }

  // O modelo aceitou: a mensagem do usuário entra no histórico.
  await admin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let full = "";
  const convId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ conversation_id: convId });
      const reader = upstream.body!.getReader();
      let buffer = "";
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
              const chunk = JSON.parse(payload);
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (delta) { full += delta; send({ delta }); }
            } catch { /* fragmento incompleto */ }
          }
        }
      } catch (err) {
        console.error("stream_error", err);
        send({ error: "stream_interrompido" });
      }

      if (full) {
        await admin.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: full, model: LLM_MODEL });
        await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      }
      send({
        done: true,
        conversation_id: convId,
        remaining: reservation.remaining ?? null,
        limit: reservation.subscriber ? null : reservation.limit,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...cors(origin), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
