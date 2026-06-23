'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

function QRCanvas({ token, tipo }: { token: string; tipo: 'entrada' | 'saida' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const url = `${window.location.origin}/scan/verify?token=${token}&tipo=${tipo}`
    QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [token, tipo])

  return <canvas ref={canvasRef} />
}

export default function QRCodeDisplay({ token }: { token: string }) {
  const [ativo, setAtivo] = useState<'entrada' | 'saida' | null>(null)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3 w-full">
        <button
          onClick={() => setAtivo(ativo === 'entrada' ? null : 'entrada')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
            ativo === 'entrada'
              ? 'bg-green-600 text-white'
              : 'bg-green-600/20 text-green-400 border border-green-600/50'
          }`}
        >
          ✓ Entrada
        </button>
        <button
          onClick={() => setAtivo(ativo === 'saida' ? null : 'saida')}
          className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
            ativo === 'saida'
              ? 'bg-red-600 text-white'
              : 'bg-red-600/20 text-red-400 border border-red-600/50'
          }`}
        >
          ✕ Saída
        </button>
      </div>

      {ativo && (
        <div className={`flex flex-col items-center gap-2`}>
          <div className={`bg-white rounded-xl p-3 border-4 ${ativo === 'entrada' ? 'border-green-500' : 'border-red-500'}`}>
            <QRCanvas token={token} tipo={ativo} />
          </div>
          <p className={`text-xs font-medium ${ativo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
            {ativo === 'entrada' ? 'Mostre este QR na entrada' : 'Mostre este QR na saída'}
          </p>
        </div>
      )}
    </div>
  )
}
