# supabase/functions/chat/index.ts

- modeloDaChamada · function · L25-L47 — async function modeloDaChamada(configurado: string | null): Promise<string>
- ehRecusaDeImagem · function · L73-L78 — function ehRecusaDeImagem(status: number, detalhe: string)
- ehContextoCheio · function · L80-L82 — function ehContextoCheio(status: number, detalhe: string)
- cors · function · L86-L94 — function cors(origin: string | null)
- json · function · L96-L101 — function json(status: number, body: unknown, origin: string | null)
- Liberacao · type · L103-L106 — type Liberacao = { aberto: boolean; motivo?: string; abre_em?: string | null; antecipado_em?: string | null; pre_assinante?: boolean; };
- liberacao · function · L110-L117 — async function liberacao(admin: ReturnType<typeof createClient>, userId: string): Promise<Liberacao>
- Reservation · type · L119-L122 — type Reservation = { ok: boolean; error?: string; lead_id?: string; used?: number; limit?: number; subscriber?: boolean; remaining?: number | null; };
- release · function · L206-L206 — release = ()
- chamarModelo · function · L236-L245 — chamarModelo = (ultima: unknown)
- send · function · L299-L303 — send = (obj: unknown)
- fechar · function · L304-L308 — fechar = ()
- start · method · L311-L311 — start(controller)
- cancel · method · L313-L313 — cancel()
- soltarRaciocinio · function · L342-L349 — soltarRaciocinio = (tudo: boolean)
