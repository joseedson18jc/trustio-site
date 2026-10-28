// Relé da voz em tempo real (worker/src/voz-tempo-real.js), com sockets e fetch simulados: nada sai para a rede.
import {
  XAI_REALTIME, filtrarDaXai, filtrarDoCliente, prepararSessao, rele, sessaoTrustio, situacao, taxaPedida, tokenDoProtocolo,
} from "../src/voz-tempo-real.js";

let falhas = 0;
const ok = (cond, msg) => { if (cond) console.log("ok   " + msg); else { falhas++; console.error("FALHOU " + msg); } };

// Socket falso com a mesma forma do WebSocket dos Workers: send, close, addEventListener.
function socketFalso() {
  const ouvintes = {}, enviados = [];
  return {
    enviados, fechado: null, readyState: 1,
    send(d) { if (this.readyState !== 1) throw new Error("fechado"); enviados.push(d); },
    close(codigo, motivo) { if (this.fechado) return; this.fechado = { codigo, motivo }; this.readyState = 3; (ouvintes.close || []).forEach(f => f({ code: codigo })); },
    addEventListener(t, f) { (ouvintes[t] ||= []).push(f); },
    emitir(t, ev) { (ouvintes[t] || []).forEach(f => f(ev)); },
  };
}
const json = (s) => JSON.parse(s);

// ---- endpoint e taxa
ok(XAI_REALTIME === "wss://api.x.ai/v1/realtime", "endpoint da xAI é wss://api.x.ai/v1/realtime");
ok(taxaPedida(new URL("https://api.trustio.com.br/voz/tempo-real?taxa=48000")) === 48000, "taxa aceita 48000");
ok(taxaPedida(new URL("https://api.trustio.com.br/voz/tempo-real?taxa=12345")) === 24000, "taxa estranha cai para 24000");
ok(taxaPedida(new URL("https://api.trustio.com.br/voz/tempo-real")) === 24000, "sem taxa, 24000");

// ---- token pelo subprotocolo (o navegador não manda cabeçalho no WebSocket)
ok(tokenDoProtocolo("trustio, jwt.aaa.bbb.ccc") === "aaa.bbb.ccc", "token vem do subprotocolo jwt.");
ok(tokenDoProtocolo("trustio") === "", "sem jwt., token vazio");
ok(tokenDoProtocolo(null) === "", "sem cabeçalho, token vazio");

// ---- sessão forçada pelo relé
const s = sessaoTrustio(48000, { VOZ_TEMPO_REAL_VOZ: "eve" });
ok(s.type === "session.update", "sessão é session.update");
ok(Array.isArray(s.session.tools) && s.session.tools.length === 0, "nenhuma ferramenta paga");
ok(s.session.voice === "eve", "voz vem do env");
ok(sessaoTrustio(24000, {}).session.voice === "rex", "voz padrão rex");
ok(s.session.audio.input.transcription.language_hint === "pt-BR", "transcrição em pt-BR");
ok(s.session.audio.input.format.rate === 48000 && s.session.audio.output.format.rate === 48000, "mesma taxa na entrada e na saída");
ok(s.session.audio.input.transport === "binary" && s.session.audio.output.transport === "binary", "áudio binário nos dois sentidos");
ok(s.session.reasoning.effort === "none", "sem raciocínio, para responder rápido");
ok(/português do Brasil/.test(s.session.instructions), "instruções pedem português do Brasil");

// ---- o que o navegador pode mandar
const audio = new Uint8Array(1920);
ok(filtrarDoCliente(audio) === audio, "áudio binário passa");
ok(filtrarDoCliente(new Uint8Array(70000)) === null, "bloco de áudio grande demais é descartado");
// Nos Workers (compatibility_date 2026-09-22) mensagem binária chega como Blob se binaryType não for arraybuffer.
const blob = new Blob([new Uint8Array(960)]);
ok(filtrarDoCliente(blob) === blob, "áudio que chega como Blob também passa");
ok(filtrarDaXai(blob) === blob, "áudio da xAI como Blob também passa");
ok(json(filtrarDoCliente(JSON.stringify({ type: "response.cancel", response: { instructions: "x" } }))).response === undefined,
  "response.cancel passa sem campos extras");
ok(filtrarDoCliente(JSON.stringify({ type: "input_audio_buffer.clear" })) !== null, "input_audio_buffer.clear passa");
for (const t of ["session.update", "response.create", "conversation.item.create"]) {
  ok(filtrarDoCliente(JSON.stringify({ type: t, session: { tools: [{ type: "web_search" }] } })) === null, `${t} do navegador é bloqueado`);
}
ok(filtrarDoCliente("não é json") === null, "texto que não é JSON é descartado");

// ---- o que a xAI manda para o navegador
ok(filtrarDaXai(audio) === audio, "áudio da xAI passa");
ok(filtrarDaXai(JSON.stringify({ type: "session.updated", session: { instructions: "segredo" } })) === null, "session.updated não vaza as instruções");
ok(filtrarDaXai(JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Oi" })) !== null, "transcrição passa");

// ---- relé: sessão, pronto, saudação, teto e devolução
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms }); return timers.length; };
  let usados = null;
  const r = rele({ cliente, xai, segundos: 900, taxa: 24000, env: {}, agora: () => agora, relogio, aoFim: (u, m) => { usados = { u, m }; } });
  cliente.emitir("message", { data: new Uint8Array(960) });          // áudio antes da xAI ficar pronta
  r.xaiPronta();
  ok(cliente.binaryType === "arraybuffer" && xai.binaryType === "arraybuffer", "relé pede ArrayBuffer nos dois sockets");
  ok(json(xai.enviados[0]).type === "session.update", "relé manda a sessão primeiro");
  ok(xai.enviados[1] instanceof Uint8Array, "áudio guardado antes da conexão segue depois da sessão");
  cliente.emitir("message", { data: JSON.stringify({ type: "session.update", session: { instructions: "outra" } }) });
  ok(!xai.enviados.some(d => typeof d === "string" && json(d).session?.instructions === "outra"), "session.update do navegador não chega na xAI");
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });
  const pronto = cliente.enviados.map(d => json(d)).find(e => e.type === "trustio.pronto");
  ok(pronto && pronto.segundos === 900, "navegador recebe trustio.pronto com os segundos da sessão");
  ok(xai.enviados.some(d => typeof d === "string" && json(d).item?.type === "force_message"), "relé manda a saudação curta");
  const teto = timers.find(t => t.ms === 900 * 1000);
  ok(!!teto, "relógio do teto marcado em 900 s");
  agora = 125_400;  // 125,4 s depois
  teto.f();
  ok(cliente.fechado && xai.fechado, "no teto o relé fecha os dois lados");
  ok(cliente.enviados.map(d => json(d)).some(e => e.type === "trustio.fim" && e.motivo === "limite"), "navegador fica sabendo que acabou o tempo");
  ok(usados && usados.u === 126 && usados.m === "limite", "conta 126 s usados (arredonda para cima)");
}

// ---- relé: o navegador fecha, a xAI fecha junto, aoFim uma vez só
{
  const cliente = socketFalso(), xai = socketFalso();
  let chamadas = 0;
  const r = rele({ cliente, xai, segundos: 60, taxa: 24000, env: {}, agora: () => 0, relogio: () => 0, aoFim: () => chamadas++ });
  r.xaiPronta();
  cliente.close(1000, "tchau");
  ok(xai.fechado, "navegador fechou: a xAI fecha");
  xai.emitir("close", {});
  ok(chamadas === 1, "aoFim roda uma vez só");
}

// ---- situação para o botão
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "pub", SUPABASE_SERVICE_ROLE_KEY: "srv", VOZ_XAI_API_KEY: "k" };
  const fetchFalso = async (url) => {
    const u = String(url);
    if (u.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", email_confirmed_at: "2026-10-01" }), { status: 200 });
    if (u.includes("/rpc/voz_tempo_real_situacao")) return new Response(JSON.stringify({ acesso: "livre", restante: 1800 }), { status: 200 });
    throw new Error("fetch inesperado " + u);
  };
  const r = await situacao("tok", env, fetchFalso);
  ok(r.disponivel === true && r.restante_s === 1800, "assinante com segundos: disponível");
  const semChave = await situacao("tok", { ...env, VOZ_XAI_API_KEY: "" }, fetchFalso);
  ok(semChave.disponivel === false, "sem a chave no worker: indisponível");
  const teste = await situacao("tok", env, async (u) => String(u).includes("/rpc/")
    ? new Response(JSON.stringify({ acesso: "teste", restante: 0 }), { status: 200 }) : fetchFalso(u));
  ok(teste.disponivel === false && teste.acesso === "teste", "conta no teste: indisponível, acesso teste");
  const anon = await situacao("tok", env, async (u) => String(u).endsWith("/auth/v1/user") ? new Response("{}", { status: 401 }) : fetchFalso(u));
  ok(anon === null, "token inválido: sem situação");
}


// ---- quem ganha uma sessão: conta, e-mail, plano, chat aberto e cota (prepararSessao)
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "pub", SUPABASE_SERVICE_ROLE_KEY: "srv", VOZ_XAI_API_KEY: "k" };
  const montar = ({ usuario = { id: "u1", email_confirmed_at: "2026-10-01" }, statusUsuario = 200, reserva = { ok: true, segundos: 900, dia: "2026-10-28", restante: 2700 } } = {}) => {
    const chamadas = [];
    const f = async (url, opts = {}) => {
      const u = String(url);
      chamadas.push({ u, corpo: opts.body ? JSON.parse(opts.body) : null });
      if (u.endsWith("/auth/v1/user")) return new Response(JSON.stringify(usuario), { status: statusUsuario });
      if (u.includes("/rpc/reservar_voz_tempo_real")) return new Response(JSON.stringify(reserva), { status: 200 });
      throw new Error("fetch inesperado " + u);
    };
    return { f, chamadas };
  };
  let m = montar();
  ok((await prepararSessao("tok", { ...env, VOZ_XAI_API_KEY: "" }, m.f)).motivo === "nao_configurada", "sem chave: nao_configurada");
  ok(m.chamadas.length === 0, "sem chave: nem consulta a conta");
  ok((await prepararSessao("", env, montar().f)).motivo === "nao_autorizado", "sem token: nao_autorizado");
  ok((await prepararSessao("tok", env, montar({ statusUsuario: 401, usuario: {} }).f)).motivo === "nao_autorizado", "token inválido: nao_autorizado");
  m = montar({ usuario: { id: "u1", email_confirmed_at: null } });
  ok((await prepararSessao("tok", env, m.f)).motivo === "email_nao_confirmado", "e-mail sem confirmar: recusado");
  ok(!m.chamadas.some(c => c.u.includes("/rpc/")), "e-mail sem confirmar: não reserva nada");
  for (const erro of ["voz_tempo_real_assinantes", "acesso_revogado", "chat_ainda_fechado", "voz_tempo_real_limite"]) {
    ok((await prepararSessao("tok", env, montar({ reserva: { ok: false, error: erro } }).f)).motivo === erro, `reserva recusada passa o motivo ${erro}`);
  }
  m = montar();
  const certo = await prepararSessao("tok", env, m.f);
  ok(certo.ok && certo.usuario.id === "u1" && certo.reserva.segundos === 900, "assinante: sessão reservada");
  const rpcReserva = m.chamadas.find(c => c.u.includes("/rpc/reservar_voz_tempo_real"));
  ok(rpcReserva && rpcReserva.corpo.p_segundos === 900 && rpcReserva.corpo.p_limite === 3600, "reserva pede 900 s com teto diário de 3600 s");
  const caiu = await prepararSessao("tok", env, async (u) => { if (String(u).endsWith("/auth/v1/user")) throw new Error("rede"); });
  ok(caiu.motivo === "nao_autorizado", "Supabase fora do ar: recusa sem estourar");
}

// ---- o navegador desistiu antes da xAI abrir: nada fica aberto, aoFim roda na hora
{
  const cliente = socketFalso(), xai = socketFalso();
  cliente.readyState = 3;
  let usados = null;
  const r = rele({ cliente, xai: null, segundos: 900, taxa: 24000, env: {}, agora: () => 0, relogio: () => 0, aoFim: (u, motivo) => { usados = motivo; } });
  ok(usados === "navegador", "navegador já fechado: a sessão termina na hora");
  r.xaiPronta(xai);
  ok(xai.fechado, "e a conexão com a xAI que abriu depois é fechada");
}

// ---- áudio dito durante o login (antes do relé existir) segue para a xAI
{
  const cliente = socketFalso(), xai = socketFalso();
  const antes = [new Uint8Array(960), JSON.stringify({ type: "session.update" }), new Uint8Array(960)];
  const r = rele({ cliente, xai: null, segundos: 60, taxa: 24000, env: {}, agora: () => 0, relogio: () => 0, aoFim: () => {}, antes });
  r.xaiPronta(xai);
  ok(xai.enviados.filter(d => d instanceof Uint8Array).length === 2, "os 2 blocos de áudio do login chegam; o session.update não");
}

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("voz-tempo-real: tudo ok");
