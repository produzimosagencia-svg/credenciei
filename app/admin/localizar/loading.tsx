// Skeleton instantâneo desta rota — ver comentário em app/admin/loading.tsx.
export default function Loading() {
  return (
    <div className="max-w-xl space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-slate-200 rounded-xl" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="h-3.5 w-64 bg-slate-100 rounded" />
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-28 bg-slate-100 rounded" />
            <div className="h-11 bg-slate-50 rounded-xl" />
          </div>
        ))}
        <div className="h-11 bg-slate-200 rounded-xl mt-2" />
      </div>
    </div>
  )
}
