'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DoorClosed, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { listarSemSaida, fecharDiaDaEquipe, type PessoaSemSaida } from '@/lib/actions-fechar-dia'
import { LogoLoading } from '@/components/LogoLoading'

/** Agora, em Brasília, no formato do input datetime-local. */
function agoraNoInput(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16)
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/**
 * "Fechar o dia" (Juan, 14/10/2026): lança de uma vez a SAÍDA de quem entrou no dia e ficou aberto — escolhe as
 * pessoas (todas marcadas), o horário e o motivo. As regras ficam no servidor (lib/actions-fechar-dia.ts).
 */
export default function FecharDiaBotao({ eventoId, dataRef, fornecedorId, rotuloDia, compacto = false }: {
  eventoId: string
  dataRef: string
  /** Só este fornecedor; sem ele, todos os que a pessoa pode ver no evento. */
  fornecedorId?: string | null
  rotuloDia: string
  compacto?: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pessoas, setPessoas] = useState<PessoaSemSaida[] | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [quando, setQuando] = useState('')
  const [motivo, setMotivo] = useState('Saiu sem bater a saída — dia fechado pela equipe.')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ lancadas: number; puladas: { nome: string; porque: string }[] } | null>(null)
  const [carregando, startCarregar] = useTransition()
  const [salvando, startSalvar] = useTransition()

  const abrir = () => {
    setAberto(true); setErro(null); setResultado(null); setPessoas(null); setQuando(agoraNoInput())
    startCarregar(async () => {
      const r = await listarSemSaida(eventoId, dataRef, fornecedorId)
      if ('erro' in r) { setErro(r.erro); return }
      setPessoas(r.pessoas)
      setMarcadas(new Set(r.pessoas.map(p => p.id)))
    })
  }

  const alternar = (id: string) => setMarcadas(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const confirmar = () => {
    setErro(null)
    startSalvar(async () => {
      const r = await fecharDiaDaEquipe({ eventoId, dataRef, fornecedorId, quandoLocal: quando, motivo, funcionarioIds: [...marcadas] })
      if ('erro' in r) { setErro(r.erro); return }
      setResultado({ lancadas: r.lancadas, puladas: r.puladas })
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={abrir} className={compacto ? 'btn btn-secundario btn-sm' : 'btn btn-primario'}>
        <DoorClosed className="w-4 h-4 shrink-0" /> Fechar o dia
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => !salvando && setAberto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div>
                <h3 className="text-slate-800 font-bold text-lg">Fechar o dia · {rotuloDia}</h3>
                <p className="text-slate-500 text-sm mt-0.5">Lança a saída de quem entrou e ficou sem saída. Fica marcado como lançado à mão, com o seu nome e o motivo.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {resultado ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 className="w-5 h-5" /> {resultado.lancadas} saída(s) lançada(s).</p>
                  {!!resultado.puladas.length && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                      <p className="font-semibold">{resultado.puladas.length} ficaram de fora:</p>
                      <ul className="mt-1 list-disc pl-5">{resultado.puladas.map((x, i) => <li key={i}>{x.nome} — {x.porque}</li>)}</ul>
                    </div>
                  )}
                  <button type="button" onClick={() => setAberto(false)} className="w-full btn btn-primario">Pronto</button>
                </div>
              ) : carregando || !pessoas ? (
                erro ? <p className="text-red-600 text-sm">{erro}</p> : <div className="flex justify-center py-6"><LogoLoading tamanho="sm" /></div>
              ) : !pessoas.length ? (
                <p className="text-slate-600 text-sm">Ninguém sem saída neste dia. 🎉</p>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-700">{marcadas.size} de {pessoas.length} sem saída</span>
                      <button type="button" onClick={() => setMarcadas(marcadas.size === pessoas.length ? new Set() : new Set(pessoas.map(p => p.id)))} className="text-xs font-semibold text-brand-600 hover:underline">
                        {marcadas.size === pessoas.length ? 'Desmarcar todos' : 'Marcar todos'}
                      </button>
                    </div>
                    <ul className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {pessoas.map(p => (
                        <li key={p.id}>
                          <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} className="w-4 h-4 accent-brand-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-slate-800 truncate">{p.nome}</span>
                              <span className="block text-xs text-slate-400 truncate">{p.setor} · entrou {hora(p.entradaISO)}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Horário da saída</label>
                    <input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className="input" />
                    <p className="text-slate-400 text-xs">Use o horário em que a equipe realmente saiu. Não pode ficar no futuro; quem entrou depois dele fica de fora.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Motivo *</label>
                    <textarea rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} className="input" />
                  </div>
                  {erro && <p className="flex items-start gap-1.5 text-red-600 text-xs"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{erro}</p>}
                  <button type="button" disabled={salvando || !marcadas.size} onClick={confirmar} className="w-full btn btn-primario disabled:opacity-60">
                    {salvando ? 'Lançando…' : `Lançar a saída de ${marcadas.size} pessoa(s)`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
