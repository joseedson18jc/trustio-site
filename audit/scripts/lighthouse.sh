#!/usr/bin/env bash
# Lighthouse (mobile preset = default form factor, simulated throttling) on every sitemap page.
# Runs in a cloud container behind an egress proxy: treat absolute timings as lab data, compare pages relatively.
set -u
OUT=${AUDIT_OUT:-$(cd "$(dirname "$0")/.." && pwd)}/lighthouse
mkdir -p "$OUT"
export CHROME_PATH=${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}
PROXY_FLAG=${AUDIT_PROXY:+--proxy-server=$AUDIT_PROXY}
cd "$(dirname "$0")/.."
for p in "" juridico/ modelos.html manifesto.html fundador.html voice.html planos.html espera.html cadastro.html entrar.html privacidade.html seats.html; do
  n=${p%/}; n=${n%.html}; n=${n:-home}
  echo "== $n"
  npx lighthouse "https://trustio.com.br/$p" --quiet --output=json --output=html --output-path="$OUT/$n" \
    --chrome-flags="--headless=new --no-sandbox $PROXY_FLAG --enable-unsafe-swiftshader" \
    --only-categories=performance,accessibility,best-practices,seo --max-wait-for-load=60000 2>&1 | tail -2
done
