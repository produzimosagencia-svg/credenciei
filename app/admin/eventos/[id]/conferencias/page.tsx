import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, CircleDashed, UserX } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { conferenciasDoEvento } from '@/lib/conferencia'
import { PageHeader, Secao } from '@/components/ui/Superficie'
import { formatarBR } from '@/lib/tz'

export const revalidate = 0

/**
 * A lista completa de conferências do evento — setor a setor. Vive na
 * própria tela porque com muitos setores ela fica grande; a página do
 * evento mostra só o resumo (ver PainelConferencias) com um botão pra cá.
 */
export default async function ConferenciasDoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { data: evento } = await supabase.from('eventos').select('id, nome, organizacao_id').eq('id', id).maybeSingle()
  if (!evento) notFound()
  if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const linhas = (await conferenciasDoEvento(id)).filter(l => l.temSupervisor)
  const feitas = linhas.filter(l => l.status === 'confirmada').length

  return (
    <div className="space-y-5">
      <PageHeader
        voltarPara={`/admin/eventos/${id}`}
        titulo="Conferência de equipe"
        descricao={`${evento.nome} — ${feitas} de ${linhas.length} setores confirmaram`}
      />

      <Secao corpoClassName="p-0">
        {!linhas.length ? (
          <p className="p-6 text-center text-sm text-slate-400">Nenhum setor com supervisor neste evento.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {linhas.map(l => (
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
                <Link href={`/admin/conferencia/${l.fornecedorId}`} className="btn btn-secundario btn-sm shrink-0">
                  {l.status === 'confirmada' ? 'Ver' : 'Abrir'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}
