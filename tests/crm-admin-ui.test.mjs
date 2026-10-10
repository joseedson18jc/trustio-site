import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../assets/crm.js',import.meta.url),'utf8');
const func = (a,b) => source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function harness() {
  const nodes=new Map();
  const $=key=>{ if(!nodes.has(key)) nodes.set(key,{value:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(key); };
  const ctx={ $, Date, eu:{papel:'admin',id:'admin'}, dlg:{dataset:{id:'lead'},open:true}, state:{q:'',sort:{key:'nome',dir:1},tag:'',filter:''},
    base:()=>ctx.state.leads, passaFiltro:()=>true, etiquetasDe:l=>l.etiquetas||[], PAPEL_LABEL:{}, valorOrdem:l=>l.nome,
    lead:()=>ctx.state.leads[0], renderRows(){}, gravarFicha(){}, toast(){}, loadLeads:()=>Promise.resolve(), abrirDetalhe(){}};
  vm.createContext(ctx);
  vm.runInContext(func('  function visible()','  function renderRows()')+func('  function estadoAcesso(','  // ------------------------------------------------------------- investigação'),ctx);
  return {ctx,$};
}
test('estado de acesso distingue agendado, vencido, cancelado e bloqueado',()=>{
  const {ctx}=harness();
  for(const [lead,result] of [[{},'disponivel'],[{acesso_inicio:'2099-01-01'},'agendado'],[{acesso_fim:'2000-01-01'},'vencido'],[{acesso_modo:'bloqueado_login'},'bloqueado'],[{status:'cancelado'},'revogado'],[{status:'cancelado',acesso_modo:'liberado'},'disponivel']]) assert.equal(ctx.estadoAcesso(lead),result);
});
test('segmento, acesso, datas, busca e etiquetas compõem o mesmo filtro',()=>{
  const {ctx,$}=harness();
  ctx.state.leads=[{nome:'A',segmento:'Saúde',email:'a@test',created_at:'2026-10-09T12:00:00Z',acesso_modo:'revogado',etiquetas:['vip']},{nome:'B',segmento:'Varejo',created_at:'2026-10-10T12:00:00Z'}];
  $('[data-segment-filter]').value='saúde'; $('[data-access-filter]').value='revogado';
  $('[data-created-from]').value='2026-10-09'; $('[data-created-to]').value='2026-10-09';
  ctx.state.tag='vip'; ctx.state.q='a@test'; assert.equal(ctx.visible().length,1);
  $('[data-created-to]').value='2026-10-08'; assert.equal(ctx.visible().length,0);
  $('[data-clear-admin-filters]').listeners.click(); assert.equal($('[data-created-to]').value,'');
});
test('controle usa RPC com datas convertidas e só admin envia',async()=>{
  const {ctx,$}=harness(); ctx.state.leads=[{id:'lead',user_id:'user',papel:'teste'}];
  let sent;
  ctx.sb={rpc:(name,args)=>{sent={name,args};return Promise.resolve({data:null});}};
  $('[data-access-mode]').value='liberado'; $('[data-access-start]').value='2026-10-11T10:00'; $('[data-access-end]').value='2026-10-12T10:00'; $('[data-access-reason]').value='Cortesia aprovada';
  $('[data-access-form]').listeners.submit({preventDefault(){}}); await new Promise(r=>setImmediate(r));
  assert.equal(sent.name,'crm_definir_acesso'); assert.equal(sent.args.p_inicio,new Date('2026-10-11T10:00').toISOString()); assert.equal(sent.args.p_motivo,'Cortesia aprovada');
  sent=null;ctx.eu.papel='colaborador'; $('[data-access-form]').listeners.submit({preventDefault(){}});assert.equal(sent,null);
});
test('carregamento inclui contas além de 2.000; erros conservam a lista anterior',async()=>{
  const ctx={loadPedido:0,state:{leads:[{id:'previous'}]},pendentes:{},render(){},$:()=>({disabled:false,hidden:false})};
  const calls=[];ctx.sb={from:()=>({select(){return this;},order(){return this;},range(a){calls.push(a);return Promise.resolve({data:Array.from({length:Math.min(1000,2001-a)},(_,i)=>({id:String(a+i)}))});}})};
  vm.createContext(ctx);vm.runInContext(func('  function loadLeads()','  function loadLimit()'),ctx);
  await ctx.loadLeads();assert.equal(ctx.state.leads.length,2001);assert.deepEqual(calls,[0,1000,2000]);
  ctx.sb.from=()=>({select(){return this;},order(){return this;},range(){return Promise.resolve({error:new Error('falha')});}});
  await ctx.loadLeads();assert.equal(ctx.state.leads.length,2001);
});
