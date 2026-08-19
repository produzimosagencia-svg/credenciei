// Skeleton instantâneo desta rota — ver comentário em app/admin/loading.tsx.
export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-64 bg-slate-200 rounded-lg" />
        <div className="h-3.5 w-96 max-w-full bg-slate-100 rounded" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[100px] bg-slate-200 rounded-2xl" />
        ))}
      </div>

      <div className="h-14 bg-slate-100 rounded-xl" />
      <div className="flex gap-2">
        <div className="h-[38px] flex-1 bg-slate-100 rounded-lg" />
        <div className="h-[38px] w-60 bg-slate-100 rounded-lg" />
        <div className="h-[38px] w-24 bg-slate-200 rounded-lg" />
      </div>

      <div className="secao">
        <div className="secao-cabecalho space-y-2">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-3 w-64 bg-slate-100 rounded" />
        </div>
        <div className="secao-corpo divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-52 bg-slate-200 rounded" />
                <div className="h-3 w-80 max-w-full bg-slate-100 rounded" />
              </div>
              <div className="h-8 w-24 bg-slate-200 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
