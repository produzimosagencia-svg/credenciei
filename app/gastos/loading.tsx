export default function Carregando() {
  return (
    <div className="space-y-5">
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="h-40 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}
      </div>
      <div className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  )
}
