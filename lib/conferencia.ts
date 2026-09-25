import { supabaseAdmin } from './supabase-server'

/**
 * Conferência de equipe — LEITURA.
 *
 * A escrita (remover / confirmar) é em lib/actions-conferencia.ts. As checagens
 * de permissão moram em quem chama (a página e as actions): estas funções só
 * arrumam o dado, dado um id que já passou pela régua.
 *
 * ─── ABRE 1 DIA ANTES ───────────────────────────────────────────────────────
 *
 * `conferenciaAberta(data_inicio)` — a partir de 24h antes do começo do
 * evento. Antes disso a tela mostra "abre em…"; depois, continua aberta (não
 * fecha — melhor confirmar tarde do que não confirmar).
 */

/**
 * A conferência de equipe está DESLIGADA (pedido do Juan, 25/09/2026).
 *
 * Com a aprovação de credenciamento, ninguém entra no evento sem que alguém
 * autorize — conferir a equipe de novo um dia antes virou uma segunda
 * conferência da mesma coisa. Desligada por esta chave única, sem apagar
 * nada: o cron para de abrir conferência e mandar e-mail, o card do evento e
 * o aviso do supervisor somem, e as telas redirecionam. Religar = `true`.
 */
export const CONFERENCIA_EQUIPE_ATIVA = false

export const ANTECEDENCIA_MS = 24 * 60 * 60 * 1000

export function abreEm(dataInicioIso: string): Date {
  return new Date(new Date(dataInicioIso).getTime() - ANTECEDENCIA_MS)
}

export function conferenciaAberta(dataInicioIso: string, agora = new Date()): boolean {
  return agora.getTime() >= abreEm(dataInicioIso).getTime()
}

/** Quantos dias faltam pro evento começar (pode ser negativo). */
export function diasAteEvento(dataInicioIso: string, agora = new Date()): number {
  return (new Date(dataInicioIso).getTime() - agora.getTime()) / 86_400_000
}

export type MembroEquipe = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  cargo: string | null
}

export type ConferenciaSetor = {
  fornecedorId: string
  setorNome: string
  eventoId: string
  eventoNome: string
  dataInicio: string
  aberta: boolean
  abreEm: string
  status: 'pendente' | 'confirmada'
  confirmadaEm: string | null
  confirmadaPorNome: string | null
  totalMantidos: number | null
  totalRemovidos: number | null
  equipe: MembroEquipe[]
}

/** O estado da conferência de UM setor + a equipe atual dele. */
export async function estadoConferencia(fornecedorId: string): Promise<ConferenciaSetor | null> {
  const { data: setor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, nome, evento_id, eventos(nome, data_inicio)')
    .eq('id', fornecedorId)
    .maybeSingle()
  if (!setor) return null
  const evento = setor.eventos as unknown as { nome: string; data_inicio: string } | null
  if (!evento) return null

  const [{ data: conf }, { data: funcs }, { data: confirmador }] = await Promise.all([
    supabaseAdmin.from('conferencias_equipe').select('*').eq('fornecedor_id', fornecedorId).maybeSingle(),
    supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo')
      .eq('fornecedor_id', fornecedorId)
      .is('descredenciado_em', null)
      .neq('ativo', false)
      .order('nome'),
    Promise.resolve({ data: null as { nome: string } | null }),
  ])

  let confirmadaPorNome: string | null = null
  if (conf?.confirmada_por) {
    const { data: p } = await supabaseAdmin.from('perfis').select('nome').eq('id', conf.confirmada_por).maybeSingle()
    confirmadaPorNome = p?.nome ?? null
  }
  void confirmador

  return {
    fornecedorId,
    setorNome: setor.nome as string,
    eventoId: setor.evento_id as string,
    eventoNome: evento.nome,
    dataInicio: evento.data_inicio,
    aberta: conferenciaAberta(evento.data_inicio),
    abreEm: abreEm(evento.data_inicio).toISOString(),
    status: (conf?.status as 'pendente' | 'confirmada') ?? 'pendente',
    confirmadaEm: (conf?.confirmada_em as string | null) ?? null,
    confirmadaPorNome,
    totalMantidos: (conf?.total_mantidos as number | null) ?? null,
    totalRemovidos: (conf?.total_removidos as number | null) ?? null,
    equipe: (funcs ?? []).map(f => ({
      id: f.id as string,
      nome: f.nome as string,
      cpf: f.cpf as string,
      telefone: (f.telefone as string | null) ?? null,
      cargo: (f.cargo as string | null) ?? null,
    })),
  }
}

export type LinhaPainelConferencia = {
  fornecedorId: string
  setorNome: string
  supervisorNome: string | null
  temSupervisor: boolean
  status: 'pendente' | 'confirmada'
  confirmadaEm: string | null
  totalMantidos: number | null
  totalRemovidos: number | null
}

/** Pro painel do organizador: setor a setor, quem conferiu e quem falta. */
export async function conferenciasDoEvento(eventoId: string): Promise<LinhaPainelConferencia[]> {
  const { data: setores } = await supabaseAdmin
    .from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome')
  if (!setores?.length) return []
  const ids = setores.map(s => s.id as string)

  const [{ data: confs, error: erroConfs }, { data: sups }] = await Promise.all([
    supabaseAdmin.from('conferencias_equipe').select('*').in('fornecedor_id', ids),
    supabaseAdmin.from('perfis').select('nome, fornecedor_id').eq('role', 'supervisor').in('fornecedor_id', ids),
  ])
  // Migração pendente → esconde o painel em vez de mostrar tudo como "pendente".
  if (erroConfs) return []
  const confPorSetor = new Map((confs ?? []).map(c => [c.fornecedor_id as string, c]))
  const supPorSetor = new Map((sups ?? []).map(s => [s.fornecedor_id as string, s.nome as string]))

  return setores.map(s => {
    const c = confPorSetor.get(s.id as string)
    return {
      fornecedorId: s.id as string,
      setorNome: s.nome as string,
      supervisorNome: supPorSetor.get(s.id as string) ?? null,
      temSupervisor: supPorSetor.has(s.id as string),
      status: (c?.status as 'pendente' | 'confirmada') ?? 'pendente',
      confirmadaEm: (c?.confirmada_em as string | null) ?? null,
      totalMantidos: (c?.total_mantidos as number | null) ?? null,
      totalRemovidos: (c?.total_removidos as number | null) ?? null,
    }
  })
}

/** CSV da equipe de um setor — pro anexo do email e pro botão de baixar. */
export async function planilhaEquipeCsv(fornecedorId: string): Promise<string> {
  const { data: funcs } = await supabaseAdmin
    .from('funcionarios')
    .select('nome, cpf, telefone, cargo')
    .eq('fornecedor_id', fornecedorId)
    .is('descredenciado_em', null)
    .neq('ativo', false)
    .order('nome')

  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = [
    'Nome;CPF;Telefone;Função',
    ...(funcs ?? []).map(f => [f.nome, f.cpf, f.telefone, f.cargo].map(esc).join(';')),
  ]
  // BOM pro Excel abrir os acentos certos.
  return '﻿' + linhas.join('\r\n')
}
