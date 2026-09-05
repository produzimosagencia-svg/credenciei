import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase-server'

const PREFIXO = 'cadastro_individual:'
const VALIDADE_MS = 48 * 60 * 60 * 1000
const VALIDADE_ANTIGA_MS = 7 * 24 * 60 * 60 * 1000

type EstadoAutorizacao = {
  evento_id: string
  fornecedor_id: string
  criado_em?: string
  expira_em: string
  usado_em?: string | null
}

export type AutorizacaoCadastroIndividual = {
  valido: boolean
  eventoId?: string
  fornecedorId?: string
  motivo?: 'invalido' | 'expirado'
}

function chaveDoToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null
  const hash = createHash('sha256').update(token).digest('hex')
  return `${PREFIXO}${hash}`
}

async function buscarEstado(token: string): Promise<{ chave: string; estado: EstadoAutorizacao } | null> {
  const chave = chaveDoToken(token)
  if (!chave) return null

  const { data } = await supabaseAdmin
    .from('sistema_estado')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle()

  if (!data?.valor) return null
  return { chave, estado: data.valor as EstadoAutorizacao }
}

/**
 * Cria uma exceção temporária de setor sem reabrir o link público do evento.
 *
 * Só o hash do segredo fica no banco. Evento e setor ficam presos ao segredo
 * no servidor; o link libera cadastros naquele setor durante 48 horas.
 */
export async function criarAutorizacaoCadastroIndividual(params: {
  eventoId: string
  fornecedorId: string
}): Promise<{ token: string; expiraEm: string }> {
  const token = randomBytes(32).toString('base64url')
  const chave = chaveDoToken(token)!
  const criadoEm = new Date()
  const expiraEm = new Date(criadoEm.getTime() + VALIDADE_MS).toISOString()
  const estado: EstadoAutorizacao = {
    evento_id: params.eventoId,
    fornecedor_id: params.fornecedorId,
    criado_em: criadoEm.toISOString(),
    expira_em: expiraEm,
  }

  const { error } = await supabaseAdmin.from('sistema_estado').insert({ chave, valor: estado })
  if (error) throw new Error(`Não foi possível criar o link individual: ${error.message}`)

  return { token, expiraEm }
}

export async function consultarAutorizacaoCadastroIndividual(token: string): Promise<AutorizacaoCadastroIndividual> {
  const autorizacao = await buscarEstado(token)
  if (!autorizacao) return { valido: false, motivo: 'invalido' }

  /*
   * Compatibilidade com os links criados antes desta mudança: eles não
   * guardavam `criado_em`, mas `expira_em` era exatamente criação + 7 dias.
   * Assim recuperamos o instante original e aplicamos as mesmas 48 horas,
   * inclusive ao link que já tinha sido marcado como usado após o primeiro
   * cadastro.
   */
  const expiraAntigoEm = new Date(autorizacao.estado.expira_em).getTime()
  const criadoEm = autorizacao.estado.criado_em
    ? new Date(autorizacao.estado.criado_em).getTime()
    : expiraAntigoEm - VALIDADE_ANTIGA_MS
  const expiraEm = autorizacao.estado.criado_em
    ? expiraAntigoEm
    : criadoEm + VALIDADE_MS

  if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) {
    return { valido: false, motivo: 'expirado' }
  }

  return {
    valido: true,
    eventoId: autorizacao.estado.evento_id,
    fornecedorId: autorizacao.estado.fornecedor_id,
  }
}
