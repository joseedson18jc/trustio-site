# Survey of Live Public Website: https://trustio.com.br

**Survey Date**: 2026-09-22T18:40:00Z  
**Surveyed Domain**: `https://trustio.com.br`  
**Host Architecture**: GitHub Pages CDN (`brazilsouth`), Cloudflare Edge (`GRU` / São Paulo), Varnish / Fastly cache, HTTP/2 & H3 enabled.  
**Surveying Agent**: `explorer_survey_1`  
**Integrity Mode**: Read-Only / SOTA First-Time User Experience Audit  

---

## 1. Executive Endpoint & HTTP Status Map

All primary discovery and pre-submission endpoints were tested directly against `https://trustio.com.br`:

| Route / Endpoint | HTTP Status | Effective URL | Canonical Tag | Purpose & Page Type |
|---|---|---|---|---|
| `/` (`/index.html`) | **200 OK** | `https://trustio.com.br/` | `https://trustio.com.br/` | Home Page (Dual B2C / B2B discovery) |
| `/voice.html` (or `/voice`) | **200 OK** | `https://trustio.com.br/voice.html` | `https://trustio.com.br/voice.html` | VoiceAI Product Deep-Dive (powered by xSpace & xAI Grok Voice) |
| `/planos.html` (or `/planos`) | **200 OK** | `https://trustio.com.br/planos.html` | `https://trustio.com.br/planos.html` | Plans & Pricing (Dual B2B VPC tiers + B2C personal tiers + Stripe checkout) |
| `/seats.html` (or `/seats`) | **200 OK** | `https://trustio.com.br/seats.html` | `https://trustio.com.br/seats.html` | Individual Seats Landing Page (Unfiltered AI) |
| `/manifesto.html` (or `/manifesto`) | **200 OK** | `https://trustio.com.br/manifesto.html` | `https://trustio.com.br/manifesto.html` | Manifesto Trustio ("Segurança, liberdade e propósito") |
| `/juridico/` | **200 OK** | `https://trustio.com.br/juridico/` | `https://trustio.com.br/juridico/` | Trustio Jurídico Vertical Solution (Legal AI & Case Law) |
| `/privacidade.html` | **200 OK** | `https://trustio.com.br/privacidade.html` | `https://trustio.com.br/privacidade.html` | Privacy Policy (LGPD-compliant plain Portuguese disclosure) |
| `/modelos.html` | **200 OK** | `https://trustio.com.br/modelos.html` | `https://trustio.com.br/modelos.html` | Frontier Models Catalog (GPT-6 Astra, Claude Fable/Opus 5.1, Kimi K3.1) |
| `/fundador.html` | **200 OK** | `https://trustio.com.br/fundador.html` | `https://trustio.com.br/fundador.html` | Founder Profile & Institutional Trust (José Edson da Costa) |
| `/espera.html` | **200 OK** | `https://trustio.com.br/espera.html` | `https://trustio.com.br/espera.html` | Standalone Pre-registration / Waitlist Funnel (Double Opt-In) |
| `/cadastro.html` | **200 OK** | `https://trustio.com.br/cadastro.html` | `https://trustio.com.br/cadastro.html` | User Account Creation (Supabase Auth integration) |
| `/entrar.html` | **200 OK** | `https://trustio.com.br/entrar.html` | `https://trustio.com.br/entrar.html` | Authentication Portal (Login & Password Recovery) |
| `/app/` | **200 OK** | `https://trustio.com.br/app/` | *(None, robots: noindex)* | Client Web Chat Application (Protected by Auth Gate modal) |
| `/console/` | **200 OK** | `https://trustio.com.br/console/` | *(None, robots: noindex)* | Interactive Voice Agent Builder Simulator |
| `/obrigado.html` | **200 OK** | `https://trustio.com.br/obrigado.html` | `https://trustio.com.br/obrigado.html` | Post-Checkout / Lead Conversion Acknowledgment Page |
| `/termos.html` / `/termos` | **404 Not Found** | `https://trustio.com.br/404.html` | *(None)* | **CRITICAL GAP**: Terms of Service page does not exist |
| `https://voice.trustio.com.br/credito-jus` | **DNS Failure (NXDOMAIN)** | `(Could not resolve host)` | *(None)* | **CRITICAL DEFECT**: Linked in `voice.html` & `console/index.html` |

---

## 2. In-Depth Journey & Endpoint Inspection

### 2.1 Home Page (`https://trustio.com.br/`)

#### Metadata
- **Title**: `Trustio | IA pessoal e empresarial sob seu controle — privada, sem censura, no Brasil`
- **Description**: `IA pessoal e empresarial sob seu controle: chat privado sem censura e agente de IA para você; infraestrutura privada, VoiceAI e Omnichannel para a sua empresa. Construída e hospedada no Brasil.`
- **Canonical**: `https://trustio.com.br/`
- **Social Tags**: Open Graph (`og:type="website"`, `og:image="https://trustio.com.br/assets/social-card.png"`, 1200x630) and Twitter Card (`summary_large_image`).
- **Security / CSP**: `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self' https://formsubmit.co`

#### Visual Structure & Sections
1. **Header / Navigation Bar**:
   - Brand lockup: SVG geometric shield mark + typography ("Trust**io**").
   - Desktop Navigation Links:
     - `Plataforma` (`#plataforma`)
     - `Modelos Poderosos` (`modelos.html`)
     - `VoiceAI powered by xSpace` (`voice.html` with stylized sub-badge)
     - `Segurança` (`#seguranca`)
     - `Implantação` (`#implantacao`)
     - `Jurídico` (`/juridico/`)
     - `Planos` (`planos.html`)
     - `Lista de espera` (`espera.html`)
     - `Manifesto` (`manifesto.html`)
   - Header Utility Actions:
     - `Entrar` (`entrar.html`)
     - `Falar com a Trustio` (Button ghost -> `#contato`)
     - Theme Toggle (Moon / Sun toggle button, light/dark mode)
     - Mobile Hamburger Toggle (`.menu-toggle`)
2. **Hero Section (`#conteudo`)**:
   - Eyebrow: `Infraestrutura privada de IA no Brasil`
   - Main Headline (H1): `IA pessoal e empresarial. Sob seu controle.`
   - Subtitle: Distinguishes between individual private uncensored chat + task agent vs. dedicated enterprise infrastructure hosted in Brazil.
   - Primary Hero CTAs:
     - `Criar conta grátis ↗` -> `cadastro.html` (High-contrast primary button)
     - `Ver mentoria e implantação serviço pago ↓` -> `#mentoria` (Outline link)
     - `Ver os dois caminhos ↓` -> `#para-quem` (Secondary link)
   - Micro-copy reassurance: `Criar conta é gratuito e leva um minuto. O chat abre em 1º de outubro de 2026 — quem pré-assina um plano entra em 23 de setembro. Sem fila e sem aprovação manual.`
3. **Dual Discovery Tracks ("Para você" vs. "Para sua empresa")**:
   - **Track 1: Para você (B2C)**:
     - Value proposition: Uncensored private LLM inference in Brazil + Hermes AI autonomous agent on WhatsApp and Telegram.
     - Free Trial Offer: 5 free chat prompts + 3 days WhatsApp autonomous agent.
     - Pricing preview: 7-day pass R$ 24,90, Monthly R$ 79, Annual R$ 790 (no auto-renew on Pix).
     - Social Proof Banner: `Lançamento em 1º de outubro de 2026 · 1.317 pessoas na lista · pré-assinantes entram em 23/09`.
     - CTAs: `Criar conta grátis ↗` (`cadastro.html`), `Ver planos ↗` (`planos.html#pessoal`), `Entrar na lista de espera ↗` (`espera.html`).
   - **Track 2: Para sua empresa (B2B)**:
     - Core capabilities: Dedicated private VPC in Brazil, OCR & document processing, VoiceAI with Brazilian prosody, Omnichannel unified context memory.
     - CTAs: `Falar com um arquiteto ↗` (`#contato`), `Conhecer o VoiceAI ↗` (`voice.html`).
4. **Mentorship & Implementation Services (`#mentoria`)**:
   - 2-hour 1x1 live mentorship for personal fine-tuning (CTA: direct `mailto:` link).
   - 4-hour enterprise implementation mentorship across 2-3 weeks (CTA: direct `mailto:` link).
5. **Architectural Principles & Platform Deep-Dive**:
   - Data sovereignty, zero lock-in (OpenAI-compatible `/v1/chat/completions` API curl sample), native auditability and logging.
   - Core functional blocks: Private LLM infra, RAG & enterprise search, autonomous workflows, OCR, VoiceAI.
6. **Security & Governance (`#seguranca`)**:
   - Data residency in Brazil (`sa-east-1` / `br-sao-1`), tenant network/identity isolation, immutable audit trails, LGPD by design.
7. **Implementation Methodology (`#implantacao`)**:
   - 4-stage delivery timeline: Descoberta -> Arquitetura -> Implantação -> Evolução.
8. **Manifesto Teaser**:
   - Quote block with link `Ler o Manifesto →` (`manifesto.html`).
9. **Contact & Next Step (`#contato`)**:
   - Card framing: `Sua empresa está pronta para operar IA sob seus próprios termos?`
   - Actions: Direct `mailto:contato@trustio.com.br?subject=Conversa%20sobre%20infraestrutura%20privada%20de%20IA` + interactive single-click copy button (`data-copy="contato@trustio.com.br"`) with live ARIA status (`Copiado`).
   - Guidance note: Explicit instructions on how to reach out (3-line summary: problem, team size, timeframe; no sensitive documents on first contact).
10. **Footer & Trust Verification**:
    - ISO 27001 Certification badge.
    - ANPD & LGPD compliance seals.
    - GitHub public security policy link: `https://github.com/joseedson18jc/trustio-site/blob/main/SECURITY.md` (verified 200 OK).
    - Status indicator: `Construída e hospedada no Brasil` with green Brazilian flag dot indicator.

---

### 2.2 VoiceAI Product Deep-Dive (`https://trustio.com.br/voice.html`)

#### Metadata
- **Title**: `VoiceAI powered by xSpace | Trustio — agentes Omnichannel de voz e texto no Brasil`
- **Description**: `Agentes Omnichannel: voz, WhatsApp, Telegram, e-mail, SMS, iMessage e agenda. Modelos Grok Voice da xAI orquestrados pela Trustio, com telefonia, guardrails e registros hospedados no Brasil.`
- **Canonical**: `https://trustio.com.br/voice.html`
- **Schema.org**: Product structured data with relation to `Grok Voice` by `xAI`.

#### Key Interactive Modules & Findings
1. **Interactive Hero & Audio Orb Demo (`#demo`)**:
   - Uses WebGL/Canvas audio visualizer (`assets/orb.js`).
   - Voice character selector:
     - `Bruna` (energética)
     - `Matheus` (energético)
     - `Calma` (original)
   - Interactive playback state with caption updates.
2. **Omnichannel Connector Matrix (`#canais`)**:
   - Interactive channel cards for 8 protocols:
     - Phone / SIP (`assets/connectors/phone.svg`)
     - WhatsApp (`assets/connectors/whatsapp.svg`)
     - Telegram (`assets/connectors/telegram.svg`)
     - Gmail (`assets/connectors/gmail.svg`)
     - Outlook (`assets/connectors/outlook.svg`)
     - Calendar (`assets/connectors/calendar.svg`)
     - iMessage (`assets/connectors/imessage.svg`)
     - SMS (`assets/connectors/sms.svg`)
   - Expandable slide-out inspection drawer (`#ch-detail`) displaying technical specs, SLA, and channel-specific activation CTAs.
3. **Voice Culture & Prosody Showcase**:
   - 5 Brazilian voice personas with audio preview clips (7 seconds):
     - `Ara` (Acolhedora e clara - Atendimento/Recepção)
     - `Eve` (Ágil e simpática - Vendas/Reativação)
     - `Leo` (Firme e tranquilo - Cobrança/Confirmações)
     - `Rex` (Grave e objetivo - Suporte técnico)
     - `Sal` (Precisa e discreta - Jurídico/Pesquisa)
   - Brazilian cultural adaptations: Brazilian currency phrasing ("Mil duzentos e trinta e quatro reais"), local terminology (Pix, boleto, CNPJ, DDD).
4. **Real-world Use-Case Call Simulations**:
   - Interactive tabbed transcripts: Atendimento (Support L1), Vendas (Consultative Sales), Qualificação (BANT lead qualification), Recepção (24/7 operator), Agendamento (Calendar sync).
   - Shows simulated real-time tool calls (e.g. `consultar_pedido(8841)`, `politica_troca()`, `criar_link_pagamento()`).
5. **Technical Benchmark Card**:
   - Displays τ-voice Bench: Grok Voice Think Fast (67.3%) vs Gemini 3.1 Flash Live (43.8%) vs GPT Realtime 1.5 (35.3%).
   - Metrics: < 1s end-to-end speech-to-speech latency, 25+ languages, 100% recorded and audited inside Brazil.
6. **CTAs & Critical Finding**:
   - CTA `Abrir o Agent Builder ↗` -> `console/` (Opens simulator).
   - CTA `Ouvir o agente ▶` -> `#demo` (Smooth scrolls to orb).
   - **CRITICAL DEFECT**: CTA `Chamada real ↗` (lines 117 and 416) points to `https://voice.trustio.com.br/credito-jus`.
     - Direct investigation reveals: `curl: (6) Could not resolve host: voice.trustio.com.br`. The DNS subdomain does not resolve (NXDOMAIN), causing a dead end for prospective enterprise clients attempting to test a real phone call!

---

### 2.3 Plans & Pricing (`https://trustio.com.br/planos.html`)

#### Metadata
- **Title**: `Planos e pagamentos | Trustio — infraestrutura privada de IA no Brasil`
- **Description**: `Infraestrutura privada de IA no Brasil, contratada em minutos. Pix, cartão, Apple Pay e Google Pay.`
- **Canonical**: `https://trustio.com.br/planos.html`

#### Segmented Pricing Architecture
`planos.html` uses an accessible tabbed interface (`role="tablist"`) allowing users to switch between:
1. **Para Empresas (B2B)**:
   - **Starter**: R$ 2.900/mês (Shared private VPC, 1 production use-case, OpenAI API compatible).
     - Stripe checkout link: `https://buy.stripe.com/00wdR96Ia85pcmr6gL5wI05` (Live, 200 OK).
   - **Pro (Mais escolhido)**: R$ 7.900/mês (Dedicated VPC, up to 5 use-cases, RAG/OCR/Agents, SSO, 99.5% SLA).
     - Stripe checkout link: `https://buy.stripe.com/aFa4gz1nQ71lbin0Wr5wI06` (Live, 200 OK).
   - **Dedicado**: R$ 19.900/mês (Dedicated GPU, network, and identity; custom VoiceAI, 99.9% SLA, dedicated architect).
     - Stripe checkout link: `https://buy.stripe.com/dRm3cvaYq2L59af34z5wI07` (Live, 200 OK).
   - **Diagnóstico de caso de uso**: R$ 4.900 pagamento único (2 discovery workshops, roadmap, 10-day deliverable, 100% refunded against first subscription month).
     - Stripe checkout link: `https://buy.stripe.com/3cI4gz8Qi0CXdqv5cH5wI04` (Live, 200 OK).
   - Feature comparison table (Casos de uso, Isolamento, Modelos, RAG/OCR, SSO, SLA, Suporte, Formas de pagamento).
2. **Para Pessoas Físicas (B2C)**:
   - Status announcement: Registration open, chat unlocks October 1, 2026. Pre-subscribers enter September 23, 2026 (no waitlist queue).
   - **Pessoal Mensal (Recomendado)**: R$ 79/mês (Unfiltered chat, fair-use without token counting, Pix/Card/Wallets).
     - Stripe pre-subscription link: `https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08` (Live, 200 OK).
   - **Passe 7 Dias**: R$ 24,90 pagamento único (No auto-renew, 7 days from first login).
     - Stripe checkout link: `https://buy.stripe.com/8x228rgiKetN2LRfRl5wI09` (Live, 200 OK).
   - **Anual**: R$ 790/ano (Equates to R$ 65,80/mês, 2 months free, up to 12x installments on Pix/Card).
     - Stripe checkout link: `https://buy.stripe.com/cNifZhd6yfxR9afgVp5wI0a` (Live, 200 OK).
3. **In-page Waitlist Lead Capture Form (`#espera-form` on `planos.html`)**:
   - Action: `https://api.trustio.com.br/signup` (intercepted by `assets/optin.js`).
   - Fields: `email` (required), `whatsapp` (optional), radio `plano` (mensal/semanal/anual), radio `acesso` (lista grátis / pré-assinar), select `uso` (Trabalho, Escrita, Pesquisa, Conversas, Outro).
   - Honeypot antispam field: `_honey`.

---

### 2.4 Individual Seats Landing Page (`https://trustio.com.br/seats.html`)

#### Metadata
- **Title**: `IA privada e sem censura para você | Trustio`
- **Description**: `Acesso individual aos mesmos modelos abertos que rodamos para empresas: sem censura, sem filtro do fornecedor, com inferência e dados no Brasil. Lançamento em 1º de outubro de 2026 — quem pré-assina entra em 23 de setembro.`
- **Canonical**: `https://trustio.com.br/seats.html`

#### Purpose & Content
A specialized high-conversion landing page focused on individual access to open models without provider content filtering.
- Status banner: 1.317 people on waitlist, launch 01/10/2026, early access 23/09/2026.
- Clear disclaimer: `* A responsabilidade pelo conteúdo dos prompts enviados e pelo uso das respostas é inteiramente de quem os envia.`
- CTAs: `Entrar na lista de espera ↗` (`espera.html`), `Ver planos e preços ↗` (`planos.html#pessoal`), `Criar conta grátis` (`cadastro.html`), `Conhecer a Trustio por inteiro →` (`index.html`).

#### Critical Navigation Bug Discovered
On `seats.html`, 11 navigation links are broken:
- Desktop Navigation: `<a href="#plataforma">Plataforma</a>`, `<a href="#seguranca">Segurança</a>`, `<a href="#implantacao">Implantação</a>`, `<a href="#contato">Falar com a Trustio</a>`.
- Mobile Navigation: `<a href="#plataforma">Plataforma</a>`, `<a href="#seguranca">Segurança</a>`, `<a href="#implantacao">Implantação</a>`, `<a href="#contato">Falar com a Trustio</a>`.
- Footer Links: `<a href="#plataforma">Plataforma</a>`, `<a href="#seguranca">Segurança</a>`, `<a href="#implantacao">Implantação</a>`.
- **Root Cause**: The HTML was copied from `index.html` without changing anchor hashes to include the page prefix (`index.html#plataforma`, `index.html#seguranca`, etc.). None of these IDs exist in `seats.html`, causing clicks to register as silent no-ops.

---

### 2.5 Manifesto & Legal / Compliance Landscape

#### A. Manifesto Trustio (`https://trustio.com.br/manifesto.html`)
- **Title**: `Manifesto Trustio | Segurança, liberdade e propósito`
- **Content**: 3 foundational chapters:
  - 01: O que acreditamos (AI as core infrastructure; no company should forfeit data control).
  - 02: O futuro que defendemos (Open choice of models without black boxes; anti-lock-in).
  - 03: Nossa missão (Enterprise AI capacity with Brazilian data sovereignty).
- Three core pillars: **Confiança**, **Liberdade**, **Propósito**.
- Interactive dynamic background canvas (`assets/app.js` network particle animation).

#### B. Trustio Jurídico (`https://trustio.com.br/juridico/`)
- **Title**: `Trustio Jurídico | IA privada para escritórios e departamentos jurídicos`
- **Focus**: Dedicated solution vertical for law firms, legal departments, and Legal Ops.
- Key modules:
  - Jurisprudência atualizada: Continuous monitoring of superior courts (STF, STJ, TST).
  - Real-time judicial event monitor simulation (`TRUSTIO LEGAL MONITOR LIVE`).
  - Document AI: Automatic pleading generation and case drafting with human-in-the-loop review.
  - Legal Intelligence: Empirical historical case analytics by court, subject matter, and judge.
  - RAG over private legal archives with strict role-based access control.
- Clear legal disclaimer: Explains statistical indicators do not guarantee judicial outcomes and AI does not replace legal judgment.

#### C. Privacy Policy (`https://trustio.com.br/privacidade.html`)
- **Title**: `Privacidade | Trustio`
- **Structure**: Extremely clear, plain Portuguese legal disclosure without legalese obfuscation:
  - Discloses what is collected at waitlist, account creation, and chat usage.
  - Explains data residency: São Paulo, Brazil (`sa-east-1` AWS / regional datacenter).
  - Discloses model inference transmission: Queries are routed to external frontier LLM providers when configured, with explicit right of inquiry via email regarding provider jurisdiction.
  - Explicitly states: user conversations are NEVER used to train models.
  - Discloses third parties: Stripe (PCI DSS Level 1 payments), Cloudflare (privacy-friendly cookieless CDN/metrics), Email service. Zero tracking pixels, zero social advertising scripts, zero ad networks.
  - User Rights: Full LGPD compliance (access, deletion, correction) with 15-day response commitment via `contato@trustio.com.br`.

#### D. Missing Legal Documents (Critical Finding)
- **404 on Terms of Service**: Accessing `https://trustio.com.br/termos.html` or `https://trustio.com.br/termos` returns HTTP 404.
- Across the entire codebase and live site, there is no Terms of Use / Termos de Serviço agreement. For a service billing recurring credit card payments (Stripe) and offering "unfiltered" LLMs, the lack of an explicit User Agreement / Terms of Service creates legal and onboarding ambiguity.

---

## 3. Pre-Submission Onboarding Funnels

We mapped three distinct pre-submission pathways:

### Funnel 1: Waitlist & Pre-Registration (`/espera.html`)
- **User Journey**:
  1. User arrives on `/espera.html` directly or via CTA from Home / VoiceAI / Seats.
  2. Live stats displayed: 1.317 on waitlist, live countdown timer to 2026-10-01 09:00 BRT, announcement of early access on 23/09.
  3. Interactive Form (`#espera-form`):
     - Field `nome` (Text, required)
     - Field `email` (Email, required)
     - Field `telefone` (Tel, optional, with helper microcopy)
     - Radio `tipo`: "Para mim" (B2C) vs. "Para minha empresa" (B2B)
     - Conditional logic (handled by `assets/espera.js`):
       - If B2C: shows radio for preferred plan (Mensal R$ 79, Passe R$ 24,90, Anual R$ 790).
       - If B2B: activates and requires `segmento` (VoiceAI, Jurídico, Saúde, Financeiro, etc.) and exposes optional `empresa` and `tamanho`.
     - Radio `acesso`: "Lista grátis (acesso 1º/10, 5 perguntas grátis)" vs. "Pré-assinar (acesso antecipado 23/09)".
     - Field `observacao` (Text, optional).
     - Antispam: hidden `_honey` trap.
  4. Pre-submission boundary: Stop before clicking submit.
  5. Submission mechanism: `assets/optin.js` intercepts submission, sends JSON POST to `https://api.trustio.com.br/signup` (Cloudflare Worker with CORS enabled), and triggers double opt-in confirmation email.

### Funnel 2: Free Account Creation (`/cadastro.html`)
- **User Journey**:
  1. User clicks "Criar conta grátis" on Home or Header.
  2. Hero explains: Account creation is immediate and free; chat unlocks 01/10/2026 (or 23/09/2026 if pre-subscribed).
  3. Form (`#cadastro-form`):
     - Field `nome` (Text, required)
     - Field `email` (Email, required)
     - Field `telefone` (Tel, optional, explained: only used to enable WhatsApp Hermes agent)
     - Field `senha` (Password, minlength 8, required)
     - Radio `tipo`: B2C vs B2B (with conditional Segment & Company fields)
  4. Backend Integration:
     - Direct Supabase Auth client (`https://yxkgdgcdvngltnykleig.supabase.co`).
     - Calls `supabase.auth.signUp()`.
     - Upon completion, shows confirmation prompt pointing to verification link (`emailRedirectTo: https://trustio.com.br/app/`).
  5. Pre-submission boundary: Stop before submitting real credentials.

### Funnel 3: Login & App Authentication Gate (`/entrar.html` & `/app/`)
- **User Journey**:
  1. `/entrar.html` provides tabs for standard password login and password recovery (`supabase.auth.resetPasswordForEmail`).
  2. If unauthenticated user navigates directly to `/app/`:
     - `assets/chat.js` detects null session via Supabase.
     - Displays full-screen modal gate (`.gate`):
       - Title: "Você não está conectado"
       - Text: "Entre ou crie sua conta para usar o chat."
       - Buttons: "Entrar" (`../entrar.html`) and "Criar conta" (`../cadastro.html`).
  3. In-App Onboarding State (for new/trial accounts):
     - Welcome panel: Explains 5 free prompts + 3-day WhatsApp agent trial.
     - Interactive WhatsApp number input widget (`data-wa-form`).
     - Starter prompt pills:
       - "Explique como funciona a LGPD para uma empresa pequena, sem juridiquês."
       - "Escreva um e-mail firme cobrando um pagamento atrasado."
       - "Me ajude a montar um roteiro de vendas por WhatsApp."
       - "Quais são os riscos reais de usar IA pública com dados de clientes?"
     - Paywall modal (`data-paywall`): Activates after 5 prompts are consumed, locking composer and linking to `planos.html`.

---

## 4. Key Discovery Findings, Friction Points & Bugs

| ID | Location | Category | Severity | Description & Impact |
|---|---|---|---|---|
| **BUG-01** | `voice.html` (lines 117, 416) & `console/index.html` | Broken Link / DNS | **High** | Button `Chamada real ↗` links to `https://voice.trustio.com.br/credito-jus`. The host `voice.trustio.com.br` does not resolve (DNS NXDOMAIN). Clicking produces a browser network error. |
| **BUG-02** | `seats.html` (nav, mobile nav, footer) | Broken Anchors | **Medium** | 11 navigation links use bare hashes (`#plataforma`, `#seguranca`, `#implantacao`, `#contato`) which do not exist on `seats.html`. Clicking them does nothing instead of navigating back to `index.html#plataforma`. |
| **GAP-01** | Global Navigation / Footer | Legal / Compliance | **Medium** | There is no Terms of Service / Termos de Uso document anywhere on the site (`/termos.html` returns 404). Users subscribing to recurring paid plans or using uncensored AI have no formal terms of service. |
| **UX-01** | `index.html` & `planos.html` | Cognitive Friction | **Low** | The dual dates ("Lançamento em 1º de outubro de 2026" vs. "pré-assinantes entram em 23 de setembro") require careful reading. Today is 22/09/2026, meaning early access is tomorrow, but the UI presents both options with similar visual weight. |
| **UX-02** | `index.html` Contact section | Usability | **Low** | "Falar com a Trustio" jumps to `#contato`, which contains a `mailto:` link rather than a web contact form. While an inline copy-to-clipboard button is provided, users on desktops without configured mail clients may feel initial hesitation. |
| **FEATURE-01**| `voice.html` & `console/` | SOTA Interactive UI | **Positive** | Interactive WebGL Audio Orbs, sample audio clips in Brazilian Portuguese, and the simulated Agent Builder in `/console/` provide exceptional credibility and product tangibility. |

---

## 5. Site Architecture & Asset Inventory

- **CSS Bundles**: `assets/styles.css`, `assets/voice.css`, `assets/planos.css`, `assets/conta.css`, `assets/chat.css`, `assets/juridico.css`, `assets/console.css`.
- **Custom Fonts**: Geist Latin (normal), Geist Mono, Instrument Serif (italic & normal) preloaded via WOFF2.
- **JavaScript Modules**:
  - `assets/theme.js` (Theme toggle)
  - `assets/app.js` (Navigation, mobile drawer, scroll animations, canvas background)
  - `assets/orb.js` (Interactive WebGL audio visualizer)
  - `assets/voice.js` (Voice previews and channel drawer)
  - `assets/contador.js` (Dynamic waitlist counter)
  - `assets/espera.js` (Waitlist conditional form logic & countdown)
  - `assets/optin.js` (Cloudflare Worker double opt-in API)
  - `assets/auth-config.js` & `assets/conta.js` (Supabase authentication)
  - `assets/chat.js` (Client chat interface, SSE streaming)
- **External Dependencies**:
  - Cloudflare Web Analytics (`https://static.cloudflareinsights.com/beacon.min.js`)
  - Supabase Auth SDK (`assets/vendor/supabase.js`)
  - Stripe Checkout (`https://buy.stripe.com/*`)
