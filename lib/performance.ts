import 'server-only'

import { supabaseAdmin } from './supabase-server'
import { CHECKS_POR_CHAVE } from './performance-checks'
import {
  statusServicoValido, categoriaValida, type StatusServico, type StatusGeral, type CategoriaServico,
} from './performance-constantes'

/**
 * Leitura, agregação e execução dos health-checks do Painel de Performance.
 *
 * `executarChecagens()` é o orquestrador chamado pelo cron
 * (`app/api/cron/performance-check/route.ts`, 1x/minuto): decide quais
 * serviços já venceram o próprio intervalo, roda o check de cada um
 * (`lib/performance-checks.ts`), grava o resultado, aplica a régua de
 * incidente e limpa `perf_checks` velhos. O resto do arquivo é leitura pras
 * telas.
 */

export type Servico = {
  id: string
  chave: string
  nome: string
  tipo: string
  categoria: CategoriaServico
  descricao: string | null
  ambiente: string
  endpoint: string | null
  habilitado: boolean
  intervaloSegundos: number
  timeoutMs: number
  limiarAtencaoMs: number
  limiarCriticoMs: number
  ordem: number
  falhasConsecutivas: number
  ultimoCheckEm: string | null
  ultimoStatus: StatusServico
  ultimaLatenciaMs: number | null
  ultimoErro: string | null
}

type LinhaServico = {
  id: string; chave: string; nome: string; tipo: string; categoria: string
  descricao: string | null; ambiente: string; endpoint: string | null
  habilitado: boolean; intervalo_segundos: number; timeout_ms: number
  limiar_atencao_ms: number; limiar_critico_ms: number; ordem: number
  falhas_consecutivas: number; ultimo_check_em: string | null
  ultimo_status: string; ultima_latencia_ms: number | null; ultimo_erro: string | null
}

function montarServico(l: LinhaServico): Servico {
  return {
    id: l.id, chave: l.chave, nome: l.nome, tipo: l.tipo, categoria: categoriaValida(l.categoria),
    descricao: l.descricao, ambiente: l.ambiente, endpoint: l.endpoint, habilitado: l.habilitado,
    intervaloSegundos: l.intervalo_segundos, timeoutMs: l.timeout_ms,
    limiarAtencaoMs: l.limiar_atencao_ms, limiarCriticoMs: l.limiar_critico_ms, ordem: l.ordem,
    falhasConsecutivas: l.falhas_consecutivas, ultimoCheckEm: l.ultimo_check_em,
    ultimoStatus: statusServicoValido(l.ultimo_status), ultimaLatenciaMs: l.ultima_latencia_ms,
    ultimoErro: l.ultimo_erro,
  }
}

export async function listarServicos(): Promise<Servico[]> {
  const { data, error } = await supabaseAdmin.from('perf_services').select('*').order('ordem')
  if (error) throw new Error(error.message)
  return ((data ?? []) as LinhaServico[]).map(montarServico)
}

export async function servicoPorChave(chave: string): Promise<Servico | null> {
  const { data, error } = await supabaseAdmin.from('perf_services').select('*').eq('chave', chave).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? montarServico(data as LinhaServico) : null
}

/**
 * Operacional/Atenção/Degradado/Indisponível — sempre derivado da lista real
 * de serviços, nunca de um campo manual (pedido explícito do Juan).
 *
 *   API ou Banco offline           → INDISPONÍVEL
 *   qualquer outro serviço offline → DEGRADADO
 *   algum serviço em atenção       → ATENÇÃO
 *   tudo online/não-monitorado     → OPERACIONAL
 */
const SERVICOS_CRITICOS = new Set(['api', 'banco'])

export function statusGeralDaPlataforma(servicos: Servico[]): StatusGeral {
  const habilitados = servicos.filter(s => s.habilitado)
  const criticoOffline = habilitados.some(s => SERVICOS_CRITICOS.has(s.chave) && s.ultimoStatus === 'offline')
  if (criticoOffline) return 'indisponivel'
  const algumOffline = habilitados.some(s => s.ultimoStatus === 'offline')
  if (algumOffline) return 'degradado'
  const algumAtencao = habilitados.some(s => s.ultimoStatus === 'atencao')
  if (algumAtencao) return 'atencao'
  return 'operacional'
}

export async function historicoDeChecks(serviceId: string, limite = 200) {
  const { data, error } = await supabaseAdmin
    .from('perf_checks')
    .select('status, latencia_ms, status_code, erro, checado_em')
    .eq('service_id', serviceId)
    .order('checado_em', { ascending: false })
    .limit(limite)
  if (error) throw new Error(error.message)
  return (data ?? []) as { status: string; latencia_ms: number | null; status_code: number | null; erro: string | null; checado_em: string }[]
}

export async function uptimePorPeriodo(serviceId: string, dias: number): Promise<{ pct: number; dias: { dia: string; pct: number }[] }> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabaseAdmin
    .from('perf_uptime_diario')
    .select('dia, checks_total, checks_ok')
    .eq('service_id', serviceId)
    .gte('dia', desde)
    .order('dia')
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as { dia: string; checks_total: number; checks_ok: number }[]
  const totalChecks = linhas.reduce((s, l) => s + l.checks_total, 0)
  const totalOk = linhas.reduce((s, l) => s + l.checks_ok, 0)
  return {
    pct: totalChecks ? (totalOk / totalChecks) * 100 : 100,
    dias: linhas.map(l => ({ dia: l.dia, pct: l.checks_total ? (l.checks_ok / l.checks_total) * 100 : 100 })),
  }
}

export type Incidente = {
  id: string; serviceId: string; nivel: string; titulo: string; causa: string | null
  iniciadoEm: string; resolvidoEm: string | null; status: string; falhasConsecutivas: number
}

export async function listarIncidentes(opcoes: { status?: string; serviceId?: string; limite?: number } = {}): Promise<Incidente[]> {
  let query = supabaseAdmin.from('perf_incidents').select('*').order('iniciado_em', { ascending: false }).limit(opcoes.limite ?? 50)
  if (opcoes.status) query = query.eq('status', opcoes.status)
  if (opcoes.serviceId) query = query.eq('service_id', opcoes.serviceId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(l => ({
    id: l.id as string, serviceId: l.service_id as string, nivel: l.nivel as string,
    titulo: l.titulo as string, causa: l.causa as string | null,
    iniciadoEm: l.iniciado_em as string, resolvidoEm: l.resolvido_em as string | null,
    status: l.status as string, falhasConsecutivas: l.falhas_consecutivas as number,
  }))
}

export type Alerta = {
  id: string; incidentId: string | null; serviceId: string | null; nivel: string
  titulo: string; mensagem: string; lidoEm: string | null; criadoEm: string
}

export async function listarAlertas(limite = 30): Promise<Alerta[]> {
  const { data, error } = await supabaseAdmin.from('perf_alerts').select('*').order('created_at', { ascending: false }).limit(limite)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(l => ({
    id: l.id as string, incidentId: l.incident_id as string | null, serviceId: l.service_id as string | null,
    nivel: l.nivel as string, titulo: l.titulo as string, mensagem: l.mensagem as string,
    lidoEm: l.lido_em as string | null, criadoEm: l.created_at as string,
  }))
}

export async function contarAlertasNaoLidos(): Promise<number> {
  const { count, error } = await supabaseAdmin.from('perf_alerts').select('id', { count: 'exact', head: true }).is('lido_em', null)
  if (error) return 0
  return count ?? 0
}

// ─── Orquestrador dos health-checks (chamado só pelo cron) ───────────────────

function derivarStatus(
  resultado: Awaited<ReturnType<(typeof CHECKS_POR_CHAVE)[string]>>, limiarAtencaoMs: number, limiarCriticoMs: number,
): StatusServico {
  if (resultado.naoConfigurado) return 'nao_monitorado'
  if (!resultado.ok) return 'offline'
  if (resultado.latenciaMs >= limiarCriticoMs) return 'offline'
  if (resultado.aviso || resultado.latenciaMs >= limiarAtencaoMs) return 'atencao'
  return 'online'
}

async function atualizarUptimeDiario(serviceId: string, ok: boolean, latenciaMs: number) {
  const hoje = new Date().toISOString().slice(0, 10)
  const { data: atual } = await supabaseAdmin
    .from('perf_uptime_diario').select('checks_total, checks_ok, latencia_media_ms')
    .eq('service_id', serviceId).eq('dia', hoje).maybeSingle()

  const checksTotal = (atual?.checks_total ?? 0) + 1
  const checksOk = (atual?.checks_ok ?? 0) + (ok ? 1 : 0)
  const mediaAnterior = atual?.latencia_media_ms ?? latenciaMs
  const latenciaMedia = Math.round((mediaAnterior * (checksTotal - 1) + latenciaMs) / checksTotal)

  await supabaseAdmin.from('perf_uptime_diario').upsert(
    { service_id: serviceId, dia: hoje, checks_total: checksTotal, checks_ok: checksOk, latencia_media_ms: latenciaMedia },
    { onConflict: 'service_id,dia' },
  )
}

/** 2ª falha consecutiva abre incidente; recuperação fecha. Ver seção 16 do pedido. */
async function processarIncidente(servico: LinhaServico, status: StatusServico, erro: string | null) {
  const eraOffline = servico.ultimo_status === 'offline'

  if (status === 'offline') {
    const falhas = servico.falhas_consecutivas + 1
    await supabaseAdmin.from('perf_services').update({ falhas_consecutivas: falhas }).eq('id', servico.id)

    if (falhas === 2) {
      const { data: existente } = await supabaseAdmin
        .from('perf_incidents').select('id').eq('service_id', servico.id).eq('status', 'ativo').maybeSingle()
      if (!existente) {
        const { data: novo } = await supabaseAdmin.from('perf_incidents').insert({
          service_id: servico.id, nivel: 'critical', titulo: `${servico.nome} indisponível`,
          causa: erro, falhas_consecutivas: falhas, ultima_resposta: erro,
        }).select('id').single()
        await supabaseAdmin.from('perf_alerts').insert({
          incident_id: novo?.id, service_id: servico.id, nivel: 'critical',
          titulo: `🔴 ${servico.nome} indisponível`,
          mensagem: erro ? `Foi detectada uma indisponibilidade: ${erro}` : 'Foi detectada uma indisponibilidade.',
        })
      }
    } else if (falhas > 2) {
      await supabaseAdmin.from('perf_incidents')
        .update({ falhas_consecutivas: falhas, ultima_resposta: erro })
        .eq('service_id', servico.id).eq('status', 'ativo')
    }
    return
  }

  // Recuperou — fecha incidente ativo, se houver, e zera o contador de falhas.
  if (servico.falhas_consecutivas > 0) {
    await supabaseAdmin.from('perf_services').update({ falhas_consecutivas: 0 }).eq('id', servico.id)
  }
  if (eraOffline) {
    const { data: incidente } = await supabaseAdmin
      .from('perf_incidents').select('id').eq('service_id', servico.id).eq('status', 'ativo').maybeSingle()
    if (incidente) {
      await supabaseAdmin.from('perf_incidents')
        .update({ status: 'resolvido', resolvido_em: new Date().toISOString() }).eq('id', incidente.id)
      await supabaseAdmin.from('perf_alerts').insert({
        incident_id: incidente.id, service_id: servico.id, nivel: 'info',
        titulo: `✓ ${servico.nome} recuperado`, mensagem: `O serviço voltou a responder normalmente.`,
      })
    }
  }

  // Entrou em atenção agora (não vinha de atenção nem de offline) — aviso leve, sem incidente.
  if (status === 'atencao' && servico.ultimo_status === 'online') {
    await supabaseAdmin.from('perf_alerts').insert({
      service_id: servico.id, nivel: 'warning', titulo: `⚠ ${servico.nome} com atenção`,
      mensagem: erro ? erro : 'Latência acima do esperado.',
    })
  }
}

/** Apaga checks com mais de 30 dias — retenção curta, ver cabeçalho da migração. */
async function limparChecksAntigos() {
  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  await supabaseAdmin.from('perf_checks').delete().lt('checado_em', limite)
}

export type ResultadoOrquestracao = { checados: string[]; pulados: string[] }

/**
 * Roda o health-check de cada serviço habilitado que já venceu o próprio
 * intervalo. Chamado 1x/minuto pelo cron — cada serviço decide sozinho se é
 * "sua vez" (API a cada 1 min, Gemini a cada 5 min, etc., ver
 * `perf_services.intervalo_segundos`), exatamente como o pedido descreve.
 */
export async function executarChecagens(): Promise<ResultadoOrquestracao> {
  const { data, error } = await supabaseAdmin.from('perf_services').select('*').eq('habilitado', true)
  if (error) throw new Error(error.message)
  const servicos = (data ?? []) as LinhaServico[]

  const checados: string[] = []
  const pulados: string[] = []
  const agora = Date.now()

  for (const servico of servicos) {
    const checkFn = CHECKS_POR_CHAVE[servico.chave]
    if (!checkFn) { pulados.push(servico.chave); continue }

    const ultimoEm = servico.ultimo_check_em ? new Date(servico.ultimo_check_em).getTime() : 0
    if (agora - ultimoEm < servico.intervalo_segundos * 1000) { pulados.push(servico.chave); continue }

    const resultado = await checkFn()
    const status = derivarStatus(resultado, servico.limiar_atencao_ms, servico.limiar_critico_ms)

    await supabaseAdmin.from('perf_checks').insert({
      service_id: servico.id, status, latencia_ms: resultado.latenciaMs,
      status_code: resultado.statusCode ?? null, erro: resultado.erro ?? resultado.aviso ?? null,
    })

    await supabaseAdmin.from('perf_services').update({
      ultimo_check_em: new Date().toISOString(), ultimo_status: status,
      ultima_latencia_ms: resultado.latenciaMs, ultimo_erro: resultado.erro ?? resultado.aviso ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', servico.id)

    await atualizarUptimeDiario(servico.id, status !== 'offline', resultado.latenciaMs)
    await processarIncidente(servico, status, resultado.erro ?? null)

    checados.push(servico.chave)
  }

  await limparChecksAntigos()
  return { checados, pulados }
}
