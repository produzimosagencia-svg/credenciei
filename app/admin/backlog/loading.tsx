import { Secao } from '@/components/ui/Superficie'

export default function Carregando() {
  return (
    <div className="space-y-5">
      <div className="h-9 w-64 rounded-lg bg-slate-100 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
      <Secao titulo="Backlog Operacional" descricao="Carregando os itens…" corpoClassName="p-4">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-[17.5rem] h-64 shrink-0 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      </Secao>
    </div>
  )
}
