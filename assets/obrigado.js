"use strict";
// Personaliza a página de confirmação a partir do parâmetro ?plano= definido no redirect do Payment Link.
const plans = {
  diagnostico: ["Diagnóstico contratado.", "Recebemos sua confirmação. Em até 1 dia útil enviamos as datas dos dois workshops de descoberta e o questionário inicial. Entrega do relatório em até 10 dias úteis após o segundo workshop."],
  starter: ["Plano Starter ativo.", "Recebemos sua assinatura. O ambiente privado é provisionado em até 5 dias úteis; você receberá as credenciais da API e o painel de observabilidade por e-mail."],
  pro: ["Plano Pro ativo.", "Recebemos sua assinatura. Um arquiteto da Trustio entra em contato em até 1 dia útil para configurar SSO, integrações e o primeiro caso de uso."],
  dedicado: ["Plano Dedicado ativo.", "Recebemos sua assinatura. Um arquiteto dedicado entra em contato em até 1 dia útil para desenhar GPU, rede e identidade do seu ambiente."]
};
const plan = new URLSearchParams(location.search).get("plano");
if (plans[plan]) {
  document.querySelector("[data-plan-title]").textContent = plans[plan][0];
  document.querySelector("[data-plan-lead]").textContent = plans[plan][1];
}
