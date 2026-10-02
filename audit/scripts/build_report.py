"""Renders friction-log.csv and UX_AUDIT_REPORT.md from findings.py + collected data.
Run: python3 scripts/build_report.py   (AUDIT_OUT defaults to ./out)"""
import csv, json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
from findings import F, R, H

OUT = os.environ.get('AUDIT_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
D = os.path.join(OUT, 'data')
S = lambda f: f'./screenshots/{f}'

# ── friction-log.csv
with open(os.path.join(OUT, 'friction-log.csv'), 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['id', 'journey', 'step', 'url', 'viewport', 'theme', 'heuristic', 'severity', 'observed_or_inferred', 'description', 'screenshot', 'rec_id'])
    for f in F:
        w.writerow([f[0], f[1], f[2], f[3], f[4], f[5], H.get(f[6], 'n/a (positive)'), f[7], f[8], f[9], ' | '.join('screenshots/' + s for s in f[10]), f[11]])

steps = [json.loads(l) for l in open(os.path.join(D, 'steps.jsonl'))]
inv = json.load(open(os.path.join(D, 'inventory.json')))
lh = json.load(open(os.path.join(D, 'lighthouse-summary.json')))
contrast = json.load(open(os.path.join(D, 'contrast.json')))
linkcheck = json.load(open(os.path.join(D, 'linkcheck.json')))
ledger = json.load(open(os.path.join(D, 'stripe-ledger.json')))
guard = [json.loads(l) for l in open(os.path.join(D, 'guardrail-log.jsonl'))]
events = [json.loads(l) for l in open(os.path.join(D, 'events.jsonl'))]
extra = open(os.path.join(D, 'appendix-extra.md')).read() if os.path.exists(os.path.join(D, 'appendix-extra.md')) else ''

def ftable(rows):
    out = ['| ID | Sev | Heuristic | O/I | Finding | Evidence | Rec |', '|---|---|---|---|---|---|---|']
    for f in rows:
        ev = '<br>'.join(f'[{s}]({S(s)})' for s in f[10])
        out.append(f'| {f[0]} | {f[7]} | {f[6]} | {f[8][0].upper()} | {f[9]} | {ev} | {f[11]} |')
    return '\n'.join(out)

# ── Journey timeline
ACTUAL = {
 ('J1',1): 'Desktop: eyebrow + H1 only, lead cut, no CTA in viewport. Mobile: H1, lead and 3 CTAs visible. Light theme identical in structure.',
 ('J1',2): 'Banner: "IA Privada e sem censura*. Seats individuais disponíveis." + live counter (23.493 → 23.625 during the audit). CTAs go to espera.html and planos.html#pessoal, not /seats.html.',
 ('J1',3): 'Desktop: 12 links + toggle. Mobile: 11-item full-screen menu, taller than the viewport.',
 ('J1',4): '#para-quem shows B2C and B2B cards. B2C card CTAs: "Criar conta grátis" + "Ver planos"; desktop shows both in viewport.',
 ('J1',5): 'Header is position:fixed (81 px desktop / 73 px mobile) and stays visible.',
 ('J2',1): 'Strong H1 and orb stage. Desktop: no CTA above the fold. Mobile: "Criar um agente assim ↗" visible.',
 ('J2',2): '"Toque na esfera para ouvir a Bruna"; three voice chips; WebGL canvas renders.',
 ('J2',3): 'Desktop: ONE click → "A Bruna falando…", live caption, aria-pressed=true; pre-recorded clip ends by itself. Mobile: stopped by guardrail (one interaction per demo).',
 ('J2',4): '8 channel cards (article + nested button); hover reveals insight on desktop; no tap on mobile (cards play audio).',
 ('J2',5): 'voice.trustio.com.br does not resolve (no DNS record). The visitor gets a browser error page.',
 ('J2',6): '/console/ renders a polished demo console with production-looking metrics and a small "métricas ilustrativas" footnote.',
 ('J3',1): 'Opens on "Para empresas" (Starter R$ 2.900, Pro R$ 7.900, Dedicado R$ 19.900, Diagnóstico R$ 4.900). H1 "Contratada em minutos".',
 ('J3',2): '"Para você" tab: Mensal R$ 79 (Recomendado), Passe 7 dias R$ 24,90, Anual R$ 790 (≈ R$ 65,80/mês); each card also offers "Ou entrar na lista grátis ↓".',
 ('J3',3): '"Estado de hoje: cadastro aberto, chat ainda fechado. O chat abre em 1º de outubro… pré-assina… entra em 23 de setembro." Clear.',
 ('J3',4): 'Desktop: table fits. Mobile: 640 px table in a 358 px scroll box, no cue, not focusable.',
 ('J3',5): 'Stripe (each link opened once, page load only): merchant shown as JUICYSCORE, generic icon, crimson button, card only; B2B defaulted to USD from the audit network; Starter says "provisionado em até 5 dias úteis".',
 ('J3',9): '/seats.html: best B2C landing on the site (H1 + CTA + chips above the fold) but no inbound links; its nav anchors point to IDs that do not exist.',
 ('J4',1): 'Clear H1, status box, counter + countdown + 23/09 + "5 perguntas" tiles. Mobile: form ~2 screens down.',
 ('J4',2): 'Native bubbles only ("Please fill out this field." in this browser locale); no inline PT-BR errors.',
 ('J4',3): 'Invalid e-mail → pink border only; "NOME obrigatório" label vs "Só o e-mail é obrigatório" helper.',
 ('J4',4): 'Phone accepts "11" (no mask/pattern).',
 ('J4',5): '"Para minha empresa" → Segmento (required, 8 verticals), Empresa, Tamanho. Works.',
 ('J4',6): 'B2C + "Pré-assinar": submit reads "Quero pré-assinar e entrar em 23/09 ↗" but the option says "enviamos o link de pagamento". STOPPED BY GUARDRAIL before submit.',
 ('J4',7): 'Different embedded form on /planos (email, whatsapp, plano, acesso, uso).',
 ('J4',8): '#contato: mailto only, "Sem formulários", "Respondemos em até 1 dia útil", Copiar button.',
 ('J4',9): 'Password sign-up; chat opens 1/10. Observed only (guardrail: no account creation).',
 ('J5',1): '/juridico/: strong vertical page; footer seals (ISO 27001, ANPD, LGPD).',
 ('J5',2): '/manifesto: editorial; same footer seals.',
 ('J5',3): '/fundador: lists "ISO 27001, SOC 2 Type II e ISO 9001" under credentials.',
 ('J5',4): 'Home #seguranca: "Inferência, gravações e registros permanecem em infraestrutura nacional."',
 ('J5',5): 'Footer: "Certificação ISO 27001 · Conformidade LGPD", ISO/ANPD/LGPD images, no CNPJ/address/DPO.',
 ('J5',6): 'Privacy policy: candid; B2C prompts go to a contracted LLM provider, country disclosed on request.',
 ('J6',1): 'Mobile header: logo, theme toggle, menu (44×44). Desktop: skip link visible on first Tab.',
 ('J6',2): 'Mobile menu 885 px in an 844 px viewport; focus not moved in. Desktop: logical order, 2 px focus ring.',
 ('J6',3): 'Escape closes, focus returns to toggle.',
 ('J6',4): 'Menu closes; section lands below sticky header.',
 ('J6',5): '12 footer links at 23 px height; header targets ≥ 44 px.',
 ('J6',6): 'No page-level horizontal scroll at 390 px on any page (scrollWidth = 390); wide tables scroll inside wrappers.',
}
TITLES = {'J1': 'J1 · Home — first-5-seconds test', 'J2': 'J2 · VoiceAI', 'J3': 'J3 · Plans & pricing (+ Stripe hand-off)', 'J4': 'J4 · Waitlist & demo triggers', 'J5': 'J5 · Trust & legal', 'J6': 'J6 · Mobile navigation (+ desktop keyboard)'}
fmap = collections.defaultdict(list)
for f in F: fmap[(f[1], f[2])].append(f)

def journey_block(j):
    out = [f'### {TITLES[j]}', '']
    js = [s for s in steps if s['journey'] == j]
    nums = sorted({s['step'] for s in js})
    runs = sorted({(s['vp'], s['theme']) for s in js})
    out.append('Runs: ' + ', '.join(f'{v}/{t}' for v, t in runs) + '.')
    out.append('')
    for n in nums:
        ss = [s for s in js if s['step'] == n]
        s0 = ss[0]
        url = s0.get('url', '')
        if j == 'J3' and 5 <= n <= 8:
            labs = []
            for x in ss:
                a = x['action'].split(chr(34))[1] if chr(34) in x['action'] else x['action']
                labs.append(f"{a} ({x['vp']})")
            out.append(f'**Step {n:02d} — Stripe hand-off: ' + ' · '.join(labs) + '** · ' + ' · '.join(f"`{x.get('url','')}`" for x in ss))
        else:
            out.append(f'**Step {n:02d} — {s0["action"]}** · `{url}`')
        out.append('')
        out.append(f'- Expected: {s0.get("expected","—")}')
        act = ACTUAL.get((j, n)) or (ACTUAL.get((j, 5)) if j == 'J3' and 5 <= n <= 8 else '—')
        out.append(f'- Actual: {act}')
        g = [s for s in ss if s.get('guardrail')]
        if g: out.append(f'- Guardrail: {g[0].get("note") or "stop before submit / observe only"}')
        fr = fmap.get((j, n), [])
        if fr: out.append('- Friction: ' + '; '.join(f'**{f[0]}** (sev {f[7]}, {f[8]})' for f in fr))
        imgs = []
        for s in sorted(ss, key=lambda x: (x['vp'], x['theme'])):
            a = (s.get('shots') or {}).get('atf')
            if a and os.path.exists(os.path.join(OUT, 'screenshots', a)) and a not in imgs: imgs.append(a)
        fulls = []
        for s in ss:
            fl = (s.get('shots') or {}).get('full')
            if fl and fl not in fulls and os.path.exists(os.path.join(OUT, 'screenshots', fl)): fulls.append(fl)
        emb = [a for a in imgs if a.endswith('-dark.png')][:2] or imgs[:2]
        if emb:
            out.append('')
            out.append(' '.join(f'<img src="{S(a)}" alt="{a}" width="{360 if "desktop" in a else 180}">' for a in emb))
        others = [a for a in imgs if a not in emb] + fulls
        if others: out.append('\n  Other captures: ' + ', '.join(f'[{a}]({S(a)})' for a in others))
        out.append('')
    return '\n'.join(out)

# ── Matrix
def matrix():
    out = ['| ID | Recommendation | Evidence | Impact | Effort | Confidence | Category | KPI | Due |', '|---|---|---|---|---|---|---|---|---|']
    for r in R:
        out.append(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]} | {r[7]} | {r[8]} |')
    return '\n'.join(out)

# ── CTA table (condensed: unique label→destination per page, main+header CTAs)
def cta_table():
    rows = list(csv.DictReader(open(os.path.join(D, 'cta-inventory.csv'))))
    risk = {'Stripe checkout': 'High — merchant shown as JUICYSCORE; card-only capture (F17, F20)', 'Create account (cadastro)': 'Medium — third concept vs lista/pré-assinatura (F06, F32)',
            'Waitlist (espera)': 'Medium — form 2 screens down on mobile; contradictory copy (F25, F27)', 'Contact (mailto / #contato)': 'High for P2 — mailto only, no scheduler (F31)',
            'Voice demo (external)': 'Blocker — DNS missing (F10)', 'Console demo': 'Medium — demo framed as production (F14)', 'Plans': 'Low–Medium — opens on B2B tab unless #pessoal (F16)',
            'In-page anchor': 'Low (broken on /seats.html, F24)', 'Login': 'Low', 'Content page': 'Low'}
    out = ['| Page | CTA label | Destination | Type | Above fold (D/M) | Drop-off risk |', '|---|---|---|---|---|---|']
    keep = [r for r in rows if r['destination_type'] not in ('Content page',) or 'lista' in r['label'].lower()]
    for r in keep:
        out.append(f"| {r['page']} | {r['label']} | `{r['destination']}` | {r['destination_type']} | {'✓' if r['atf_desktop']=='True' else '—'} / {'✓' if r['atf_mobile']=='True' else '—'} | {risk.get(r['destination_type'],'Low')} |")
    return '\n'.join(out), len(rows)

def nav_map():
    d = inv['desktop:/']; m = inv['mobile:/']
    hdr = [f"{l['text']} → `{l['rawHref']}`" for l in d['links'] if l['region'] == 'header' and l['visible'] and l['rawHref']]
    mob = [f"{x['text']} → `{x['href']}`" for x in m.get('mobileMenu', [])]
    ft = [f"{l['text']} → `{l['rawHref']}`" for l in d['links'] if l['region'] == 'footer']
    return hdr, mob, ft

def page_inventory():
    out = ['| Page | Source | HTTP | H1 | Doc height D / M (px) | In header nav | axe violations (D/M) |', '|---|---|---|---|---|---|---|']
    hdr_links = {l['rawHref'] for l in inv['desktop:/']['links'] if l['region'] == 'header'}
    for p in ['/', '/juridico/', '/modelos.html', '/voice.html', '/planos.html', '/espera.html', '/manifesto.html', '/fundador.html', '/cadastro.html', '/entrar.html', '/privacidade.html', '/seats.html']:
        d = inv[f'desktop:{p}']; m = inv[f'mobile:{p}']
        innav = any(p.strip('/') and p.strip('/') in (h or '') for h in hdr_links) or p == '/'
        ad = sum(v['nodes'] for v in d['axeSummary']); am = sum(v['nodes'] for v in m['axeSummary'])
        out.append(f"| `{p}` | sitemap | {d['status']} | {d['h1'][0] if d['h1'] else '—'} | {d['docHeight']:,} / {m['docHeight']:,} | {'yes' if innav else 'no'} | {ad} / {am} |")
    out.append('| `/console/` | CTA on /voice.html (robots: Disallow) | 200 | (app UI) | — | no | not run |')
    out.append('| `voice.trustio.com.br/credito-jus` | CTA on /voice.html | DNS: no record | — | — | no | — |')
    out.append('| `/seats.html` (brief: "may be missing") | sitemap only | 200 | exists — logged as orphan page, **F04/F24** | | | |')
    return '\n'.join(out)

def lh_table():
    out = ['| Page | Perf | A11y | Best pr. | SEO | FCP | LCP | TBT | CLS | Transfer (KiB) |', '|---|---|---|---|---|---|---|---|---|---|']
    for r in lh:
        out.append(f"| {r['page']} | {r['performance']} | {r['accessibility']} | {r['best-practices']} | {r['seo']} | {r['FCP']} | {r['LCP']} | {r['TBT']} | {r['CLS']} | {r['weight']} |".replace('\xa0', ' '))
    return '\n'.join(out)

def axe_table():
    agg = collections.defaultdict(lambda: [0, set(), ''])
    inc = collections.Counter()
    for k, v in inv.items():
        for a in v['axeSummary']:
            agg[a['id']][0] += a['nodes']; agg[a['id']][1].add(k); agg[a['id']][2] = a['impact']
    out = ['| Rule | Impact | Nodes (sum) | Where |', '|---|---|---|---|']
    for k, (n, where, imp) in sorted(agg.items()):
        out.append(f'| {k} | {imp} | {n} | {", ".join(sorted(where))} |')
    import glob
    for f in glob.glob(os.path.join(OUT, 'axe', '*.json')):
        for i in json.load(open(f))['incomplete']: inc[i['id']] += len(i['nodes'])
    return '\n'.join(out), inc

def contrast_tables():
    t = ['| Theme | Token pair | Ratio | WCAG AA (normal text) |', '|---|---|---|---|']
    for th, rows in contrast['tokens'].items():
        for r in rows: t.append(f"| {th} | {r['pair']} | {r['ratio']}:1 | {'pass' if r['AA_normal'] else ('large text only' if r['AA_large'] else 'fail')} |")
    rr = ['| Sample (rendered) | Text | Font | FG | BG (rendered) | Ratio | Req. | Result |', '|---|---|---|---|---|---|---|---|']
    seen = set()
    for r in contrast['rendered']:
        k = r['sample']
        if k in seen: continue
        seen.add(k)
        rr.append(f"| {k} | {r['text'][:38]} | {r['font']} | {r['fg']} | {r['bg_rendered']} | {r['ratio']}:1 | {r['required']} | {'pass' if r['pass'] else 'FAIL'} |")
    return '\n'.join(t), '\n'.join(rr)

def events_summary():
    c = collections.Counter(); ex = {}
    for e in events:
        k = (e['kind'], re.sub(r'v[0-9a-f]{20,}', 'v…', (e.get('text') or e.get('req') or ''))[:150])
        c[k] += 1; ex.setdefault(k, e.get('url', ''))
    out = ['| Kind | Message / request | Count | First seen on |', '|---|---|---|---|']
    for (k, m), n in c.most_common(20):
        out.append(f'| {k} | {m.replace("|", "/")} | {n} | {ex[(k, m)]} |')
    return '\n'.join(out)

def links_summary():
    bad = [r for r in linkcheck if (isinstance(r['status'], int) and r['status'] >= 400) or str(r['status']).startswith('ERR') or r.get('anchor') == 'MISSING']
    out = ['| Link | Result | Found on | Assessment |', '|---|---|---|---|']
    notes = {'github.com': 'Proxy policy denial from the cloud runner (403); returns 200 from the auditor\'s Mac — not broken',
             'linkedin.com': 'LinkedIn bot rate-limit (429) — not broken for humans', 'voice.trustio.com.br': '**Broken — no DNS record (F10)**', 'seats.html#': '**Broken in-page anchor (F24)**'}
    for r in bad:
        note = next((v for k, v in notes.items() if k in r['href']), '')
        out.append(f"| `{r['href']}` | {r['status']}{' / anchor ' + r['anchor'] if r.get('anchor') else ''} | {', '.join(r['pages'][:3])} | {note} |")
    skipped = [r for r in linkcheck if 'guardrail' in str(r['status'])]
    return '\n'.join(out), len(linkcheck), len(skipped)

hdr, mob, ft = nav_map()
cta_md, cta_n = cta_table()
axe_md, axe_inc = axe_table()
tok_md, rend_md = contrast_tables()
links_md, links_n, links_skipped = links_summary()
stripe_rows = '\n'.join(f"| {v['label']} | `{u}` | {v['vp']} | {v['at']} | 1 |" for u, v in ledger.items())
aborted = collections.Counter(g['reason'] for g in guard if g['action'] == 'abort')
sev = collections.Counter(f[7] for f in F)
obs = sum(1 for f in F if f[8] == 'observed'); infd = sum(1 for f in F if f[8] == 'inferred')
qw = sum(1 for r in R if r[6] == 'Quick Win')

tpl = open(os.path.join(os.path.dirname(__file__), 'report_template.md')).read()
rep = (tpl.replace('{{PAGE_INVENTORY}}', page_inventory())
          .replace('{{NAV_HEADER}}', '\n'.join('- ' + x for x in hdr))
          .replace('{{NAV_MOBILE}}', '\n'.join('- ' + x for x in mob))
          .replace('{{NAV_FOOTER}}', '\n'.join('- ' + x for x in ft))
          .replace('{{J1}}', journey_block('J1')).replace('{{J2}}', journey_block('J2')).replace('{{J3}}', journey_block('J3'))
          .replace('{{J4}}', journey_block('J4')).replace('{{J5}}', journey_block('J5')).replace('{{J6}}', journey_block('J6'))
          .replace('{{FRICTION_ALL}}', ftable(F))
          .replace('{{MATRIX}}', matrix())
          .replace('{{CTA_TABLE}}', cta_md).replace('{{CTA_N}}', str(cta_n))
          .replace('{{LH_TABLE}}', lh_table()).replace('{{AXE_TABLE}}', axe_md)
          .replace('{{AXE_INCOMPLETE}}', ', '.join(f'{k}: {v} nodes' for k, v in axe_inc.most_common()))
          .replace('{{CONTRAST_TOKENS}}', tok_md).replace('{{CONTRAST_RENDERED}}', rend_md)
          .replace('{{EVENTS}}', events_summary()).replace('{{LINKS}}', links_md).replace('{{LINKS_N}}', str(links_n)).replace('{{LINKS_SKIPPED}}', str(links_skipped))
          .replace('{{STRIPE_ROWS}}', stripe_rows)
          .replace('{{ABORTED}}', ', '.join(f'{v}× {k}' for k, v in aborted.items()) or 'none')
          .replace('{{N_F}}', str(len(F))).replace('{{N_OBS}}', str(obs)).replace('{{N_INF}}', str(infd))
          .replace('{{SEV}}', ', '.join(f'sev {k}: {sev[k]}' for k in sorted(sev, reverse=True)))
          .replace('{{N_R}}', str(len(R))).replace('{{N_QW}}', str(qw))
          .replace('{{N_STEPS}}', str(len(steps))).replace('{{N_SHOTS}}', str(len(os.listdir(os.path.join(OUT, 'screenshots')))))
          .replace('{{APPENDIX_EXTRA}}', extra)
          .replace('{{VOICE_H}}', f"{inv['mobile:/voice.html']['docHeight']:,} px, espera {inv['mobile:/espera.html']['docHeight']:,} px, planos {inv['mobile:/planos.html']['docHeight']:,} px (mobile)"))
open(os.path.join(OUT, 'UX_AUDIT_REPORT.md'), 'w').write(rep)
left = re.findall(r'\{\{[A-Z_0-9]+\}\}', rep)
print('report written', len(rep), 'chars; unresolved placeholders:', left)
