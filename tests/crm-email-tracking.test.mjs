import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Webhook } from 'svix';
const source=readFileSync(new URL('../supabase/functions/email-eventos/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const js=stripTypeScriptTypes(source,{mode:'strip'});
const secret='whsec_'+Buffer.from('trustio-fixture-secret').toString('base64');
function harness(){
  let handler;const calls=[];
  vm.runInNewContext(js,{Deno:{env:{get:key=>key==='RESEND_WEBHOOK_SECRET'?secret:'fixture'},serve:fn=>handler=fn},Webhook,Response,URL,Date,console,
    createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {};}})});
  const event={type:'email.clicked',created_at:'2026-10-10T12:00:00Z',data:{email_id:'message',from:'Trustio <contato@trustio.com.br>',to:['user@test'],subject:'Convite',click:{link:'https://trustio.com.br/afiliados.html?token=secret#private'}}};
  function request({body=event,timestamp=new Date(),tamper=false,valid=true}={}){
    const payload=JSON.stringify(body);const headers={'svix-id':'msg_fixture','svix-timestamp':String(Math.floor(timestamp/1000)),
      'svix-signature':valid?new Webhook(secret).sign('msg_fixture',timestamp,payload):'v1,wrong'};
    return handler(new Request('https://fixture.test',{method:'POST',headers,body:tamper?payload+' ':payload}));
  }
  return {request,calls,event};
}
test('assinatura real Svix é obrigatória, sem aceitar adulterações ou assinaturas antigas',async()=>{
  const h=harness();for(const options of [{valid:false},{tamper:true},{timestamp:new Date(Date.now()-600000)}]) assert.equal((await h.request(options)).status,401);
  assert.equal(h.calls.length,0);assert.equal((await h.request()).status,200);assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].args.p_link,'https://trustio.com.br/afiliados.html');
});
test('rastreamento cobre subdomínios Trustio e rejeita remetentes de outro domínio',async()=>{
  const h=harness();h.event.data.from='Trustio <no-reply@send.trustio.com.br>';assert.equal((await h.request()).status,200);assert.equal(h.calls.length,1);
  h.event.data.from='spam@trustio.com.br.evil.test';assert.equal((await h.request()).status,200);assert.equal(h.calls.length,1);
  h.event.data.from='spam@eviltrustio.com.br';assert.equal((await h.request()).status,200);assert.equal(h.calls.length,1);
});
test('painel representa eventos sem chamar ausência de abertura de ignorado',()=>{
  const source=readFileSync(new URL('../assets/crm.js',import.meta.url),'utf8');
  const start=source.indexOf('  var emailPedido'),end=source.indexOf('  function carregarEmails()',start);
  const ctx={esc:s=>String(s).replace(/</g,'&lt;'),fmt:s=>s||'—'};vm.runInNewContext(source.slice(start,end),ctx);
  const html=ctx.emailHtml({assunto:'<script>',estado:'sem_interacao',remetente:'contato@trustio.com.br',destinatario:'user@test'});
  assert.ok(html.includes('Sem interação registrada há 48h'));assert.ok(!html.includes('Ignorado'));assert.ok(!html.includes('<script>'));
});
