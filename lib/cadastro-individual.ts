import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase-server'

const PREFIXO = 'cadastro_individual:'
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000

type EstadoAutorizacao = {
  evento_id: string
  fornecedor_id: string
  cpf: string
  expira_em: string
  usado_em: string | null
}

export type AutorizacaoCadastroIndividual = {
  valido: boolean
  eventoId?: string
  fornecedorId?: string
  cpf?: string
  motivo?: 'invalido' | 'expirado' | 'usado'
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
 * Cria uma exceção pessoal sem reabrir o link público do evento.
 *
 * Só o hash do segredo fica no banco. O CPF, o evento e o setor ficam presos
 * ao segredo no servidor; editar qualquer parâmetro visível da URL não muda a
 * pessoa autorizada.
 */
export async function criarAutorizacaoCadastroIndividual(params: {
  eventoId: string
  fornecedorId: string
  cpf: string
}): Promise<{ token: string; expiraEm: string }> {
  const token = randomBytes(32).toString('base64url')
  const chave = chaveDoToken(token)!
  const expiraEm = new Date(Date.now() + VALIDADE_MS).toISOString()
  const estado: EstadoAutorizacao = {
    evento_id: params.eventoId,
    fornecedor_id: params.fornecedorId,
    cpf: params.cpf,
    expira_em: expiraEm,
    usado_em: null,
  }

  const { error } = await supabaseAdmin.from('sistema_estado').insert({ chave, valor: estado })
  if (error) throw new Error(`Não foi possível criar o link individual: ${error.message}`)

  return { token, expiraEm }
}

export async function consultarAutorizacaoCadastroIndividual(token: string): Promise<AutorizacaoCadastroIndividual> {
  const autorizacao = await buscarEstado(token)
  if (!autorizacao) return { valido: false, motivo: 'invalido' }
  if (autorizacao.estado.usado_em) return { valido: false, motivo: 'usado' }
  if (new Date(autorizacao.estado.expira_em).getTime() <= Date.now()) {
    return { valido: false, motivo: 'expirado' }
  }

  return {
    valido: true,
    eventoId: autorizacao.estado.evento_id,
    fornecedorId: autorizacao.estado.fornecedor_id,
    cpf: autorizacao.estado.cpf,
  }
}

/** Marca a exceção como usada somente depois que o cadastro termina. */
export async function consumirAutorizacaoCadastroIndividual(token: string): Promise<void> {
  const autorizacao = await buscarEstado(token)
  if (!autorizacao || autorizacao.estado.usado_em) return

  const usadoEm = new Date().toISOString()
  await supabaseAdmin
    .from('sistema_estado')
    .update({
      valor: { ...autorizacao.estado, usado_em: usadoEm },
      atualizado_em: usadoEm,
    })
    .eq('chave', autorizacao.chave)
    .is('valor->>usado_em', null)
}
