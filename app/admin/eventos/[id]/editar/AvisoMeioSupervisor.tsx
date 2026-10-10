'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing, Check } from 'lucide-react'
import { salvarAvisoMeioSupervisor } from '@/lib/actions'

/**
 * "Configurar horário que o supervisor recebe o aviso do meio" (pedido do Juan, 10/10/2026 — VITAL: 21:00 e 00:00).
 * Em cada dia principal, em cada horário, o supervisor recebe quantos da equipe dele já deveriam ter batido o meio
 * e não bateram. Seção própria, com o próprio botão de salvar — mesmo padrão de `ConfiguracaoDoMeio`.
 */
export default function AvisoMeioSupervisor({
  eventoId, primeira, segunda,
}: {
  eventoId: string
  /** "21:00" ou null (padrão). */
  primeira: string | null
  segunda: string | null
}) {
  const [h1, setH1] = useState(primeira ?? '')
  const [h2, setH2] = useState(segunda ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const salvar = () => {
    setErro(null); setSalvo(false)
    iniciar(async () => {
      const r = await salvarAvisoMeioSupervisor(eventoId, h1 || null, h2 || null)
      if ('erro' in r) { setErro(r.erro); return }
      setSalvo(true)
      router.refresh()
    })
  }

  return (
    <div className="p-6 sm:p-8 space-y-4 border-t border-slate-100">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
          <BellRing className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-slate-800 font-bold">Aviso do meio para o supervisor</h3>
          <p className="text-slate-500 text-sm">Configurar horário que o supervisor recebe o aviso do meio.</p>
        </div>
      </div>

      <p className="text-slate-600 text-sm">
        Em cada dia do evento, nesse horário, o supervisor recebe no WhatsApp quantas pessoas da equipe dele já
        deveriam ter batido o meio e não bateram, com o link da lista. Se ninguém estiver pendente, não sai mensagem.
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <label className="space-y-1">
          <span className="text-slate-500 text-xs font-medium">1º aviso</span>
          <input type="time" value={h1} onChange={e => { setH1(e.target.value); setSalvo(false) }} className="input tabular-nums" />
        </label>
        <label className="space-y-1">
          <span className="text-slate-500 text-xs font-medium">2º aviso (opcional)</span>
          <input type="time" value={h2} onChange={e => { setH2(e.target.value); setSalvo(false) }} className="input tabular-nums" disabled={!h1} />
        </label>
      </div>
      <p className="text-slate-400 text-xs">
        Horário depois da meia-noite (ex.: 00:00) vale para a madrugada seguinte. Em branco: um aviso só, 6 horas depois
        do fim da janela de entrada.
      </p>

      {erro && <p className="text-red-500 text-xs">{erro}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={salvar} disabled={pendente} className="btn btn-primario btn-sm">
          {pendente ? 'Salvando…' : 'Salvar horários'}
        </button>
        {salvo && <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><Check className="w-3.5 h-3.5" /> Salvo — avisos reagendados</span>}
      </div>
    </div>
  )
}
