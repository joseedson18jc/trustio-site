"use strict";
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
// Personaliza a página de confirmação a partir do parâmetro ?plano= definido no redirect do Payment Link.
const plans = {
  diagnostico: [T("Diagnóstico contratado.", "Diagnostic booked."), T("Recebemos sua confirmação. Em até 1 dia útil enviamos as datas dos dois workshops de descoberta e o questionário inicial. Entrega do relatório em até 10 dias úteis após o segundo workshop.", "We've received your confirmation. Within 1 business day we'll send the dates for the two discovery workshops and the initial questionnaire. The report is delivered within 10 business days of the second workshop.")],
  starter: [T("Plano Starter ativo.", "Starter plan active."), T("Recebemos sua assinatura. O ambiente privado é provisionado em até 5 dias úteis; você receberá as credenciais da API e o painel de observabilidade por e-mail.", "We've received your subscription. The private environment is provisioned within 5 business days; you'll get your API credentials and the observability dashboard by email.")],
  pro: [T("Plano Pro ativo.", "Pro plan active."), T("Recebemos sua assinatura. Um arquiteto da Trustio entra em contato em até 1 dia útil para configurar SSO, integrações e o primeiro caso de uso.", "We've received your subscription. A Trustio architect will reach out within 1 business day to set up SSO, integrations and the first use case.")],
  dedicado: [T("Plano Dedicado ativo.", "Dedicated plan active."), T("Recebemos sua assinatura. Um arquiteto dedicado entra em contato em até 1 dia útil para desenhar GPU, rede e identidade do seu ambiente.", "We've received your subscription. A dedicated architect will reach out within 1 business day to design your environment's GPU, network and identity.")],
  pessoal: [T("Plano Pessoal ativo.", "Personal plan active."), T("Recebemos sua assinatura. Seu acesso é liberado em até 1 dia útil pelo e-mail do checkout, sem esperar o lançamento de 1º de outubro de 2026.", "We've received your subscription. Your access is granted within 1 business day, at the email you used at checkout, without waiting for the October 1, 2026 launch.")],
  passe7: [T("Passe de 7 dias confirmado.", "7-day pass confirmed."), T("Recebemos seu pagamento. O acesso é liberado em até 1 dia útil pelo e-mail do checkout, e os 7 dias só começam a contar a partir daí.", "We've received your payment. Access is granted within 1 business day, at the email you used at checkout, and the 7 days only start counting from then.")],
  anual: [T("Plano Anual ativo.", "Annual plan active."), T("Recebemos sua assinatura com preço travado por 12 meses. Seu acesso é liberado em até 1 dia útil pelo e-mail do checkout, sem esperar o lançamento de 1º de outubro de 2026.", "We've received your subscription, with the price locked for 12 months. Your access is granted within 1 business day, at the email you used at checkout, without waiting for the October 1, 2026 launch.")]
};
const payLinks = { mensal: ["https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08", T("Pagar R$ 79/mês e entrar em até 1 dia útil", "Pay R$ 79/month and get in within 1 business day")], semanal: ["https://buy.stripe.com/8x228rgiKetN2LRfRl5wI09", T("Pagar R$ 24,90 e entrar em até 1 dia útil", "Pay R$ 24.90 and get in within 1 business day")], anual: ["https://buy.stripe.com/cNifZhd6yfxR9afgVp5wI0a", T("Pagar R$ 790/ano e entrar em até 1 dia útil", "Pay R$ 790/year and get in within 1 business day")] };
const qs = new URLSearchParams(location.search);
function listaMode(eyebrow) {
  const e = document.querySelector(".eyebrow"); if (e) { e.innerHTML = '<span class="status-dot"></span> ' + eyebrow; }
  const n = document.querySelector(".thanks-note"); if (n) n.innerHTML = T('Dúvidas: ', 'Questions: ') + '<a href="mailto:contato@trustio.com.br">contato@trustio.com.br</a>';
}
if (qs.get("lista") === "pre") {
  listaMode(T("Pré-assinatura recebida", "Pre-subscription received"));
  document.querySelector("[data-plan-title]").textContent = T("Falta só o pagamento.", "Just the payment left.");
  const pk = qs.get("plano");
  const actions = document.querySelector(".thanks-actions");
  if (payLinks[pk]) {
    document.querySelector("[data-plan-lead]").textContent = T("Recebemos seus dados. Falta só o pagamento (Pix, cartão, Apple Pay ou Google Pay): confirmado, seu acesso é liberado em até 1 dia útil, sem esperar o lançamento oficial de 1º de outubro. Se preferir pagar depois, o link também vai por e-mail e WhatsApp.", "We've got your details. All that's left is payment (Pix, card, Apple Pay or Google Pay): once confirmed, your access is granted within 1 business day, without waiting for the official October 1 launch. If you'd rather pay later, the link is also on its way by email and WhatsApp.");
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = payLinks[pk][0]; a.rel = "noopener"; a.textContent = payLinks[pk][1] + " ↗"; actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  } else {
    document.querySelector("[data-plan-lead]").textContent = T("Recebemos o pedido de pré-assinatura da sua empresa. Um arquiteto da Trustio entra em contato em até 1 dia útil com a proposta e o link de pagamento; com o pagamento confirmado, o ambiente é liberado no prazo do plano escolhido.", "We've received your company's pre-subscription request. A Trustio architect will reach out within 1 business day with the proposal and the payment link; once payment is confirmed, the environment is delivered within your chosen plan's timeline.");
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = "planos.html#empresas"; a.textContent = T("Ver planos para empresas", "See plans for businesses"); actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  }
} else if (qs.get("lista") === "espera") {
  listaMode(T("Lista de espera confirmada", "Waitlist confirmed"));
  document.querySelector("[data-plan-title]").textContent = T("Você está na lista de espera.", "You're on the waitlist.");
  document.querySelector("[data-plan-lead]").textContent = T("Lançamento em 1º de outubro de 2026. No dia, você recebe o link de acesso por e-mail e WhatsApp, na ordem da lista, com 5 perguntas grátis no modelo sem censura. Empresas: um arquiteto entra em contato antes para desenhar o ambiente.", "Launching October 1, 2026. On the day, you'll get your access link by email and WhatsApp, in list order, with 5 free questions on the uncensored model. Businesses: an architect will reach out beforehand to design your environment.");
} else if (qs.get("lista") === "pessoal") {
  listaMode(T("Lista confirmada", "List confirmed"));
  document.querySelector("[data-plan-title]").textContent = T("Você está na lista.", "You're on the list.");
  document.querySelector("[data-plan-lead]").textContent = T("Recebemos seu pedido de acesso individual. Avisamos por e-mail (e pelo WhatsApp, se você deixou) assim que o seu lote abrir. Nada é cobrado até você escolher pagar.", "We've received your request for individual access. We'll let you know by email (and on WhatsApp, if you left your number) as soon as your batch opens. Nothing is charged until you choose to pay.");
}
const plan = qs.get("plano");
if (plans[plan]) {
  document.querySelector("[data-plan-title]").textContent = plans[plan][0];
  document.querySelector("[data-plan-lead]").textContent = plans[plan][1];
}
