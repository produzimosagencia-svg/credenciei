import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin, buscarTudo, eventosAindaVigentes } from './supabase-server'
import { emLotes } from './lotes'
import { diaBRT } from './janelas'
import { provedor } from './whatsapp'
import { templatesAprovados } from './whatsapp-painel'
import { statusDasCredenciais } from './credencial-whatsapp'
import { normalizarTelefoneBR, mesmoTelefone, textoDoResumo, LEMBRETE_DEPOIS_MS, type Pendencias } from './convites-regras'

/*
 * CONVITE POR WHATSAPP (com lembrete em 24h) e RESUMO DIÁRIO DO SUPERVISOR (Juan, 18/10/2026) — o servidor.
 *
 * Os dois saem pela fila de sempre (`mensagens_agendadas`, tipo `disparo_manual` com o modelo escolhido — o mesmo
 * caminho das mensagens do supervisor), com nova tentativa, histórico e status de entrega. Modelos novos na Meta:
 * `convite_cadastro_equipe`, `lembrete_convite_equipe` e `resumo_pendencias_supervisor`
 * (supabase/TEMPLATES-WHATSAPP.md, itens 11 a 13). Enquanto a Meta não aprovar, NADA sai: o convite avisa na tela e
 * o resumo espera — sem mensagem falhando em silêncio.
 */

export const MODELO_CONVITE = 'convite_cadastro_equipe'
export const MODELO_LEMBRETE = 'lembrete_convite_equipe'
export const MODELO_RESUMO = 'resumo_pendencias_supervisor'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.com.br').replace(/\/+$/, '')

const ehTabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (['42P01', 'PGRST205'].includes(e.code ?? '') || /convites_equipe/.test(e.message ?? ''))

// ─── O modelo está aprovado? ──────────────────────────────────────────────────

let aprovadosCache: { em: number; nomes: Set<string> } | null = null

/** Pela Evolution (texto livre) sempre dá; pela Meta, só com o modelo APROVADO (consulta guardada por 10 min). */
export async function modeloPronto(nome: string): Promise<boolean> {
  if (provedor() === 'evolution') return true
  if (!aprovadosCache || Date.now() - aprovadosCache.em > 10 * 60_000) {
    const lista = await templatesAprovados().catch(() => [])
    // Lista vazia é falha de consulta (há sempre modelos aprovados): não guarda, tenta de novo na próxima.
    if (!lista.length) return false
    aprovadosCache = { em: Date.now(), nomes: new Set(lista.filter(t => t.status === 'APPROVED').map(t => t.nome)) }
  }
  return aprovadosCache.nomes.has(nome)
}

/** O link de cadastro da equipe — o mesmo do botão "Link cadastro". */
export function linkDeCadastro(tokenFormulario: string | null): string | null {
  const t = (tokenFormulario ?? '').trim()
  if (!t || !SITE_URL.startsWith('https://')) return null
  return `${SITE_URL}/form/${t}`
}

/** Põe UMA mensagem de modelo na fila e devolve o id dela. `campanha` serve para não duplicar. */
export async function enfileirarModelo(args: {
  eventoId: string; telefone: string; modelo: string; parametros: string[]; campanha?: string
}): Promise<string | null> {
  const telefone = normalizarTelefoneBR(args.telefone)
  if (!telefone) return null
  const agora = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('mensagens_agendadas').insert({
    evento_id: args.eventoId,
    tipo: 'disparo_manual',
    data_ref: diaBRT(),
    agendado_para: agora,
    telefone,
    mensagem: JSON.stringify({
      campanhaId: args.campanha ?? `${args.modelo}-${randomUUID()}`,
      origem: 'automatico',
      template: args.modelo,
      // A Meta recusa quebra de linha em parâmetro.
      parametros: args.parametros.map(p => String(p ?? '').replace(/\s*\n+\s*/g, ' ').trim()),
    }),
  }).select('id').single()
  if (error) { console.error('[convites] mensagem não entrou na fila', error.message); return null }
  return (data?.id as string | undefined) ?? null
}

// ─── Quem já se cadastrou ─────────────────────────────────────────────────────

type ConviteAberto = { id: string; fornecedor_id: string; telefone: string }

/** Marca como cadastrado o convite cujo telefone já apareceu numa ficha da equipe. Devolve os ids marcados. */
export async function marcarCadastrados(convites: ConviteAberto[]): Promise<Set<string>> {
  const marcados = new Set<string>()
  const porEquipe = new Map<string, ConviteAberto[]>()
  for (const c of convites) porEquipe.set(c.fornecedor_id, [...(porEquipe.get(c.fornecedor_id) ?? []), c])
  for (const [fornecedorId, lista] of porEquipe) {
    const fichas = await buscarTudo<{ id: string; telefone: string | null }>((de, ate) => supabaseAdmin.from('funcionarios')
      .select('id, telefone').eq('fornecedor_id', fornecedorId).order('id').range(de, ate) as never)
    for (const c of lista) {
      const ficha = fichas.find(f => mesmoTelefone(f.telefone, c.telefone))
      if (!ficha) continue
      const { error } = await supabaseAdmin.from('convites_equipe')
        .update({ cadastrado_em: new Date().toISOString(), funcionario_id: ficha.id }).eq('id', c.id).is('cadastrado_em', null)
      if (!error) marcados.add(c.id)
    }
  }
  return marcados
}

const horaBRT = () => Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 13))

async function fluxoDesligado(chave: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    return ((data?.valor ?? {}) as Record<string, boolean>)[chave] === false
  } catch { return false }
}

// ─── Lembrete do convite (varredura do cron) ──────────────────────────────────

/**
 * Convite sem cadastro há 24 horas ganha UM lembrete. Só entre 8h e 21h (ninguém recebe convite de madrugada), só
 * com o modelo aprovado, e nunca para quem já se cadastrou ou teve o lembrete cancelado pelo supervisor.
 */
export async function processarLembretesDeConvite(): Promise<void> {
  const hora = horaBRT()
  if (hora < 8 || hora >= 21) return
  if (await fluxoDesligado('lembrete_convite')) return
  const limite = new Date(Date.now() - LEMBRETE_DEPOIS_MS).toISOString()
  const { data: vencidos, error } = await supabaseAdmin.from('convites_equipe')
    .select('id, fornecedor_id, evento_id, telefone')
    .is('lembrado_em', null).is('cadastrado_em', null).is('cancelado_em', null)
    .lte('criado_em', limite).order('criado_em').limit(40)
  if (error || !vencidos?.length) return

  const cadastrados = await marcarCadastrados(vencidos as ConviteAberto[])
  const faltam = vencidos.filter(c => !cadastrados.has(c.id as string))
  if (!faltam.length || !(await modeloPronto(MODELO_LEMBRETE))) return

  const idsEquipes = [...new Set(faltam.map(c => c.fornecedor_id as string))]
  const { data: equipes } = await supabaseAdmin.from('fornecedores')
    .select('id, nome, token_formulario, link_ativo, eventos!inner(id, nome, ativo)').in('id', idsEquipes)
  const equipePorId = new Map((equipes ?? []).map(e => [e.id as string, e]))

  for (const c of faltam) {
    const e = equipePorId.get(c.fornecedor_id as string)
    const evento = e?.eventos as unknown as { id: string; nome: string; ativo: boolean | null } | undefined
    const link = e && (e as { link_ativo?: boolean | null }).link_ativo !== false ? linkDeCadastro(e.token_formulario as string | null) : null
    // Equipe sem link, evento encerrado: não há para onde mandar a pessoa — o convite fecha sem lembrete.
    if (!e || !evento || evento.ativo === false || !link) {
      await supabaseAdmin.from('convites_equipe').update({ lembrado_em: new Date().toISOString() }).eq('id', c.id)
      continue
    }
    // Marca ANTES de enfileirar: duas varreduras juntas não mandam dois lembretes.
    const { data: marcou } = await supabaseAdmin.from('convites_equipe')
      .update({ lembrado_em: new Date().toISOString() }).eq('id', c.id).is('lembrado_em', null).select('id')
    if (!marcou?.length) continue
    const id = await enfileirarModelo({
      eventoId: evento.id, telefone: c.telefone as string, modelo: MODELO_LEMBRETE,
      parametros: [String(e.nome ?? '').trim(), evento.nome, link], campanha: `lembrete-convite-${c.id}`,
    })
    if (id) await supabaseAdmin.from('convites_equipe').update({ lembrete_mensagem_id: id }).eq('id', c.id)
  }
}

// ─── Resumo diário do supervisor (varredura do cron) ──────────────────────────

const CHAVE_RESUMO = 'resumo_supervisor_dia'

/**
 * Uma vez por dia, a partir das 9h: cada supervisor de evento em operação (ou que começa nos próximos 7 dias)
 * recebe, se houver pendência, um resumo da equipe dele — quem espera aprovação, credencial que não chegou,
 * convidado que não se cadastrou. Sem pendência, nada sai.
 */
export async function enviarResumosDoDia(): Promise<void> {
  const hora = horaBRT()
  if (hora < 9 || hora >= 12) return
  const hoje = diaBRT()
  const { data: estado } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', CHAVE_RESUMO).maybeSingle()
  if ((estado?.valor as { dia?: string } | null)?.dia === hoje) return
  if (await fluxoDesligado('resumo_supervisor')) return
  // Sem o modelo aprovado, não marca o dia: tenta de novo na próxima volta do cron (até o meio-dia).
  if (!(await modeloPronto(MODELO_RESUMO))) return
  await supabaseAdmin.from('sistema_estado').upsert({ chave: CHAVE_RESUMO, valor: { dia: hoje, em: new Date().toISOString() } })

  const daquiUmaSemana = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const { data: candidatos } = await supabaseAdmin.from('eventos').select('id, nome').eq('ativo', true).lte('data_inicio', daquiUmaSemana)
  const vigentes = await eventosAindaVigentes((candidatos ?? []).map(e => e.id as string))
  const eventos = (candidatos ?? []).filter(e => vigentes.has(e.id as string))
  if (!eventos.length) return
  const nomeDoEvento = new Map(eventos.map(e => [e.id as string, e.nome as string]))

  const equipes: { id: string; evento_id: string }[] = []
  for (const lote of emLotes([...nomeDoEvento.keys()], 50)) {
    equipes.push(...await buscarTudo<{ id: string; evento_id: string }>((de, ate) => supabaseAdmin.from('fornecedores')
      .select('id, evento_id').in('evento_id', lote).order('id').range(de, ate) as never))
  }
  const eventoDaEquipe = new Map(equipes.map(f => [f.id, f.evento_id]))
  const vinculos: { perfil_id: string; fornecedor_id: string }[] = []
  for (const lote of emLotes(equipes.map(f => f.id), 150)) {
    vinculos.push(...await buscarTudo<{ perfil_id: string; fornecedor_id: string }>((de, ate) => supabaseAdmin.from('supervisor_setores')
      .select('perfil_id, fornecedor_id').in('fornecedor_id', lote).order('fornecedor_id').range(de, ate) as never))
  }
  if (!vinculos.length) return

  // As pendências de cada equipe.
  const pend = new Map<string, Pendencias>()
  const de = (fid: string) => { if (!pend.has(fid)) pend.set(fid, { aprovar: 0, credenciaisFalharam: 0, convidadosSemCadastro: 0 }); return pend.get(fid)! }
  const idsComSupervisor = [...new Set(vinculos.map(v => v.fornecedor_id))]
  const recentes = new Date(Date.now() - 14 * 24 * 3600_000).toISOString()
  for (const lote of emLotes(idsComSupervisor, 100)) {
    const fichas = await buscarTudo<{ id: string; fornecedor_id: string; status_credenciamento: string | null; created_at: string; origem: string | null }>((d, a) => supabaseAdmin
      .from('funcionarios').select('id, fornecedor_id, status_credenciamento, created_at, origem')
      .in('fornecedor_id', lote).is('descredenciado_em', null).order('id').range(d, a) as never)
    for (const f of fichas) if (f.status_credenciamento === 'pendente') de(f.fornecedor_id).aprovar++
    // Credencial que não chegou: só das fichas aprovadas das últimas 2 semanas (o resto já é passado).
    const aprovadas = fichas.filter(f => f.status_credenciamento !== 'pendente' && f.status_credenciamento !== 'negado' && f.origem !== 'supervisor' && f.created_at >= recentes)
    const status = await statusDasCredenciais(aprovadas.map(f => f.id))
    for (const f of aprovadas) if (status.get(f.id) === 'falhou') de(f.fornecedor_id).credenciaisFalharam++
    const { data: convites, error } = await supabaseAdmin.from('convites_equipe').select('id, fornecedor_id, telefone')
      .in('fornecedor_id', lote).is('cadastrado_em', null).is('cancelado_em', null)
    if (!error && convites?.length) {
      const marcados = await marcarCadastrados(convites as ConviteAberto[])
      for (const c of convites) if (!marcados.has(c.id as string)) de(c.fornecedor_id as string).convidadosSemCadastro++
    }
  }

  // Um resumo por supervisor por evento, somando as equipes dele naquele evento.
  const idsPerfis = [...new Set(vinculos.map(v => v.perfil_id))]
  const perfis = new Map<string, { nome: string; telefone: string | null; ativo: boolean | null }>()
  for (const lote of emLotes(idsPerfis, 150)) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome, telefone, ativo').in('id', lote)
    for (const p of data ?? []) perfis.set(p.id as string, { nome: String(p.nome ?? ''), telefone: (p.telefone as string | null) ?? null, ativo: p.ativo as boolean | null })
  }
  const porPerfilEvento = new Map<string, { perfilId: string; eventoId: string; total: Pendencias }>()
  for (const v of vinculos) {
    const eventoId = eventoDaEquipe.get(v.fornecedor_id)
    const p = pend.get(v.fornecedor_id)
    if (!eventoId || !p) continue
    const k = `${v.perfil_id}|${eventoId}`
    const acc = porPerfilEvento.get(k) ?? { perfilId: v.perfil_id, eventoId, total: { aprovar: 0, credenciaisFalharam: 0, convidadosSemCadastro: 0 } }
    acc.total.aprovar += p.aprovar
    acc.total.credenciaisFalharam += p.credenciaisFalharam
    acc.total.convidadosSemCadastro += p.convidadosSemCadastro
    porPerfilEvento.set(k, acc)
  }

  for (const { perfilId, eventoId, total } of porPerfilEvento.values()) {
    const texto = textoDoResumo(total)
    const perfil = perfis.get(perfilId)
    if (!texto || !perfil || perfil.ativo === false || !normalizarTelefoneBR(perfil.telefone)) continue
    const campanha = `resumo-${perfilId}-${eventoId}-${hoje}`
    const { data: ja } = await supabaseAdmin.from('mensagens_agendadas').select('id').eq('tipo', 'disparo_manual')
      .like('mensagem', `%${campanha}%`).limit(1)
    if (ja?.length) continue
    await enfileirarModelo({
      eventoId, telefone: perfil.telefone as string, modelo: MODELO_RESUMO, campanha,
      parametros: [perfil.nome.split(' ')[0] || perfil.nome, nomeDoEvento.get(eventoId) ?? 'seu evento', texto, `${SITE_URL}/admin/meus-eventos`],
    })
  }
}

export { ehTabelaAusente }
