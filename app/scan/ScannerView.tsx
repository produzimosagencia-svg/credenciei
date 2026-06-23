'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ScanLine } from 'lucide-react'

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; empresa: string; cargo: string }
  tipo?: 'entrada' | 'saida'
}

export default function ScannerView({
  eventos,
  initialEventoId,
}: {
  eventos: Evento[]
  initialEventoId?: string
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [show, setShow] = useState(false)
  const scanningRef = useRef(false)
  const scannerRef = useRef<any>(null)

  const processQR = async (data: string) => {
    if (scanningRef.current) return
    scanningRef.current = true

    try {
      // Formato: "token|tipo"
      const parts = data.split('|')
      if (parts.length !== 2) throw new Error('QR inválido')
      const [token, tipoQR] = parts
      if (!token || (tipoQR !== 'entrada' && tipoQR !== 'saida')) throw new Error('QR inválido')

      const { data: func } = await supabase
        .from('funcionarios')
        .select('*, fornecedores(evento_id)')
        .eq('qr_token', token)
        .single()

      if (!func) {
        setResult({ success: false, message: 'Funcionário não encontrado' })
        setShow(true)
        return
      }

      const fornecedor = func.fornecedores as any
      if (fornecedor?.evento_id !== eventoId) {
        setResult({ success: false, message: 'Credencial não pertence a este evento' })
        setShow(true)
        return
      }

      const tipo = tipoQR as 'entrada' | 'saida'

      await supabase.from('registros').insert([{
        funcionario_id: func.id,
        evento_id: eventoId,
        tipo,
      }])

      fetch('/api/sheets/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funcionarioId: func.id, eventoId, tipo }),
      }).catch(() => {})

      setResult({
        success: true,
        message: tipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!',
        funcionario: { nome: func.nome, empresa: func.empresa, cargo: func.cargo },
        tipo,
      })
      setShow(true)
    } catch {
      setResult({ success: false, message: 'Erro ao processar QR Code' })
      setShow(true)
    }

    setTimeout(() => {
      setShow(false)
      setTimeout(() => {
        setResult(null)
        scanningRef.current = false
      }, 400)
    }, 3000)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    let html5QrCode: any

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      html5QrCode = new Html5Qrcode('qr-reader')
      scannerRef.current = html5QrCode
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 280 } },
        (decodedText: string) => processQR(decodedText),
        () => {}
      ).catch(console.error)
    })

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [eventoId])

  const isEntrada = result?.tipo === 'entrada'
  const overlayColor = !result?.success
    ? 'bg-red-600'
    : isEntrada
    ? 'bg-green-600'
    : 'bg-orange-500'

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-6">
      <div className="w-full max-w-sm">
        <label className="text-slate-400 text-sm block mb-1.5">Evento</label>
        <select
          value={eventoId}
          onChange={e => setEventoId(e.target.value)}
          className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
        >
          {eventos.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </div>

      <div className="relative w-full max-w-sm">
        <div id="qr-reader" className="rounded-xl overflow-hidden" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-blue-400 rounded-2xl opacity-60" />
        </div>
      </div>

      <p className="text-slate-500 text-sm flex items-center gap-2">
        <ScanLine className="w-4 h-4" />
        Aponte a câmera para o QR Code
      </p>

      {/* Overlay full-screen de resultado */}
      {result && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${overlayColor} ${show ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="text-white text-center px-8">
            <div className="text-8xl mb-6">
              {result.success ? (isEntrada ? '✓' : '↩') : '✕'}
            </div>
            <p className="text-3xl font-bold mb-2">{result.message}</p>
            {result.funcionario && (
              <>
                <p className="text-xl font-semibold mt-4 opacity-90">{result.funcionario.nome}</p>
                <p className="text-base opacity-70 mt-1">{result.funcionario.cargo} • {result.funcionario.empresa}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
