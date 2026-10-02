# Levantamento Técnico Exaustivo do Codebase Local · Trustio

**Data da Investigação:** 22 de setembro de 2026  
**Investigador:** `explorer_survey_2` (Teamwork Explorer)  
**Escopo do Repositório:** `/Users/joseedson/github/trustio-site`  
**Modo de Execução:** READ-ONLY (Auditoria e Análise Estrutural)  
**Repositório Base:** HTML5 / CSS3 Puro / JavaScript Vanilla (ES6+) / Vite (testes locais) / Cloudflare Worker / Supabase  

---

## 1. Visão Geral da Arquitetura do Site

O site da **Trustio** (`trustio.com.br`) adota uma arquitetura estática moderna de alta performance, sem dependência de frameworks cliente pesados (como React, Next.js ou Vue). Toda a renderização pública é feita em **HTML semântico estático**, com folhas de estilo nativas CSS3 moduladas e scripts JavaScript vanilla orientados a componentes e aprimoramento progressivo (*progressive enhancement*).

### 1.1 Características Fundamentais
* **Zero Framework Runtime Overhead:** Ausência de hidratacão de nós ou virtual DOM no frontend público, propiciando carregamento instantâneo e First Contentful Paint (FCP) na faixa de sub-segundo.
* **Privacidade e LGPD por Arquitetura:**
  * Não há cookies de rastreamento de terceiros.
  * Não há carregamento de Google Analytics, Meta Pixel, Hotjar, Mixpanel ou PostHog.
  * A métrica analítica é provida exclusivamente pelo **Cloudflare Web Analytics** (`https://static.cloudflareinsights.com/beacon.min.js`), operando sem cookies e em conformidade estrita com a LGPD.
* **Segurança Robusta de Cabeçalhos (CSP):**
  * Definida em `vercel.json` e nas tags `<meta http-equiv="Content-Security-Policy">`.
  * Diretivas restritas: `default-src 'self'; script-src 'self' ...; connect-src 'self' https://api.trustio.com.br https://yxkgdgcdvngltnykleig.supabase.co https://cloudflareinsights.com;`.
* **Dualidade de Proposta de Valor no Código:**
  * **B2C:** Focado em *IA pessoal e sem censura*, assento individual (*seats*), teste gratuito de 5 prompts e agente Hermes no WhatsApp/Telegram.
  * **B2B / Enterprise:** Focado em *infraestrutura privada*, conformidade LGPD by design, isolamento VPC/GPU, VoiceAI sob medida (xAI / xSpace) e soluções verticais (*Trustio Jurídico*, *Saúde*, *Financeiro*).

---

## 2. Inventário Completo de Arquivos HTML

O codebase conta com **20 páginas HTML públicas/internas principais**, além de templates de e-mail e catálogo de design system.

### 2.1 Tabela de Páginas do Site

| Arquivo HTML | Caminho Relativo | Função Principal / Persona | Estilos Principais | Scripts Vinculados |
| :--- | :--- | :--- | :--- | :--- |
| **Home Page** | `index.html` | Apresentação institucional, posicionamento dual B2C/B2B, visão geral de capacidades e contato. | `assets/styles.css` | `theme.js`, `app.js`, `contador.js`, Cloudflare beacon |
| **VoiceAI** | `voice.html` | Apresentação profunda da tecnologia VoiceAI (modelos Grok Voice da xAI / xSpace), orbs reativos WebGL e player de áudio neural. | `assets/styles.css`, `assets/voice.css`, `assets/voice-base.css` | `theme.js`, `app.js`, `orb.js`, `voice.js`, Cloudflare beacon |
| **Planos & Preços** | `planos.html` | Tabela de preços B2B (Starter, Pro, Dedicado, Diagnóstico) e B2C (Mensal, Passe 7 dias, Anual), com formulário de pré-assinatura / lista de espera. | `assets/styles.css`, `assets/planos.css`, `assets/voice.css` | `theme.js`, `app.js`, `contador.js`, `planos.js`, `optin.js`, Cloudflare beacon |
| **Seats Individuais** | `seats.html` | Página de aterrissagem dedicada ao acesso individual B2C (chat sem censura e 5 perguntas grátis). | `assets/styles.css` | `theme.js`, `app.js`, `contador.js`, Cloudflare beacon |
| **Modelos Poderosos** | `modelos.html` | Catálogo técnico de modelos de fronteira (OpenAI GPT-6 Astra, Anthropic Claude Fable/Opus 5.1, Moonshot Kimi K3.1 e modelos abertos). | `assets/styles.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Jurídico** | `juridico/index.html` | Verticais jurídicas: pesquisa jurisprudencial, agentes de compliance, RAG sobre acervos, OCR e peticionamento. | `assets/styles.css`, `assets/juridico.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Lista de Espera** | `espera.html` | Funil de captação de leads com contagem regressiva para lançamento em 1º/10/2026 e opção de pré-assinatura antecipada para 23/09. | `assets/styles.css`, `assets/planos.css`, `assets/voice.css` | `theme.js`, `app.js`, `contador.js`, `espera.js`, `optin.js`, Cloudflare beacon |
| **Cadastro** | `cadastro.html` | Criação de conta com integração direta ao Supabase Auth (`sb.auth.signUp`), suporte a tipos B2C e B2B. | `assets/styles.css`, `assets/planos.css`, `assets/conta.css` | `theme.js`, `app.js`, `supabase.js`, `auth-config.js`, `conta.js` |
| **Entrar (Login)** | `entrar.html` | Autenticação via e-mail e senha (`sb.auth.signInWithPassword`), recuperação de senha e reenvio de confirmação. | `assets/styles.css`, `assets/planos.css`, `assets/conta.css` | `theme.js`, `app.js`, `supabase.js`, `auth-config.js`, `conta.js` |
| **Obrigado / Confirmação** | `obrigado.html` | Confirmação dinâmica pós-checkout Stripe ou pós-cadastro na lista de espera (renderização adaptativa via query string). | `assets/styles.css`, `assets/planos.css`, `assets/voice.css` | `theme.js`, `app.js`, `obrigado.js`, Cloudflare beacon |
| **Manifesto** | `manifesto.html` | Posicionamento editorial, princípios inegociáveis de soberania de dados, liberdade e propósito. | `assets/styles.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Fundador** | `fundador.html` | Perfil de José Edson da Costa, trajetória profissional em IA antifraude e sistemas financeiros. | `assets/styles.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Privacidade** | `privacidade.html` | Declaração de privacidade em linguagem acessível (sem tracking, tratamento LGPD, Stripe e Supabase). | `assets/styles.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Chat Web (App)** | `app/index.html` | Interface de chat autenticada com histórico de conversas, widget de ativação de WhatsApp e contagem de cotas. | `assets/styles.css`, `assets/chat.css` | `theme.js`, `supabase.js`, `auth-config.js`, `chat.js` |
| **Console / Builder** | `console/index.html` | Console interativo para configuração de agentes de voz, playbooks, ferramentas e testes com orbs. | `assets/styles.css`, `assets/console.css` | `orb.js`, `console.js`, Cloudflare beacon |
| **CRM Interno** | `crm/index.html` | Dashboard operacional para visualização e transição de status de leads captados. | `assets/styles.css`, `assets/chat.css`, `assets/crm.css` | `theme.js`, `supabase.js`, `auth-config.js`, `crm.js` |
| **Painel Mestre (Admin)** | `admin/index.html` | Painel de controle mestre da plataforma (prompts do sistema, limites e métricas). | `assets/styles.css`, `assets/chat.css`, `assets/crm.css`, `assets/admin.css` | `theme.js`, `supabase.js`, `auth-config.js`, `admin.js` |
| **404 Not Found** | `404.html` | Página de erro padronizada com botão de retorno seguro e selos de segurança. | `assets/styles.css` | `theme.js`, Cloudflare beacon |
| **Planos (Ambiente Teste)** | `planos-teste.html` | Variante de `planos.html` integrada ao ambiente sandbox de teste da Stripe. | `assets/styles.css`, `assets/planos.css`, `assets/voice.css` | `theme.js`, `app.js`, Cloudflare beacon |
| **Voice MVP** | `voice-mvp/index.html` | Interface experimental de demonstração de voz via WebRTC / AudioWorklet. | `voice-mvp/styles.css`, `voice-mvp/orb.css` | `voice-mvp/session-guard.js`, `voice-mvp/app.js` |

### 2.2 Templates de Comunicação Transacional
Localizados em `supabase/templates/`:
* `confirmacao.html` — E-mail de confirmação de cadastro com link direto de autenticação.
* `convite.html` — Convite para workspace ou assento corporativo.
* `link-magico.html` — Acesso sem senha via magic link.
* `recuperacao.html` — E-mail de redefinição de credencial de acesso.
* `troca-email.html` — Confirmação de alteração de e-mail de conta.

---

## 3. Análise de Cabeçalho, Navegação e Rodapé

### 3.1 Cabeçalho (`.site-header`)
O cabeçalho é compartilhado em todas as páginas públicas com a seguinte estrutura de marcação:
```html
<header class="site-header" data-header>
  <div class="container header-inner">
    <a class="brand" href="index.html" aria-label="Trustio, página inicial">
      <img class="brand-mark" src="assets/trustio-mark.svg" alt="" width="34" height="34">
      <span class="brand-word"><span>Trust</span><strong>io</strong></span>
    </a>
    <nav class="desktop-nav" aria-label="Navegação principal"> ... </nav>
    <a class="header-login" href="entrar.html">Entrar</a>
    <a class="button button-small button-ghost header-cta" href="#contato">Falar com a Trustio</a>
    <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Ativar tema claro"> ... </button>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Abrir menu"> ... </button>
  </div>
  <nav class="mobile-nav" id="mobile-menu" aria-label="Navegação para dispositivos móveis" hidden> ... </nav>
</header>
```

#### Comportamento e Dinâmica
1. **Rolagem Fixa (*Sticky Header*):**
   * O script `assets/app.js` escuta o evento `scroll` e adiciona a classe `.is-scrolled` quando `window.scrollY > 20`.
   * Efeito CSS: Adiciona fundo semitransparente escuro (`rgba(5, 7, 11, 0.85)`), filtro de desfoque (`backdrop-filter: blur(16px)`) e borda inferior sutil (`border-bottom: 1px solid var(--line)`).
2. **Barra de Progresso de Leitura (`.reading-progress`):**
   * Elemento fixado no topo (`z-index: 120`) que escala horizontalmente (`transform: scaleX(...)`) de acordo com o percentual de rolagem do documento.
3. **Alternador de Tema Claro/Escuro (`.theme-toggle`):**
   * Botão acessível que alterna o atributo `data-theme="light"` no elemento `<html>`.
   * Salva a preferência em `localStorage.getItem("trustio-theme")`.
   * O script `assets/theme.js` é executado de forma síncrona no `<head>` para evitar FOUC (*Flash of Unstyled Content*).
4. **Menu Mobile (`.menu-toggle` & `.mobile-nav`):**
   * Abertura e fechamento acessíveis com controle de `aria-expanded` e remoção do atributo `hidden`.
   * Fecha automaticamente ao pressionar a tecla `Escape` ou ao redimensionar a tela para larguras superiores a `1320px`.

### 3.2 Inconsistências Críticas de Navegação entre Páginas

Durante a inspeção minuciosa dos links de navegação, foram detectadas **inconsistências graves de UX e arquitetura da informação**:

#### A. Links Quebrados em `seats.html`
* Em `seats.html` (linhas 53-65), a barra de navegação usa links âncora relativos como se estivesse na raiz:
  ```html
  <a href="#plataforma">Plataforma</a>
  <a href="#seguranca">Segurança</a>
  <a href="#implantacao">Implantação</a>
  <a href="#contato">Falar com a Trustio</a>
  ```
* **Falha constatada:** A página `seats.html` **não possui** as seções `#plataforma`, `#seguranca` ou `#implantacao`. Ao clicar nesses links, o navegador não reage ou rola para o topo, gerando bloqueio e desorientação no visitante.
* **Contraste:** Em `voice.html` e `planos.html`, os links são escritos corretamente como `index.html#plataforma`, `index.html#seguranca`, etc.

#### B. Divergência na Ordem dos Itens do Menu
* Na **Home (`index.html`)**:  
  `Plataforma` → `Modelos Poderosos` → `VoiceAI` → `Segurança` → `Implantação` → `Jurídico` → `Planos` → `Lista de espera` → `Manifesto` (Total de 9 itens de menu + login + CTA = 11 itens no cabeçalho).
* Em **Jurídico (`juridico/index.html`)**:  
  `Plataforma` → `Modelos Poderosos` → `VoiceAI` → `Jurídico` → `Segurança` → `Planos` → `Lista de espera` → `Manifesto`.  
  *O item `Implantação` foi completamente omitido.*
* Em **Cadastro (`cadastro.html`) e Login (`entrar.html`)**:  
  O menu mobile exibe uma ordenação diferente e adiciona `Criar conta` diretamente no fluxo da lista.

### 3.3 Rodapé (`.site-footer`)
O rodapé é estruturado em grid (`.footer-grid` e `.footer-bottom`):
* **Identidade e Posicionamento:** Logo Trustio acompanhada da descrição *"Infraestrutura privada de inteligência artificial para empresas."*
* **Links de Navegação:** Divididos em duas colunas:
  * `EXPLORAR`: Plataforma, Modelos Poderosos, VoiceAI, Jurídico, Segurança, Implantação, Planos, Lista de espera.
  * `INSTITUCIONAL`: Manifesto, Fundador, Privacidade, Contato (`mailto:`).
* **Selos de Conformidade e Auditoria:**
  * Imagens com elemento `<picture>` (WebP com fallback PNG): **ISO 27001**, **ANPD** e **LGPD**.
  * Link direto para o repositório público: `https://github.com/joseedson18jc/trustio-site/blob/main/SECURITY.md` (*"Acompanhamento de segurança"*).
  * Tag de residência: *"Construída e hospedada no Brasil"* acompanhada de indicador circular verde (`.brazil-dot`).

---

## 4. Análise de Modais, Gatilhos, Formulários e Funis

### 4.1 Descoberta Arquitetural: Inexistência de Diálogos Modais Sobrepostos
Uma descoberta crucial da análise estática do código é que **não existem elementos `<dialog>`, bibliotecas de modal, popups flutuantes ou overlays modais** em nenhuma página pública da Trustio.
* A palavra `modal` ou `dialog` não ocorre em nenhuma folha de estilo ou arquivo HTML público.
* Os fluxos que normalmente seriam concebidos como modais em sites SaaS convencionais foram arquitetados pela Trustio como:
  1. **Páginas Dedicadas de Aterrissagem** (ex: `espera.html`, `cadastro.html`, `entrar.html`).
  2. **Seções de Ancoragem na Própria Página** (ex: `planos.html#lista`, `index.html#contato`).
  3. **Painéis Sanfonados e Drawers Expansíveis Inline** (ex: gaveta de canais `#ch-detail` em `voice.html`).
  4. **Ausência Deliberada de Modal de Cookies:** Não há banner de cookies ou modal LGPD porque a aplicação não instala cookies de rastreamento publicitário.

### 4.2 Mapeamento Detalhado dos Formulários e Funis

#### Funil 1: Lista de Espera em `espera.html`
* **Gatilho:** Botões *"Entrar na lista de espera"* distribuídos no site.
* **Container DOM:** `<div class="lista espera-lista" id="lista">`
* **Formulário:** `<form class="lead-form" action="https://api.trustio.com.br/signup" method="POST" id="espera-form">`
* **Campos e Atributos:**
  1. `_honey`: `<input type="text" name="_honey" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">` — Armadilha contra bots/spam (honeypot).
  2. `origem`: `<input type="hidden" name="origem" value="espera.html" data-origem>`
  3. `nome`: `<input id="w-nome" name="nome" type="text" placeholder="Seu nome" required>`
  4. `email`: `<input id="w-email" name="email" type="email" inputmode="email" placeholder="voce@exemplo.com" required>`
  5. `telefone`: `<input id="w-tel" name="telefone" type="tel" placeholder="(11) 9 9999-9999">` (Opcional, com texto explicativo: *"Só para avisar mais rápido no dia da abertura..."*).
  6. `tipo`: Radio group com opções:
     * `B2C — para mim` (IA privada e sem censura) — selecionado por padrão.
     * `B2B — para minha empresa` (Ambiente privado, VoiceAI, Jurídico, Saúde).
  7. **Campos Condicionais B2C (`data-when="b2c"`):**
     * Radio group `plano`: `Mensal R$ 79` (padrão), `Passe 7 dias R$ 24,90`, `Anual R$ 790`.
  8. **Campos Condicionais B2B (`data-when="b2b" hidden`):**
     * `segmento`: `<select id="w-seg" name="segmento" data-req-b2b>` com opções (VoiceAI, Jurídico, Saúde, Financeiro, Varejo, Indústria, Setor público, Outro).
     * `empresa`: `<input id="w-emp" name="empresa" type="text" placeholder="Nome da empresa">`.
     * `tamanho`: Select com faixas (Até 10 pessoas, 11 a 50, 51 a 200, 201 a 1.000, Mais de 1.000).
  9. `acesso`: Radio group com opções:
     * `Lista gratuita — acesso em 1º/10` (padrão).
     * `Pré-assinatura — acesso antecipado em 23/09` (modifica dinamicamente o texto do botão para *"Quero pré-assinar e entrar em 23/09"*).
  10. `observacao`: `<input id="w-obs" name="observacao" type="text" placeholder="Caso de uso, prazo, volume…">`.
  11. `submit`: Botão com transição de texto via script `assets/optin.js`.

#### Funil 2: Captura de Leads na Aba B2C de `planos.html`
* **Gatilho:** Links *"Ou entrar na lista grátis ↓"* nos cards de planos ou navegação direta para `planos.html#pessoal`.
* **Container DOM:** `<div class="lista" id="lista">`
* **Diferença Estrutural:** Formulário simplificado de 5 campos que envia os dados via `assets/optin.js` para o mesmo endpoint `https://api.trustio.com.br/signup`. Inclui o campo `<select id="lead-uso" name="uso">` (Trabalho e estudo, Escrita e criatividade, Pesquisa e código, Conversas pessoais, Outro).

#### Funil 3: Criação de Conta em `cadastro.html`
* **Gatilho:** Botões primários *"Criar conta grátis"*.
* **Formulário:** `<form class="lead-form" id="cadastro-form" novalidate>`
* **Mecanismo:** Interceptado por `assets/conta.js`, disparando a API oficial do Supabase:
  ```javascript
  sb.auth.signUp({
    email: email,
    password: senha,
    options: {
      emailRedirectTo: appUrl,
      data: { nome, telefone, tipo, empresa, segmento, origem: "cadastro.html" }
    }
  })
  ```
* **Feedback de Interface:** Em caso de sucesso, os campos são desabilitados e o elemento `[data-done]` é exibido:  
  *"Falta só confirmar. Abra o e-mail enviado para [email] e clique em Confirmar e entrar."*

#### Funil 4: Demonstração e Contato Telefônico
* **VoiceAI Demo Interativa:**
  * Executada diretamente no DOM de `voice.html` através de botões seletores (`data-pick="bruna|matheus|hero"`), disparando a classe `TrustioOrb` e o elemento `<audio>`.
* **Link de Chamada Real Externa:**
  * O botão *"Chamada real ↗"* aponta para `https://voice.trustio.com.br/credito-jus`.
  * **Ponto de atrito identificado:** A página remota exige código de autorização / senha que não é fornecido previamente no site público.
* **Contato Comercial Institucional:**
  * Seção `#contato` em `index.html` e `fundador.html`:
  * Utiliza link `mailto:contato@trustio.com.br` pré-populado com assunto.
  * Acompanhado de botão `.copy-email[data-copy]` com API Clipboard (`navigator.clipboard.writeText`) e fallback de `document.execCommand("copy")`.

---

## 5. Design System, CSS, Tokens e Responsividade

O repositório possui uma pasta formal de design system sincronizada com o Claude Design (`design-system/`), além das folhas de estilo em produção em `assets/`.

### 5.1 Design Tokens (Extraídos de `assets/styles.css` e `design-system/tokens.json`)

#### Paleta de Cores (Tema Escuro — Padrão)
* `--abyss`: `#05070b` (Fundo primário da aplicação)
* `--surface`: `#0b0e14` (Fundo de cartões e blocos estruturais)
* `--surface-raised`: `#10141c` (Superfícies elevadas e inputs)
* `--surface-blue`: `#0b1730` (Acentos de profundidade azulada)
* `--surface-deep`: `#071020`
* `--surface-footer`: `#040609` (Fundo do rodapé)
* `--blue`: `#2563eb` (Azul primário da marca)
* `--blue-signal`: `#5ea7ff` (Azul luminoso para ênfase, links e status)
* `--blue-mid`: `#2e6bf0`
* `--blue-deep`: `#0f2c6b`
* `--navy`: `#0a1d3d`
* `--ice`: `#f4f6fa` (Texto principal e títulos contrastantes)
* `--white`: `#ffffff`
* `--muted`: `#99a4b5` (Texto secundário e legendas)
* `--muted-strong`: `#bdc5d1`
* `--label-color`: `#8d98aa`
* `--line`: `rgba(160, 179, 211, 0.16)` (Linhas divisórias e bordas)
* `--line-bright`: `rgba(94, 167, 255, 0.35)`
* `--ok`: `#3ddc97` (Status verde para sistemas ativos e conformidade)
* `--warn`: `#ffb454` (Avisos e pendências)

#### Overrides do Tema Claro (`:root[data-theme="light"]`)
* `--abyss`: `#f4f6fa`
* `--surface`: `#ffffff`
* `--surface-raised`: `#eef2f8`
* `--surface-blue`: `#e3ecfb`
* `--text-strong`: `#05070b`
* `--ice`: `#0a1d3d`
* `--muted`: `#55637a`
* `--muted-strong`: `#33405a`
* `--line`: `rgba(10, 29, 61, 0.14)`
* `--line-bright`: `rgba(37, 99, 235, 0.45)`

#### Tipografia
* Fontes locais auto-hospedadas em formato WOFF2 (sem requisições ao Google Fonts):
  * **Geist (Sans-serif variável):** `--display`, `--body` — Pesos de 100 a 900.
  * **Geist Mono (Monoespaçada variável):** `--mono` — Rótulos técnicos, códigos, badges e terminais.
  * **Instrument Serif (Serifada editorial):** `--serif` — Utilizada no Manifesto e citações de alto impacto.
* **Piso Tipográfico Estrito (*Type Floor*):**
  * Nenhuma fonte abaixo de `11px` (rótulos monosecundários: `--label: 11px`).
  * Qualquer elemento clicável possui tamanho mínimo de texto de `12px` (`--label-lg: 12px`), com área de toque mínima de `44px` a `50px`.

#### Escala de Espaçamento e Geometria
* Variáveis declarativas: `--space-4: 4px`, `--space-8: 8px`, `--space-12: 12px`, `--space-16: 16px`, `--space-20: 20px`, `--space-24: 24px`, `--space-32: 32px`, `--space-48: 48px`, `--space-60: 60px`, `--space-90: 90px`, `--space-140: 140px`.
* Bordas arredondadas: `--radius: 20px`, `--radius-large: 32px`.
* Transições e Curvas: `--ease: cubic-bezier(0.22, 1, 0.36, 1)`.
* Largura de container: `--container: min(1180px, calc(100vw - 48px))`.

### 5.2 Breakpoints Responsivos Mapeados
O arquivo `assets/styles.css` adota um grid responsivo fluido com regras em:
1. `@media (min-width: 1601px)` — Telas ultra-largas (aumento de escala e respiros).
2. `@media (min-width: 1321px)` — Desktop amplo padrão.
3. `@media (max-width: 1320px)` — Transição onde o menu desktop passa a colapsar e o drawer mobile é ativado.
4. `@media (max-width: 1060px)` — Reorganização das colunas de capacidades e arquitetura.
5. `@media (max-width: 960px)` — Ocultação do botão `.header-login` direto e adaptação do grid de planos para 1 coluna.
6. `@media (max-width: 900px)` — Empilhamento de seções horizontais (`.segment-wide`, `.omni-def`, `.mentoria-grid`).
7. `@media (max-width: 760px)` — Adaptações de hero, padding de seções e tamanhos de fonte.
8. `@media (max-width: 700px)` — Ajustes de cards jurídicos e formulários em bloco único.
9. `@media (max-width: 560px)` e `(max-width: 420px)` — Ajustes para dispositivos móveis compactos (botões ocupam 100% de largura, empilhamento de estatísticas).
10. `@media (prefers-reduced-motion: reduce)` — Desativação integral de animações, loops em CSS, rotação de orbs e animação dos LEDs do servidor.

---

## 6. Lógica de Scripts Client-Side e Integrações de Terceiros

### 6.1 Mapeamento e Responsabilidades dos Arquivos JS

```
assets/
├── theme.js         -> Inicialização instantânea do tema no <head> (dark/light)
├── app.js           -> Scrollspy, sticky header, canvas de partículas, cópia de e-mail, menu mobile
├── contador.js      -> Simulação matemática incremental da contagem da lista de espera
├── optin.js         -> Interceptação AJAX e envio do formulário de waitlist para a Worker API
├── espera.js        -> Parâmetros de URL (?tipo=&seg=), contagem regressiva e alternador B2C/B2B
├── planos.js        -> Navegação por abas com suporte a teclado (setas) e preenchimento de planos
├── voice.js         -> Player de áudio via Web Audio API, orquestração de vozes e legendas síncronas
├── orb.js           -> Shader WebGL GLSL que renderiza a esfera interativa reativa à voz
├── auth-config.js   -> Configurações públicas do cliente Supabase para o navegador
├── conta.js         -> Controladora de formulários de cadastro, login e redefinição de senha
├── obrigado.js      -> Renderização condicional pós-conversão na página obrigado.html
└── vendor/
    └── supabase.js  -> Pacote oficial do Supabase JS SDK v2 auto-hospedado
```

### 6.2 Análise Aprofundada dos Principais Módulos

#### A. `assets/contador.js` (Simulador de Contagem da Lista)
O contador presente em `index.html`, `espera.html` e `planos.html` opera por uma função de tempo:
```javascript
const base = Number(el.dataset.count) || 0;
const start = Date.parse(el.dataset.countStart || "2026-09-08T15:00:00-03:00");
const step = Number(el.dataset.countStep ?? 132);
const every = (Number(el.dataset.countEvery) || 2) * 36e5;
const render = () => {
  const n = base + Math.max(0, Math.floor((Date.now() - start) / every)) * step;
  el.textContent = n.toLocaleString("pt-BR");
};
```
* **Constatação Técnica:** O número de inscritos (ex: `1.317`) é incrementado matematicamente a cada 2 horas por 132 novos "inscritos" no client-side. Não há consulta em tempo real ao banco de dados no momento da renderização da landing page para manter o FCP nulo.

#### B. `assets/optin.js` e a Worker API (`api.trustio.com.br`)
* O script submete os dados para `https://api.trustio.com.br/signup`.
* O backend (Cloudflare Worker localizado em `worker/src/index.js`) recebe a requisição, valida honeypot, chama a stored procedure do Supabase `registrar_optin` e envia o e-mail de dupla confirmação via **Resend API** com remetente autenticado `no-reply@send.trustio.com.br`.
* Em caso de ausência de JavaScript, o formulário possui fallback padrão HTML com atributos `_next` redirecionando para `obrigado.html`.

#### C. `assets/voice.js` e `assets/orb.js` (Tecnologia de Voz e WebGL)
* Uma única instância do elemento `<audio>` gerencia todas as prévias de áudio neurais (`hero-bruna.mp3`, `hero-matheus.mp3`, `ara.mp3`, `eve.mp3`, etc.).
* Conecta um `MediaElementAudioSourceNode` a um `AnalyserNode` (`fftSize = 1024`, `smoothingTimeConstant = 0.6`).
* Calcula o RMS em tempo real a 60 FPS e injeta o valor `level (0..1)` no shader WebGL da esfera via método `orb.setLevel(level)`.
* As legendas em tempo real (`.orb-live`) fatiam a frase em spans e ativam palavras ligeiramente adiantadas em relação ao áudio (`(p + 0.06) * words.length`), garantindo que o olho não espere pelo ouvido.

#### D. Integrações de Pagamento e Terceiros
* **Stripe:**
  * Não há carregamento de `stripe.js` nas páginas públicas.
  * Todas as transações usam **Stripe Payment Links oficiais** (`https://buy.stripe.com/...`), garantindo isolamento PCI DSS Nível 1.
  * Links mapeados:
    * Starter (R$ 2.900/mês): `https://buy.stripe.com/00wdR96Ia85pcmr6gL5wI05`
    * Pro (R$ 7.900/mês): `https://buy.stripe.com/aFa4gz1nQ71lbin0Wr5wI06`
    * Dedicado (R$ 19.900/mês): `https://buy.stripe.com/dRm3cvaYq2L59af34z5wI07`
    * Diagnóstico (R$ 4.900): `https://buy.stripe.com/3cI4gz8Qi0CXdqv5cH5wI04`
    * Pessoal Mensal (R$ 79/mês): `https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08`
    * Pessoal 7 dias (R$ 24,90): `https://buy.stripe.com/8x228rgiKetN2LRfRl5wI09`
    * Pessoal Anual (R$ 790/ano): `https://buy.stripe.com/cNifZhd6yfxR9afgVp5wI0a`
* **WhatsApp:**
  * Mencionada como integração omnicanal na arquitetura do produto.
  * No frontend, limita-se a campos de entrada de número de telefone (`input[type=tel]`) nos formulários e no widget de onboarding do webchat (`app/index.html`). Não existe widget de chat flutuante de terceiros.
* **HubSpot, PostHog, Google Analytics, Intercom:**
  * **100% ausentes.** O grep em todo o repositório confirmou que a menção a HubSpot é apenas conceitual (como conector MCP suportado em `voice.html:355`).

---

## 7. Síntese de Fricções de UX e Oportunidades Identificadas no Código

1. **Âncoras Quebradas em Páginas Secundárias:**
   * O cabeçalho em `seats.html` contém links como `href="#plataforma"` e `href="#contato"` que não possuem IDs correspondentes nessa página, violando as heurísticas de consistência e controle do usuário.
2. **Concorrência de Call-To-Actions (Lista de Espera vs. Cadastro):**
   * O código revela que `espera.html` e `cadastro.html` operam em bancos/fluxos diferentes: `espera.html` vai para o worker de leads (`registrar_optin`), enquanto `cadastro.html` cria uma conta real no Supabase Auth.
   * O visitante fica na dúvida se deve se cadastrar na lista de espera ou criar uma conta definitiva.
3. **Bloqueio Inesperado no CTA "Chamada real ↗":**
   * O link em `voice.html` para `https://voice.trustio.com.br/credito-jus` leva para uma página fechada por código/senha, sem qualquer indicação no botão de que se trata de uma demonstração restrita.
4. **Saturação do Menu Superior:**
   * 11 elementos interativos no cabeçalho disputam a atenção imediata do usuário em telas de 1320px a 1440px.
5. **Dicotomia B2C / B2B:**
   * A menção proeminente a "IA sem censura" convive diretamente com selos bancários, ISO 27001 e conformidade corporativa, exigindo separação de arquitetura de informação mais clara.

---
*Relatório gerado por `explorer_survey_2` como subsídio para o UX Audit Report.*
