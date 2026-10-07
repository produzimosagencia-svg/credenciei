'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { chaveBusca } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import type { PessoaDaEquipe } from '@/lib/encarregado-consulta'

type Filtro = 'todos' | 'presentes' | 'faltam' | 'pendentes'

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'presentes', rotulo: 'Já chegaram' },
  { valor: 'faltam', rotulo: 'Faltam' },
  { valor: 'pendentes', rotulo: 'Aguardando aprovação' },
]

/** Etapa do dia: o horário se feita, um traço se não. Só leitura — nada aqui é botão. */
function Etapa({ rotulo, quando }: { rotulo: string; quando: string | null }) {
  return (
    <span className={`flex flex-col items-center min-w-[44px] ${quando ? 'text-slate-800' : 'text-slate-300'}`}>
      <span className="text-2xs uppercase tracking-wide text-slate-400">{rotulo}</span>
      <span className="text-xs font-semibold tabular-nums">{quando ? formatarBR(quando, 'hora') : '—'}</span>
    </span>
  )
}

/**
 * A equipe do setor, com busca e filtro. SOMENTE LEITURA: nenhuma linha abre
 * modal de edição, não há botão de ação — é a regra do Encarregado.
 */
export default function ListaEquipe({ pessoas, veContato, fornecedorId }: { pessoas: PessoaDaEquipe[]; veContato: boolean; fornecedorId: string }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const lista = useMemo(() => {
    const t = chaveBusca(busca)
    return pessoas.filter(p => {
      if (t && !chaveBusca(p.nome).includes(t) && !chaveBusca(p.cargo).includes(t)) return false
      const ativa = p.status === 'aprovado' && p.ativo
      if (filtro === 'presentes') return ativa && !!p.entrada
      if (filtro === 'faltam') return ativa && !p.entrada
      if (filtro === 'pendentes') return p.status === 'pendente'
      return true
    })
  }, [pessoas, busca, filtro])

  return (
    <div className="space-y-3">
      <div data-tutorial="enc-busca" className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou função" className="input w-full pl-10" autoComplete="off"
            aria-label="Buscar na equipe"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(f => (
            <button
              key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
              className={`btn-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filtro === f.valor ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {!lista.length ? (
        <p className="text-slate-400 text-sm py-6 text-center">Ninguém encontrado com esse filtro.</p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {lista.map(p => (
            <li key={p.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/encarregado/${fornecedorId}/${p.id}`} className="block text-slate-800 text-sm font-semibold truncate hover:text-brand-600 transition-colors">{p.nome}</Link>
                <p className="text-slate-400 text-xs truncate">
                  {[p.cargo, p.empresa].filter(Boolean).join(' · ') || 'Sem função definida'}
                </p>
                {veContato && (
                  <p className="text-slate-400 text-2xs tabular-nums truncate">
                    {p.cpf}{p.telefone ? ` · ${p.telefone}` : ''}
                  </p>
                )}
                {(p.status !== 'aprovado' || !p.ativo || p.diasAprovados.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {p.status === 'pendente' && <Badge tom="atencao">Aguardando aprovação</Badge>}
                    {p.status === 'negado' && <Badge tom="negativo">Não aprovado</Badge>}
                    {p.status === 'aprovado' && !p.ativo && <Badge tom="neutro">Desativado</Badge>}
                    {p.diasAprovados.length > 0 && (
                      <span className="text-2xs text-slate-400">
                        Escalado: {p.diasAprovados.map(d => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {p.status === 'aprovado' && p.ativo && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Etapa rotulo="Ent." quando={p.entrada} />
                  <Etapa rotulo="Meio" quando={p.meio} />
                  <Etapa rotulo="Saída" quando={p.fim} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
