'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, AlertCircle } from 'lucide-react'
import { responderCompartilhado } from '@/lib/actions-respostas'

/**
 * Caixa de resposta do link compartilhado. Mesma da aba Conversas, com o
 * código do link no lugar da sessão. Todas as travas (prazo, permissão,
 * número pertencente ao disparo) são conferidas de novo no servidor.
 */
export default function ResponderCompartilhado({ token, telefone }: { token: string; telefone: string }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const enviar = () => {
    const corpo = texto.trim()
    if (!corpo) return
    setErro(null)
    startTransition(async () => {
      try {
        await responderCompartilhado(token, telefone, corpo)
        setTexto('')
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar.')
      }
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
      <textarea
        value={texto}
        onChange={e => { setTexto(e.target.value); setErro(null) }}
        rows={2}
        maxLength={4000}
        placeholder="Escreva a resposta…"
        aria-label="Resposta"
        className="input resize-none"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar() }
        }}
      />
      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-400 text-2xs">Ctrl+Enter envia · {texto.length}/4000</span>
        <button onClick={enviar} disabled={pendente || !texto.trim()} className="btn btn-primario btn-sm">
          <Send className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
