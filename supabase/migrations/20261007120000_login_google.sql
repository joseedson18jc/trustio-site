-- Login com Google: quem entra pelo Google chega sem os campos do formulário de cadastro.
-- O nome vem em full_name/name (padrão do provedor) e a origem fica marcada como "google",
-- para o CRM e o funil distinguirem esse canal. O resto do handle_new_user é o mesmo de
-- 20260920120000: e-mail já vem confirmado pelo Google, então o status nasce email_confirmado.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  provedor text := new.raw_app_meta_data->>'provider';
begin
  insert into public.crm_leads (user_id, nome, email, telefone, tipo, empresa, segmento, origem, status, confirmed_at)
  values (
    new.id,
    coalesce(nullif(m->>'nome',''), nullif(m->>'full_name',''), nullif(m->>'name','')),
    new.email,
    nullif(m->>'telefone',''),
    case when m->>'tipo' = 'b2b' then 'b2b' else 'b2c' end,
    nullif(m->>'empresa',''),
    nullif(m->>'segmento',''),
    coalesce(nullif(m->>'origem',''), case when provedor = 'google' then 'google' end, 'cadastro.html'),
    case when new.email_confirmed_at is null then 'novo' else 'email_confirmado' end,
    new.email_confirmed_at
  )
  on conflict (lower(email)) do update set
    user_id = excluded.user_id,
    nome = coalesce(public.crm_leads.nome, excluded.nome),
    telefone = coalesce(public.crm_leads.telefone, excluded.telefone),
    tipo = excluded.tipo,
    empresa = coalesce(excluded.empresa, public.crm_leads.empresa),
    segmento = coalesce(excluded.segmento, public.crm_leads.segmento);
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
