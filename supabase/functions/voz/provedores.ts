// Provedores de voz, na ordem (17 out 2026): xAI primeiro (pt-BR nativo), ElevenLabs de reserva
// quando a xAI falha ou não está configurada. Recebe o fetch por parâmetro para os testes.

export type ConfigVoz = {
  xaiKey?: string; xaiVoz?: string;
  elevenKey?: string; elevenVoz?: string; elevenModelo?: string;
};
type Provedor = "xai" | "elevenlabs";

export function provedoresConfigurados(c: ConfigVoz): Provedor[] {
  const lista: Provedor[] = [];
  if (c.xaiKey && c.xaiVoz) lista.push("xai");
  if (c.elevenKey && c.elevenVoz) lista.push("elevenlabs");
  return lista;
}

function pedido(p: Provedor, texto: string, idioma: "pt" | "en", c: ConfigVoz): [string, RequestInit] {
  if (p === "xai") {
    return ["https://api.x.ai/v1/tts", {
      method: "POST",
      headers: { "Authorization": `Bearer ${c.xaiKey}`, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({
        text: texto, voice_id: c.xaiVoz, language: idioma === "en" ? "en" : "pt-BR",
        output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
      }),
    }];
  }
  return [`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.elevenVoz ?? "")}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": c.elevenKey ?? "", "Content-Type": "application/json", "Accept": "audio/mpeg" },
    body: JSON.stringify({
      text: texto, model_id: c.elevenModelo || "eleven_v4_turbo", language_code: idioma,
      // Voz firme e clara: estabilidade alta o bastante para não oscilar, sem ficar robótica.
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    }),
  }];
}

// Devolve a resposta de áudio do primeiro provedor que der certo. Falha com "voz_nao_configurada"
// (nenhum provedor) ou "voz_indisponivel" (todos falharam); nesse caso o erro leva `falhas`, só o status
// de cada provedor ("xai:401", "elevenlabs:rede"), nunca o corpo da resposta.
export async function sintetizar(texto: string, idioma: "pt" | "en", c: ConfigVoz,
                                 fetchFn: typeof fetch = fetch): Promise<{ resposta: Response; provedor: Provedor }> {
  const lista = provedoresConfigurados(c);
  if (!lista.length) throw new Error("voz_nao_configurada");
  const falhas: string[] = [];
  for (const p of lista) {
    try {
      const [url, init] = pedido(p, texto, idioma, c);
      const r = await fetchFn(url, init);
      if (r.ok && r.body) return { resposta: r, provedor: p };
      falhas.push(`${p}:${r.status}`);
      console.error(`voz_${p}_status`, r.status, (await r.text().catch(() => "")).slice(0, 200));
    } catch (err) {
      falhas.push(`${p}:rede`);
      console.error(`voz_${p}_rede`, err instanceof Error ? err.message : String(err));
    }
  }
  throw Object.assign(new Error("voz_indisponivel"), { falhas });
}
