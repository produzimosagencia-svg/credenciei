'use client'
import { useEffect, useState, useTransition } from 'react'
import { LogOut, LogIn } from 'lucide-react'
import { ativarAutoatendimentoPortao, desativarAutoatendimentoPortao, statusAutoatendimentoPortao } from '@/lib/actions'

const INTERVALO_MS = 20_000

/**
 * "Estou indo embora" / "Cheguei" — pedido do Juan, 08/10/2026: quando a equipe do credenciamento vai embora e
 * ainda sobra gente dentro do evento, ninguém tinha como bater a saída. O operador aperta este botão ao sair, e
 * dali até o horário configurado em Editar evento, o colaborador registra a própria entrada/saída pelo celular
 * (`registrarPresencaLivre`, com geolocalização obrigatória). "Cheguei" desliga na hora, mesmo antes do fim.
 *
 * Some sozinho (não renderiza nada) quando o evento não tem essa função ligada — não há por que mostrar o botão
 * pra quem nunca vai usar. Busca o status a cada 20s pra refletir outro operador tendo apertado o mesmo botão.
 */
export default function AutoatendimentoBotao({ eventoId }: { eventoId: string }) {
  const [status, setStatus] = useState<{
    habilitado: boolean; liberadoAgora: boolean; janelaTexto: string | null; ativadoPorNome: string | null
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelado = false
    const buscar = () => {
      statusAutoatendimentoPortao(eventoId).then(s => { if (!cancelado) setStatus(s) })
    }
    buscar()
    const id = setInterval(buscar, INTERVALO_MS)
    return () => { cancelado = true; clearInterval(id) }
  }, [eventoId])

  if (!status?.habilitado) return null

  const agir = (acao: typeof ativarAutoatendimentoPortao) => {
    setErro(null)
    startTransition(async () => {
      const r = await acao(eventoId)
      if ('erro' in r) { setErro(r.erro); return }
      const s = await statusAutoatendimentoPortao(eventoId)
      setStatus(s)
    })
  }

  return (
    <div className="px-4 pt-3">
      {status.liberadoAgora ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 space-y-2">
          <p className="text-xs text-amber-200 leading-snug">
            <b>Autoatendimento ativo</b> — colaboradores podem bater o próprio ponto pelo celular
            {status.janelaTexto ? ` até ${status.janelaTexto}` : ''}.
            {status.ativadoPorNome ? ` Ativado por ${status.ativadoPorNome}.` : ''}
          </p>
          <button
            type="button" disabled={isPending} onClick={() => agir(desativarAutoatendimentoPortao)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 text-amber-950 text-xs font-bold py-2 disabled:opacity-60"
          >
            <LogIn className="w-3.5 h-3.5" /> Cheguei — desligar autoatendimento
          </button>
        </div>
      ) : (
        <button
          type="button" disabled={isPending} onClick={() => agir(ativarAutoatendimentoPortao)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/20 text-white/70 text-xs font-semibold py-2 hover:bg-white/10 transition-colors disabled:opacity-60"
        >
          <LogOut className="w-3.5 h-3.5" /> Estou indo embora — ativar autoatendimento
        </button>
      )}
      {erro && <p className="text-red-400 text-2xs mt-1">{erro}</p>}
    </div>
  )
}
