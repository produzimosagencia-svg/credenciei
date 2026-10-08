'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Clock, Check } from 'lucide-react'
import { solicitarMaisColaboradores } from '@/lib/actions-pedidos-setor'
import type { Ampliacao } from '@/lib/pedidos-setor-consulta'
import { normalizarAmpliacao } from '@/lib/pedido-setor-regras'
import { formatarBR } from '@/lib/tz'

/**
 * "Solicitar mais colaboradores" — o supervisor pede ao admin, pelo sistema, em vez de WhatsApp e ligação
 * (pedido do Juan, 08/10/2026). Mostra o que o setor tem hoje, pede quantos ele quer e por quê, e lista a
 * resposta dos últimos pedidos (aprovado com quanto, ou negado com o motivo).
 */
export default function SolicitarMaisColaboradores({
  fornecedorId, combinado, cadastrados, pedidos,
}: {
  fornecedorId: string
  /** O combinado do setor (`quantidade_estimada`); nulo = sem número combinado. */
  combinado: number | null
  /** Quantas pessoas da equipe já estão cadastradas (sem o crachá do supervisor). */
  cadastrados: number
  pedidos: Ampliacao[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const atual = combinado ?? cadastrados
  const pendente = pedidos.find(p => p.status === 'pendente')

  const enviar = async () => {
    setErro(null)
    const conferido = normalizarAmpliacao({ atual, desejada: quantidade, motivo })
    if (!conferido.ok) { setErro(conferido.erro); return }
    setEnviando(true)
    const r = await solicitarMaisColaboradores(fornecedorId, quantidade, motivo)
    setEnviando(false)
    if ('erro' in r) { setErro(r.erro); return }
    setEnviado(true)
    setQuantidade('')
    setMotivo('')
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => { setAberto(true); setEnviado(false); setErro(null) }} className="btn btn-secundario btn-sm">
        <UserPlus className="w-3.5 h-3.5 shrink-0" />
        {pendente ? 'Pedido de mais colaboradores aguardando' : 'Solicitar mais colaboradores'}
      </button>

      {aberto && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAberto(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-base">Mais colaboradores</h3>
              <button type="button" onClick={() => setAberto(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <p className="text-2xs text-slate-500">Combinado hoje</p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{combinado ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <p className="text-2xs text-slate-500">Cadastrados</p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{cadastrados}</p>
              </div>
            </div>

            {enviado ? (
              <p className="rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm p-3">
                Pedido enviado. O administrador do evento vai analisar — a resposta aparece aqui e chega no seu WhatsApp.
              </p>
            ) : pendente ? (
              <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">
                Você já pediu {pendente.quantidadeDesejada} colaboradores em {formatarBR(pendente.criadoEm, 'curto')}. Aguarde a decisão do administrador.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Quantos colaboradores você precisa no total?</span>
                  <input type="number" inputMode="numeric" min={atual + 1} className="input tabular-nums" placeholder={`Mais que ${atual}`} value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Motivo</span>
                  <textarea rows={3} maxLength={300} className="input" placeholder="Ex.: a demanda do bar aumentou para o sábado" value={motivo} onChange={e => setMotivo(e.target.value)} />
                </label>
                {erro && <p className="text-red-600 text-xs">{erro}</p>}
                <button type="button" onClick={enviar} disabled={enviando} className="btn btn-primario w-full">
                  {enviando ? 'Enviando…' : 'Enviar para o administrador'}
                </button>
              </div>
            )}

            {pedidos.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seus pedidos</p>
                {pedidos.map(p => (
                  <div key={p.id} className="text-xs text-slate-600 flex items-start gap-2">
                    {p.status === 'pendente' ? <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      : p.status === 'aprovado' ? <Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                      : <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                    <span className="min-w-0">
                      Pediu {p.quantidadeDesejada} · {formatarBR(p.criadoEm, 'curto')} —{' '}
                      {p.status === 'pendente' ? 'aguardando'
                        : p.status === 'aprovado' ? <strong className="text-green-700">aprovado: {p.quantidadeAprovada}</strong>
                        : <strong className="text-red-700">negado: {p.motivoNegacao}</strong>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
