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

/**
 * Uma célula: o valor, ou `{ valor, destaque }` pra pintar de laranja só ela (ex.: a saída que falta). Na coluna
 * 'barra', o valor é a proporção (0 a 1).
 */
export type CelulaDoc = string | number | null | { valor: string | number | null; destaque?: boolean }
/** Uma linha: uma célula por coluna, na mesma ordem. */
export type LinhaDoc = CelulaDoc[]

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
  /** Começa sempre numa folha nova (as seções grandes do modelo). Sem: continua na mesma folha se couber. */
  novaFolha?: boolean
  /** Só rótulo, título e aviso — sem tabela (o fechamento da entrega de valor). */
  semTabela?: boolean
}

/** Um pedaço de seção dentro de uma folha. */
export type BlocoDoc = {
  secao: SecaoDoc
  linhas: LinhaDoc[]
  /** Continuação da tabela de uma seção (sem título e aviso — só o rótulo e o cabeçalho da tabela). */
  continuacao: boolean
}

export type FolhaDoc = { blocos: BlocoDoc[] }

/*
 * A conta da folha, em "linhas de tabela" (7,4 mm), medida no modelo: o corpo de uma A4 cabe 34; a abertura de uma
 * seção (rótulo + título + aviso + cabeçalho da tabela) gasta ~7; a de uma continuação, ~3; entre duas seções na mesma
 * folha, 2 de respiro. Uma seção só começa numa folha se couberem pelo menos 3 linhas dela depois da abertura.
 */
const CORPO = 33
/** A4 deitada (tabelas largas): o corpo cabe menos linhas. */
const CORPO_PAISAGEM = 24
const ABERTURA_CONTINUACAO = 3
const RESPIRO = 2
const MINIMO_DE_LINHAS = 3

function custoDaAbertura(secao: SecaoDoc): number {
  return 5 + (secao.aviso ? 2 : 0) + (secao.titulo.length > 38 ? 2 : 0)
}

export function paginar(secoes: SecaoDoc[], opcoes: { paisagem?: boolean } = {}): FolhaDoc[] {
  const folhas: FolhaDoc[] = []
  const corpo = opcoes.paisagem ? CORPO_PAISAGEM : CORPO
  let livre = 0
  const abrirFolha = (): FolhaDoc => { const f: FolhaDoc = { blocos: [] }; folhas.push(f); livre = corpo; return f }
  let atual: FolhaDoc | undefined

  for (const secao of secoes) {
    const abertura = custoDaAbertura(secao)
    const precisa = abertura + Math.min(Math.max(secao.linhas.length, 1), MINIMO_DE_LINHAS)
    let folha: FolhaDoc = atual && !secao.novaFolha && livre - (atual.blocos.length ? RESPIRO : 0) >= precisa ? atual : abrirFolha()
    if (folha.blocos.length) livre -= RESPIRO
    livre -= abertura

    if (!secao.linhas.length) {
      folha.blocos.push({ secao, linhas: [], continuacao: false })
      livre -= secao.semTabela ? 0 : 2
      atual = folha
      continue
    }
    let i = 0
    let primeira = true
    while (i < secao.linhas.length) {
      if (!primeira) { folha = abrirFolha(); livre -= ABERTURA_CONTINUACAO }
      const cabe = Math.max(1, livre)
      folha.blocos.push({ secao, linhas: secao.linhas.slice(i, i + cabe), continuacao: !primeira })
      livre -= Math.min(cabe, secao.linhas.length - i)
      i += cabe
      primeira = false
    }
    atual = folha
  }
  return folhas
}

/** O valor de uma célula, sem o destaque. */
export function valorDaCelula(c: CelulaDoc): string | number | null {
  return c != null && typeof c === 'object' ? c.valor : c
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
