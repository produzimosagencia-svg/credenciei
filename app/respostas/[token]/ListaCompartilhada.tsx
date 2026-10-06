'use client'

import { useMemo, useState } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { useParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import type { ConversaCompartilhada } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import { chaveBusca } from '@/lib/format'
import { corDoCirculo, formatarTelefone, iniciais, rotuloSemTexto } from './formato'
import estilos from './chat.module.css'

type Filtro = 'todas' | 'aguardando'

/** Faixa de progresso no item clicado, enquanto a conversa dele ainda não abriu. */
function Abrindo() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 ${estilos.progresso}`} />
}

/**
 * A coluna de conversas, no desenho da aba Conversas do painel.
 *
 * A diferença é o destaque: lá ele marca mensagem não lida, e leitura é um
 * estado por usuário que este link não tem. Aqui marca quem ainda espera
 * resposta, que é o que interessa a quem está atendendo, e o filtro
 * "Aguardando" deixa só essas na tela.
 */
export default function ListaCompartilhada({ token, lista }: { token: string; lista: ConversaCompartilhada[] }) {
  const { telefone: selecionado } = useParams<{ telefone?: string }>()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const aguardando = useMemo(() => lista.filter(c => c.aguardando).length, [lista])
  const filtrada = useMemo(() => {
    const termo = chaveBusca(busca)
    return lista.filter(c =>
      (filtro === 'todas' || c.aguardando) &&
      (!termo || chaveBusca(`${c.nome} ${c.telefone} ${c.ultimoTexto ?? ''}`).includes(termo)))
  }, [busca, filtro, lista])

  const abas: { chave: Filtro; rotulo: string; total: number }[] = [
    { chave: 'todas', rotulo: 'Todas', total: lista.length },
    { chave: 'aguardando', rotulo: 'Aguardando', total: aguardando },
  ]

  return (
    <aside className="flex h-full min-h-0 flex-col border-white/10 lg:border-r">
      <div className="space-y-3 border-b border-white/10 p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar por nome, telefone ou mensagem"
            aria-label="Pesquisar conversa"
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[#ff6a2b]/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-[#ff4a0f]/20"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        <div role="tablist" aria-label="Filtrar conversas" className="flex gap-1 rounded-xl bg-white/[0.05] p-1">
          {abas.map(aba => {
            const ativa = filtro === aba.chave
            return (
              <button
                key={aba.chave}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setFiltro(aba.chave)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ativa ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/55 hover:text-white'
                }`}
              >
                {aba.rotulo}
                <span className={`rounded-full px-1.5 py-px text-2xs tabular-nums ${ativa ? 'bg-[#ff4a0f] text-white' : 'bg-white/10 text-white/60'}`}>
                  {aba.total.toLocaleString('pt-BR')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${estilos.rolagem}`}>
        {!filtrada.length ? (
          <p className="px-6 py-12 text-center text-sm text-white/50">
            {!lista.length
              ? 'Ainda não chegou nenhuma resposta.'
              : busca
                ? 'Nenhuma conversa encontrada para essa pesquisa.'
                : 'Ninguém esperando resposta. Tudo em dia.'}
          </p>
        ) : filtrada.map(c => {
          const nome = c.nome || formatarTelefone(c.telefone)
          const ativa = selecionado === c.telefone
          return (
            <Link
              key={c.telefone}
              href={`/respostas/${token}/${c.telefone}`}
              aria-current={ativa ? 'page' : undefined}
              className={`group relative flex items-center gap-3 border-b border-white/[0.06] px-3.5 py-3 transition-colors duration-150 ${
                ativa ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05] active:bg-white/[0.08]'
              }`}
            >
              <span aria-hidden className={`absolute inset-y-2 left-0 w-1 rounded-r-full bg-[#ff5a1f] transition-opacity duration-150 ${ativa ? 'opacity-100' : 'opacity-0'}`} />
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm transition-transform duration-150 group-hover:scale-105 ${corDoCirculo(c.telefone)}`}>
                {iniciais(nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.aguardando ? 'font-bold text-white' : 'font-medium text-white/85'}`}>{nome}</span>
                  <span className={`shrink-0 text-2xs tabular-nums ${c.aguardando ? 'font-semibold text-emerald-300' : 'text-white/40'}`}>
                    {formatarBR(c.ultimaEm, 'curto')}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className={`min-w-0 flex-1 truncate text-xs ${c.aguardando ? 'text-white/70' : 'text-white/45'}`}>
                    {c.ultimaDirecao === 'enviada' && <span className="text-white/60">Você: </span>}
                    {c.ultimoTexto?.replace(/\s+/g, ' ') || rotuloSemTexto(c.ultimoTipo)}
                  </span>
                  {c.aguardando && (
                    <span aria-label="Aguardando resposta" title="Aguardando resposta" className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]" />
                  )}
                </span>
              </span>
              <Abrindo />
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
