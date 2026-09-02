'use client'
import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import { formatCpf } from '@/lib/format'
import { Secao, EmptyState } from '@/components/ui/Superficie'

export type LinhaPresenca = {
  id: string
  nome: string
  cpf: string
  setor: string
  em: string | null
  manual: boolean
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/**
 * A tabela de uma visão de presença, com busca por nome ou CPF.
 *
 * Cliente porque a busca precisa responder a cada tecla sem recarregar a
 * página — os dados já vêm prontos do servidor (`PresencaPage`), aqui só se
 * decide o que aparece. Mesmo padrão de `ListaDeSetores.tsx`.
 */
export default function TabelaPresenca({
  linhas, icone, colunaHora, mostrarSetor,
}: {
  linhas: LinhaPresenca[]
  icone: React.ReactNode
  /** Vazio quando a etapa não tem hora pra mostrar (ex.: "Ainda não chegaram"). */
  colunaHora: string
  mostrarSetor: boolean
}) {
  const [busca, setBusca] = useState('')

  const digitosBusca = busca.replace(/\D/g, '')
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return linhas
    return linhas.filter(l =>
      l.nome.toLowerCase().includes(t) || (digitosBusca.length >= 3 && l.cpf.includes(digitosBusca)),
    )
  }, [linhas, busca, digitosBusca])

  return (
    <Secao
      tom="acento"
      icone={icone}
      titulo={`${visiveis.length} ${visiveis.length === 1 ? 'pessoa' : 'pessoas'}`}
      descricao={busca ? `de ${linhas.length} no total` : undefined}
      corpoClassName={visiveis.length ? '' : 'p-4'}
    >
      {linhas.length > 8 && (
        <div className="relative px-4 pt-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF…"
            aria-label="Buscar nesta lista"
            className="input pl-9 pr-9 text-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-6 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {!visiveis.length ? (
        <EmptyState
          icone={<Users className="w-7 h-7" />}
          titulo={busca ? `Ninguém com "${busca}"` : 'Ninguém nesta lista'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                <th className="text-left font-semibold px-4 py-2.5">Nome</th>
                {mostrarSetor && <th className="text-left font-semibold px-4 py-2.5">Setor</th>}
                <th className="text-left font-semibold px-4 py-2.5">CPF</th>
                <th className="text-left font-semibold px-4 py-2.5">{colunaHora}</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => (
                <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 text-slate-800 font-medium">{l.nome}</td>
                  {mostrarSetor && <td className="px-4 py-2.5 text-slate-500">{l.setor}</td>}
                  <td className="px-4 py-2.5 text-slate-500 font-mono tabular-nums">{formatCpf(l.cpf)}</td>
                  <td className="px-4 py-2.5 text-slate-700 tabular-nums whitespace-nowrap">
                    {l.em ? hora(l.em) : <span className="text-slate-300">—</span>}
                    {/* Batida registrada por outra pessoa: o fechamento
                        precisa distinguir do que a própria pessoa marcou. */}
                    {l.manual && (
                      <span className="ml-2 text-2xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                        manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  )
}
