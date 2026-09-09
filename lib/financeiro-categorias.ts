/**
 * As categorias de custo — texto puro, sem nenhum import.
 *
 * Moravam em lib/financeiro.ts, que importa `supabaseAdmin` de
 * lib/supabase-server (que puxa `next/headers`). A tela de filtros do
 * dashboard precisa desta lista no NAVEGADOR (o select de categoria) — e aí
 * o bundle do cliente puxava junto o cliente de serviço do Supabase.
 * Separados, cada lado importa só o que é. Mesmo problema, mesma solução de
 * lib/auditoria-rotulos.ts.
 */

export const CATEGORIAS_CUSTO = [
  'WhatsApp / disparos de mensagens',
  'Funcionários',
  'Transporte',
  'Alimentação',
  'Materiais',
  'Fornecedores',
  'Outros',
] as const

export type CategoriaCusto = (typeof CATEGORIAS_CUSTO)[number]

/**
 * O "evento" que não é evento nenhum — despesa interna da agência (salário
 * da equipe, serviço contratado pra empresa). Não é uma linha em `eventos`
 * — seria um evento falso vazando pra toda tela que lista "escolha o
 * evento" no sistema. É `evento_id IS NULL` em `custos_evento`, e este
 * texto é só o valor que a URL e os seletores usam pra apontar pra esse
 * caso — ver lib/financeiro.ts.
 */
export const EVENTO_INTERNO = 'interno'
