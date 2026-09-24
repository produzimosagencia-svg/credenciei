'use client'
import { useEffect, useState } from 'react'
import { contarPendentesDeAprovacao } from '@/lib/actions'

/**
 * O numerozinho do item "Aguardando aprovação" no menu — pedido do Juan,
 * 24/09/2026. Mesmo padrão de poll do `SinoAlertas` (60s): não é tempo
 * real, e não precisa ser — ninguém decide um credenciamento no segundo
 * exato em que ele chega.
 */
export default function BadgeAprovacoesPendentes() {
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    const buscar = () => { contarPendentesDeAprovacao().then(setPendentes).catch(() => {}) }
    buscar()
    const id = setInterval(buscar, 60_000)
    return () => clearInterval(id)
  }, [])

  if (!pendentes) return null
  return (
    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
      {pendentes > 99 ? '99+' : pendentes}
    </span>
  )
}
