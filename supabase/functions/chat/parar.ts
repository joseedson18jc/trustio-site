// Botão parar do chat (2 nov 2026). Cada envio leva um id gerado no navegador (pedido_id). O botão ■
// pede à função que grave esse id em public.parar_chat; a resposta em andamento confere a tabela a
// cada segundo e, ao achar o próprio id, corta a leitura do modelo. O id vem do envio, não da hora:
// uma parada atrasada nunca pega a pergunta seguinte, e uma resposta em outra aba não para junto.
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O id do envio, se for um UUID; senão null (envio sem botão parar, ex.: página antiga em cache).
export function idDoPedido(v: unknown): string | null {
  return typeof v === "string" && RE_UUID.test(v) ? v.toLowerCase() : null;
}

export type Vigia = { readonly parado: boolean; encerrar: () => void };

// Confere a parada a cada intervaloMs até achar ou ser encerrada. Uma conferência que falha conta
// como "não parou" (a função pode chegar ao ar antes da migração). aoParar roda uma vez só.
export function vigiarParada(conferir: () => Promise<boolean>, aoParar: () => void, intervaloMs = 1000): Vigia {
  let parado = false;
  let encerrada = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const passo = async () => {
    timer = null;
    if (encerrada) return;
    let achou = false;
    try { achou = await conferir(); } catch { achou = false; }
    if (encerrada) return;
    if (achou) { parado = true; encerrada = true; aoParar(); return; }
    timer = setTimeout(passo, intervaloMs);
  };
  timer = setTimeout(passo, intervaloMs);
  return {
    get parado() { return parado; },
    encerrar() { encerrada = true; if (timer) clearTimeout(timer); timer = null; },
  };
}
