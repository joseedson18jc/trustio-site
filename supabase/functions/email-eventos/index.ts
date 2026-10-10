import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:svix@2.8.0";

const SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const types = new Set(["email.sent","email.delivered","email.opened","email.clicked","email.delivery_delayed","email.failed","email.bounced","email.complained","email.suppressed"]);
type Evento = { type: string; created_at: string; data: { email_id: string; from: string; to: string[]; subject?: string; click?: { link?: string } } };
function linkSeguro(value?: string) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:","http:"].includes(url.protocol) ? (url.origin + url.pathname).slice(0,1000) : null; } catch { return null; }
}
const endereco = (value: string) => value.trim().match(/<?([^\s<>]+@[^\s<>]+)>?$/)?.[1]?.toLowerCase();
Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SECRET) return new Response("Webhook unavailable", { status: 503 });
  let event: Evento;
  const id = req.headers.get("svix-id") ?? "";
  try {
    const raw = await req.text();
    if (raw.length > 1000000) return new Response("Payload too large", { status: 413 });
    new Webhook(SECRET).verify(raw, { "svix-id": id, "svix-timestamp": req.headers.get("svix-timestamp") ?? "", "svix-signature": req.headers.get("svix-signature") ?? "" });
    event = JSON.parse(raw) as Evento;
  } catch { return new Response("Invalid signature", { status: 401 }); }
  if (!event || !types.has(event.type)) return new Response("Ignored", { status: 200 });
  const data = event.data;
  if (!data || typeof data.from !== "string" || !Array.isArray(data.to) || data.to.length===0 || data.to.some(to=>typeof to!=="string" || !to.includes("@")) || typeof data.email_id!=="string" || !data.email_id || !Number.isFinite(Date.parse(event.created_at))) return new Response("Invalid event", { status: 400 });
  const from = endereco(data.from);
  if (!from || !/@(?:[a-z0-9-]+\.)*trustio\.com\.br$/.test(from)) return new Response("Ignored sender", { status: 200 });
  const recipients = data.to.map(endereco);
  if (recipients.some(to=>!to)) return new Response("Invalid recipients", { status: 400 });
  const admin = createClient(URL_BASE,SERVICE_KEY,{auth:{persistSession:false}});
  const { error } = await admin.rpc("crm_registrar_email", { p_evento_id:id,p_email_id:data.email_id,p_tipo:event.type,p_em:event.created_at,
    p_remetente:from,p_destinatarios:[...new Set(recipients)],p_assunto:typeof data.subject==="string"?data.subject:"",p_link:linkSeguro(data.click?.link) });
  if (error) { console.error("email_eventos: database update failed",error.code); return new Response("Retry later",{status:503}); }
  return new Response("OK",{status:200});
});
