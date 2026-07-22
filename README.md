# Trustio

Site institucional da Trustio, incluindo a experiência completa do Manifesto. A entrega foi construída como site estático, responsivo e sem dependências de execução, pronta para GitHub Pages.

## Estrutura

- `index.html`: página institucional completa.
- `manifesto.html`: experiência editorial dedicada ao Manifesto.
- `404.html`: página de erro personalizada.
- `assets/styles.css`: identidade visual e responsividade.
- `assets/app.js`: navegação, animações e campo digital de pontos.
- `assets/fonts/`: fontes oficiais hospedadas localmente.
- `SECURITY.md`: controles incorporados e cabeçalhos recomendados.

## Publicar no GitHub Pages

1. Envie todos os arquivos para a raiz do repositório.
2. No GitHub, acesse **Settings > Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch principal e a pasta `/ (root)`.
5. Salve e aguarde a URL de publicação.

Não há etapa de compilação, instalação ou variável de ambiente.

## Domínio próprio

Quando o DNS de `trustio.com.br` estiver configurado para o GitHub Pages, adicione um arquivo `CNAME` contendo somente:

```text
trustio.com.br
```

O arquivo não foi incluído automaticamente para não alterar o domínio do repositório antes da configuração de DNS.

## Ajustes antes do lançamento

- Confirmar se `contato@trustio.com.br` é o endereço comercial definitivo.
- Revisar os textos institucionais com as áreas jurídica e de segurança.
- Se o domínio final for diferente, atualizar as URLs canônicas, o sitemap e a imagem social.

## Visualização local

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no navegador.

## Fontes e licenças

Schibsted Grotesk e IBM Plex são distribuídas sob a SIL Open Font License. As licenças estão em `assets/licenses/`.
