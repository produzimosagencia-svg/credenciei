/**
 * O MOLDE dos relatórios em PDF (pedido do Juan, 12/10/2026: "preciso que os relatórios sigam esse padrão de modelo,
 * detalhado dessa forma, com o template do nosso sistema — todos os relatórios" — docs/modelo de relatorio .pdf).
 *
 * Cada relatório é uma lista de SEÇÕES: rótulo laranja ("PENDENTES POR EQUIPE"), uma frase-resumo grande ("166
 * pessoas em 28 equipes."), um aviso opcional (caixa com borda laranja) e uma tabela. Este arquivo é só dado e conta —
 * a parte visual está em components/relatorio-doc/. A paginação é feita aqui, por número de linhas, com as medidas do
 * modelo (A4, linha de 7,5 mm): cada seção começa numa folha nova e a tabela continua nas seguintes, com o cabeçalho.
 */

export type TipoColuna =
  | 'nome'       // texto em negrito (a equipe, a pessoa)
  | 'texto'      // texto cinza (a área, o cargo)
  | 'numero'     // número alinhado à direita
  | 'destaque'   // número laranja em negrito (o que importa na linha)
  | 'barra'      // barra de proporção (valor de 0 a 1)

export type ColunaDoc = {
  titulo: string
  tipo: TipoColuna
  /** Largura da coluna (CSS, ex.: '34%' ou '30mm'). Sem: o navegador divide. */
  largura?: string
}

/** Uma linha: um valor por coluna, na mesma ordem. Na coluna 'barra', o valor é a proporção (0 a 1). */
export type LinhaDoc = (string | number | null)[]

export type SecaoDoc = {
  /** O rótulo laranja em maiúsculas ("PENDENTES POR EQUIPE"). */
  rotulo: string
  /** A frase-resumo grande ("166 pessoas em 28 equipes."). */
  titulo: string
  /** A caixa de aviso: o começo em laranja e negrito, o resto normal. */
  aviso?: { destaque: string; texto: string }
  colunas: ColunaDoc[]
  linhas: LinhaDoc[]
  /** O que aparece quando não há linha nenhuma. */
  vazio?: string
}

export type FolhaDoc = {
  secao: SecaoDoc
  linhas: LinhaDoc[]
  /** Continuação da tabela de uma seção (sem rótulo, título e aviso — só o cabeçalho da tabela). */
  continuacao: boolean
}

/** Quantas linhas cabem: na primeira folha da seção (com título e aviso) e nas de continuação. Medidas do modelo. */
export const LINHAS_NA_PRIMEIRA = 26
export const LINHAS_NA_CONTINUACAO = 31

export function paginar(secoes: SecaoDoc[]): FolhaDoc[] {
  const folhas: FolhaDoc[] = []
  for (const secao of secoes) {
    // Título longo quebra em duas linhas; sem aviso sobra espaço.
    const naPrimeira = LINHAS_NA_PRIMEIRA - (secao.titulo.length > 38 ? 2 : 0) + (secao.aviso ? 0 : 2)
    if (!secao.linhas.length) {
      folhas.push({ secao, linhas: [], continuacao: false })
      continue
    }
    let i = 0
    let primeira = true
    while (i < secao.linhas.length) {
      const cabe = primeira ? naPrimeira : LINHAS_NA_CONTINUACAO
      folhas.push({ secao, linhas: secao.linhas.slice(i, i + cabe), continuacao: !primeira })
      i += cabe
      primeira = false
    }
  }
  return folhas
}

/** "dados do sistema em 11/10/2026 às 03h54" — o rodapé de todas as folhas. */
export function carimboDoSistema(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(agora)
  const v = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `dados do sistema em ${v('day')}/${v('month')}/${v('year')} às ${v('hour')}h${v('minute')}`
}

/** "1 pessoa" / "166 pessoas". */
export function plural(n: number, singular: string, pluralForma: string = `${singular}s`): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralForma}`
}
