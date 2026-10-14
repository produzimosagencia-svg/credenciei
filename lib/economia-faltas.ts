import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import { nomeBonito } from './relatorio-doc-fechamento'

/**
 * ECONOMIA COM FALTAS (Juan, 14/10/2026 — docs/economia-faltas-vital.pdf): quanto o evento deixou de pagar porque o
 * ponto mostrou quem não foi. A regra é a do modelo: cada pessoa CADASTRADA (e aprovada) numa equipe paga por pessoa
 * (as que batem o meio) que NÃO bateu nenhuma entrada no período × o valor médio da diária. A mesma conta vai na
 * primeira página da Entrega de valor, pra os dois PDFs nunca darem números diferentes.
 *
 * Quem tem baixa e nunca bateu não conta (saiu da equipe, não seria pago de qualquer jeito); pendente e negado também
 * não. A equipe é pelo NOME (o "Gatti - Segurança" do Bloco e o do Camarote são uma equipe só, como no modelo); a área
 * (subgrupo) vai em cada pessoa.
 */
export const VALOR_MEDIO_DIARIA = 200

export type EquipeDaEconomia = {
  nome: string
  cadastrados: number
  foram: number
  faltaram: number
  economia: number
  ausentes: { nome: string; area: string }[]
}

export type DadosEconomiaFaltas = {
  eventoNome: string
  periodo: { de: string; ate: string } | null
  valorDiaria: number
  equipes: EquipeDaEconomia[]
  cadastrados: number
  foram: number
  faltaram: number
  economia: number
}

export async function dadosEconomiaFaltas(eventoId: string): Promise<DadosEconomiaFaltas | null> {
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, nome').eq('id', eventoId).maybeSingle()
  if (!evento) return null

  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const [{ data: dias }, { data: forns, error }] = await Promise.all([
    supabaseAdmin.from('jornada_dias').select('data').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
    supabaseAdmin.from('fornecedores').select('id, nome, exige_meio, subeventos(nome)').eq('evento_id', eventoId),
  ])
  if (error) throw new Error(error.message)
  // Só o que já passou: num relatório tirado no meio do evento, quem ainda vai trabalhar não é falta.
  const datas = [...new Set((dias ?? []).map(d => d.data as string))].filter(d => d <= hoje).sort()
  const periodo = datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null

  const setores = (forns ?? []).filter(f => (f as { exige_meio?: boolean | null }).exige_meio === true)
  const setorPorId = new Map(setores.map(f => [f.id as string, {
    equipe: nomeBonito(f.nome as string),
    area: nomeBonito((f.subeventos as unknown as { nome?: string } | null)?.nome ?? ''),
  }]))

  type Func = { id: string; nome: string; fornecedor_id: string; status_credenciamento: string | null; descredenciado_em: string | null }
  const funcs: Func[] = []
  for (const lote of emLotes([...setorPorId.keys()], 100)) {
    funcs.push(...await buscarTudo<Func>((de, ate) => supabaseAdmin.from('funcionarios')
      .select('id, nome, fornecedor_id, status_credenciamento, descredenciado_em').in('fornecedor_id', lote).order('id').range(de, ate)))
  }

  const foram = new Set<string>()
  if (periodo) {
    const entradas = await buscarTudo<{ funcionario_id: string }>((de, ate) => supabaseAdmin.from('registros')
      .select('funcionario_id').eq('evento_id', eventoId).eq('tipo', 'entrada')
      .gte('data_ref', periodo.de).lte('data_ref', periodo.ate).order('id').range(de, ate))
    for (const r of entradas) foram.add(r.funcionario_id)
  }

  const porEquipe = new Map<string, EquipeDaEconomia>()
  for (const f of funcs) {
    const setor = setorPorId.get(f.fornecedor_id)
    if (!setor) continue
    const bateu = foram.has(f.id)
    const aprovado = f.status_credenciamento !== 'negado' && f.status_credenciamento !== 'pendente'
    if (!bateu && (!aprovado || f.descredenciado_em)) continue
    const chave = setor.equipe.toLocaleLowerCase('pt-BR')
    const e = porEquipe.get(chave) ?? { nome: setor.equipe, cadastrados: 0, foram: 0, faltaram: 0, economia: 0, ausentes: [] }
    e.cadastrados++
    if (bateu) e.foram++
    else { e.faltaram++; e.ausentes.push({ nome: f.nome.trim(), area: setor.area }) }
    porEquipe.set(chave, e)
  }

  const equipes = [...porEquipe.values()].map(e => ({
    ...e,
    economia: e.faltaram * VALOR_MEDIO_DIARIA,
    ausentes: e.ausentes.sort((a, b) => a.area.localeCompare(b.area, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')),
  })).sort((a, b) => b.faltaram - a.faltaram || b.cadastrados - a.cadastrados || a.nome.localeCompare(b.nome, 'pt-BR'))

  const soma = (k: 'cadastrados' | 'foram' | 'faltaram') => equipes.reduce((t, e) => t + e[k], 0)
  const faltaram = soma('faltaram')
  return {
    eventoNome: evento.nome as string,
    periodo,
    valorDiaria: VALOR_MEDIO_DIARIA,
    equipes,
    cadastrados: soma('cadastrados'),
    foram: soma('foram'),
    faltaram,
    economia: faltaram * VALOR_MEDIO_DIARIA,
  }
}
