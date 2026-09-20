// Trustio · função de chat (Supabase Edge Function, projeto yxkgdgcdvngltnykleig · sa-east-1).
// Recebe a mensagem do cliente autenticado, aplica a cota do plano, chama o modelo
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

  // Lead do CRM + cota.
  const { data: lead } = await admin.from("crm_leads").select("id,status,mensagens_usadas,plano").eq("user_id", user.id).maybeSingle();
  const { data: limitRow } = await admin.from("app_settings").select("value").eq("key", "free_message_limit").maybeSingle();
  const limit = limitRow && limitRow.value !== null ? Number(limitRow.value) : 0; // 0 = sem limite
  const used = lead?.mensagens_usadas ?? 0;
  const subscriber = lead?.status === "assinante";
  if (!subscriber && limit > 0 && used >= limit) {
    if (lead && lead.status !== "trial_esgotado") {
      await admin.from("crm_leads").update({ status: "trial_esgotado" }).eq("id", lead.id);
    }
    return json(402, { error: "trial_esgotado", used, limit }, origin);
  }

  if (!LLM_API_KEY) return json(503, { error: "modelo_nao_configurado" }, origin);

  // Conversa (cria se necessário; confere que pertence ao usuário).
  let conversationId = body.conversation_id ?? null;
  if (conversationId) {
    const { data: conv } = await admin.from("conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) conversationId = null;
  }
  if (!conversationId) {
    const title = message.length > 60 ? message.slice(0, 57).trimEnd() + "…" : message;
    const { data: conv, error } = await admin.from("conversations").insert({ user_id: user.id, title }).select("id").single();
    if (error || !conv) return json(500, { error: "conversa_nao_criada" }, origin);
    conversationId = conv.id;
  }

  await admin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message });

  const { data: history } = await admin.from("messages").select("role,content")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(HISTORY);
  const { data: promptRow } = await admin.from("app_settings").select("value").eq("key", "system_prompt").maybeSingle();
  const systemPrompt = typeof promptRow?.value === "string" ? promptRow.value : "Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).reverse().map((m) => ({ role: m.role, content: m.content })),
  ];

  const upstream = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: LLM_MODEL, messages, stream: true, temperature: 0.7 }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("llm_error", upstream.status, detail.slice(0, 500));
    return json(502, { error: "modelo_indisponivel", status: upstream.status }, origin);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let full = "";
  const convId = conversationId;
  const leadId = lead?.id ?? null;

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

      // Persistência + contadores (após o streaming, sem bloquear a resposta).
      if (full) {
        await admin.from("messages").insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: full, model: LLM_MODEL });
        await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      }
      let remaining: number | null = null;
      if (leadId) {
        const nextUsed = used + 1;
        const nextStatus = subscriber ? "assinante" : (limit > 0 && nextUsed >= limit ? "trial_esgotado" : "ativo");
        await admin.from("crm_leads").update({ mensagens_usadas: nextUsed, status: nextStatus, last_seen_at: new Date().toISOString() }).eq("id", leadId);
        remaining = subscriber || limit === 0 ? null : Math.max(0, limit - nextUsed);
      }
      send({ done: true, conversation_id: convId, remaining, limit: subscriber ? null : limit });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...cors(origin), "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
