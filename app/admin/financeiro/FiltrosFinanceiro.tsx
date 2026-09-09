'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'
import { CATEGORIAS_CUSTO, EVENTO_INTERNO } from '@/lib/financeiro-categorias'

/**
 * Os filtros do dashboard — período, evento, categoria. Vivem na URL, igual
 * aos de Auditoria: dá pra voltar, recarregar e mandar o recorte pra outra
 * pessoa. Cada troca navega de novo (Server Component recalcula tudo), o
 * que cumpre o pedido do Juan ao pé da letra: "ao alterar os filtros, todos
 * os KPIs e gráficos devem ser atualizados automaticamente".
 */
export default function FiltrosFinanceiro({
  eventos,
}: {
  eventos: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  const evento = params.get('evento') ?? ''
  const categoria = params.get('categoria') ?? ''
  const temFiltro = !!(de || ate || evento || categoria)

  const trocar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params.toString())
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    router.push(`${pathname}?${novo.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-slate-400 text-2xs font-medium block mb-1">De</label>
        <DateTimePicker modo="data" value={de} onChange={v => trocar('de', v)} placeholder="Início" className="w-auto text-sm" />
      </div>
      <div>
        <label className="text-slate-400 text-2xs font-medium block mb-1">Até</label>
        <DateTimePicker modo="data" value={ate} onChange={v => trocar('ate', v)} placeholder="Fim" className="w-auto text-sm" />
      </div>

      <SeletorLista
        className="w-auto text-sm"
        valor={evento}
        onChange={v => trocar('evento', v)}
        placeholder="Evento: todos"
        titulo="Evento"
        busca
        opcoes={[
          { valor: '', rotulo: 'Todos' },
          { valor: EVENTO_INTERNO, rotulo: 'Interno — despesas da empresa' },
          ...eventos.map(e => ({ valor: e.id, rotulo: e.nome })),
        ]}
      />

      <SeletorLista
        className="w-auto text-sm"
        valor={categoria}
        onChange={v => trocar('categoria', v)}
        placeholder="Categoria: todas"
        titulo="Categoria do custo"
        opcoes={[{ valor: '', rotulo: 'Todas' }, ...CATEGORIAS_CUSTO.map(c => ({ valor: c, rotulo: c }))]}
      />

      {temFiltro && (
        <button onClick={() => router.push(pathname)} className="btn btn-secundario btn-sm">
          <X className="w-3.5 h-3.5" /> Limpar
        </button>
      )}
    </div>
  )
}
