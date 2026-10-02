# Análise visual por página — grok-4.7 (visão) · 2026-10-01

Capturas: acima da dobra, desktop 1440px e mobile 390px, site ao ar.

## Home (hero)

## Auditoria visual — Home (hero), Trustio 2.0

### 1. Notas
- **Hierarquia visual — 6/10.** O título domina; a nav e três CTAs no mesmo plano competem com ele.
- **Tipografia — 7/10.** Display grande funciona; rótulos da nav (XAI, NOUS, NOVO) e o texto legal ficam pequenos e inconsistentes.
- **Espaçamento/alinhamento — 4/10.** Faixa de CTAs irregular; no mobile o conteúdo estoura a direita.
- **Contraste/legibilidade — 5/10.** Branco/azul no preto ok; cinza do parágrafo some sob a grade de pontos.
- **Coesão de marca — 5/10.** Trustio disputa espaço com VoiceAI, XAI, Agentio e Nous na mesma barra.
- **Adaptação mobile — 3/10.** Título, eyebrow, corpo e badge são cortados na borda.

### 2. Três problemas que aparecem na captura
1. **Mobile 390px:** “IA pessoal e empresarial. / Sob seu controle.” não quebra — lê-se “IA pessoa…”, “empresari…”, “Sob seu…”. O mesmo corte atinge “INFRAESTRUTURA… NO B…”, o parágrafo e o badge **SERVIÇO PAGO**.
2. **Nav desktop:** sete itens + três badges (POWERED BY XAI, BY NOUS, NOVO) comprimidos entre logo e “Entrar”; a hierarquia de produto some.
3. **Faixa de CTAs:** “Criar conta grátis”, “Ver mentoria e implantação” (badge + seta) e “Ver os dois caminhos ↓” têm pesos e alinhamentos diferentes; a grade de pontos atravessa o parágrafo central.

### 3. Quick wins (hoje)
1. No mobile, `overflow-wrap` + escala do título (~clamp) e `padding` lateral; esconder pontos e “+” abaixo de 768px.
2. Nav: no máximo cinco links; VoiceAI/Agentio e selos de parceiro saem para um menu “Produtos”.
3. Um CTA primário; mentoria vira link secundário sem badge+seta duplicados; subir o cinza do parágrafo para ~70% de branco.

---

## VoiceAI (hero + orb)

## Auditoria visual — VoiceAI (acima da dobra)

### 1. Notas
- **Hierarquia visual — 6/10.** O título branco/azul segura a esquerda, mas nav, play, FAB verde e card “Tecnologia” disputam o mesmo plano.
- **Tipografia — 6/10.** Display do headline funciona; rótulos mono são coerentes, mas “NOUS” em script e badges mistos quebram o sistema.
- **Espaçamento/alinhamento — 4/10.** Chip órfão, play sobre a esfera e colisão no rodapé da dobra.
- **Contraste/legibilidade — 5/10.** Corpo ok; microtextos cinza (“TOQUE NA ESFERA”, “POWERED BY”) somem; no mobile o quote é cortado.
- **Coesão de marca — 6/10.** Azul sobre preto é claro; o FAB verde e três linguagens de badge fogem da identidade.
- **Adaptação mobile — 3/10.** Orb sobe antes do valor; headline e quote saem da viewport.

### 2. Três problemas que estão na captura
1. **Quote e caption no mobile não quebram linha:** “Achei seu pedido: sai”, “rastreio no seu W” e “OUVIR A BRU” são cortados na borda direita.
2. **Dois affordances na esfera + colisão no fold (desktop):** o play azul cobre a borda da orb enquanto o rótulo manda “toque na esfera”; o FAB “Suporte 24/7” cobre “Criar um agente assim”, e a tabela MODELO/MODO/LATÊNCIA entra cortada.
3. **Grupo de personas desalinhado:** “Calma ORIGINAL” fica órfão, centralizado sob Bruna/Matheus, fora da fileira.

### 3. Quick wins (hoje)
1. No mobile, `overflow-wrap` no quote/caption e **headline antes da orb**; reduzir o orb para a proposta caber na dobra.
2. Tirar o play da borda (um só gesto: toque na esfera) e afastar o FAB do CTA inferior, ou só exibi-lo após scroll.
3. Uma única fileira de chips com wrap à esquerda; unificar badges da nav num só estilo (pill ou mono), sem script.

---

## Planos

## Auditoria visual — Planos (Trustio 2.0)

### 1. Notas
- **Hierarquia visual: 6/10** — O título em duas cores funciona, mas badges da nav, “SEM CENSURA” e o FAB competem com os planos.
- **Tipografia: 5/10** — Escala do título ok no desktop; no mobile quebra. Rótulos não leem como Martian Mono; nav mistura peso, badge e cor.
- **Espaçamento/alinhamento: 4/10** — Chips irregulares, cards cortados na dobra, preços sem baseline comum, FAB invade o card.
- **Contraste/legibilidade: 6/10** — Título branco ok; corpo cinza, chips e “SEM CENSURA” ficam fracos no preto.
- **Coesão de marca: 6/10** — Azul + escuro coerentes; verde do “SEM CENSURA”, badges XAI/NOUS/NOVO e o FAB verde fragmentam a identidade.
- **Adaptação mobile: 3/10** — Overflow horizontal e navegação ausente.

### 2. Problemas que estão na captura
1. **Mobile 390px:** “Contratada em minu…”, o parágrafo, “APPL…”, “NOTA FISCAL E REC…” e o texto do card Starter são cortados na borda direita.
2. **Desktop:** o botão verde “Suporte 24/7” cobre o canto do card **Dedicado** (R$ 19.900).
3. **Nav:** no desktop, “POWERED BY XAI”, “NOUS” e “NOVO” disputam o item ativo “Planos”; no mobile só restam logo e bandeira — sem controle de menu visível.

### 3. Quick wins (hoje)
1. Corrigir o container mobile (padding lateral + `min-width: 0` / quebra real), para o H1 e os chips caberem sem corte.
2. Subir o FAB para `bottom` com `z-index` fora dos cards, ou encurtar a grade para não colidir com Dedicado.
3. Trocar o par “Para empresas / Para você” por um segmented control de mesma altura e recolher badges da nav a um único menu.

---

## Agentio

## Auditoria visual — Agentio (acima da dobra)

### 1. Notas
- **Hierarquia — 6/10.** O título Unbounded domina, mas a nav cheia de badges, o card de chat e o pill “Suporte 24/7” disputam o mesmo peso.
- **Tipografia — 6/10.** Display forte; rótulos rastreados (“NO WHATSAPP E NO TELEGRAM”) ficam pequenos demais e, no mobile, o parágrafo quebra fora da tela.
- **Espaçamento/alinhamento — 5/10.** Nav encostada à direita; no desktop as três colunas têm alturas desiguais; no mobile o texto não cabe na largura.
- **Contraste/legibilidade — 6/10.** Branco e azul ok; corpo e microcopy cinza sobre preto perdem leitura, sobretudo o parágrafo e o status “online”.
- **Coesão de marca — 7/10.** Escuro + azul Trustio coerentes; verde do WhatsApp, pill flutuante e badges “POWERED BY / NOVO / NOUS” fragmentam a identidade 2.0.
- **Mobile — 4/10.** Sem menu visível (só logo e bandeira); copy cortada; título quebra em “seu / WhatsApp.”

### 2. Três problemas vistos
1. **Mobile, parágrafo sob o H1:** “Converse com o nosso agente…” é cortado na borda direita (“e”, “sob”, “lugar”).
2. **Nav desktop:** VoiceAI + “POWERED BY XAI”, “IA sem censura NOVO” e Agentio + NOUS comprimem Entrar/PT no limite dos 1440px.
3. **Pill verde “Suporte 24/7”** sobrepõe a zona do card e compete com o CTA azul “Testar 3 dias no WhatsApp”.

### 3. Quick wins (hoje)
1. `overflow-wrap` + largura máxima no parágrafo mobile; revisar o break do H1 para não isolar “seu”.
2. Esconder na nav itens secundários (Segurança, Implantação, Manifesto) atrás de um menu; tirar badges da linha principal.
3. Subir o cinza do corpo para ~#C8CDD6 e rebaixar ou remover o pill flutuante enquanto o CTA principal estiver no primeiro viewport.

---

## IA sem censura

## Auditoria visual — IA sem censura

### 1. Notas
- **Hierarquia visual — 3/10.** No desktop o título some; o que resta acima da dobra é nav + vazio.
- **Tipografia — 5/10.** Display grande existe, mas não lê; rótulos mono estão pequenos demais para o peso que carregam.
- **Espaçamento/alinhamento — 4/10.** Desktop: oceano de vazio. Mobile: texto encosta e sai da viewport.
- **Contraste/legibilidade — 3/10.** Headline desktop é cinza-fantasma sobre preto; subnav quase ilegível.
- **Coesão de marca — 6/10.** Azul + logo + botão pill são consistentes; a página não entrega a voz “Trustio 2.0”.
- **Adaptação mobile — 3/10.** Overflow horizontal corta headline, corpo e subnav.

### 2. Três problemas que estão na captura
1. **Headline desktop** (“IA sem censura. Não é IA sem regras.”) está com opacidade tão baixa que a mensagem principal não existe acima da dobra.
2. **Mobile 390px:** “Não é IA sem reg”, o parágrafo (“filtro de conte…”) e “EXPLICADA” / “Como func” são cortados na borda direita — não é quebra, é clip.
3. **Duas barras de nav** no desktop (principal + “O que é / Na prática / …”) competem; a segunda é micro e de baixo contraste, enquanto o hero fica vazio. O “+” decorativo à esquerda não ancora nada.

### 3. Quick wins (hoje)
1. Subir opacidade do display desktop para branco/azul sólido (o mesmo contraste do mobile) e reduzir o vazio vertical ~30%.
2. Mobile: `overflow-x: hidden` não basta — reduzir tracking do título, padding lateral ≥16px e `overflow-wrap` no corpo para nada cortar.
3. Fundir ou recolher a subnav no scroll; aumentar rótulos mono para ≥12px e contraste ≥4.5:1. O pill “Criar conta grátis” já funciona — não duplicar três CTAs empilhados sem hierarquia clara.

---

## Jurídico

## Auditoria visual — Jurídico (Trustio 2.0)

### 1. Notas
- **Hierarquia visual — 6/10.** O título domina, mas chips flutuantes, badges da nav e o FAB competem no mesmo plano.
- **Tipografia — 6/10.** Unbounded no título funciona; no mobile a quebra parte “Sob seu / controle.” e o corpo não respeita a caixa.
- **Espaçamento/alinhamento — 4/10.** Texto cortado à direita no 390px; FAB sobre o card; chips colados ao mock de petição.
- **Contraste/legibilidade — 5/10.** “revisão 3”, “Ver como funciona” e o azul claro do gradiente perdem no preto.
- **Coesão de marca — 6/10.** Azul + escuro coesos; verde do WhatsApp, bandeira e três estilos de badge fragmentam.
- **Adaptação mobile — 3/10.** Sem controle de menu; parágrafo transborda; cards cortados na dobra.

### 2. Problemas que aparecem na captura
1. **Corpo no mobile** (“Pesquisa, jurisprudência…”) não quebra: “agente”, “infraestrutur”, “governanç” saem da viewport.
2. **Header mobile** só tem logo e bandeira — não há menu; a nav de desktop some.
3. **FAB “Suporte 24/7”** cobre o card **“Sem lock-in”**; no desktop os chips **“Prazo calculado”** e **“Cláusula de risco”** invadem o mock **“Petição inicial · minuta”**.

### 3. Quick wins
1. `overflow-wrap` + padding lateral no parágrafo; travar a quebra do título em duas linhas (“IA jurídica.” / “Sob seu controle.”).
2. Menu hamburger no 390px; esconder itens secundários (VoiceAI, Agentio, Manifesto) abaixo de ~1100px.
3. Subir o FAB acima da faixa de selos (ou `margin-bottom` na faixa) e clarear rótulos secundários para ≥4.5:1 (`revisão 3`, link “Ver como funciona”).

---

## Cadastro

## Notas

- **Hierarquia visual — 6/10.** O título Unbounded domina, mas a nav lotada e o FAB competem com o formulário, que é a tarefa da página.
- **Tipografia — 6/10.** Títulos e rótulos mono estão coerentes; o corpo cinza é longo demais e, no mobile, não quebra.
- **Espaçamento/alinhamento — 4/10.** Badges colidem na nav; o botão verde cobre o campo de e-mail; o hero estoura a viewport de 390px.
- **Contraste/legibilidade — 5/10.** Branco no título ok; parágrafo e “Estado de hoje” ficam fracos, e as linhas do grid atravessam o texto.
- **Coesão de marca — 6/10.** Tema escuro e tipo de identidade seguram; verde do WhatsApp e selos “POWERED BY XAI” / “BY NOUS” quebram o sistema.
- **Adaptação mobile — 3/10.** Headline e parágrafo são cortados na borda direita; não há menu visível, só logo e bandeira.

## 3 problemas vistos

1. **Mobile:** “Crie sua conta ago” / “O chat já está aber” e o parágrafo (“dados no Brasil. A”, “confirma o e-mail e ent”) são clipados, sem wrap.
2. **Nav desktop:** “POWERED BY XAI” e “BY NOUS” sobrepõem VoiceAI e Agentio; “NOUS” aparece cortado na vertical.
3. **FAB “Suporte 24/7”** encosta no card “Criar conta” e cobre a borda do campo `voce@exemplo.com`.

## Quick wins

1. Hero mobile: `overflow-wrap`, `max-width: 100%` e título em ~32–36px; encurtar o parágrafo para 2 linhas.
2. Subir o z-index do card e afastar o FAB (`bottom` + `right`) para não cruzar o formulário.
3. Nav: esconder selos em &lt;1280px, tirar as linhas do grid de cima do texto e subir o corpo para ~`#C9D0DC`.

---

## Modelos

## Auditoria — Modelos (desktop 1440)

Só a captura desktop foi anexada; mobile (390) não entra na nota.

### 1. Notas
- **Hierarquia visual: 5** — o hero compete com uma nav cheia de selos (`POWERED BY XAI`, `BY NOUS`, `NOVO`) no mesmo peso dos links.
- **Tipografia: 6** — título Unbounded funciona; o parágrafo centralizado é longo demais e os rótulos mono se repetem sem escala.
- **Espaçamento/alinhamento: 4** — faixa morta entre as pills e `CONTINUE PARA EXPLORAR`; `+` soltos fora de qualquer coluna.
- **Contraste/legibilidade: 6** — título branco ok; breadcrumb azul, pills outline e microcopy azul somem no preto.
- **Coesão de marca: 5** — tema escuro segura; verde do WhatsApp e três linguagens de badge quebram o sistema.
- **Adaptação mobile: —** — sem a segunda captura, não avalio.

### 2. Problemas que vejo
1. Nav: `VoiceAI POWERED BY XAI`, `Agentio BY NOUS` e `IA sem censura NOVO` disputam a mesma linha que `Entrar`.
2. Dois `+` (meio-esquerda e baixo-direita) não alinham a logo, título nem pills.
3. O pill verde `Suporte 24/7` senta na mesma linha de `MODELOS / BR`, sobre a régua do rodapé.

### 3. Quick wins
1. Tirar selos de parceiro da nav (tooltip ou linha secundária) e ganhar respiro até `Entrar`.
2. Cortar o parágrafo a duas linhas, largura ~62ch, e subir o azul do breadcrumb para branco 70%.
3. Subir `CONTINUE PARA EXPLORAR`, remover os `+` e deslocar o WhatsApp 16px acima da régua.

---

## Manifesto

A captura mobile não veio no anexo; a nota de adaptação é inferida só pela densidade do desktop.

### 1. Notas
- **Hierarquia visual — 6/10:** o título domina, mas a nav e a tríade de valores competem no mesmo peso visual, sem próximo passo.
- **Tipografia — 6/10:** display grande funciona; rótulos mono e a linha de valores estão pequenos e fracos demais para o papel que têm.
- **Espaçamento/alinhamento — 5/10:** hero com vazio vertical excessivo; nav sem respiro; “+” decorativos não ancoram em nenhum eixo do conteúdo.
- **Contraste/legibilidade — 4/10:** subtítulo e `CONFIANÇA · LIBERDADE · PROPÓSITO` em cinza sobre quase-preto, ainda por cima sobre o campo de pontos.
- **Coesão de marca — 5/10:** azul/preto coerente, mas o pill verde do WhatsApp, a bandeira e os badges (`POWERED BY XAI`, `BY NOUS`, `NOVO`) fragmentam a identidade.
- **Adaptação mobile — 3/10 (inferida):** uma faixa com 9+ itens e badges não cabe em 390px sem quebra ou overflow.

### 2. Problemas vistos
1. **Nav superior:** `VoiceAI POWERED BY XAI`, `Agentio BY NOUS` e `IA sem censura NOVO` no mesmo peso dos itens primários; o estado ativo de `Manifesto` é só um fio.
2. **Wordmark `Manifesto`:** a retícula de pontos atravessa os glifos (pior em `festo`), furando a haste e sujando o degradê branco→azul.
3. **`CONFIANÇA · LIBERDADE · PROPÓSITO`:** cinza, tracking largo, sentado no mesmo campo de pontos do título — lê como ornamento, não como conteúdo.

### 3. Quick wins
1. Nav: no máximo 5 itens; badges só em hover ou numa linha secundária; ativo com peso + cor, não só sublinhado.
2. Tirar os pontos de dentro das letras; deixá-los só no fundo, atrás do wordmark. Subtítulo para um cinza mais claro (~`#C9D2DE`).
3. Tríade: mono maior, contraste alto, agrupada logo abaixo do subtítulo, sem pontos por baixo. Pill do WhatsApp para contorno azul, fora do canto do hero.

---

