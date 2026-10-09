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
 * A descrição do que o botão faz fica sempre visível, embaixo dele (pedido do Juan, 08/10/2026: "logo em baixo
 * precisa ter a descrição pra que serve") — ninguém aperta o que não entende, e o operador só vê este botão de
 * vez em quando (não é uso diário, só no fim do turno).
 *
 * Some sozinho (não renderiza nada) quando o evento não tem essa função ligada — não há por que mostrar o botão
 * pra quem nunca vai usar. Busca o status a cada 20s pra refletir outro operador tendo apertado o mesmo botão.
 *
 * `tema`: o /scan (tela cheia escura) e o "Bem-vindo" do operador (card branco) pedem cores opostas — mesmo
 * componente, duas paletas.
 */
export default function AutoatendimentoBotao({ eventoId, tema = 'escuro' }: { eventoId: string; tema?: 'claro' | 'escuro' }) {
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

  const claro = tema === 'claro'
  const corTextoDescricao = claro ? 'text-slate-500' : 'text-white/50'
  const corErro = claro ? 'text-red-600' : 'text-red-400'

  return (
    <div className={claro ? 'space-y-2' : 'px-4 pt-3 space-y-2'}>
      {status.liberadoAgora ? (
        <div className={`rounded-xl border px-3 py-2.5 space-y-2 ${claro ? 'border-amber-200 bg-amber-50' : 'border-amber-400/40 bg-amber-400/10'}`}>
          <p className={`text-xs leading-snug ${claro ? 'text-amber-800' : 'text-amber-200'}`}>
            <b>Autoatendimento ativo</b> — colaboradores podem bater o próprio ponto pelo celular
            {status.janelaTexto ? ` (das ${status.janelaTexto})` : ''}.
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
          className={`w-full flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold py-2 transition-colors disabled:opacity-60 ${
            claro ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-white/70 hover:bg-white/10'
          }`}
        >
          <LogOut className="w-3.5 h-3.5" /> Estou indo embora — ativar autoatendimento
        </button>
      )}
      {/* A explicação fica sempre visível, mesmo antes de apertar — pedido do Juan: ninguém aperta o que não entende. */}
      <p className={`text-2xs leading-snug ${corTextoDescricao}`}>
        Ative só quando for embora e ainda sobrar gente no evento: dali até o horário configurado em Editar
        evento, o colaborador consegue bater a própria entrada e saída pelo celular, com localização obrigatória.
        Aperte &quot;Cheguei&quot; se voltar antes da hora, ou volta sozinho a exigir o operador quando o horário acabar.
      </p>
      {erro && <p className={`text-2xs mt-1 ${corErro}`}>{erro}</p>}
    </div>
  )
}
