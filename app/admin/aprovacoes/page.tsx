import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardCheck, Ban } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { eventosComPendentesDeAprovacao, historicoDeNegados } from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState, Badge } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Ponte entre o menu (da PLATAFORMA inteira) e a tela de decisão (de UM
 * evento, `/admin/eventos/[id]/aprovacoes`) — pedido do Juan, 24/09/2026:
 * item "Aguardando aprovação" no menu, com o número de pendentes do lado.
 *
 * Só um evento com pendente → cai direto nele, sem escala a mais. Mais de
 * um → escolhe, cada card já com a contagem (mesmo padrão de EscolherEvento).
 *
 * Aba "Negados" (pedido do Juan, 25/09/2026): o histórico de quem foi negado
 * em todos os eventos que a pessoa enxerga, com quem negou, quando e por quê.
 * Aba por `?aba=`, no servidor — sem estado no cliente, e o link é
 * compartilhável.
 */
export default async function AprovacoesPontePage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { aba } = await searchParams
  const naAbaNegados = aba === 'negados'

  const [eventos, negados] = await Promise.all([eventosComPendentesDeAprovacao(), historicoDeNegados()])

  if (!naAbaNegados && eventos.length === 1) redirect(`/admin/eventos/${eventos[0].id}/aprovacoes`)

  const totalPendentes = eventos.reduce((s, e) => s + e.pendentes, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Aguardando aprovação"
        descricao={naAbaNegados ? 'Histórico de credenciamentos negados' : 'Escolha o evento para ver quem está esperando'}
      />

      <div className="flex gap-1 border-b border-slate-200">
        <Aba href="/admin/aprovacoes" ativa={!naAbaNegados} rotulo="Aguardando" contagem={totalPendentes} tom="amber" />
        <Aba href="/admin/aprovacoes?aba=negados" ativa={naAbaNegados} rotulo="Negados" contagem={negados.length} tom="red" />
      </div>

      {!naAbaNegados ? (
        <Secao tom="acento" icone={<ClipboardCheck className="w-3.5 h-3.5" />} titulo="Eventos com pendência" corpoClassName={eventos.length ? 'p-0' : 'p-4'}>
          {!eventos.length ? (
            <EmptyState
              icone={<ClipboardCheck className="w-7 h-7" />}
              titulo="Nada pendente agora"
              descricao="Quando alguém se cadastrar e precisar de aprovação, aparece aqui."
            />
          ) : (
            <div className="divide-y divide-slate-50">
              {eventos.map(e => (
                <Link key={e.id} href={`/admin/eventos/${e.id}/aprovacoes`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors">
                  <p className="text-slate-800 font-medium text-sm">{e.nome}</p>
                  <Badge tom="atencao">{e.pendentes} pendente{e.pendentes === 1 ? '' : 's'}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Secao>
      ) : (
        <Secao
          tom="acento"
          icone={<Ban className="w-3.5 h-3.5" />}
          titulo={`${negados.length} credenciamento${negados.length === 1 ? '' : 's'} negado${negados.length === 1 ? '' : 's'}`}
          corpoClassName={negados.length ? '' : 'p-4'}
        >
          {!negados.length ? (
            <EmptyState
              icone={<Ban className="w-7 h-7" />}
              titulo="Nenhum credenciamento negado"
              descricao="Quando alguém negar um cadastro, fica registrado aqui com quem negou e o motivo."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Evento / Setor</th>
                    <th>Negado por</th>
                    <th>Quando</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {negados.map(n => (
                    <tr key={n.id}>
                      <td>
                        <p className="text-slate-700 font-medium">{n.nome}</p>
                        {n.cargo && <p className="text-slate-400 text-2xs">{n.cargo}</p>}
                      </td>
                      <td className="text-slate-500 text-2xs tabular-nums whitespace-nowrap">{formatCpf(n.cpf)}</td>
                      <td>
                        <Link href={`/admin/eventos/${n.eventoId}/aprovacoes`} className="text-slate-700 text-2xs hover:text-brand-600 hover:underline">
                          {n.eventoNome}
                        </Link>
                        <p className="text-slate-400 text-2xs">{n.setorNome}</p>
                      </td>
                      <td className="text-slate-700 text-2xs font-medium">{n.negadoPor ?? '—'}</td>
                      <td className="text-slate-500 text-2xs whitespace-nowrap">{n.negadoEm ? formatarBR(n.negadoEm, 'curto') : '—'}</td>
                      <td className="text-slate-500 text-2xs max-w-[18rem]">{n.motivo ?? <span className="text-slate-300">Sem motivo informado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      )}
    </div>
  )
}

function Aba({ href, ativa, rotulo, contagem, tom }: {
  href: string
  ativa: boolean
  rotulo: string
  contagem: number
  tom: 'amber' | 'red'
}) {
  const cor = tom === 'amber' ? 'bg-amber-500' : 'bg-red-500'
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
        ativa ? 'border-brand-500 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {rotulo}
      {contagem > 0 && (
        <span className={`min-w-[18px] h-[18px] px-1 rounded-full ${cor} text-white text-[10px] font-bold tabular-nums flex items-center justify-center`}>
          {contagem > 99 ? '99+' : contagem}
        </span>
      )}
    </Link>
  )
}
