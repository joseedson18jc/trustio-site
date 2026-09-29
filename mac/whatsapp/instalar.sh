#!/bin/bash
# Trustio · instala o serviço de WhatsApp do Mac (Baileys) no launchd (br.com.trustio.whatsapp).
# Uso, na pasta do repositório:   bash mac/whatsapp/instalar.sh
#
# 1. Instala as dependências (npm ci) nesta pasta.
# 2. Cria ~/.trustio-whatsapp/config.json (modo 600) com a chave e a instância que a função
#    aviso-agente usa (segredos EVOLUTION_API_KEY e EVOLUTION_INSTANCE). Rodar de novo não pergunta
#    outra vez: para trocar, apague o config.json.
# 3. Registra o serviço no launchd: sobe no login e volta sozinho se cair.
# O pareamento (QR code) aparece no log: tail -f ~/Library/Logs/trustio-whatsapp.log
set -euo pipefail

PASTA="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.trustio-whatsapp"
CONFIG="$DIR/config.json"
ROTULO="br.com.trustio.whatsapp"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
LOG="$HOME/Library/Logs/trustio-whatsapp.log"
PORTA="${WA_PORTA:-18080}"

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js não encontrado. Instale com: brew install node"; exit 1; }
[ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Precisa do Node 20 ou mais novo ($("$NODE" -v) instalado)."; exit 1; }

echo "→ dependências"
(cd "$PASTA" && npm ci --omit=dev --no-audit --no-fund)

mkdir -p "$DIR" && chmod 700 "$DIR"
if [ ! -s "$CONFIG" ]; then
  echo
  echo "→ configuração (os mesmos valores dos segredos EVOLUTION_INSTANCE e EVOLUTION_API_KEY do GitHub)"
  read -r -p "  Nome da instância (EVOLUTION_INSTANCE): " INSTANCIA
  read -r -s -p "  Chave (EVOLUTION_API_KEY; Enter para gerar uma nova): " CHAVE; echo
  NOVA=0
  if [ -z "$CHAVE" ]; then CHAVE="$(openssl rand -hex 32)"; NOVA=1; fi
  [ -n "$INSTANCIA" ] || { echo "A instância não pode ficar vazia."; exit 1; }
  [ "${#CHAVE}" -ge 16 ] || { echo "A chave precisa de pelo menos 16 caracteres."; exit 1; }
  # A chave vai pela entrada padrão, não pela linha de comando: não aparece no `ps`.
  umask 077
  printf '%s\n%s\n%s\n' "$INSTANCIA" "$PORTA" "$CHAVE" | "$NODE" -e '
    const [instancia, porta, chave] = require("fs").readFileSync(0, "utf8").split("\n");
    require("fs").writeFileSync(process.argv[1], JSON.stringify({ chave, instancia, porta: Number(porta) }, null, 2) + "\n", { mode: 0o600 });
  ' "$CONFIG"
  if [ "$NOVA" = 1 ]; then
    echo
    echo "  Chave nova gerada. Ponha no GitHub (trustio-site → Settings → Secrets and variables → Actions):"
    echo "    EVOLUTION_API_KEY  = $CHAVE"
    echo "    EVOLUTION_INSTANCE = $INSTANCIA"
    echo "  e rode o workflow Supabase (Actions → Supabase → Run workflow) para a função receber os valores."
  fi
fi
# Porta do config.json existente: WA_PORTA, se informada, vale e é gravada; a antiga 8080 (padrão
# de antes, que o túnel não alcança) passa para a 18080.
PORTA_SALVA="$("$NODE" -p 'require(process.argv[1]).porta ?? ""' "$CONFIG")"
PORTA_NOVA=""
if [ -n "${WA_PORTA:-}" ] && [ "$PORTA_SALVA" != "$WA_PORTA" ]; then PORTA_NOVA="$WA_PORTA"
elif [ -z "${WA_PORTA:-}" ] && { [ "$PORTA_SALVA" = "8080" ] || [ -z "$PORTA_SALVA" ]; }; then PORTA_NOVA=18080
fi
if [ -n "$PORTA_NOVA" ]; then
  "$NODE" -e '
    const fs = require("fs"), [arq, porta] = process.argv.slice(1);
    const c = JSON.parse(fs.readFileSync(arq, "utf8")); c.porta = Number(porta);
    fs.writeFileSync(arq, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 }); fs.chmodSync(arq, 0o600);
  ' "$CONFIG" "$PORTA_NOVA"
  echo "→ porta ${PORTA_SALVA:-(sem porta)} → $PORTA_NOVA em $CONFIG"
fi
PORTA="$("$NODE" -p 'require(process.argv[1]).porta' "$CONFIG")"

# Para a versão anterior deste serviço (numa reinstalação) antes de olhar a porta: o que continuar
# ouvindo nela é outro programa (ex.: o container antigo da Evolution) e impede o serviço de subir.
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
for _ in 1 2 3 4 5; do lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done
if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "A porta $PORTA já está em uso:"
  lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN
  echo
  if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN 2>/dev/null | grep -qiE "docke|vpnkit"; then  # o lsof do macOS corta o nome em "com.docke"
    echo "É um container do Docker (na 18080 costuma estar a Evolution API). Este serviço é a alternativa"
    echo "a ela, e só um dos dois pode ocupar a porta do túnel. Para trocar, pare o container e rode de novo:"
    echo "  docker stop \$(docker ps -q --filter publish=$PORTA)"
  else
    echo "Pare o programa listado acima e rode este instalador de novo:"
    echo "  kill $(lsof -t -iTCP:"$PORTA" -sTCP:LISTEN 2>/dev/null | head -1)"
  fi
  exit 1
fi

echo "→ serviço $ROTULO"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
# Caminhos entram no XML do plist: &, < e > precisam ser escapados.
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$(xml "$ROTULO")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$NODE")</string>
    <string>$(xml "$PASTA/servidor.mjs")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$PASTA")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# Só diz "pronto" quando o serviço responde na porta (ele sai se não conseguir abri-la).
no_ar() { local r; r="$(curl -fsS -m 2 "http://127.0.0.1:$PORTA/saude" 2>/dev/null)" || return 1; [[ "$r" == *'"conectado"'* ]]; }
for _ in $(seq 1 15); do no_ar && break; sleep 1; done
if ! no_ar; then
  echo
  echo "O serviço não respondeu em http://127.0.0.1:$PORTA. Últimas linhas do log:"
  tail -n 20 "$LOG" 2>/dev/null || true
  exit 1
fi

echo
echo "Pronto: o serviço está no ar. Próximos passos:"
echo "  1. Veja o QR e escaneie no celular (WhatsApp → Aparelhos conectados → Conectar um aparelho):"
echo "       tail -f $LOG"
echo "     Espere a linha \"conectado ao WhatsApp\" e saia do tail com Ctrl+C."
echo "  2. Confira localmente:  curl -s http://127.0.0.1:$PORTA/saude    (deve mostrar \"conectado\":true)"
if [ -f "$HOME/.cloudflared/config.yml" ]; then
  echo "  3. O túnel precisa levar evolution.trustio.com.br para http://localhost:$PORTA. Hoje está assim:"
  grep -n -A1 -i "evolution" "$HOME/.cloudflared/config.yml" | sed 's/^/       /' || echo "       (nenhuma linha com \"evolution\" no ~/.cloudflared/config.yml)"
else
  echo "  3. O túnel da Cloudflare precisa levar evolution.trustio.com.br para http://localhost:$PORTA."
fi
echo "  Para parar:  launchctl bootout gui/\$(id -u)/$ROTULO"
