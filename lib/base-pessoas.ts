import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'

/**
 * A BASE PERMANENTE de pessoas (pedido do Juan, 10/10/2026: "funcionário nenhum pode ser excluído da base").
 *
 * Uma linha por CPF, que só cresce — `base_pessoas` (supabase/upgrade-base-pessoas.sql), alimentada por um gatilho
 * em `funcionarios`. Excluir a pessoa de um evento (ou apagar o evento) não tira ela daqui.
 *
 * Tolerante: sem a tabela (SQL ainda não rodado), a base de quem saiu dos eventos vem da lixeira
 * (`funcionarios_excluidos`), que guarda a ficha inteira de cada exclusão.
 */
export type PessoaDaBase = {
  cpf: string
  nome: string
  telefone: string | null
  cidade: string | null
  cargo: string | null
  chavePix: string | null
  consentimento: boolean
  primeiroCadastro: string
  ultimoCadastro: string
}

const limpo = (c: unknown) => String(c ?? '').replace(/\D/g, '')
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Toda a base, sem teto (paginada de 1000 em 1000). */
export async function lerBasePessoas(): Promise<PessoaDaBase[]> {
  try {
    const linhas = await buscarTudo<Record<string, unknown>>((de, ate) =>
      supabaseAdmin.from('base_pessoas').select('*').order('cpf').range(de, ate))
    return linhas.map(l => ({
      cpf: limpo(l.cpf), nome: String(l.nome ?? ''), telefone: texto(l.telefone), cidade: texto(l.cidade),
      cargo: texto(l.cargo), chavePix: texto(l.chave_pix), consentimento: l.consentimento_base === true,
      primeiroCadastro: String(l.primeiro_cadastro ?? ''), ultimoCadastro: String(l.ultimo_cadastro ?? ''),
    }))
  } catch {
    return await daLixeira()
  }
}

/** Uma pessoa da base pelo CPF (null = nunca esteve em evento nenhum). */
export async function pessoaDaBase(cpf: string): Promise<PessoaDaBase | null> {
  const digitos = limpo(cpf)
  if (digitos.length !== 11) return null
  const { data, error } = await supabaseAdmin.from('base_pessoas').select('*').eq('cpf', digitos).maybeSingle()
  if (!error) {
    if (!data) return null
    const l = data as Record<string, unknown>
    return {
      cpf: digitos, nome: String(l.nome ?? ''), telefone: texto(l.telefone), cidade: texto(l.cidade),
      cargo: texto(l.cargo), chavePix: texto(l.chave_pix), consentimento: l.consentimento_base === true,
      primeiroCadastro: String(l.primeiro_cadastro ?? ''), ultimoCadastro: String(l.ultimo_cadastro ?? ''),
    }
  }
  return (await daLixeira(digitos))[0] ?? null
}

/** A base de quem saiu dos eventos, montada da lixeira — o mais recente de cada CPF. */
async function daLixeira(soCpf?: string): Promise<PessoaDaBase[]> {
  try {
    const linhas = await buscarTudo<{ cpf: string; nome: string; dados: Record<string, unknown>; excluido_em: string }>((de, ate) => {
      let q = supabaseAdmin.from('funcionarios_excluidos').select('cpf, nome, dados, excluido_em')
      if (soCpf) q = q.eq('cpf', soCpf)
      return q.order('excluido_em', { ascending: false }).order('id').range(de, ate)
    })
    const porCpf = new Map<string, PessoaDaBase>()
    for (const l of linhas) {
      const cpf = limpo(l.cpf)
      if (cpf.length !== 11) continue
      const d = l.dados ?? {}
      const criado = String(d.created_at ?? l.excluido_em)
      const atual = porCpf.get(cpf)
      if (!atual) {
        porCpf.set(cpf, {
          cpf, nome: String(l.nome ?? d.nome ?? ''), telefone: texto(d.telefone), cidade: texto(d.cidade),
          cargo: texto(d.cargo), chavePix: texto(d.chave_pix), consentimento: d.consentimento_base === true,
          primeiroCadastro: criado, ultimoCadastro: criado,
        })
      } else {
        if (criado < atual.primeiroCadastro) atual.primeiroCadastro = criado
        atual.telefone ??= texto(d.telefone)
        atual.cidade ??= texto(d.cidade)
        atual.cargo ??= texto(d.cargo)
        atual.chavePix ??= texto(d.chave_pix)
        if (d.consentimento_base === true) atual.consentimento = true
      }
    }
    return [...porCpf.values()]
  } catch {
    return []
  }
}
