'use client'
import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function QRCodeDisplay({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const url = `${window.location.origin}/scan/verify?token=${token}`
    QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [token])

  return (
    <div className="flex justify-center">
      <div className="bg-white rounded-xl p-3">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
