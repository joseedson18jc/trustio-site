#!/bin/bash
# Trustio · sincroniza os números autorizados do Hermes (WHATSAPP_ALLOWED_USERS em ~/.hermes/.env).
# Roda a cada 30 s pelo launchd (br.com.trustio.hermes-sync). A lista vem da função
# hermes-autorizados do Supabase: teste de 3 dias ativo e dentro do prazo, e assinantes.
# Os números que já estavam no .env na instalação ficam fixos em ~/.hermes/allowed-fixos.txt.
# Só reinicia o gateway quando a lista muda; se a consulta falhar, não mexe em nada.
set -u
ENV_FILE="$HOME/.hermes/.env"
FIXOS="$HOME/.hermes/allowed-fixos.txt"
CHAVE="$HOME/.trustio-hermes-sync-key"
URL="${TRUSTIO_HERMES_URL:-https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/hermes-autorizados}"
log() { printf '%s\n' "$(date '+%F %T') $*"; }

[ -s "$CHAVE" ] || { log "sem chave em $CHAVE"; exit 0; }
atual=$(grep -m1 '^WHATSAPP_ALLOWED_USERS=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ')
# Primeira execução: os números de hoje viram a lista fixa (equipe e convidados).
[ -e "$FIXOS" ] || printf '%s\n' "${atual//,/$'\n'}" | grep -E '^[0-9]{12,15}$' > "$FIXOS"

resp=$(curl -fsS -m 15 -H "x-trustio-segredo: $(cat "$CHAVE")" "$URL") || { log "consulta falhou; lista mantida"; exit 0; }
dinamicos=$(printf '%s\n' "$resp" | python3 -c 'import sys, json; print("\n".join(json.load(sys.stdin)["numeros"]))') || { log "resposta inválida; lista mantida"; exit 0; }

lista=$({ cat "$FIXOS"; printf '%s\n' "$dinamicos"; } | grep -E '^[0-9]{12,15}$' | sort -u | paste -sd, -)
[ -n "$lista" ] || { log "lista vazia; nada feito"; exit 0; }
[ "$lista" = "$atual" ] && exit 0

python3 - "$ENV_FILE" "$lista" <<'PY'
import sys, re
caminho, lista = sys.argv[1], sys.argv[2]
texto = open(caminho).read()
linha = "WHATSAPP_ALLOWED_USERS=" + lista
if re.search(r"(?m)^WHATSAPP_ALLOWED_USERS=.*$", texto):
    texto = re.sub(r"(?m)^WHATSAPP_ALLOWED_USERS=.*$", lambda m: linha, texto, count=1)
else:
    texto = texto.rstrip("\n") + "\n" + linha + "\n"
open(caminho, "w").write(texto)
PY
log "lista atualizada: $lista"
hermes gateway restart >/dev/null 2>&1 && log "gateway reiniciado" || log "falha ao reiniciar o gateway"
