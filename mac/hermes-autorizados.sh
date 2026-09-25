#!/bin/bash
# Trustio · sincroniza os números autorizados do Hermes (WHATSAPP_ALLOWED_USERS em ~/.hermes/.env).
# Roda a cada 30 s pelo launchd (br.com.trustio.hermes-sync). A lista vem da função
# hermes-autorizados do Supabase: teste de 3 dias ativo e dentro do prazo, e assinantes.
# Os números permanentes (equipe, convidados) ficam em ~/.hermes/allowed-fixos.txt, um por linha,
# criado na instalação; sem esse arquivo o script não mexe em nada.
# A lista só conta como aplicada depois que o gateway reinicia com sucesso (~/.hermes/allowed-aplicado.txt):
# se o reinício falha, a próxima execução tenta de novo. Consulta que falha não mexe em nada.
set -u
ENV_FILE="$HOME/.hermes/.env"
FIXOS="$HOME/.hermes/allowed-fixos.txt"
APLICADO="$HOME/.hermes/allowed-aplicado.txt"
CHAVE="$HOME/.trustio-hermes-sync-key"
URL="${TRUSTIO_HERMES_URL:-https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/hermes-autorizados}"
log() { printf '%s\n' "$(date '+%F %T') $*"; }

[ -s "$CHAVE" ] || { log "sem chave em $CHAVE"; exit 0; }
[ -e "$FIXOS" ] || { log "sem $FIXOS (crie com os números permanentes); nada feito"; exit 0; }

resp=$(curl -fsS -m 15 -H "x-trustio-segredo: $(cat "$CHAVE")" "$URL") || { log "consulta falhou; lista mantida"; exit 0; }

# Junta fixos e dinâmicos no formato do Hermes (DDI + número, só dígitos; BR sem DDI ganha 55).
lista=$(printf '%s' "$resp" | python3 -c '
import sys, json, re
def norm(n):
    d = re.sub(r"\D", "", n or "")
    if len(d) in (10, 11): d = "55" + d
    return d if 12 <= len(d) <= 15 else None
dinamicos = json.load(sys.stdin)["numeros"]
fixos = open(sys.argv[1]).read().split()
print(",".join(sorted({n for n in map(norm, fixos + dinamicos) if n})))
' "$FIXOS") || { log "resposta inválida; lista mantida"; exit 0; }
[ -n "$lista" ] || { log "lista vazia; nada feito"; exit 0; }

# Já aplicada com sucesso: nada a fazer.
[ -s "$APLICADO" ] && [ "$(cat "$APLICADO")" = "$lista" ] && exit 0

# Reescreve só a linha WHATSAPP_ALLOWED_USERS, num arquivo temporário trocado de uma vez (atômico):
# uma interrupção no meio nunca deixa o .env pela metade.
python3 - "$ENV_FILE" "$lista" <<'PY' || { log "falha ao gravar o .env; lista mantida"; exit 0; }
import os, re, sys, tempfile
caminho, lista = sys.argv[1], sys.argv[2]
texto = open(caminho).read()
linha = "WHATSAPP_ALLOWED_USERS=" + lista
if re.search(r"(?m)^WHATSAPP_ALLOWED_USERS=.*$", texto):
    novo = re.sub(r"(?m)^WHATSAPP_ALLOWED_USERS=.*$", lambda m: linha, texto, count=1)
else:
    novo = texto.rstrip("\n") + "\n" + linha + "\n"
if novo != texto:
    modo = os.stat(caminho).st_mode & 0o777
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(caminho), prefix=".env.")
    with os.fdopen(fd, "w") as f:
        f.write(novo); f.flush(); os.fsync(f.fileno())
    os.chmod(tmp, modo)
    os.replace(tmp, caminho)
PY

if hermes gateway restart >/dev/null 2>&1; then
  printf '%s' "$lista" > "$APLICADO"
  log "lista aplicada e gateway reiniciado: $lista"
else
  log "falha ao reiniciar o gateway; tento de novo na próxima execução"
fi
