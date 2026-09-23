'use client'
import { useState, useTransition } from 'react'
import { QrCode, X, Copy, Check, AlertTriangle } from 'lucide-react'
import { qrDataUrlVeiculo } from '@/lib/actions'

/** Ver o QR de um veículo já cadastrado — mesmo padrão de FotoVeiculo.tsx (busca ao abrir, não guarda pronto na lista). */
export default function QrVeiculoModal({ veiculoId, eventoId, placa }: { veiculoId: string; eventoId: string; placa: string }) {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<{ qrDataUrl: string; link: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [carregando, startCarregar] = useTransition()

  const abrir = () => {
    setAberto(true)
    setErro(null)
    setDados(null)
    startCarregar(async () => {
      const r = await qrDataUrlVeiculo(veiculoId, eventoId)
      if ('error' in r) { setErro(r.error); return }
      setDados(r)
    })
  }

  const copiar = () => {
    if (!dados) return
    navigator.clipboard.writeText(dados.link).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <>
      <button
        onClick={abrir}
        className="btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50"
        aria-label={`Ver QR do veículo ${placa}`}
      >
        <QrCode className="w-3.5 h-3.5" /> QR
      </button>

      {aberto && (
        <div
          className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-3 text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-slate-800 font-bold text-sm">QR do veículo</h3>
                <p className="text-slate-400 text-xs font-mono">{placa}</p>
              </div>
              <button
                onClick={() => setAberto(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {erro && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs text-left">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
              </p>
            )}

            {carregando && <div className="h-52 w-52 mx-auto rounded-xl bg-slate-100 animate-pulse" />}

            {dados && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dados.qrDataUrl} alt={`QR do veículo ${placa}`} className="mx-auto rounded-xl border border-slate-200" />
                <button onClick={copiar} className="btn btn-secundario btn-sm w-full">
                  {copiado ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? 'Link copiado' : 'Copiar link'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
