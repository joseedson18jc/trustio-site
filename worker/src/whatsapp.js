/**
 * WhatsApp automático pela Evolution API (a mesma do aviso do Agentio,
 * supabase/functions/aviso-agente). Segredos (wrangler secret put):
 *   EVOLUTION_URL       ex.: https://evolution.trustio.com.br
 *   EVOLUTION_INSTANCE  instância conectada ao número que envia
 *   EVOLUTION_API_KEY   chave da Evolution API
 * Sem os três, nada é enviado e quem chamou sabe disso (enviado: false).
 */

const PRAZO_MS = 10000;

export const whatsappConfigurado = (env) => Boolean(env.EVOLUTION_URL && env.EVOLUTION_INSTANCE && env.EVOLUTION_API_KEY);

/** Número brasileiro só com dígitos e DDI 55. */
export function numeroBR(bruto) {
  const d = String(bruto || "").replace(/\D/g, "");
  return d.length <= 11 ? "55" + d : d;
}

export async function enviarWhatsapp(env, numero, texto) {
  if (!whatsappConfigurado(env)) return { enviado: false, motivo: "nao_configurado" };
  const base = String(env.EVOLUTION_URL).replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE)}`, {
      method: "POST",
      signal: AbortSignal.timeout(PRAZO_MS),
      headers: { apikey: env.EVOLUTION_API_KEY, "Content-Type": "application/json" },
      // "text" é o formato da Evolution v2; "textMessage", o da v1. Cada versão ignora o outro.
      body: JSON.stringify({ number: numeroBR(numero), text: texto, textMessage: { text: texto } }),
    });
    if (!r.ok) {
      console.error("whatsapp_falhou", r.status, (await r.text()).slice(0, 200));
      return { enviado: false, motivo: `http_${r.status}` };
    }
    return { enviado: true };
  } catch (err) {
    console.error("whatsapp_falhou", err.message);
    return { enviado: false, motivo: "erro_de_rede" };
  }
}

export const brl = (centavos) => "R$ " + (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MENSAGENS = {
  recebido: (nome) =>
    `Olá, ${nome}! Recebemos seu cadastro no programa de parcerias da Trustio. ` +
    `O programa é exclusivo — apenas 100 vagas para todo o País. Tempo de análise: até 30 minutos. ` +
    `A confirmação chega aqui e no seu e-mail.`,
  aprovado: (nome, link, cupom) =>
    `Parabéns, ${nome}! Seu cadastro no programa de afiliados da Trustio foi aprovado. 🎉\n\n` +
    `Seu link: ${link}\n` +
    (cupom ? `Seu cupom: ${cupom} (10% de desconto na 1ª cobrança de quem comprar)\n` : "") +
    `\nCada venda pelo link ou cupom gera comissão fixa, paga via a chave Pix cadastrada. Também enviamos tudo no seu e-mail.`,
  comissao: (nome, valorComissao, valorVenda) =>
    `${nome}, você fez uma venda! 💰 Venda de ${brl(valorVenda)} pelo seu link/cupom Trustio. ` +
    `Comissão: ${brl(valorComissao)}, que vai para a sua chave Pix cadastrada.`,
};
