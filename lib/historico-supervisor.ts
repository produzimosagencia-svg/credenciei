import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import {
  montarHistorico, type FichaDoHistorico, type EquipeDoHistorico, type FichaNoEventoNovo, type PessoaDoHistoricoNoServidor,
} from './historico-supervisor-regras'

/**
 * MONTE SUA EQUIPE — a leitura no banco (as regras estão em lib/historico-supervisor-regras.ts).
 *
 * O histórico é DERIVADO, sem tabela nova: `supervisor_setores` (equipes que o supervisor teve, inclusive em eventos
 * encerrados) → `funcionarios` dessas equipes → batidas (`registros`) → aceite (`base_pessoas`). Contas diferentes
 * com o mesmo CPF de supervisor contam como a mesma pessoa.
 *
 * Toda consulta por lista de ids vai em lotes (a URL do `.in()` estoura com milhares) e paginada (1000 por resposta).
 */
export async function historicoParaEquipe(args: {
  eventoId: string
  fornecedorId: string
  organizacaoId: string | null
  supervisorIds: string[]
}): Promise<{ pessoas: PessoaDoHistoricoNoServidor[]; ocultasSemAceite: number }> {
  const vazio = { pessoas: [], ocultasSemAceite: 0 }
  if (!args.supervisorIds.length) return vazio

  // As contas do mesmo supervisor (mesmo CPF).
  const { data: contas } = await supabaseAdmin.from('perfis').select('id, cpf').in('id', args.supervisorIds)
  const cpfsDosSupervisores = [...new Set((contas ?? []).map(c => String(c.cpf ?? '').replace(/\D/g, '')).filter(c => c.length === 11))]
  const ids = new Set(args.supervisorIds)
  if (cpfsDosSupervisores.length) {
    const { data: mesmas } = await supabaseAdmin.from('perfis').select('id').in('cpf', cpfsDosSupervisores)
    for (const m of mesmas ?? []) ids.add(m.id as string)
  }

  const vinculos = await buscarTudo<{ fornecedor_id: string }>((de, ate) => supabaseAdmin
    .from('supervisor_setores').select('fornecedor_id').in('perfil_id', [...ids]).order('fornecedor_id').range(de, ate) as never)
  const idsDasEquipes = [...new Set(vinculos.map(v => v.fornecedor_id))]
  if (!idsDasEquipes.length) return vazio

  // As equipes e os eventos delas — fora as do PRÓPRIO evento novo (histórico é o que veio antes).
  const equipes = new Map<string, EquipeDoHistorico>()
  for (const lote of emLotes(idsDasEquipes, 100)) {
    const { data } = await supabaseAdmin.from('fornecedores')
      .select('id, nome, evento_id, eventos!inner(id, nome, data_inicio, organizacao_id)').in('id', lote)
    for (const f of data ?? []) {
      const e = f.eventos as unknown as { id: string; nome: string; data_inicio: string | null; organizacao_id: string | null }
      if (!e || e.id === args.eventoId) continue
      equipes.set(f.id as string, {
        id: f.id as string, nome: String(f.nome ?? '').trim(), eventoId: e.id, eventoNome: e.nome,
        eventoData: e.data_inicio, organizacaoId: e.organizacao_id,
      })
    }
  }
  if (!equipes.size) return vazio

  type LinhaFicha = {
    id: string; cpf: string | null; nome: string | null; cargo: string | null; cidade: string | null; telefone: string | null
    chave_pix: string | null; foto_perfil_path: string | null; fornecedor_id: string; created_at: string
    consentimento_base: boolean | null; origem: string | null; status_credenciamento: string | null
  }
  const linhas: LinhaFicha[] = []
  for (const lote of emLotes([...equipes.keys()], 100)) {
    linhas.push(...await buscarTudo<LinhaFicha>((de, ate) => supabaseAdmin.from('funcionarios')
      .select('id, cpf, nome, cargo, cidade, telefone, chave_pix, foto_perfil_path, fornecedor_id, created_at, consentimento_base, origem, status_credenciamento')
      .in('fornecedor_id', lote).order('id').range(de, ate) as never))
  }
  // Fora: o crachá do próprio supervisor e quem teve o credenciamento negado.
  const fichas: FichaDoHistorico[] = linhas
    .filter(f => f.origem !== 'supervisor' && f.status_credenciamento !== 'negado')
    .map(f => ({
      id: f.id, cpf: String(f.cpf ?? ''), nome: String(f.nome ?? '').trim(), cargo: f.cargo, cidade: f.cidade, telefone: f.telefone,
      chavePix: f.chave_pix, fotoPath: f.foto_perfil_path, fornecedorId: f.fornecedor_id, criadoEm: f.created_at,
      consentimento: f.consentimento_base === true,
    }))
  if (!fichas.length) return vazio

  // Dias trabalhados de cada ficha (dias com entrada).
  const diasPorFicha = new Map<string, number>()
  for (const lote of emLotes(fichas.map(f => f.id), 150)) {
    const batidas = await buscarTudo<{ funcionario_id: string; data_ref: string | null }>((de, ate) => supabaseAdmin.from('registros')
      .select('funcionario_id, data_ref').in('funcionario_id', lote).eq('tipo', 'entrada').order('id').range(de, ate) as never)
    const dias = new Map<string, Set<string>>()
    for (const b of batidas) {
      if (!b.data_ref) continue
      if (!dias.has(b.funcionario_id)) dias.set(b.funcionario_id, new Set())
      dias.get(b.funcionario_id)!.add(b.data_ref)
    }
    for (const [id, s] of dias) diasPorFicha.set(id, s.size)
  }

  const cpfs = [...new Set(fichas.map(f => f.cpf.replace(/\D/g, '')).filter(c => c.length === 11))]
  const consentimentoNaBase = new Map<string, boolean>()
  const noEventoNovo: FichaNoEventoNovo[] = []
  const bloqueados = new Set<string>()
  for (const lote of emLotes(cpfs, 150)) {
    const [base, noNovo, bloq] = await Promise.all([
      supabaseAdmin.from('base_pessoas').select('cpf, consentimento_base').in('cpf', lote),
      supabaseAdmin.from('funcionarios').select('cpf, fornecedor_id, descredenciado_em, fornecedores!inner(nome, evento_id)')
        .eq('fornecedores.evento_id', args.eventoId).in('cpf', lote),
      supabaseAdmin.from('cpfs_bloqueados').select('cpf, fornecedor_id').eq('evento_id', args.eventoId).in('cpf', lote),
    ])
    for (const b of base.data ?? []) consentimentoNaBase.set(String(b.cpf), b.consentimento_base === true)
    for (const f of noNovo.data ?? []) {
      noEventoNovo.push({
        cpf: String(f.cpf), fornecedor_id: f.fornecedor_id as string, descredenciado_em: (f.descredenciado_em as string | null) ?? null,
        equipe: String((f.fornecedores as unknown as { nome?: string } | null)?.nome ?? '').trim(),
      })
    }
    // Tolerante: sem a tabela de bloqueio (migração pendente), ninguém está bloqueado — igual a `cpfEstaBloqueado`.
    for (const b of bloq.error ? [] : (bloq.data ?? [])) {
      if (b.fornecedor_id === null || b.fornecedor_id === args.fornecedorId) bloqueados.add(String(b.cpf).replace(/\D/g, ''))
    }
  }

  return montarHistorico({
    fichas, equipes, diasPorFicha, consentimentoNaBase, noEventoNovo, bloqueados,
    fornecedorAlvo: args.fornecedorId, organizacaoAlvo: args.organizacaoId,
  })
}

/** As fotos (só as que a regra deixou passar), em links de 1 hora — numa chamada só. */
export async function fotosDoHistorico(pessoas: PessoaDoHistoricoNoServidor[]): Promise<Map<string, string>> {
  const paths = [...new Set(pessoas.map(p => p.fotoPath).filter((p): p is string => !!p))]
  const urls = new Map<string, string>()
  for (const lote of emLotes(paths, 300)) {
    const { data } = await supabaseAdmin.storage.from('presencas').createSignedUrls(lote, 60 * 60)
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  return urls
}
