'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Camera, MapPin, Minus, User, ScanLine, Check } from 'lucide-react'
import { atualizarValorReceber, alternarPagamento } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'
import type { Presenca } from './FuncionarioTable'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Funcionario = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  valorReceber: number
  chavePix: string | null
  pago: boolean
  pagoEm: string | null
  fotoUrl: string | null
  entrada: Presenca
  meio: Presenca
  fim: Presenca
}

export default function FuncionarioDetalheModal({
  funcionario: f,
  fornecedorId,
  eventoId,
  valorCombinado,
  trigger,
}: {
  funcionario: Funcionario
  fornecedorId: string
  eventoId: string
  valorCombinado: number | null
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState(String(f.valorReceber))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPendingPagamento, startTransitionPagamento] = useTransition()
  const router = useRouter()

  const handleSalvar = () => {
    setErro(null)
    const n = parseFloat(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      setErro('Valor inválido')
      return
    }
    startTransition(async () => {
      try {
        await atualizarValorReceber(f.id, fornecedorId, eventoId, n)
        router.refresh()
        setOpen(false)
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao salvar o valor')
      }
    })
  }

  const handleAlternarPagamento = () => {
    startTransitionPagamento(async () => {
      try {
        await alternarPagamento(f.id, fornecedorId, eventoId, !f.pago)
        router.refresh()
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao atualizar o pagamento')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left">{trigger}</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                {f.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.fotoUrl} alt={f.nome} className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-slate-800 font-bold truncate">{f.nome}</h2>
                  <p className="text-slate-400 text-xs mt-0.5 truncate">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">CPF</p>
                  <p className="text-slate-700 font-medium font-mono tabular-nums">{f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Telefone</p>
                  <p className="text-slate-700 font-medium tabular-nums">{f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</p>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Presença</p>
                <div className="space-y-1.5">
                  <LinhaPresenca label="Entrada" p={f.entrada} />
                  <LinhaPresenca label="Meio" p={f.meio} />
                  <LinhaPresenca label="Fim" p={f.fim} />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Financeiro</p>
                  <button
                    onClick={handleAlternarPagamento}
                    disabled={isPendingPagamento}
                    className={`btn-press flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:active:scale-100 ${
                      f.pago ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={f.pago && f.pagoEm ? `Pago em ${formatarBR(f.pagoEm, 'curto')} — clique para desfazer` : 'Marcar como pago'}
                  >
                    {f.pago ? <Check className="w-3.5 h-3.5" /> : null}
                    {isPendingPagamento ? 'Salvando...' : f.pago ? 'PAGO' : 'Marcar como pago'}
                  </button>
                </div>
                {valorCombinado != null && (
                  <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-slate-500">Valor combinado (setor)</span>
                    <span className="text-slate-700 font-semibold tabular-nums">{brl(valorCombinado)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2 gap-2">
                  <span className="text-slate-500 shrink-0">Chave PIX</span>
                  <span className={`font-medium font-mono truncate ${f.chavePix ? 'text-slate-700' : 'text-slate-300'}`}>
                    {f.chavePix || 'Não informada'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Valor a receber do setor</p>
                <p className="text-slate-400 text-xs mb-2">
                  Quanto este funcionário deve receber dos demais integrantes de {f.empresa || 'seu setor'}.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={valor}
                      onChange={e => setValor(e.target.value.replace(/^0+(?=\d)/, ''))}
                      className="input pl-9 tabular-nums"
                    />
                  </div>
                  <button
                    onClick={handleSalvar}
                    disabled={isPending}
                    className="btn-press flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:active:scale-100 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shrink-0"
                  >
                    {isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
                {erro && <p className="text-red-500 text-xs mt-1.5">{erro}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function LinhaPresenca({ label, p }: { label: string; p: Presenca }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        {!p ? (
          <span className="text-slate-300 flex items-center gap-1"><Minus className="w-3.5 h-3.5" /></span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-green-600 text-xs font-semibold">{formatarBR(p.feitoEm, 'curto')}</span>
            {p.fotoUrl && (
              <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-brand-500" title="Ver foto">
                <Camera className="w-3.5 h-3.5" />
              </a>
            )}
            {p.lat != null && p.lng != null && (
              <a href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-brand-500" title="Ver local">
                <MapPin className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
      {p?.enderecoAproximado && (
        <p className="text-slate-400 text-[11px] flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5 shrink-0" /> {p.enderecoAproximado}
        </p>
      )}
      {p?.registradoPor && (
        <p className="text-slate-400 text-[11px] flex items-center gap-1">
          <ScanLine className="w-2.5 h-2.5 shrink-0" /> Registrado por {p.registradoPor}
        </p>
      )}
    </div>
  )
}
