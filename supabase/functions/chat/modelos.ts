// Modelos que a pessoa pode escolher no chat, todos atendidos pelo mesmo LLM_BASE_URL. Vêm,
// nesta ordem: do próprio servidor do modelo (GET /models com "trustio_modelos": o gateway da
// Trustio anuncia os modos dele, ex.: Flash e Heavy Thinking); de app_settings.modelos_chat,
// lista definida pelo admin ([{ id, rotulo, descricao }]). Sem nenhuma, só o modelo padrão.
// icone: nome curto da marca do modelo (o site mostra assets/modelos/<icone>.svg, se conhecer).
// assinante: só quem assina pode usar (o site mostra com cadeado para quem está no teste).
export type ModeloEscolhivel = {
  id: string; rotulo: string; descricao?: string; descricao_en?: string; icone?: string; padrao?: boolean; assinante?: boolean;
};

// Só para assinantes, decidido aqui e não só pela marca do servidor: se o servidor deixar de
// marcar, o modelo continua fechado para quem está no teste.
export const MODELOS_SO_ASSINANTES = new Set(["trustio-thunderbolt"]);

// Modelos que pesquisam na web por conta própria (o agente do Thunderbolt tem as ferramentas dele e
// ignora as da função): sem a rodada de triagem, que cortaria a resposta no teto de tokens da triagem.
const MODELOS_COM_BUSCA_PROPRIA = new Set(["trustio-thunderbolt"]);
export function temBuscaPropria(modelo: string): boolean {
  return MODELOS_COM_BUSCA_PROPRIA.has(modelo);
}

export function normalizarModelos(lista: unknown): ModeloEscolhivel[] {
  return (Array.isArray(lista) ? lista : [])
    .map((m: { id?: unknown; rotulo?: unknown; descricao?: unknown; descricao_en?: unknown; icone?: unknown; padrao?: unknown; assinante?: unknown }) => {
      const id = String(m?.id ?? "").trim().slice(0, 200);
      return {
        id,
        rotulo: String(m?.rotulo ?? m?.id ?? "").trim().slice(0, 60),
        descricao: m?.descricao ? String(m.descricao).trim().slice(0, 160) : undefined,
        descricao_en: m?.descricao_en ? String(m.descricao_en).trim().slice(0, 160) : undefined,
        icone: typeof m?.icone === "string" && /^[a-z0-9-]{1,24}$/.test(m.icone) ? m.icone : undefined,
        padrao: m?.padrao === true ? true : undefined,
        assinante: m?.assinante === true || MODELOS_SO_ASSINANTES.has(id) ? true : undefined,
      };
    })
    .filter((m: ModeloEscolhivel) => m.id && m.rotulo)
    .slice(0, 12);
}

// O modelo pedido, se estiver na lista e a conta puder usá-lo; senão null (vale o padrão). Quem
// deixou de assinar com o Thunderbolt salvo nas preferências volta ao padrão sem erro.
export function escolhaPermitida(lista: ModeloEscolhivel[], pedido: string | null, assinante: boolean): string | null {
  if (!pedido) return null;
  const m = lista.find((x) => x.id === pedido);
  if (!m) return null;
  return m.assinante && !assinante ? null : m.id;
}
