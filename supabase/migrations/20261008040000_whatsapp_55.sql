-- Trustio · WhatsApp dos afiliados sempre como 55 + DDD + número.
--
-- Antes o número era gravado só com dígitos, com ou sem o 55, e quem enviava completava
-- o DDI — um número de 12 dígitos sem 55 saía errado. Agora o banco normaliza toda
-- gravação (cadastro, edição no CRM) e recusa o que não vira número brasileiro.
-- Mesma regra de worker/src/whatsapp.js, assets/afiliados.js e assets/crm-afiliados.js.

create or replace function public.whatsapp_br(p text)
returns text language plpgsql immutable set search_path = public as $$
declare
  d text := regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^0+', '');
begin
  if d like '55%' and length(d) in (12, 13) then return d; end if;
  if length(d) in (10, 11) then return '55' || d; end if;
  return null;
end;
$$;

create or replace function public.normalizar_whatsapp_afiliado()
returns trigger language plpgsql set search_path = public as $$
declare
  v text := public.whatsapp_br(new.whatsapp);
begin
  if v is null then raise exception 'whatsapp_invalido'; end if;
  new.whatsapp := v;
  return new;
end;
$$;

drop trigger if exists normalizar_whatsapp_afiliado on public.afiliados;
create trigger normalizar_whatsapp_afiliado before insert or update of whatsapp on public.afiliados
  for each row execute function public.normalizar_whatsapp_afiliado();

-- Números já gravados que dá para corrigir ganham o 55. Os que não dá (ex.: 12 dígitos sem
-- 55) ficam como estão, para a equipe corrigir no CRM.
update public.afiliados
   set whatsapp = public.whatsapp_br(whatsapp)
 where public.whatsapp_br(whatsapp) is not null and whatsapp <> public.whatsapp_br(whatsapp);
