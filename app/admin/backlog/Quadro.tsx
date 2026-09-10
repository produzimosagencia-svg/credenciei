'use client'
import { useState } from 'react'
import { COLUNAS, type TipoItem } from '@/lib/backlog-constantes'
import type { ItemBacklog } from '@/lib/backlog'
import CartaoItem from './CartaoItem'

const FAIXA: Record<string, string> = {
  neutro: 'bg-slate-300',
  info: 'bg-blue-400',
  acento: 'bg-brand-500',
  aviso: 'bg-amber-400',
  sucesso: 'bg-green-500',
  erro: 'bg-red-400',
}

/**
 * O quadro Kanban.
 *
 * ─── ARRASTAR SEM BIBLIOTECA ─────────────────────────────────────────────────
 *
 * Drag and drop nativo do HTML: `draggable` no card, `onDrop` na coluna. Uma
 * biblioteca de DnD custaria dezenas de KB no bundle pra fazer exatamente
 * isto — e a única coisa que o pedido descreve é "mover card entre colunas".
 *
 * O DnD nativo NÃO funciona em toque (celular), e é por isso que o painel do
 * item tem o seletor de status: quem estiver no celular muda por lá, sem
 * ficar sem saída. Nenhuma ação do quadro existe SÓ no arrastar.
 *
 * ─── O CARD ANDA ANTES DA RESPOSTA ───────────────────────────────────────────
 *
 * `onMover` é otimista: a coluna nova recebe o card na hora e o servidor
 * confirma depois. Arrastar e ver o card voltar sozinho por meio segundo é o
 * tipo de coisa que faz a pessoa arrastar duas vezes. Se o servidor recusar,
 * quem chamou desfaz e mostra o erro — ver `BacklogTela`.
 */
export default function Quadro({
  tipo, itens, hoje, onAbrir, onMover,
}: {
  tipo: TipoItem
  itens: ItemBacklog[]
  hoje: string
  onAbrir: (item: ItemBacklog) => void
  onMover: (item: ItemBacklog, status: string) => void
}) {
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max items-start">
        {COLUNAS[tipo].map(coluna => {
          const daColuna = itens.filter(i => i.status === coluna.valor)
          const ativa = colunaAlvo === coluna.valor
          return (
            <section
              key={coluna.valor}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setColunaAlvo(coluna.valor) }}
              onDragLeave={() => setColunaAlvo(atual => (atual === coluna.valor ? null : atual))}
              onDrop={e => {
                e.preventDefault()
                setColunaAlvo(null)
                const id = e.dataTransfer.getData('text/plain')
                const item = itens.find(i => i.id === id)
                if (item && item.status !== coluna.valor) onMover(item, coluna.valor)
              }}
              className={`w-[17.5rem] shrink-0 rounded-2xl border transition-colors ${
                ativa ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <header className="px-3 pt-3 pb-2">
                <span className={`block h-1 w-8 rounded-full ${FAIXA[coluna.tom]}`} />
                <div className="flex items-center justify-between gap-2 mt-2">
                  <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wide truncate">
                    {coluna.rotulo}
                  </h3>
                  <span className="text-slate-400 text-2xs tabular-nums shrink-0">{daColuna.length}</span>
                </div>
              </header>

              <div className="px-2 pb-2 space-y-2 min-h-[4.5rem]">
                {daColuna.map(item => (
                  <CartaoItem key={item.id} item={item} hoje={hoje} arrastavel onAbrir={() => onAbrir(item)} />
                ))}
                {!daColuna.length && (
                  <p className="text-slate-300 text-xs text-center py-6 select-none">
                    {ativa ? 'Solte aqui' : 'Vazio'}
                  </p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
