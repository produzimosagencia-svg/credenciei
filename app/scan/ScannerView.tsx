'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, XCircle, ScanLine } from 'lucide-react'

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
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const processQR = async (data: string) => {
    if (scanning) return
    setScanning(true)

    try {
      const url = new URL(data)
      const token = url.searchParams.get('token')
      const tipoQR = url.searchParams.get('tipo') as 'entrada' | 'saida' | null
      if (!token || !tipoQR) throw new Error('QR inválido')

      const { data: func } = await supabase
        .from('funcionarios')
        .select('*, fornecedores(evento_id)')
        .eq('qr_token', token)
        .single()

      if (!func) {
        setResult({ success: false, message: 'Funcionário não encontrado' })
        return
      }

      const fornecedor = func.fornecedores as any
      if (fornecedor?.evento_id !== eventoId) {
        setResult({ success: false, message: 'Credencial não pertence a este evento' })
        return
      }

      const tipo: 'entrada' | 'saida' = tipoQR

      await supabase.from('registros').insert([{
        funcionario_id: func.id,
        evento_id: eventoId,
        tipo,
      }])

      // Sincroniza com Google Sheets em background
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
    } catch (err) {
      setResult({ success: false, message: 'Erro ao processar QR Code' })
    }

    setTimeout(() => {
      setResult(null)
      setScanning(false)
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
        { fps: 10, qrbox: { width: 250, height: 250 } },
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
        {!result && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-56 h-56 border-2 border-blue-400 rounded-xl opacity-60" />
          </div>
        )}
      </div>

      {result && (
        <div className={`w-full max-w-sm rounded-xl p-5 border ${
          result.success
            ? result.tipo === 'entrada'
              ? 'bg-green-900/30 border-green-500/50'
              : 'bg-yellow-900/30 border-yellow-500/50'
            : 'bg-red-900/30 border-red-500/50'
        }`}>
          <div className="flex items-center gap-3">
            {result.success
              ? <CheckCircle className={`w-6 h-6 ${result.tipo === 'entrada' ? 'text-green-400' : 'text-yellow-400'}`} />
              : <XCircle className="w-6 h-6 text-red-400" />
            }
            <div>
              <p className={`font-semibold ${result.success ? (result.tipo === 'entrada' ? 'text-green-300' : 'text-yellow-300') : 'text-red-300'}`}>
                {result.message}
              </p>
              {result.funcionario && (
                <div className="mt-1">
                  <p className="text-white text-sm font-medium">{result.funcionario.nome}</p>
                  <p className="text-slate-400 text-xs">{result.funcionario.cargo} • {result.funcionario.empresa}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!result && (
        <p className="text-slate-500 text-sm flex items-center gap-2">
          <ScanLine className="w-4 h-4" />
          Aponte a câmera para o QR Code
        </p>
      )}
    </div>
  )
}
