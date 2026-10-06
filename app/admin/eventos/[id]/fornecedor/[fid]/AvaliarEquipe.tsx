'use client'

import { useEffect, useState } from 'react'
import { Star, ChevronDown } from 'lucide-react'
import { avaliarColaborador, notasDaEquipe } from '@/lib/actions'
import { EstrelasEditaveis } from '@/components/EstrelasNota'

/**
 * Avaliação da equipe depois do evento: uma nota de 1 a 5 estrelas por
 * colaborador. A nota fica na PESSOA (por CPF) e entra no histórico dela.
 * O servidor é quem decide se já pode avaliar — aqui só escondemos o painel
 * quando o evento não terminou.
 */
export default function AvaliarEquipe({ fornecedorId, eventoId, equipe }: {
  fornecedorId: string
  eventoId: string
  equipe: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [notas, setNotas] = useState<Record<string, number> | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!aberto || notas) return
    let vivo = true
    notasDaEquipe(fornecedorId, eventoId).then(n => { if (vivo) setNotas(n) })
    return () => { vivo = false }
  }, [aberto, notas, fornecedorId, eventoId])

  async function escolher(id: string, nota: number) {
    setErro('')
    setSalvando(id)
    const r = await avaliarColaborador(id, fornecedorId, eventoId, nota)
    setSalvando(null)
    if ('erro' in r) { setErro(r.erro); return }
    setNotas(n => ({ ...(n ?? {}), [id]: r.nota }))
  }

  const avaliados = notas ? equipe.filter(f => notas[f.id]).length : 0

  return (
    <div className="secao">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-2 font-bold text-sm text-slate-800">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          Avaliar equipe
          {notas && <span className="text-xs font-medium text-slate-500">{avaliados}/{equipe.length} avaliados</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500 mb-3">
            De 1 a 5 estrelas. A nota fica no histórico de cada pessoa e ajuda nos próximos eventos.
          </p>
          {erro && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{erro}</p>}
          {!notas ? (
            <p className="text-sm text-slate-400">Carregando…</p>
          ) : equipe.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum colaborador nesta equipe.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {equipe.map(f => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm text-slate-700 truncate">{f.nome}</span>
                  <EstrelasEditaveis
                    nota={notas[f.id] ?? null}
                    onEscolher={n => escolher(f.id, n)}
                    desabilitado={salvando === f.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
