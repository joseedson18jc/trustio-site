// Liberação automática dos planos pessoais (supabase/migrations/20261025180000_liberacao_automatica_stripe.sql).
// O banco decide o plano pelo link de pagamento e guarda um direito por sessão; aqui só se
// traduz cada evento da Stripe na chamada certa. Uma falha do banco sobe como erro: o webhook
// responde 500 e a Stripe reenvia (o banco ignora o que já aplicou).
import { assinaturaDaFatura } from "./stripe.js";

const id = (v) => (v && typeof v === "object" ? v.id : v) || null;
const quando = (seg) => (Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000).toISOString() : null);

/** Argumentos de stripe_ativar_compra a partir da sessão de checkout paga. */
export function argsDaCompra(sessao) {
  return {
    p_sessao: sessao.id,
    p_email: sessao.customer_details?.email || sessao.customer_email || null,
    p_payment_link: id(sessao.payment_link),
    p_tier: sessao.metadata?.tier || null,
    p_subscription: id(sessao.subscription),
    p_customer: id(sessao.customer),
    p_payment_intent: id(sessao.payment_intent),
    p_valor_centavos: Number(sessao.amount_total ?? sessao.amount_subtotal ?? 0),
  };
}

export async function ativarCompra(env, rpc, sessao) {
  const r = await rpc(env, "stripe_ativar_compra", argsDaCompra(sessao));
  if (r && r.ok === false) console.error("liberacao_sem_dados", sessao.id, r.motivo);
  return r;
}

/**
 * Situação da assinatura → { p_fim, p_encerrar } ou null (nada a fazer, ex.: incompleta).
 * Em dia: fim nulo. Cancelada no fim do período: fim = cancel_at / fim do período atual
 * (o campo mudou de lugar na API 2025-03-31; lê os dois). Acabou: fim = quando acabou.
 * Pausada ou unpaid: sem acesso até voltar, mas não é o fim.
 */
export function fimDaAssinatura(sub, tipo) {
  const agora = new Date().toISOString();
  const status = sub?.status;
  if (tipo === "customer.subscription.deleted" || ["canceled", "incomplete_expired"].includes(status)) {
    return { p_fim: quando(sub?.ended_at) || quando(sub?.canceled_at) || agora, p_encerrar: true };
  }
  // Pausada ou com fatura em aberto (unpaid): sem acesso, mas volta se a assinatura voltar a valer.
  if (status === "paused" || status === "unpaid") return { p_fim: agora, p_encerrar: false };
  if (!["active", "trialing", "past_due"].includes(status)) return null;
  if (sub.cancel_at) return { p_fim: quando(sub.cancel_at), p_encerrar: false };
  if (sub.cancel_at_period_end) {
    const fimPeriodo = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    return { p_fim: quando(fimPeriodo) || agora, p_encerrar: false };
  }
  return { p_fim: null, p_encerrar: false };
}

export async function atualizarAssinatura(env, rpc, evento) {
  const sub = evento.data?.object || {};
  const fim = fimDaAssinatura(sub, evento.type);
  if (!fim || !sub.id) return { ok: true, ignorado: sub.status || "sem_assinatura" };
  return rpc(env, "stripe_atualizar_assinatura", { p_subscription: sub.id, ...fim, p_evento_em: quando(evento.created) });
}

/**
 * Só reembolso total corta o acesso; parcial fica registrado no log. Passe: acha pelo pagamento.
 * Cobrança de assinatura (a 1ª ou uma renovação): a cobrança traz a fatura, e a fatura traz a
 * assinatura. Sem nenhum dos dois, não é compra pessoal e nada muda.
 */
export async function reembolsar(env, rpc, evento) {
  const charge = evento.data?.object || {};
  if (charge.refunded !== true) {
    console.warn("reembolso_parcial", charge.id, charge.amount_refunded);
    return { ok: true, ignorado: "reembolso_parcial" };
  }
  const fatura = id(charge.invoice);
  const assinatura = fatura && env.STRIPE_SECRET_KEY ? await assinaturaDaFatura(env, fatura) : null;
  return rpc(env, "stripe_reembolso", { p_payment_intent: id(charge.payment_intent), p_subscription: assinatura });
}
