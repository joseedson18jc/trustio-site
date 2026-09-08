"use strict";
// Personaliza a página de confirmação a partir do parâmetro ?plano= definido no redirect do Payment Link.
const plans = {
  diagnostico: ["Diagnóstico contratado.", "Recebemos sua confirmação. Em até 1 dia útil enviamos as datas dos dois workshops de descoberta e o questionário inicial. Entrega do relatório em até 10 dias úteis após o segundo workshop."],
  starter: ["Plano Starter ativo.", "Recebemos sua assinatura. O ambiente privado é provisionado em até 5 dias úteis; você receberá as credenciais da API e o painel de observabilidade por e-mail."],
  pro: ["Plano Pro ativo.", "Recebemos sua assinatura. Um arquiteto da Trustio entra em contato em até 1 dia útil para configurar SSO, integrações e o primeiro caso de uso."],
  dedicado: ["Plano Dedicado ativo.", "Recebemos sua assinatura. Um arquiteto dedicado entra em contato em até 1 dia útil para desenhar GPU, rede e identidade do seu ambiente."],
  pessoal: ["Plano Pessoal ativo.", "Recebemos sua assinatura. Se você assinou antes do lançamento, seu acesso abre em 23 de setembro de 2026 — uma semana antes de todo mundo. Depois do lançamento, o acesso é liberado em até 1 dia útil pelo e-mail do checkout."],
  passe7: ["Passe de 7 dias confirmado.", "Recebemos seu pagamento. Os 7 dias começam a contar quando o acesso é liberado: em 23 de setembro de 2026 para quem comprou antes do lançamento; depois, em até 1 dia útil pelo e-mail do checkout."],
  anual: ["Plano Anual ativo.", "Recebemos sua assinatura com preço travado por 12 meses. Se você assinou antes do lançamento, seu acesso abre em 23 de setembro de 2026; depois do lançamento, em até 1 dia útil pelo e-mail do checkout."]
};
const payLinks = { mensal: ["https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08", "Pagar R$ 79/mês e garantir 23/09"], semanal: ["https://buy.stripe.com/8x228rgiKetN2LRfRl5wI09", "Pagar R$ 24,90 e garantir 23/09"], anual: ["https://buy.stripe.com/cNifZhd6yfxR9afgVp5wI0a", "Pagar R$ 790/ano e garantir 23/09"] };
const qs = new URLSearchParams(location.search);
function listaMode(eyebrow) {
  const e = document.querySelector(".eyebrow"); if (e) { e.innerHTML = '<span class="status-dot"></span> ' + eyebrow; }
  const n = document.querySelector(".thanks-note"); if (n) n.innerHTML = 'Dúvidas: <a href="mailto:contato@trustio.com.br">contato@trustio.com.br</a>';
}
if (qs.get("lista") === "pre") {
  listaMode("Pré-assinatura recebida");
  document.querySelector("[data-plan-title]").textContent = "Você vai entrar em 23 de setembro.";
  const pk = qs.get("plano");
  const actions = document.querySelector(".thanks-actions");
  if (payLinks[pk]) {
    document.querySelector("[data-plan-lead]").textContent = "Recebemos seus dados. Falta só o pagamento (Pix, cartão, Apple Pay ou Google Pay) para garantir seu acesso em 23 de setembro — uma semana antes do lançamento oficial de 1º de outubro. Se preferir pagar depois, o link também vai por e-mail e WhatsApp.";
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = payLinks[pk][0]; a.rel = "noopener"; a.textContent = payLinks[pk][1] + " ↗"; actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  } else {
    document.querySelector("[data-plan-lead]").textContent = "Recebemos o pedido de pré-assinatura da sua empresa. Um arquiteto da Trustio entra em contato em até 1 dia útil com a proposta e o link de pagamento; com o pagamento confirmado antes do lançamento, o acesso abre em 23 de setembro.";
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = "planos.html#empresas"; a.textContent = "Ver planos para empresas"; actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  }
} else if (qs.get("lista") === "espera") {
  listaMode("Lista de espera confirmada");
  document.querySelector("[data-plan-title]").textContent = "Você está na lista de espera.";
  document.querySelector("[data-plan-lead]").textContent = "Lançamento em 1º de outubro de 2026. No dia, você recebe o link de acesso por e-mail e WhatsApp, na ordem da lista, com 5 perguntas grátis no modelo sem censura. Empresas: um arquiteto entra em contato antes para desenhar o ambiente.";
} else if (qs.get("lista") === "pessoal") {
  listaMode("Lista confirmada");
  document.querySelector("[data-plan-title]").textContent = "Você está na lista.";
  document.querySelector("[data-plan-lead]").textContent = "Recebemos seu pedido de acesso individual. Avisamos por e-mail (e pelo WhatsApp, se você deixou) assim que o seu lote abrir. Nada é cobrado até você escolher pagar.";
}
const plan = qs.get("plano");
if (plans[plan]) {
  document.querySelector("[data-plan-title]").textContent = plans[plan][0];
  document.querySelector("[data-plan-lead]").textContent = plans[plan][1];
}
