// Skeleton instantâneo desta rota — ver comentário em app/admin/loading.tsx.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 bg-slate-200 rounded-lg shrink-0" />
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200 rounded-lg" />
          <div className="h-3.5 w-40 bg-slate-100 rounded" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[100px] bg-slate-200 rounded-2xl" />
        ))}
      </div>

      <div className="secao">
        <div className="secao-cabecalho">
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>
        <div className="secao-corpo p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 bg-slate-100 rounded" />
              <div className="h-4 w-28 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="secao">
        <div className="secao-cabecalho space-y-2">
          <div className="h-4 w-44 bg-slate-200 rounded" />
          <div className="h-3 w-56 bg-slate-100 rounded" />
        </div>
        <div className="secao-corpo divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="h-3.5 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-72 max-w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
