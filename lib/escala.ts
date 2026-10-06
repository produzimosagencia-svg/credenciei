import { supabaseAdmin, buscarTudo } from './supabase-server'
import { faseDoDia, periodoDoEvento, somarDias } from './janelas'
import {
  planejarAprovacao, statusEscalaValido, vereditoDaEscala,
  type DiaDaEscala, type DiaEscolhido, type StatusEscala, type VereditoEscala,
} from './escala-regras'

/**
 * Escala por dia (eventos de subeventos) — LEITURA e GRAVAÇÃO no banco.
 *
 * As regras puras estão em lib/escala-regras.ts. Permissão é de quem chama
 * (as actions em lib/actions.ts): estas funções só arrumam o dado, dado um id
 * que já passou pela régua — mesmo contrato de lib/conferencia.ts.
 *
 * Tudo aqui é TOLERANTE à migração pendente (supabase/upgrade-escala-por-dia.sql):
 * sem as colunas/tabela, o evento simplesmente não usa escala por dia e tudo
 * se comporta como antes.
 */

/**
 * O evento usa escala por dia? Três chaves, todas precisam estar ligadas:
 *   * o evento é de subeventos (`eventos.tem_subeventos`);
 *   * a organização tem subeventos liberado (mesma dupla checagem da tela do
 *     evento, app/admin/eventos/[id]/page.tsx);
 *   * a organização ligou "Dias de trabalho escolhidos pelo funcionário" em
 *     Configurações → Funcionalidades do Sistema (nasce desligado).
 * Evento normal → `false`, sempre.
 */
export async function eventoUsaEscalaPorDia(eventoId: string): Promise<boolean> {
  try {
    const { data: evento, error } = await supabaseAdmin
      .from('eventos').select('tem_subeventos, organizacao_id').eq('id', eventoId).maybeSingle()
    if (error || !evento || (evento as { tem_subeventos?: boolean }).tem_subeventos !== true) return false

    const orgId = (evento as { organizacao_id?: string | null }).organizacao_id
    if (!orgId) return false
    const { data: org } = await supabaseAdmin
      .from('organizacoes').select('subeventos_habilitado, escala_por_dia_habilitada').eq('id', orgId).maybeSingle()
    const flags = org as { subeventos_habilitado?: boolean; escala_por_dia_habilitada?: boolean } | null
    if (flags?.subeventos_habilitado !== true || flags?.escala_por_dia_habilitada !== true) return false

    // A tabela existe? Sem ela não há onde guardar a escolha — melhor seguir
    // sem escala do que derrubar o cadastro inteiro.
    const { error: semTabela } = await supabaseAdmin.from('funcionario_dias').select('id', { head: true }).limit(1)
    return !semTabela
  } catch {
    return false
  }
}

/**
 * Os dias que a pessoa pode escolher: todos os dias de trabalho do evento
 * (`jornada_dias` não cancelados), cada um com a sua fase. Sem nenhuma linha
 * em `jornada_dias` (evento antigo), cai no período data_inicio → data_fim.
 */
export async function diasDaEscalaDoEvento(eventoId: string): Promise<DiaDaEscala[]> {
  const { data: linhas } = await supabaseAdmin
    .from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false).order('data')

  let datas = [...new Set((linhas ?? []).map(l => l.data as string))].sort()
  let principais = [...new Set((linhas ?? []).filter(l => l.tipo === 'principal').map(l => l.data as string))]

  if (!datas.length) {
    const { data: evento } = await supabaseAdmin
      .from('eventos').select('data_inicio, data_fim').eq('id', eventoId).maybeSingle()
    const periodo = evento ? periodoDoEvento(evento) : null
    if (!periodo) return []
    datas = []
    for (let d = periodo.primeiro; d <= periodo.ultimo; d = somarDias(d, 1)) datas.push(d)
    principais = [periodo.primeiro]
  }

  return datas.map(data => ({ data, fase: faseDoDia(data, principais) }))
}

export type EscalaDoFuncionario = {
  status: StatusEscala | null
  decididaEm: string | null
  decididaPor: string | null
  dias: DiaEscolhido[]
}

/**
 * A escala de várias pessoas de uma vez (tela de aprovações). Ausente no Map
 * = fora do fluxo. Em lotes: um evento grande passa de 500 pessoas, e um
 * `in(...)` com todos os ids estoura o tamanho da URL do PostgREST.
 */
export async function escalasDosFuncionarios(funcionarioIds: string[]): Promise<Map<string, EscalaDoFuncionario>> {
  const resultado = new Map<string, EscalaDoFuncionario>()
  const LOTE = 150
  for (let i = 0; i < funcionarioIds.length; i += LOTE) {
    for (const [id, e] of await escalasDoLote(funcionarioIds.slice(i, i + LOTE))) resultado.set(id, e)
  }
  return resultado
}

async function escalasDoLote(funcionarioIds: string[]): Promise<Map<string, EscalaDoFuncionario>> {
  const resultado = new Map<string, EscalaDoFuncionario>()
  if (!funcionarioIds.length) return resultado
  try {
    const { data: funcs, error } = await supabaseAdmin
      .from('funcionarios').select('id, escala_status, escala_decidida_em, escala_decidida_por').in('id', funcionarioIds)
    if (error || !funcs) return resultado

    const comEscala = funcs.filter(f => statusEscalaValido(f.escala_status))
    if (!comEscala.length) return resultado

    const decisores = [...new Set(comEscala.map(f => f.escala_decidida_por as string | null).filter((v): v is string => !!v))]
    // Paginado: 150 pessoas × vários dias passa do teto de 1000 linhas por consulta.
    const [dias, { data: perfis }] = await Promise.all([
      buscarTudo<{ funcionario_id: string; data: string; selecionado: boolean; aprovado: boolean }>((de, ate) =>
        supabaseAdmin.from('funcionario_dias').select('funcionario_id, data, selecionado, aprovado')
          .in('funcionario_id', comEscala.map(f => f.id as string)).order('funcionario_id').order('data').range(de, ate)),
      decisores.length
        ? supabaseAdmin.from('perfis').select('id, nome').in('id', decisores)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ])
    const nome = new Map((perfis ?? []).map(p => [p.id as string, p.nome as string]))

    for (const f of comEscala) {
      resultado.set(f.id as string, {
        status: statusEscalaValido(f.escala_status),
        decididaEm: (f.escala_decidida_em as string | null) ?? null,
        decididaPor: f.escala_decidida_por ? (nome.get(f.escala_decidida_por as string) ?? null) : null,
        dias: (dias ?? []).filter(d => d.funcionario_id === f.id).map(d => ({
          data: d.data as string, selecionado: d.selecionado === true, aprovado: d.aprovado === true,
        })),
      })
    }
  } catch { /* migração pendente — ninguém tem escala */ }
  return resultado
}

/** O que o modal de aprovação recebe — ver `detalheDoCredenciamento` (lib/actions.ts). */
export type DetalheCredenciamento = {
  nome: string
  cpf: string
  telefone: string
  cidade: string | null
  cargo: string | null
  origem: string
  criadoEm: string
  fotoUrl: string | null
  setorNome: string
  subeventoNome: string | null
  status: 'pendente' | 'aprovado' | 'negado'
  motivoNegacao: string | null
  decididoEm: string | null
  decididoPor: string | null
  /** O evento usa escala por dia (ver `eventoUsaEscalaPorDia`). */
  usaEscala: boolean
  diasDoEvento: DiaDaEscala[]
  escala: EscalaDoFuncionario | null
}

export async function escalaDoFuncionario(funcionarioId: string): Promise<EscalaDoFuncionario | null> {
  return (await escalasDosFuncionarios([funcionarioId])).get(funcionarioId) ?? null
}

/** Coluna/tabela ainda não existe — a migração não rodou (Postgres 42703/42P01, PostgREST PGRST204/PGRST205). */
function ehMigracaoPendente(error: { code?: string } | null): boolean {
  return !!error && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

const FALHA_AO_CONFERIR: VereditoEscala = {
  ok: false, titulo: 'Não foi possível conferir a escala.', mensagem: 'Tente ler o QR Code de novo em instantes.',
}

/**
 * A checagem do portão: esta pessoa pode trabalhar no dia `dia`?
 *
 *   * migração pendente, ou `escala_status` nulo  → liberado, exatamente como
 *     antes (evento normal nunca tem escala, então nunca para aqui);
 *   * evento deixou de ser de subeventos           → liberado (a regra só
 *     vale enquanto o evento estiver configurado assim);
 *   * pessoa no fluxo                              → só nos dias aprovados.
 *
 * Erro de banco que NÃO seja migração pendente recusa: na dúvida, um QR
 * condicionado à escala não abre o portão.
 */
export async function conferirEscalaNoDia(funcionarioId: string, eventoId: string, dia: string): Promise<VereditoEscala> {
  const { data: func, error } = await supabaseAdmin
    .from('funcionarios').select('escala_status').eq('id', funcionarioId).maybeSingle()
  if (ehMigracaoPendente(error)) return { ok: true }
  if (error) return FALHA_AO_CONFERIR
  const status = statusEscalaValido((func as { escala_status?: unknown } | null)?.escala_status)
  if (!status) return { ok: true }

  const [usaEscala, { data: dias, error: erroDias }] = await Promise.all([
    eventoUsaEscalaPorDia(eventoId),
    supabaseAdmin.from('funcionario_dias').select('data')
      .eq('funcionario_id', funcionarioId).eq('aprovado', true).eq('data', dia),
  ])
  if (!usaEscala) return { ok: true }
  if (erroDias) return FALHA_AO_CONFERIR
  return vereditoDaEscala({ status, diasAprovados: (dias ?? []).map(d => d.data as string) }, dia)
}

/** Grava os dias que a pessoa escolheu no formulário e coloca a escala em 'pendente'. */
export async function gravarDiasEscolhidos(
  funcionarioId: string, eventoId: string, dias: string[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const agora = new Date().toISOString()
  const { error } = await supabaseAdmin.from('funcionario_dias').insert(
    dias.map(data => ({ funcionario_id: funcionarioId, evento_id: eventoId, data, selecionado: true, selecionado_em: agora })),
  )
  if (error) return { ok: false, erro: error.message }
  const { error: erroStatus } = await supabaseAdmin
    .from('funcionarios').update({ escala_status: 'pendente' }).eq('id', funcionarioId)
  if (erroStatus) return { ok: false, erro: erroStatus.message }
  return { ok: true }
}

/**
 * O supervisor confirma (ou ajusta) os dias: `aprovados` passa a ser
 * EXATAMENTE a lista de dias em que o QR vale. O que a pessoa pediu fica
 * guardado (`selecionado`) — é o registro de quem escolheu o quê.
 *
 * Devolve os dias aprovados antes e depois, para a auditoria.
 */
export async function gravarEscalaAprovada(args: {
  funcionarioId: string; eventoId: string; aprovados: string[]; perfilId: string
}): Promise<{ ok: true; antes: string[]; depois: string[] } | { ok: false; erro: string }> {
  const { funcionarioId, eventoId, aprovados, perfilId } = args
  const agora = new Date().toISOString()

  const { data: existentes, error: erroLeitura } = await supabaseAdmin
    .from('funcionario_dias').select('data, selecionado, aprovado').eq('funcionario_id', funcionarioId)
  if (erroLeitura) return { ok: false, erro: erroLeitura.message }

  const atuais: DiaEscolhido[] = (existentes ?? []).map(d => ({
    data: d.data as string, selecionado: d.selecionado === true, aprovado: d.aprovado === true,
  }))
  const antes = atuais.filter(d => d.aprovado).map(d => d.data).sort()
  const { manter, remover } = planejarAprovacao(atuais, aprovados)

  if (manter.length) {
    const { error } = await supabaseAdmin.from('funcionario_dias').upsert(
      manter.map(d => ({
        funcionario_id: funcionarioId, evento_id: eventoId, data: d.data,
        selecionado: d.selecionado, aprovado: d.aprovado, decidido_por: perfilId, decidido_em: agora,
      })),
      { onConflict: 'funcionario_id,data' },
    )
    if (error) return { ok: false, erro: error.message }
  }
  if (remover.length) {
    const { error } = await supabaseAdmin
      .from('funcionario_dias').delete().eq('funcionario_id', funcionarioId).in('data', remover)
    if (error) return { ok: false, erro: error.message }
  }

  const { error: erroStatus } = await supabaseAdmin.from('funcionarios').update({
    escala_status: 'aprovada', escala_decidida_por: perfilId, escala_decidida_em: agora,
  }).eq('id', funcionarioId)
  if (erroStatus) return { ok: false, erro: erroStatus.message }

  return { ok: true, antes, depois: [...aprovados].sort() }
}
