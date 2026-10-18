-- Trustio · CRM: Prospecção (criadores e mídia)
--
-- Leva a planilha "Trustio Outreach Tracker" (17/10/2026) para dentro do CRM:
-- 1. crm_prospects: quem a equipe vai abordar — criadores (afiliados B2C) e newsletters/imprensa.
--    Não é crm_leads: lá vive quem se cadastrou no site (e-mail obrigatório, ciclo de cliente);
--    aqui muita gente só tem DM, WhatsApp ou formulário, e o funil é de abordagem.
--    Funil dos criadores: a_contatar → enviado → respondeu → testando → ativado → publicou →
--    primeira_venda (ou recusou / sem_resposta). Funil da mídia: a_contatar → enviado (pitch) →
--    respondeu → fechado → publicou (ou recusou / sem_resposta). O banco recusa status fora do funil.
-- 2. Cadência de follow-up da planilha: criadores D+3, D+7, D+14; mídia D+5. O primeiro contato é
--    preenchido sozinho quando o status vira "enviado" sem data; followups_feitos conta os toques.
-- 3. crm_prospect_eventos: histórico (status, prioridade, datas, toques, vínculo com afiliado),
--    gravado só por gatilho, como em crm_eventos.
-- 4. crm_prospect_modelos: os 7 modelos de mensagem da planilha (PT-BR), editáveis pela equipe.
-- 5. Carga inicial: 18 criadores + 14 veículos/jornalistas, idempotente (segmento + nome).
-- Acesso: só a equipe (is_staff); apagar prospect só admin.

-- ─────────────────────────────────────────────────────────────── prospects
create table if not exists public.crm_prospects (
  id uuid primary key default gen_random_uuid(),
  segmento text not null check (segmento in ('creator','midia')),
  categoria text check (char_length(categoria) <= 40),
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  handle text check (char_length(handle) <= 80),
  plataforma text check (char_length(plataforma) <= 60),
  url text check (url is null or url ~* '^https?://'),
  nicho text check (char_length(nicho) <= 200),
  audiencia text check (char_length(audiencia) <= 80),
  seguidores integer check (seguidores is null or seguidores >= 0),
  contato text check (char_length(contato) <= 300),
  contato_tipo text not null default 'outro' check (contato_tipo in ('email','whatsapp','dm','form','telefone','outro')),
  gancho text check (char_length(gancho) <= 1000),
  motivo text check (char_length(motivo) <= 1000),
  prioridade text check (prioridade in ('alta','media','baixa')),
  status text not null default 'a_contatar',
  primeiro_contato date,
  ultimo_contato date,
  followups_feitos smallint not null default 0 check (followups_feitos between 0 and 3),
  afiliado_id uuid references public.afiliados(id) on delete set null,
  notas text check (char_length(notas) <= 4000),
  origem text not null default 'manual',
  ordem integer,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_prospects_status_do_funil check (
    (segmento = 'creator' and status in ('a_contatar','enviado','respondeu','testando','ativado','publicou','primeira_venda','recusou','sem_resposta'))
    or (segmento = 'midia' and status in ('a_contatar','enviado','respondeu','fechado','publicou','recusou','sem_resposta'))
  ),
  constraint crm_prospects_followups_do_segmento check (segmento = 'creator' or followups_feitos <= 1)
);
create unique index if not exists crm_prospects_segmento_nome on public.crm_prospects (segmento, lower(nome));
create index if not exists crm_prospects_status on public.crm_prospects (segmento, status);

-- Data, toques e autor: o banco cuida, a tela só muda o status.
create or replace function public.crm_prospect_antes()
returns trigger language plpgsql set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  new.updated_at := now();
  new.atualizado_por := auth.uid();
  if new.status = 'enviado' and new.primeiro_contato is null then new.primeiro_contato := hoje; end if;
  if tg_op = 'UPDATE' then
    if new.followups_feitos is distinct from old.followups_feitos and new.followups_feitos > coalesce(old.followups_feitos, 0) then
      new.ultimo_contato := hoje;
    end if;
    if new.primeiro_contato is distinct from old.primeiro_contato and new.ultimo_contato is null then
      new.ultimo_contato := new.primeiro_contato;
    end if;
  elsif new.primeiro_contato is not null and new.ultimo_contato is null then
    new.ultimo_contato := new.primeiro_contato;
  end if;
  return new;
end $$;
drop trigger if exists crm_prospect_antes on public.crm_prospects;
create trigger crm_prospect_antes before insert or update on public.crm_prospects
  for each row execute function public.crm_prospect_antes();

alter table public.crm_prospects enable row level security;
drop policy if exists "equipe lê prospects" on public.crm_prospects;
create policy "equipe lê prospects" on public.crm_prospects for select using (public.is_staff());
drop policy if exists "equipe cria prospects" on public.crm_prospects;
create policy "equipe cria prospects" on public.crm_prospects for insert with check (public.is_staff());
drop policy if exists "equipe edita prospects" on public.crm_prospects;
create policy "equipe edita prospects" on public.crm_prospects for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "admin apaga prospects" on public.crm_prospects;
create policy "admin apaga prospects" on public.crm_prospects for delete using (public.is_admin());
grant select, insert, update, delete on public.crm_prospects to authenticated;

-- ─────────────────────────────────────────────────────────────── histórico
create table if not exists public.crm_prospect_eventos (
  id bigint generated always as identity primary key,
  prospect_id uuid not null references public.crm_prospects(id) on delete cascade,
  em timestamptz not null default now(),
  autor uuid,
  campo text not null,
  de text,
  para text
);
create index if not exists crm_prospect_eventos_prospect_em on public.crm_prospect_eventos (prospect_id, em desc);
alter table public.crm_prospect_eventos enable row level security;
drop policy if exists "equipe lê histórico de prospects" on public.crm_prospect_eventos;
create policy "equipe lê histórico de prospects" on public.crm_prospect_eventos for select using (public.is_staff());
grant select on public.crm_prospect_eventos to authenticated;

create or replace function public.crm_prospect_registrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text; a text; b text;
begin
  if tg_op = 'INSERT' then
    insert into public.crm_prospect_eventos (prospect_id, autor, campo, para) values (new.id, auth.uid(), 'criado', new.origem);
    return new;
  end if;
  foreach c in array array['status','prioridade','primeiro_contato','followups_feitos','afiliado_id','contato'] loop
    execute format('select ($1).%I::text, ($2).%I::text', c, c) into a, b using old, new;
    if a is distinct from b then
      insert into public.crm_prospect_eventos (prospect_id, autor, campo, de, para) values (new.id, auth.uid(), c, a, b);
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.crm_prospect_registrar() from public, anon, authenticated;
drop trigger if exists crm_prospect_registrar on public.crm_prospects;
create trigger crm_prospect_registrar after insert or update on public.crm_prospects
  for each row execute function public.crm_prospect_registrar();

-- ─────────────────────────────────────────────────────────────── modelos de mensagem
create table if not exists public.crm_prospect_modelos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (char_length(nome) between 1 and 120),
  canal text,
  segmento text not null check (segmento in ('creator','midia','ambos')),
  etapa text not null check (etapa in ('primeiro','followup_1','followup_2','followup_3')),
  texto text not null check (char_length(texto) between 1 and 4000),
  ordem integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.crm_prospect_modelos enable row level security;
drop policy if exists "equipe lê modelos" on public.crm_prospect_modelos;
create policy "equipe lê modelos" on public.crm_prospect_modelos for select using (public.is_staff());
drop policy if exists "equipe edita modelos" on public.crm_prospect_modelos;
create policy "equipe edita modelos" on public.crm_prospect_modelos for update using (public.is_staff()) with check (public.is_staff());
grant select, update on public.crm_prospect_modelos to authenticated;
drop trigger if exists crm_prospect_modelos_touch on public.crm_prospect_modelos;
create trigger crm_prospect_modelos_touch before update on public.crm_prospect_modelos
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────── carga da planilha
insert into public.crm_prospects (segmento, categoria, nome, handle, plataforma, url, nicho, audiencia, seguidores, contato, contato_tipo, gancho, motivo, prioridade, status, primeiro_contato, notas, origem, ordem) values
  ('creator', 'YouTube', 'João Raphael Imperato', '@jrimperato', 'YouTube', 'https://www.youtube.com/@jrimperato', 'advocacia / empreendedorismo jurídico', '63.600 seguidores', 63600, 'contato@jrimperato.com.br', 'email', 'Vídeo recente: ''Sendo brutalmente honesto sobre a IA na advocacia''', 'Já produz conteúdo sobre IA na advocacia — pitch perfeito para ferramenta brasileira sem censura; e-mail público de negócios no canal', 'alta', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 1),
  ('creator', 'YouTube', 'Renan Gonçalves', '@DireitoEmMinutos', 'YouTube', 'https://www.youtube.com/@DireitoEmMinutos', 'advocacia / previdenciário (INSS)', '30.200 seguidores', 30200, 'WhatsApp (69) 9.9262-1298 (bio) · IG @Renan.inss', 'whatsapp', 'Vídeo recente: ''INSS Prorroga a Duração do ATESTMED até Setembro de 2027''', 'Temas de benefícios/BPC/LOAS beiram recusas de IA genérica; contato público direto no bio; audiência de aposentados e concurseiros', 'alta', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 2),
  ('creator', 'YouTube', 'Sancler Miranda', '@sanclermiranda', 'YouTube', 'https://www.youtube.com/@sanclermiranda', 'tech / IA aplicada (tutoriais ChatGPT)', '148.000 seguidores', 148000, 'DM', 'dm', 'Vídeo recente: ''AS 10 DICAS e TRUQUES ÚTEIS para o CHATGPT que VOCÊ DEVERIA SABER!''', 'Maior canal BR de tutoriais práticos de IA (6 mil+ alunos pagantes); audiência treinada a testar ferramentas — comparação R$ 79 vs dólar+IOF é conteúdo nativo', 'alta', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 3),
  ('creator', 'YouTube', 'Danilo Gato', '@odanilogato', 'YouTube', 'https://www.youtube.com/@odanilogato', 'tech / IA ferramentas e demos', '73.500 seguidores', 73500, 'DM', 'dm', 'Podcast Papo de IA #117: ''Chegou o GPT-6 Astra, a IA que USA O COMPUTADOR como um humano!''', 'Favikon #1 AI creator BR; formato screen-recording idêntico ao kit Trustio; podcast é veículo natural para IA brasileira', 'alta', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 4),
  ('creator', 'YouTube', 'Nidal Ahmad', '@profnidal', 'YouTube', 'https://www.youtube.com/@profnidal', 'advocacia / direito penal + OAB', '93.900 seguidores', 93900, 'DM', 'dm', 'Vídeo recente: ''Tese Processual x Tese Material: qual a diferença? | 2ª Fase da OAB''', 'Direito Penal (crimes, dosimetria) é onde o ChatGPT mais recusa; alunos OAB/concursos já pagam por material de estudo', 'alta', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 5),
  ('creator', 'YouTube', 'Mariana Gonçalves', '@advogadamarianagoncalves', 'YouTube', 'https://www.youtube.com/@advogadamarianagoncalves', 'advocacia / jovem advocacia (ex-Minutos de Direito)', '165.000 seguidores', 165000, 'DM', 'dm', 'Vídeo recente: ''Uma semana comigo. Advogando, dando aula e arrumando a casa''', 'Advogada com 3 empresas ensina advocacia moderna; IA privada é ferramenta de produtividade natural (identidade pós-rebrand confirmada por 2 fontes)', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 6),
  ('creator', 'YouTube', 'João Paulo Mauler', '@medcanal1', 'YouTube', 'https://www.youtube.com/@medcanal1', 'saúde / medicina clínica (CRM-BA 41356)', '151.000 seguidores', 151000, 'DM', 'dm', 'Vídeo recente: ''Como e quando desprescrever: Guia para a prática clínica''', 'Perguntas de dose/interação medicamentosa são o caso clássico de recusa do ChatGPT; maior canal de clínica médica do nicho', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 7),
  ('creator', 'YouTube', 'Rafaela Motta', '@RafaelaMotta', 'YouTube', 'https://www.youtube.com/@RafaelaMotta', 'concursos / português e interpretação (CNU/VUNESP)', '199.000 seguidores', 199000, 'DM', 'dm', 'Aula recente: ''Interpretação de textos - VUNESP - aula 3/3''', 'CNU e provas de redação exigem textos longos que IAs genéricas truncam; concurseiros compram ferramentas de estudo', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 8),
  ('creator', 'YouTube', 'Guilherme Karvatzki', '@guilhermekarv', 'YouTube', 'https://www.youtube.com/@guilhermekarv', 'tech / IA do zero (produtividade)', '55.100 seguidores', 55100, 'DM', 'dm', 'Vídeo recente: ''Você Não Ficou para Trás (AINDA): Como Aprender IA em 19 Minutos''', 'Ensina IA do zero — público que sofre com preço em dólar; candidato a prêmio iBest aceita collabs', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 9),
  ('creator', 'YouTube', 'Rafael Zanferdini Gondim (Prof. Cenoura)', '@ProfessorCenoura', 'YouTube', 'https://www.youtube.com/@ProfessorCenoura', 'advocacia / penal e processo penal p/ concursos', '41.000 seguidores', 41000, 'DM', 'dm', 'Vídeo recente: ''REVISÃO FGV - DELEGADO PCPR - PROCESSO PENAL (PARTE 2)''', 'Temas de crimes e dosimetura onde IAs genéricas recusam; audiência delegado/MP/TJ com alta propensão a pagar', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 10),
  ('creator', 'YouTube', 'Alan Nicolas', '@oalanicolas', 'YouTube', 'https://www.youtube.com/@oalanicolas', 'tech / IA e futuro (podcast Vida Lendária)', '35.800 seguidores', 35800, 'DM', 'dm', 'Vídeo recente: ''Seu sorriso ou $ 1.040 na sua conta. OpenAI enlouqueceu!''', 'Comenta preço/valor de IAs abertamente — comparação de custo Trustio em reais conversa naturalmente', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 11),
  ('creator', 'YouTube', 'Taty (Organize com Notion)', '@organizecomnotion', 'YouTube', 'https://www.youtube.com/@organizecomnotion', 'tech / produtividade Notion', '35.100 seguidores', 35100, 'DM', 'dm', 'Vídeo recente: ''Notion para estudantes: como criar um painel de estudos perfeito''', 'Público de estudantes/produtividade já usa IA junto com Notion; formato tutorial screen-recording idêntico ao kit', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 12),
  ('creator', 'YouTube', 'Sandro Caldeira', '@profsandrocaldeira', 'YouTube', 'https://www.youtube.com/@profsandrocaldeira', 'advocacia / OAB + carreiras policiais (delegado PCERJ)', '29.500 seguidores', 29500, 'DM', 'dm', 'Vídeo recente: ''AQUECIMENTO DOS 5 | Dicas para 1a Fase OAB''', 'Conteúdo penal/policial é onde IAs genéricas mais recusam; concurseiros são público altamente comprador', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 13),
  ('creator', 'YouTube', 'Savana', '@savanamedicina', 'YouTube', 'https://www.youtube.com/@savanamedicina', 'saúde / estudos de medicina (study-with-me)', '26.000 seguidores', 26000, 'DM', 'dm', 'Vídeo recente: ''study with me 6h I vestibulanda de medicina I pomodoro 50 10''', 'Público que usa IA para resumir conteúdo pesado de bio/química; micro-criadora jovem com alta conversão', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 14),
  ('creator', 'YouTube', 'Kenneth Corrêa', '@Kenneth-Correa', 'YouTube', 'https://www.youtube.com/@Kenneth-Correa', 'tech / IA para negócios (palestrante FGV)', '18.800 seguidores', 18800, 'DM', 'dm', 'Vídeo recente: ''O impacto das ferramentas de IA no jurídico e no mercado imobiliário''', 'Já produz conteúdo sobre IA no setor jurídico; canal em crescimento aceita parcerias mais fácil', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 15),
  ('creator', 'YouTube', 'Arlaine Braga', '@ArlaineBraga', 'YouTube', 'https://www.youtube.com/@ArlaineBraga', 'tech / produtividade Notion + planejamento', '18.500 seguidores', 18500, 'DM', 'dm', 'Vídeo recente: ''Como Atualizar seu Sistema no Notion para 2027 (sem começar do zero)''', 'Embaixadora oficial do Notion no Brasil; audiência que adota ferramentas novas rapidamente', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 16),
  ('creator', 'YouTube', 'Fábio Ricotta', '@fabioricotta', 'YouTube', 'https://www.youtube.com/@fabioricotta', 'tech / IA prática para agências e marketing', '12.900 seguidores', 12900, 'DM', 'dm', 'Vídeo recente: ''Skill para Seus Textos Não Parecerem Feitos por IA''', 'Fundador da Agência Mestre e da comunidade IA na Prática; canal dentro do limite de alcance', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 17),
  ('creator', 'YouTube', 'Daniel Coriolano', '@medcastmd', 'YouTube', 'https://www.youtube.com/@medcastmd', 'saúde / gestão médica e empreendedorismo', '8.890 seguidores', 8890, 'DM', 'dm', 'Podssérie recente: ''302 CONSULTÓRIO MÉDICO SEM AMADORISMO | Parte 2 de 3''', 'Micro-criador do podcast de medicina e mercado; micro-criadores convertem melhor e aceitam mais rápido', 'media', 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 18),
  ('midia', 'Newsletter', 'The News', null, 'beehiiv', 'https://thenewscc.com.br/', null, 'não divulgado', null, 'Formulário ''Anuncie'' no site', 'form', 'Jornal diário gratuito: Brasil, tecnologia e mercado financeiro', 'Newsletter de crescimento mais rápido do país (beehiiv); seção tech diária já recomenda ferramentas — ideal para oferta afiliado/cupom', null, 'a_contatar', null, 'Hottest newsletter target — pitch o modelo affiliate-not-sponsorship', 'planilha-outreach-2026-10-17', 1),
  ('midia', 'Newsletter', 'Explorando a Inteligência Artificial (Elisa Terumi)', null, 'Substack', 'https://elisaterumi.substack.com/', null, '11.000+', null, 'DM (chat Substack)', 'dm', 'IA acessível e prática; celebrou 10 mil assinantes em set/2026', 'Newsletter pessoal sobre IA em PT-BR, público leigo/entusiasta — encaixe direto com B2C do Trustio', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 2),
  ('midia', 'Newsletter', 'Algoritmo Diário', null, 'site próprio', 'https://algoritmodiario.com/newsletter.php', null, '12.000+ leitores', null, 'Formulário da newsletter', 'form', 'Diária (8h): ferramentas testadas, custo em reais, impacto PME, regulação', 'Foco declarado em ''custos em Real'' e legislação local — espelho do posicionamento Trustio', null, 'a_contatar', null, 'Segundo hottest target — posicionamento idêntico ao seu', 'planilha-outreach-2026-10-17', 3),
  ('midia', 'Newsletter', 'IA Sob Controle (Fabrício Carraro)', null, 'LinkedIn', 'https://www.linkedin.com/newsletters/ia-sob-controle-7206276550437007360', null, 'unknown', null, 'DM LinkedIn (Fabrício Carraro)', 'dm', 'Edições semanais até 15/10/2026; ligada ao podcast IA Sob Controle', 'Autor é Program Manager da Alura e autor de livros de IA; audiência tech BR', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 4),
  ('midia', 'Newsletter', 'Data Hackers Newsletter', null, 'Data Hackers (comunidade)', 'https://www.datahackers.com.br/', null, '14.676+ news · 44.165+ membros', null, 'Formulário no site', 'form', 'Quinzenal de dados e IA (ex.: Data Hackers News #107, abr/2026)', 'Maior comunidade de dados/IA do Brasil; audiência técnica formadora de opinião — forte para ''dados hospedados no Brasil''', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 5),
  ('midia', 'Newsletter', 'AI Factory News', null, 'Distrito', 'https://www.distrito.me/newsletter/', null, '7.000+', null, 'Formulário no site', 'form', 'Quinzenal de IA e inovação com análise autoral', 'Cobertura do mercado brasileiro de IA/startups; leitores early adopters', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 6),
  ('midia', 'Newsletter', 'IA Brasil Notícias', null, 'site próprio (WordPress)', 'https://iabrasilnoticias.com.br/newsletter/', null, 'unknown', null, 'Fale com a redação', 'form', 'Semanal; editorias incluem Legislação e Regulação', 'Veículo 100% dedicado a IA no Brasil com editoria de regulação — encaixe com pauta LGPD/privacidade', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 7),
  ('midia', 'Newsletter', 'The BRIEF (TecMundo)', null, 'beehiiv', 'https://thebrief-newsletter.beehiiv.com/subscribe', null, 'unknown', null, 'Formulário beehiiv', 'form', 'Diária às 7h: negócios em tecnologia', 'Audiência tech/negócios profissional; cobertura frequente de IA e big techs', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 8),
  ('midia', 'Newsletter', 'Newsletter Inteligência Artificial (Valor)', null, 'Valor Econômico', 'https://valor.globo.com/newsletter/tecnologia', null, 'unknown', null, 'natalia.flach@valor.com.br', 'email', 'Destaques de IA: adoção por 82% dos brasileiros, Cade multa WhatsApp, P&D', 'Newsletter de IA de veículo econômico de referência, assinada por repórter dedicada; audiência executiva', null, 'a_contatar', null, 'E-mail publicado na própria página da newsletter', 'planilha-outreach-2026-10-17', 9),
  ('midia', 'Newsletter', 'Newsletter Inteligência Artificial (Exame)', null, 'Exame', 'https://lps.exame.com/newsletter-ai', null, 'unknown', null, 'LP de cadastro', 'form', 'Semanal (sextas): notícias, ferramentas, aplicações e tendências de IA', 'Marca de negócios consolidada cobrindo IA para gestores e empreendedores', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 10),
  ('midia', 'Jornalista', 'Ana Paula Lobo', null, 'Convergência Digital', 'https://convergenciadigital.com.br/', null, 'n/a', null, 'anlobo@convergenciadigital.com.br', 'email', 'Matéria de IA assinada em 16/10/2026; cobre LGPD desde 2020', 'Alvo perfeito para o pitch de fonte brasileira em pautas de censura/privacidade/LGPD', null, 'a_contatar', null, 'Hottest journalist target — e-mail público verificado', 'planilha-outreach-2026-10-17', 11),
  ('midia', 'Jornalista', 'Natália Flach', null, 'Valor Econômico', 'https://valor.globo.com/newsletter/tecnologia', null, 'n/a', null, 'natalia.flach@valor.com.br', 'email', '''IA dá velocidade, mas fica devendo em conexão com o consumidor'' (08/10/2026)', 'Repórter dedicada a IA no Valor; hooks: soberania de dados + IOF em IA', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 12),
  ('midia', 'Jornalista', 'Lays Sampaio', null, 'InfoMoney', 'https://www.infomoney.com.br/', null, 'n/a', null, 'Formulário de contato', 'form', '''IA muda a disputa por clientes no e-commerce'' (out/2026); cobertura semanal de IA prática', 'Cobertura prática de IA para consumidor — hook do IOF e da alternativa nacional', null, 'a_contatar', null, null, 'planilha-outreach-2026-10-17', 13),
  ('midia', 'Jornalista', 'Henrique Medeiros', null, 'Mobile Time', 'https://mobiletime.com.br/', null, 'n/a', null, 'henrique.medeiros@mobiletime.com.br', 'email', 'Beat de agentes de IA', 'Cobre agentes de IA — encaixe com Agentio/VoiceAI', null, 'a_contatar', null, 'CAVEAT: byline confirmado só via snippet de busca — verifique uma matéria assinada no site antes de pitchar', 'planilha-outreach-2026-10-17', 14)
on conflict (segmento, lower(nome)) do nothing;

insert into public.crm_prospect_modelos (nome, canal, segmento, etapa, texto, ordem) values
  ('Criador — primeira DM (Instagram/TikTok/YouTube)', 'DM', 'creator', 'primeiro', 'Oi, {nome}! Sou {seu nome}, fundador da Trustio — uma IA brasileira, privada e sem censura, com dados hospedados no Brasil. Vi seu conteúdo sobre {detalhe real} e achei que a sua audiência é exatamente quem sofre com o "desculpe, não posso ajudar com isso".

Abrimos um programa de afiliados: R$ 200 fixos por venda do plano anual, caindo na hora via Pix depois de cada venda, sem mínimo. Também tem cupom com seu nome (ex. {NOME}10, 10% off na 1ª mensalidade) — então a venda é sua mesmo que a pessoa não clique no link.

O formato que mais converte é simples: print da recusa do ChatGPT × a mesma pergunta respondida na Trustio. Se quiser, te mando acesso integral para testar antes de falar qualquer coisa — sem compromisso. Topa?', 1),
  ('Criador — primeiro e-mail', 'Email', 'creator', 'primeiro', 'Assunto: R$ 200 por venda via Pix — afiliado Trustio (IA brasileira sem censura)

Oi {nome}, tudo bem? Fundo a Trustio (trustio.com.br): chat de IA privado e sem censura, hospedado no Brasil, preço em reais sem IOF — e o Agentio, agente de IA que executa tarefas no WhatsApp.

Estou convidando 100 criadores para o programa de afiliados e gostaria de ter você: {1 frase específica sobre o trabalho da pessoa}. Condições: comissão fixa de R$ 200 por plano anual e R$ 420 pelo combo anual, paga na hora via Pix após cada venda, sem saldo mínimo; cupom nominal com 10% off para sua audiência; cookie de 90 dias; materiais prontos.

Se fizer sentido, te cadastro hoje e te envio acesso integral para testar antes de qualquer post. Se não fizer, zero problema — e obrigado pelo conteúdo que você já faz.', 2),
  ('Follow-up D+3 (lembrete leve)', 'DM/Email', 'ambos', 'followup_1', 'Oi {nome}, só subindo isso — te envio o acesso integral para testar antes de decidir. Faz sentido?', 3),
  ('Follow-up D+7 (com valor)', 'DM/Email', 'ambos', 'followup_2', 'Oi {nome}! Fiz uma ferramenta que a sua audiência vai gostar: o Teste da Censura — você cola uma pergunta e vê quais IAs recusam. Já te mando o print pack pronto para usar, mesmo antes de decidir sobre o programa: {link}', 4),
  ('Follow-up D+14 (último toque)', 'DM/Email', 'ambos', 'followup_3', 'Sem pressa, {nome} — deixo a porta aberta. As 100 vagas vão fechando; se quiser depois, é só me chamar. Abraço!', 5),
  ('Newsletter — afiliado em vez de patrocínio', 'Email', 'midia', 'primeiro', 'Assunto: Patrocínio sem custo para você — comissão por venda (Pix na hora)

Oi {nome}, leio a {newsletter} desde {momento real}. Em vez da proposta de patrocínio tradicional (que agora não cabe no meu orçamento), proponho algo melhor para você: um bloco patrocinado escrito por você, com seu cupom nominal, e comissão de R$ 200 por venda anual — caindo na hora via Pix, sem mínimo, sem esperar 12 meses de recorrência. Leitor de newsletter de IA é comprador de IA.

Te envio o produto integral para testar antes — se você não recomendar para a própria audiência, não publicamos.', 6),
  ('Jornalista — fonte brasileira para pauta', 'Email', 'midia', 'primeiro', 'Assunto: Fonte brasileira sobre {tema da matéria} — IA com dados no Brasil

Oi {nome}, acompanhei sua matéria sobre {matéria específica}. Fundo a Trustio, uma infraestrutura de IA privada hospedada no Brasil — exatamente o lado brasileiro dessa história: onde os dados dos brasileiros ficam, o que a LGPD exige, quanto dói o IOF nos planos de IA, e por que filtros de conteúdo decididos fora do país afetam profissionais brasileiros.

Se quiser conversar para uma próxima pauta, estou à disposição — respondo em português claro e com números.', 7)
on conflict (nome) do nothing;

-- Conferência (aba "Review" da planilha): a carga tem de bater.
do $$
declare c int; m int; t int;
begin
  select count(*) filter (where segmento = 'creator'), count(*) filter (where segmento = 'midia')
    into c, m from public.crm_prospects where origem = 'planilha-outreach-2026-10-17';
  select count(*) into t from public.crm_prospect_modelos;
  if c <> 18 or m <> 14 or t < 7 then
    raise exception 'Carga da prospecção incompleta: % criadores (esperado 18), % mídia (esperado 14), % modelos', c, m, t;
  end if;
end $$;
