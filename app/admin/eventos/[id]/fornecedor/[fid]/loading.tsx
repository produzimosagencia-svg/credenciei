export default function Loading() {
  return (
    <div className="space-y-6 max-w-6xl animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-56 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="h-9 w-32 bg-slate-100 rounded-xl" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="h-7 w-10 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-20 bg-slate-100 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="h-9 flex-1 min-w-48 bg-slate-50 rounded-xl" />
          <div className="h-7 w-64 bg-slate-100 rounded-xl" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
