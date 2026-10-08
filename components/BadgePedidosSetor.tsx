'use client'
import { useEffect, useState } from 'react'
import { contarPedidosPendentes } from '@/lib/actions-pedidos-setor'

/**
 * O numerozinho do item "Pedidos de setor" no menu — mesmo padrão de poll (60s) do
 * `BadgeAprovacoesPendentes`: não é tempo real, e não precisa ser.
 */
export default function BadgePedidosSetor() {
  const [pendentes, setPendentes] = useState(0)

  useEffect(() => {
    const buscar = () => { contarPedidosPendentes().then(setPendentes).catch(() => {}) }
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
