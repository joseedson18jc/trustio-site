# Trustio · Design system (bundle de sincronização)

Esta pasta é a fonte do projeto de design system da Trustio no claude.ai/design.
Nada aqui é usado pelo site em produção; é documentação viva gerada a partir de
`assets/styles.css` e dos arquivos reais em `assets/`. Está bloqueada em `robots.txt`.

## O que há aqui

| Arquivo / pasta | Conteúdo |
| --- | --- |
| `tokens.json` | Tokens no formato W3C Design Tokens. Valores compostos (`container`, `cta-gradient`, gradientes de card, sombra) entram como tokens compostos com `$extensions.composite`. Inclui a escala de espaçamento declarada e o conjunto de overrides do tema claro. |
| `fundamentos/` | Cores (escuro e claro), tipografia, escala de espaçamento, tema claro/escuro. |
| `componentes/` | Botões, cards, rótulos e chips, links, selos de conformidade, cabeçalho. Cada preview usa o CSS real do site (`../../assets/styles.css`), então nunca diverge do que está no ar. |
| `fotografia/` | Retrato do fundador, faixa Brasil, social card e a marca da xAI. Conteúdo editorial. |
| `artes/` | Peças institucionais antes soltas no grupo "Other": símbolo e favicon, rasterizações, artes originais dos selos, ícones de conectores. |
| `_ds_manifest.json` | Índice dos cards (nome, grupo, subtítulo, largura). Espelha o marcador `<!-- @dsCard group="…" -->` que abre cada preview. |
| `ds.css` / `ds.js` | Chrome dos previews (grade, amostras, alternador de tema). |
| `index.html` | Índice navegável local: `python3 -m http.server 8080` e abra `/design-system/`. |

## Como sincronizar com o claude.ai/design

1. Em uma sessão interativa do Claude Code, rode `/design-login` uma vez.
2. Rode `/design-sync` apontando para o projeto "Trustio" e para esta pasta. Cada preview
   já traz o marcador `@dsCard` com o grupo correto (Fundamentos, Componentes, Fotografia, Artes),
   então o painel monta os cards sem registro manual.
3. Os nomes dos arquivos em `assets/` são mantidos (o site depende deles). Os nomes
   legíveis ficam nos cards, não nos arquivos.

## Como regenerar

Os previews são HTML estático; edite-os à mão ou regenere a partir do CSS. Ao criar um
componente novo em `assets/styles.css`, adicione um preview em `componentes/` seguindo o
mesmo cabeçalho e o marcador `@dsCard`.
