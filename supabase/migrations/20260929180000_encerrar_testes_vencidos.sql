-- Trustio · Encerramento automático do teste do Agentio
--
-- O teste de 3 dias no WhatsApp tem data de fim (whatsapp_trial_ends_at), e o agente já para de
-- atender nela (a função hermes-autorizados só libera "ativo" com fim no futuro). Mas nada mudava
-- o status: o /crm/ seguia mostrando "Ativo" e o chat dizia "Agente ativo … (faltam 0 h)" até
-- alguém encerrar na mão. Agora uma rotina de hora em hora passa os vencidos para "encerrado",
-- e o chat mostra "Seus 3 dias no WhatsApp terminaram".
--
-- Nenhum aviso sai no encerramento: os gatilhos de aviso só agem na passagem para "ativo".
-- A data de fim fica como estava (a real).

create or replace function public.encerrar_testes_vencidos()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  -- Mesma marca das RPCs do teste: o guard_lead_update deixa o status mudar.
  perform set_config('trustio.lead_rpc', 'on', true);
  update public.crm_leads
     set whatsapp_trial_status = 'encerrado'
   where whatsapp_trial_status = 'ativo'
     and whatsapp_trial_ends_at <= now();
  get diagnostics v_n = row_count;
  perform set_config('trustio.lead_rpc', 'off', true);
  return v_n;
end $$;

revoke execute on function public.encerrar_testes_vencidos() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule com nome substitui o job de mesmo nome: reaplicar não duplica.
select cron.schedule(
  'encerrar-testes-vencidos',
  '7 * * * *',
  'select public.encerrar_testes_vencidos()'
);
