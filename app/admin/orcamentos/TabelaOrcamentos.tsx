'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Download, Copy, Trash2, AlertTriangle, FileText } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui/Superficie'
import ConfirmModal from '@/components/ConfirmModal'
import { excluirOrcamento, duplicarOrcamento } from '@/lib/actions-orcamentos'
import { brl, numeroOrcamento, ROTULO_STATUS, TOM_STATUS } from '@/lib/orcamentos-constantes'
import type { Orcamento } from '@/lib/orcamentos'

export default function TabelaOrcamentos({ orcamentos }: { orcamentos: Orcamento[] }) {
  const router = useRouter()
  const [excluir, setExcluir] = useState<Orcamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const confirmarExclusao = () => {
    if (!excluir) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirOrcamento(excluir.id)
      if (!r.ok) { setErro(r.erro); return }
      setExcluir(null)
      router.refresh()
    })
  }

  const duplicar = (id: string) => {
    setErro(null)
    startTransition(async () => {
      const r = await duplicarOrcamento(id)
      if (!r.ok) { setErro(r.erro); return }
      router.push(`/admin/orcamentos/${r.id}/editar`)
    })
  }

  if (!orcamentos.length) {
    return (
      <EmptyState
        icone={<FileText className="w-7 h-7" />}
        titulo="Nenhum orçamento ainda"
        descricao="Crie o primeiro orçamento pra ter um PDF profissional pronto pra mandar ao cliente."
        acao={<Link href="/admin/orcamentos/novo" className="btn btn-primario">+ Novo orçamento</Link>}
      />
    )
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
              <th className="text-left font-semibold px-3 py-2">Número</th>
              <th className="text-left font-semibold px-3 py-2">Evento</th>
              <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Responsável</th>
              <th className="text-left font-semibold px-3 py-2 hidden md:table-cell">Data do evento</th>
              <th className="text-right font-semibold px-3 py-2">Valor total</th>
              <th className="text-left font-semibold px-3 py-2 hidden lg:table-cell">Criado em</th>
              <th className="text-left font-semibold px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {orcamentos.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 tabular-nums text-slate-500 whitespace-nowrap">{numeroOrcamento(o.numero)}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/orcamentos/${o.id}/editar`} className="text-slate-800 hover:text-brand-600 font-medium">
                    {o.nomeEvento}
                  </Link>
                  <span className="sm:hidden block text-2xs text-slate-400">{o.responsavel}</span>
                </td>
                <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{o.responsavel}</td>
                <td className="px-3 py-2 text-slate-600 hidden md:table-cell whitespace-nowrap">{dataBr(o.dataEvento)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">{brl(o.valorTotal)}</td>
                <td className="px-3 py-2 text-slate-500 hidden lg:table-cell whitespace-nowrap">{dataBr(o.createdAt.slice(0, 10))}</td>
                <td className="px-3 py-2"><Badge tom={TOM_STATUS[o.status]}>{ROTULO_STATUS[o.status]}</Badge></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 justify-end">
                    <Link href={`/admin/orcamentos/${o.id}/editar`} className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white" aria-label="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Link>
                    <a href={`/api/orcamentos/${o.id}/pdf`} download className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white" aria-label="Baixar PDF">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => duplicar(o.id)} disabled={pendente} className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white" aria-label="Duplicar">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExcluir(o)} className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white" aria-label="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        isPending={pendente}
        titulo="Excluir orçamento"
        mensagem={excluir ? `Apagar o orçamento ${numeroOrcamento(excluir.numero)} (${excluir.nomeEvento})? Isso não tem desfazer.` : ''}
      />
    </div>
  )
}

function dataBr(iso: string | null) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}
