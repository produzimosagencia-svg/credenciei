// Card de indicador reutilizável — mesmo visual usado em app/admin/page.tsx,
// app/admin/eventos/[id]/page.tsx e a página do fornecedor, antes duplicado
// inline em cada tela.
export default function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  border,
  small,
}: {
  label: string
  value: string | number
  icon?: React.ElementType
  color: string
  bg: string
  border: string
  small?: boolean
}) {
  return (
    <div className={`bg-white border ${border} rounded-2xl p-4 shadow-sm`}>
      {Icon && (
        <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${bg} mb-3`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      )}
      <p className={`${small ? 'text-lg' : 'text-2xl'} font-bold ${Icon ? 'text-slate-800' : color}`}>{value}</p>
      <p className="text-slate-500 text-xs mt-0.5 font-medium">{label}</p>
    </div>
  )
}
