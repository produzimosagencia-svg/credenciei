/**
 * O vocabulário da aprovação de credenciamento — texto puro, sem nenhum
 * import. Mesma razão de lib/veiculos-constantes.ts: a página pública da
 * credencial e o formulário rodam no navegador e precisam desta lista sem
 * puxar `supabaseAdmin` (que traria `next/headers` pro bundle do cliente).
 */

export type StatusCredenciamento = 'pendente' | 'aprovado' | 'negado'

export const STATUS_CREDENCIAMENTO: StatusCredenciamento[] = ['pendente', 'aprovado', 'negado']

export const ROTULO_STATUS_CREDENCIAMENTO: Record<StatusCredenciamento, string> = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  negado: 'Negado',
}

/** Tom do <Badge> (components/ui/Superficie.tsx) pra cada status. */
export const TOM_STATUS_CREDENCIAMENTO: Record<StatusCredenciamento, 'neutro' | 'marca' | 'positivo' | 'atencao' | 'negativo'> = {
  pendente: 'atencao',
  aprovado: 'positivo',
  negado: 'negativo',
}

export function statusCredenciamentoValido(bruto: string | null | undefined): StatusCredenciamento {
  return STATUS_CREDENCIAMENTO.includes(bruto as StatusCredenciamento) ? (bruto as StatusCredenciamento) : 'aprovado'
}

/** Só `aprovado` deixa o QR valer — ver app/credential/[token]/page.tsx. */
export const podeVerQrComStatus = (status: StatusCredenciamento) => status === 'aprovado'

/**
 * Quanto tempo depois de uma NEGATIVA a pessoa pode fazer um novo pedido pelo
 * formulário (que volta a ficar "aguardando aprovação"). Cinco minutos: dá
 * tempo de o supervisor conversar com ela e de ela corrigir o que faltava, e
 * impede o vai-e-volta imediato de pedido e negativa.
 */
export const ESPERA_NOVO_PEDIDO_MIN = 5

/**
 * Minutos que ainda faltam pra pessoa poder fazer o novo pedido (0 = já pode).
 * `decididoEm` é o instante da negativa; sem ele (negativa antiga, sem data),
 * libera — melhor deixar tentar do que travar quem não tem como saber quando.
 */
export function minutosParaNovoPedido(decididoEm: string | null | undefined, agora: Date = new Date()): number {
  if (!decididoEm) return 0
  const decidido = new Date(decididoEm).getTime()
  if (!Number.isFinite(decidido)) return 0
  const faltaMs = decidido + ESPERA_NOVO_PEDIDO_MIN * 60_000 - agora.getTime()
  return faltaMs > 0 ? Math.ceil(faltaMs / 60_000) : 0
}
