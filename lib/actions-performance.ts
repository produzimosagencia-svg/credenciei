'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { podeVerPerformance, podeGerenciarPerformance } from './permissions'
import { mensagemAmigavel } from './erros'
import { contarAlertasNaoLidos, listarAlertas, type Alerta } from './performance'

/**
 * Escrita do Painel de Performance — leitura fica em lib/performance.ts
 * (chamada direto por Server Components, sem precisar virar action).
 *
 * TODA AÇÃO DEVOLVE `{ ok }` / `{ ok: false, erro }`, NENHUMA LANÇA — mesma
 * razão de sempre nesta sessão: Server Action que lança em produção devolve
 * mensagem mascarada pelo Next, não a real.
 */

export type Resultado<T = undefined> =
  | { ok?: false; erro: string }
  | ({ ok: true } & (T extends undefined ? object : { dados: T }))

const SEM_ACESSO = 'Você não tem acesso ao Painel de Performance. Fale com o master.'
const SEM_ACESSO_GERENCIAR = 'Só quem gerencia o Painel de Performance pode mudar isso.'

async function exigirVer() {
  const perfil = await getPerfil()
  if (!perfil || !podeVerPerformance(perfil)) return null
  return perfil
}
async function exigirGerenciar() {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarPerformance(perfil)) return null
  return perfil
}

/** Chamado pelo sino de alertas no AppShell — contagem de não lidos. */
export async function contarAlertasNaoLidosAction(): Promise<number> {
  const perfil = await exigirVer()
  if (!perfil) return 0
  return contarAlertasNaoLidos()
}

/** Os últimos alertas, pro dropdown do sino. */
export async function listarAlertasAction(limite = 15): Promise<Alerta[]> {
  const perfil = await exigirVer()
  if (!perfil) return []
  return listarAlertas(limite)
}

export async function marcarAlertaLido(alertaId: string): Promise<Resultado> {
  const perfil = await exigirVer()
  if (!perfil) return { erro: SEM_ACESSO }
  const { error } = await supabaseAdmin
    .from('perf_alerts').update({ lido_em: new Date().toISOString(), lido_por: perfil.id }).eq('id', alertaId)
  if (error) return { erro: mensagemAmigavel(error) }
  revalidatePath('/admin/performance')
  return { ok: true }
}

export async function marcarTodosAlertasLidos(): Promise<Resultado> {
  const perfil = await exigirVer()
  if (!perfil) return { erro: SEM_ACESSO }
  const { error } = await supabaseAdmin
    .from('perf_alerts').update({ lido_em: new Date().toISOString(), lido_por: perfil.id }).is('lido_em', null)
  if (error) return { erro: mensagemAmigavel(error) }
  revalidatePath('/admin/performance')
  return { ok: true }
}

export type ServicoInput = {
  habilitado: boolean
  intervaloSegundos: number
  timeoutMs: number
  limiarAtencaoMs: number
  limiarCriticoMs: number
}

export async function atualizarServico(servicoId: string, dados: ServicoInput): Promise<Resultado> {
  const perfil = await exigirGerenciar()
  if (!perfil) return { erro: SEM_ACESSO_GERENCIAR }

  if (dados.intervaloSegundos < 30) return { erro: 'O intervalo mínimo é 30 segundos.' }

  const { error } = await supabaseAdmin.from('perf_services').update({
    habilitado: dados.habilitado,
    intervalo_segundos: dados.intervaloSegundos,
    timeout_ms: dados.timeoutMs,
    limiar_atencao_ms: dados.limiarAtencaoMs,
    limiar_critico_ms: dados.limiarCriticoMs,
    updated_at: new Date().toISOString(),
  }).eq('id', servicoId)
  if (error) return { erro: mensagemAmigavel(error) }

  revalidatePath('/admin/performance')
  revalidatePath('/admin/performance/configuracoes')
  return { ok: true }
}

/**
 * Serviço novo, cadastrado à mão — sem check próprio ainda (não existe
 * função em CHECKS_POR_CHAVE pra ele), fica "não monitorado" até alguém
 * programar o check. É a extensibilidade pedida: cadastra a entidade sem
 * precisar reconstruir o Painel.
 */
export async function criarServicoPersonalizado(dados: {
  chave: string; nome: string; tipo: string; categoria: string; descricao: string | null
}): Promise<Resultado> {
  const perfil = await exigirGerenciar()
  if (!perfil) return { erro: SEM_ACESSO_GERENCIAR }

  const chave = dados.chave.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
  if (chave.length < 2) return { erro: 'Informe uma chave válida.' }
  if (!dados.nome.trim()) return { erro: 'Informe o nome do serviço.' }

  const { error } = await supabaseAdmin.from('perf_services').insert({
    chave, nome: dados.nome.trim(), tipo: dados.tipo.trim() || 'outro',
    categoria: dados.categoria, descricao: dados.descricao?.trim() || null,
    habilitado: false, ordem: 999,
  })
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { erro: `Já existe um serviço com a chave "${chave}".` }
    return { erro: mensagemAmigavel(error) }
  }
  revalidatePath('/admin/performance/configuracoes')
  return { ok: true }
}

export async function excluirServicoPersonalizado(servicoId: string): Promise<Resultado> {
  const perfil = await exigirGerenciar()
  if (!perfil) return { erro: SEM_ACESSO_GERENCIAR }
  const { error } = await supabaseAdmin.from('perf_services').delete().eq('id', servicoId)
  if (error) return { erro: mensagemAmigavel(error) }
  revalidatePath('/admin/performance/configuracoes')
  return { ok: true }
}

export async function marcarIncidente(incidenteId: string, status: 'resolvido' | 'ignorado' | 'investigando'): Promise<Resultado> {
  const perfil = await exigirGerenciar()
  if (!perfil) return { erro: SEM_ACESSO_GERENCIAR }
  const patch: Record<string, unknown> = { status }
  if (status === 'resolvido') patch.resolvido_em = new Date().toISOString()
  const { error } = await supabaseAdmin.from('perf_incidents').update(patch).eq('id', incidenteId)
  if (error) return { erro: mensagemAmigavel(error) }
  revalidatePath('/admin/performance/incidentes')
  revalidatePath('/admin/performance')
  return { ok: true }
}
