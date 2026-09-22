/**
 * O vocabulário do módulo Orçamentos — texto puro, sem nenhum import.
 *
 * Mesma razão de lib/gastos-constantes.ts e lib/backlog-constantes.ts: o
 * formulário e a tabela de listagem rodam no navegador e precisam desta
 * lista. Se ela morasse em lib/orcamentos.ts (que importa `supabaseAdmin`,
 * que puxa `next/headers`), o cliente de serviço do Supabase iria junto pro
 * bundle do cliente e o build quebraria.
 */

export type StatusOrcamento = 'rascunho' | 'gerado' | 'enviado' | 'aprovado' | 'recusado'

export const STATUS_ORCAMENTO: StatusOrcamento[] = ['rascunho', 'gerado', 'enviado', 'aprovado', 'recusado']

export const ROTULO_STATUS: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  gerado: 'Gerado',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

/** Tom do <Badge> (components/ui/Superficie.tsx) pra cada status. */
export const TOM_STATUS: Record<StatusOrcamento, 'neutro' | 'marca' | 'positivo' | 'atencao' | 'negativo'> = {
  rascunho: 'neutro',
  gerado: 'marca',
  enviado: 'atencao',
  aprovado: 'positivo',
  recusado: 'negativo',
}

export function statusValido(bruto: string | null | undefined): StatusOrcamento {
  return STATUS_ORCAMENTO.includes(bruto as StatusOrcamento) ? (bruto as StatusOrcamento) : 'rascunho'
}

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "#000001" — nunca digitado, só exibido. */
export const numeroOrcamento = (n: number) => `#${String(n).padStart(6, '0')}`
