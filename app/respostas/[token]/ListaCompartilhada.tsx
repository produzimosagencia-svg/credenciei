'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { ConversaCompartilhada } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import { chaveBusca } from '@/lib/format'
import { formatarTelefone, iniciais, rotuloSemTexto } from './formato'

/**
 * A coluna de conversas, no mesmo desenho da aba Conversas do painel.
 *
 * A diferença é o destaque: lá ele marca mensagem não lida, e leitura é um
 * estado por usuário que este link não tem. Aqui marca quem ainda espera
 * resposta, que é o que interessa a quem está atendendo.
 */
export default function ListaCompartilhada({ token, lista, selecionado }: {
  token: string
  lista: ConversaCompartilhada[]
  selecionado?: string
}) {
  const [busca, setBusca] = useState('')
  const filtrada = useMemo(() => {
    const termo = chaveBusca(busca)
    if (!termo) return lista
    return lista.filter(c => chaveBusca(`${c.nome} ${c.telefone} ${c.ultimoTexto ?? ''}`).includes(termo))
  }, [busca, lista])

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white">
      <div className="p-3 border-b border-slate-200">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar conversa"
            aria-label="Pesquisar conversa"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!filtrada.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            {lista.length ? 'Nenhuma conversa encontrada.' : 'Ainda não chegou nenhuma resposta.'}
          </p>
        ) : filtrada.map(c => {
          const nome = c.nome || formatarTelefone(c.telefone)
          const ativa = selecionado === c.telefone
          return (
            <Link
              key={c.telefone}
              href={`/respostas/${token}/${c.telefone}`}
              className={`flex items-center gap-3 px-3.5 py-3 border-b border-slate-100 transition-colors ${
                ativa ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {iniciais(nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.aguardando ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{nome}</span>
                  <span className={`shrink-0 text-2xs tabular-nums ${c.aguardando ? 'font-semibold text-green-600' : 'text-slate-400'}`}>
                    {formatarBR(c.ultimaEm, 'curto')}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                    {c.ultimaDirecao === 'enviada' && 'Você: '}
                    {c.ultimoTexto?.replace(/\s+/g, ' ') || rotuloSemTexto(c.ultimoTipo)}
                  </span>
                  {c.aguardando && (
                    <span aria-label="Aguardando resposta" title="Aguardando resposta" className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
                  )}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
