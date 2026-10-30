# Testes da validação, do diário e da máquina de estados. Não mexem no mouse.
# Rodar: python3 -m unittest mac/test/trustio_computer_test.py
import json, os, sys, tempfile, time, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trustio_computer as tc


class Validacao(unittest.TestCase):
    def test_grade(self):
        ok, codigo = tc.validar({"action": "click", "x": 1001, "y": 10})
        self.assertFalse(ok)
        self.assertEqual(codigo, "coordenada_fora")
        ok, codigo = tc.validar({"action": "click", "x": 10, "y": 20})
        self.assertTrue(ok)
        self.assertEqual(codigo, "")

    def test_politica(self):
        self.assertEqual(tc.politica({"action": "type", "text": "oi"}, False), "confirm")
        self.assertEqual(tc.politica({"action": "keypress", "key": "tab"}, False), "allow")
        self.assertEqual(tc.politica({"action": "keypress", "key": "return"}, False), "confirm")
        self.assertEqual(tc.politica({"action": "keypress", "key": "a", "modifiers": ["command"]}, False), "confirm")
        self.assertEqual(tc.politica({"action": "click", "x": 1, "y": 1}, True), "deny")

    def test_extrai_tool_call(self):
        bruto = json.dumps({"choices": [{"message": {"tool_calls": [{
            "function": {"name": "computer", "arguments": json.dumps({"action": "move", "x": 1, "y": 2})}
        }]}}]})
        self.assertEqual(tc.extrair_acao(bruto)["action"], "move")


class Sessao(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["TRUSTIO_COMPUTER_ARMED"] = "1"
        tc.configurar(9931, "teste", root=self.tmp.name)
        tc._sessoes.clear()

    def tearDown(self):
        self.tmp.cleanup()

    def test_clique_executa_e_digitar_confirma(self):
        feito = []
        sessao = tc.Sessao("abrir o app")

        def capturar(s, passo):
            return "foto", "data:image/jpeg;base64,AA==", "h1"

        def decidir(goal, trace, data_url, aviso=None):
            return {"action": "click", "x": 10, "y": 20}

        saida = tc.avancar(sessao, capturar, decidir, lambda a: feito.append(a["action"]))
        self.assertEqual(saida["state"], "observing")
        self.assertEqual(feito, ["click"])
        self.assertNotIn("foto", json.dumps(saida))
        jornal = (Path(self.tmp.name) / "sessions" / sessao.id / "journal.jsonl").read_text()
        self.assertIn('"state": "executing"', jornal)
        self.assertNotIn("data:image", jornal)

        def decidir_texto(goal, trace, data_url, aviso=None):
            return {"action": "type", "text": "oi"}

        saida = tc.avancar(sessao, capturar, decidir_texto, lambda a: feito.append("nao"))
        self.assertEqual(saida["state"], "awaiting_confirmation")
        self.assertEqual(feito, ["click"])
        negado = tc.confirmar(sessao, "deny", lambda a: feito.append("nao"))
        self.assertEqual(negado["state"], "paused")

    def test_reinicio_nao_repete(self):
        pasta = Path(self.tmp.name) / "sessions" / ("ab" * 16)
        pasta.mkdir(parents=True)
        (pasta / "session.token").write_text("tok")
        (pasta / "journal.jsonl").write_text(json.dumps({
            "ts": 1760000000.0, "session": "ab" * 16, "step": 2, "state": "executing"
        }) + "\n")
        ids = tc.recuperar(self.tmp.name)
        self.assertEqual(ids, ["ab" * 16])
        ultimo = tc._ultimo(pasta / "journal.jsonl")
        self.assertEqual(ultimo["state"], "recovering")
        self.assertEqual(ultimo["note"], "a ultima acao nao foi repetida")

    def test_acao_invalida_duas_vezes_falha(self):
        sessao = tc.Sessao("x")

        def capturar(s, passo):
            return "f", "data:image/jpeg;base64,AA==", "h" + str(passo)

        def decidir(goal, trace, data_url, aviso=None):
            return {"action": "click", "x": 5000, "y": 1}

        primeira = tc.avancar(sessao, capturar, decidir, lambda a: None)
        self.assertEqual(primeira["state"], "observing")
        self.assertEqual(primeira["error"], "coordenada_fora")
        segunda = tc.avancar(sessao, capturar, decidir, lambda a: None)
        self.assertEqual(segunda["state"], "failed")

    def test_abort_antes_de_executar(self):
        sessao = tc.Sessao("x")
        sessao.abort_flag.set()

        def capturar(s, passo):
            raise AssertionError("capturou")

        saida = tc.avancar(sessao, capturar, lambda *a: None, lambda a: None)
        self.assertEqual(saida["state"], "aborted")


if __name__ == "__main__":
    unittest.main()
