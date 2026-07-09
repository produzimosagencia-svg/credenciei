export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-48 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-64 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-slate-100 rounded-xl" />
          <div className="h-9 w-24 bg-slate-100 rounded-xl" />
          <div className="h-10 w-32 bg-slate-200 rounded-xl" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-slate-100 mb-3" />
            <div className="h-7 w-10 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-16 bg-slate-100 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Fornecedores + Atividade */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm" style={{ height: 520 }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
            <div className="h-5 w-28 bg-slate-200 rounded-lg" />
            <div className="h-8 w-24 bg-slate-100 rounded-xl" />
          </div>
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm" style={{ height: 520 }}>
          <div className="px-5 pt-5 pb-4 border-b border-slate-100">
            <div className="h-5 w-36 bg-slate-200 rounded-lg" />
          </div>
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
