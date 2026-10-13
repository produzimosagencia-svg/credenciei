import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import { relatorioForaDoLocal } from './alertas-local'
import { cadastrosSoNaLixeira } from './lixeira'

/**
 * Os números do "PDF de entrega de valor" (pedido do Juan, 09/10/2026): o que o Credenciei entregou no evento do
 * cliente — quantas pessoas foram controladas, quantas entraram e saíram certo, quantas tentativas o sistema
 * barrou. Tudo contado do banco, nada estimado: se um número não existe, ele sai zero, nunca inventado.
 */
export type DadosEntregaValor = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string | null
  periodo: { de: string; ate: string } | null
  diasDeOperacao: number
  fornecedores: number
  supervisores: number
  cadastros: { total: number; aprovados: number; negados: number; aguardando: number; tirados: number }
  presenca: {
    pessoasQueTrabalharam: number
    turnos: number
    completos: number
    soEntrada: number
    saidaSemEntrada: number
    percentualCompletos: number
    horasRegistradas: number
    batidas: number
    regularizadasPelaEquipe: number
    peloCelular: number
  }
  seguranca: {
    leiturasNoPortao: number
    barradasNoPortao: number
    qrInvalidoOuSemCadastro: number
    foraDoDiaOuLotado: number
    tentativasForaDoLocal: number
    batidasForaDoLocal: number
    cpfsBloqueados: number
  }
  alteracoesAuditadas: number
  /**
   * "Com o Credenciei você economizou R$ X" (Juan, 13/10/2026): nas equipes pagas por pessoa (as que batem o meio), as
   * diárias APROVADAS na escala em que ninguém bateu a entrada × o valor médio da diária. Sem o controle de ponto, o
   * fornecedor cobraria pela lista. Só dias que já passaram. `null` se o evento não tem equipe com meio.
   */
  economia: {
    equipesComMeio: number
    diariasEscaladas: number
    diariasTrabalhadas: number
    diariasSemComparecer: number
    valorDiaria: number
    valor: number
  } | null
}

/** O valor médio da diária usado na conta da economia (Juan, 13/10/2026). */
export const VALOR_MEDIO_DIARIA = 200

export async function dadosEntregaValor(eventoId: string): Promise<DadosEntregaValor | null> {
  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, nome, organizacoes(nome)').eq('id', eventoId).maybeSingle()
  if (!evento) return null

  const [{ data: dias }, { data: forns }] = await Promise.all([
    supabaseAdmin.from('jornada_dias').select('data').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
    supabaseAdmin.from('fornecedores').select('id, exige_meio').eq('evento_id', eventoId),
  ])
  const datas = [...new Set((dias ?? []).map(d => d.data as string))].sort()
  const setorIds = (forns ?? []).map(f => f.id as string)

  // Equipe e supervisores
  const funcs: { id: string; status_credenciamento: string | null; descredenciado_em: string | null; fornecedor_id: string }[] = []
  const supervisores = new Set<string>()
  for (const lote of emLotes(setorIds, 150)) {
    const [f, principais, extras] = await Promise.all([
      buscarTudo<typeof funcs[number]>((de, ate) => supabaseAdmin.from('funcionarios')
        .select('id, status_credenciamento, descredenciado_em, fornecedor_id').in('fornecedor_id', lote).order('id').range(de, ate)),
      supabaseAdmin.from('perfis').select('id').eq('role', 'supervisor').in('fornecedor_id', lote),
      supabaseAdmin.from('supervisor_setores').select('perfil_id').in('fornecedor_id', lote),
    ])
    funcs.push(...f)
    for (const p of principais.data ?? []) supervisores.add(p.id as string)
    for (const p of extras.data ?? []) supervisores.add(p.perfil_id as string)
  }

  // Batidas do evento
  const registros = await buscarTudo<{ funcionario_id: string; tipo: string; created_at: string; data_ref: string | null; registro_manual: boolean | null; criado_por_perfil_id: string | null }>(
    (de, ate) => supabaseAdmin.from('registros')
      .select('funcionario_id, tipo, created_at, data_ref, registro_manual, criado_por_perfil_id')
      .eq('evento_id', eventoId).order('id').range(de, ate))
  const turnos = new Map<string, { entrada?: string; fim?: string }>()
  for (const r of registros) {
    if (r.tipo !== 'entrada' && r.tipo !== 'fim') continue
    const chave = `${r.funcionario_id}|${r.data_ref ?? r.created_at.slice(0, 10)}`
    const t = turnos.get(chave) ?? {}
    t[r.tipo as 'entrada' | 'fim'] = r.created_at
    turnos.set(chave, t)
  }
  let completos = 0, soEntrada = 0, saidaSemEntrada = 0, horasMs = 0
  const trabalharam = new Set<string>()
  for (const [chave, t] of turnos) {
    if (t.entrada) trabalharam.add(chave.split('|')[0])
    if (t.entrada && t.fim) {
      completos++
      const dur = new Date(t.fim).getTime() - new Date(t.entrada).getTime()
      if (dur > 0 && dur < 24 * 3600_000) horasMs += dur
    } else if (t.entrada) soEntrada++
    else if (t.fim) saidaSemEntrada++
  }
  const turnosComEntrada = completos + soEntrada

  // Portão
  const leituras = await buscarTudo<{ resultado: string; perfil_id: string | null }>((de, ate) => supabaseAdmin
    .from('leituras_qr').select('resultado, perfil_id').eq('evento_id', eventoId).order('id').range(de, ate))
  const conta = (...rs: string[]) => leituras.filter(l => rs.includes(l.resultado)).length

  const [bloqueados, auditadas, autoatendimento, fora] = await Promise.all([
    supabaseAdmin.from('cpfs_bloqueados').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId),
    supabaseAdmin.from('alteracoes_cadastro').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId),
    supabaseAdmin.from('alteracoes_cadastro').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId).eq('acao', 'REGISTRO_AUTOATENDIMENTO'),
    relatorioForaDoLocal(eventoId).catch(() => null),
  ])

  // Economia: diárias aprovadas na escala, nas equipes com meio, em dias que já passaram, sem entrada batida.
  let economia: DadosEntregaValor['economia'] = null
  const setoresComMeio = new Set((forns ?? []).filter(f => (f as { exige_meio?: boolean | null }).exige_meio === true).map(f => f.id as string))
  if (setoresComMeio.size) {
    try {
      const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
      const diasDoEvento = new Set(datas.filter(d => d <= hoje))
      const daEquipe = funcs.filter(f => setoresComMeio.has(f.fornecedor_id)).map(f => f.id)
      const escaladas = new Set<string>()
      for (const lote of emLotes(daEquipe, 150)) {
        const linhas = await buscarTudo<{ funcionario_id: string; data: string }>((de, ate) => supabaseAdmin.from('funcionario_dias')
          .select('funcionario_id, data').in('funcionario_id', lote).eq('aprovado', true).order('funcionario_id').order('data').range(de, ate))
        for (const l of linhas) if (diasDoEvento.has(l.data)) escaladas.add(`${l.funcionario_id}|${l.data}`)
      }
      const ids = new Set(daEquipe)
      const trabalhadas = new Set([...turnos].filter(([k, t]) => t.entrada && ids.has(k.split('|')[0])).map(([k]) => k))
      const semComparecer = [...escaladas].filter(k => !trabalhadas.has(k)).length
      economia = {
        equipesComMeio: setoresComMeio.size,
        diariasEscaladas: escaladas.size,
        diariasTrabalhadas: trabalhadas.size,
        diariasSemComparecer: semComparecer,
        valorDiaria: VALOR_MEDIO_DIARIA,
        valor: semComparecer * VALOR_MEDIO_DIARIA,
      }
    } catch { /* sem a escala por dia, a página da economia não sai */ }
  }

  const ativos = funcs.filter(f => !f.descredenciado_em)
  return {
    eventoId,
    eventoNome: evento.nome as string,
    organizacaoNome: (evento.organizacoes as unknown as { nome?: string } | null)?.nome ?? null,
    periodo: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
    diasDeOperacao: datas.length,
    fornecedores: setorIds.length,
    supervisores: supervisores.size,
    cadastros: {
      // O mesmo número do cartão "Funcionários do evento": inclui quem foi apagado (lixeira) — Juan, 12/10/2026.
      total: funcs.length + await cadastrosSoNaLixeira(eventoId),
      aprovados: ativos.filter(f => (f.status_credenciamento ?? 'aprovado') === 'aprovado').length,
      negados: funcs.filter(f => f.status_credenciamento === 'negado').length,
      aguardando: ativos.filter(f => f.status_credenciamento === 'pendente').length,
      tirados: funcs.filter(f => !!f.descredenciado_em).length,
    },
    presenca: {
      pessoasQueTrabalharam: trabalharam.size,
      turnos: turnosComEntrada,
      completos,
      soEntrada,
      saidaSemEntrada,
      percentualCompletos: turnosComEntrada ? Math.round((completos / turnosComEntrada) * 1000) / 10 : 0,
      horasRegistradas: Math.round(horasMs / 3600_000),
      batidas: registros.length,
      regularizadasPelaEquipe: registros.filter(r => r.registro_manual === true).length,
      peloCelular: autoatendimento.count ?? 0,
    },
    seguranca: {
      leiturasNoPortao: leituras.length,
      // Sem as tentativas fora do local: elas têm a linha própria logo abaixo (e várias vêm do celular, não do portão).
      barradasNoPortao: conta('negado', 'invalido', 'dia_nao_autorizado', 'setor_lotado'),
      qrInvalidoOuSemCadastro: conta('negado', 'invalido'),
      foraDoDiaOuLotado: conta('dia_nao_autorizado', 'setor_lotado'),
      tentativasForaDoLocal: fora ? fora.linhas.filter(l => l.situacao === 'recusada').length : conta('fora_do_local'),
      batidasForaDoLocal: fora ? fora.linhas.filter(l => l.situacao === 'registrada').length : 0,
      cpfsBloqueados: bloqueados.count ?? 0,
    },
    alteracoesAuditadas: auditadas.count ?? 0,
    economia,
  }
}
