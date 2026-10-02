"""Contrast measurement.
1) Token-pair ratios (WCAG 2.x relative luminance) for the declared colour tokens, dark + light theme.
2) Rendered ratios: for each sampled element clip, the declared text colour vs. the dominant background
   pixel actually rendered in the clip (mode of pixels far from the text colour). Output: data/contrast.json
"""
import json, os, sys, re
from collections import Counter
from PIL import Image

OUT = os.environ.get('AUDIT_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
D = os.path.join(OUT, 'data')

def hex2rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c[:3]); return 0.2126*r + 0.7152*g + 0.0722*b
def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return round((la + 0.05) / (lb + 0.05), 2)
def parse_css(c):
    m = re.match(r'rgba?\(([^)]+)\)', c or '')
    if not m: return None
    p = [float(x) for x in m.group(1).replace('/', ',').split(',') if x.strip()]
    return tuple(int(x) for x in p[:3]) + ((p[3],) if len(p) > 3 else (1.0,))

PAIRS = {
 'dark': [('ice #F4F6FA on abyss #05070B', '#f4f6fa', '#05070b'), ('muted #99A4B5 on abyss', '#99a4b5', '#05070b'), ('muted #99A4B5 on surface #0B0E14', '#99a4b5', '#0b0e14'),
          ('label #8D98AA on abyss (11–12 px mono kickers)', '#8d98aa', '#05070b'), ('label #8D98AA on surface-raised #10141C', '#8d98aa', '#10141c'),
          ('blue-signal #5EA7FF on abyss', '#5ea7ff', '#05070b'), ('blue #2563EB on abyss (links/icons)', '#2563eb', '#05070b'), ('white on blue #2563EB (primary CTA)', '#ffffff', '#2563eb'),
          ('white on cta-gradient end #1A49B8', '#ffffff', '#1a49b8'), ('white on cta-gradient start #2F6DF0', '#ffffff', '#2f6df0')],
 'light': [('text-strong #05070B on abyss #F4F6FA', '#05070b', '#f4f6fa'), ('muted #55637A on abyss #F4F6FA', '#55637a', '#f4f6fa'), ('label #4F5C72 on abyss', '#4f5c72', '#f4f6fa'),
           ('blue-signal #1D5FD6 on abyss', '#1d5fd6', '#f4f6fa'), ('muted #55637A on surface-footer #E9EEF6', '#55637a', '#e9eef6'), ('white on blue #2563EB (primary CTA)', '#ffffff', '#2563eb')],
}
tokens = {th: [{'pair': n, 'ratio': ratio(hex2rgb(a), hex2rgb(b)), 'AA_normal': ratio(hex2rgb(a), hex2rgb(b)) >= 4.5, 'AA_large': ratio(hex2rgb(a), hex2rgb(b)) >= 3} for n, a, b in v] for th, v in PAIRS.items()}

rendered = []
path = os.path.join(D, 'contrast.jsonl')
if os.path.exists(path):
    for line in open(path):
        r = json.loads(line)
        if 'file' not in r: continue
        fg = parse_css(r['color'])
        try: im = Image.open(os.path.join(D, 'contrast', r['file'])).convert('RGB')
        except Exception: continue
        px = list(im.getdata())
        far = [p for p in px if sum(abs(p[i] - fg[i]) for i in range(3)) > 90]
        if not far: continue
        bg = Counter(far).most_common(1)[0][0]
        # effective fg if semi-transparent text
        a = fg[3] if len(fg) > 3 else 1
        eff = tuple(round(fg[i]*a + bg[i]*(1-a)) for i in range(3))
        size = float(r['fontSize'].replace('px', '')); bold = int(r['fontWeight']) >= 700
        large = size >= 24 or (size >= 18.66 and bold)
        rt = ratio(eff, bg)
        rendered.append({'sample': r['tag'] + ' · ' + r['label'], 'text': r['text'][:60], 'fg': '#%02x%02x%02x' % eff, 'bg_rendered': '#%02x%02x%02x' % bg, 'font': f"{r['fontSize']} / {r['fontWeight']}", 'ratio': rt, 'required': 3.0 if large else 4.5, 'pass': rt >= (3.0 if large else 4.5), 'file': r['file']})
json.dump({'tokens': tokens, 'rendered': rendered}, open(os.path.join(D, 'contrast.json'), 'w'), indent=1, ensure_ascii=False)
for th, v in tokens.items():
    for t in v: print(th, t['pair'], t['ratio'], 'AA' if t['AA_normal'] else ('AA-large only' if t['AA_large'] else 'FAIL'))
for r in rendered: print(('PASS' if r['pass'] else 'FAIL'), r['ratio'], r['required'], r['sample'], r['font'], r['fg'], r['bg_rendered'], '|', r['text'][:40])
