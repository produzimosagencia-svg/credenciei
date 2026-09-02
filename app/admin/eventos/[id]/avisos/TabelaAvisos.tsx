'use client'
import { useMemo, useState } from 'react'
import { Search, Megaphone, X, Repeat } from 'lucide-react'
import { Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import AcoesAviso from './AcoesAviso'

export type LinhaAviso = {
  id: string
  titulo: string
  mensagem: string
  ativo: boolean
  dataInicio: string // 'AAAA-MM-DD'
  dataFim: string | null
  publico: 'todos' | 'setores' | 'pessoa' | 'supervisores'
  cpfPessoa: string | null
  recorrente: boolean
  destinatario: string
  visualizacoes: number
  fornecedorIds: string[]
}

type FuncionarioDoEvento = { id: string; nome: string; cpf: string }
type Fornecedor = { id: string; nome: string }

/** 'AAAA-MM-DD' → 'DD/MM' — nunca via `Date`/`formatarBR`: é uma data pura,
 *  sem fuso, e passar por `new Date()` desloca um dia (meia-noite UTC vira
 *  o dia anterior em BRT). Mesmo cuidado de `rotuloDia` em `presenca/page.tsx`. */
const rotulo = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

/**
 * A tabela de Avisos, com busca por título/mensagem/destinatário — mesmo
 * padrão de `TabelaPresenca.tsx`: dados já vêm prontos do servidor, aqui só
 * se decide o que aparece.
 */
export default function TabelaAvisos({
  linhas, eventoId, fornecedores, funcionarios, hoje,
}: {
  linhas: LinhaAviso[]
  eventoId: string
  fornecedores: Fornecedor[]
  funcionarios: FuncionarioDoEvento[]
  hoje: string
}) {
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return linhas
    return linhas.filter(l =>
      l.titulo.toLowerCase().includes(t) || l.mensagem.toLowerCase().includes(t) || l.destinatario.toLowerCase().includes(t),
    )
  }, [linhas, busca])

  return (
    <Secao
      tom="acento"
      icone={<Megaphone className="w-3.5 h-3.5" />}
      titulo={`${visiveis.length} ${visiveis.length === 1 ? 'aviso' : 'avisos'}`}
      descricao={busca ? `de ${linhas.length} no total` : undefined}
      corpoClassName={visiveis.length ? '' : 'p-4'}
    >
      {linhas.length > 5 && (
        <div className="relative px-4 pt-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título, mensagem ou destinatário…"
            aria-label="Buscar avisos"
            className="input pl-9 pr-9 text-sm"
          />
          {busca && (
            <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-6 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {!visiveis.length ? (
        <EmptyState
          icone={<Megaphone className="w-7 h-7" />}
          titulo={busca ? `Nenhum aviso com "${busca}"` : 'Nenhum aviso criado ainda'}
          descricao={busca ? undefined : 'Crie um aviso pra avisar a equipe de algo pontual, direto na credencial ou no painel do supervisor.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                <th className="text-left font-semibold px-4 py-2.5">Aviso</th>
                <th className="text-left font-semibold px-4 py-2.5">Destinatário</th>
                <th className="text-left font-semibold px-4 py-2.5">Status</th>
                <th className="text-left font-semibold px-4 py-2.5">Início</th>
                <th className="text-left font-semibold px-4 py-2.5">Término</th>
                <th className="text-left font-semibold px-4 py-2.5">Visualizações</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const expirado = !!l.dataFim && l.dataFim < hoje
                return (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-2.5 max-w-xs">
                      <p className="text-slate-800 font-medium truncate flex items-center gap-1.5">
                        {l.titulo}
                        {l.recorrente && <span title="Recorrente — mostra sempre"><Repeat className="w-3 h-3 text-slate-300 shrink-0" /></span>}
                      </p>
                      <p className="text-slate-400 text-xs truncate">{l.mensagem}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[16rem] truncate">{l.destinatario}</td>
                    <td className="px-4 py-2.5">
                      {!l.ativo ? (
                        <Badge tom="neutro">Inativo</Badge>
                      ) : expirado ? (
                        <Badge tom="atencao">Expirado</Badge>
                      ) : (
                        <Badge tom="positivo">Ativo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{rotulo(l.dataInicio)}</td>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{l.dataFim ? rotulo(l.dataFim) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-700 tabular-nums">{l.visualizacoes}</td>
                    <td className="px-4 py-2.5 text-right">
                      <AcoesAviso aviso={l} eventoId={eventoId} fornecedores={fornecedores} funcionarios={funcionarios} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  )
}
