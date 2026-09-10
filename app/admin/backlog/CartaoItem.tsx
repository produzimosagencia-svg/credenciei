'use client'
import { Building2, CheckSquare, CalendarClock, User, Users, CalendarDays } from 'lucide-react'
import type { ItemBacklog } from '@/lib/backlog'
import { corDaPrioridade, rotuloDaPrioridade } from '@/lib/backlog-constantes'

/** `2026-09-20` → `20/09`. Sem `new Date()`: data pura não tem fuso pra converter. */
export function diaCurto(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

export function diaLongo(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * A data que cobra o item, já com o peso visual do atraso: vermelho quando
 * passou, âmbar quando é hoje, cinza quando ainda tem folga. Ler a cor é mais
 * rápido que ler a data, e é isso que faz o quadro funcionar de longe.
 */
export function Vencimento({ data, hoje, rotulo }: { data: string; hoje: string; rotulo: string }) {
  const atrasado = data < hoje
  const eHoje = data === hoje
  const cor = atrasado ? 'text-red-600' : eHoje ? 'text-amber-700' : 'text-slate-400'
  const texto = atrasado ? `${rotulo} venceu ${diaCurto(data)}` : eHoje ? `${rotulo} hoje` : `${rotulo} ${diaCurto(data)}`
  return (
    <span className={`flex items-center gap-1 ${cor}`}>
      <CalendarClock className="w-3 h-3 shrink-0" /> {texto}
    </span>
  )
}

export function SeloPrioridade({ prioridade }: { prioridade: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${corDaPrioridade(prioridade)}`}>
      {rotuloDaPrioridade(prioridade)}
    </span>
  )
}

/**
 * O card do quadro. Mostra só o que decide "eu mexo neste agora?" — tipo,
 * nome, evento, responsável, prioridade e a data que cobra. Todo o resto vive
 * no painel que abre ao clicar; um card que conta tudo vira uma parede de
 * texto e ninguém varre o quadro com os olhos.
 */
export default function CartaoItem({
  item, hoje, onAbrir, arrastavel = false,
}: {
  item: ItemBacklog
  hoje: string
  onAbrir: () => void
  arrastavel?: boolean
}) {
  const Icone = item.tipo === 'cliente' ? Building2 : CheckSquare
  const data = item.tipo === 'tarefa' ? item.prazo : item.proximoContatoData
  const rotuloData = item.tipo === 'tarefa' ? 'Prazo' : 'Retorno'

  return (
    <article
      draggable={arrastavel}
      onDragStart={arrastavel ? e => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
      } : undefined}
      onClick={onAbrir}
      className={`bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm hover:border-brand-300 hover:shadow transition-all text-left w-full ${
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir() } }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-start gap-1.5 text-slate-800 text-sm font-semibold min-w-0">
          <Icone className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-500" />
          <span className="line-clamp-2">{item.titulo}</span>
        </p>
        <SeloPrioridade prioridade={item.prioridade} />
      </div>

      {item.tipo === 'cliente' && item.contatoNome && (
        <p className="flex items-center gap-1 text-slate-500 text-xs">
          <User className="w-3 h-3 shrink-0" /> {item.contatoNome}
        </p>
      )}
      {item.tipo === 'tarefa' && item.descricao && (
        <p className="text-slate-500 text-xs line-clamp-2">{item.descricao}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
        {(item.eventoNome || item.eventoPrevistoNome) && (
          <span className="flex items-center gap-1 text-slate-500 min-w-0">
            <CalendarDays className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[11rem]">
              {item.eventoNome ?? `${item.eventoPrevistoNome} · previsto`}
            </span>
          </span>
        )}
        {item.quantidadeEstimada != null && (
          <span className="flex items-center gap-1 text-slate-500">
            <Users className="w-3 h-3 shrink-0" /> ~{item.quantidadeEstimada.toLocaleString('pt-BR')}
          </span>
        )}
        {data && <Vencimento data={data} hoje={hoje} rotulo={rotuloData} />}
        <span className="text-slate-400 truncate">
          {item.responsavelNome ?? 'sem responsável'}
        </span>
      </div>
    </article>
  )
}
