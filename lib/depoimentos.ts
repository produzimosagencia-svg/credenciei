/**
 * Depoimento do colaborador — tipos e rótulos compartilhados (tela e servidor).
 * Sem código de servidor aqui: serve também a componentes do navegador. A
 * gravação e a leitura estão em lib/actions.ts (`adicionarDepoimento`,
 * `listarDepoimentos`); a tabela, em supabase/upgrade-depoimentos-colaborador.sql.
 */

export type TipoDepoimento = 'positivo' | 'neutro' | 'atencao' | 'bloqueio' | 'desbloqueio'

/** O que quem escreve pode escolher. Bloqueio e desbloqueio o sistema grava sozinho. */
export const TIPOS_ESCOLHIVEIS: { valor: Extract<TipoDepoimento, 'positivo' | 'neutro' | 'atencao'>; rotulo: string }[] = [
  { valor: 'positivo', rotulo: 'Positivo' },
  { valor: 'neutro', rotulo: 'Observação' },
  { valor: 'atencao', rotulo: 'Atenção' },
]

export const ROTULO_TIPO: Record<TipoDepoimento, string> = {
  positivo: 'Positivo',
  neutro: 'Observação',
  atencao: 'Atenção',
  bloqueio: 'CPF bloqueado',
  desbloqueio: 'CPF liberado',
}

export type Depoimento = {
  id: string
  tipo: TipoDepoimento
  texto: string
  autorNome: string
  eventoNome: string | null
  setorNome: string | null
  /** Só vem preenchido para o master, que enxerga todas as organizações. */
  organizacaoNome: string | null
  criadoEm: string
}

export const TAMANHO_MINIMO_DEPOIMENTO = 3
export const TAMANHO_MAXIMO_DEPOIMENTO = 2000
export const TAMANHO_MINIMO_JUSTIFICATIVA = 5

// ─── Avaliação por estrelas ─────────────────────────────────────────────────

/** Uma nota de um evento (a média da pessoa é feita sobre estas). */
export type Avaliacao = {
  nota: number
  eventoNome: string | null
  setorNome: string | null
  avaliadorNome: string
  /** Só vem preenchido para o master, que enxerga todas as organizações. */
  organizacaoNome: string | null
  atualizadoEm: string
}

export type ResumoAvaliacoes = {
  /** Média das notas, uma casa decimal; `null` sem nenhuma nota. */
  media: number | null
  total: number
  porEvento: Avaliacao[]
}

export function resumirAvaliacoes(lista: Avaliacao[]): ResumoAvaliacoes {
  const total = lista.length
  const media = total ? Math.round((lista.reduce((s, a) => s + a.nota, 0) / total) * 10) / 10 : null
  return { media, total, porEvento: lista }
}
