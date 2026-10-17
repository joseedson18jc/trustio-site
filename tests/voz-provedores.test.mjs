// Testes da ordem dos provedores de voz (supabase/functions/voz/provedores.ts):
// xAI primeiro (pt-BR); se falhar ou não estiver configurada, ElevenLabs; sem nenhum, erro claro.
import assert from "node:assert/strict";
import { provedoresConfigurados, sintetizar } from "../supabase/functions/voz/provedores.ts";

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("ok -", name); };
const audio = (txt) => new Response(new TextEncoder().encode(txt), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
const cfgTudo = { xaiKey: "x", xaiVoz: "rex", elevenKey: "e", elevenVoz: "v1", elevenModelo: "eleven_v4_turbo" };

function fakeFetch(respostas) {
  const chamadas = [];
  const fn = async (url, init) => {
    chamadas.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  fn.chamadas = chamadas;
  return fn;
}

await t("xAI é a primeira, em pt-BR, com a voz configurada", async () => {
  const f = fakeFetch([audio("xai")]);
  const r = await sintetizar("Olá.", "pt", cfgTudo, f);
  assert.equal(r.provedor, "xai");
  assert.equal(await r.resposta.text(), "xai");
  assert.equal(f.chamadas.length, 1);
  assert.equal(f.chamadas[0].url, "https://api.x.ai/v1/tts");
  assert.equal(f.chamadas[0].headers.Authorization, "Bearer x");
  assert.deepEqual({ text: f.chamadas[0].body.text, voice_id: f.chamadas[0].body.voice_id, language: f.chamadas[0].body.language },
    { text: "Olá.", voice_id: "rex", language: "pt-BR" });
  assert.equal(f.chamadas[0].body.output_format.codec, "mp3");
});

await t("inglês vai como en", async () => {
  const f = fakeFetch([audio("xai")]);
  await sintetizar("Hi.", "en", cfgTudo, f);
  assert.equal(f.chamadas[0].body.language, "en");
});

await t("xAI com erro HTTP: cai para a ElevenLabs", async () => {
  const f = fakeFetch([new Response("quota", { status: 429 }), audio("eleven")]);
  const r = await sintetizar("Olá.", "pt", cfgTudo, f);
  assert.equal(r.provedor, "elevenlabs");
  assert.equal(await r.resposta.text(), "eleven");
  assert.match(f.chamadas[1].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/v1\/stream\?output_format=mp3_44100_128$/);
  assert.equal(f.chamadas[1].headers["xi-api-key"], "e");
  assert.equal(f.chamadas[1].body.model_id, "eleven_v4_turbo");
  assert.equal(f.chamadas[1].body.language_code, "pt");
});

await t("xAI fora do ar (rede): cai para a ElevenLabs", async () => {
  const f = fakeFetch([new TypeError("fetch failed"), audio("eleven")]);
  assert.equal((await sintetizar("Olá.", "pt", cfgTudo, f)).provedor, "elevenlabs");
});

await t("sem chave da xAI: vai direto à ElevenLabs", async () => {
  const f = fakeFetch([audio("eleven")]);
  const r = await sintetizar("Olá.", "pt", { ...cfgTudo, xaiKey: "" }, f);
  assert.equal(r.provedor, "elevenlabs");
  assert.equal(f.chamadas.length, 1);
});

await t("os dois falham: erro voz_indisponivel", async () => {
  const f = fakeFetch([new Response("x", { status: 500 }), new Response("y", { status: 401 })]);
  await assert.rejects(sintetizar("Olá.", "pt", cfgTudo, f), /voz_indisponivel/);
});

await t("nenhum configurado", async () => {
  assert.deepEqual(provedoresConfigurados({ xaiKey: "", xaiVoz: "rex", elevenKey: "", elevenVoz: "" }), []);
  assert.deepEqual(provedoresConfigurados(cfgTudo), ["xai", "elevenlabs"]);
  assert.deepEqual(provedoresConfigurados({ ...cfgTudo, elevenVoz: "" }), ["xai"]);
  await assert.rejects(sintetizar("Olá.", "pt", { xaiKey: "", elevenKey: "" }, fakeFetch([])), /voz_nao_configurada/);
});

console.log(`\n${n} testes passaram`);
