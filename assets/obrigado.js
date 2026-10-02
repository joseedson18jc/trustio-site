"use strict";
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
// Cápsula com a seta ↗ em SVG, igual à dos botões estáticos (Trustio 2.0).
function arrowCapsule() {
  const ns = "http://www.w3.org/2000/svg";
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(ns, "svg");
  const attrs = { class: "arw", viewBox: "0 0 24 24", width: "16", height: "16", focusable: "false", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M7 17 17 7M9 7h8v8");
  svg.append(path);
  span.append(svg);
  return span;
}
// Personaliza a página de confirmação a partir do parâmetro ?plano= definido no redirect do Payment Link.
const plans = {
  diagnostico: [T("Diagnóstico contratado.", "Diagnostic booked."), T("Recebemos sua confirmação. Em até 1 dia útil enviamos as datas dos dois workshops de descoberta e o questionário inicial. Entrega do relatório em até 10 dias úteis após o segundo workshop.", "We've received your confirmation. Within 1 business day we'll send the dates for the two discovery workshops and the initial questionnaire. The report is delivered within 10 business days of the second workshop.")],
  starter: [T("Plano Starter ativo.", "Starter plan active."), T("Recebemos sua assinatura. O ambiente privado é provisionado em até 5 dias úteis; você receberá as credenciais da API e o painel de observabilidade por e-mail.", "We've received your subscription. The private environment is provisioned within 5 business days; you'll get your API credentials and the observability dashboard by email.")],
  pro: [T("Plano Pro ativo.", "Pro plan active."), T("Recebemos sua assinatura. Um arquiteto da Trustio entra em contato em até 1 dia útil para configurar SSO, integrações e o primeiro caso de uso.", "We've received your subscription. A Trustio architect will reach out within 1 business day to set up SSO, integrations and the first use case.")],
  dedicado: [T("Plano Dedicado ativo.", "Dedicated plan active."), T("Recebemos sua assinatura. Um arquiteto dedicado entra em contato em até 1 dia útil para desenhar GPU, rede e identidade do seu ambiente.", "We've received your subscription. A dedicated architect will reach out within 1 business day to design your environment's GPU, network and identity.")],
  pessoal: [T("Plano Pessoal ativo.", "Personal plan active."), T("Recebemos sua assinatura. Seu acesso é liberado automaticamente após a confirmação do pagamento, para a conta com o e-mail do checkout.", "We've received your subscription. Your access is granted automatically after payment confirmation, at the email you used at checkout.")],
  passe7: [T("Passe de 7 dias confirmado.", "7-day pass confirmed."), T("Recebemos seu pagamento. O acesso é liberado automaticamente após a confirmação do pagamento, para a conta com o e-mail do checkout, e os 7 dias só começam a contar a partir daí.", "We've received your payment. Access is granted automatically after payment confirmation, at the email you used at checkout, and the 7 days only start counting from then.")],
  anual: [T("Plano Anual ativo.", "Annual plan active."), T("Recebemos sua assinatura com preço travado por 12 meses. Seu acesso é liberado automaticamente após a confirmação do pagamento, para a conta com o e-mail do checkout.", "We've received your subscription, with the price locked for 12 months. Your access is granted automatically after payment confirmation, at the email you used at checkout.")]
};
// Agentio e Combo: mesma mensagem, muda o nome e o período.
const ativa = (nome, en, periodo, periodoEn, combo) => [
  T(nome + " confirmado.", en + " confirmed."),
  T("Recebemos seu pagamento (" + periodo + "). Após a confirmação do pagamento, seu acesso ao Agentio é liberado automaticamente. Siga as instruções de conexão ao WhatsApp ou Telegram" + (combo ? ", e seu acesso ao chat é liberado automaticamente." : "."),
    "We've received your payment (" + periodoEn + "). After payment confirmation, Agentio access is granted automatically. Follow the instructions to connect WhatsApp or Telegram" + (combo ? ", and your chat access is granted automatically." : "."))
];
Object.assign(plans, {
  "agentio-semanal": ativa("Agentio · 7 dias", "Agentio · 7 days", "7 dias, contados a partir da ativação", "7 days, counted from activation"),
  "agentio-mensal": ativa("Agentio mensal", "Monthly Agentio", "renova todo mês", "renews monthly"),
  "agentio-semestral": ativa("Agentio semestral", "6-month Agentio", "renova a cada 6 meses", "renews every 6 months"),
  "agentio-anual": ativa("Agentio anual", "Annual Agentio", "preço travado por 12 meses", "price locked for 12 months"),
  "combo-semanal": ativa("Combo Chat + Agentio · 7 dias", "Chat + Agentio Combo · 7 days", "7 dias, contados a partir da ativação", "7 days, counted from activation", true),
  "combo-mensal": ativa("Combo Chat + Agentio mensal", "Monthly Chat + Agentio Combo", "renova todo mês", "renews monthly", true),
  "combo-semestral": ativa("Combo Chat + Agentio semestral", "6-month Chat + Agentio Combo", "renova a cada 6 meses", "renews every 6 months", true),
  "combo-anual": ativa("Combo Chat + Agentio anual", "Annual Chat + Agentio Combo", "preço travado por 12 meses", "price locked for 12 months", true)
});
const payLinks = { agentio: ["https://buy.stripe.com/bJe5kD2rU5Xhbin48D5wI0c", T("Assinar Agentio por R$ 129/mês", "Subscribe to Agentio for R$ 129/month")], combo: ["https://buy.stripe.com/7sY14ngiK2L5fyD9sX5wI0g", T("Assinar o Combo por R$ 179/mês", "Subscribe to the Combo for R$ 179/month")], mensal: ["https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08", T("Pagar R$ 79/mês e entrar automaticamente após a confirmação do pagamento", "Pay R$ 79/month and get in automatically after payment confirmation")], semanal: ["https://buy.stripe.com/8x228rgiKetN2LRfRl5wI09", T("Pagar R$ 24,90 e entrar automaticamente após a confirmação do pagamento", "Pay R$ 24.90 and get in automatically after payment confirmation")], anual: ["https://buy.stripe.com/cNifZhd6yfxR9afgVp5wI0a", T("Pagar R$ 790/ano e entrar automaticamente após a confirmação do pagamento", "Pay R$ 790/year and get in automatically after payment confirmation")] };
const qs = new URLSearchParams(location.search);
function listaMode(eyebrow) {
  const e = document.querySelector(".eyebrow"); if (e) { e.innerHTML = '<span class="status-dot"></span> ' + eyebrow; }
  const n = document.querySelector(".thanks-note"); if (n) n.innerHTML = T('Dúvidas: ', 'Questions: ') + '<a href="mailto:contato@trustio.com.br">contato@trustio.com.br</a>';
}
if (qs.get("lista") === "pre") {
  listaMode(T("Pedido de assinatura recebido", "Subscription request received"));
  document.querySelector("[data-plan-title]").textContent = T("Falta só o pagamento.", "Just the payment left.");
  const pk = qs.get("plano");
  const actions = document.querySelector(".thanks-actions");
  if (Object.hasOwn(payLinks, pk)) {
    document.querySelector("[data-plan-lead]").textContent = T("Recebemos seus dados. Falta só o pagamento (cartão, Apple Pay ou Google Pay): confirmado, seu acesso é liberado automaticamente após a confirmação do pagamento. Se preferir pagar depois, o link também vai por e-mail e WhatsApp.", "We've got your details. All that's left is payment (card, Apple Pay or Google Pay): once confirmed, your access is granted automatically after payment confirmation. If you'd rather pay later, the link is also on its way by email and WhatsApp.");
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = payLinks[pk][0]; a.rel = "noopener"; a.textContent = payLinks[pk][1] + " "; a.append(arrowCapsule()); actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  } else {
    document.querySelector("[data-plan-lead]").textContent = T("Recebemos o pedido de assinatura da sua empresa. Um arquiteto da Trustio entra em contato em até 1 dia útil com a proposta e o link de pagamento; com o pagamento confirmado, o ambiente é liberado no prazo do plano escolhido.", "We've received your company's subscription request. A Trustio architect will reach out within 1 business day with the proposal and the payment link; once payment is confirmed, the environment is delivered within your chosen plan's timeline.");
    if (actions) { const a = document.createElement("a"); a.className = "button button-primary"; a.href = "planos.html#empresas"; a.textContent = T("Ver planos para empresas", "See plans for businesses"); actions.prepend(a); actions.querySelectorAll("a:not(:first-child)").forEach((b) => { b.className = "button button-outline"; }); }
  }
} else if (qs.get("lista") === "espera") {
  listaMode(T("Solicitação de contato confirmada", "Contact request confirmed"));
  document.querySelector("[data-plan-title]").textContent = T("Seu contato foi confirmado.", "Your contact details are confirmed.");
  document.querySelector("[data-plan-lead]").textContent = T("Seu contato foi confirmado. Para usar o chat, crie uma conta e confirme o e-mail: você recebe 5 perguntas grátis. Este formulário não cria uma conta. Para empresas, a equipe orienta a contratação e a implantação.", "Your contact details are confirmed. To use the chat, create an account and confirm your email: you get 5 free questions. This form does not create an account. For businesses, our team guides subscription and deployment.");
} else if (qs.get("lista") === "pessoal") {
  listaMode(T("Lista confirmada", "List confirmed"));
  document.querySelector("[data-plan-title]").textContent = T("Seu contato foi confirmado.", "Your contact details are confirmed.");
  document.querySelector("[data-plan-lead]").textContent = T("Recebemos seu pedido de acesso individual. Avisamos por e-mail (e pelo WhatsApp, se você deixou) para orientar a escolha do plano. Nada é cobrado até você escolher pagar.", "We've received your request for individual access. We'll let you know by email (and on WhatsApp, if you left your number) to help you choose a plan. Nothing is charged until you choose to pay.");
}
const plan = qs.get("plano");
if (Object.hasOwn(plans, plan)) {
  document.querySelector("[data-plan-title]").textContent = plans[plan][0];
  document.querySelector("[data-plan-lead]").textContent = plans[plan][1];
}
