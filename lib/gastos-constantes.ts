/**
 * O vocabulário do módulo Gastos — texto puro, sem nenhum import.
 *
 * Mesma razão de lib/financeiro-categorias.ts e lib/backlog-constantes.ts: o
 * gravador, o formulário manual e os filtros rodam NO NAVEGADOR e precisam
 * desta lista. Se ela morasse em lib/gastos.ts (que importa `supabaseAdmin`,
 * que puxa `next/headers`), o cliente de serviço do Supabase iria junto pro
 * bundle do cliente e o build quebraria.
 */

export const CATEGORIAS_GASTO = [
  'Estrutura',
  'Funcionários',
  'Alimentação',
  'Transporte',
  'Hospedagem',
  'Comunicação',
  'Marketing',
  'Equipamentos',
  'Segurança',
  'Produção',
  'Fornecedores',
  'Outros',
] as const

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export const CATEGORIA_PADRAO: CategoriaGasto = 'Outros'

/** Normaliza o palpite da IA: só aceita se casar com a lista, senão 'Outros'. */
export function categoriaValida(bruta: string | null | undefined): CategoriaGasto | null {
  if (!bruta) return null
  const achada = CATEGORIAS_GASTO.find(c => c.toLowerCase() === bruta.trim().toLowerCase())
  return achada ?? null
}

/**
 * Formas de pagamento — sugestão no form (datalist), aceita texto livre.
 * Mesma lógica de `CATEGORIAS_GASTO`: a lista vive no código, não no banco.
 */
export const FORMAS_PAGAMENTO = [
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Dinheiro',
  'Transferência',
  'Boleto',
  'A prazo',
] as const

export type OrigemGasto = 'manual' | 'audio' | 'whatsapp'

export const ROTULO_ORIGEM: Record<OrigemGasto, string> = {
  manual: 'Manual',
  audio: 'Áudio',
  whatsapp: 'WhatsApp',
}

export type StatusGasto = 'confirmado' | 'rascunho'

export const ROTULO_STATUS: Record<StatusGasto, string> = {
  confirmado: 'Confirmado',
  rascunho: 'Rascunho',
}

/** Os campos que a IA pode marcar como incertos, e o rótulo pra tela. */
export const ROTULO_CAMPO: Record<string, string> = {
  valor: 'valor',
  descricao: 'descrição',
  fornecedor: 'fornecedor',
  categoria: 'categoria',
  dataGasto: 'data do gasto',
}

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
