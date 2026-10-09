'use client'
import { Moon, Sun } from 'lucide-react'
import { useTema } from '@/components/Tema'

/**
 * Trocar claro/escuro na landing — o claro é o padrão (pedido do Juan, 09/10/2026). Mesma escolha guardada do
 * sistema interno (`credenciei-tema`): quem prefere o escuro lá, vê escuro aqui também.
 */
export default function TemaLanding({ className = '' }: { className?: string }) {
  const [tema, alternar] = useTema()
  const claro = tema === 'claro'
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={claro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
      title={claro ? 'Tema escuro' : 'Tema claro'}
      className={className}
    >
      {claro ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
