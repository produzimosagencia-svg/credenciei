'use client'
import { useState, useTransition } from 'react'
import { Wrench, Check, AlertCircle } from 'lucide-react'
import { liberarDescredenciamentosIndevidos } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * Botão de limpeza única (28/09/2026) — ver `liberarDescredenciamentosIndevidos`
 * em lib/actions.ts pro critério exato. Fica aqui (página só-master) porque é
 * uma correção de dado que atravessa organizações, não uma ferramenta do
 * dia a dia — não precisa de tela própria.
 */
export default function LimparDescredenciamentosButton() {
  const [pendente, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ total: number; nomes: string[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const rodar = () => {
    setErro(null)
    setResultado(null)
    startTransition(async () => {
      try {
        const r = await liberarDescredenciamentosIndevidos()
        setResultado(r)
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <p className="text-slate-500 text-xs leading-relaxed">
        Libera quem ficou descredenciado pelo gatilho automático removido em
        28/09/2026 (saída no último dia de trabalho descredenciava sozinha) —
        sem tocar em quem foi removido da equipe de propósito pelo
        organizador. Segura de rodar mais de uma vez: quem já está liberado
        não aparece de novo.
      </p>
      <button
        type="button"
        onClick={rodar}
        disabled={pendente}
        className="btn btn-secundario btn-sm"
      >
        <Wrench className="w-3.5 h-3.5" />
        {pendente ? 'Verificando…' : 'Liberar descredenciamentos indevidos'}
      </button>
      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {resultado && (
        <p className="flex items-start gap-1.5 text-green-700 text-xs">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" />
          {resultado.total === 0
            ? 'Ninguém precisava ser liberado.'
            : `${resultado.total} pessoa(s) liberada(s): ${resultado.nomes.join(', ')}.`}
        </p>
      )}
    </div>
  )
}
