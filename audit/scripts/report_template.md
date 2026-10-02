# Trustio — First-Time User UX Audit

**Target:** https://trustio.com.br (production) · **Date:** 22 Sep 2026 (one day before paid early access on 23/09, nine days before public launch on 01/10) · **Mode:** read-only · **Report language:** English (site copy quoted in PT-BR)

> **Guardrail statement.** No form was submitted: 0 submissions, 0 requests to the waitlist API, 0 blocked-submit events. No character was typed into any Stripe field, and Pagar/Assinar was never clicked. Each of the 7 Stripe payment links was opened **exactly once**, for a page-load screenshot only (ledger in §2.4). The voice orb got one click, on desktop only. No login, no account, no CAPTCHA. Files were created only inside `audit/`, with no git stage, commit or push (`git status` in §10.7).

---

## 1. Executive summary

The site is visually mature: tokens match the brand spec, and Lighthouse accessibility scores 100 on all 12 pages. Conversion and trust are not ready for 23/09. **UX Maturity Score: 55/100.**

**Top 5 issues**

1. **Stripe checkout bills as "JUICYSCORE"**, with no Trustio logo, and only card appeared (F17, F20).
2. **"Dados no Brasil" contradicts the privacy policy** (F36). The ISO/ANPD seals are unverifiable, and there is no CNPJ or DPO (F33–F37).
3. **Three competing paths** (conta, lista, pré-assinatura); the waitlist's pre-sale only e-mails a link (F06, F28).
4. **Broken B2B proof:** the live-call demo has no DNS, and demo requests are mailto only (F10, F31).
5. **The waitlist counter is clock-generated**, and the CSP blocks analytics (F05, F44).

| Dimension | Weight | Score | Why |
|---|---|---|---|
| Value proposition | 20 | **12** | Strong H1; dual audience; no desktop CTA above the fold |
| IA / navigation | 15 | **8** | 12-item header; 23-screen home; orphaned /seats |
| Conversion flow | 20 | **7** | Three paths; off-brand checkout; dead demo |
| Trust & credibility | 15 | **5** | Unverifiable seals; synthetic counter; residency conflict |
| Visual / brand | 10 | **8** | Tokens match; Stripe drifts |
| Accessibility | 10 | **8** | Lighthouse 100; minor focus and error gaps |
| Performance / mobile | 10 | **7** | Content pages 91–94; home 73; voice 38 (lab) |
| **Total** | **100** | **55** | |

---

## 2. Scope & method

### 2.1 Pages and inventories

Page inventory, built from `/sitemap.xml` plus the header, mobile and footer navigation:

{{PAGE_INVENTORY}}

Navigation map (desktop header / mobile menu / footer, from `/`):

<details><summary>Desktop header</summary>

{{NAV_HEADER}}
</details>
<details><summary>Mobile menu</summary>

{{NAV_MOBILE}}
</details>
<details><summary>Footer</summary>

{{NAV_FOOTER}}
</details>

The full CTA inventory ({{CTA_N}} rows, with label, destination, page and above-fold flag per viewport) is in `data/cta-inventory.csv`. A condensed version is in §6.

### 2.2 Setup

- **Tooling:** Playwright 1.56 with Chromium 1194. Desktop runs at 1440×900 @ DPR 2; mobile at 390×844 @ DPR 3 (iPhone 13 profile, touch).
- **Visits:** each journey starts in a fresh browser context (cookies and storage cleared) to simulate a true first visit, with `locale pt-BR` and `America/Sao_Paulo`.
- **Capture:** console errors and warnings, page errors, failed requests and HTTP ≥ 400 responses → `data/events.jsonl`. Link check covers every href on 12 pages × 2 viewports ({{LINKS_N}} unique URLs).
- **axe-core 4.x** (WCAG 2.0/2.1/2.2 A+AA + best-practice) on every page at both viewports → `axe/`. **Lighthouse 12** (mobile form factor, simulated throttling) on every sitemap page → `lighthouse/`.
- **Screenshots:** {{N_SHOTS}} files, named `{journey}-{step}-{slug}-{viewport}-{theme}.png`. Above-the-fold shots use the device DPR. Full-page shots (`…-full-…`) use CSS scale so files stay committable; during the full-page capture only, scroll-reveal blocks are forced visible (otherwise off-screen `.reveal` sections render blank in a stitched image). When a step only scrolls within a page, its full-page reference is the step-01 capture of that page.
- **Evidence panel:** `J2-05-handoff-dns-evidence-*.png` is a rendered panel of DNS results, not a site screenshot. A failed navigation leaves Playwright on a blank page.
- **Measurement caveats:** the runner is a cloud container behind an egress proxy, **outside Brazil**, so Stripe's currency and payment-method presentation may differ for a Brazilian visitor (F19, F20). Lighthouse is lab data, and WebGL renders in software there, which inflates TBT on `/voice.html`.
- **Logs:** {{N_STEPS}} journey steps logged in `data/steps.jsonl`; {{N_F}} findings ({{N_OBS}} observed, {{N_INF}} inferred; {{SEV}}).

### 2.3 Not tested (and why)

| Item | Reason |
|---|---|
| 5-question trial of the uncensored model | Lives behind an account (`/app/`, Supabase chat). No login or account creation per guardrail 4, so none of the 5 questions was used. |
| Live voice session | The /voice.html orb plays pre-recorded clips; no live session exists to open. The "Chamada real" live demo host has no DNS (F10). |
| Stripe Pix / Apple Pay / Google Pay; BRL default | Needs a Brazilian IP and a real wallet-enabled device. Each link could be opened only once (F19, F20). |
| Screen readers (VoiceOver/NVDA), real iOS Safari | Not available in the runner; covered by axe, keyboard and focus checks only. |
| Field Core Web Vitals (CrUX) | Not queried; lab data only. |
| cadastro / entrar submission | Guardrail 4 (no account, no login). |

### 2.4 Guardrail stops and ledger

| Journey / step | Stop |
|---|---|
| J2-03 mobile | Orb tap skipped: one interaction per demo already used on desktop |
| J4-06 desktop + mobile | Form filled with fake data ("Teste Auditoria", teste@exemplo.com); **stopped before submit**, no Enter pressed |
| J4-09 | /cadastro observed only (no account creation) |
| J3-05…08 | Stripe: page load and screenshot only, no field touched |
| Trial / chat | Not reachable without an account (stopped) |

Network-level enforcement: the auditor code aborted any non-GET request to FormSubmit, `api.trustio.com.br` and Supabase, and any POST to trustio.com.br. Aborted during the audit: {{ABORTED}} (Cloudflare RUM beacons; no form traffic). Stripe was reachable only from a dedicated context, guarded by a persisted one-open ledger:

| CTA | Stripe link | Viewport | Opened (UTC) | Times opened |
|---|---|---|---|---|
{{STRIPE_ROWS}}

---

## 3. Journey timeline

Legend: sev 0 = positive or no problem, 4 = launch blocker. O = observed, I = inferred.

{{J1}}

{{J2}}

{{J3}}

{{J4}}

{{J5}}

{{J6}}

### 3.7 Consolidated friction log

(Also in `friction-log.csv`.)

{{FRICTION_ALL}}

---

## 4. Heuristics & IA evaluation

### 4.1 Messaging clarity per persona

**P1 · B2C, mobile, from social.** The mobile first viewport works: H1, lead and "Criar conta grátis ↗" are visible. The offer that matches P1's intent ("IA Privada e sem censura. Seats individuais disponíveis.") sits about 3 screens down, and its dedicated page `/seats.html` is unreachable from the site (F04). After the first CTA, P1 must choose among conta, lista and pré-assinatura (F06). The checkout names another company (F17). The 5-second answer is: *"private AI, for me and for companies; I can create an account"*. It does not say what they can do today (nothing until 23/09 or 01/10) or why to pay now.

**P2 · B2B (law-firm partner / hospital IT lead).** The desktop first viewport has no CTA (F01), and the header lists 12 items. Validation material is prose. The seals cannot be verified (F33, F34), there is no CNPJ or DPO (F37), the residency claim is contradicted by the privacy page (F36), and there is no security pack (F38). The strongest proof asset (live VoiceAI call) is dead (F10), and every "talk to an architect" is a mailto (F31). A compliance buyer cannot finish a vendor pre-assessment on the site.

### 4.2 Contrast (measured)

Token pairs (WCAG 2.x relative luminance):

{{CONTRAST_TOKENS}}

Rendered samples (declared text colour vs. dominant rendered background pixel in the element clip; clips in `data/contrast/`):

{{CONTRAST_RENDERED}}

**Verdict:** every measured text pair passes AA in both themes. The only sub-AA token is `--blue #2563EB` on `--abyss` (3.9:1); keep it for large text, icons and CTA fills, never for body text. The problem is **size, not contrast**: labels and kickers at 10.5–11 px mono uppercase (F47).

### 4.3 Mobile layout

- No page-level horizontal scroll at 390 px on any of the 12 pages: `scrollWidth = 390` everywhere. Decorative canvases overflow but are clipped.
- Wide tables scroll inside wrappers with no cue, and the wrappers are not focusable (F22).
- Length: home 19,637 px, voice {{VOICE_H}}. Long single pages bury the offer that matches P1's intent (F07).
- Header 73 px fixed; targets ≥ 44 px. Footer links 23 px (F42). The menu overflows the viewport (F40).

### 4.4 CTA hierarchy and consistency

- **Primary-CTA label drift:** 4 labels → cadastro, 3 → espera, 6 → Stripe, 9 → mailto/#contato. The same intent is named differently on each page (e.g. "Falar com a Trustio", "Falar com um arquiteto", "Iniciar uma conversa", "Planejar a implantação…").
- **The primary button style (blue gradient) is spent on different intents** per page: home → "Criar conta grátis", banner → "Entrar na lista de espera", espera → "Quero pré-assinar…". A visitor cannot learn "blue = the one thing Trustio wants me to do".
- **Header CTA:** "Falar com a Trustio" (B2B, mailto) is the only persistent button. The pre-sale, the core business goal for the next 9 days, has no persistent entry point.

### 4.5 Core Web Vitals (Lighthouse, mobile, lab)

{{LH_TABLE}}

CLS is effectively 0 site-wide (good). LCP is 2.6–3.0 s on content pages under simulated slow 4G. The `/voice.html` TBT value is dominated by software-rendered WebGL in the lab and is **not representative**; still, it is the heaviest main-thread page. Lighthouse "image-aspect-ratio" fails on every page (the footer seal images). Treat all values as directional until field data exists (F46).

### 4.6 Accessibility

axe-core violations (both viewports):

{{AXE_TABLE}}

axe "incomplete" (needs manual review, mostly gradient backgrounds): {{AXE_INCOMPLETE}}. The manual contrast sampling in §4.2 covers these.

Manual checks: skip link ✓, visible 2 px focus ring ✓, logical tab order ✓, Escape closes the menu and returns focus ✓, `aria-pressed` on the theme toggle and orb ✓, reduced motion honoured in CSS (`.js .reveal { opacity:1; transform:none }` under the media query) ✓. Gaps: focus is not moved into the mobile menu (F40); errors are native-only, without `aria-invalid` (F26); scroll regions are not focusable (F22).

---

## 5. Brand consistency

`trustio-tokens.css/json` are **not in the repo**. The repo has `design-system/tokens.json`, generated from `assets/styles.css`, which matches the brief's tokens. Live values are read from production `assets/styles.css`.

| Token | Brief | Live (`:root`) | Match |
|---|---|---|---|
| --blue | #2563EB | #2563eb | ✓ |
| --blue-signal | #5EA7FF | #5ea7ff (light theme: #1d5fd6) | ✓ |
| --navy | #0A1D3D | #0a1d3d | ✓ |
| --abyss | #05070B | #05070b (light: #f4f6fa) | ✓ |
| --surface | #0B0E14 | #0b0e14 (light: #ffffff) | ✓ |
| --ice | #F4F6FA | #f4f6fa | ✓ |
| --muted | #99A4B5 | #99a4b5 (light: #55637a) | ✓ |
| Radius | 20 / 32 px | `--radius: 20px`, `--radius-large: 32px` | ✓ tokens, but ~20 ad-hoc radii in CSS (8, 10, 12, 22, 28 px) |
| Display / body | Geist | `--display`/`--body: "Geist"` (self-hosted woff2) | ✓ |
| Kickers | Geist Mono | `--mono: "Geist Mono"`, used in 45 rules | ✓ (over-used; see F47) |
| Editorial accent | Instrument Serif | `--serif`, 3 rules | ✓ sparing |

**Wordmark:** "Trust" in the text colour + "io" in blue-signal, with the squircle "T" icon. It is consistent across all 12 pages and both themes. **Drift:** Stripe checkout has no Trustio mark, a crimson button (#DE3163) and the name JUICYSCORE (F17). The nav label "VoiceAI POWERED BY XSPACE" introduces a second, unexplained brand (F12). The footer seal images fail Lighthouse's aspect-ratio check (distorted).

---

## 6. Funnel analysis

```
Social / search ─▶ Home (/)
                   ├─▶ "Criar conta grátis" ─▶ /cadastro (account, chat 01/10)        [concept 1]
                   ├─▶ Banner "Entrar na lista" ─▶ /espera ─▶ "Pré-assinar" = e-mailed link  [concept 2 → delayed pay]
                   ├─▶ "Ver planos" ─▶ /planos (B2B tab default) ─▶ Stripe (JUICYSCORE)       [concept 3]
                   └─▶ B2B "Falar com um arquiteto" ─▶ mailto:                                 [no tracking, no scheduling]
   /seats.html (clearest B2C landing) ◀── no inbound links
   /voice.html ─▶ "Chamada real" ─▶ DNS error
```

Drop-off risk per step (qualitative, from observed friction; no traffic data exists because analytics are blocked, F44):

| Funnel step | P1 risk | P2 risk | Driver |
|---|---|---|---|
| Land → understand (5 s) | Medium | High | Dual-audience H1; no desktop CTA above the fold (F01, F02) |
| Understand → choose path | High | Medium | 3 concepts, label drift (F06) |
| Path → form / plan | Medium | High | Form 2 screens down on mobile; contradictory copy; B2B mailto (F25, F27, F31) |
| Plan → checkout | **Very high** | **Very high** | Merchant JUICYSCORE, off-brand, card-only capture, possibly USD (F17–F20) |
| Checkout → trust confirmation | High | Very high | Unverifiable seals, residency contradiction, no CNPJ/DPO (F33–F37) |

CTA inventory (main-area CTAs plus waitlist entries; content links omitted; full list in `data/cta-inventory.csv`):

{{CTA_TABLE}}

---

## 7. Prioritized improvement matrix

{{N_R}} items, {{N_QW}} Quick Wins. Impact 1–5; Effort S (< 1 day) / M (≤ 1 week) / L (> 1 week). Sorted by ID; see §9 for the order of execution.

{{MATRIX}}

---

## 8. SOTA enhancements

### 8.1 Benchmarks (patterns, not copies)

| Reference | Pattern worth adopting | Trustio application |
|---|---|---|
| **Linear** | One sentence plus one primary CTA above the fold, with the real product UI as the hero visual; secondary actions are quiet text links | Desktop hero with one CTA and a real chat screenshot labelled "prévia" (R03, R22) |
| **Vercel** | Parallel "self-serve" and "talk to sales" CTAs with distinct visual weights; a separate Enterprise page for buyers | "Para mim" (primary) vs "Para minha empresa" (secondary) plus an /empresas page (R07, R22) |
| **Stripe** | Pricing that states the exact method, currency and timing next to each button; security documentation that names the certification and the auditor | Payment facts next to every Stripe CTA; verifiable seals (R11, R15) |
| **Anthropic** | A public trust portal listing certifications, subprocessors and policies, with downloadable reports on request | /seguranca as a Trust Center with subprocessors and country (R21) |
| **x.ai** | Monochrome, type-led hero; very short copy; product entry point always visible | Trustio already has the aesthetic; add the always-visible entry point (sticky CTA) |

### 8.2 Design tokens (additions; keep existing values)

```css
:root {
  /* Semantic roles — decouple intent from palette */
  --color-cta-bg: var(--cta-gradient);     --color-cta-fg: #ffffff;       /* 5.17:1 on #2563EB */
  --color-text-primary: var(--ice);        --color-text-secondary: var(--muted-strong);
  --color-text-tertiary: var(--muted);     --color-danger: #ff7aa8;       --color-danger-text: #ffb3cc;
  --focus-ring: 0 0 0 2px var(--abyss), 0 0 0 4px var(--blue-signal);
  /* Radius scale — replace ad-hoc 8/10/12/22/28 px */
  --radius-sm: 10px; --radius: 20px; --radius-large: 32px; --radius-pill: 999px;
  /* Type — bound the hero so CTA fits in 1440×900 */
  --fs-hero: clamp(2.75rem, 1.6rem + 4.4vw, 6rem);
  --fs-lead: clamp(1.0625rem, 1rem + .35vw, 1.3125rem);
  --fs-label: 0.75rem;   /* 12 px minimum for labels/kickers (was 10.5–11) */
  --tracking-kicker: 0.14em;
  /* Motion */
  --dur-1: 120ms; --dur-2: 200ms; --dur-3: 320ms; --dur-4: 560ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* existing --ease */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
@media (prefers-reduced-motion: reduce) { :root { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; --dur-4: 0ms; } }
```

### 8.3 Components

| Component | Spec |
|---|---|
| **PersonaSwitch** (hero) | 2-option segmented control, `role="radiogroup"`, 44 px tall, persisted in localStorage (with try/catch). It swaps H1 lead, primary CTA and proof row. Default "Para mim" on mobile, or from `utm_source=social`. |
| **PrimaryCTA** | Exactly one per viewport. Label = verb + outcome + date ("Pré-assinar · acesso em 23/09"). A payment-fact line directly under it ("R$ 79/mês · Pix ou cartão · cobrança em nome de Trustio"). |
| **StickyMobileCTA** | Bottom bar at ≥ 30 % scroll on /, /seats, /planos. 56 px, safe-area inset, hidden while the menu is open or a form field has focus. |
| **VerifiableBadge** | Seal image + text + "verificar ↗" link to the certificate or registry. Renders nothing when `data-verified` is absent, so there is no unverifiable seal by construction. |
| **LiveCount** | Fetches `/api/waitlist/count` (hourly cache). Shows "atualizado há X min". Hidden on fetch error instead of falling back to a synthetic value. |
| **FormField** | Visible label; `hint` and `error` slots wired with `aria-describedby`; `aria-invalid` on blur; PT-BR messages; BR phone mask `(99) 9 9999-9999`. |
| **DemoBanner** | Top of /console/: "Demonstração · dados fictícios · nada aqui está em produção". Non-dismissable in demo mode. |
| **SecurityPack card** | /seguranca: 3 downloadable PDFs (arquitetura, subprocessadores, modelo de DPA), size and date shown; e-mail gate optional. |

### 8.4 Micro-interactions

| Interaction | Duration / easing | Reduced motion |
|---|---|---|
| CTA hover/press | background-position shift + 1 px lift, `--dur-1` `--ease-out`; press scale .98 at `--dur-1` | Colour change only |
| PersonaSwitch | thumb slide `--dur-3` `--ease-in-out`; content cross-fade 160 ms with 40 ms stagger | Instant swap |
| Form error | message height 0→auto `--dur-2` `--ease-out` + border colour; **no shake** | Instant |
| Checkout hand-off | Button shows spinner after 150 ms; "Abrindo checkout seguro da Stripe…" live region | Text only |
| Counter (real) | Digit roll only when the value changes on revisit, `--dur-4` `--ease-out` | Static number |
| Section reveal | opacity 0→1 + translateY 12→0 px, `--dur-4` `--ease-out`, once per element | Already disabled (keep) |
| Orb | Existing audio-reactive glow; pause the WebGL loop when offscreen (IntersectionObserver) | Static poster frame |

### 8.5 PT-BR copy rewrites

| Where | Current | Proposed |
|---|---|---|
| Home H1 + lead | "IA pessoal e empresarial. Sob seu controle." + two-audience lead | **H1:** "IA privada, feita no Brasil." **Lead (Para mim):** "Converse com modelos abertos sem filtro do fornecedor. Suas conversas não treinam ninguém." **Lead (Para empresas):** "Modelos, agentes e VoiceAI no seu ambiente dedicado — com contrato, auditoria e LGPD." |
| Home primary CTA (até 23/09) | "Criar conta grátis ↗" | "Pré-assinar e entrar em 23/09 ↗" · secundário: "Entrar na lista grátis (acesso em 1º/10)" |
| Payment fact under CTA | — | "R$ 79/mês · Pix ou cartão · cancele quando quiser" |
| Waitlist helper | "Só o e-mail é obrigatório." (com "NOME obrigatório") | "Obrigatórios: nome e e-mail. O WhatsApp é opcional e só serve para avisar no dia." |
| Invalid e-mail | (borda rosa, sem texto) | "Confira o e-mail — falta o domínio depois do @ (ex.: nome@empresa.com.br)." |
| Empty name | "Please fill out this field." (nativo) | "Como podemos te chamar?" |
| Waitlist "Pré-assinar" option | "enviamos o link de pagamento" | "Você vai direto para o pagamento seguro e entra em 23/09." |
| /planos H1 | "Infraestrutura privada de IA. Contratada em minutos." | "Planos em reais. Para você e para a sua empresa." · B2B note: "Ambiente provisionado em até 5 dias úteis." |
| Footer tagline | "Infraestrutura privada de inteligência artificial para empresas." | "IA privada para pessoas e empresas, operada no Brasil." |
| Seals line | "Certificação ISO 27001 · Conformidade LGPD" | (until verifiable) "Em conformidade com a LGPD · Encarregado: nome — dpo@trustio.com.br" · (after) "ISO/IEC 27001 — certificado nº …, emitido por …, escopo … · verificar ↗" |
| Residency (B2C), if inference stays abroad | "tudo roda no Brasil" | "Suas contas e conversas ficam armazenadas no Brasil. A geração de respostas do plano individual usa um provedor contratado — veja país e contrato em Privacidade." |
| VoiceAI hand-off (fallback) | "Chamada real ↗" (DNS error) | "Ouvir uma chamada real ▶" (on-site recording) or "Ligar para a demo: (11) …" |
| Console demo banner | footnote "Métricas ilustrativas…" | "Você está numa demonstração. Os números são fictícios." |
| B2B contact | "Iniciar uma conversa ↗" (mailto) | "Agendar 30 min com um arquiteto ↗" · secundário: "Prefere e-mail? contato@trustio.com.br" |
| Checkout interstitial (until Stripe is renamed) | — | "Pagamento processado pela Stripe. Na fatura aparecerá: TRUSTIO." (show only when true) |

### 8.6 Trust-signal system (target state)

1. Legal identity in the footer: razão social · CNPJ · endereço · Encarregado.
2. Verifiable certifications only, each linked.
3. Subprocessors table with country per product (B2C chat vs B2B dedicated).
4. Real waitlist count with an "atualizado há" timestamp, or no count.
5. Checkout under the Trustio name and logo.
6. Status page link.
7. Named customers or pilots only with written permission.

---

## 9. Launch-critical checklist

### Before 2026-09-23 (paid early access) — blocks conversion or creates legal/trust exposure

- [ ] **R12** Stripe: business name "Trustio", statement descriptor, logo, #2563EB, BRL, Pix + wallets enabled. Test once from a Brazilian phone (F17, F19, F20).
- [ ] **R08** Publish DNS for `voice.trustio.com.br`, or repoint "Chamada real" (F10).
- [ ] **R17** Qualify or align every "Dados no Brasil / inferência no Brasil" claim with the privacy policy (F36, F39).
- [ ] **R15** Remove or substantiate the ISO 27001 seal and claim; remove the ANPD logo; separate founder credentials (F33–F35).
- [ ] **R18** Razão social, CNPJ, address and Encarregado in the footer and privacy page (F37).
- [ ] **R02** Replace the clock-driven counter with a real count, or remove it (F05).
- [ ] **R01 (minimum)** Waitlist "Pré-assinar" → direct Stripe redirect; one primary CTA "Pré-assinar e entrar em 23/09" on home, /seats and /planos#pessoal (F06, F28).
- [ ] **R11** Remove "Contratada em minutos" or align it with the 5-business-day provisioning (F18).
- [ ] **R13** Fix the "Nome obrigatório" contradiction; add inline PT-BR errors (F25, F26).
- [ ] **R06** Link /seats.html (home banner, ads) and fix its anchors (F04, F24).
- [ ] **R19** Unblock analytics in the CSP and ship funnel events, so 23/09 can be measured (F44).
- [ ] **R03** CTA in the desktop first viewport (F01).

### Before 2026-10-01 (public launch)

- [ ] **R04** Persona-specific value proposition and footer tagline (F02, F08).
- [ ] **R05** Navigation ≤ 7 items; the mobile menu fits one screen and manages focus (F03, F40).
- [ ] **R14** B2B scheduler + security pack (F31, F38).
- [ ] **R10** Demo banner on /console/ (F14).
- [ ] **R09** Explain or drop "xSpace"; qualify "em produção" (F12).
- [ ] **R16** Accessibility and mobile polish: scroll regions, card roles, 24 px+ footer targets, 12 px labels (F15, F22, F42, F47).
- [ ] **R13 (rest)** Unify the /espera and /planos form schemas; bring the mobile form above the fold (F27, F29).

### After launch

R07 (home split), R20 (WebGL performance), R21 (Trust Center), R22 (persona switch), R23 (embedded branded checkout).

---

## 10. Appendix

### 10.1 Console errors and failed requests (all journeys)

{{EVENTS}}

Stripe-hosted errors (hCaptcha 401, preload warnings, Stripe CSP) come from Stripe's own page and are not Trustio defects. The single 502 on `trustio-mark.svg` was transient (it loaded on every other visit). Note: the discovery pass ran with CSP bypass (needed to inject axe-core), so CSP errors in that pass are under-counted. The journey passes ran with the site's real CSP.

### 10.2 Broken or failed links

{{LINKS_N}} unique URLs checked. {{LINKS_SKIPPED}} were skipped by guardrail: the live Stripe links, each opened exactly once in J3 and never by the link checker. The waitlist endpoint is a form action and was never requested, and mailto: links were not fetched.

{{LINKS}}

### 10.3 Lighthouse summary

See §4.5; raw JSON and HTML reports are in `lighthouse/`.

### 10.4 axe summary

See §4.6; raw results per page and viewport are in `axe/`.

### 10.5 Data files

`data/steps.jsonl` (every step), `data/inventory.json` (per-page links, forms, headings, overflow, tap targets), `data/cta-inventory.csv`, `data/linkcheck.json`, `data/contrast.json` (+ clips), `data/events.jsonl`, `data/guardrail-log.jsonl`, `data/stripe-ledger.json`, `data/lighthouse-summary.json`. To re-run from `audit/`: `npm i playwright@1.56 lighthouse@12 axe-core`, then `node scripts/discovery.mjs && node scripts/journeys.mjs && bash scripts/lighthouse.sh && python3 scripts/contrast.py && python3 scripts/build_report.py`. `data/stripe-ledger.json` makes `journeys.mjs` refuse to reopen any Stripe link already opened; keep it. Scripts are in `scripts/` (`discovery.mjs`, `journeys.mjs`, `lib.mjs`, `contrast.py`, `findings.py`, `build_report.py`, `check_images.py`, `lighthouse.sh`, `evidence-panel.mjs`).

The files from an earlier audit run found in `audit/` (screenshots `01-…` to `24-…`, `TEST_*.md`) were left untouched. The earlier report was renamed to `UX_AUDIT_REPORT.previous.md` so this one could take its name.

{{APPENDIX_EXTRA}}
