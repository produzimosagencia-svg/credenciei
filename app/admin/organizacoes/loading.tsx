// Skeleton instantâneo desta rota. Sem ele a navegação fica bloqueada até o
// servidor terminar as consultas — que é o "delayzinho" ao trocar de tela.
export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-slate-200 rounded-lg" />
          <div className="h-4 w-52 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-10 w-36 bg-slate-200 rounded-xl" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="h-5 w-56 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-80 bg-slate-100 rounded mt-3" />
          </div>
        ))}
      </div>
    </div>
  )
}
