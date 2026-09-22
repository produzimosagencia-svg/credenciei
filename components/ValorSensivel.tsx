'use client'
/**
 * O olho que tampa um valor sensível (dinheiro, custo) num StatCard.
 *
 * Vive em componente próprio, separado do StatCard, de propósito: StatCard é
 * Server Component (a maioria dos cartões recebe `icon` como referência de
 * componente do lucide-react, e passar isso como prop pra um Client
 * Component quebra em produção — "Functions cannot be passed directly to
 * Client Components". Só o que precisa de estado (mostrar/ocultar) vira
 * cliente; o resto do cartão (rótulo, ícone) continua renderizado no
 * servidor, do jeito que sempre foi.
 */

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function ValorSensivel({
  value, sub, small,
}: {
  value: string | number
  sub?: string
  small?: boolean
}) {
  const [revelado, setRevelado] = useState(true)

  return (
    <>
      <p className="indicador-valor flex items-center gap-2" style={small ? { fontSize: '1.625rem' } : undefined}>
        <span>{revelado ? value : '••••••'}</span>
        <button
          type="button"
          onClick={() => setRevelado(r => !r)}
          aria-label={revelado ? 'Ocultar valor' : 'Mostrar valor'}
          className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
        >
          {revelado ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </p>
      {sub && <p className="indicador-sub">{revelado ? sub : 'valor oculto'}</p>}
    </>
  )
}
