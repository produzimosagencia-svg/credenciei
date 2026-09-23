/**
 * O vocabulário do módulo Veículos — texto puro, sem nenhum import.
 *
 * Mesma razão de lib/gastos-constantes.ts e lib/orcamentos-constantes.ts: o
 * wizard público e a listagem rodam no navegador e precisam desta lista sem
 * puxar `supabaseAdmin` (que traria `next/headers` pro bundle do cliente).
 */

export type StatusVeiculo = 'pendente' | 'ativo' | 'bloqueado' | 'cancelado'

export const STATUS_VEICULO: StatusVeiculo[] = ['pendente', 'ativo', 'bloqueado', 'cancelado']

export const ROTULO_STATUS_VEICULO: Record<StatusVeiculo, string> = {
  pendente: 'Pendente',
  ativo: 'Ativo',
  bloqueado: 'Bloqueado',
  cancelado: 'Cancelado',
}

/** Tom do <Badge> (components/ui/Superficie.tsx) pra cada status. */
export const TOM_STATUS_VEICULO: Record<StatusVeiculo, 'neutro' | 'marca' | 'positivo' | 'atencao' | 'negativo'> = {
  pendente: 'atencao',
  ativo: 'positivo',
  bloqueado: 'negativo',
  cancelado: 'neutro',
}

export function statusVeiculoValido(bruto: string | null | undefined): StatusVeiculo {
  return STATUS_VEICULO.includes(bruto as StatusVeiculo) ? (bruto as StatusVeiculo) : 'ativo'
}

/** Só `ativo` deixa o QR valer pra entrar — ver app/veiculo/[token]/page.tsx. */
export const podeEntrarComStatus = (status: StatusVeiculo) => status === 'ativo'

export type TipoCadastroVeiculo = 'manual' | 'colaborador' | 'lounge'

export const TIPOS_CADASTRO_VEICULO: TipoCadastroVeiculo[] = ['manual', 'colaborador', 'lounge']

export const ROTULO_TIPO_CADASTRO: Record<TipoCadastroVeiculo, string> = {
  manual: 'Manual (produção)',
  colaborador: 'Funcionário/Colaborador',
  lounge: 'Veículo para Lounge',
}

/** Título da página pública do link, por tipo. */
export const TITULO_LINK_VEICULO: Record<TipoCadastroVeiculo, string> = {
  manual: 'Cadastro de veículo',
  colaborador: 'Cadastro de veículo — Funcionário/Colaborador',
  lounge: 'Cadastro de Veículo para Lounge',
}

export function tipoCadastroValido(bruto: string | null | undefined): TipoCadastroVeiculo {
  return TIPOS_CADASTRO_VEICULO.includes(bruto as TipoCadastroVeiculo) ? (bruto as TipoCadastroVeiculo) : 'manual'
}
