import Link from 'next/link'

/**
 * As superfícies e blocos de texto que se repetiam em toda tela.
 *
 * Nenhum deles é 'use client': assim servem a Server Component e a Client
 * Component igual. Ícone entra como filho (JSX), nunca como prop de
 * componente — passar componente do servidor pro cliente quebra em produção,
 * e já quebrou aqui em cinco telas de uma vez.
 *
 * A aparência mora nas classes do globals.css (`.secao`, `.pagina-titulo`,
 * `.tabela`…). Aqui fica só a montagem: assim o mesmo desenho vale pra quem
 * usa o componente e pra quem escreve a classe direto no JSX, sem duas
 * fontes de verdade.
 */

// ─── Seção ───────────────────────────────────────────────────────────────────

/**
 * O bloco de conteúdo da referência: uma moldura cinza clara com o título e
 * a descrição na própria borda, e dentro dela a superfície branca. O título
 * fora da caixa branca é o que separa "o que é isto" de "o conteúdo" sem
 * precisar de uma linha divisória.
 */
const TONS_SECAO = {
  neutro: '',
  destaque: 'secao-destaque',
  acento: 'secao-acento',
  info: 'secao-info',
  sucesso: 'secao-sucesso',
  aviso: 'secao-aviso',
} as const

export type TomSecao = keyof typeof TONS_SECAO

export function Secao({
  titulo, descricao, icone, acoes, tom = 'neutro', corpoClassName = '', className = '', children,
}: {
  titulo?: string
  descricao?: string
  /** Ícone já renderizado, ex.: <Activity className="w-3.5 h-3.5" />. */
  icone?: React.ReactNode
  /** Botões no canto direito do cabeçalho. */
  acoes?: React.ReactNode
  /**
   * A cor da moldura. `destaque` é a moldura escura — use em UMA seção por
   * tela, a que responde ao que a pessoa veio fazer ali. Duas seções em
   * destaque na mesma tela é o mesmo que nenhuma.
   */
  tom?: TomSecao
  /** Some com o padding interno pra tabela/lista encostar na borda. */
  corpoClassName?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`secao ${TONS_SECAO[tom]} ${className}`}>
      {(titulo || acoes) && (
        <div className="secao-cabecalho flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {icone && <span className="secao-icone mt-px">{icone}</span>}
            <div className="min-w-0">
              {titulo && <h2 className="secao-titulo">{titulo}</h2>}
              {descricao && <p className="secao-descricao">{descricao}</p>}
            </div>
          </div>
          {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
        </div>
      )}
      <div className={`secao-corpo ${corpoClassName}`}>{children}</div>
    </section>
  )
}

// ─── Cartão ──────────────────────────────────────────────────────────────────

const PADDINGS = { nenhum: '', sm: 'p-4', md: 'p-5', lg: 'p-6' } as const

type CartaoProps = {
  padding?: keyof typeof PADDINGS
  className?: string
  children: React.ReactNode
}

/** Superfície branca simples, sem a moldura da Secao. */
export function Cartao({ padding = 'md', className = '', children }: CartaoProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${PADDINGS[padding]} ${className}`}>
      {children}
    </div>
  )
}

/** Cartão que é um link: ganha o realce de hover e o anel de foco por teclado. */
export function CartaoLink({ padding = 'md', className = '', children, ...props }: CartaoProps & React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={`block bg-white border border-slate-200 rounded-2xl transition-colors ` +
        `hover:border-slate-300 hover:bg-slate-50 ` +
        `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ` +
        `${PADDINGS[padding]} ${className}`}
    >
      {children}
    </Link>
  )
}

// ─── Cabeçalho de tela ───────────────────────────────────────────────────────

type PageHeaderProps = {
  titulo: string
  descricao?: string
  /** Seta de voltar à esquerda do título. */
  voltarPara?: string
  /** Botões da direita. */
  acoes?: React.ReactNode
}

/**
 * Topo de tela: título e uma linha dizendo o que é. Sem bloco de ícone
 * colorido ao lado — na referência o topo é só texto, e é o que faz a tela
 * começar no conteúdo em vez de num enfeite.
 */
export function PageHeader({ titulo, descricao, voltarPara, acoes }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {voltarPara && (
          <Link
            href={voltarPara}
            aria-label="Voltar"
            className="btn btn-secundario btn-icone shrink-0 mt-0.5"
          >
            {/* Seta desenhada à mão: evita importar ícone só pra isto e manda
                o componente ficar do lado do cliente sem precisar. */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="pagina-titulo truncate">{titulo}</h1>
          {descricao && <p className="pagina-descricao">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  )
}

// ─── Lista vazia ─────────────────────────────────────────────────────────────

type EmptyStateProps = {
  /** Ícone já renderizado, ex.: <IdCard className="w-7 h-7" />. */
  icone?: React.ReactNode
  titulo: string
  descricao?: string
  acao?: React.ReactNode
}

export function EmptyState({ icone, titulo, descricao, acao }: EmptyStateProps) {
  return (
    <div className="py-14 px-6 text-center">
      {icone && <div className="text-slate-300 flex justify-center mb-3">{icone}</div>}
      <p className="text-slate-800 text-sm font-medium">{titulo}</p>
      {descricao && <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">{descricao}</p>}
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </div>
  )
}

// ─── Selo de status ──────────────────────────────────────────────────────────

const TONS = {
  neutro: 'selo-neutro',
  marca: 'selo-acento',
  positivo: 'selo-sucesso',
  atencao: 'selo-aviso',
  negativo: 'selo-erro',
} as const

export type TomBadge = keyof typeof TONS

export function Badge({ tom = 'neutro', className = '', children }: {
  tom?: TomBadge
  className?: string
  children: React.ReactNode
}) {
  return <span className={`indicador-selo ${TONS[tom]} ${className}`}>{children}</span>
}

// ─── Aviso ───────────────────────────────────────────────────────────────────

const AVISOS = {
  marca: 'bg-brand-50 border-brand-200 text-brand-700',
  atencao: 'bg-amber-50 border-amber-200 text-amber-700',
  erro: 'bg-red-50 border-red-200 text-red-600',
} as const

export function Aviso({ tom = 'marca', icone, children }: {
  tom?: keyof typeof AVISOS
  icone?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={`flex items-start gap-2 border rounded-xl px-4 py-3 text-sm ${AVISOS[tom]}`}>
      {icone && <span className="shrink-0 mt-0.5">{icone}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
