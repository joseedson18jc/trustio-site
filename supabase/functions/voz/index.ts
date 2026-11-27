// Trustio · voz das respostas (Supabase Edge Function), 17 out 2026.
// Recebe o texto de uma resposta do chat e devolve o áudio MP3 falado em português.
// Provedores (provedores.ts): xAI primeiro (pt-BR), ElevenLabs de reserva se a xAI falhar.
// Assinantes têm um teto diário; quem está no teste ganha uma demonstração única (~3 respostas).
// As chaves nunca chegam ao navegador.
//
// Segredos (o workflow supabase.yml copia dos secrets do GitHub):
//   VOZ_XAI_API_KEY      chave da xAI só para a voz (nome próprio: XAI_API_KEY a função chat lê como
//                        chave do modelo, e os segredos do projeto valem para todas as funções)
//   XAI_VOICE_ID         voz da xAI, padrão "rex"
//   VOZ_XAI_API_KEY_RESERVA  segunda chave da xAI, tentada se a principal falhar
//   ELEVENLABS_API_KEY   reserva; ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (padrão eleven_v4_turbo)
//   VOZ_LIMITE_DIARIO    caracteres por assinante por dia, padrão 60000 (~1 hora de fala)
//   VOZ_DEMO             caracteres da demonstração única de quem está no teste, padrão 1500
//   VOZ_PRAZO_MS         quanto cada provedor tem para começar a responder antes de a vez passar ao próximo, padrão 30000
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type ConfigVoz } from "./provedores.ts";
import { criarAtendente } from "./pedido.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONFIG: ConfigVoz = {
  xaiKey: (Deno.env.get("VOZ_XAI_API_KEY") ?? "").trim(),
  xaiVoz: (Deno.env.get("XAI_VOICE_ID") ?? "rex").trim(),
  xaiKey2: (Deno.env.get("VOZ_XAI_API_KEY_RESERVA") ?? "").trim(),
  elevenKey: (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim(),
  elevenVoz: (Deno.env.get("ELEVENLABS_VOICE_ID") ?? "").trim(),
  elevenModelo: (Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_v4_turbo").trim(),
  prazoMs: Math.max(1000, Number(Deno.env.get("VOZ_PRAZO_MS") ?? "30000") || 30000),
};
const LIMITE_DIARIO = Math.max(1000, Number(Deno.env.get("VOZ_LIMITE_DIARIO") ?? "60000") || 60000);
const DEMO = Math.max(0, Number(Deno.env.get("VOZ_DEMO") ?? "1500") || 0);

// O atendimento em si fica em pedido.ts (sem Deno nem rede direta, para os testes em tests/voz-pedido.test.mjs).
Deno.serve(criarAtendente({
  criarAdmin: () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }),
  config: CONFIG, limiteDiario: LIMITE_DIARIO, demo: DEMO,
}));
