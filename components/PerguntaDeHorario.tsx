'use client'
import { AlertTriangle } from 'lucide-react'
import type { PerguntaDeHorario as Pergunta } from '@/lib/turno-longo'

/**
 * A pergunta que o servidor faz antes de salvar uma saída com horário estranho (lib/turno-longo.ts): "é a madrugada do dia
 * seguinte?" ou "esse turno de 23h está certo?". Usada no "Corrigir no histórico" e no "Lançar ponto" (Juan, 23/10/2026).
 */
export default function PerguntaDeHorario({
  pergunta, ocupado, aoConfirmar, aoCorrigir,
}: { pergunta: Pergunta; ocupado: boolean; aoConfirmar: () => void; aoCorrigir: () => void }) {
  const diaSeguinte = pergunta.tipo === 'dia_seguinte'
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2.5" role="alertdialog" aria-label="Confira o horário">
      <p className="flex items-start gap-2 text-amber-900 text-sm font-semibold leading-snug">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        {pergunta.texto}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={aoConfirmar} disabled={ocupado} className="btn btn-primario btn-sm disabled:opacity-60">
          {ocupado ? 'Salvando…' : diaSeguinte ? 'Sim, é do dia seguinte' : 'Sim, está certo'}
        </button>
        <button type="button" onClick={aoCorrigir} disabled={ocupado} className="btn btn-secundario btn-sm">
          Não, vou corrigir a hora
        </button>
      </div>
    </div>
  )
}
