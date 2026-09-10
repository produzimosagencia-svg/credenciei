'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, UserMinus, Users, Download, CalendarClock, ShieldCheck } from 'lucide-react'
import { removerNaConferencia, confirmarConferencia, planilhaEquipeDaConferencia } from '@/lib/actions-conferencia'
import type { ConferenciaSetor } from '@/lib/conferencia'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import ConfirmModal from '@/components/ConfirmModal'
import { LogoLoading } from '@/components/LogoLoading'

/**
 * A tela que o supervisor usa 1 dia antes: vê a equipe, tira quem não é dele,
 * e confirma. Boa experiência = uma lista, um botão por pessoa, um botão pra
 * fechar. Sem passo escondido.
 */
export default function ConferenciaEquipe({ estado }: { estado: ConferenciaSetor }) {
  const router = useRouter()
  const [equipe, setEquipe] = useState(estado.equipe)
  const [erro, setErro] = useState<string | null>(null)
  const [aRemover, setARemover] = useState<{ id: string; nome: string } | null>(null)
  const [confirmandoFinal, setConfirmandoFinal] = useState(false)
  const [pendente, startTransition] = useTransition()
  const [baixando, setBaixando] = useState(false)

  const jaConfirmada = estado.status === 'confirmada'

  const remover = () => {
    if (!aRemover) return
    setErro(null)
    const alvo = aRemover
    startTransition(async () => {
      const r = await removerNaConferencia(alvo.id, estado.fornecedorId, estado.eventoId)
      if (!r.ok) { setErro(r.erro); setARemover(null); return }
      setEquipe(e => e.filter(m => m.id !== alvo.id))
      setARemover(null)
      router.refresh()
    })
  }

  const confirmar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await confirmarConferencia(estado.fornecedorId, estado.eventoId)
      if (!r.ok) { setErro(r.erro); setConfirmandoFinal(false); return }
      setConfirmandoFinal(false)
      router.refresh()
    })
  }

  const baixarPlanilha = async () => {
    setBaixando(true)
    try {
      const r = await planilhaEquipeDaConferencia(estado.fornecedorId, estado.eventoId)
      if (!r.ok) { setErro(r.erro); return }
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = r.nome
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBaixando(false)
    }
  }

  // ── Ainda não abriu ──────────────────────────────────────────────────────
  if (!estado.aberta) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-3">
        <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-slate-700 font-semibold">A conferência abre 1 dia antes do evento</p>
        <p className="text-slate-500 text-sm">
          Disponível a partir de <strong>{formatarBR(estado.abreEm, 'completo')}</strong>. Volte nessa data para
          conferir e confirmar a equipe do setor <strong>{estado.setorNome}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {jaConfirmada && (
        <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-green-800 font-semibold">Equipe já confirmada</p>
            <p className="text-green-700/80 text-xs mt-0.5">
              {estado.confirmadaPorNome ?? 'Alguém'} confirmou em {estado.confirmadaEm ? formatarBR(estado.confirmadaEm, 'completo') : '—'}
              {estado.totalRemovidos != null && ` · ${estado.totalMantidos} mantidos, ${estado.totalRemovidos} removidos`}.
              Você pode ajustar e confirmar de novo — cada confirmação fica registrada.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="w-4 h-4 text-slate-400" />
            {equipe.length} {equipe.length === 1 ? 'pessoa' : 'pessoas'} na equipe
          </span>
          <button
            onClick={baixarPlanilha}
            disabled={baixando}
            className="btn btn-secundario btn-sm disabled:opacity-50"
          >
            {baixando ? <LogoLoading tamanho={14} /> : <Download className="w-3.5 h-3.5" />}
            Baixar planilha
          </button>
        </div>

        {!equipe.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">Ninguém na equipe deste setor.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {equipe.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 text-sm font-medium truncate">{m.nome}</p>
                  <p className="text-slate-400 text-xs truncate">
                    {formatCpf(m.cpf)}{m.cargo ? ` · ${m.cargo}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setARemover({ id: m.id, nome: m.nome })}
                  disabled={pendente}
                  className="btn btn-secundario btn-sm text-red-600 hover:bg-red-50 shrink-0 disabled:opacity-50"
                >
                  <UserMinus className="w-3.5 h-3.5" /> Tirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro && <p className="text-red-500 text-sm">{erro}</p>}

      <button
        onClick={() => setConfirmandoFinal(true)}
        disabled={pendente}
        className="btn btn-primario btn-lg w-full disabled:opacity-50"
      >
        {pendente ? <LogoLoading tamanho={16} /> : <Check className="w-4 h-4" />}
        Confirmar equipe ({equipe.length} {equipe.length === 1 ? 'pessoa' : 'pessoas'})
      </button>
      <p className="text-center text-xs text-slate-400">
        Ao confirmar, fica registrado que você conferiu esta equipe, com data e hora.
      </p>

      <ConfirmModal
        open={!!aRemover}
        onClose={() => setARemover(null)}
        onConfirm={remover}
        isPending={pendente}
        mensagem={`Tirar ${aRemover?.nome ?? ''} da equipe do setor ${estado.setorNome}? A pessoa sai da lista deste evento; o histórico dela fica.`}
      />
      <ConfirmModal
        open={confirmandoFinal}
        onClose={() => setConfirmandoFinal(false)}
        onConfirm={confirmar}
        isPending={pendente}
        mensagem={`Confirmar que estas ${equipe.length} pessoas são a equipe do setor ${estado.setorNome} para o evento ${estado.eventoNome}?`}
      />
    </div>
  )
}
