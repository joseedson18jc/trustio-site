# Worker da lista de espera (`api.trustio.com.br`)

Atende os formulários de `espera.html` e de `planos.html#lista`, guarda a inscrição
no mesmo `crm_leads` da conta e envia o e-mail de dupla confirmação.

## Por que ele existe

O worker anterior enviava um e-mail cujo link terminava em `}`:

```
https://api.trustio.com.br/confirm?token=***}
```

O template montava o endereço por concatenação e não substituía a variável, então
**nenhuma confirmação funcionava**. Aqui o endereço é montado com `URL` e
`URLSearchParams`, que não têm como produzir um link malformado, e a rota `/saude`
mostra um link de exemplo para você conferir a olho antes de qualquer disparo.

## Rotas

| Rota | O que faz |
|---|---|
| `POST /signup` | Inscreve e dispara o e-mail. Aceita JSON (o site manda assim) e formulário comum (quem está sem JavaScript), respondendo com redirect nesse caso. |
| `GET /confirm?token=…` | Confirma a inscrição. Token de uso único, válido por 48 horas. |
| `GET /saude` | Diz o que está configurado, sem revelar valor nenhum, e mostra um link de exemplo. |

## Onde os dados ficam

Nas funções `registrar_optin` e `confirmar_optin` do Supabase
(`supabase/migrations/20260922130000_optin_lista_espera.sql`). A inscrição vira um
lead como qualquer outro, sem `user_id` porque ainda não existe conta, e aparece no
CRM junto com o resto — uma lista de clientes só, não duas.

Ao confirmar, o lead passa de `novo` para `email_confirmado` e o token sai do banco.

### Provisório: KV `SIGNUPS`

Enquanto o banco do projeto Supabase novo não existe, `ARMAZENAMENTO = "kv"` no
`wrangler.toml` grava as inscrições no KV `SIGNUPS`:

| Chave | Conteúdo |
|---|---|
| `lead:<e-mail>` | o lead (JSON), com `status` `pendente` ou `confirmado` |
| `confirmado:<e-mail>` | a confirmação; **vale mais que o `status` do lead**, que uma inscrição concorrente pode regravar |
| `token:<token>` | `{ email, expira_em }` do link de confirmação; é o que a confirmação consulta. Some depois de 7 dias |
| `atual:<e-mail>` | o último link entregue; muda só depois que o e-mail sai, e aí o anterior é apagado |
| `envio:<e-mail>` | marca de e-mail enviado há menos de 5 minutos, para não duplicar |

Uma inscrição repetida atualiza o mesmo `lead:` em vez de criar outro, e só manda um
link novo depois de 5 minutos. Se a Resend falhar, os dados novos ficam gravados e o
link já entregue continua valendo.

### Importação para o Supabase

Na troca, `ARMAZENAMENTO` volta a `"supabase"` e o `SIGNUPS` é importado para o
`crm_leads` lendo **os dois formatos**:

- **novo:** cada `lead:<e-mail>` é um lead; ele está confirmado se `status` for
  `confirmado` **ou** se existir `confirmado:<e-mail>`;
- **antigo** (worker anterior a 24/09): `pending:<token>` traz o JSON completo da
  inscrição (`status`, `createdAt`, `data`, `meta`), com `index:<hash>` apontando o estado;
- endereços de teste `delivered+teste-claude-*@resend.dev` ficam de fora.

## Publicar

Dentro desta pasta:

```bash
npm install -g wrangler        # se ainda não tiver
wrangler login

# os dois segredos, uma vez cada:
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Supabase → Project Settings → API → service_role
wrangler secret put RESEND_API_KEY              # Resend → API Keys

wrangler deploy
```

Depois, confira antes de mandar qualquer e-mail de verdade:

```bash
curl -s https://api.trustio.com.br/saude
```

A resposta traz `supabase: true`, `resend: true` e um `exemplo_de_link` — que precisa
terminar no token, **sem `}` nem qualquer outro caractere sobrando**.

## Atenção ao deploy automático

A build do Cloudflare para `trustio-optin` está apontada para este repositório e vem
falhando em todo PR porque o código nunca esteve aqui. Com esta pasta, a build passa a
ter o que construir — **se você apontar o diretório raiz da build para `worker/`**, no
painel do Cloudflare (Workers → trustio-optin → Settings → Build). Enquanto não
apontar, nada é publicado sozinho e o deploy continua sendo o `wrangler deploy` acima.

Aponte só depois de rodar um `wrangler deploy` manual e conferir `/saude`: a partir
daí, cada push na `main` substitui o worker em produção.

## Variáveis

| Nome | Onde | Valor |
|---|---|---|
| `ARMAZENAMENTO` | `wrangler.toml` | `kv` (provisório) ou `supabase` |
| `SIGNUPS` | `wrangler.toml` (KV) | onde ficam as inscrições no modo `kv` |
| `SUPABASE_URL` | `wrangler.toml` | endereço do projeto |
| `SITE_URL`, `API_URL` | `wrangler.toml` | endereços públicos |
| `EMAIL_FROM` | `wrangler.toml` | remetente; o domínio precisa estar **verificado na Resend** |
| `SUPABASE_SERVICE_ROLE_KEY` | segredo | chave de serviço |
| `RESEND_API_KEY` | segredo | chave da Resend |

O remetente padrão é `no-reply@send.trustio.com.br`, que é o domínio comprovadamente
verificado — é de lá que o e-mail da lista já saía.
