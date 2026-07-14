'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Camera, MapPin, Minus } from 'lucide-react'
import { atualizarValorReceber } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'
import type { Presenca } from './FuncionarioTable'

type Funcionario = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  valorReceber: number
  entrada: Presenca
  meio: Presenca
  fim: Presenca
}

export default function FuncionarioDetalheModal({
  funcionario: f,
  fornecedorId,
  eventoId,
  trigger,
}: {
  funcionario: Funcionario
  fornecedorId: string
  eventoId: string
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState(String(f.valorReceber))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
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

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left">{trigger}</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-slate-800 font-bold">{f.nome}</h2>
                <p className="text-slate-400 text-xs mt-0.5">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">CPF</p>
                  <p className="text-slate-700 font-medium font-mono">{f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Telefone</p>
                  <p className="text-slate-700 font-medium">{f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</p>
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
                      className="input pl-9"
                    />
                  </div>
                  <button
                    onClick={handleSalvar}
                    disabled={isPending}
                    className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shrink-0"
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
    <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
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
  )
}
