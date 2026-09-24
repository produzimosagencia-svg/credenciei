import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings, AlertTriangle, ListTree } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeVerPerformance } from '@/lib/permissions'
import { listarServicos, statusGeralDaPlataforma, listarIncidentes, listarAlertas } from '@/lib/performance'
import {
  ROTULO_STATUS_GERAL, ROTULO_CATEGORIA, CATEGORIAS_SERVICO,
  ROTULO_STATUS_SERVICO, TOM_STATUS_SERVICO, ROTULO_NIVEL, IMPACTO_POR_SERVICO,
} from '@/lib/performance-constantes'
import { PageHeader, Secao, Badge } from '@/components/ui/Superficie'
import AutoRefresh from '@/components/performance/AutoRefresh'

export const revalidate = 0

/**
 * Painel de Performance — observabilidade real da plataforma. Master-only:
 * ver lib/permissions.ts (`podeVerPerformance`). Nada aqui é mostrado sem
 * ter vindo de um health-check de verdade — ver o cabeçalho de
 * supabase/upgrade-performance.sql.
 */
export default async function PerformancePage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeVerPerformance(perfil)) redirect('/admin')

  let servicos: Awaited<ReturnType<typeof listarServicos>> = []
  let incidentesAtivos: Awaited<ReturnType<typeof listarIncidentes>> = []
  let alertasRecentes: Awaited<ReturnType<typeof listarAlertas>> = []
  let erroMigracao: string | null = null
  try {
    ;[servicos, incidentesAtivos, alertasRecentes] = await Promise.all([
      listarServicos(),
      listarIncidentes({ status: 'ativo' }),
      listarAlertas(10),
    ])
  } catch (e) {
    erroMigracao = e instanceof Error ? e.message : String(e)
  }

  if (erroMigracao) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Performance" descricao="Falta um passo antes de usar" />
        <Secao tom="aviso" icone={<AlertTriangle className="w-3.5 h-3.5" />} titulo="O banco ainda não tem as tabelas do Painel de Performance" corpoClassName="p-5">
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Rode <code className="bg-slate-100 rounded px-1.5 py-0.5 text-slate-800">supabase/upgrade-performance.sql</code>{' '}
              no SQL Editor do Supabase. É aditivo e reversível, já vem com os 10 serviços reais mapeados.
            </p>
            <p className="text-slate-400 text-xs">Erro do banco: {erroMigracao}</p>
          </div>
        </Secao>
      </div>
    )
  }

  const statusGeral = statusGeralDaPlataforma(servicos)
  const habilitados = servicos.filter(s => s.habilitado)
  const online = habilitados.filter(s => s.ultimoStatus === 'online').length
  const atencao = habilitados.filter(s => s.ultimoStatus === 'atencao').length
  const offline = habilitados.filter(s => s.ultimoStatus === 'offline').length
  const latencias = habilitados.map(s => s.ultimaLatenciaMs).filter((n): n is number => n != null)
  const latenciaMedia = latencias.length ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length) : null

  const porCategoria = CATEGORIAS_SERVICO.map(cat => ({
    categoria: cat,
    servicos: servicos.filter(s => s.categoria === cat).sort((a, b) => a.ordem - b.ordem),
  })).filter(g => g.servicos.length)

  return (
    <div className="space-y-5">
      <AutoRefresh segundos={30} />
      <PageHeader
        titulo="Performance"
        descricao="Saúde da API, banco, integrações e infraestrutura — atualizado a cada minuto."
        acoes={
          <div className="flex items-center gap-2">
            <Link href="/admin/performance/incidentes" className="btn btn-secundario"><ListTree className="w-4 h-4" /> Incidentes</Link>
            <Link href="/admin/performance/configuracoes" className="btn btn-secundario"><Settings className="w-4 h-4" /> Configurar</Link>
          </div>
        }
      />

      {/* Status geral */}
      <div className={`rounded-2xl p-5 border ${
        statusGeral === 'operacional' ? 'bg-green-50 border-green-200'
        : statusGeral === 'indisponivel' ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            statusGeral === 'operacional' ? 'bg-green-500' : statusGeral === 'indisponivel' ? 'bg-red-500' : 'bg-amber-500'
          }`} />
          <p className="font-bold text-slate-800 text-lg">{ROTULO_STATUS_GERAL[statusGeral]}</p>
        </div>
        <p className="text-slate-500 text-xs mt-1">
          {habilitados.length} serviços monitorados · {online} online · {atencao} em atenção · {offline} offline
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CardResumo rotulo="Online" valor={online} tom="text-green-600" />
        <CardResumo rotulo="Em atenção" valor={atencao} tom="text-amber-600" />
        <CardResumo rotulo="Offline" valor={offline} tom="text-red-600" />
        <CardResumo rotulo="Latência média" valor={latenciaMedia != null ? `${latenciaMedia}ms` : '—'} tom="text-slate-800" />
      </div>

      {/* Incidentes ativos */}
      {incidentesAtivos.length > 0 && (
        <Secao tom="aviso" icone={<AlertTriangle className="w-3.5 h-3.5" />} titulo={`${incidentesAtivos.length} incidente(s) ativo(s)`} corpoClassName="p-0">
          <div className="divide-y divide-slate-100">
            {incidentesAtivos.map(inc => (
              <div key={inc.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-slate-800 font-medium text-sm">{inc.titulo}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Desde {new Date(inc.iniciadoEm).toLocaleString('pt-BR')} · {inc.falhasConsecutivas} falhas
                  </p>
                </div>
                <Badge tom="negativo">{ROTULO_NIVEL[inc.nivel as 'warning' | 'critical'] ?? inc.nivel}</Badge>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* Serviços por categoria */}
      {porCategoria.map(grupo => (
        <Secao key={grupo.categoria} titulo={ROTULO_CATEGORIA[grupo.categoria]} corpoClassName="p-0">
          <div className="divide-y divide-slate-50">
            {grupo.servicos.map(s => (
              <Link key={s.id} href={`/admin/performance/${s.chave}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-slate-800 font-medium text-sm">{s.nome}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {s.ultimaLatenciaMs != null ? `${s.ultimaLatenciaMs}ms` : '—'}
                    {s.ultimoErro && s.ultimoStatus !== 'online' ? ` · ${s.ultimoErro}` : ''}
                  </p>
                </div>
                <Badge tom={TOM_STATUS_SERVICO[s.ultimoStatus]}>{ROTULO_STATUS_SERVICO[s.ultimoStatus]}</Badge>
              </Link>
            ))}
          </div>
        </Secao>
      ))}

      {/* Alertas recentes */}
      <Secao titulo="Alertas recentes" corpoClassName="p-0">
        {!alertasRecentes.length ? (
          <p className="text-slate-400 text-sm text-center py-8">Nenhum alerta ainda.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {alertasRecentes.map(a => (
              <div key={a.id} className="p-4">
                <p className="text-slate-800 text-sm font-medium">{a.titulo}</p>
                <p className="text-slate-500 text-xs mt-0.5">{a.mensagem}</p>
                <p className="text-slate-300 text-2xs mt-1">{new Date(a.criadoEm).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* Impacto — só se houver algo offline agora */}
      {offline > 0 && (
        <Secao tom="aviso" titulo="Impacto" corpoClassName="p-4 space-y-3">
          {habilitados.filter(s => s.ultimoStatus === 'offline').map(s => (
            <div key={s.id}>
              <p className="text-slate-800 text-sm font-semibold">{s.nome} offline</p>
              <ul className="text-slate-500 text-xs mt-1 list-disc list-inside">
                {(IMPACTO_POR_SERVICO[s.chave] ?? ['Impacto não mapeado']).map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </Secao>
      )}
    </div>
  )
}

function CardResumo({ rotulo, valor, tom }: { rotulo: string; valor: string | number; tom: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</p>
      <p className={`text-2xl font-extrabold mt-1 tabular-nums ${tom}`}>{valor}</p>
    </div>
  )
}
