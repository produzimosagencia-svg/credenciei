'use client'
import { useState, useEffect, useRef } from 'react'
import { registrarPresencaQR } from '@/lib/actions'
import { ScanLine, LogIn, LogOut } from 'lucide-react'

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; empresa: string; cargo: string | null }
  momento?: 'entrada' | 'meio' | 'fim'
}

export default function ScannerView({
  eventos,
  initialEventoId,
}: {
  eventos: Evento[]
  initialEventoId?: string
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const [momento, setMomento] = useState<'entrada' | 'fim'>('entrada')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [show, setShow] = useState(false)
  const scanningRef = useRef(false)
  const scannerRef = useRef<any>(null)
  // Refs para o callback do scanner (que captura o estado do primeiro render)
  const eventoIdRef = useRef(eventoId)
  const momentoRef = useRef(momento)
  eventoIdRef.current = eventoId
  momentoRef.current = momento

  const processQR = async (data: string) => {
    if (scanningRef.current) return
    scanningRef.current = true

    try {
      // Validação e registro acontecem no servidor (service role)
      const res = await registrarPresencaQR(eventoIdRef.current, data, momentoRef.current)
      setResult(res)
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
    }, 2500)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const html5QrCode = new Html5Qrcode('qr-reader')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overlayColor = !result?.success
    ? 'bg-red-600'
    : result?.momento === 'entrada'
    ? 'bg-green-600'
    : 'bg-brand-500'

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <div className="w-full max-w-sm space-y-3">
        <div>
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

        {/* Momento: entrada ou saída */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMomento('entrada')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
              momento === 'entrada'
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-[#161b22] border-[#30363d] text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Entrada
          </button>
          <button
            onClick={() => setMomento('fim')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all border ${
              momento === 'fim'
                ? 'bg-brand-500 border-brand-400 text-white'
                : 'bg-[#161b22] border-[#30363d] text-slate-400 hover:text-white'
            }`}
          >
            <LogOut className="w-4 h-4" />
            Saída
          </button>
        </div>
        <p className="text-slate-500 text-xs text-center">
          A etapa do <strong>meio</strong> é registrada pelo próprio funcionário, com foto, na credencial dele.
        </p>
      </div>

      <div className="relative w-full max-w-sm">
        <div id="qr-reader" className="rounded-xl overflow-hidden" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className={`w-64 h-64 border-2 rounded-2xl opacity-60 ${momento === 'entrada' ? 'border-green-400' : 'border-brand-400'}`} />
        </div>
      </div>

      <p className="text-slate-500 text-sm flex items-center gap-2">
        <ScanLine className="w-4 h-4" />
        Aponte a câmera para o QR Code da credencial
      </p>

      {/* Overlay full-screen de resultado */}
      {result && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${overlayColor} ${show ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="text-white text-center px-8">
            <div className="text-8xl mb-6">
              {result.success ? (result.momento === 'entrada' ? '✓' : '↩') : '✕'}
            </div>
            <p className="text-3xl font-bold mb-2">{result.message}</p>
            {result.funcionario && (
              <>
                <p className="text-xl font-semibold mt-4 opacity-90">{result.funcionario.nome}</p>
                <p className="text-base opacity-70 mt-1">
                  {result.funcionario.cargo ? `${result.funcionario.cargo} • ` : ''}{result.funcionario.empresa}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
