// Relé da voz em tempo real (worker/src/voz-tempo-real.js), com sockets e fetch simulados: nada sai para a rede.
import {
  PRAZO_PRONTA_MS, XAI_REALTIME, abrirXai, devolucoes, devolverBlocos, limitado, vozTempoReal, filtrarDaXai, filtrarDoCliente, pedir, prepararSessao, rele, reservar, sessaoTrustio, situacao, taxaPedida, tokenDoProtocolo,
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
  agora = 899_400;  // 899,4 s depois: o relógio dispara antes da hora e remarca
  teto.f();
  ok(!cliente.fechado, "relógio adiantado não encerra antes do concedido");
  agora = 900_000;
  timers[timers.length - 1].f();
  ok(cliente.fechado && xai.fechado, "no teto o relé fecha os dois lados");
  ok(cliente.enviados.map(d => json(d)).some(e => e.type === "trustio.fim" && e.motivo === "limite"), "navegador fica sabendo que acabou o tempo");
  ok(usados && usados.u === 900 && usados.m === "limite", "conta os 900 s usados");
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
  ok(certo.ok && certo.usuario.id === "u1" && certo.reserva.segundos === 900, "assinante: primeiro bloco reservado");
  const rpcReserva = m.chamadas.find(c => c.u.includes("/rpc/reservar_voz_tempo_real"));
  ok(rpcReserva && rpcReserva.corpo.p_segundos === 120 && rpcReserva.corpo.p_limite === 3600, "reserva só o primeiro bloco (120 s), com teto diário de 3600 s");
  ok(certo.total === 900, "sessão planejada: 900 s (cabe no que resta do dia)");
  ok((await prepararSessao("tok", env, montar({ reserva: { ok: true, segundos: 120, dia: "2026-10-28", restante: 200 } }).f)).total === 320, "sessão planejada encolhe ao que resta do dia");
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

// ---- relé em blocos: renova antes de acabar, para no que foi concedido, devolve só a sobra
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms, em: agora + ms }); return timers.length; };
  const disparar = async (ate) => {
    // roda, em ordem, os timers que vencem até `ate` (inclusive os que eles mesmos marcam)
    for (;;) {
      timers.sort((a, b) => a.em - b.em);
      const t = timers[0];
      if (!t || t.em > ate) break;
      timers.shift(); agora = t.em; t.f(); await new Promise((r) => setTimeout(r, 0));
    }
    agora = ate;
  };
  const pedidos = []; let resposta = 120, fimInfo = null;
  const r = rele({ cliente, xai, segundos: 120, total: 300, taxa: 24000, env: {}, agora: () => agora, relogio,
    renovar: async (n) => { pedidos.push(n); return resposta; },
    aoFim: (u, m, concedido) => { fimInfo = { u, m, concedido }; } });
  r.xaiPronta();
  // a pessoa segue falando: o vigia de inatividade não pode desligar
  const falar = setInterval(() => cliente.emitir("message", { data: new Uint8Array(960) }), 0);
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });
  const pronto = cliente.enviados.map(d => json(d)).find(e => e.type === "trustio.pronto");
  ok(pronto && pronto.segundos === 300, "trustio.pronto mostra a sessão planejada, não só o bloco");
  const vivo = async (ate) => { for (let t = agora; t < ate; t += 5_000) { await disparar(t); cliente.emitir("message", { data: new Uint8Array(960) }); } await disparar(ate); };
  await vivo(89_000);
  ok(pedidos.length === 0, "antes de 90 s não renova");
  await vivo(91_000);
  ok(pedidos.length === 1 && pedidos[0] === 120, "30 s antes do fim do bloco pede mais 120 s");
  await vivo(125_000);
  ok(!fimInfo, "com o bloco renovado, passa dos 120 s");
  resposta = 0;  // o dia acabou: a próxima renovação é recusada
  await vivo(211_000);
  ok(pedidos.length === 2 && pedidos[1] === 60, "segunda renovação pede só o que falta para os 300 s");
  await vivo(239_000);
  ok(!fimInfo, "recusada a renovação, segue até o fim do que já foi concedido");
  await vivo(241_000);
  clearInterval(falar);
  ok(fimInfo && fimInfo.m === "limite" && fimInfo.concedido === 240, "para em 240 s, o que foi concedido");
  ok(cliente.enviados.map(d => json(d)).some(e => e.type === "trustio.fim" && e.motivo === "limite"), "navegador fica sabendo do fim");
}

// ---- relé em blocos: renovação que falha (rede) não derruba, só não estende
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms, em: agora + ms }); return timers.length; };
  let fimInfo = null;
  const r = rele({ cliente, xai, segundos: 120, total: 900, taxa: 24000, env: {}, agora: () => agora, relogio,
    renovar: async () => { throw new Error("rede"); }, aoFim: (u, m, c) => { fimInfo = { u, m, c }; } });
  r.xaiPronta();
  cliente.close(1000, "tchau");
  ok(fimInfo && fimInfo.c === 120 && fimInfo.m === "navegador", "fechou cedo: aoFim recebe o concedido (120) para devolver a sobra");
}

// ---- devolução da sobra: dos blocos mais novos para os mais velhos, cada um no seu dia
{
  const b = [{ dia: "2026-10-28", segundos: 120 }, { dia: "2026-10-28", segundos: 120 }, { dia: "2026-10-29", segundos: 60 }];
  const d = devolucoes(b, 100);
  ok(d.length === 2 && d[0].dia === "2026-10-29" && d[0].segundos === 60 && d[1].segundos === 40, "sobra de 100 s: 60 do bloco de hoje, 40 do anterior");
  ok(devolucoes(b, 0).length === 0 && devolucoes(b, -5).length === 0, "sem sobra, nada a devolver");
  ok(devolucoes(b, 9999).reduce((t, x) => t + x.segundos, 0) === 300, "nunca devolve mais do que foi reservado");
}

// ---- relé em blocos: a pessoa fecha durante uma renovação; o bloco que chega depois entra na conta
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms, em: agora + ms }); return timers.length; };
  let soltar; const fimInfo = [];
  const r = rele({ cliente, xai, segundos: 120, total: 900, taxa: 24000, env: {}, agora: () => agora, relogio,
    renovar: () => new Promise((res) => { soltar = res; }), aoFim: (u, m, c) => fimInfo.push({ u, m, c }) });
  r.xaiPronta();
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });
  agora = 90_000; timers.filter(t => t.em <= 90_000 && t.f.name === "renovarAntes").forEach(t => t.f());
  ok(typeof soltar === "function", "renovação em curso aos 90 s");
  agora = 95_000; cliente.close(1000, "tchau");
  ok(fimInfo.length === 0, "fechou durante a renovação: espera a resposta antes de devolver");
  soltar(120); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  ok(fimInfo.length === 1 && fimInfo[0].c === 240 && fimInfo[0].u === 95, "o bloco que chegou depois entra no concedido (240) para ser devolvido");
}

// ---- relé em blocos: erro de rede na renovação tenta de novo; recusa de verdade não
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms, em: agora + ms }); return timers.length; };
  let tentativas = 0, fimInfo = null;
  const r = rele({ cliente, xai, segundos: 120, total: 900, taxa: 24000, env: {}, agora: () => agora, relogio,
    renovar: async () => { tentativas++; if (tentativas === 1) throw new Error("rede"); return 120; },
    aoFim: (u, m, c) => { fimInfo = { u, m, c }; } });
  r.xaiPronta();
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });   // sessão confirmada: o prazo da xAI não encerra
  const rodar = async (ate) => {
    for (;;) {
      timers.sort((a, b) => a.em - b.em); const t = timers[0];
      if (!t || t.em > ate) break;
      timers.shift(); agora = t.em; cliente.emitir("message", { data: new Uint8Array(960) }); t.f();
      await new Promise((r) => setTimeout(r, 0));
    }
    agora = ate;
  };
  await rodar(91_000);
  ok(tentativas === 1, "primeira renovação falhou na rede");
  await rodar(97_000);
  ok(tentativas === 2, "tenta de novo 5 s depois");
  await rodar(125_000);
  ok(!fimInfo, "com a segunda tentativa, passa do primeiro bloco");
  cliente.close(1000, "tchau");
}

// ---- arredonda para cima os segundos usados
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0, fimInfo = null;
  const r = rele({ cliente, xai, segundos: 120, taxa: 24000, env: {}, agora: () => agora, relogio: () => 0, aoFim: (u) => { fimInfo = u; } });
  r.xaiPronta();
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });
  agora = 12_300; cliente.close(1000, "tchau");
  ok(fimInfo === 13, "12,3 s contam como 13 s");
}

// ---- prazo: a xAI conectou mas nunca confirmou a sessão; desliga no prazo, não no teto
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  const relogio = (f, ms) => { timers.push({ f, ms }); return timers.length; };
  let fimInfo = null;
  const r = rele({ cliente, xai, segundos: 120, total: 900, taxa: 24000, env: {}, agora: () => agora, relogio, aoFim: (u, m) => { fimInfo = { u, m }; } });
  r.xaiPronta();
  const prazo = timers.find(t => t.ms === PRAZO_PRONTA_MS);
  ok(!!prazo && PRAZO_PRONTA_MS < 120_000, "prazo para a xAI confirmar a sessão marcado, menor que o bloco");
  agora = PRAZO_PRONTA_MS; prazo?.f();
  ok(fimInfo && fimInfo.m === "xai", "sem session.updated no prazo: a sessão termina com motivo xai");
  ok(cliente.fechado && xai.fechado, "e os dois lados fecham");
  ok(fimInfo && fimInfo.u === 0, "conversa que a xAI nunca confirmou não gasta a cota: 0 s usados");
}
// ---- prazo: a xAI nem chegou a conectar (xaiPronta nunca chamada)
{
  const cliente = socketFalso();
  let agora = 0; const timers = [];
  let motivo = null;
  rele({ cliente, xai: null, segundos: 120, taxa: 24000, env: {}, agora: () => agora, relogio: (f, ms) => { timers.push({ f, ms }); }, aoFim: (u, m) => { motivo = m; } });
  agora = PRAZO_PRONTA_MS; timers.find(t => t.ms === PRAZO_PRONTA_MS)?.f();
  ok(motivo === "xai" && cliente.fechado, "xAI que nunca abriu: o navegador é avisado e fechado no prazo");
}
// ---- prazo: sessão confirmada a tempo não é derrubada
{
  const cliente = socketFalso(), xai = socketFalso();
  let agora = 0; const timers = [];
  let motivo = null;
  const r = rele({ cliente, xai, segundos: 120, taxa: 24000, env: {}, agora: () => agora, relogio: (f, ms) => { timers.push({ f, ms }); }, aoFim: (u, m) => { motivo = m; } });
  r.xaiPronta();
  xai.emitir("message", { data: JSON.stringify({ type: "session.updated", session: {} }) });
  agora = PRAZO_PRONTA_MS; timers.find(t => t.ms === PRAZO_PRONTA_MS)?.f();
  ok(motivo === null && !cliente.fechado, "sessão confirmada: o prazo não encerra nada");
  cliente.close(1000, "tchau");
}

// ---- pedir: chamada de rede que não responde, ou que trava no corpo, falha no prazo e é abortada
{
  let sinal = null, erro = null;
  const inicio = Date.now();
  try { await pedir((url, init) => { sinal = init.signal; return new Promise(() => {}); }, "https://x", { method: "POST" }, 30); } catch (e) { erro = e; }
  ok(erro && erro.message === "prazo" && Date.now() - inicio < 1000, "fetch travado: rejeita com 'prazo'");
  ok(sinal && sinal.aborted, "e o pedido travado é abortado");
  let sinal2 = null; erro = null;
  try { await pedir(async (url, init) => { sinal2 = init.signal; return { ok: true, status: 200, text: () => new Promise(() => {}) }; }, "https://x", {}, 30); } catch (e) { erro = e; }
  ok(erro && erro.message === "prazo" && sinal2.aborted, "cabeçalhos chegaram mas o corpo travou: também falha no prazo");
  const r = await pedir(async () => new Response("oi", { status: 201 }), "https://x", {}, 30);
  ok(r.ok && r.status === 201 && r.texto === "oi", "resposta a tempo: devolve status e corpo");
}
// ---- reserva que responde depois do prazo: o bloco reservado no banco é devolvido, não fica perdido
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srv" };
  const chamadas = []; let soltar;
  const f = (url, init) => {
    const u = String(url); chamadas.push({ u, corpo: JSON.parse(init.body) });
    if (u.includes("/rpc/reservar_voz_tempo_real")) return new Promise((res) => { soltar = res; });
    return Promise.resolve(new Response("", { status: 200 }));
  };
  let erro = null;
  try { await reservar(env, f, "u1", 120, 30); } catch (e) { erro = e; }
  ok(erro && erro.message === "prazo", "reserva lenta: falha com 'prazo'");
  ok(!chamadas.some(c => c.u.includes("devolver")), "antes de a resposta chegar, nada a devolver");
  soltar(new Response(JSON.stringify({ ok: true, segundos: 120, dia: "2026-11-26", restante: 500 }), { status: 200 }));
  await new Promise((res) => setTimeout(res, 20));
  const dev = chamadas.find(c => c.u.includes("/rpc/devolver_voz_tempo_real"));
  ok(dev && dev.corpo.p_user_id === "u1" && dev.corpo.p_dia === "2026-11-26" && dev.corpo.p_segundos === 120, "o bloco que chegou atrasado é devolvido na hora");
  const g = async (url) => new Response(JSON.stringify({ ok: true, segundos: 60, dia: "2026-11-26", restante: 0 }), { status: 200 });
  ok((await reservar(env, g, "u1", 60, 30)).segundos === 60, "reserva a tempo: devolve a resposta do banco");
}
// ---- Supabase travado: prepararSessao recusa no prazo em vez de segurar a pessoa em "Conectando…"
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "pub", SUPABASE_SERVICE_ROLE_KEY: "srv", VOZ_XAI_API_KEY: "k" };
  const travado = () => new Promise(() => {});
  const p = await Promise.race([prepararSessao("tok", env, travado, 30), new Promise((res) => setTimeout(() => res("travou"), 1000))]);
  ok(p !== "travou" && p.ok === false && p.motivo === "nao_autorizado", "login travado: nao_autorizado no prazo");
  const f = async (url) => (String(url).endsWith("/auth/v1/user")
    ? new Response(JSON.stringify({ id: "u1", email_confirmed_at: "2026-10-01" }), { status: 200 }) : travado());
  const q = await Promise.race([prepararSessao("tok", env, f, 30), new Promise((res) => setTimeout(() => res("travou"), 1000))]);
  ok(q !== "travou" && q.ok === false && q.motivo === "indisponivel", "reserva travada: indisponivel no prazo");
}
// ---- xAI travada na abertura: abrirXai falha no prazo; socket que chega atrasado é fechado
{
  const env = { VOZ_XAI_API_KEY: "k" };
  let erro = null, soltar;
  const atrasado = { aceito: false, fechado: false, accept() { this.aceito = true; }, close() { this.fechado = true; } };
  try { await abrirXai(env, () => new Promise((res) => { soltar = res; }), 30); } catch (e) { erro = e; }
  ok(erro && erro.message === "prazo", "abertura travada: falha com 'prazo'");
  soltar({ status: 101, webSocket: atrasado }); await new Promise((res) => setTimeout(res, 0));
  ok(atrasado.fechado, "socket da xAI que abriu depois do prazo é fechado (nada fica pendurado)");
  const bom = { aceito: false, accept() { this.aceito = true; }, close() {} };
  let pedido = null;
  const ws = await abrirXai(env, async (url, init) => { pedido = { url, init }; return { status: 101, webSocket: bom }; }, 30);
  ok(ws === bom && bom.aceito, "abertura normal: devolve o socket aceito");
  ok(String(pedido.url).startsWith("https://api.x.ai/v1/realtime") && pedido.init.headers.Authorization === "Bearer k", "abre na xAI com a chave do worker");
}

// ---- cobrança: só conta tempo de conversa que a xAI confirmou
{
  const cliente = socketFalso();
  let agora = 0, usados = null;
  rele({ cliente, xai: null, segundos: 120, taxa: 24000, env: {}, agora: () => agora, relogio: () => 0, aoFim: (u) => { usados = u; } });
  agora = 5_000; cliente.close(1000, "tchau");
  ok(usados === 0, "fechou antes de a xAI ficar pronta: 0 s usados");
}

// ---- a xAI só é aberta para conta válida (antes abria para qualquer texto com cara de JWT)
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "pub", SUPABASE_SERVICE_ROLE_KEY: "srv", VOZ_XAI_API_KEY: "k" };
  const montar = (statusUsuario, usuario) => {
    const ordem = [];
    const f = async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/v1/user")) { ordem.push("conta"); return new Response(JSON.stringify(usuario), { status: statusUsuario }); }
      ordem.push("reserva");
      return new Response(JSON.stringify({ ok: true, segundos: 120, dia: "2026-11-26", restante: 500 }), { status: 200 });
    };
    return { f, ordem };
  };
  let m = montar(401, {});
  await prepararSessao("tok", env, m.f, 1000, () => m.ordem.push("xai"));
  ok(!m.ordem.includes("xai"), "token inválido: a xAI nem é aberta");
  m = montar(200, { id: "u1", email_confirmed_at: null });
  await prepararSessao("tok", env, m.f, 1000, () => m.ordem.push("xai"));
  ok(!m.ordem.includes("xai"), "e-mail sem confirmar: a xAI nem é aberta");
  m = montar(200, { id: "u1", email_confirmed_at: "2026-10-01" });
  const p = await prepararSessao("tok", env, m.f, 1000, () => m.ordem.push("xai"));
  ok(p.ok && m.ordem.join(",") === "conta,xai,reserva", "conta válida: a xAI abre logo depois da conta, junto com a reserva");
}

// ---- limite de pedidos por IP (binding VOZ_LIMITADOR do Cloudflare)
{
  const req = (ip, upgrade) => new Request("https://api.trustio.com.br/voz/tempo-real", { headers: { "cf-connecting-ip": ip, ...(upgrade ? { upgrade: "websocket" } : {}) } });
  const chaves = [];
  const env = { VOZ_LIMITADOR: { limit: async ({ key }) => { chaves.push(key); return { success: key !== "9.9.9.9" }; } } };
  ok(await limitado(req("1.1.1.1"), env) === false && chaves[0] === "1.1.1.1", "dentro do limite passa; a chave é o IP");
  ok(await limitado(req("9.9.9.9"), env) === true, "acima do limite: barrado");
  ok(await limitado(req("9.9.9.9"), {}) === false, "sem o binding configurado: não barra ninguém");
  ok(await limitado(req("9.9.9.9"), { VOZ_LIMITADOR: { limit: async () => { throw new Error("fora"); } } }) === false, "limitador fora do ar: não derruba a voz");
  const json = (status, corpo) => new Response(JSON.stringify(corpo), { status });
  const r1 = await vozTempoReal(req("9.9.9.9"), env, {}, "https://trustio.com.br", { json, ORIGENS: /trustio/ });
  ok(r1.status === 401, "GET de situação não entra no limite (IP compartilhado não esconde o botão): segue para a conferência da conta");
  const r2 = await vozTempoReal(req("9.9.9.9", true), env, {}, "https://trustio.com.br", { json, ORIGENS: /trustio/ });
  ok(r2.status === 429, "WebSocket acima do limite: 429, sem abrir nada");
}

// ---- devolução: falha de rede tenta de novo; prazo estourado não (o banco pode já ter devolvido)
{
  const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "srv" };
  const blocos = [{ dia: "2026-11-26", segundos: 120 }];
  let n = 0;
  await devolverBlocos(env, async () => { n++; if (n === 1) throw new Error("rede"); return new Response("", { status: 200 }); }, "u1", blocos, 50);
  ok(n === 2, "devolução que falhou na rede é tentada de novo");
  n = 0;
  await devolverBlocos(env, async () => { n++; return new Response("erro", { status: 500 }); }, "u1", blocos, 50);
  ok(n === 2, "erro do banco: duas tentativas e desiste sem estourar");
  n = 0;
  await devolverBlocos(env, () => { n++; return new Promise(() => {}); }, "u1", blocos, 50, 20);
  ok(n === 1, "prazo estourado: não repete (evita devolver em dobro)");
}

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log("voz-tempo-real: tudo ok");
