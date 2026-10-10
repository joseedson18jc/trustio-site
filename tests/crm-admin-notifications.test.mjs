import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';
const js=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-avisos/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function'),{mode:'strip'});
async function harness({key='key',failed=false,dbError=false}={}) {
  let handler; const calls=[],sends=[];
  const n={id:'event-id',evento:'cadastro',destinatario:'admin@test',email:'user@test',nome:'<script>',plano:null,reservado_em:'2026-10-10'};
  const ctx={Deno:{env:{get:name=>name==='ADMIN_AVISOS_SECRET'?'internal':name==='RESEND_API_KEY'?key:'fixture'},serve:fn=>handler=fn},
    createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:[n],error:dbError?'db':null};}}),
    crypto:webcrypto,TextEncoder,Uint8Array,Response,AbortSignal,setTimeout:fn=>{fn();},
    fetch:async(url,options)=>{sends.push({body:JSON.parse(options.body),headers:options.headers});return Response.json(failed?{}:{id:'provider'},{status:failed?503:200});}};
  vm.runInNewContext(js,ctx);
  const invoke=(secret='internal',method='POST')=>handler(new Request('https://fixture.test',{method,headers:{'x-trustio-segredo':secret}}));
  return {invoke,calls,sends,ctx};
}
test('aviso interno exige segredo e provedor antes de reservar; falha não registra envio',async()=>{
  for(const opts of [{key:''},{dbError:true}]) {const h=await harness(opts);assert.equal((await h.invoke()).status,503);assert.equal(h.sends.length,0);}
  const h=await harness();assert.equal((await h.invoke('bad')).status,401);assert.equal((await h.invoke('internal','GET')).status,405);assert.equal(h.calls.length,0);
  const failed=await harness({failed:true});await failed.invoke();assert.equal(failed.calls.at(-1).args.p_provider,null);assert.ok(failed.calls.at(-1).args.p_erro);
});
test('notificação usa destinatário da fila, escapa dados e chave estável por evento',async()=>{
  const h=await harness();assert.equal((await(await h.invoke()).json()).enviados,1);
  assert.deepEqual(h.sends[0].body.to,['admin@test']);assert.equal(h.sends[0].headers['Idempotency-Key'],'admin-aviso/event-id');
  assert.ok(!h.sends[0].body.html.includes('<script>'));assert.ok(h.sends[0].body.text.includes('confirmação'));
  const paid=h.ctx.mensagem({evento:'assinatura',destinatario:'admin@test',email:'buyer@test',plano:'Pessoal'});
  assert.ok(paid.subject.includes('assinatura'));assert.ok(paid.text.includes('Pessoal'));
});
