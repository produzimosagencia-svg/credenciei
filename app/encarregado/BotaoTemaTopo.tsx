'use client'
import { Moon, Sun } from 'lucide-react'
import { useTema } from '@/components/Tema'

/** Alterna claro/escuro no topo da área do Encarregado — a escolha fica salva no navegador, como no resto do sistema. */
export default function BotaoTemaTopo() {
  const [tema, alternar] = useTema()
  const claro = tema === 'claro'
  return (
    <button
      type="button" onClick={alternar} aria-pressed={claro}
      aria-label={claro ? 'Usar tema escuro' : 'Usar tema claro'} title={claro ? 'Tema escuro' : 'Tema claro'}
      className="btn-press w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors"
    >
      {claro ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  )
}
