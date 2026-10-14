'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { inputParaISO, formatarBR } from './tz'
import { getPerfil, meusSetores, ehDaOrganizacaoDoPerfil, supabaseAdmin, buscarTudo } from './supabase-server'
import { ehMaster, podeGerenciarEventos } from './permissions'
import { suporteTemEscopo } from './suporte'
import { registrarAuditoria } from './auditoria'
import { emLotes } from './lotes'

/**
 * FECHAR O DIA DA EQUIPE (Juan, 14/10/2026 — a maior dor do VITAL: 602 turnos sem saída, e as 459 saídas das 12h
 * foram lançadas por script). Quem gerencia o evento — ou o supervisor, só da própria equipe — lança de uma vez a
 * SAÍDA de quem entrou naquele dia e ficou aberto, com um horário e um motivo. Cada saída fica marcada como lançada
 * à mão (`registro_manual`, quem lançou, o motivo) — aparece assim no histórico, nas planilhas e na auditoria.
 *
 * É a única porta pela qual o supervisor lança SAÍDA (no "Lançar ponto" ele continua só com o meio): aqui a saída
 * nunca pode ficar no futuro nem antes da entrada da pessoa.
 */

export type PessoaSemSaida = { id: string; nome: string; setor: string; entradaISO: string }

type Escopo = { ok: true; perfil: { id: string; nome: string }; organizacaoId: string | null; setores: string[] | null } | { ok: false; erro: string }

/** Quem pode fechar o dia deste evento e de quais setores (`null` = todos do evento). */
async function escopoDoFechamento(eventoId: string): Promise<Escopo> {
  const perfil = await getPerfil()
  if (!perfil) return { ok: false, erro: 'Não autenticado.' }
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).maybeSingle()
  if (!evento) return { ok: false, erro: 'Evento não encontrado.' }
  const organizacaoId = (evento.organizacao_id as string | null) ?? null
  const quem = { id: perfil.id as string, nome: perfil.nome as string }

  if (ehMaster(perfil.role)) return { ok: true, perfil: quem, organizacaoId, setores: null }
  if (perfil.role === 'suporte') {
    return (await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))
      ? { ok: true, perfil: quem, organizacaoId, setores: null }
      : { ok: false, erro: 'Este evento não está no seu escopo de atendimento.' }
  }
  if (podeGerenciarEventos(perfil) && ehDaOrganizacaoDoPerfil(perfil, organizacaoId)) return { ok: true, perfil: quem, organizacaoId, setores: null }

  // Supervisor (o papel, ou só o vínculo de setor): só os setores dele neste evento.
  const meus = (await meusSetores(perfil)).filter(s => s.evento_id === eventoId).map(s => s.id as string)
  if (meus.length) return { ok: true, perfil: quem, organizacaoId, setores: meus }
  return { ok: false, erro: 'Sem permissão para fechar o dia desta equipe.' }
}

/** Quem entrou neste dia e ainda não tem saída — no fornecedor pedido, ou em todos os que a pessoa pode ver. */
async function semSaida(eventoId: string, dataRef: string, setores: string[]): Promise<PessoaSemSaida[]> {
  const { data: forns } = await supabaseAdmin.from('fornecedores').select('id, nome').eq('evento_id', eventoId).in('id', setores)
  const nomeSetor = new Map((forns ?? []).map(f => [f.id as string, (f.nome as string).trim()]))
  const funcs: { id: string; nome: string; fornecedor_id: string }[] = []
  for (const lote of emLotes([...nomeSetor.keys()], 100)) {
    funcs.push(...await buscarTudo<{ id: string; nome: string; fornecedor_id: string }>((de, ate) => supabaseAdmin.from('funcionarios')
      .select('id, nome, fornecedor_id').in('fornecedor_id', lote).order('id').range(de, ate)))
  }
  const porId = new Map(funcs.map(f => [f.id, f]))
  const regs = await buscarTudo<{ funcionario_id: string; tipo: string; created_at: string }>((de, ate) => supabaseAdmin.from('registros')
    .select('funcionario_id, tipo, created_at').eq('evento_id', eventoId).eq('data_ref', dataRef).in('tipo', ['entrada', 'fim'])
    .order('id').range(de, ate))
  const entrada = new Map<string, string>(), saiu = new Set<string>()
  for (const r of regs) {
    if (!porId.has(r.funcionario_id)) continue
    if (r.tipo === 'entrada') entrada.set(r.funcionario_id, r.created_at)
    else saiu.add(r.funcionario_id)
  }
  return [...entrada.entries()]
    .filter(([id]) => !saiu.has(id))
    .map(([id, entradaISO]) => { const f = porId.get(id)!; return { id, nome: f.nome.trim(), setor: nomeSetor.get(f.fornecedor_id) ?? '', entradaISO } })
    .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
}

async function setoresDoPedido(eventoId: string, escopo: Extract<Escopo, { ok: true }>, fornecedorId?: string | null): Promise<string[] | { erro: string }> {
  if (fornecedorId) {
    if (escopo.setores && !escopo.setores.includes(fornecedorId)) return { erro: 'Você só fecha o dia da sua equipe.' }
    return [fornecedorId]
  }
  if (escopo.setores) return escopo.setores
  const { data } = await supabaseAdmin.from('fornecedores').select('id').eq('evento_id', eventoId)
  return (data ?? []).map(f => f.id as string)
}

/** A lista do modal: quem está sem saída no dia. */
export async function listarSemSaida(eventoId: string, dataRef: string, fornecedorId?: string | null): Promise<{ pessoas: PessoaSemSaida[] } | { erro: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef ?? '')) return { erro: 'Dia inválido.' }
  const escopo = await escopoDoFechamento(eventoId)
  if (!escopo.ok) return { erro: escopo.erro }
  const setores = await setoresDoPedido(eventoId, escopo, fornecedorId)
  if ('erro' in setores) return setores
  return { pessoas: await semSaida(eventoId, dataRef, setores) }
}

/**
 * Lança a saída de quem está aberto. Pula (e conta) quem já ganhou saída nesse meio-tempo e quem entrou DEPOIS do
 * horário escolhido. Uma linha de auditoria por pessoa.
 */
export async function fecharDiaDaEquipe(p: {
  eventoId: string
  dataRef: string
  fornecedorId?: string | null
  /** 'AAAA-MM-DDTHH:mm' (horário de Brasília), como o input. */
  quandoLocal: string
  motivo: string
  funcionarioIds: string[]
}): Promise<{ ok: true; lancadas: number; puladas: { nome: string; porque: string }[] } | { erro: string }> {
  const motivo = (p.motivo ?? '').trim()
  if (motivo.length < 5) return { erro: 'Escreva o motivo — é ele que sustenta as saídas numa conferência.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dataRef ?? '')) return { erro: 'Dia inválido.' }
  const quandoISO = inputParaISO(p.quandoLocal)
  if (!quandoISO || Number.isNaN(new Date(quandoISO).getTime())) return { erro: 'Informe a data e a hora da saída.' }
  const quando = new Date(quandoISO).getTime()
  if (quando > Date.now() + 5 * 60_000) return { erro: 'A saída não pode ficar no futuro.' }
  const inicioDoDia = new Date(`${p.dataRef}T00:00:00-03:00`).getTime()
  if (quando - inicioDoDia < 0 || quando - inicioDoDia > 36 * 3600_000) {
    return { erro: `O horário precisa estar entre o dia ${p.dataRef.split('-').reverse().join('/')} e a madrugada seguinte.` }
  }
  if (!p.funcionarioIds?.length) return { erro: 'Escolha pelo menos uma pessoa.' }

  const escopo = await escopoDoFechamento(p.eventoId)
  if (!escopo.ok) return { erro: escopo.erro }
  const setores = await setoresDoPedido(p.eventoId, escopo, p.fornecedorId)
  if ('erro' in setores) return setores

  const { data: dia } = await supabaseAdmin.from('jornada_dias').select('id, cancelado').eq('evento_id', p.eventoId).eq('data', p.dataRef).order('turno').limit(1)
  if (!dia?.[0] || dia[0].cancelado) return { erro: 'Esse dia não é um dia de trabalho deste evento.' }

  // Conferido de novo agora: a lista do modal pode ter mudado (alguém bateu a saída no portão).
  const abertos = new Map((await semSaida(p.eventoId, p.dataRef, setores)).map(x => [x.id, x]))
  const puladas: { nome: string; porque: string }[] = []
  const linhas: Record<string, unknown>[] = []
  const lancadas: PessoaSemSaida[] = []
  for (const id of new Set(p.funcionarioIds)) {
    const pessoa = abertos.get(id)
    if (!pessoa) { puladas.push({ nome: '—', porque: 'já tem saída ou não é desta equipe' }); continue }
    if (new Date(pessoa.entradaISO).getTime() >= quando) {
      puladas.push({ nome: pessoa.nome, porque: `entrou às ${formatarBR(pessoa.entradaISO, 'hora')}, depois do horário escolhido` })
      continue
    }
    linhas.push({
      funcionario_id: id, evento_id: p.eventoId, tipo: 'fim', data_ref: p.dataRef, jornada_dia_id: dia[0].id,
      created_at: quandoISO, criado_por_perfil_id: escopo.perfil.id, registro_manual: true,
      justificativa: `Dia fechado pela equipe: ${motivo}`,
    })
    lancadas.push(pessoa)
  }
  for (let i = 0; i < linhas.length; i += 200) {
    // Nunca troca uma saída que já existe: se alguém bateu no portão neste meio-tempo, a dele fica.
    const { error } = await supabaseAdmin.from('registros')
      .upsert(linhas.slice(i, i + 200), { onConflict: 'funcionario_id,evento_id,tipo,data_ref', ignoreDuplicates: true })
    if (error) return { erro: `Não consegui lançar todas as saídas (${i} de ${linhas.length} gravadas). Abra de novo e confira.` }
  }

  after(async () => {
    for (const pessoa of lancadas) {
      await registrarAuditoria({
        perfil: escopo.perfil, acao: 'FECHAMENTO_DO_DIA', campoAlterado: 'Saída (fechar o dia da equipe)',
        valorAnterior: 'sem saída', valorNovo: formatarBR(quandoISO, 'curto'), motivo,
        funcionarioId: pessoa.id, eventoId: p.eventoId, organizacaoId: escopo.organizacaoId ?? undefined,
      })
    }
  })
  revalidatePath(`/admin/eventos/${p.eventoId}/presenca`)
  for (const s of setores) revalidatePath(`/admin/eventos/${p.eventoId}/fornecedor/${s}`)
  return { ok: true, lancadas: lancadas.length, puladas }
}
