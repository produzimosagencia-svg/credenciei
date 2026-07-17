// Card de indicador reutilizável — mesmo visual usado em app/admin/page.tsx,
// app/admin/eventos/[id]/page.tsx e a página do fornecedor.
// Anatomia no padrão de referência do cliente: ícone + rótulo na linha de
// cima, número grande embaixo. A cor fica SÓ no ícone — texto usa tons
// neutros, e a borda do card é neutra (a prop `border` é aceita por
// compatibilidade com os call sites, mas não pinta mais a borda).
export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
  small,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ElementType
  color: string
  bg: string
  border?: string
  small?: boolean
}) {
  return (
    <div className="group bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2.5">
        {Icon && (
          <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${bg} shrink-0 transition-transform group-hover:scale-105`}>
            <Icon className={`w-3.5 h-3.5 ${color}`} />
          </div>
        )}
        <p className="text-slate-500 text-xs font-medium leading-tight">{label}</p>
      </div>
      <p className={`${small ? 'text-lg' : 'text-2xl'} font-bold tracking-tight tabular-nums text-slate-800`}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}
