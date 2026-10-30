# Computer Use no processo do gateway (127.0.0.1:9931).
# A sessão chama o Strata como trustio-heavy. A foto fica neste Mac.
# Cada ação passa por validação; as arriscadas esperam confirmação.
# O diário é só de texto. Reinício no meio de um clique não repete o clique.

import hashlib, hmac, json, os, secrets, subprocess, threading, time, urllib.request
from pathlib import Path

MAX_PASSOS = 15
MAX_SEGUNDOS = 180
TOKEN_TTL = 600
TEXTO_MAX = 200
ESPERA_MAX_MS = 3000
MODELO = "trustio-heavy"
ACOES = {"click", "move", "type", "keypress", "scroll", "wait", "done"}
TECLAS = {
    "return", "enter", "tab", "escape", "space", "delete", "up", "down", "left", "right",
    *list("abcdefghijklmnopqrstuvwxyz"), *list("0123456789"),
}
MODS = {"shift", "command", "option", "control"}
TERMINAIS = {"completed", "failed", "aborted"}
# Estados em que um reinício não pode repetir o evento de teclado ou mouse.
REPETIR_NAO = {"executing", "deciding", "validating"}

_cfg = {
    "root": os.path.expanduser("~/.trustio-computer"),
    "armed": os.path.expanduser("~/.trustio-computer-armed"),
    "porta": 9931,
    "chave": "",
}
_sessoes = {}
_sessoes_lock = threading.Lock()


def configurar(porta, chave, root=None):
    _cfg["porta"] = int(porta)
    _cfg["chave"] = chave or ""
    if root:
        _cfg["root"] = root
    Path(_cfg["root"]).mkdir(mode=0o700, parents=True, exist_ok=True)


def armado():
    if os.environ.get("TRUSTIO_COMPUTER_ARMED") == "1":
        return True
    try:
        return Path(_cfg["armed"]).read_text().strip() == "1"
    except OSError:
        return False


def validar(acao):
    """Devolve (ok, codigo). Nenhuma checagem daqui mexe no sistema."""
    if not isinstance(acao, dict):
        return False, "acao_invalida"
    nome = acao.get("action")
    if nome not in ACOES:
        return False, "acao_desconhecida"
    if nome in ("click", "move", "scroll"):
        x, y = acao.get("x"), acao.get("y")
        if not _numero(x) or not _numero(y):
            return False, "coordenada_ausente"
        if not (0 <= float(x) <= 1000 and 0 <= float(y) <= 1000):
            return False, "coordenada_fora"
    if nome == "click":
        if acao.get("button", "left") not in ("left", "right"):
            return False, "botao_invalido"
        if acao.get("count", 1) not in (1, 2):
            return False, "cliques_invalidos"
    if nome == "type":
        texto = acao.get("text")
        if not isinstance(texto, str) or not texto.strip() or len(texto) > TEXTO_MAX:
            return False, "texto_invalido"
    if nome == "keypress":
        if str(acao.get("key") or "") not in TECLAS:
            return False, "tecla_fora_da_lista"
        mods = acao.get("modifiers") or []
        if not isinstance(mods, list) or any(m not in MODS for m in mods):
            return False, "modificador_invalido"
    if nome == "scroll":
        dx, dy = acao.get("dx", 0), acao.get("dy", 0)
        if not _numero(dx) or not _numero(dy) or abs(float(dx)) > 1000 or abs(float(dy)) > 1000:
            return False, "scroll_invalido"
    if nome == "wait":
        ms = acao.get("ms", 0)
        if not _numero(ms) or float(ms) < 0 or float(ms) > ESPERA_MAX_MS:
            return False, "espera_invalida"
    if nome == "done":
        result = acao.get("result") or ""
        if not isinstance(result, str) or len(result) > 500:
            return False, "resultado_invalido"
    return True, ""


def politica(acao, seguro):
    """allow, confirm ou deny. Roda de novo imediatamente antes do evento."""
    nome = acao.get("action")
    if seguro and nome in ("click", "type", "keypress", "scroll"):
        return "deny"
    if nome in ("move", "scroll", "wait", "done"):
        return "allow"
    if nome == "click":
        return "allow"
    if nome == "type":
        return "confirm"
    if nome == "keypress":
        mods = set(acao.get("modifiers") or [])
        if mods & {"command", "option", "control"} or acao.get("key") in {"return", "enter", "delete"}:
            return "confirm"
        # Letra ou dígito vira texto digitado: sem isto, digitar caractere por caractere
        # passaria sem a confirmação exigida para type.
        if len(str(acao.get("key") or "")) == 1:
            return "confirm"
        return "allow"
    return "deny"


def _numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def resumo(acao):
    nome = acao.get("action")
    if nome in ("click", "move"):
        return "%s em (%s, %s)" % (nome, _g(acao.get("x")), _g(acao.get("y")))
    if nome == "type":
        return "digitar %d caracteres" % len(acao.get("text") or "")
    if nome == "keypress":
        mods = "+".join(acao.get("modifiers") or [])
        tecla = str(acao.get("key") or "")
        return "tecla %s" % (mods + "+" + tecla if mods else tecla)
    if nome == "scroll":
        return "rolar (%s, %s)" % (_g(acao.get("dx")), _g(acao.get("dy")))
    if nome == "wait":
        return "esperar %s ms" % _g(acao.get("ms"))
    if nome == "done":
        return "concluído: %s" % (acao.get("result") or "feito")[:180]
    return nome or "ação"


def _g(v):
    try:
        return str(int(round(float(v))))
    except (TypeError, ValueError):
        return "?"


class Sessao:
    def __init__(self, goal, conversation_id=None, agora=None):
        self.id = secrets.token_hex(16)
        self.token = secrets.token_urlsafe(32)
        self.goal = str(goal or "")[:4000]
        self.conversation_id = conversation_id
        self.criada = time.time()
        self.state = "created"
        self.steps = 0
        self.repairs = 0
        self.stalls = 0
        self.pending = None
        self.trace = []
        self.last_hash = None
        self.erro = None
        self.dir = Path(_cfg["root"]) / "sessions" / self.id
        self.dir.mkdir(mode=0o700, parents=True)
        self.journal = self.dir / "journal.jsonl"
        os.chmod(self.dir, 0o700)
        token_path = self.dir / "session.token"
        token_path.write_text(self.token)
        os.chmod(token_path, 0o600)
        self.lock = threading.Lock()
        self.pause_flag = threading.Event()
        self.abort_flag = threading.Event()
        self._agora = agora or time.time
        self._anotar("created", {"goal_chars": len(self.goal)})

    def _anotar(self, state, extra=None):
        evento = {"ts": time.time(), "session": self.id, "step": self.steps, "state": state}
        if extra:
            evento.update(extra)
        with self.journal.open("a", encoding="utf-8") as f:
            f.write(json.dumps(evento, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def transitar(self, state, **extra):
        self.state = state
        if "error" in extra:
            self.erro = extra["error"]
        self._anotar(state, extra or None)

    def token_ok(self, token):
        if not token or self._agora() - self.criada > TOKEN_TTL:
            return False
        return hmac.compare_digest(str(token), self.token)

    def publico(self):
        """O que pode sair para a função de chat. Sem foto e sem caminho de arquivo."""
        return {
            "session_id": self.id,
            "state": self.state,
            "step": self.steps,
            "action": _acao_publica(self.pending),
            "summary": resumo(self.pending) if self.pending else (self.trace[-1] if self.trace else ""),
            "error": self.erro,
            "model": MODELO,
        }


def _acao_publica(acao):
    if not acao:
        return None
    limpa = {"action": acao.get("action")}
    for k in ("x", "y", "button", "count", "key", "modifiers", "dx", "dy", "ms"):
        if k in acao:
            limpa[k] = acao[k]
    if acao.get("action") == "type":
        limpa["text_chars"] = len(acao.get("text") or "")
    if acao.get("action") == "done":
        limpa["result"] = (acao.get("result") or "")[:180]
    return limpa


def recuperar(root=None):
    """Sessões interrompidas no meio de uma ação voltam como recovering, sem repetir o evento."""
    base = Path(root or _cfg["root"]) / "sessions"
    if not base.is_dir():
        return []
    ids = []
    for pasta in base.iterdir():
        journal = pasta / "journal.jsonl"
        if not journal.is_file():
            continue
        ultimo = _ultimo(journal)
        if not ultimo or ultimo.get("state") not in REPETIR_NAO:
            continue
        with journal.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": time.time(), "session": pasta.name, "step": ultimo.get("step") or 0,
                "state": "recovering", "error": "reinicio",
                "note": "a ultima acao nao foi repetida",
            }, ensure_ascii=False) + "\n")
        ids.append(pasta.name)
    return ids


def _primeiro(journal):
    for linha in journal.read_text(encoding="utf-8").splitlines():
        try:
            return json.loads(linha)
        except json.JSONDecodeError:
            continue
    return None


def _ultimo(journal):
    ultimo = None
    for linha in journal.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            ultimo = json.loads(linha)
        except json.JSONDecodeError:
            continue
    return ultimo


def tratar(method, path, body, headers):
    path = path.split("?", 1)[0].rstrip("/")
    if path == "/v1/computer/health":
        return 200, {"ready": True, "armed": armado(), "model": MODELO, "grid": "0-1000"}
    if not armado():
        return 409, {"error": "computer_desarmado", "state": "failed"}
    if method == "POST" and path == "/v1/computer/sessions":
        goal = str((body or {}).get("goal") or "").strip()
        if not goal:
            return 400, {"error": "objetivo_vazio"}
        sessao = Sessao(goal, (body or {}).get("conversation_id"))
        with _sessoes_lock:
            _sessoes[sessao.id] = sessao
        saida = sessao.publico()
        saida["token"] = sessao.token
        return 200, saida
    partes = path.split("/")
    if len(partes) < 5 or partes[1:4] != ["v1", "computer", "sessions"]:
        return 404, {"error": "not_found"}
    sid = partes[4]
    acao_http = partes[5] if len(partes) > 5 else ""
    sessao = _obter(sid)
    if not sessao:
        return 404, {"error": "sessao_inexistente"}
    token = headers.get("X-Trustio-Computer-Token") if headers is not None else ""
    if not sessao.token_ok(token or ""):
        return 401, {"error": "computer_token"}
    if method == "GET" and not acao_http:
        return 200, sessao.publico()
    if method != "POST":
        return 405, {"error": "method_not_allowed"}
    if acao_http == "step":
        return 200, avancar(sessao)
    if acao_http == "confirm":
        return 200, confirmar(sessao, (body or {}).get("decision"))
    if acao_http == "pause":
        sessao.pause_flag.set()
        with sessao.lock:
            if sessao.state not in TERMINAIS:
                sessao.transitar("paused")
        return 200, sessao.publico()
    if acao_http == "resume":
        with sessao.lock:
            if sessao.state != "paused":
                saida = sessao.publico()
                saida["error"] = "nao_pausada"
                return 409, saida
            sessao.pause_flag.clear()
            sessao.erro = None
            sessao.transitar("observing", note="retomada com foto nova")
        return 200, sessao.publico()
    if acao_http == "abort":
        sessao.abort_flag.set()
        with sessao.lock:
            if sessao.state not in TERMINAIS:
                sessao.pending = None
                sessao.transitar("aborted")
        return 200, sessao.publico()
    return 404, {"error": "not_found"}


def _obter(sid):
    with _sessoes_lock:
        sessao = _sessoes.get(sid)
    if sessao:
        return sessao
    pasta = Path(_cfg["root"]) / "sessions" / sid
    journal = pasta / "journal.jsonl"
    token_path = pasta / "session.token"
    if not journal.is_file() or not token_path.is_file():
        return None
    if not _id_seguro(sid):
        return None
    ultimo = _ultimo(journal)
    if not ultimo:
        return None
    sessao = object.__new__(Sessao)
    sessao.id = sid
    sessao.token = token_path.read_text().strip()
    sessao.goal = ""
    sessao.conversation_id = None
    # O prazo do token conta da criação, não do último evento: um reinício não pode estender a sessão.
    sessao.criada = float((_primeiro(journal) or ultimo).get("ts") or 0)
    sessao.state = ultimo.get("state") or "failed"
    sessao.steps = int(ultimo.get("step") or 0)
    sessao.repairs = 0
    sessao.stalls = 0
    sessao.pending = None
    sessao.trace = []
    sessao.last_hash = None
    sessao.erro = ultimo.get("error")
    sessao.dir = pasta
    sessao.journal = journal
    sessao.lock = threading.Lock()
    sessao.pause_flag = threading.Event()
    sessao.abort_flag = threading.Event()
    sessao._agora = time.time
    if sessao.state in REPETIR_NAO:
        sessao.transitar("recovering", error="reinicio", note="a ultima acao nao foi repetida")
    with _sessoes_lock:
        _sessoes[sid] = sessao
    return sessao


def _id_seguro(sid):
    return isinstance(sid, str) and len(sid) == 32 and all(c in "0123456789abcdef" for c in sid)


def avancar(sessao, capturar=None, decidir=None, executar=None):
    capturar = capturar or capturar_tela
    decidir = decidir or decidir_modelo
    executar = executar or executar_acao
    with sessao.lock:
        if sessao.abort_flag.is_set():
            if sessao.state not in TERMINAIS:
                sessao.transitar("aborted")
            return sessao.publico()
        if sessao.pause_flag.is_set() or sessao.state == "paused":
            if sessao.state not in TERMINAIS and sessao.state != "paused":
                sessao.transitar("paused")
            return sessao.publico()
        if sessao.state in TERMINAIS or sessao.state == "awaiting_confirmation":
            return sessao.publico()
        if sessao._agora() - sessao.criada > MAX_SEGUNDOS and sessao.state not in ("paused", "awaiting_confirmation"):
            sessao.transitar("failed", error="tempo_esgotado")
            return sessao.publico()
        if sessao.steps >= MAX_PASSOS:
            sessao.transitar("failed", error="limite_de_passos")
            return sessao.publico()
        veio_de_reinicio = sessao.state == "recovering" or sessao.erro == "reinicio"
        sessao.transitar("observing")
        passo = sessao.steps + 1
    try:
        _caminho, data_url, digest = capturar(sessao, passo)
    except Exception as e:
        with sessao.lock:
            sessao.transitar("failed", error="captura_falhou", detail=type(e).__name__)
        return sessao.publico()
    aviso = None
    with sessao.lock:
        if veio_de_reinicio:
            aviso = "A sessão reiniciou no meio da ação anterior. Ela não foi repetida. Olhe a tela e escolha o próximo passo."
            sessao.erro = None
        if digest and digest == sessao.last_hash:
            sessao.stalls += 1
        else:
            sessao.stalls = 0
        sessao.last_hash = digest
        if sessao.stalls >= 2:
            sessao.transitar("paused", error="tela_nao_mudou")
            return sessao.publico()
        sessao.transitar("deciding")
        goal, trace = sessao.goal, list(sessao.trace)
    if sessao.abort_flag.is_set():
        with sessao.lock:
            sessao.transitar("aborted")
        return sessao.publico()
    try:
        acao = decidir(goal, trace, data_url, aviso)
    except Exception as e:
        with sessao.lock:
            sessao.transitar("failed", error="modelo_indisponivel", detail=type(e).__name__)
        return sessao.publico()
    ok, codigo = validar(acao) if acao else (False, "acao_ausente")
    with sessao.lock:
        sessao.transitar("validating", validation=codigo or "ok")
        if not ok:
            sessao.repairs += 1
            sessao.trace.append("recusada antes de executar: " + codigo)
            if sessao.repairs > 1:
                sessao.transitar("failed", error=codigo)
            else:
                sessao.transitar("observing", error=codigo)
            return sessao.publico()
        sessao.repairs = 0
        sessao.pending = acao
        sessao.steps = passo
        regra = politica(acao, entrada_segura())
        if regra == "deny":
            sessao.pending = None
            sessao.transitar("failed", error="negada_pela_politica")
            return sessao.publico()
        if regra == "confirm":
            sessao.transitar("awaiting_confirmation", summary=resumo(acao), policy="confirm")
            return sessao.publico()
    return _executar_pendente(sessao, executar)


def confirmar(sessao, decision, executar=None):
    if decision not in ("approve", "deny"):
        saida = sessao.publico()
        saida["error"] = "decisao_invalida"
        return saida
    with sessao.lock:
        if sessao.state != "awaiting_confirmation" or not sessao.pending:
            saida = sessao.publico()
            saida["error"] = "nada_a_confirmar"
            return saida
        if decision == "deny":
            sessao.trace.append("negado: " + resumo(sessao.pending))
            sessao.pending = None
            sessao.transitar("paused", summary="confirmação negada")
            return sessao.publico()
        if politica(sessao.pending, entrada_segura()) == "deny":
            sessao.pending = None
            sessao.transitar("failed", error="negada_pela_politica")
            return sessao.publico()
    return _executar_pendente(sessao, executar or executar_acao)


def _executar_pendente(sessao, executar):
    with sessao.lock:
        if sessao.abort_flag.is_set():
            sessao.pending = None
            sessao.transitar("aborted")
            return sessao.publico()
        if sessao.pause_flag.is_set():
            sessao.transitar("paused")
            return sessao.publico()
        acao = dict(sessao.pending or {})
        sessao.transitar("executing", summary=resumo(acao), policy="allow")
    if not acao:
        with sessao.lock:
            sessao.transitar("failed", error="acao_ausente")
        return sessao.publico()
    if acao.get("action") == "done":
        with sessao.lock:
            sessao.trace.append(resumo(acao))
            sessao.pending = None
            sessao.transitar("completed", summary=resumo(acao))
        return sessao.publico()
    try:
        executar(acao)
    except Exception as e:
        with sessao.lock:
            sessao.pending = None
            sessao.transitar("recovering", error="execucao_falhou", detail=type(e).__name__)
        return sessao.publico()
    with sessao.lock:
        sessao.trace.append(resumo(acao))
        sessao.pending = None
        if len(sessao.trace) > 12:
            sessao.trace = sessao.trace[-12:]
        sessao.transitar("observing", summary=resumo(acao))
    return sessao.publico()


def capturar_tela(sessao, passo):
    destino = sessao.dir / "shots"
    destino.mkdir(mode=0o700, exist_ok=True)
    caminho = destino / ("step-%02d.jpg" % passo)
    subprocess.run(["screencapture", "-x", "-t", "jpg", str(caminho)], check=True, timeout=15)
    subprocess.run(["sips", "-Z", "1280", str(caminho), "--out", str(caminho)], check=True, timeout=15, capture_output=True)
    bruto = caminho.read_bytes()
    if not bruto or len(bruto) > 8_000_000:
        raise RuntimeError("foto_fora_do_limite")
    digest = hashlib.sha256(bruto).hexdigest()
    import base64
    data_url = "data:image/jpeg;base64," + base64.b64encode(bruto).decode("ascii")
    return str(caminho), data_url, digest


def decidir_modelo(goal, trace, data_url, aviso=None):
    texto = (
        "Você controla o mouse e o teclado deste Mac. A grade é 0–1000 sobre a foto, "
        "canto superior esquerdo 0,0. Uma ação por vez, no tool computer. "
        "Não invente que a ação já aconteceu.\nObjetivo: %s\nPassos já feitos:\n%s"
        % (goal, "\n".join(trace) or "(nenhum)")
    )
    if aviso:
        texto += "\n" + aviso
    corpo = {
        "model": MODELO,
        "stream": False,
        "trustio_plano": "pago",
        "messages": [
            {"role": "system", "content": "Responda só com a ferramenta computer."},
            {"role": "user", "content": [
                {"type": "text", "text": texto},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]},
        ],
        "tools": [_ferramenta()],
        "tool_choice": {"type": "function", "function": {"name": "computer"}},
    }
    req = urllib.request.Request(
        "http://127.0.0.1:%d/v1/chat/completions" % _cfg["porta"],
        data=json.dumps(corpo).encode(),
        headers={"Authorization": "Bearer " + _cfg["chave"], "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        bruto = r.read(2_000_000).decode("utf-8", "replace")
    acao = extrair_acao(bruto)
    if not acao:
        raise RuntimeError("acao_ausente")
    return acao


def extrair_acao(bruto):
    bruto = (bruto or "").strip()
    if not bruto:
        return None
    if bruto.startswith("{"):
        try:
            acao = _acao_de_obj(json.loads(bruto))
            if acao:
                return acao
        except json.JSONDecodeError:
            pass
    pedacos = []
    for linha in bruto.splitlines():
        linha = linha.strip()
        if not linha.startswith("data:"):
            continue
        payload = linha[5:].strip()
        if payload == "[DONE]":
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        acao = _acao_de_obj(obj)
        if acao:
            return acao
        delta = ((obj.get("choices") or [{}])[0].get("delta") or {})
        for chamada in delta.get("tool_calls") or []:
            arg = ((chamada.get("function") or {}).get("arguments")) or ""
            if arg:
                pedacos.append(arg)
    if pedacos:
        try:
            return json.loads("".join(pedacos))
        except json.JSONDecodeError:
            return None
    return None


def _acao_de_obj(obj):
    if not isinstance(obj, dict):
        return None
    if obj.get("action") in ACOES:
        return obj
    escolha = (obj.get("choices") or [{}])[0]
    msg = escolha.get("message") or {}
    for chamada in msg.get("tool_calls") or []:
        fn = chamada.get("function") or {}
        if fn.get("name") not in (None, "", "computer"):
            continue
        try:
            arg = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            continue
        if isinstance(arg, dict) and arg.get("action") in ACOES:
            return arg
    conteudo = msg.get("content")
    if isinstance(conteudo, str) and conteudo.strip().startswith("{"):
        try:
            arg = json.loads(conteudo)
        except json.JSONDecodeError:
            return None
        if isinstance(arg, dict) and arg.get("action") in ACOES:
            return arg
    return None


def _ferramenta():
    return {
        "type": "function",
        "function": {
            "name": "computer",
            "description": "Uma ação no Mac. Coordenadas na grade 0-1000 da foto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": sorted(ACOES)},
                    "x": {"type": "number"}, "y": {"type": "number"},
                    "button": {"type": "string", "enum": ["left", "right"]},
                    "count": {"type": "integer"},
                    "text": {"type": "string"},
                    "key": {"type": "string"},
                    "modifiers": {"type": "array", "items": {"type": "string"}},
                    "dx": {"type": "number"}, "dy": {"type": "number"},
                    "ms": {"type": "number"},
                    "result": {"type": "string"},
                },
                "required": ["action"],
            },
        },
    }


def executar_acao(acao):
    nome = acao.get("action")
    if nome == "wait":
        time.sleep(min(ESPERA_MAX_MS, max(0, float(acao.get("ms") or 0))) / 1000)
        return
    if nome in ("click", "move", "scroll"):
        x, y = grade_para_ponto(float(acao["x"]), float(acao["y"]))
    if nome == "move":
        _mouse(5, x, y, 0)
        return
    if nome == "click":
        botao = 1 if acao.get("button") == "right" else 0
        down, up = (3, 4) if botao else (1, 2)
        for n in range(1, int(acao.get("count") or 1) + 1):
            # clickState 2 no segundo par: sem ele o macOS vê dois cliques simples, não um duplo.
            _mouse(down, x, y, botao, n)
            _mouse(up, x, y, botao, n)
        return
    if nome == "scroll":
        _scroll(x, y, int(acao.get("dx") or 0), int(acao.get("dy") or 0))
        return
    if nome == "type":
        _digitar(acao.get("text") or "")
        return
    if nome == "keypress":
        _tecla(str(acao.get("key")), list(acao.get("modifiers") or []))
        return
    raise RuntimeError("acao_desconhecida")


def grade_para_ponto(x, y):
    largura, altura = _tela_pontos()
    if largura <= 0 or altura <= 0:
        raise RuntimeError("tela_indisponivel")
    return largura * (x / 1000.0), altura * (y / 1000.0)


def _tela_pontos():
    import ctypes
    cg = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")

    class CGPoint(ctypes.Structure):
        _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

    class CGSize(ctypes.Structure):
        _fields_ = [("width", ctypes.c_double), ("height", ctypes.c_double)]

    class CGRect(ctypes.Structure):
        _fields_ = [("origin", CGPoint), ("size", CGSize)]

    cg.CGMainDisplayID.restype = ctypes.c_uint32
    cg.CGDisplayBounds.argtypes = [ctypes.c_uint32]
    cg.CGDisplayBounds.restype = CGRect
    rect = cg.CGDisplayBounds(cg.CGMainDisplayID())
    return rect.size.width, rect.size.height


def _mouse(kind, x, y, botao, cliques=1):
    cg = _cg()
    ev = cg.CGEventCreateMouseEvent(None, kind, _Ponto(x, y), botao)
    if not ev:
        raise RuntimeError("evento_mouse")
    if cliques > 1:
        cg.CGEventSetIntegerValueField(ev, 1, cliques)  # kCGMouseEventClickState
    cg.CGEventPost(0, ev)
    _cf().CFRelease(ev)


def _scroll(x, y, dx, dy):
    _mouse(5, x, y, 0)
    cg = _cg()
    # A versão 2 não é variádica; no arm64 a variádica recebe o segundo eixo errado via ctypes.
    ev = cg.CGEventCreateScrollWheelEvent2(None, 0, 2, int(dy), int(dx), 0)
    if not ev:
        raise RuntimeError("evento_scroll")
    cg.CGEventPost(0, ev)
    _cf().CFRelease(ev)


def _digitar(texto):
    import ctypes
    cg = _cg()
    unidades = list(memoryview(texto.encode("utf-16-le")).cast("H"))
    # O macOS só aceita 20 unidades UTF-16 por evento; o resto seria descartado em silêncio.
    i = 0
    while i < len(unidades):
        fim = min(i + 20, len(unidades))
        if fim < len(unidades) and 0xD800 <= unidades[fim - 1] <= 0xDBFF:
            fim -= 1  # não separar um par substituto (emoji)
        pedaco = unidades[i:fim]
        buf = (ctypes.c_uint16 * len(pedaco))(*pedaco)
        for down in (True, False):
            ev = cg.CGEventCreateKeyboardEvent(None, 0, down)
            if not ev:
                raise RuntimeError("evento_teclado")
            cg.CGEventKeyboardSetUnicodeString(ev, len(pedaco), buf)
            cg.CGEventPost(0, ev)
            _cf().CFRelease(ev)
        i = fim


def _tecla(tecla, mods):
    if tecla in {"return", "enter", "tab", "escape", "space", "delete", "up", "down", "left", "right"}:
        codigo = {"return": 36, "enter": 36, "tab": 48, "escape": 53, "space": 49,
                  "delete": 51, "left": 123, "right": 124, "down": 125, "up": 126}[tecla]
        cg = _cg()
        flags = 0
        if "shift" in mods:
            flags |= 1 << 17
        if "control" in mods:
            flags |= 1 << 18
        if "option" in mods:
            flags |= 1 << 19
        if "command" in mods:
            flags |= 1 << 20
        for down in (True, False):
            ev = cg.CGEventCreateKeyboardEvent(None, codigo, down)
            if flags:
                cg.CGEventSetFlags(ev, flags)
            cg.CGEventPost(0, ev)
            _cf().CFRelease(ev)
        return
    if mods and tecla in _CODIGO_ANSI:
        # Atalho (cmd+c, shift+a...): código físico ANSI com os flags, como o teclado real.
        cg = _cg()
        for down in (True, False):
            ev = cg.CGEventCreateKeyboardEvent(None, _CODIGO_ANSI[tecla], down)
            if not ev:
                raise RuntimeError("evento_teclado")
            cg.CGEventSetFlags(ev, _flags(mods))
            cg.CGEventPost(0, ev)
            _cf().CFRelease(ev)
        return
    if mods:
        raise RuntimeError("atalho_nao_mapeado")
    _digitar(tecla)


_CODIGO_ANSI = {
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
    "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
    "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29, "o": 31,
    "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
}


def _flags(mods):
    flags = 0
    for nome, bit in (("shift", 17), ("control", 18), ("option", 19), ("command", 20)):
        if nome in mods:
            flags |= 1 << bit
    return flags


def entrada_segura():
    try:
        import ctypes
        hi = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/Carbon.framework/Frameworks/HIToolbox.framework/HIToolbox")
        hi.IsSecureEventInputEnabled.restype = ctypes.c_bool
        return bool(hi.IsSecureEventInputEnabled())
    except Exception:
        return False


_cg_lib = None
_cf_lib = None
_Ponto = None


def _cg():
    global _cg_lib, _Ponto
    import ctypes
    if _cg_lib is None:
        _cg_lib = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")

        class CGPoint(ctypes.Structure):
            _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

        _Ponto = CGPoint
        _cg_lib.CGEventCreateMouseEvent.restype = ctypes.c_void_p
        _cg_lib.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
        _cg_lib.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
        _cg_lib.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
        _cg_lib.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
        _cg_lib.CGEventKeyboardSetUnicodeString.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_void_p]
        _cg_lib.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
        _cg_lib.CGEventSetIntegerValueField.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int64]
        _cg_lib.CGEventCreateScrollWheelEvent2.restype = ctypes.c_void_p
        _cg_lib.CGEventCreateScrollWheelEvent2.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_int32, ctypes.c_int32, ctypes.c_int32]
    return _cg_lib


def _cf():
    global _cf_lib
    import ctypes
    if _cf_lib is None:
        _cf_lib = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        _cf_lib.CFRelease.argtypes = [ctypes.c_void_p]
    return _cf_lib
