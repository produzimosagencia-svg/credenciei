/**
 * Indicador numérico do painel.
 *
 * Antes cada KPI vinha com cor própria: ícone colorido dentro de uma
 * pastilha colorida, uma família de cor por card. Com quatro na mesma
 * linha, nenhuma das cores significava nada — era decoração, e é o que
 * mais denuncia painel de template.
 *
 * Agora: rótulo pequeno em cima, número grande embaixo, ícone neutro
 * discreto no canto. A cor entra só quando o valor PEDE atenção (uma
 * pendência, um atraso) — via `tom`, não por card.
 *
 * As props `color`/`bg`/`border` continuam sendo aceitas porque 3 telas as
 * passam; são ignoradas de propósito, pra não precisar mexer nas chamadas.
 */

const TONS = {
  neutro: 'text-slate-800',
  sucesso: 'text-[--color-sucesso-700]',
  aviso: 'text-[--color-aviso-700]',
  erro: 'text-[--color-erro-600]',
} as const

export default function StatCard({
  label,
  value,
  sub,
  tom = 'neutro',
  small,
}: {
  label: string
  value: string | number
  sub?: string
  tom?: keyof typeof TONS
  /**
   * `icon`, `color`, `bg` e `border` continuam no tipo porque 3 telas os
   * passam — mas não são mais renderizados. O ícone saiu de propósito: num
   * cartão que só tem rótulo e número, ele não informa nada, só ocupa a
   * linha do rótulo. Stripe e Linear não põem ícone em KPI.
   */
  icon?: React.ElementType
  color?: string
  bg?: string
  border?: string
  small?: boolean
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
      <p className="text-slate-500 text-xs font-medium">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`${small ? 'text-xl' : 'text-[length:--text-metrica] leading-[--text-metrica--line-height]'} font-semibold tabular-nums tracking-tight ${TONS[tom]}`}>
          {value}
        </span>
        {sub && <span className="text-slate-400 text-xs">{sub}</span>}
      </div>
    </div>
  )
}
