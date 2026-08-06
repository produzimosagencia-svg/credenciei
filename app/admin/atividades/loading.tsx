// Skeleton instantâneo desta rota — ver comentário em app/admin/loading.tsx.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 bg-slate-200 rounded-lg" />
        <div className="h-3.5 w-80 bg-slate-100 rounded" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="h-3 w-24 bg-slate-100 rounded" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      <div className="h-9 w-72 bg-slate-100 rounded-lg" />

      <div className="secao">
        <div className="secao-cabecalho space-y-2">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-3 w-52 bg-slate-100 rounded" />
        </div>
        <div className="secao-corpo divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3">
              <div className="mt-1.5 w-2 h-2 bg-slate-200 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-44 bg-slate-200 rounded" />
                <div className="h-3 w-64 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
