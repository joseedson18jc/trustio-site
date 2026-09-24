# Contas, chat e CRM — backend (Supabase)

Projeto: `mjdaluioyutnxlyomzyd` · região `sa-east-1` (São Paulo) · painel: https://supabase.com/dashboard/project/mjdaluioyutnxlyomzyd

O site continua estático. Tudo que precisa de servidor vive aqui e é aplicado **automaticamente** pelo
GitHub Actions (`.github/workflows/supabase.yml`) a cada push na `main` que toque nesta pasta.

| Peça | Onde | O que faz |
| --- | --- | --- |
| Auth | `config.toml` `[auth]` | e-mail + senha, confirmação obrigatória, URLs de retorno para `/app/`, SMTP do domínio |
| E-mails | `templates/*.html` | confirmação, recuperação de senha, link mágico, troca de e-mail, convite — no branding Trustio |
| Banco | `migrations/*.sql` | `crm_leads`, `conversations`, `messages`, `app_settings`, `admins`, view `crm_overview`, RLS, RPCs |
| Chat | `functions/chat/index.ts` | recebe a mensagem, reserva a cota, chama o modelo em streaming, grava tudo |
| CRM | `/crm/` (só `admins`) | leads, status, plano, uso, WhatsApp 3 dias, notas, CSV, cota gratuita |

## Fluxo do cliente (tudo automático)

1. `cadastro.html` → `auth.signUp` com nome, telefone, tipo (b2c/b2b), empresa e segmento nos metadados.
2. O Supabase envia o e-mail de confirmação (`templates/confirmacao.html`).
3. Gatilho `on_auth_user_created` cria a linha em `crm_leads` (status `novo`).
4. O cliente clica no link → `on_auth_user_updated` marca `email_confirmado` → o link abre `/app/` já logado.
5. No primeiro acesso aparecem os widgets do teste grátis (5 prompts, 3 dias de agente no WhatsApp, dicas).
   "Começar a conversar" chama `mark_onboarding_seen()`; o pedido do WhatsApp chama `request_whatsapp_trial(numero)`.
6. Cada mensagem passa pela função `chat`: só e-mail confirmado; cota `free_message_limit` (padrão 5;
   `0` = sem limite) reservada de forma atômica; status vira `ativo` e, ao esgotar, `trial_esgotado`.
   Status `assinante` ignora a cota.
7. No `/crm/`, "Ativar 3 dias" chama `activate_whatsapp_trial(lead_id, 3)`. A ativação do agente no
   WhatsApp em si é feita pela equipe (não há integração automática com WhatsApp neste repositório).

## Ligar tudo (uma vez): secrets do repositório

Em GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Onde pegar | Para quê |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token | o workflow falar com o projeto (obrigatório) |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Database password | aplicar migrações e admins (obrigatório) |
| `SMTP_PASS` | API key do provedor de e-mail (ex.: Resend, com o domínio trustio.com.br verificado) | e-mails saírem de `contato@trustio.com.br` sem limite baixo |
| `LLM_API_KEY` | chave da xAI (ou de outro provedor compatível com OpenAI) | o chat responder |
| `LLM_BASE_URL`, `LLM_MODEL` | opcionais (padrão `https://api.x.ai/v1` e `grok-4`) | trocar provedor/modelo |
| `ADMIN_EMAILS` | seus e-mails, separados por vírgula (as contas precisam existir no Auth) | abrir o `/crm/` |

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
