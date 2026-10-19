import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin, buscarTudo, eventosAindaVigentes } from './supabase-server'
import { emLotes } from './lotes'
import { diaBRT } from './janelas'
import { provedor } from './whatsapp'
import { templatesAprovados } from './whatsapp-painel'
import { statusDasCredenciais } from './credencial-whatsapp'
import { normalizarTelefoneBR, textoDoResumo, type Pendencias } from './resumo-supervisor-regras'

/*
 * RESUMO DIÁRIO DO SUPERVISOR (Juan, 18/10/2026) — e a conferência de "o modelo está aprovado na Meta?", que o
 * Monte sua equipe também usa (confirmação de escala).
 *
 * O resumo sai pela fila de sempre (`mensagens_agendadas`, tipo `disparo_manual` com o modelo
 * `resumo_pendencias_supervisor` — supabase/TEMPLATES-WHATSAPP.md, item 11), com nova tentativa, histórico e status
 * de entrega. Enquanto a Meta não aprovar o modelo, nada sai.
 */

export const MODELO_RESUMO = 'resumo_pendencias_supervisor'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.com.br').replace(/\/+$/, '')

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
  if (error) { console.error('[resumo-supervisor] mensagem não entrou na fila', error.message); return null }
  return (data?.id as string | undefined) ?? null
}

const horaBRT = () => Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 13))

async function fluxoDesligado(chave: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    return ((data?.valor ?? {}) as Record<string, boolean>)[chave] === false
  } catch { return false }
}

// ─── Resumo diário do supervisor (varredura do cron) ──────────────────────────

const CHAVE_RESUMO = 'resumo_supervisor_dia'

/**
 * Uma vez por dia, a partir das 9h: cada supervisor de evento em operação (ou que começa nos próximos 7 dias)
 * recebe, se houver pendência, um resumo da equipe dele — quem espera aprovação e credencial que não chegou.
 * Sem pendência, nada sai.
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
  const de = (fid: string) => { if (!pend.has(fid)) pend.set(fid, { aprovar: 0, credenciaisFalharam: 0 }); return pend.get(fid)! }
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
    const acc = porPerfilEvento.get(k) ?? { perfilId: v.perfil_id, eventoId, total: { aprovar: 0, credenciaisFalharam: 0 } }
    acc.total.aprovar += p.aprovar
    acc.total.credenciaisFalharam += p.credenciaisFalharam
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

