'use client'
import { useState } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import DateTimePicker from '@/components/DateTimePicker'

/**
 * "O evento tem mais de uma noite?" — perguntado já na CRIAÇÃO, pedido do
 * Juan, 25/09/2026. Cada bloco manda os mesmos 4 campos via FormData —
 * `criarEvento` lê com `getAll`, na ordem em que aparecem no DOM (por isso
 * cada campo usa sempre o MESMO `name`, um por tipo, não um por dia).
 *
 * Puramente sobre "quantos blocos mostrar": os valores em si ficam no
 * próprio DOM (DateTimePicker não-controlado), sem precisar duplicar estado.
 */
export default function DiasPrincipaisExtrasNovo() {
  const [ids, setIds] = useState<string[]>([])

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3" data-tutorial="evt-novo-dias-extras">
      <div>
        <p className="text-sm font-semibold text-slate-700">O evento tem mais de uma noite principal?</p>
        <p className="text-xs text-slate-400">
          Festival de dois dias, por exemplo — cada noite com seu próprio horário de entrada e
          saída, além do dia principal configurado acima (a primeira noite).
        </p>
      </div>

      {ids.map((id, i) => (
        <div key={id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">Mais uma noite — dia {i + 2}</p>
            <button
              type="button"
              onClick={() => setIds(atual => atual.filter(x => x !== id))}
              className="text-slate-400 hover:text-red-600 transition-colors"
              aria-label="Remover este dia"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrada — início *">
              <DateTimePicker name="extra_entrada_inicio" />
            </Field>
            <Field label="Entrada — fim">
              <DateTimePicker name="extra_entrada_fim" />
            </Field>
            <Field label="Saída — início *">
              <DateTimePicker name="extra_saida_inicio" />
            </Field>
            <Field label="Saída — fim">
              <DateTimePicker name="extra_saida_fim" />
            </Field>
          </div>
          <p className="text-slate-400 text-2xs">Deixe &ldquo;fim&rdquo; em branco se não houver horário de fechamento.</p>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setIds(atual => [...atual, crypto.randomUUID()])}
        className="btn btn-secundario btn-sm"
      >
        <CalendarPlus className="w-3.5 h-3.5" /> Adicionar mais uma noite
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}
