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
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ElementType
  tom?: TomStat
  /** Valor em texto longo (dinheiro, por exemplo) pede um degrau a menos. */
  small?: boolean
}) {
  return (
    <div className={`indicador ${TONS[tom]}`}>
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
    </div>
  )
}
