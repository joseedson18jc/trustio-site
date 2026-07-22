# Segurança do site Trustio

Este repositório publica um site estático. Ele não processa credenciais, não possui formulário, não usa cookies e não envia dados de navegação para serviços externos.

## Controles incorporados

- Política de Segurança de Conteúdo restrita a arquivos da própria origem.
- `connect-src 'none'`, sem chamadas de API no navegador.
- JavaScript local, sem bibliotecas ou CDNs de terceiros.
- Fontes locais, com licenças incluídas no repositório.
- Ausência de `eval`, HTML dinâmico e armazenamento no navegador.
- Link de contato via `mailto`, sem coleta de dados pelo site.
- Compatibilidade com `prefers-reduced-motion` e navegação por teclado.

## Cabeçalhos recomendados em produção

O GitHub Pages não permite configurar todos os cabeçalhos HTTP por repositório. Ao usar um proxy ou outra hospedagem, aplique:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## Relato responsável

Para comunicar uma vulnerabilidade, use um canal privado da Trustio. Não publique detalhes sensíveis em uma issue aberta.
