/**
 * O vocabulário do Backlog — texto puro, sem nenhum import.
 *
 * Mesma razão de lib/financeiro-categorias.ts e lib/auditoria-rotulos.ts: o
 * Kanban, os filtros e o modal rodam NO NAVEGADOR e precisam desta lista. Se
 * ela morasse em lib/backlog.ts (que importa `supabaseAdmin`, que puxa
 * `next/headers`), o cliente de serviço do Supabase iria junto pro bundle do
 * cliente e o build quebraria.
 *
 * Status é texto livre no banco, sem CHECK constraint — os dois vocabulários
 * vivem aqui, no código. Adicionar uma coluna nova ao quadro não pode exigir
 * migração de banco.
 */

export type TipoItem = 'cliente' | 'tarefa'
export type Prioridade = 'alta' | 'media' | 'baixa'

export const TIPOS: { valor: TipoItem; rotulo: string; descricao: string }[] = [
  { valor: 'cliente', rotulo: 'Possível cliente', descricao: 'Quem pode contratar o Credenciei' },
  { valor: 'tarefa', rotulo: 'Tarefa', descricao: 'Atividade operacional ou interna' },
]

export type Coluna = { valor: string; rotulo: string; tom: TomColuna }
export type TomColuna = 'neutro' | 'info' | 'acento' | 'aviso' | 'sucesso' | 'erro'

/**
 * As colunas do quadro, na ordem em que aparecem. A ORDEM É O FUNIL: mover
 * um card pra direita é avançar. Por isso `FECHADO`/`CONCLUIDO` ficam no fim
 * e os estados de desistência (perdido, cancelado) logo depois — o quadro
 * conta a história da esquerda pra direita.
 */
export const COLUNAS: Record<TipoItem, Coluna[]> = {
  cliente: [
    { valor: 'novo', rotulo: 'Novo', tom: 'neutro' },
    { valor: 'primeiro_contato', rotulo: 'Primeiro contato', tom: 'info' },
    { valor: 'em_negociacao', rotulo: 'Em negociação', tom: 'acento' },
    { valor: 'proposta_enviada', rotulo: 'Proposta enviada', tom: 'acento' },
    { valor: 'aguardando_retorno', rotulo: 'Aguardando retorno', tom: 'aviso' },
    { valor: 'fechado', rotulo: 'Fechado', tom: 'sucesso' },
    { valor: 'perdido', rotulo: 'Perdido', tom: 'erro' },
  ],
  tarefa: [
    { valor: 'backlog', rotulo: 'Backlog', tom: 'neutro' },
    { valor: 'a_fazer', rotulo: 'A fazer', tom: 'info' },
    { valor: 'em_andamento', rotulo: 'Em andamento', tom: 'acento' },
    { valor: 'aguardando', rotulo: 'Aguardando', tom: 'aviso' },
    { valor: 'concluido', rotulo: 'Concluído', tom: 'sucesso' },
    { valor: 'cancelado', rotulo: 'Cancelado', tom: 'erro' },
  ],
}

export const STATUS_INICIAL: Record<TipoItem, string> = { cliente: 'novo', tarefa: 'backlog' }

/**
 * Estados que tiram o item da fila: não entram em "pendente", em "atrasado"
 * nem em "precisa da minha atenção". Um item cancelado com prazo vencido não
 * é uma cobrança — é um assunto encerrado.
 */
export const STATUS_ENCERRADOS = new Set(['fechado', 'perdido', 'concluido', 'cancelado'])

/** Só estes contam como "deu certo" — pro KPI de conversão e pro histórico. */
export const STATUS_GANHOS = new Set(['fechado', 'concluido'])

export function rotuloDoStatus(tipo: TipoItem, status: string): string {
  return COLUNAS[tipo].find(c => c.valor === status)?.rotulo ?? status.replaceAll('_', ' ')
}

export function tomDoStatus(tipo: TipoItem, status: string): TomColuna {
  return COLUNAS[tipo].find(c => c.valor === status)?.tom ?? 'neutro'
}

export const PRIORIDADES: { valor: Prioridade; rotulo: string; cor: string }[] = [
  { valor: 'alta', rotulo: 'Alta', cor: 'text-red-600 bg-red-50 border-red-200' },
  { valor: 'media', rotulo: 'Média', cor: 'text-amber-700 bg-amber-50 border-amber-200' },
  { valor: 'baixa', rotulo: 'Baixa', cor: 'text-green-700 bg-green-50 border-green-200' },
]

export const ORDEM_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 }

export function rotuloDaPrioridade(p: string): string {
  return PRIORIDADES.find(x => x.valor === p)?.rotulo ?? p
}
export function corDaPrioridade(p: string): string {
  return PRIORIDADES.find(x => x.valor === p)?.cor ?? 'text-slate-600 bg-slate-50 border-slate-200'
}

/** De onde o lead veio. Texto livre no banco; esta lista é só o atalho da tela. */
export const ORIGENS_LEAD = [
  'Indicação',
  'Instagram',
  'WhatsApp',
  'Site',
  'Conheceu num evento',
  'Prospecção ativa',
  'Outro',
] as const

/** O que o histórico registra. O rótulo é o que a linha do tempo mostra. */
export const ROTULO_ACAO: Record<string, string> = {
  CRIACAO: 'Item criado',
  STATUS: 'Status alterado',
  RESPONSAVEL: 'Responsável alterado',
  PRIORIDADE: 'Prioridade alterada',
  PRAZO: 'Prazo alterado',
  PROXIMO_CONTATO: 'Próximo contato alterado',
  EDICAO: 'Dados alterados',
  COMENTARIO: 'Comentário',
  CONVERSAO: 'Convertido em cliente',
  CONCLUSAO: 'Concluído',
}
