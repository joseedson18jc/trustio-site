// Renders an audit evidence panel (NOT a site screenshot) for the voice.trustio.com.br hand-off,
// because a failed navigation leaves Playwright on a blank page instead of Chrome's error UI.
import { chromium } from 'playwright';
import path from 'node:path';
import { SHOTS, VIEWPORTS } from './lib.mjs';
const ev = JSON.parse(process.argv[2]);
const html = (vp) => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#f4f6fa;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0a1d3d">
<div style="max-width:${vp==='mobile'?350:760}px;margin:40px auto;padding:28px;background:#fff;border:2px dashed #c62828;border-radius:16px">
<div style="font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:#c62828">AUDIT EVIDENCE PANEL · NOT A SITE SCREENSHOT</div>
<h1 style="font-size:22px;margin:12px 0 4px">“Chamada real ↗” hand-off does not load</h1>
<p style="margin:0 0 16px;color:#44506a">Link on /voice.html (2 CTAs) → <code>https://voice.trustio.com.br/credito-jus</code></p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${ev.map(([k,v])=>`<tr><td style="padding:8px 8px 8px 0;border-top:1px solid #e3e7ef;vertical-align:top;color:#44506a;width:38%">${k}</td><td style="padding:8px 0;border-top:1px solid #e3e7ef;font-family:ui-monospace,monospace;word-break:break-all">${v}</td></tr>`).join('')}</table>
<p style="margin:16px 0 0;font-size:12px;color:#44506a">What a visitor sees: the browser's “site can't be reached / DNS_PROBE_FINISHED_NXDOMAIN” page.</p></div>`;
const b = await chromium.launch();
for (const vp of ['desktop','mobile']) { const p = await b.newPage({ ...VIEWPORTS[vp] }); await p.setContent(html(vp)); await p.screenshot({ path: path.join(SHOTS, `J2-05-handoff-dns-evidence-${vp}-dark.png`) }); await p.close(); }
await b.close();
