import 'server-only'
import { supabaseAdmin, buscarTudo, diaDoTurno } from './supabase-server'
import { emLotes } from './lotes'
import { escalasDosFuncionarios } from './escala'
import { statusCredenciamentoValido } from './credenciamento-constantes'
import {
  cpfMascarado, temPermissaoEncarregado,
  type ContextoDoSetor, type PermissaoEncarregado,
} from './encarregado'

/**
 * O que o Encarregado enxerga — SÓ LEITURA, SÓ o setor dele.
 *
 * Tudo aqui parte de UM ponto de verdade: o vínculo em `encarregados_setor`.
 * Nenhuma função recebe um id de setor "de confiança" vindo da tela sem antes
 * conferir o vínculo (`exigirVinculo`) — é o que impede abrir, trocando o
 * endereço à mão, o setor do lado.
 *
 * O vínculo só vale enquanto a pessoa continua na equipe: desativada,
 * descredenciada ou com credenciamento que deixou de ser aprovado, o acesso
 * para de funcionar na hora, sem ninguém precisar lembrar de removê-lo.
 */

export type VinculoDoEncarregado = ContextoDoSetor & {
  vinculoId: string
  funcionarioId: string
  permissoes: string[]
}

type LinhaVinculo = {
  id: string; fornecedor_id: string; funcionario_id: string; permissoes: string[] | null
  funcionarios: { ativo: boolean | null; status_credenciamento: string | null; descredenciado_em: string | null } | null
  fornecedores: {
    id: string; nome: string; evento_id: string
    subeventos: { nome: string } | null
    eventos: { nome: string; ativo: boolean | null } | null
  } | null
}

function vinculoValido(l: LinhaVinculo): boolean {
  const f = l.funcionarios
  return !!f && f.ativo !== false && !f.descredenciado_em && f.status_credenciamento === 'aprovado' && !!l.fornecedores
}

function paraVinculo(l: LinhaVinculo): VinculoDoEncarregado {
  const forn = l.fornecedores!
  return {
    vinculoId: l.id, funcionarioId: l.funcionario_id, permissoes: l.permissoes ?? [],
    fornecedorId: forn.id, setor: forn.nome, eventoId: forn.evento_id,
    evento: forn.eventos?.nome ?? 'Evento', subevento: forn.subeventos?.nome ?? null,
  }
}

const SELECT_VINCULO =
  'id, fornecedor_id, funcionario_id, permissoes, ' +
  'funcionarios(ativo, status_credenciamento, descredenciado_em), ' +
  'fornecedores(id, nome, evento_id, subeventos(nome), eventos(nome, ativo))'

/** Os setores em que esta conta é Encarregado (só os vínculos ainda válidos). */
export async function vinculosDoEncarregado(perfilId: string): Promise<VinculoDoEncarregado[]> {
  const { data, error } = await supabaseAdmin
    .from('encarregados_setor').select(SELECT_VINCULO).eq('perfil_id', perfilId)
  if (error || !data) return []
  return (data as unknown as LinhaVinculo[])
    .filter(vinculoValido).map(paraVinculo)
    .sort((a, b) => caminho(a).localeCompare(caminho(b), 'pt-BR'))
}

const caminho = (v: ContextoDoSetor) => [v.evento, v.subevento, v.setor].filter(Boolean).join(' › ')

/** O vínculo desta conta com ESTE setor, ou null. É a trava de todas as telas de consulta. */
export async function exigirVinculo(perfilId: string, fornecedorId: string): Promise<VinculoDoEncarregado | null> {
  const { data } = await supabaseAdmin
    .from('encarregados_setor').select(SELECT_VINCULO)
    .eq('perfil_id', perfilId).eq('fornecedor_id', fornecedorId).maybeSingle()
  const linha = data as unknown as LinhaVinculo | null
  return linha && vinculoValido(linha) ? paraVinculo(linha) : null
}

export type PessoaDaEquipe = {
  id: string
  nome: string
  cargo: string | null
  empresa: string | null
  status: 'aprovado' | 'pendente' | 'negado'
  ativo: boolean
  /** Só com `ver_contato`; senão o CPF vem mascarado e o telefone vazio. */
  cpf: string
  telefone: string | null
  entrada: string | null
  meio: string | null
  fim: string | null
  /** Dias de trabalho aprovados pro supervisor (escala por dia). Vazio fora desse fluxo. */
  diasAprovados: string[]
}

export type EquipeParaConsulta = {
  dia: string
  pessoas: PessoaDaEquipe[]
  resumo: { total: number; aprovados: number; pendentes: number; presentes: number; meio: number; saidas: number }
  veContato: boolean
  veEscala: boolean
}

/** A equipe do setor com a presença do dia — leitura pura. */
export async function carregarEquipeParaConsulta(v: VinculoDoEncarregado): Promise<EquipeParaConsulta> {
  const veContato = temPermissaoEncarregado(v.permissoes, 'ver_contato' satisfies PermissaoEncarregado)
  const [equipe, dia] = await Promise.all([
    buscarTudo((de, ate) =>
      supabaseAdmin.from('funcionarios')
        .select('id, nome, cpf, telefone, cargo, empresa, ativo, status_credenciamento, descredenciado_em')
        .eq('fornecedor_id', v.fornecedorId).order('nome').order('id').range(de, ate)),
    diaDoTurno(v.eventoId),
  ])
  const ids = equipe.map(f => f.id as string)

  const registros: { funcionario_id: string; tipo: string; created_at: string }[] = []
  for (const lote of emLotes(ids, 200)) {
    const parte = await buscarTudo<{ funcionario_id: string; tipo: string; created_at: string }>((de, ate) =>
      supabaseAdmin.from('registros').select('funcionario_id, tipo, created_at')
        .eq('evento_id', v.eventoId).eq('data_ref', dia).in('funcionario_id', lote)
        .order('id').range(de, ate))
    registros.push(...parte)
  }
  const porPessoa = new Map<string, Record<string, string>>()
  for (const r of registros) {
    const m = porPessoa.get(r.funcionario_id) ?? {}
    m[r.tipo] = r.created_at
    porPessoa.set(r.funcionario_id, m)
  }

  const escalas = await escalasDosFuncionarios(ids)
  const pessoas: PessoaDaEquipe[] = equipe
    // Quem saiu da equipe (descredenciado) não é mais "a equipe".
    .filter(f => !f.descredenciado_em)
    .map(f => {
      const p = porPessoa.get(f.id as string) ?? {}
      const esc = escalas.get(f.id as string)
      return {
        id: f.id as string,
        nome: f.nome as string,
        cargo: (f.cargo as string | null) ?? null,
        empresa: (f.empresa as string | null) ?? null,
        status: statusCredenciamentoValido(f.status_credenciamento as string),
        ativo: f.ativo !== false,
        cpf: veContato ? ((f.cpf as string) ?? '') : cpfMascarado(f.cpf as string),
        telefone: veContato ? ((f.telefone as string | null) ?? null) : null,
        entrada: p.entrada ?? null, meio: p.meio ?? null, fim: p.fim ?? null,
        diasAprovados: (esc?.dias ?? []).filter(d => d.aprovado).map(d => d.data),
      }
    })

  const ativos = pessoas.filter(p => p.status === 'aprovado' && p.ativo)
  return {
    dia, pessoas, veContato,
    veEscala: pessoas.some(p => p.diasAprovados.length > 0),
    resumo: {
      total: pessoas.length,
      aprovados: ativos.length,
      pendentes: pessoas.filter(p => p.status === 'pendente').length,
      presentes: ativos.filter(p => p.entrada).length,
      meio: ativos.filter(p => p.meio).length,
      saidas: ativos.filter(p => p.fim).length,
    },
  }
}
