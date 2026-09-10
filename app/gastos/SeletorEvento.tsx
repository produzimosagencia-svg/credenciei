'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import SeletorLista from '@/components/SeletorLista'

/**
 * Escolhe o evento e prende na URL (`?evento=`). Todos os gastos registrados
 * a seguir ficam nesse evento — e recarregar, voltar ou mandar o link mantém
 * o contexto. Mesma ideia do filtro de Auditoria e do Financeiro.
 */
export default function SeletorEvento({
  eventos, atual,
}: {
  eventos: { id: string; nome: string; ativo: boolean }[]
  atual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const trocar = (id: string) => {
    const novo = new URLSearchParams(params.toString())
    if (id) novo.set('evento', id)
    else novo.delete('evento')
    router.push(`${pathname}?${novo.toString()}`)
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <CalendarDays className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Evento</p>
          <SeletorLista
            className="w-full mt-0.5"
            valor={atual}
            onChange={trocar}
            placeholder="Escolha o evento"
            titulo="Evento dos gastos"
            busca={eventos.length > 6}
            opcoes={eventos.map(e => ({ valor: e.id, rotulo: e.nome, detalhe: e.ativo ? undefined : 'encerrado' }))}
          />
        </div>
      </div>
    </div>
  )
}
