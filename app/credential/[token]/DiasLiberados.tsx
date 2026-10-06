import { CalendarDays } from 'lucide-react'
import type { FaseDoDia } from '@/lib/janelas'
import { listarDias, rotuloDoDia, RECUSA_DIA_NAO_AUTORIZADO, type DiaDaEscala } from '@/lib/escala-regras'

/**
 * Os dias em que ESTE QR vale (escala por dia), logo abaixo do QR — pedido do
 * Juan, 06/10/2026: "tem que aparecer de forma bem clara quais são os dias
 * liberados". Mesmas cores por fase do formulário e de Editar evento, e o dia
 * de hoje marcado.
 *
 * Só AVISA: a recusa de verdade é no portão (`conferirEscalaNoDia`). O vermelho
 * aparece só quando hoje É um dia do evento e não foi aprovado — antes do
 * evento começar, "acesso não autorizado para hoje" só assustaria.
 *
 * Quando o supervisor ajusta os dias, isto muda sozinho na próxima vez que a
 * credencial atualizar (`ManterAtualizado`) — sem mensagem nova.
 */

const COR: Record<FaseDoDia, string> = {
  montagem: 'bg-brand-50 border-brand-300 text-brand-400',
  evento: 'bg-brand-500 border-brand-500 text-white',
  desmontagem: 'bg-amber-50 border-amber-300 text-amber-800',
}

export default function DiasLiberados({
  pendente, aprovados, diasDoEvento, hoje,
}: {
  pendente: boolean
  aprovados: string[]
  diasDoEvento: DiaDaEscala[]
  hoje: string
}) {
  if (pendente) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
          <CalendarDays className="w-4 h-4 shrink-0" /> Seus dias de trabalho
        </p>
        <p className="text-amber-900/80 text-sm mt-1 leading-relaxed">
          Aguardando a confirmação do supervisor. Seu QR Code só vai liberar a entrada nos dias que ele aprovar.
        </p>
      </div>
    )
  }

  const fase = new Map(diasDoEvento.map(d => [d.data, d.fase]))
  const hojeEhDiaDoEvento = fase.has(hoje)
  const hojeLiberado = aprovados.includes(hoje)

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
      <div>
        <p className="flex items-center gap-2 text-slate-800 text-sm font-bold">
          <CalendarDays className="w-4 h-4 shrink-0 text-brand-500" /> Dias liberados para o seu QR Code
        </p>
        <p className="text-slate-500 text-xs mt-0.5">{listarDias(aprovados)}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {aprovados.map(dia => {
          const { semanaCurta, curto } = rotuloDoDia(dia)
          const ehHoje = dia === hoje
          return (
            <div
              key={dia}
              className={`w-[68px] py-2 rounded-xl border text-center ${COR[fase.get(dia) ?? 'montagem']} ${
                ehHoje ? 'ring-2 ring-green-500 ring-offset-1' : ''
              }`}
            >
              <span className="block text-2xs uppercase tracking-wide opacity-70">{ehHoje ? 'hoje' : semanaCurta}</span>
              <span className="block text-sm font-semibold tabular-nums">{curto}</span>
            </div>
          )
        })}
      </div>

      {hojeEhDiaDoEvento && (
        hojeLiberado ? (
          <p className="text-green-700 text-xs font-semibold">Hoje é um dos seus dias de trabalho — seu QR Code está liberado.</p>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-700 text-sm font-semibold">{RECUSA_DIA_NAO_AUTORIZADO.titulo}</p>
            <p className="text-red-700/90 text-xs mt-0.5 leading-relaxed">{RECUSA_DIA_NAO_AUTORIZADO.mensagem}</p>
          </div>
        )
      )}

      <p className="text-slate-400 text-2xs">
        Você escolheu estes dias no cadastro. Para alterar, fale com o seu supervisor.
      </p>
    </div>
  )
}
