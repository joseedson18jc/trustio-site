import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../supabase/functions/hermes-autorizados/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const js=stripTypeScriptTypes(source,{mode:'strip'});
async function request(rows,{fail=false,secret='secret'}={}) {
  let handler; const pages=[];
  const admin={from:()=>({select(){return this;},gt(_,id){this.after=id;return this;},order(){return this;},limit(n){pages.push(n);return Promise.resolve(fail?{error:new Error('db')}:{data:rows.filter(l=>!this.after || l.id>this.after).slice(0,n)});}})};
  const ctx={Deno:{env:{get:key=>key==='HERMES_SEGREDO'?'secret':'fixture'},serve:fn=>{handler=fn;}},createClient:()=>admin,Response,TextEncoder,Date};
  vm.runInNewContext(js,ctx);
  return {response:await handler(new Request('https://example.test',{headers:{'x-trustio-segredo':secret}})),pages};
}
const row=(id,phone,extra={})=>({id:String(id).padStart(5,'0'),telefone:phone,whatsapp_numero:phone,status:'assinante',acesso_modo:'padrao',...extra});
test('WhatsApp respeita revogação, bloqueios e janela de acesso, mesmo com telefone compartilhado',async()=>{
  const rows=[row(1,'11999990001'),row(2,'11999990002',{acesso_modo:'revogado'}),row(3,'11999990003',{acesso_fim:'2000-01-01'}),row(4,'11999990004',{acesso_inicio:'2099-01-01'}),row(5,'11999990005',{acesso_modo:'bloqueado_login'}),row(6,'11999990005'),row(7,'11999990007',{status:'cancelado'}),row(8,'11999990008',{status:'ativo',whatsapp_trial_status:'ativo',whatsapp_trial_ends_at:'2099-01-01'}),row(9,'11999990009',{status:'ativo',whatsapp_trial_status:'ativo',whatsapp_trial_ends_at:'2000-01-01'})];
  const {response}=await request(rows); const data=await response.json();
  assert.deepEqual(data.numeros,['5511999990001','5511999990008']);
  assert.deepEqual(data.negados,['5511999990002','5511999990003','5511999990004','5511999990005','5511999990007']);
});
test('WhatsApp pagina todas as contas e falha com segurança se a consulta falhar',async()=>{
  const rows=Array.from({length:1001},(_,i)=>row(i,'11999990001'));
  const {response,pages}=await request(rows); assert.equal(response.status,200);assert.equal(pages.length,2);
  assert.equal((await request(rows,{fail:true})).response.status,500);
  assert.equal((await request(rows,{secret:'wrong'})).response.status,401);
});
