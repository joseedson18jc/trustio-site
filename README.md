# Trustio

Site institucional da Trustio. Site estático, responsivo e sem dependências de execução,
publicado em **https://trustio.com.br** via GitHub Pages.

## Estrutura

- `index.html`: página institucional completa (plataforma, faixa de API, painel de servidor, segurança, implantação).
- `modelos.html`: catálogo **Modelos Poderosos** — modelos de fronteira disponíveis.
- `manifesto.html`: experiência editorial dedicada ao Manifesto.
- `fundador.html`: página do fundador.
- `404.html`: página de erro personalizada (usa caminhos absolutos, obrigatório para funcionar em URLs aninhadas).
- `assets/styles.css`: identidade visual e responsividade.
- `assets/app.js`: navegação, animações, campo digital de pontos e painel LED do servidor.
- `assets/fonts/`: fontes oficiais hospedadas localmente.
- `SECURITY.md`: controles incorporados e cabeçalhos recomendados.

## Publicação

O deploy é automático: **todo push na branch `main` republica o site**, servido a partir da raiz
do repositório (`Settings > Pages > Deploy from a branch > main / (root)`).

- Domínio próprio: arquivo `CNAME` com `trustio.com.br`. O DNS já aponta para o GitHub Pages
  (`185.199.108-111.153`) e o certificado HTTPS está ativo com `https_enforced`.
- `.nojekyll` impede o processamento por Jekyll.
- Não há etapa de compilação, instalação ou variável de ambiente.

### Regra importante

Tudo o que estiver no repositório é servido publicamente. **Não versione** arquivos `.bak`,
cópias de páginas, saídas de build (`dist/`) ou diretórios duplicados — além de peso, cópias de
páginas geram conteúdo duplicado indexável e prejudicam o SEO. O `.gitignore` já cobre esses casos.

## Builds alternativos (opcionais, fora do caminho de deploy)

- `npm run build` → `scripts/build-worker.mjs`, empacota o site para hospedagem em worker.
  **Ao criar uma página nova, adicione-a à lista `sourceFiles` do script.**
- `npm run build:static` → `vite build`. Ao criar uma página nova, adicione-a a
  `rollupOptions.input` em `vite.config.js`.
- `npm run validate` → `scripts/validate-artifact.mjs`.

## Segurança

Todas as páginas aplicam uma CSP restrita via `<meta http-equiv>`:
`default-src 'self'` com `connect-src 'none'` e `object-src 'none'`.

Consequência prática: **nada de `<script>` inline, `style=""` inline ou recursos de terceiros**
(CDN, fontes remotas, imagens externas). Ícones e logotipos são SVG embutidos no HTML ou arquivos
locais. Blocos `application/ld+json` são permitidos por não serem executáveis.

## Ajustes antes de cada lançamento

- Ao adicionar página: incluir em `sitemap.xml`, na navegação (desktop + mobile + rodapé),
  em `vite.config.js` e em `scripts/build-worker.mjs`.
- Revisar os textos institucionais com as áreas jurídica e de segurança.
- Selos de conformidade no rodapé: manter rastreabilidade (número do certificado e organismo
  certificador) para due diligence de clientes enterprise.

## Visualização local

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no navegador.

## Fontes e licenças

Schibsted Grotesk, IBM Plex e Instrument Serif são distribuídas sob a SIL Open Font License.
As licenças estão em `assets/licenses/` e `assets/fonts/`.
