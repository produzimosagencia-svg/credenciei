import Link from 'next/link'
import { ClipboardCheck, CircleDashed, CheckCircle2, UserX } from 'lucide-react'
import { conferenciasDoEvento, conferenciaAberta, diasAteEvento } from '@/lib/conferencia'
import { Secao } from '@/components/ui/Superficie'
import { formatarBR } from '@/lib/tz'

/**
 * Painel do organizador: setor a setor, quem já conferiu a equipe (D-1) e
 * quem ainda não. É por aqui que ele cobra os supervisores que faltam.
 *
 * Só aparece a partir de 3 dias antes do evento (ou se já houver alguma
 * conferência feita) — antes disso é ruído numa tela que já é grande.
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

  return (
    <Secao
      tom={feitas === comSupervisor.length ? 'sucesso' : 'aviso'}
      icone={<ClipboardCheck className="w-3.5 h-3.5" />}
      titulo="Conferência de equipe (1 dia antes)"
      descricao={
        aberta
          ? `${feitas} de ${comSupervisor.length} setores confirmaram a equipe`
          : `Abre ${formatarBR(new Date(new Date(dataInicio).getTime() - 86_400_000).toISOString(), 'completo')}`
      }
      corpoClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {comSupervisor.map(l => (
          <li key={l.fornecedorId} className="flex items-center gap-3 px-4 py-3">
            {l.status === 'confirmada'
              ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              : <CircleDashed className="w-4 h-4 text-amber-500 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-slate-800 text-sm font-medium truncate">{l.setorNome}</p>
              <p className="text-slate-400 text-xs truncate">
                {l.supervisorNome ?? 'sem supervisor'}
                {l.status === 'confirmada' && l.confirmadaEm && (
                  <> · confirmou {formatarBR(l.confirmadaEm, 'curto')}
                    {l.totalRemovidos != null && l.totalRemovidos > 0 && (
                      <span className="text-red-500"> · <UserX className="w-3 h-3 inline -mt-0.5" /> {l.totalRemovidos} removido{l.totalRemovidos === 1 ? '' : 's'}</span>
                    )}
                  </>
                )}
              </p>
            </div>
            <Link
              href={`/admin/conferencia/${l.fornecedorId}`}
              className="btn btn-secundario btn-sm shrink-0"
            >
              {l.status === 'confirmada' ? 'Ver' : 'Abrir'}
            </Link>
          </li>
        ))}
      </ul>
    </Secao>
  )
}
