import { ThumbsUp, ThumbsDown, MessageSquare, ShieldBan, ShieldCheck } from 'lucide-react'
import { formatarBR } from '@/lib/tz'
import { ROTULO_TIPO, type Depoimento, type ResumoAvaliacoes, type TipoDepoimento } from '@/lib/depoimentos'
import { Estrelas } from '@/components/EstrelasNota'
import { Badge } from '@/components/ui/Superficie'

/**
 * O histórico de comportamento da pessoa: a média das estrelas e os
 * depoimentos, do mais novo ao mais antigo. Só desenha — quem busca é a aba do
 * colaborador (`DepoimentoColaborador`) e a ficha da Base de funcionários.
 */

const ICONE: Record<TipoDepoimento, React.ReactNode> = {
  positivo: <ThumbsUp className="w-3.5 h-3.5" />,
  neutro: <MessageSquare className="w-3.5 h-3.5" />,
  atencao: <ThumbsDown className="w-3.5 h-3.5" />,
  bloqueio: <ShieldBan className="w-3.5 h-3.5" />,
  desbloqueio: <ShieldCheck className="w-3.5 h-3.5" />,
}
const TOM: Record<TipoDepoimento, 'positivo' | 'neutro' | 'atencao' | 'negativo'> = {
  positivo: 'positivo', neutro: 'neutro', atencao: 'atencao', bloqueio: 'negativo', desbloqueio: 'positivo',
}

export function ResumoDeNotas({ resumo, mostrarOrganizacao = false }: { resumo: ResumoAvaliacoes; mostrarOrganizacao?: boolean }) {
  if (!resumo.total) {
    return <p className="text-slate-400 text-xs">Ainda sem notas de evento.</p>
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl font-extrabold tabular-nums text-slate-800">{resumo.media?.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</span>
        <Estrelas nota={resumo.media} tamanho="w-5 h-5" />
        <span className="text-slate-400 text-xs">{resumo.total} evento{resumo.total === 1 ? '' : 's'} avaliado{resumo.total === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {resumo.porEvento.map((a, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-slate-700 text-xs font-medium truncate">{a.eventoNome ?? 'Evento'}{a.setorNome ? ` · ${a.setorNome}` : ''}</p>
              <p className="text-slate-400 text-2xs truncate">
                por {a.avaliadorNome}{mostrarOrganizacao && a.organizacaoNome ? ` · ${a.organizacaoNome}` : ''} · {formatarBR(a.atualizadoEm, 'curto')}
              </p>
            </div>
            <Estrelas nota={a.nota} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ListaDepoimentos({ depoimentos, mostrarOrganizacao = false }: { depoimentos: Depoimento[]; mostrarOrganizacao?: boolean }) {
  if (!depoimentos.length) {
    return <p className="text-slate-400 text-xs">Nenhum depoimento ainda.</p>
  }
  return (
    <ul className="space-y-2.5">
      {depoimentos.map(d => (
        <li key={d.id} className="border border-slate-200 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Badge tom={TOM[d.tipo]}><span className="inline-flex items-center gap-1">{ICONE[d.tipo]} {ROTULO_TIPO[d.tipo]}</span></Badge>
            <span className="text-slate-400 text-2xs tabular-nums shrink-0">{formatarBR(d.criadoEm, 'curto')}</span>
          </div>
          <p className="text-slate-700 text-sm whitespace-pre-line break-words">{d.texto}</p>
          <p className="text-slate-400 text-2xs">
            {d.autorNome}
            {d.eventoNome ? ` · ${d.eventoNome}` : ''}{d.setorNome ? ` · ${d.setorNome}` : ''}
            {mostrarOrganizacao && d.organizacaoNome ? ` · ${d.organizacaoNome}` : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}
