'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Copy, Check, RefreshCw, ArrowRight } from 'lucide-react'
import { alternarLinkPedidoSetor, trocarTokenPedidoSetor } from '@/lib/actions-pedidos-setor'
import { copiarTexto } from '@/lib/navegador'

/** ISO → "AAAA-MM-DDTHH:MM" no horário do navegador, que é o que o campo de data e hora entende. */
function paraCampo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * O link de pedido de setor do evento.
 *
 * Um endereço público para mandar no grupo dos fornecedores: cada um diz o setor, a quantidade por dia e o
 * supervisor, e o pedido cai na fila aqui no sistema (em vez de WhatsApp e ligação). Nasce FECHADO — o
 * organizador abre quando quiser, com prazo se quiser, e fecha quando a lista terminar. O endereço continua o
 * mesmo ao fechar e reabrir.
 */
export default function PedidosSetorCard({
  eventoId, ativo, token, prazo, aguardando, total,
}: {
  eventoId: string
  ativo: boolean
  token: string | null
  prazo: string | null
  /** Pedidos esperando decisão (setores novos + mais colaboradores). */
  aguardando: number
  /** Pedidos já recebidos (qualquer estado). */
  total: number
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
  const [prazoCampo, setPrazoCampo] = useState<string | null>(null)

  const valorDoPrazo = prazoCampo ?? paraCampo(prazo)

  const executar = (fn: () => Promise<{ ok: true } | { erro: string }>) => {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if ('erro' in r) { setErro(r.erro); return }
      setConfirmandoTroca(false)
      router.refresh()
    })
  }

  const alternar = (ligar: boolean) => executar(() =>
    alternarLinkPedidoSetor(eventoId, ligar, valorDoPrazo ? new Date(valorDoPrazo).toISOString() : null))

  const copiar = async () => {
    if (!token) return
    if (await copiarTexto(`${window.location.origin}/pedido-setor/${token}`)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 mb-4 space-y-3 ${ativo ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${ativo ? 'bg-brand-50 text-brand-500' : 'bg-slate-200 text-slate-500'}`}>
            <Building2 className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-slate-800 text-sm font-extrabold">Pedidos de setor {ativo ? 'abertos' : 'fechados'}</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {ativo
                ? 'Os fornecedores pedem o setor pelo link abaixo e acompanham a resposta. Os pedidos caem na fila para você aprovar, editar ou negar.'
                : 'Abra o link para os fornecedores pedirem o setor, a quantidade por dia e o supervisor sem passar pelo WhatsApp.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Aparece também sem o link aberto: pedido de MAIS colaboradores do supervisor chega aqui do mesmo jeito. */}
          {(token || aguardando > 0) && (
            <Link href={`/admin/eventos/${eventoId}/pedidos-setor`} className="btn btn-secundario">
              Ver pedidos{aguardando > 0 && <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold tabular-nums inline-flex items-center justify-center">{aguardando}</span>}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <button type="button" onClick={() => alternar(!ativo)} disabled={pendente} className={`btn ${ativo ? 'btn-secundario' : 'btn-primario'}`}>
            {pendente ? 'Aguarde…' : ativo ? 'Fechar pedidos' : 'Abrir pedidos'}
          </button>
        </div>
      </div>

      {token && (
        <div className="border-t border-slate-200/80 pt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs text-slate-600 bg-slate-100 rounded-lg px-2.5 py-1.5 truncate max-w-full">/pedido-setor/{token}</code>
            <button type="button" onClick={copiar} className="btn btn-secundario btn-sm">
              {copiado ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar link</>}
            </button>
            {!confirmandoTroca ? (
              <button type="button" onClick={() => setConfirmandoTroca(true)} className="text-slate-500 text-xs hover:underline inline-flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Gerar outro endereço
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="text-amber-700">O link antigo para de funcionar.</span>
                <button type="button" disabled={pendente} onClick={() => executar(() => trocarTokenPedidoSetor(eventoId))} className="btn btn-perigo btn-sm">Trocar</button>
                <button type="button" onClick={() => setConfirmandoTroca(false)} className="btn btn-secundario btn-sm">Cancelar</button>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              Aceitar pedidos até (opcional)
              <input
                type="datetime-local" suppressHydrationWarning value={valorDoPrazo}
                onChange={e => setPrazoCampo(e.target.value)} className="input mt-1 block"
              />
            </label>
            <button type="button" disabled={pendente} onClick={() => alternar(ativo)} className="btn btn-secundario btn-sm">Salvar prazo</button>
            {valorDoPrazo && (
              <button type="button" onClick={() => setPrazoCampo('')} className="text-slate-500 text-xs hover:underline">Sem prazo</button>
            )}
          </div>
          <p className="text-slate-400 text-2xs">{total} pedido{total === 1 ? '' : 's'} recebido{total === 1 ? '' : 's'} até agora.</p>
        </div>
      )}
      {erro && <p className="text-red-500 text-xs">{erro}</p>}
    </div>
  )
}
