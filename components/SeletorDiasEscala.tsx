'use client'
import { Check } from 'lucide-react'
import type { FaseDoDia } from '@/lib/janelas'
import { rotuloDoDia, type DiaDaEscala } from '@/lib/escala-regras'

/*
 * Montagem marcada usa `text-brand-400`, não o `brand-700` da grade de
 * Editar evento: no tema escuro (o formulário é sempre escuro) o 700 some no
 * fundo; o 400 é laranja claro no escuro e vermelho forte no tema claro.
 */

/**
 * Escolha dos dias de trabalho de UMA pessoa (escala por dia).
 *
 * Mesmo visual da grade de dias do evento em Editar evento
 * (app/admin/eventos/[id]/editar/DiasDeTrabalho.tsx) — o chip de 68px com
 * dia da semana, data e o ✓, e a mesma cor por fase: montagem laranja claro,
 * dia do evento laranja cheio, desmontagem âmbar. Quem configurou os dias lá
 * reconhece a mesma grade aqui, e a legenda (`LegendaFases`) é a mesma.
 *
 * Usado nos dois lados do fluxo:
 *   * formulário público — a pessoa marca os dias em que vai trabalhar;
 *   * supervisor — marca os dias que APROVA; `pedidos` põe um ponto nos dias
 *     que a pessoa escolheu, para a diferença nunca sumir da tela.
 */

const COR_MARCADO: Record<FaseDoDia, string> = {
  montagem: 'bg-brand-50 border-brand-300 text-brand-400',
  evento: 'bg-brand-500 border-brand-500 text-white',
  desmontagem: 'bg-amber-50 border-amber-300 text-amber-800',
}

export default function SeletorDiasEscala({
  dias, marcados, onAlternar, pedidos, lotados, desabilitado = false,
}: {
  dias: DiaDaEscala[]
  marcados: string[]
  onAlternar: (dia: string) => void
  /** Só na tela do supervisor: os dias que a PESSOA pediu. */
  pedidos?: string[]
  /**
   * Dias que bateram a trava do fornecedor (importação de estrutura). Não dá
   * pra MARCAR um dia lotado — desmarcar sempre dá.
   */
  lotados?: string[]
  desabilitado?: boolean
}) {
  const marcadosSet = new Set(marcados)
  const lotadosSet = new Set(lotados ?? [])
  const pedidosSet = pedidos ? new Set(pedidos) : null

  return (
    <div className="flex flex-wrap gap-1.5">
      {dias.map(({ data, fase }) => {
        const { semanaCurta, curto } = rotuloDoDia(data)
        const marcado = marcadosSet.has(data)
        const pediu = pedidosSet?.has(data) ?? false
        const lotado = lotadosSet.has(data) && !marcado
        return (
          <button
            key={data}
            type="button"
            onClick={() => onAlternar(data)}
            disabled={desabilitado || lotado}
            aria-pressed={marcado}
            title={lotado ? 'Dia lotado neste setor' : pedidosSet ? (pediu ? 'Pedido pelo funcionário' : 'Não pedido pelo funcionário') : undefined}
            className={`relative w-[68px] py-2 rounded-xl border text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              marcado ? COR_MARCADO[fase] : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'
            }`}
          >
            {pediu && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden />
            )}
            <span className="block text-2xs uppercase tracking-wide opacity-70">{semanaCurta}</span>
            <span className="block text-sm font-semibold tabular-nums">{curto}</span>
            <span className="block h-3.5 mt-0.5">
              {marcado ? <Check className="w-3.5 h-3.5 mx-auto" />
                : lotado ? <span className="block text-2xs font-semibold uppercase leading-3.5">lotado</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A legenda das cores — mesma caixa e mesmas amostras da grade de Editar evento. */
export function LegendaFases({ comPedido = false }: { comPedido?: boolean }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
      <p className="text-slate-600 text-xs">
        <span className="inline-block w-2.5 h-2.5 rounded bg-brand-50 border border-brand-300 align-middle mr-1.5" />
        <strong>Montagem</strong> — antes do evento
      </p>
      <p className="text-slate-600 text-xs">
        <span className="inline-block w-2.5 h-2.5 rounded bg-brand-500 align-middle mr-1.5" />
        <strong>Dia do evento</strong>
      </p>
      <p className="text-slate-600 text-xs">
        <span className="inline-block w-2.5 h-2.5 rounded bg-amber-50 border border-amber-300 align-middle mr-1.5" />
        <strong>Desmontagem</strong> — depois do evento
      </p>
      {comPedido && (
        <p className="text-slate-500 text-2xs pt-1 border-t border-slate-200 mt-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-500 align-middle mr-1.5" />
          Dia pedido pelo funcionário no cadastro
        </p>
      )}
    </div>
  )
}
