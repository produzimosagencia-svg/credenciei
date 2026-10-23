'use server'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { podeEditarIdentidade } from './permissions'
import { suporteTemEscopo } from './suporte'
import { statusCredenciamentoValido } from './credenciamento-constantes'
import { rotulosDoAlerta, foiEnviadaDepois } from './alerta-batida'
import { estadosNaMeta, statusDaMensagem } from './credencial-whatsapp'
import { telefoneValido } from './telefone'
import { mensagemAmigavel } from './erros'
import {
  cpfDigitado, comoFoiBatida, resumirBatidas,
  type FichaDaConsulta, type BatidaDaConsulta, type PausaDaConsulta, type ApagadaDaConsulta, type AlteracaoDaConsulta, type MensagemDaConsulta,
} from './consulta-cpf-regras'

/*
 * CONSULTA POR CPF (Juan, 23/10/2026): tudo o que o sistema sabe de uma pessoa, em todos os eventos, numa tela só — as
 * fichas, as batidas (e QUEM lançou cada uma), as pausas, o que foi apagado, a auditoria e as mensagens de WhatsApp.
 * Só leitura. Para responder "ele bateu e não consta no sistema" em segundos, sem script.
 *
 * Quem consulta: master e suporte (a mesma régua de corrigir CPF, `podeEditarIdentidade`). O suporte vê só as fichas dos
 * eventos que estão no escopo dele (`suporteTemEscopo`) — e quando nada do CPF está no escopo, a resposta é a mesma de
 * "não achei", para não revelar que a pessoa existe em outro lugar.
 */

const LIMITE_DA_LISTA = 300

type LinhaDeFicha = {
  id: string; nome: string | null; cpf: string | null; telefone: string | null; cargo: string | null
  status_credenciamento: string | null; ativo: boolean | null; descredenciado_em: string | null; created_at: string; origem: string | null
  fornecedor_id: string
  fornecedores: {
    id?: string; nome: string; evento_id: string
    subeventos?: { nome?: string } | { nome?: string }[] | null
    eventos: { id: string; nome: string; data_inicio: string | null; ativo: boolean | null; organizacao_id: string | null } | { id: string; nome: string; data_inicio: string | null; ativo: boolean | null; organizacao_id: string | null }[] | null
  } | { id?: string; nome: string; evento_id: string; subeventos?: unknown; eventos: unknown }[] | null
}

const um = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export async function consultarPorCpf(
  texto: string,
): Promise<{ fichas: FichaDaConsulta[]; cpf: string; error?: undefined } | { fichas?: undefined; cpf?: undefined; error: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeEditarIdentidade(perfil)) return { error: 'Só o master e o suporte consultam por CPF.' }
    const cpf = cpfDigitado(texto)
    if (!cpf) return { error: 'Digite os 11 números do CPF.' }

    const { data: linhas, error: erroFichas } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, status_credenciamento, ativo, descredenciado_em, created_at, origem, fornecedor_id, fornecedores(id, nome, evento_id, subeventos(nome), eventos(id, nome, data_inicio, ativo, organizacao_id))')
      .eq('cpf', cpf)
    if (erroFichas) return { error: 'Não foi possível consultar agora. Tente de novo.' }

    // O suporte só enxerga o que está no escopo dele.
    const doEscopo: LinhaDeFicha[] = []
    for (const l of (linhas ?? []) as unknown as LinhaDeFicha[]) {
      const f = um(l.fornecedores) as { evento_id: string; eventos: unknown } | null
      const ev = um(f?.eventos as { id: string; organizacao_id: string | null } | null)
      if (!ev) continue
      if (perfil.role === 'suporte' && !(await suporteTemEscopo(perfil.id, { eventoId: ev.id, organizacaoId: ev.organizacao_id ?? undefined }))) continue
      doEscopo.push(l)
    }
    if (!doEscopo.length) return { fichas: [], cpf }

    const ids = doEscopo.map(l => l.id)
    const [batidas, pausas, apagadas, alteracoes, mensagens] = await Promise.all([
      carregarBatidas(ids), carregarPausas(ids), carregarApagadas(ids), carregarAlteracoes(ids), carregarMensagens(ids),
    ])

    const fichas: FichaDaConsulta[] = doEscopo.map(l => {
      const f = um(l.fornecedores) as { id?: string; nome: string; subeventos?: unknown; eventos: unknown }
      const ev = um(f.eventos as { id: string; nome: string; data_inicio: string | null; ativo: boolean | null })!
      const doFunc = batidas.get(l.id) ?? []
      return {
        id: l.id,
        nome: (l.nome ?? '').trim(),
        cpf: l.cpf ?? cpf,
        telefone: l.telefone ?? null,
        telefoneValido: telefoneValido(l.telefone),
        cargo: l.cargo ?? null,
        situacao: statusCredenciamentoValido(l.status_credenciamento as string),
        ativo: l.ativo !== false,
        baixaEm: l.descredenciado_em ?? null,
        criadaEm: l.created_at,
        origem: l.origem ?? null,
        evento: { id: ev.id, nome: ev.nome, dataInicio: ev.data_inicio ?? null, ativo: ev.ativo !== false },
        fornecedor: { id: f.id ?? l.fornecedor_id, nome: f.nome, area: (um(f.subeventos as { nome?: string } | { nome?: string }[] | null)?.nome ?? '').trim() || null },
        batidas: doFunc,
        pausas: pausas.get(l.id) ?? [],
        apagadas: apagadas.get(l.id) ?? [],
        alteracoes: alteracoes.get(l.id) ?? [],
        mensagens: mensagens.get(l.id) ?? [],
        resumo: resumirBatidas(doFunc),
      }
    })
    // O evento mais recente primeiro.
    fichas.sort((a, b) => (b.evento.dataInicio ?? '').localeCompare(a.evento.dataInicio ?? ''))
    return { fichas, cpf }
  } catch (e) {
    console.error('[consultarPorCpf]', e)
    return { error: mensagemAmigavel(e) }
  }
}

async function nomesDosPerfis(ids: (string | null | undefined)[]): Promise<Map<string, { nome: string; papel: string }>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))]
  const mapa = new Map<string, { nome: string; papel: string }>()
  if (!unicos.length) return mapa
  const { data } = await supabaseAdmin.from('perfis').select('id, nome, role').in('id', unicos)
  for (const p of data ?? []) mapa.set(p.id as string, { nome: (p.nome as string) ?? '', papel: (p.role as string) ?? '' })
  return mapa
}

async function carregarBatidas(ids: string[]): Promise<Map<string, BatidaDaConsulta[]>> {
  type Linha = {
    id: string; funcionario_id: string; tipo: string; data_ref: string | null; created_at: string; registro_manual: boolean | null
    justificativa: string | null; criado_por_perfil_id: string | null; foto_url: string | null; fora_do_local: boolean | null
    alerta?: string | null; recebido_em?: string | null
  }
  // Tolerante: sem as colunas novas (SQL não rodado), lê as antigas.
  const colunas = [
    'id, funcionario_id, tipo, data_ref, created_at, registro_manual, justificativa, criado_por_perfil_id, foto_url, fora_do_local, alerta, recebido_em',
    'id, funcionario_id, tipo, data_ref, created_at, registro_manual, justificativa, criado_por_perfil_id, foto_url, fora_do_local',
    'id, funcionario_id, tipo, data_ref, created_at',
  ]
  let linhas: Linha[] = []
  for (const c of colunas) {
    const { data, error } = await supabaseAdmin.from('registros').select(c).in('funcionario_id', ids).order('created_at').limit(LIMITE_DA_LISTA * ids.length)
    if (!error) { linhas = (data ?? []) as unknown as Linha[]; break }
  }
  const quem = await nomesDosPerfis(linhas.map(l => l.criado_por_perfil_id))
  const mapa = new Map<string, BatidaDaConsulta[]>()
  for (const l of linhas) {
    if (l.tipo !== 'entrada' && l.tipo !== 'meio' && l.tipo !== 'fim') continue
    const por = l.criado_por_perfil_id ? quem.get(l.criado_por_perfil_id) : undefined
    const b: BatidaDaConsulta = {
      id: l.id, tipo: l.tipo, dataRef: l.data_ref, quandoISO: l.created_at,
      como: comoFoiBatida(l), porNome: por?.nome ?? null, porPapel: por?.papel ?? null,
      foto: !!l.foto_url, foraDoLocal: l.fora_do_local ?? null,
      alertas: rotulosDoAlerta(l.alerta), semInternet: foiEnviadaDepois(l.created_at, l.recebido_em),
      justificativa: (l.justificativa ?? '').trim() || null,
    }
    mapa.set(l.funcionario_id, [...(mapa.get(l.funcionario_id) ?? []), b])
  }
  return mapa
}

async function carregarPausas(ids: string[]): Promise<Map<string, PausaDaConsulta[]>> {
  const { data } = await supabaseAdmin.from('pausas_turno')
    .select('funcionario_id, data_ref, saiu_em, voltou_em, origem, registrado_por').in('funcionario_id', ids).order('saiu_em')
  const quem = await nomesDosPerfis((data ?? []).map(p => p.registrado_por as string | null))
  const mapa = new Map<string, PausaDaConsulta[]>()
  for (const p of data ?? []) {
    const item: PausaDaConsulta = {
      dataRef: p.data_ref as string, saiuEm: p.saiu_em as string, voltouEm: p.voltou_em as string,
      origem: (p.origem as string | null) ?? null, porNome: p.registrado_por ? (quem.get(p.registrado_por as string)?.nome ?? null) : null,
    }
    mapa.set(p.funcionario_id as string, [...(mapa.get(p.funcionario_id as string) ?? []), item])
  }
  return mapa
}

async function carregarApagadas(ids: string[]): Promise<Map<string, ApagadaDaConsulta[]>> {
  const { data } = await supabaseAdmin.from('registros_apagados').select('funcionario_id, dados, apagado_em').in('funcionario_id', ids).order('apagado_em')
  const mapa = new Map<string, ApagadaDaConsulta[]>()
  for (const a of data ?? []) {
    const d = (a.dados ?? {}) as { tipo?: string; data_ref?: string | null; created_at?: string | null; justificativa?: string | null }
    const item: ApagadaDaConsulta = {
      tipo: d.tipo ?? '?', dataRef: d.data_ref ?? null, quandoISO: d.created_at ?? null,
      apagadaEm: a.apagado_em as string, justificativa: (d.justificativa ?? '').trim() || null,
    }
    mapa.set(a.funcionario_id as string, [...(mapa.get(a.funcionario_id as string) ?? []), item])
  }
  return mapa
}

async function carregarAlteracoes(ids: string[]): Promise<Map<string, AlteracaoDaConsulta[]>> {
  const { data } = await supabaseAdmin.from('alteracoes_cadastro')
    .select('funcionario_id, created_at, usuario_responsavel, acao, campo_alterado, valor_anterior, valor_novo, motivo')
    .in('funcionario_id', ids).order('created_at').limit(LIMITE_DA_LISTA * ids.length)
  const mapa = new Map<string, AlteracaoDaConsulta[]>()
  for (const a of data ?? []) {
    const item: AlteracaoDaConsulta = {
      quando: a.created_at as string, quem: (a.usuario_responsavel as string | null) ?? null, acao: a.acao as string,
      campo: (a.campo_alterado as string | null) ?? null, antes: (a.valor_anterior as string | null) ?? null,
      depois: (a.valor_novo as string | null) ?? null, motivo: (a.motivo as string | null) ?? null,
    }
    mapa.set(a.funcionario_id as string, [...(mapa.get(a.funcionario_id as string) ?? []), item])
  }
  return mapa
}

async function carregarMensagens(ids: string[]): Promise<Map<string, MensagemDaConsulta[]>> {
  const { data } = await supabaseAdmin.from('mensagens_agendadas')
    .select('funcionario_id, tipo, status, erro, enviado_em, created_at, telefone, evolution_message_id')
    .in('funcionario_id', ids).order('created_at', { ascending: false }).limit(100)
  const estados = await estadosNaMeta((data ?? []).map(m => m.evolution_message_id as string | null))
  const mapa = new Map<string, MensagemDaConsulta[]>()
  for (const m of data ?? []) {
    const item: MensagemDaConsulta = {
      tipo: m.tipo as string, quando: (m.enviado_em as string | null) ?? (m.created_at as string),
      status: statusDaMensagem(m.status as string | null, m.evolution_message_id ? estados.get(m.evolution_message_id as string) : undefined),
      erro: (m.erro as string | null) ?? null, telefone: (m.telefone as string | null) ?? null,
    }
    mapa.set(m.funcionario_id as string, [...(mapa.get(m.funcionario_id as string) ?? []), item])
  }
  return mapa
}
