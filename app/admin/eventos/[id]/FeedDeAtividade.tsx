import { EmptyState } from '@/components/ui/Superficie'
import { COR_ETAPA } from '@/components/charts'
import { formatarBR } from '@/lib/tz'

/**
 * As últimas leituras de QR e check-ins por foto.
 *
 * Saiu da tela do evento e passou a viver nas PENDÊNCIAS. O motivo é de uso,
 * não de espaço: quem abre a tela do evento está organizando (criando setores,
 * mandando links, conferindo valores), e quem abre as pendências está
 * acompanhando a operação acontecer. O feed responde à segunda pergunta, não à
 * primeira — e ali ele fica ao lado de quem ainda falta bater, que é o
 * contexto que dá sentido a ele.
 *
 * De quebra, a lista de setores ganhou a largura inteira, que era o que
 * faltava para os cartões caberem lado a lado em vez de empilhados.
 */

type Registro = {
  funcionario_id: string
  tipo: string
  created_at: string
  funcionarios: unknown
}

export default function FeedDeAtividade({ registros }: { registros: Registro[] | null }) {
  if (!registros?.length) {
    return <EmptyState titulo="Nenhuma presença registrada" />
  }

  return (
    <div className="space-y-3">
      {registros.map(r => {
        const func = r.funcionarios as { nome?: string; empresa?: string; fornecedores?: { nome?: string } } | null
        const forn = func?.fornecedores
        const etapa = r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Saída'
        const cor = r.tipo === 'entrada' ? COR_ETAPA.entrada : r.tipo === 'meio' ? COR_ETAPA.meio : COR_ETAPA.fim

        return (
          <div key={`${r.created_at}-${r.funcionario_id}`} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: cor }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-slate-800 text-xs font-medium truncate">{func?.nome}</p>
              <p className="text-slate-500 text-2xs truncate">
                {forn?.nome}{func?.empresa ? ` · ${func.empresa}` : ''}
              </p>
              <p className="text-slate-400 text-2xs mt-0.5 tabular-nums">
                {etapa} · {formatarBR(r.created_at, 'curto')}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
