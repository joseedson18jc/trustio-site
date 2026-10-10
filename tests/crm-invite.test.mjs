import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const raw=readFileSync(new URL('../supabase/functions/crm-convite/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
const js=stripTypeScriptTypes(raw,{mode:'strip'});
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function harness({admin=true,authenticated=true,key='fixture',sent=false,failed=false,saveError=false}={}) {
  let handler; const calls=[]; const sends=[];
  const c={id:uid(100),email:'verified@test',nome:'<script>alert(1)</script>',fim:'2026-10-13T19:00:00Z',enviado_em:sent?'2026-10-10':null,concedeu:true};
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id:uid(1)}:null}})},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='is_admin'?admin:c,error:name==='crm_concluir_convite'&&saveError?new Error('db'):null};}};
  const ctx={Deno:{env:{get:name=>name==='RESEND_API_KEY'?key:'fixture'},serve:fn=>handler=fn},createClient:()=>client,Response,Date,AbortSignal,
    fetch:async(url,options)=>{sends.push({url,options,body:JSON.parse(options.body)});return new Response(JSON.stringify(failed?{error:'failed'}:{id:'provider'}),{status:failed?503:200});}};
  vm.runInNewContext(js,ctx);
  const invoke=(headers={Authorization:'Bearer token'},body={lead_id:uid(2),pedido:uid(100),conceder:true})=>handler(new Request('https://fixture.test',{method:'POST',headers,body:JSON.stringify(body)}));
  return {invoke,calls,sends};
}
test('email tem prazo de Brasília, chat e afiliados; escape impede HTML do nome',async()=>{
  const h=await harness();const result=await (await h.invoke()).json();
  assert.equal(result.enviado,true); assert.equal(h.sends.length,1);
  const {body,options}=h.sends[0];assert.deepEqual(body.to,['verified@test']);
  assert.ok(body.html.includes('&lt;script&gt;'));assert.ok(!body.html.includes('<script>'));
  for(const value of ['https://trustio.com.br/app/','https://trustio.com.br/afiliados.html','13 de outubro de 2026','16:00','comissões']) {assert.ok(body.html.includes(value),value);assert.ok(body.text.includes(value),value);}
  assert.equal(options.headers['Idempotency-Key'],'crm-convite/'+uid(100));
  assert.equal(h.calls.at(-1).args.p_provider_id,'provider');
});
test('só admin autenticado envia; falta de provedor não concede dias',async()=>{
  for(const options of [{admin:false},{authenticated:false},{key:''}]) {
    const h=await harness(options);const res=await h.invoke();assert.ok(res.status>=400);assert.equal(h.sends.length,0);
    assert.ok(!h.calls.some(x=>x.name==='crm_preparar_convite'));
  }
  const h=await harness();assert.equal((await h.invoke({})).status,401);assert.equal((await h.invoke(undefined,{lead_id:'bad'})).status,400);
});
test('envio confirmado não é repetido; falha ou erro de registro não vira sucesso falso',async()=>{
  const sent=await harness({sent:true});assert.equal((await(await sent.invoke()).json()).enviado,true);assert.equal(sent.sends.length,0);
  const failed=await harness({failed:true});const failure=await(await failed.invoke()).json();assert.equal(failure.enviado,false);assert.ok(failure.error);assert.ok(failed.calls.at(-1).args.p_erro);
  const uncertain=await harness({saveError:true});assert.ok((await(await uncertain.invoke()).json()).error);
});
