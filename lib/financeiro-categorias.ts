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
