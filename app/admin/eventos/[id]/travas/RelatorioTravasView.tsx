'use client'
import { useMemo, useState } from 'react'
import { Search, ShieldAlert, ShieldHalf, ShieldCheck } from 'lucide-react'
import { Secao, Cartao, Badge, EmptyState } from '@/components/ui/Superficie'
import type { RelatorioTravas, LinhaRelatorioTrava } from '@/lib/escala'

const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

const GRUPOS: { situacao: LinhaRelatorioTrava['situacao']; titulo: string; icone: React.ReactNode; tom: 'aviso' | 'neutro' | 'sucesso' }[] = [
  { situacao: 'sem_trava', titulo: 'Sem trava nenhuma', icone: <ShieldAlert className="w-3.5 h-3.5" />, tom: 'aviso' },
  { situacao: 'parcial', titulo: 'Trava parcial (só alguns dias)', icone: <ShieldHalf className="w-3.5 h-3.5" />, tom: 'neutro' },
  { situacao: 'completa', titulo: 'Trava completa (todos os dias)', icone: <ShieldCheck className="w-3.5 h-3.5" />, tom: 'sucesso' },
]

/**
 * A lista de fornecedores agrupada por situação, com busca — pedido do Juan, 08/10/2026. `relatorio` vem pronto
 * do servidor (`obterRelatorioTravas`); esta tela só filtra e desenha.
 */
export default function RelatorioTravasView({ relatorio }: { relatorio: RelatorioTravas }) {
  const [busca, setBusca] = useState('')

  const porSituacao = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = !termo
      ? relatorio.linhas
      : relatorio.linhas.filter(l =>
          l.nome.toLowerCase().includes(termo) || l.supervisores.some(s => s.toLowerCase().includes(termo)))
    const mapa = new Map<LinhaRelatorioTrava['situacao'], LinhaRelatorioTrava[]>()
    for (const l of filtradas) mapa.set(l.situacao, [...(mapa.get(l.situacao) ?? []), l])
    return mapa
  }, [relatorio.linhas, busca])

  if (!relatorio.dias.length) {
    return (
      <EmptyState
        icone={<ShieldAlert className="w-7 h-7" />}
        titulo="Este evento não tem dias de trabalho configurados"
        descricao="A trava por dia depende dos dias do evento (Editar evento → Dias de trabalho)."
      />
    )
  }

  const contagem = (s: LinhaRelatorioTrava['situacao']) => relatorio.linhas.filter(l => l.situacao === s).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tom="atencao">{contagem('sem_trava')} sem trava</Badge>
          <Badge tom="neutro">{contagem('parcial')} parcial</Badge>
          <Badge tom="positivo">{contagem('completa')} completa</Badge>
        </div>
        <div className="relative sm:ml-auto sm:max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por setor ou supervisor…"
            className="input pl-8 text-sm w-full"
          />
        </div>
      </div>

      {GRUPOS.map(g => {
        const linhas = porSituacao.get(g.situacao) ?? []
        if (!linhas.length) return null
        return (
          <Secao key={g.situacao} titulo={g.titulo} descricao={`${linhas.length} setor(es)`} icone={g.icone} tom={g.tom}>
            <div className="space-y-2">
              {linhas.map(l => (
                <Cartao key={l.fornecedorId} padding="sm">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-slate-800 font-semibold text-sm truncate">{l.nome}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {l.supervisores.length ? l.supervisores.join(', ') : 'sem supervisor cadastrado'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      {l.porDia.map(d => (
                        <span
                          key={d.data}
                          className={`rounded-lg px-2 py-1 text-2xs font-medium tabular-nums ${
                            d.maximo == null
                              ? 'bg-amber-50 text-amber-700'
                              : d.aprovados > d.maximo
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-50 text-slate-600'
                          }`}
                        >
                          {rotuloDia(d.data)}: {d.maximo == null ? 'livre' : `${d.aprovados}/${d.maximo}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </Cartao>
              ))}
            </div>
          </Secao>
        )
      })}

      {[...porSituacao.values()].every(l => l.length === 0) && (
        <EmptyState icone={<Search className="w-7 h-7" />} titulo="Ninguém encontrado para essa busca." />
      )}
    </div>
  )
}
