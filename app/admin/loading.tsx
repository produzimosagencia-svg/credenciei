// Skeleton exibido instantaneamente durante navegações entre rotas do admin.
// Habilita partial prefetch + streaming: a sidebar permanece interativa
// enquanto o conteúdo da página carrega no servidor.
export default function Loading() {
  return (
    <div className="space-y-8 max-w-6xl animate-pulse">
      {/* Título */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 bg-slate-200 rounded-lg" />
          <div className="h-4 w-64 bg-slate-100 rounded-lg hidden sm:block" />
        </div>
        <div className="h-10 w-32 bg-slate-200 rounded-xl" />
      </div>

      {/* Cards de stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-slate-100 mb-3" />
            <div className="h-8 w-16 bg-slate-200 rounded-lg" />
            <div className="h-3.5 w-24 bg-slate-100 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Blocos de conteúdo */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <div className="h-5 w-28 bg-slate-200 rounded-lg mb-5" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-50 rounded-xl" />
          ))}
        </div>
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <div className="h-5 w-36 bg-slate-200 rounded-lg mb-5" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
