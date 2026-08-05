'use client'
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { mensagemAmigavel } from '@/lib/erros'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-2xl">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <div className="space-y-1">
          <h2 className="text-slate-800 font-bold text-lg">Algo deu errado</h2>
          <p className="text-slate-500 text-sm">{mensagemAmigavel(error)}</p>
        </div>
        <button
          onClick={reset}
          className="w-full btn btn-primario btn-lg"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
