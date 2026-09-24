import { redirect, notFound } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeVerPerformance } from '@/lib/permissions'
import { servicoPorChave, historicoDeChecks, uptimePorPeriodo, listarIncidentes } from '@/lib/performance'
import { ROTULO_CATEGORIA, ROTULO_STATUS_SERVICO, TOM_STATUS_SERVICO, ROTULO_STATUS_INCIDENTE, IMPACTO_POR_SERVICO } from '@/lib/performance-constantes'
import { PageHeader, Secao, Badge } from '@/components/ui/Superficie'
import { GraficoLatencia } from '@/components/performance/GraficoLatencia'
import AutoRefresh from '@/components/performance/AutoRefresh'

export const revalidate = 0

export default async function ServicoDetalhePage({ params }: { params: Promise<{ chave: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeVerPerformance(perfil)) redirect('/admin')

  const { chave } = await params
  const servico = await servicoPorChave(chave)
  if (!servico) notFound()

  const [checks, uptime24h, uptime7d, uptime30d, incidentes] = await Promise.all([
    historicoDeChecks(servico.id, 200),
    uptimePorPeriodo(servico.id, 1),
    uptimePorPeriodo(servico.id, 7),
    uptimePorPeriodo(servico.id, 30),
    listarIncidentes({ serviceId: servico.id, limite: 20 }),
  ])

  const dadosGrafico = [...checks].reverse().map(c => ({
    hora: new Date(c.checado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    latenciaMs: c.latencia_ms,
  }))

  return (
    <div className="space-y-5">
      <AutoRefresh segundos={30} />
      <PageHeader
        titulo={servico.nome}
        descricao={`${ROTULO_CATEGORIA[servico.categoria]} · ${servico.descricao ?? ''}`}
        voltarPara="/admin/performance"
        acoes={<Badge tom={TOM_STATUS_SERVICO[servico.ultimoStatus]}>{ROTULO_STATUS_SERVICO[servico.ultimoStatus]}</Badge>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CardResumo rotulo="Latência atual" valor={servico.ultimaLatenciaMs != null ? `${servico.ultimaLatenciaMs}ms` : '—'} />
        <CardResumo rotulo="Uptime 24h" valor={`${uptime24h.pct.toFixed(2)}%`} />
        <CardResumo rotulo="Uptime 7 dias" valor={`${uptime7d.pct.toFixed(2)}%`} />
        <CardResumo rotulo="Uptime 30 dias" valor={`${uptime30d.pct.toFixed(2)}%`} />
      </div>

      {servico.ultimoErro && servico.ultimoStatus !== 'online' && (
        <Secao tom="aviso" titulo="Último erro" corpoClassName="p-4">
          <p className="text-slate-700 text-sm">{servico.ultimoErro}</p>
        </Secao>
      )}

      <Secao titulo="Latência (últimos checks)" corpoClassName="p-4">
        <GraficoLatencia dados={dadosGrafico} />
      </Secao>

      <Secao titulo="Se este serviço cair" corpoClassName="p-4">
        <ul className="text-slate-600 text-sm list-disc list-inside space-y-1">
          {(IMPACTO_POR_SERVICO[servico.chave] ?? ['Impacto não mapeado']).map(item => <li key={item}>{item}</li>)}
        </ul>
      </Secao>

      <Secao titulo="Incidentes deste serviço" corpoClassName="p-0">
        {!incidentes.length ? (
          <p className="text-slate-400 text-sm text-center py-8">Nenhum incidente registrado.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {incidentes.map(inc => (
              <div key={inc.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-slate-800 text-sm font-medium">{inc.titulo}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {new Date(inc.iniciadoEm).toLocaleString('pt-BR')}
                    {inc.resolvidoEm ? ` — resolvido ${new Date(inc.resolvidoEm).toLocaleString('pt-BR')}` : ' — em aberto'}
                  </p>
                </div>
                <Badge tom={inc.status === 'ativo' ? 'negativo' : inc.status === 'resolvido' ? 'positivo' : 'neutro'}>
                  {ROTULO_STATUS_INCIDENTE[inc.status as keyof typeof ROTULO_STATUS_INCIDENTE] ?? inc.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}

function CardResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</p>
      <p className="text-2xl font-extrabold mt-1 tabular-nums text-slate-800">{valor}</p>
    </div>
  )
}
