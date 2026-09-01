/**
 * Cartão de indicador (KPI).
 *
 * Cartão claro com um fio da cor no topo, um bloco colorido no ícone e um
 * fundo levemente tingido. A cor vem do SIGNIFICADO do número — o que precisa
 * de atenção é âmbar, o que está bem é verde, o que só conta coisa é azul —
 * nunca de uma cor por posição na fileira.
 *
 * O número continua quase preto de propósito: número colorido lê pior, e ele
 * é o conteúdo do cartão. A cor emoldura, não substitui.
 *
 * A aparência mora nas classes `.indicador*` do globals.css.
 */

import Link from 'next/link'

const TONS = {
  neutro: '',
  acento: 'indicador-acento',
  info: 'indicador-info',
  sucesso: 'indicador-sucesso',
  aviso: 'indicador-aviso',
  erro: 'indicador-erro',
} as const

export type TomStat = keyof typeof TONS

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tom = 'neutro',
  small,
  href,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ElementType
  tom?: TomStat
  /** Valor em texto longo (dinheiro, por exemplo) pede um degrau a menos. */
  small?: boolean
  /**
   * Para onde o cartão leva, quando o número tem uma lista por trás.
   *
   * Opcional de propósito: nem todo indicador tem detalhe que valha uma tela
   * (o total de setores, por exemplo, já está logo abaixo). Sem `href` o
   * cartão continua sendo o que sempre foi — um retângulo que não clica.
   */
  href?: string
}) {
  const conteudo = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="indicador-rotulo truncate">{label}</p>
        <p
          className="indicador-valor"
          style={small ? { fontSize: '1.25rem', lineHeight: '1.75rem' } : undefined}
        >
          {value}
        </p>
        {sub && <p className="indicador-sub">{sub}</p>}
      </div>
      {Icon && (
        <span className="indicador-icone" aria-hidden="true">
          <Icon className="w-4 h-4" />
        </span>
      )}
    </div>
  )

  if (!href) return <div className={`indicador ${TONS[tom]}`}>{conteudo}</div>

  // `block` e `text-left` porque `.indicador` foi desenhado para uma div:
  // sem eles o link vira inline e o cartão encolhe até o tamanho do texto.
  return (
    <Link href={href} className={`indicador ${TONS[tom]} block text-left hover:brightness-[0.98] transition-all`}>
      {conteudo}
    </Link>
  )
}
