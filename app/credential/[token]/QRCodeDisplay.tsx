'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

function QRCanvas({ token, tipo }: { token: string; tipo: 'entrada' | 'saida' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const url = `${window.location.origin}/scan/verify?token=${token}&tipo=${tipo}`
    QRCode.toCanvas(canvasRef.current, url, {
      width: 200,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [token, tipo])

  return <canvas ref={canvasRef} />
}

export default function QRCodeDisplay({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <div className="bg-white rounded-xl p-3 border-4 border-green-500">
          <QRCanvas token={token} tipo="entrada" />
        </div>
        <span className="bg-green-600 text-white text-sm font-bold px-4 py-1.5 rounded-full">
          ✓ QR Code Entrada
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="bg-white rounded-xl p-3 border-4 border-red-500">
          <QRCanvas token={token} tipo="saida" />
        </div>
        <span className="bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-full">
          ✕ QR Code Saída
        </span>
      </div>
    </div>
  )
}
