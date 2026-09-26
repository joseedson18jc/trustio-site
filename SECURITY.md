# Segurança do site Trustio

O site institucional (trustio.com.br) é estático, publicado pelo GitHub Pages atrás da Cloudflare.
As partes com conta — cadastro, login, chat (`/app/`), CRM e painel — usam o Supabase
(autenticação e banco na região `sa-east-1`, São Paulo) e a API de lista de espera em
`api.trustio.com.br` (Cloudflare Worker).

## Controles no navegador

- **CSP por página** (`<meta http-equiv="Content-Security-Policy">`): `default-src 'self'`,
  `script-src 'self'` (mais o `static.cloudflareinsights.com` do Web Analytics),
  `style-src 'self'`, `object-src 'none'`, `base-uri 'self'` e `connect-src`/`form-action`
  limitados às origens que cada página usa (`api.trustio.com.br`, o projeto Supabase,
  `cloudflareinsights.com`).
- Nenhum `<script>` inline executável, `style=""`, `on*=` ou `javascript:`; só blocos
  `application/ld+json`, que não executam.
- Fontes, ícones e bibliotecas servidos da própria origem (sem CDN de terceiros).
- A chave do Supabase no navegador é a *publishable*; a proteção dos dados é feita por RLS no banco.
- O conteúdo das conversas e dos leads é renderizado com escape (sem HTML vindo do usuário ou do modelo).
- Formulários de conta não enviam nada sem JavaScript (botões habilitados só pelo script), então a
  senha nunca vai para a URL.
- Métricas pelo Cloudflare Web Analytics: agregadas, sem cookies.

## Cabeçalhos HTTP

O GitHub Pages não permite cabeçalhos por repositório, e a CSP em `<meta>` não cobre
`frame-ancestors`. Os cabeçalhos abaixo devem ser aplicados na Cloudflare
(Rules → Transform Rules → Modify Response Header) para `trustio.com.br/*`:

```text
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

A CSP completa continua nas páginas; o cabeçalho acima só acrescenta a proteção contra
enquadramento (clickjacking), que o `<meta>` não consegue dar.

## Relato responsável

Para comunicar uma vulnerabilidade, escreva para contato@trustio.com.br com o assunto
"Segurança". Não publique detalhes sensíveis em uma issue aberta. Respondemos em até 5 dias úteis.
