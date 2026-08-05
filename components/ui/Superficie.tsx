import Link from 'next/link'

/**
 * As superfícies e blocos de texto que se repetiam em toda tela.
 *
 * Nenhum deles é 'use client': assim servem a Server Component e a Client
 * Component igual. Ícone entra como filho (JSX), nunca como prop de
 * componente — passar componente do servidor pro cliente quebra em produção,
 * e já quebrou aqui em cinco telas de uma vez.
 */

// ─── Cartão ──────────────────────────────────────────────────────────────────

const PADDINGS = { nenhum: '', sm: 'p-4', md: 'p-5', lg: 'p-6' } as const

type CartaoProps = {
  padding?: keyof typeof PADDINGS
  /** Some com o padding interno pra tabela/lista encostar na borda. */
  className?: string
  children: React.ReactNode
}

export function Cartao({ padding = 'md', className = '', children }: CartaoProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${PADDINGS[padding]} ${className}`}>
      {children}
    </div>
  )
}

/** Cartão que é um link: ganha o realce de hover e o anel de foco por teclado. */
export function CartaoLink({ padding = 'md', className = '', children, ...props }: CartaoProps & React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={`block bg-white border border-slate-200 rounded-2xl shadow-sm transition-all ` +
        `hover:border-brand-300 hover:shadow-md ` +
        `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ` +
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

export function PageHeader({ titulo, descricao, voltarPara, acoes }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {voltarPara && (
          <Link
            href={voltarPara}
            aria-label="Voltar"
            className="btn-press w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            {/* Seta desenhada à mão: evita importar ícone só pra isto e manda
                o componente ficar do lado do cliente sem precisar. */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800 truncate">{titulo}</h1>
          {descricao && <p className="text-slate-500 text-sm mt-0.5">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  )
}

// ─── Lista vazia ─────────────────────────────────────────────────────────────

type EmptyStateProps = {
  /** Ícone já renderizado, ex.: <IdCard className="w-12 h-12" />. */
  icone?: React.ReactNode
  titulo: string
  descricao?: string
  acao?: React.ReactNode
}

export function EmptyState({ icone, titulo, descricao, acao }: EmptyStateProps) {
  return (
    <Cartao padding="nenhum" className="p-12 sm:p-16 text-center">
      {icone && <div className="text-slate-200 flex justify-center mb-4">{icone}</div>}
      <p className="text-slate-500 font-semibold">{titulo}</p>
      {descricao && <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">{descricao}</p>}
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </Cartao>
  )
}

// ─── Selo de status ──────────────────────────────────────────────────────────

const TONS = {
  neutro: 'bg-slate-50 text-slate-500 border-slate-200',
  marca: 'bg-brand-50 text-brand-700 border-brand-200',
  positivo: 'bg-green-50 text-green-600 border-green-200',
  atencao: 'bg-amber-50 text-amber-700 border-amber-200',
  negativo: 'bg-red-50 text-red-600 border-red-200',
} as const

export type TomBadge = keyof typeof TONS

export function Badge({ tom = 'neutro', className = '', children }: {
  tom?: TomBadge
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold border ${TONS[tom]} ${className}`}>
      {children}
    </span>
  )
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
    <div className={`flex items-start gap-2 border rounded-2xl px-4 py-3 text-sm ${AVISOS[tom]}`}>
      {icone && <span className="shrink-0 mt-0.5">{icone}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
