import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPerfil } from '@/lib/supabase-server'
import { podeVerPerformance } from '@/lib/permissions'
import { listarIncidentes, listarServicos } from '@/lib/performance'
import { ROTULO_STATUS_INCIDENTE, ROTULO_NIVEL } from '@/lib/performance-constantes'
import { PageHeader, Secao, Badge } from '@/components/ui/Superficie'
import AcoesIncidente from './AcoesIncidente'

export const revalidate = 0

export default async function IncidentesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeVerPerformance(perfil)) redirect('/admin')

  const { status } = await searchParams
  const [incidentes, servicos] = await Promise.all([
    listarIncidentes({ status: status || undefined, limite: 200 }),
    listarServicos(),
  ])
  const nomeDoServico = (id: string) => servicos.find(s => s.id === id)?.nome ?? '—'

  const FILTROS = [
    { valor: '', rotulo: 'Todos' },
    { valor: 'ativo', rotulo: 'Ativos' },
    { valor: 'resolvido', rotulo: 'Resolvidos' },
    { valor: 'ignorado', rotulo: 'Ignorados' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader titulo="Incidentes" descricao="Histórico de indisponibilidade por serviço" voltarPara="/admin/performance" />

      <div className="flex gap-2">
        {FILTROS.map(f => (
          <Link
            key={f.valor}
            href={f.valor ? `/admin/performance/incidentes?status=${f.valor}` : '/admin/performance/incidentes'}
            className={`btn btn-sm ${(status || '') === f.valor ? 'btn-primario' : 'btn-secundario'}`}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      <Secao corpoClassName="p-0">
        {!incidentes.length ? (
          <p className="text-slate-400 text-sm text-center py-10">Nenhum incidente neste filtro.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {incidentes.map(inc => (
              <div key={inc.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-slate-800 font-medium text-sm">{inc.titulo}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {nomeDoServico(inc.serviceId)} · {new Date(inc.iniciadoEm).toLocaleString('pt-BR')}
                    {inc.resolvidoEm && ` — resolvido ${new Date(inc.resolvidoEm).toLocaleString('pt-BR')}`}
                    {' · '}{inc.falhasConsecutivas} falhas
                  </p>
                  {inc.causa && <p className="text-slate-500 text-xs mt-1">{inc.causa}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tom={inc.nivel === 'critical' ? 'negativo' : 'atencao'}>{ROTULO_NIVEL[inc.nivel as 'warning' | 'critical'] ?? inc.nivel}</Badge>
                  <Badge tom={inc.status === 'ativo' ? 'negativo' : inc.status === 'resolvido' ? 'positivo' : 'neutro'}>
                    {ROTULO_STATUS_INCIDENTE[inc.status as keyof typeof ROTULO_STATUS_INCIDENTE] ?? inc.status}
                  </Badge>
                  {inc.status === 'ativo' && <AcoesIncidente incidenteId={inc.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}
