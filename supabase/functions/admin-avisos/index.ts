import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const segredo = Deno.env.get("ADMIN_AVISOS_SECRET") ?? "";
const key = Deno.env.get("RESEND_API_KEY") ?? "";
const from = Deno.env.get("EMAIL_FROM") ?? "Trustio <no-reply@send.trustio.com.br>";
const esc = (s: string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
type Aviso = { id: string; evento: string; destinatario: string; nome: string | null; email: string; plano: string | null; origem?: string; reservado_em: string };
export function mensagem(n: Aviso) {
  const subject = n.evento === "assinatura" ? "Trustio · nova assinatura no CRM" : "Trustio · novo cadastro";
  const descricao = n.evento === "assinatura" ? (n.origem === "stripe" ? "Um novo comprador concluiu o checkout na Stripe." : "Uma pessoa passou ao status assinante no CRM.") : "Uma pessoa criou uma conta na Trustio. A confirmação do e-mail pode estar pendente.";
  const detalhes = `${n.nome || "Sem nome"}\n${n.email}\nPlano: ${n.plano || "Não informado"}`;
  return { from, to: [n.destinatario], subject,
    text: `${descricao}\n\n${detalhes}\n\nAbrir CRM: https://trustio.com.br/crm/`,
    html: `<h1>${esc(subject)}</h1><p>${esc(descricao)}</p><p>${esc(n.nome || "Sem nome")}<br>${esc(n.email)}<br>Plano: ${esc(n.plano || "Não informado")}</p><p><a href="https://trustio.com.br/crm/">Abrir CRM</a></p>` };
}
async function iguais(a: string,b: string) {
  const hash = (v: string)=>crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  const [x,y]=await Promise.all([hash(a),hash(b)]);
  return new Uint8Array(x).reduce((d,v,i)=>d|(v^new Uint8Array(y)[i]),0)===0;
}
Deno.serve(async req=>{
  if(req.method!=="POST")return new Response(null,{status:405});
  if(!segredo || !await iguais(req.headers.get("x-trustio-segredo")??"",segredo))return new Response(null,{status:401});
  if(!key)return new Response(null,{status:503});
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data,error}=await db.rpc("crm_admin_reservar_avisos");
  if(error)return new Response(null,{status:503});
  let enviados=0;
  for (const n of data as Aviso[]) {
    let provider: string|null=null;
    try {
      const r=await fetch("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`admin-aviso/${n.id}`},body:JSON.stringify(mensagem(n))});
      const body=await r.json(); if(r.ok&&typeof body.id==="string")provider=body.id;
    } catch { /* Retry the same immutable message and key within Resend's 24h window. */ }
    const {error:save}=await db.rpc("crm_admin_concluir_aviso",{p_id:n.id,p_reserva:n.reservado_em,p_provider:provider,p_erro:provider?null:"Envio não confirmado; nova tentativa automática."});
    if(provider&&!save)enviados++;
    await new Promise(resolve=>setTimeout(resolve,550));
  }
  return Response.json({enviados,processados:data.length});
});
