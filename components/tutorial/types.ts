export type TutorialPosicao = 'top' | 'bottom' | 'left' | 'right'

export type TutorialPasso = {
  /** Precisa bater com o data-tutorial="..." do elemento a destacar. */
  alvo: string
  titulo: string
  descricao: string
  /** Onde o balão aparece em relação ao elemento. Default: 'bottom'. */
  posicao?: TutorialPosicao
  /**
   * Nome do ícone que ilustra o passo. É NOME, não o componente: o roteiro é
   * montado em server component e entregue ao provider, que é client — e o
   * Next não deixa atravessar função nessa fronteira. Quem resolve o nome pro
   * componente é o TutorialOverlay, já do lado do cliente.
   */
  icone?: NomeIcone
}

/** Ícones disponíveis para os passos. Nome igual ao do lucide-react. */
export type NomeIcone =
  | 'Search' | 'IdCard' | 'Camera' | 'ClipboardCheck' | 'ListChecks'
  | 'LogIn' | 'ScanLine' | 'Users' | 'Plus' | 'ShieldCheck'
  | 'CalendarDays' | 'Building2' | 'MessageCircle' | 'KeyRound'
  | 'MapPin' | 'Save'

export type TutorialConfig = {
  /** Id único da tela — vira parte da chave salva no navegador. */
  tela: string
  /** Sobe quando o roteiro muda pra reabrir o tutorial pra quem já viu a versão antiga. */
  versao: number
  passos: TutorialPasso[]
}
