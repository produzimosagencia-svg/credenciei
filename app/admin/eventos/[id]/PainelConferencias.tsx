import Link from 'next/link'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import { conferenciasDoEvento, conferenciaAberta, diasAteEvento } from '@/lib/conferencia'
import { Secao } from '@/components/ui/Superficie'
import { formatarBR } from '@/lib/tz'

/*
 * Resumo, não lista — a lista setor a setor (que cresce com o tamanho do
 * evento) mora em /admin/eventos/[id]/conferencias. Aqui só o essencial:
 * quantos já confirmaram, e um botão pra abrir o resto.
 */
export default async function PainelConferencias({ eventoId, dataInicio }: { eventoId: string; dataInicio: string }) {
  const dias = diasAteEvento(dataInicio)
  const linhas = await conferenciasDoEvento(eventoId)
  const comSupervisor = linhas.filter(l => l.temSupervisor)
  const jaConfirmou = comSupervisor.some(l => l.status === 'confirmada')
  if (dias > 3 && !jaConfirmou) return null
  if (!comSupervisor.length) return null
  const aberta = conferenciaAberta(dataInicio)
  const feitas = comSupervisor.filter(l => l.status === 'confirmada').length
  const tudoConfirmado = feitas === comSupervisor.length

  return (
    <Secao tom={tudoConfirmado ? 'sucesso' : 'aviso'} icone={<ClipboardCheck className="w-3.5 h-3.5" />} titulo="Conferência de equipe (1 dia antes)"
      descricao={aberta ? `${feitas} de ${comSupervisor.length} setores confirmaram a equipe` : `Abre ${formatarBR(new Date(new Date(dataInicio).getTime() - 86_400_000).toISOString(), 'completo')}`}>
      <Link href={`/admin/eventos/${eventoId}/conferencias`} className="btn btn-secundario btn-sm inline-flex items-center gap-1">
        Ver setores <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </Secao>
  )
}
