#!/usr/bin/env python3
"""Generate design-system/ : sync-ready preview cards for claude.ai/design (/design-sync)."""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DS = ROOT / "design-system"
CSS = (ROOT / "assets/styles.css").read_text()

def token_block(selector):
    m = re.search(re.escape(selector) + r" \{\n(.*?)\n\}", CSS, re.S)
    out = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if line.startswith("--") and ":" in line:
            k, v = line.split(":", 1)
            out[k.strip()] = v.strip().rstrip(";")
    return out

dark = token_block(":root")
light = token_block(':root[data-theme="light"]')

# ---------------- tokens.json (W3C Design Tokens, composite values kept whole) ----------------
def group(prefix_re, typ):
    return {k[2:]: {"$value": v, "$type": typ} for k, v in dark.items() if re.match(prefix_re, k)}

tokens = {
    "$schema": "https://tr.designtokens.org/format/",
    "$description": "Trustio — tokens extraídos de assets/styles.css. Valores compostos (container, cta-gradient, gradientes de card) são tokens compostos, não primitivos.",
    "color": {k[2:]: {"$value": v, "$type": "color"} for k, v in dark.items()
              if re.match(r"--(blue|navy|abyss|surface|ice|white|muted|line|label-color|text-strong|surface-deep|scroll|text-gradient)", k)
              and "rgb," not in v and "var(" not in v},
    "color-rgb": {k[2:]: {"$value": v, "$type": "string", "$description": "Canal RGB para rgba(var(--x), alpha)"} for k, v in dark.items() if k.endswith("-rgb")},
    "gradient": {k[2:]: {"$value": v, "$type": "gradient", "$extensions": {"composite": True}} for k, v in dark.items() if "gradient" in v},
    "layout": {"container": {"$value": dark["--container"], "$type": "dimension", "$extensions": {"composite": True, "note": "min(1180px, calc(100vw - 48px)) — largura fluida com sarjeta de 24px por lado"}}},
    "font": {k[2:]: {"$value": v, "$type": "fontFamily"} for k, v in dark.items() if k in ("--display", "--body", "--mono", "--serif")},
    "type": {k[2:]: {"$value": v, "$type": "dimension"} for k, v in dark.items() if k in ("--label", "--label-lg")},
    "spacing": {k[2:]: {"$value": v, "$type": "dimension"} for k, v in dark.items() if k.startswith("--space-")},
    "radius": {k[2:]: {"$value": v, "$type": "dimension"} for k, v in dark.items() if k.startswith("--radius")},
    "shadow": {"shadow": {"$value": dark["--shadow"], "$type": "shadow", "$extensions": {"composite": True}}},
    "motion": {"ease": {"$value": dark["--ease"], "$type": "cubicBezier"}},
    "z-index": {k[2:]: {"$value": v, "$type": "number"} for k, v in dark.items() if k.startswith("--z-")},
    "themes": {
        "dark": {"$description": "Padrão da marca (html sem data-theme)."},
        "light": {"$description": "Opt-in via html[data-theme=light]; sobrescreve os tokens abaixo.",
                  "overrides": {k[2:]: v for k, v in light.items()}},
    },
}
DS.mkdir(exist_ok=True)
(DS / "tokens.json").write_text(json.dumps(tokens, ensure_ascii=False, indent=2) + "\n")

# ---------------- preview scaffolding ----------------
HEAD = """<!-- @dsCard group="{group}" -->
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="robots" content="noindex">
  <title>{title} · Trustio DS</title>
  <script src="../../assets/theme.js"></script>
  <link rel="stylesheet" href="../../assets/styles.css">
  <link rel="stylesheet" href="../ds.css">
</head>
<body class="ds-body">
<main class="ds-frame">
  <header class="ds-head">
    <p class="eyebrow">{group} · {title}</p>
    <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Ativar tema claro" title="Alternar tema">
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </button>
  </header>
  <p class="ds-note">{note}</p>
{body}
</main>
<script src="../ds.js"></script>
</body>
</html>
"""

cards = []  # (path, group, title, subtitle, width)
def card(path, group, title, subtitle, note, body, width=900):
    p = DS / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(HEAD.format(group=group, title=title, note=note, body=body))
    cards.append((path, group, title, subtitle, width))

def swatches(pairs):
    return "<div class=\"ds-swatches\">" + "".join(
        f'<figure class="ds-swatch"><i style="--sw: var({k})"></i><figcaption><b>{k}</b><span>{v}</span></figcaption></figure>'
        for k, v in pairs) + "</div>"

# ---------------- Fundamentos ----------------
color_keys = ["--blue", "--blue-signal", "--blue-mid", "--blue-deep", "--navy", "--abyss", "--surface", "--surface-raised",
              "--surface-blue", "--surface-deep", "--ice", "--white", "--text-strong", "--muted", "--muted-strong", "--label-color", "--line", "--line-bright"]
card("fundamentos/cores.html", "Fundamentos", "Cores", "18 tokens · escuro e claro",
     "Os mesmos tokens em ambos os temas. Alterne o tema para ver os valores claros; o valor escrito é o do tema escuro.",
     swatches([(k, dark[k]) for k in color_keys]) +
     "<h3 class=\"ds-h\">Gradientes compostos</h3>" +
     "<div class=\"ds-swatches\">" + "".join(
         f'<figure class="ds-swatch ds-swatch-wide"><i style="--sw: var({k})"></i><figcaption><b>{k}</b><span>{v}</span></figcaption></figure>'
         for k, v in dark.items() if "gradient" in v) + "</div>" +
     "<h3 class=\"ds-h\">Texto em gradiente</h3><p class=\"text-gradient ds-display\">Infraestrutura privada de IA</p>")

card("fundamentos/tipografia.html", "Fundamentos", "Tipografia", "Geist · Geist Mono · Instrument Serif",
     "Famílias hospedadas localmente (OFL). Piso tipográfico: 11px em rótulos mono, 12px em qualquer coisa clicável.",
     """<div class="ds-type">
  <p class="ds-display" style="font-family: var(--display)">Display · Geist 700 · -0.03em</p>
  <h1 style="font-size: clamp(54px, 6.3vw, 94px); letter-spacing: -0.055em">Soberania de dados</h1>
  <h2>H2 · Geist 700</h2>
  <h3>H3 · Geist 700</h3>
  <p style="font-size: 18px">Body 18 · Geist 400 · line-height 1.6 — modelos, dados e processos corporativos em uma infraestrutura privada.</p>
  <p>Body 16 · Geist 400 — texto corrido padrão do site.</p>
  <p class="ds-serif">Instrument Serif itálico · usado em citações e no manifesto.</p>
  <p class="eyebrow"><span class="status-dot"></span>Rótulo mono 11px · 0.15em · uppercase</p>
  <p class="ds-mono">Geist Mono 12px · --label-lg · painel de servidor e API</p>
</div>""")

card("fundamentos/espacamento.html", "Fundamentos", "Espaçamento", "Escala declarada · 16 passos",
     "Escala derivada da frequência real de uso no CSS e agora declarada em :root como --space-N (N = valor em px). Padding, margin e gap usam os tokens.",
     "<div class=\"ds-space\">" + "".join(
         f'<div class="ds-space-row"><code>--space-{n}</code><i style="width: {n}px"></i><span>{n}px</span></div>'
         for n in [4, 8, 12, 16, 20, 24, 28, 32, 36, 44, 48, 60, 68, 90, 120, 140]) + "</div>" +
     "<h3 class=\"ds-h\">Layout</h3><p><code>--container</code> = <code>" + dark["--container"] + "</code> — largura fluida, sarjeta de 24px por lado.</p>"
     "<p><code>--radius</code> = 20px · <code>--radius-large</code> = 32px · botões 12px · chips 999px.</p>")

card("fundamentos/tema.html", "Fundamentos", "Tema claro e escuro", "Escuro padrão · claro opt-in",
     "O escuro é a identidade. O claro é ativado pelo alternador no cabeçalho, persiste em localStorage (trustio-theme) e aplica html[data-theme=light]. Sem flash: theme.js roda antes do CSS.",
     """<div class="ds-theme-grid">
  <section class="metric-card"><span class="metric-value">99,9%</span><span class="metric-label">Disponibilidade contratual</span></section>
  <section class="ds-stack">
    <a class="button button-primary" href="#">Primário</a>
    <a class="button button-ghost" href="#">Ghost</a>
    <a class="button button-outline" href="#">Outline</a>
    <a class="button button-light" href="#">Light</a>
  </section>
  <section class="ds-stack"><p class="section-kicker"><span class="status-dot"></span>Kicker</p><p>Texto corrido com <a class="text-link" href="#">link em linha <span aria-hidden="true">→</span></a>.</p><p class="insight-line">Linha de insight mono · --label-color</p></section>
</div>""")

# ---------------- Componentes ----------------
card("componentes/botoes.html", "Componentes", "Botões", "Primário / ghost / outline / light · 2 tamanhos",
     "Base .button (52px, raio 12px, Geist 600 15px). Variantes por modificador; .button-small reduz para 44px. Setas em span[aria-hidden] animam no hover.",
     """<div class="ds-stack">
  <a class="button button-primary" href="#">Falar com a Trustio <span aria-hidden="true">↗</span></a>
  <a class="button button-ghost" href="#">Ver planos</a>
  <a class="button button-outline" href="#">Documentação</a>
  <a class="button button-light" href="#">Agendar diagnóstico</a>
</div>
<div class="ds-stack">
  <a class="button button-small button-primary" href="#">Pequeno primário</a>
  <a class="button button-small button-ghost header-cta" href="#">Pequeno ghost (cabeçalho)</a>
  <a class="button button-small button-outline" href="#">Pequeno outline</a>
  <button class="button button-primary" type="button" disabled style="opacity:.5;pointer-events:none">Desabilitado</button>
</div>""")

card("componentes/cards.html", "Componentes", "Cards", "Metric · Pillar · Card clicável",
     "Superfícies com --card-gradient* e borda --line. .has-link + .card-link torna o card inteiro clicável sem aninhar links. .has-insight revela o bloco .insight no hover/foco.",
     """<div class="ds-grid-3">
  <article class="metric-card has-insight has-link"><span class="metric-value">3×</span><span class="metric-label">menor custo por token</span>
    <div class="insight"><p class="insight-label">Como medimos</p><p>Comparado à média das APIs públicas em pt-BR.</p><div class="insight-chips"><span>LLM</span><span>RAG</span></div></div>
    <a class="card-link" href="#" aria-label="Abrir métrica"></a></article>
  <article class="metric-card"><span class="metric-value">100%</span><span class="metric-label">dados em território nacional</span><p class="insight-line">LGPD · ANPD · ISO 27001</p></article>
  <article class="metric-card"><span class="metric-value">24/7</span><span class="metric-label">operação assistida</span></article>
</div>
<div class="pillar-cards" style="margin-top: var(--space-32)">
  <article class="pillar-card" style="min-height: 320px"><span class="pillar-symbol">01</span><p class="pillar-number">01</p><h3 style="margin-top: 120px; font-size: 30px">Soberania</h3><p>Modelos e dados sob controle da empresa.</p></article>
  <article class="pillar-card" style="min-height: 320px"><span class="pillar-symbol">02</span><p class="pillar-number">02</p><h3 style="margin-top: 120px; font-size: 30px">Segurança</h3><p>Rede privada, criptografia e auditoria.</p></article>
  <article class="pillar-card" style="min-height: 320px"><span class="pillar-symbol">03</span><p class="pillar-number">03</p><h3 style="margin-top: 120px; font-size: 30px">Liberdade</h3><p>Sem lock-in de fornecedor.</p></article>
</div>""", width=1100)

card("componentes/rotulos.html", "Componentes", "Rótulos e chips", "Eyebrow · kicker · tag · chips · status",
     "Todos partilham a mesma regra mono 11px uppercase 0.15em em --blue-signal. .status-dot pulsa (desliga com prefers-reduced-motion).",
     """<div class="ds-stack ds-col">
  <p class="eyebrow"><span class="status-dot"></span>Eyebrow com status</p>
  <p class="section-kicker">Section kicker</p>
  <p class="capability-tag">Capability tag</p>
  <p class="step-label">Step label</p>
  <div class="insight-chips"><span>LGPD</span><span>ISO 27001</span><span>On-premise</span><span>RAG</span></div>
  <p class="insight-line">Insight line · mono · --label-color</p>
  <p class="card-number">card-number 04</p>
</div>""")

card("componentes/links.html", "Componentes", "Links", "Text link · navegação · rodapé",
     "Links herdam a cor; .text-link ganha seta animada. Links de navegação usam sublinhado deslizante via ::after.",
     """<div class="ds-stack ds-col">
  <p><a class="text-link" href="#">Ler o manifesto <span aria-hidden="true">↓</span></a></p>
  <nav class="desktop-nav" aria-label="Exemplo"><a href="#">Plataforma</a><a href="#" class="is-active">Segurança</a><a href="#" class="nav-voice">VoiceAI <small>powered by xSpace</small></a></nav>
  <p class="footer-links"><a href="#">Política de privacidade</a> · <a href="#">Termos</a></p>
</div>""")

card("componentes/selos.html", "Componentes", "Selos de conformidade", "LGPD · ANPD · ISO 27001 (rodapé)",
     "Componente .iso-badge: imagem monocromática (filtro invert no escuro, sem filtro no claro) + texto mono com link rastreável para due diligence.",
     """<div class="ds-stack">
  <div class="iso-badge"><img src="../../assets/lgpd.png" alt="" height="44"><div class="iso-badge-text"><span>Conformidade</span><a href="#">LGPD · Lei 13.709/2018</a></div></div>
  <div class="iso-badge"><img src="../../assets/anpd.png" alt="" height="44"><div class="iso-badge-text"><span>Registro</span><a href="#">ANPD</a></div></div>
  <div class="iso-badge"><img src="../../assets/iso-27001.png" alt="" height="44"><div class="iso-badge-text"><span>Certificação</span><a href="#">ISO/IEC 27001</a></div></div>
</div>""")

card("componentes/cabecalho.html", "Componentes", "Cabeçalho", "Marca · navegação · CTA · alternador de tema · menu",
     "Fixo, transparente no topo e translúcido ao rolar (.is-scrolled). O alternador de tema vive entre o CTA e o botão de menu.",
     """<div class="ds-header-demo">
<header class="site-header is-scrolled" style="position: relative">
  <div class="container header-inner">
    <a class="brand" href="#"><img class="brand-mark" src="../../assets/trustio-mark.svg" alt="" width="34" height="34"><span class="brand-word"><span>Trust</span><strong>io</strong></span></a>
    <nav class="desktop-nav" aria-label="Exemplo"><a href="#">Plataforma</a><a href="#">Modelos</a><a href="#" class="nav-voice">VoiceAI <small>powered by xSpace</small></a><a href="#">Segurança</a><a href="#">Planos</a></nav>
    <a class="button button-small button-ghost header-cta" href="#">Falar com a Trustio</a>
    <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Ativar tema claro"><svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-label="Abrir menu" style="display:block"><span></span><span></span></button>
  </div>
</header></div>""", width=1200)

# ---------------- Fotografia ----------------
def photo(path, title, subtitle, note, img, alt, extra=""):
    card(path, "Fotografia", title, subtitle, note,
         f'<figure class="ds-photo"><img src="../../assets/{img}" alt="{alt}"><figcaption><code>assets/{img}</code>{extra}</figcaption></figure>')

photo("fotografia/fundador.html", "Retrato do fundador", "founder-photo · jpg + webp",
      "Conteúdo editorial da página do fundador. Enquadramento vertical, luz neutra; usar sempre com o eyebrow e o nome por extenso.",
      "founder-photo.webp", "José Edson da Costa, fundador da Trustio", " · fallback <code>founder-photo.jpg</code>")
photo("fotografia/brasil.html", "Faixa Brasil", "brazil-banner · jpg + webp",
      "Faixa full-bleed que fecha a seção de compromisso com o Brasil. Exibida inteira, sem corte (.brazil-banner).",
      "brazil-banner.webp", "Faixa institucional Trustio Brasil", " · fallback <code>brazil-banner.jpg</code>")
photo("fotografia/social-card.html", "Social card", "1200 × 630 · og:image de todas as páginas",
      "Imagem de compartilhamento (Open Graph / Twitter). A fonte editável é <code>assets/social-card.svg</code> (grupo Artes).",
      "social-card.png", "Trustio, infraestrutura privada de inteligência artificial")
photo("fotografia/xai.html", "Marca xAI (parceria)", "xai-mark · png + webp",
      "Marca de terceiro usada na página de modelos. Não recolorir, não distorcer; respeitar o guia da xAI.",
      "xai-mark.webp", "Marca da xAI", " · fallback <code>xai-mark.png</code>")

# ---------------- Artes (peças institucionais, antes soltas no grupo Other) ----------------
def art(path, title, subtitle, note, items, width=900):
    body = "<div class=\"ds-art-grid\">" + "".join(
        f'<figure class="ds-art"><div class="ds-art-box"><img src="../../assets/{f}" alt="{a}"></div><figcaption><b>{n}</b><code>assets/{f}</code></figcaption></figure>'
        for n, f, a in items) + "</div>"
    card(path, "Artes", title, subtitle, note, body, width)

art("artes/marca.html", "Marca Trustio", "Símbolo · favicon SVG · social card (fonte)",
    "Símbolo oficial e sua versão favicon. A social card SVG é a fonte da PNG exportada (grupo Fotografia).",
    [("Símbolo (brand-mark)", "trustio-mark.svg", "Símbolo Trustio"), ("Favicon vetorial", "favicon.svg", "Favicon Trustio"), ("Social card (fonte SVG)", "social-card.svg", "Social card Trustio")])
art("artes/favicons.html", "Favicons e ícones de app", "16 · 32 · 192 · 512 · apple-touch",
    "Rasterizações do símbolo para abas, PWA (site.webmanifest) e tela inicial iOS.",
    [("Favicon 16", "favicon-16.png", ""), ("Favicon 32", "favicon-32.png", ""), ("Favicon 192", "favicon-192.png", ""), ("Favicon 512", "favicon-512.png", ""), ("Apple touch icon", "apple-touch-icon.png", "")])
art("artes/selos.html", "Selos de conformidade (arte)", "LGPD · ANPD · ISO 27001 · png + webp",
    "Artes originais dos selos. No site aparecem monocromáticas via .iso-badge; aqui, sem filtro.",
    [("LGPD", "lgpd.png", "Selo LGPD"), ("ANPD", "anpd.png", "Selo ANPD"), ("ISO/IEC 27001", "iso-27001.png", "Selo ISO 27001")])
art("artes/conectores.html", "Ícones de conectores", "9 canais · SVG monocromático",
    "Ícones dos canais integrados ao VoiceAI e ao atendimento. Traço único, herdam currentColor.",
    [(n, f"connectors/{f}", n) for n, f in [("WhatsApp", "whatsapp.svg"), ("Telegram", "telegram.svg"), ("iMessage", "imessage.svg"), ("SMS", "sms.svg"), ("Telefone", "phone.svg"), ("Web chat", "webchat.svg"), ("Gmail", "gmail.svg"), ("Outlook", "outlook.svg"), ("Calendário", "calendar.svg")]], width=1000)

# ---------------- ds.css / ds.js / index / manifest / README ----------------
(DS / "ds.css").write_text("""/* Chrome dos previews do design system (não usado pelo site). */
.ds-body { padding: var(--space-24); }
.ds-frame { width: min(1180px, 100%); margin-inline: auto; }
.ds-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-16); margin-bottom: var(--space-12); }
.ds-note { max-width: 70ch; margin: 0 0 var(--space-28); color: var(--muted); font-size: 14px; }
.ds-h { margin: var(--space-36) 0 var(--space-16); font-size: 18px; }
.ds-stack { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-16); margin-bottom: var(--space-20); }
.ds-col { flex-direction: column; align-items: flex-start; }
.ds-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-16); }
.ds-theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-24); align-items: start; }
.ds-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-12); }
.ds-swatch { margin: 0; }
.ds-swatch i { display: block; height: 64px; border: 1px solid var(--line); border-radius: 12px; background: var(--sw); }
.ds-swatch-wide { grid-column: span 2; }
.ds-swatch figcaption { display: grid; gap: 2px; margin-top: 6px; font-family: var(--mono); font-size: var(--label); }
.ds-swatch b { color: var(--ice); font-weight: 600; }
.ds-swatch span { color: var(--label-color); overflow-wrap: anywhere; }
.ds-display { font-family: var(--display); font-size: clamp(32px, 5vw, 56px); font-weight: 700; letter-spacing: -0.04em; line-height: 1.05; }
.ds-serif { font-family: var(--serif); font-style: italic; font-size: 26px; }
.ds-mono { font-family: var(--mono); font-size: var(--label-lg); color: var(--label-color); }
.ds-type h1, .ds-type h2, .ds-type h3 { margin-bottom: var(--space-12); }
.ds-space { display: grid; gap: var(--space-8); }
.ds-space-row { display: grid; grid-template-columns: 110px 1fr 48px; align-items: center; gap: var(--space-12); font-family: var(--mono); font-size: var(--label-lg); }
.ds-space-row i { display: block; height: 14px; border-radius: 3px; background: var(--blue-signal); }
.ds-space-row span { color: var(--label-color); text-align: right; }
.ds-photo { margin: 0; }
.ds-photo img { width: 100%; max-height: 520px; object-fit: contain; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.ds-photo figcaption { margin-top: var(--space-8); font-family: var(--mono); font-size: var(--label-lg); color: var(--label-color); }
.ds-art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: var(--space-16); }
.ds-art { margin: 0; }
.ds-art-box { display: grid; place-items: center; aspect-ratio: 1; padding: var(--space-20); border: 1px solid var(--line); border-radius: 14px; background: var(--card-gradient); color: var(--ice); }
.ds-art-box img { max-width: 100%; max-height: 100%; }
.ds-art figcaption { display: grid; gap: 2px; margin-top: 6px; font-family: var(--mono); font-size: var(--label); }
.ds-art b { color: var(--ice); font-weight: 600; }
.ds-art code { color: var(--label-color); overflow-wrap: anywhere; }
.ds-header-demo { border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.ds-header-demo .site-header { position: static; }
.ds-index { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-12); }
.ds-index a { display: grid; gap: 4px; padding: var(--space-16); border: 1px solid var(--line); border-radius: 14px; background: var(--card-gradient); }
.ds-index a:hover { border-color: var(--line-bright); }
.ds-index b { color: var(--ice); }
.ds-index span { color: var(--label-color); font-family: var(--mono); font-size: var(--label); }
code { font-family: var(--mono); font-size: 0.92em; color: var(--muted-strong); }
""")

(DS / "ds.js").write_text("""/* Alternador de tema dos previews (mesma lógica do site, sem depender de app.js). */
(function () {
  var KEY = "trustio-theme";
  var button = document.querySelector(".theme-toggle");
  function apply(theme, persist) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    if (button) {
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.setAttribute("aria-label", theme === "light" ? "Ativar tema escuro" : "Ativar tema claro");
    }
    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
  }
  apply(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark", false);
  if (button) button.addEventListener("click", function () {
    apply(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light", true);
  });
})();
""")

groups = {}
for path, group, title, subtitle, width in cards:
    groups.setdefault(group, []).append((path, title, subtitle))
index_body = ""
for group, items in groups.items():
    index_body += f'<h3 class="ds-h">{group}</h3><div class="ds-index">' + "".join(
        f'<a href="{p}"><b>{t}</b><span>{s}</span></a>' for p, t, s in items) + "</div>"
(DS / "index.html").write_text(HEAD.replace("../../assets/", "../assets/").replace('href="../ds.css"', 'href="ds.css"').replace('src="../ds.js"', 'src="ds.js"').format(
    group="Trustio", title="Design system", note="Previews gerados a partir de assets/styles.css. Cada card é um HTML com marcador @dsCard, pronto para /design-sync.",
    body=index_body))

manifest = [{"name": t, "path": f"design-system/{p}", "group": g, "subtitle": s, "viewport": {"width": w}} for p, g, t, s, w in cards]
(DS / "_ds_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("cards:", len(cards), "| groups:", {g: len(v) for g, v in groups.items()})
