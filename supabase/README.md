# Contas, chat e CRM — backend (Supabase)

Projeto: `yxkgdgcdvngltnykleig` · região `sa-east-1` (São Paulo) · painel: https://supabase.com/dashboard/project/yxkgdgcdvngltnykleig

O site continua estático. Tudo que precisa de servidor vive aqui:

| Peça | Onde | O que faz |
| --- | --- | --- |
| Auth | Supabase Auth (e-mail + senha, confirmação obrigatória) | `cadastro.html`, `entrar.html`, link do e-mail abre `/app/` já autenticado |
| Banco | `migrations/*.sql` | `crm_leads`, `conversations`, `messages`, `app_settings`, `admins`, view `crm_overview`, RLS |
| Chat | `functions/chat/index.ts` | recebe a mensagem, aplica a cota, chama o modelo em streaming, grava tudo |
| CRM | `/crm/` (só `admins`) | leads, status, plano, uso, notas, exportação CSV, cota gratuita |

## Fluxo do cliente

1. `cadastro.html` → `auth.signUp` com nome, telefone, tipo (b2c/b2b), empresa, segmento nos metadados.
2. Gatilho `on_auth_user_created` cria a linha em `crm_leads` (status `novo`).
3. O cliente clica no link do e-mail → `on_auth_user_updated` marca `email_confirmado` → o link abre `/app/` logado.
4. Cada mensagem passa pela função `chat`: só e-mail confirmado; cota `free_message_limit` (padrão 5; `0` = sem limite); status vira `ativo` e, ao esgotar, `trial_esgotado`. Status `assinante` ignora a cota.

## O que falta configurar no painel (uma vez)

1. **Authentication → URL Configuration**
   - Site URL: `https://trustio.com.br/app/`
   - Redirect URLs: `https://trustio.com.br/app/`, `https://trustio.com.br/app/?recovery=1`, `https://trustio.com.br/**`
   Sem isso o link de confirmação cai em `localhost:3000`.
2. **Edge Functions → Secrets**: `LLM_API_KEY` (chave da xAI ou de outro provedor compatível com OpenAI). Opcional: `LLM_BASE_URL` (padrão `https://api.x.ai/v1`), `LLM_MODEL` (padrão `grok-4`). Enquanto não houver chave, o chat responde "modelo ainda não ativado" e não consome cota.
3. **Authentication → SMTP**: o remetente padrão do Supabase serve só para testes (poucos e-mails por hora). Configure o SMTP do domínio (ex.: Resend, Postmark, Amazon SES) com remetente `@trustio.com.br`. Ajuste os templates em Authentication → Email Templates (o botão pode se chamar "Confirmar e entrar").
4. **Administradores do CRM**: no SQL Editor,
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'voce@trustio.com.br';
   ```
5. Para tirar o limite gratuito: no `/crm/` (campo "Perguntas grátis" = 0) ou `update public.app_settings set value = '0' where key = 'free_message_limit';`.

## Re-aplicar

```sh
supabase link --project-ref yxkgdgcdvngltnykleig
supabase db push                      # migrations/
supabase functions deploy chat        # functions/chat
```
