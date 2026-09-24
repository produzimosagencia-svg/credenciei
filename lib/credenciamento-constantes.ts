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
