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
 *
 * Começa OCULTO sempre — recarregar a página, sair e voltar, navegar pra
 * outro campo e voltar: tudo isso remonta o componente e o estado local
 * volta a `false`, de propósito (pedido do Juan, 22/09/2026). Não guarda em
 * `localStorage`/cookie nem nada que sobreviva ao remount — a única forma
 * de ver o valor é clicar no olho, toda vez.
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
  const [revelado, setRevelado] = useState(false)

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
