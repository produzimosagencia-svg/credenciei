export type TutorialPosicao = 'top' | 'bottom' | 'left' | 'right'

export type TutorialPasso = {
  /** Precisa bater com o data-tutorial="..." do elemento a destacar. */
  alvo: string
  titulo: string
  descricao: string
  /** Onde o balão aparece em relação ao elemento. Default: 'bottom'. */
  posicao?: TutorialPosicao
  /** Ícone do lucide-react, quando ajudar a ilustrar o passo. Opcional. */
  icone?: React.ElementType
}

export type TutorialConfig = {
  /** Id único da tela — vira parte da chave salva no navegador. */
  tela: string
  /** Sobe quando o roteiro muda pra reabrir o tutorial pra quem já viu a versão antiga. */
  versao: number
  passos: TutorialPasso[]
}
