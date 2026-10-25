# Contas, chat e CRM — backend (Supabase)

Projeto: `mjdaluioyutnxlyomzyd` · região `sa-east-1` (São Paulo) · painel: https://supabase.com/dashboard/project/mjdaluioyutnxlyomzyd

O site continua estático. Tudo que precisa de servidor vive aqui e é aplicado **automaticamente** pelo
GitHub Actions (`.github/workflows/supabase.yml`) a cada push na `main` que toque nesta pasta.

| Peça | Onde | O que faz |
| --- | --- | --- |
| Auth | `config.toml` `[auth]` | e-mail + senha, confirmação obrigatória, URLs de retorno para `/app/` e para o app Android (login com Google), SMTP do domínio |
| E-mails | `templates/*.html` | confirmação, recuperação de senha, link mágico, troca de e-mail, convite — no branding Trustio |
| Banco | `migrations/*.sql` | `crm_leads`, `conversations`, `messages`, `app_settings`, `admins`, `preferencias_usuario`, bucket `avatares`, view `crm_overview`, RLS, RPCs |
| Chat | `functions/chat/index.ts` | recebe a mensagem, reserva a cota, chama o modelo em streaming, grava tudo |
| CRM | `/crm/` (só `admins`) | leads, status, plano, uso, WhatsApp 3 dias, notas, CSV, cota gratuita |

## Fluxo do cliente (tudo automático)

1. `cadastro.html` → `auth.signUp` com nome, telefone, tipo (b2c/b2b), empresa e segmento nos metadados.
2. O Supabase envia o e-mail de confirmação (`templates/confirmacao.html`).
3. Gatilho `on_auth_user_created` cria a linha em `crm_leads` (status `novo`).
4. O cliente clica no link → `on_auth_user_updated` marca `email_confirmado` → o link abre `/app/` já logado.
5. No primeiro acesso aparecem os widgets do teste grátis (3 dias de chat, 3 dias de agente no WhatsApp, dicas).
   "Começar a conversar" chama `mark_onboarding_seen()`; o pedido do WhatsApp chama `request_whatsapp_trial(numero)`.
6. Cada mensagem passa pela função `chat`: só e-mail confirmado; reserva atômica em `reserve_chat_message`.
   O teste grátis é por tempo, nunca por número de perguntas: a primeira pergunta grava
   `crm_leads.teste_fim = now() + free_trial_days()` (`app_settings.free_trial_days`, padrão 3; `0` = sem limite)
   e, até lá, as perguntas são ilimitadas. Depois do fim, status vira `trial_esgotado`. Só as RPCs do teste
   gravam `teste_fim` (gatilho `crm_leads_guard_teste`). Equipe, cliente, assinante e plano pago ignoram o teste.
   `free_message_limit` não é mais lido pelo chat (`20261025210000_teste_gratis_3_dias.sql`).
   **O teste de 3 dias do WhatsApp está desligado desde 19/10/2026** (`20261019130000_desliga_teste_whatsapp.sql`,
   revisão legal G2: o Agentio roda em Baileys). Com `app_settings.whatsapp_teste_aberto = false`:
   - `request_whatsapp_trial` devolve `teste_encerrado`;
   - a confirmação do e-mail não começa o teste;
   - o banco recusa qualquer escrita que leve o teste para `solicitado` ou `ativo`, o que inclui os itens 7 e 8.

   Testes já ativos vão até o fim do prazo, e encerrar continua possível. Para reabrir:
   `update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'whatsapp_teste_aberto';`
7. No `/crm/`, "Ativar 3 dias" chama `activate_whatsapp_trial(lead_id, 3)` (vale para quem pediu e para
   quem só deixou telefone no cadastro). Trocar o seletor para "Ativo" tem o mesmo efeito: o período
   começa na hora e dura `hermes_trial_dias`.
8. Ao virar "Ativo", o gatilho `crm_leads_whatsapp_aviso` chama a função `aviso-agente` (via `pg_net`),
   que manda à pessoa um e-mail com as instruções (Resend) e uma mensagem no WhatsApp (pelo serviço do
   Mac do item 10, que fala o mesmo protocolo da Evolution API).
   O número do Agentio nas instruções vem de `hermes_numero` no painel (ou de `EVOLUTION_NUMERO`); sem
   um número completo, nada sai. O CRM mostra quando cada aviso saiu, ou o motivo da falha, e o botão
   "Reenviar avisos" tenta de novo o que faltou. Um aviso por ativação, mesmo com chamadas simultâneas. O banco precisa saber onde chamar (uma vez,
   no SQL Editor; sem isso a ativação funciona e nada é enviado):
   ```sql
   select vault.create_secret('https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/aviso-agente', 'aviso_agente_url');
   select vault.create_secret('<o mesmo valor de AVISOS_SEGREDO>', 'aviso_agente_segredo');
   ```

9. Quem recebe o aviso também precisa ser liberado no Hermes, que roda no Mac: o gateway só atende os
   números de `WHATSAPP_ALLOWED_USERS` em `~/.hermes/.env`. O `mac/hermes-autorizados.sh`, rodando a
   cada 30 s pelo launchd, consulta a função `hermes-autorizados` (teste de 3 dias ativo e dentro do
   prazo, e assinantes), junta com os números permanentes de `~/.hermes/allowed-fixos.txt` (criado na
   instalação; sem ele, nada muda) e reinicia o gateway só quando a lista muda. A lista só conta como
   aplicada quando o reinício dá certo, e o `.env` é regravado de forma atômica. Se a consulta falha, a
   lista fica como está. Quando o teste vence, o número sai.

10. O WhatsApp de aviso sai pelo serviço do Mac em `mac/whatsapp/` (Baileys), no lugar da Evolution API.
   Ele responde no mesmo endpoint e com a mesma chave que a função `aviso-agente` usa
   (`POST /message/sendText/<EVOLUTION_INSTANCE>`, cabeçalho `apikey`), então os segredos `EVOLUTION_*`
   continuam valendo e a função não muda. Instalação, uma vez, na pasta do repositório no Mac:
   ```bash
   bash mac/whatsapp/instalar.sh          # pede a instância e a chave (as dos segredos EVOLUTION_*)
   tail -f ~/Library/Logs/trustio-whatsapp.log   # escaneie o QR no celular
   curl -s http://127.0.0.1:18080/saude   # "conectado": true
   ```
   Roda pelo launchd (`br.com.trustio.whatsapp`), sobe no login e volta sozinho se cair. Ouve só em
   `127.0.0.1:18080`, a porta para onde o túnel da Cloudflare leva `evolution.trustio.com.br` (a mesma que a Evolution usa: é um ou outro, o instalador recusa a porta ocupada). Mensagens recebidas
   são ignoradas, os envios saem um por vez, e número sem WhatsApp é recusado antes do envio. Se o
   celular desconectar o aparelho, o serviço apaga a sessão e mostra um QR novo no log.

## Ligar tudo (uma vez): secrets do repositório

Em GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Onde pegar | Para quê |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token | o workflow falar com o projeto (obrigatório) |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Database password | aplicar migrações e admins (obrigatório) |
| `SMTP_PASS` | API key do provedor de e-mail (ex.: Resend, com o domínio trustio.com.br verificado) | e-mails saírem de `contato@trustio.com.br` sem limite baixo |
| `LLM_API_KEY` | chave da xAI (ou de outro provedor compatível com OpenAI) | o chat responder |
| `LLM_BASE_URL`, `LLM_MODEL` | opcionais (padrão `https://api.x.ai/v1` e `grok-4`) | trocar provedor/modelo. O nome do modelo também pode vir do banco, `app_settings.llm_model` (prioridade sobre o segredo, vale na hora); sem nenhum dos dois, a função usa o que o servidor anuncia em `GET /models` quando ele lista um modelo só |
| `LLM_SERVIDOR` | opcional: `llama.cpp` quando o modelo roda num llama-server | contagem exata de tokens durante a resposta |
| `LLM_CONTEXTO` | opcional: o contexto do modelo (o `-c` do llama-server), ex.: `8192` | "sessão N%" e o aviso de sessão cheia |
| `LLM_MAX_TOKENS` | opcional: teto de tokens por resposta, ex.: `8192` | a % da resposta durante a geração |
| `AVISOS_SEGREDO` | um valor aleatório longo (`openssl rand -hex 32`); o mesmo vai no Vault como `aviso_agente_segredo` | o banco chamar a função `aviso-agente` |
| `RESEND_API_KEY` | resend.com → API Keys (domínio `send.trustio.com.br` verificado) | e-mail de aviso do teste do Agentio |
| `EVOLUTION_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY` | o endereço do serviço de WhatsApp do Mac (`https://evolution.trustio.com.br`), o nome da instância e a chave, os mesmos do `~/.trustio-whatsapp/config.json` (item 10) | mensagem de aviso no WhatsApp |
| `EVOLUTION_NUMERO` | opcional: o número conectado à instância, se for o próprio Agentio | a mensagem pedir para responder ali mesmo |
| `HERMES_SEGREDO` | um valor aleatório longo; o mesmo vai no Mac em `~/.trustio-hermes-sync-key` | o sincronizador do Mac ler a lista de números autorizados |
| `ADMIN_EMAILS` | seus e-mails, separados por vírgula (as contas precisam existir no Auth) | abrir o `/crm/` |

O CRM envia aos administradores atuais com e-mail confirmado um aviso por novo cadastro
vinculado ao Auth e por primeira assinatura (mudança para `assinante` no CRM ou checkout
confirmado pela integração Stripe, mesmo sem afiliado). Sem retroatividade. O banco mantém
uma fila, processada a cada minuto; retentativas usam a mesma chave de idempotência no
Resend e param após 23 horas para não ultrapassar a janela de deduplicação do provedor.
O histórico e os erros ficam em `crm_admin_avisos`, com leitura restrita a administradores.
A remoção de um administrador impede novas tentativas para ele. O workflow configura a
credencial interna no Vault e na função `admin-avisos` sem publicar seu valor.

Depois disso, rode o workflow uma vez em Actions → Supabase → Run workflow (ou faça qualquer push em
`supabase/`). Ele vincula o projeto, aplica migrações, `config.toml` (URLs, confirmação, SMTP, templates),
publica a função `chat`, define os segredos dela e insere os administradores. Sem `SMTP_PASS`, o SMTP
custom fica desligado e os e-mails continuam saindo pelo remetente padrão do Supabase.

Provedor de SMTP diferente de Resend: ajuste `host`, `port` e `user` em `[auth.email.smtp]` no `config.toml`.

## Re-aplicar à mão (opcional)

```sh
supabase link --project-ref mjdaluioyutnxlyomzyd
supabase db push                      # migrations/
SMTP_PASS=... supabase config push    # config.toml + templates/
supabase functions deploy chat        # functions/chat
supabase secrets set LLM_API_KEY=...  # segredos da função
```

Para tirar o limite gratuito: no `/crm/` (campo "Perguntas grátis" = 0) ou
`update public.app_settings set value = '0' where key = 'free_message_limit';`.

### Minha conta (/app/)

O cartão do usuário na barra lateral abre "Minha conta": foto de perfil (bucket privado
`avatares`, pasta `<user_id>/`), nome e telefone, estilo das respostas, instruções pessoais,
modelo, tema, tamanho do texto, Enter envia, exportar e apagar conversas, senha e sair dos
outros aparelhos. As preferências ficam em `preferencias_usuario` (só a própria pessoa lê;
a função `chat` lê estilo, instruções e modelo).

Para oferecer mais de um modelo (todos atendidos pelo mesmo `LLM_BASE_URL`, por exemplo um
llama-server com vários modelos ou um llama-swap):

```sql
insert into public.app_settings (key, value) values ('modelos_chat',
  '[{"id": "trustio", "rotulo": "Trustio", "descricao": "equilibrado"},
    {"id": "outro-modelo", "rotulo": "Trustio Rápido", "descricao": "respostas curtas"}]')
on conflict (key) do update set value = excluded.value;
```

Sem essa lista, o seletor aparece travado em "Trustio (padrão)". Um modelo que sai da lista
deixa de valer na hora: quem o tinha escolhido volta para o padrão.

## Controle administrativo de acesso (10/10/2026)

Na ficha do lead, o administrador pode liberar o chat sem cota, definir início e fim,
revogar acesso, bloquear produtos mantendo o login ou bloquear também novos logins.
As datas são verificadas no servidor em cada uso: não dependem de cron. O modo padrão
mantém as regras de plano/teste; `cancelado` recusa o chat, inclusive para papel cliente.
A liberação explícita prevalece sobre cancelado enquanto seu período estiver válido.
O WhatsApp continua exigindo assinatura ou teste ativo: liberar o chat não ativa o agente.
O teste do WhatsApp pode ser renovado por 1 a 365 dias. A cota do chat pode ser reiniciada
com motivo, sem remover bloqueios ou renovar datas de acesso.

Todas as mudanças de acesso, motivo, datas, segmento e renovações ficam em `crm_eventos`,
com autor e valores anteriores/novos. Reiniciar a cota registra também o motivo.
Colaboradores continuam cuidando de contato, notas, etiquetas e segmentação, mas só admins
mudam acesso, tipos, status que concedem acesso, cotas e ativação do WhatsApp.
Um administrador deve ser rebaixado antes de bloquear ou agendar seu acesso; a proteção
contra remover o último admin considera apenas contas administrativas confirmadas e válidas.

O bloqueio de login atualiza `auth.users.banned_until` na mesma transação do controle de
acesso, com horizonte de 100 anos (campo usado pelo [Supabase Auth](https://github.com/supabase/auth/blob/master/internal/models/user.go)).
Ao desfazer, restaura o banimento anterior e preserva mudanças feitas por outra ferramenta.
Tokens já emitidos não desaparecem do navegador; o servidor recusa os produtos e as permissões
de equipe pelo controle de acesso. O usuário pode manter seu próprio histórico e dados pessoais.
Não há exclusão de contas, mensagens ou cancelamento de cobrança: assinatura é administrada
no provedor de pagamento.

Para publicar, aplique as migrações `20261010150000` e `20261010160000` antes dos novos
assets e da função `hermes-autorizados`. Atualize também `mac/hermes-autorizados.sh` no Mac
do agente: a resposta agora inclui `negados`, que prevalece sobre números fixos e compartilhados.
A remoção no WhatsApp só passa a valer após a sincronização e reinício do gateway (consulta a
cada 30 segundos; intervalo mínimo normal de reinício de 120 segundos). Falhas de consulta
mantêm a última lista aplicada, como antes; não considerar a publicação concluída sem testar
uma revogação no agente real.

Validação local: `npm run test:crm-admin`, `npm run test:crm-audit` e
`node mac/test/hermes-autorizados.test.mjs`. Os testes de banco usam PostgreSQL embarcado
(PGlite), o esquema Auth mínimo e as funções reais de autorização/gatilhos das migrações;
não substituem o teste de login e revogação no Supabase de produção.

### Convite de retorno pelo CRM

Na ficha de uma conta de teste, o administrador pode usar **+3 dias grátis e enviar e-mail**. A migração `20261010170000_crm_convite_retorno.sql` concede chat sem cota até o maior entre agora e o prazo atual, mais três dias. Não altera assinatura, cobrança, papel ou teste do WhatsApp. Não permite contas com bloqueio/revogação, acesso agendado, conta paga/equipe ou acesso sem prazo. O destinatário é o e-mail confirmado do Auth, não o campo editável do lead.

**Reenviar convite** mantém o prazo do convite vigente. A função `crm-convite` valida a sessão e `is_admin` antes de usar `RESEND_API_KEY` e `EMAIL_FROM` (mesmos segredos dos avisos existentes). O e-mail tem prazo em Brasília, links para `/app/` e `/afiliados.html`, e explica que comissões dependem de vendas elegíveis. O CRM mostra o envio aceito pelo provedor ou a falha; aceitação não confirma entrega na caixa de entrada.

Cada pedido tem UUID conservado na sessão do navegador para retentativas. A concessão e o registro são atômicos, há intervalo mínimo de um minuto entre pedidos novos por lead, e o envio usa `Idempotency-Key`. Retentativas pendentes expiram antes das 24 horas de retenção de chaves do Resend; reenvios explícitos têm UUID novo. Só administradores leem `crm_convites`; só a função com service role conclui envios. Histórico registra autor e concessão/reenvio.

Validação: `npm run test:crm-admin`, testes de auditoria e smoke de navegador desktop/mobile. Chamadas ao provedor são simuladas nos testes; nenhum cliente recebe e-mail durante validação.

### Rastreamento de todos os remetentes Trustio

O workflow ativa abertura/cliques nos domínios `trustio.com.br` e subdomínios da conta Resend e cria/reutiliza um webhook com assinatura Svix para `email-eventos`. Precisa de API key com acesso a domínios/webhooks; pode reutilizar `SMTP_PASS` quando for uma chave Resend. O segredo de assinatura vai diretamente para os secrets do Supabase sem aparecer no log.

A migração `20261010180000_crm_email_tracking.sql` grava metadados por mensagem/destinatário, com RLS exclusiva de admin, deduplicação e merge de eventos fora de ordem. Publica `crm_emails` no Realtime. O painel lista os envios de todos os remetentes Trustio, com busca, status e mostrar mais; a ficha mostra os últimos 50, com acesso à lista completa. Atualiza por eventos e a cada minuto como recuperação/renovação da janela de 48h.

Estados: enviado, entregue ao servidor, abertura registrada, clique registrado, sem interação registrada após 48h, atraso, rejeição, falha e spam. Ausência de abertura não prova que a pessoa ignorou; filtros de segurança podem abrir/clicar automaticamente. Eventos de mensagem com múltiplos destinatários não identificam quem interagiu e têm aviso explícito. Não grava corpo, IP/user-agent, query ou fragmento dos links (que poderiam conter tokens de login). Abrange eventos a partir da ativação; histórico antigo não é reconstruído.

## Prospecção (criadores e mídia)

A migração `20261017200000_crm_prospeccao.sql` traz para o CRM a planilha "Trustio Outreach Tracker" (17/10/2026) e abre a aba `/crm/prospeccao.html`:

- `crm_prospects`: quem a equipe vai abordar — criadores (afiliados B2C) e newsletters/imprensa. Separado de `crm_leads` (cadastros do site, e-mail obrigatório): aqui muitos contatos são só DM, WhatsApp ou formulário. O banco recusa status fora do funil de cada segmento — criadores `a_contatar → enviado → respondeu → testando → ativado → publicou → primeira_venda` (ou `recusou` / `sem_resposta`); mídia `a_contatar → enviado → respondeu → fechado → publicou` (ou `recusou` / `sem_resposta`). Ao virar `enviado` sem data, o primeiro contato recebe o dia de hoje (Brasília); `followups_feitos` conta os toques (criadores D+3/D+7/D+14, mídia D+5). `afiliado_id` liga o criador ao afiliado depois que ele entra no programa.
- `crm_prospect_eventos`: histórico (status, prioridade, datas, toques, contato, vínculo), gravado só por gatilho.
- `crm_prospect_modelos`: os 7 modelos de mensagem da planilha; a tela troca `{nome}`, `{NOME}`, `{newsletter}` e `{seu nome}` e deixa o resto entre chaves para personalizar.
- RLS: equipe (`is_staff()`) lê, cria e edita; só admin apaga. A carga inicial (18 criadores + 14 veículos/jornalistas) é idempotente e confere as contagens ao final.
