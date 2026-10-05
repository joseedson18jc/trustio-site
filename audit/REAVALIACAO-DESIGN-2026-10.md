# Trustio — Reavaliação visual e de design · 1º de outubro de 2026

Pós-lançamento, pós "Trustio 2.0" (#71). Suplementa a auditoria UX de 22/09 (`UX_AUDIT_REPORT.md`).

**Método.** (1) 24 capturas do site ao ar — acima da dobra em desktop 1440px e mobile 390px, 14 páginas + 5 seções da home — via Chrome headless. (2) Análise visual de cada captura por **grok-4.7 (visão)** via API xAI (análises íntegras em `grok-vision-analises.md` e `grok-vision-home-secoes.md`; capturas em `screenshots/reav-2026-10/`). (3) **Verificação programática independente** de cada alegação: sonda de overflow same-origin a 390px (`scripts/overflow-probe.html`), inspeção de CSS/DOM e medição de assets ao vivo.

> **Princípio da reavaliação:** nenhum achado de visão entrou como fato sem confirmação no layout real. Um achado central do modelo de visão foi **refutado** pela medição (ver F02) — o que valida o método.

---

## 1. Placar

| Dimensão | 22/09 | 01/10 | Por quê |
|---|---|---|---|
| Identidade visual / marca | 8/10 | **7/10** | Trustio 2.0 ganhou personalidade (Unbounded + Martian Mono, pílulas); mas a nav regrediu ao lotar de novo e badges de parceiro competem com a marca |
| Tipografia | — | **7/10** | Display forte e consistente; rótulos mono a 11px são o piso da leitura |
| Acessibilidade | 8/10 | **8/10** | Lighthouse 100 mantido; contraste do corpo 9,5:1 (AA ok); menu mobile presente nas 14 páginas |
| Mobile / responsividade | 7/10 | **7/10** | Zero overflow horizontal em 14 páginas (medido); dobra mobile acima da média do mercado |
| Conversão/confiança | 5/10 | **8/10** | Stripe agora "TRUSTIO IA" (verificado no checkout), CNPJ no rodapé, contador sintético removido, funil simplificado |
| Performance | 7/10 | **7→8** | Home 73/voice 38 (lab, 22/09); PR #88 (orbs lazy) resolve o maior gargalo da voice — re-medir após merge |
| IA/nav | 8/10 | **5/10** | **Regressão**: menu voltou a 8 itens + 3 badges + Entrar + bandeira (R05 pedia ≤7) |

**Placar geral estimado: 65/100** (era 55/100 na véspera do lançamento). Conversão e confiança deram o salto; a navegação regrediu; mobile é melhor do que a auditoria antiga sugeria.

### Média das notas do grok-4.7 por página (6 eixos)

| Página | Hierarquia | Tipografia | Espaço | Contraste | Marca | Mobile |
|---|---|---|---|---|---|---|
| Home hero | 6 | 7 | 4 | 5 | 5 | 3* |
| VoiceAI | 6 | 6 | 4 | 5 | 6 | 3* |
| Planos | 6 | 5 | 4 | 6 | 6 | 3* |
| Agentio | 6 | 6 | 5 | 6 | 7 | 4* |
| IA sem censura | 3 | 5 | 4 | 3 | 6 | 3* |
| Jurídico | 6 | 6 | 4 | 5 | 6 | 3* |
| Cadastro | 6 | 6 | 4 | 5 | 6 | 3* |
| Modelos | 5 | 6 | 4 | 6 | 5 | — |
| Manifesto | 6 | 6 | 5 | 4 | 5 | 3* |

*Notas mobile descontadas: o alegado "texto cortado" em 390px foi refutado pela sonda (F02). O modelo de visão leu a tipografia display justificada como clip.

---

## 2. Achados verificados

### F01 · Nav lotada de novo (CONFIRMADO · regressão vs R05)
`index.html`: 8 itens primários (Plataforma, VoiceAI, Agentio, IA sem censura, Segurança, Implantação, Planos, Manifesto) + 3 badges `<small>` ("powered by xAI", "by Nous", "novo") + Entrar + bandeira PT. A auditoria pedia ≤7 itens com Manifesto/Fundador no rodapé; Agentio e IA sem censura reengordaram a barra. O grok-4.7 apontou o mesmo problema em **todas as 9 páginas** — é o achado nº 1 da reavaliação.
**Correção:** badges de parceiro saem da linha principal (title/tooltip, ou linha secundária no hover); Manifesto volta ao rodapé; "Segurança" e "Implantação" (âncoras da home) viram um item "Plataforma ▾".

### F02 · "Texto cortado no mobile" — REFUTADO
O grok-4.7 alegou clipping de texto na borda direita em 390px em todas as páginas ("IA pessoa…", "Contratada em minu…"). A sonda (`scripts/overflow-probe.html`, iframe 390px, `scrollWidth` do documento e dos piores elementos) mediu **overflow = não nas 14 páginas** (docW 375px = 390 − scrollbar). Texto display justificado/justificado à esquerda em Unbounded (fonte larga) gera a ilusão. Nenhuma ação; registro importante para calibrar futuras análises de visão.

### F03 · `ia-sem-censura.html` sem menu mobile — **RETIFICADO: falso positivo da sonda**
A primeira rodada da sonda procurava `.menu-toggle` (classe do site principal); esta página usa `.menu-t` (comportamento próprio em `ia-sem-censura.js`, exibido abaixo de 1240px). Rodada corrigida da sonda: **menu visível a 390px nas 14 páginas**, zero overflow. Nenhuma ação necessária; RA1 cancelado. (A sonda em `scripts/overflow-probe.html` agora cobre ambos os seletores e resolve caminhos a partir de qualquer diretório.)

### F04 · Padrões de pontos pintando SOBRE o texto (CONFIRMADO · CSS)
`manifesto-preview::before`, `contact-pattern`, `brazil-commitment::before` etc. são camadas `position:absolute` com dot-grid — elementos posicionados pintam **acima** de texto estático. No manifesto o grok viu a retícula furando os glifos do wordmark; na home, pontos atravessando o parágrafo do hero. Opacidade baixa (0,2–0,25) mascara, mas não elimina.
**Correção:** `z-index:-1` (ou mover o padrão para `background-image` do container) nas camadas decorativas que dividem espaço com texto.

### F05 · H1 "fantasma" na ia-sem-censura (INCONCLUSIVO · provável artefato)
O h1 usa `color: var(--text-strong)` sólido + reveal (`.rv d1`) + gradiente na segunda linha. A captura pegou a linha 2 quase invisível — ou o reveal ainda não tinha terminado no momento do screenshot, ou o gradiente `white→blue` escurece demais em parte do texto em telas 1440. **Ver ao vivo em 1440px**; se for o gradiente, garantir trecho inicial ≥70% branco.

### F06 · FAB "Suporte 24/7" sobre conteúdo (CONFIRMADO · tradeoff consciente)
`.wa-float` é `fixed` bottom-right z-90 em todas as páginas públicas — cobre o canto inferior direito de cards/CTAs em viewports baixas (grok viu sobre o card Dedicado R$ 19.900 em Planos e sobre o campo de e-mail em Cadastro). O comentário do CSS mostra que o comportamento é intencional (menu cobre o FAB).
**Correção (opcional):** exibir só após primeiro scroll (padrão Linear/Stripe) ou reservar padding inferior nas seções com CTA na dobra.

### F07 · Contraste do corpo (REFUTADO como falha · nuance real)
`--muted #a9b4c6` sobre `--abyss #05070b` = **9,5:1** — AA folgado. A impressão de "texto fraco" vem de (a) fundos texturizados/pontos sob o texto e (b) rótulos mono 11px. Ação barata: subir kickers para 12px e limpar padrões sob parágrafos (já coberto por F04).

### F08 · Assets e performance (Saudável · 1 pendência)
Fontes de identidade 49,7 KB + 23,0 KB (woff2, subset latin) ✅ · selos webp 5,7/10,3 KB ✅ · home HTML 52,9 KB ✅ · styles.css 125,6 KB (gzip resolve; ok). O WASM de OCR (3,8 MB + 1,4 MB traineddata) só entra no chat sob demanda — confirmar que continua lazy ao adicionar features.
**Pendência:** re-medir Lighthouse da voice após merge do PR #88 (orbs lazy: 7→1 contexto WebGL na carga, verificado).

### F09 · Home ainda longa (mantém R07 da auditoria)
23 "telas". A análise por seções (`grok-vision-home-secoes.md`) confirma: #plataforma e #seguranca fortes; #mentoria e #contato repetem o padrão hero+cards com pouca variação de ritmo. A recomendação R07 segue valendo: home enxuta (hero + portas por persona + prova + CTA) e `/empresas` dedicada.

### F10 · Quick wins transversais do grok-4.7 (válido)
1. Um CTA primário por dobra (hoje: "Criar conta grátis" + "Ver mentoria" + "Ver os dois caminhos" no mesmo plano).
2. Unificar linguagem de badge (hoje: pill, mono-small e script "NOUS" convivem).
3. Subnav da ia-sem-censura recolhida no scroll + rótulos ≥12px.

---

## 3. Matriz priorizada (atualização da §7 da auditoria)

| ID | Ação | Base | Impacto | Esforço |
|---|---|---|---|---|
| RA2 | Nav: tirar badges da linha, ≤7 itens, Manifesto→rodapé | F01 | 4 | S |
| RA3 | Camadas de pontos sob o texto (z-index) | F04+F07 | 3 | S |
| RA4 | Merge PR #88 + re-medir Lighthouse voice/home | F08 | 4 | S |
| RA5 | ~~FAB só após primeiro scroll~~ **✅ feito — PR #90, merged** | F06 | 2 | S |
| RA6 | Verificar h1 gradiente da ia-sem-censura em 1440 | F05 | 2 | S |
| RA7 | ~~Home enxuta + `/empresas`~~ **✅ feito — PR #91, merged** | F09 | 3 | L |
| RA8 | Kickers mono 11→12px + badge única (badge já saiu no PR #89) | F10 | 2 | S |

---

## 4. O que melhorou desde 22/09 (verificado)

Stripe = "TRUSTIO IA" no checkout (era "JUICYSCORE") · CNPJ/razão social no rodapé · contador sintético removido · âncoras do seats corrigidas · menu encurtado na época (regrediu depois, F01) · site bilíngue · VoiceAI sem link morto · cache de assets + preload do hero (#fda2b2d).

## 5. Arquivos desta reavaliação

- `grok-vision-analises.md` — análise visual por página (grok-4.7)
- `grok-vision-home-secoes.md` — seções da home (grok-4.7)
- `screenshots/reav-2026-10/` — 24 capturas (d-* desktop, m-* mobile, d-index-* seções)
- `scripts/overflow-probe.html` — sonda de overflow reutilizável (`python3 -m http.server` na raiz + abrir com Chrome headless `--dump-dom`)

Custo da análise grok-4.7: ~US$ 2,10 (≈49k tokens de imagem + 4,4k de saída).


---

## 6. Execução (01/10, noite) — o que saiu da matriz e foi ao ar

| Item | PR | Estado |
|---|---|---|
| RA2 · badges fora da nav | #89 | **no ar** |
| RA3 · padrões sob o texto | #89 | **no ar** |
| RA6 · gradiente do h1 estável | #89 | **no ar** |
| Orbs WebGL lazy (R20/PR88) | #88 | **no ar — Lighthouse voice 38 → 90** (LCP 6,6s → 2,9s; TBT 160ms; CLS 0) |
| RA5 · FAB só após scroll | #90 | **no ar** |
| RA7 · home enxuta + /empresas | #91 | **no ar** (home 13→6 seções; /empresas PT+EN; ids preservados; sitemap 27 URLs) |
| og:image por página (grok-imagine-image-2.0) | #91 | **no ar** (6 artes 1280×720; custo US$ 2,40) |

Notas de execução: F03 retificado (menu mobile existia — falso positivo da sonda);
clamp do h1 mobile ajustado 13.12vw→12.4vw após sonda de clip interno acusar
vazamento de 5px em 390px; custos grok-4.7 na análise ≈ US$ 2,10.


## 7. Separação B2C × B2B — conclusão do arco (PR #92, merged)

Com o RA7 faltava o último passo: **voz e navegação** separadas.
- Home 100% B2C na dobra: "Sua IA privada e sem censura*. Sob seu controle." + CTAs criar conta/ver planos; B2B vira banda discreta abaixo da dobra
- Navs por público: B2C (5 itens + Criar conta grátis) × B2B em /empresas, voice e jurídico (Plataforma · VoiceAI · Segurança · Implantação · Planos + Falar com um arquiteto)
- Rodapé por audiência: PARA VOCÊ · PARA EMPRESAS · INSTITUCIONAL
- grok-4.7 sobre o /empresas pós-separação: **8/10** — "um mundo B2B coerente"
- Placar visual estimado do arco completo: 55 (véspera do lançamento) → **~72**


## 8. LEDs do hero reativos (PR #93, merged)

Upgrade do campo de LEDs da home (TrustioDotField): halo persistente no
cursor (~230px), energia de scroll (cada pixel rolado carrega o campo,
fade ~1s — no celular é o scroll que acende o fundo), constelação de
linhas junto ao cursor, grade ~2,4× mais densa e blend aditivo neon.
Verificação funcional por sonda (pixels do canvas): halo 3,4× mais
brilhante no ponteiro; energia do scroll 2,3× no campo. Grok-4.7:
nova 8/10 vs 7,5 ("mais moderna e premium"). Trade-off registrado:
brilho compete um pouco com o título; mitigação de 1 linha se pesar.


## 9. Vitrine VoiceAI na home (PR #94, merged)

VoiceAI volta ao menu B2C ("VoiceAI · para empresas") e ganha bloco na
home com orb de exemplo — mesmo shader do /voice.html, decorativo,
lazy (contexto WebGL só a ~320px da viewport) e clicável (→ /voice).
Verificação por CDP com scroll real: orb nasce no scroll (canvas 1);
bug de overflow mobile pego e corrigido no caminho (replace de nav
vazando para o rodapé: nowrap 168px → docW 484 → corrigido para 390).
grok-4.7: 7/10 ("presença premium").
