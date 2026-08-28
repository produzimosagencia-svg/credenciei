// Quem, num dia, deixou de cumprir cada etapa — as listas do supervisor.
//
// Responde as três perguntas que a operação faz em voz alta durante o evento:
//
//   1. acabou a entrada — quem estava escalado e não se credenciou?
//   2. passou o meio — quem entrou e sumiu no meio do turno?
//   3. fim do dia — quem entrou e foi embora sem descredenciar?
//
// Sem framework de propósito, igual a `lib/mensagens.ts`: o worker de WhatsApp
// que roda na VPS (fora do Next.js) precisa montar exatamente as mesmas listas
// que a tela mostra. Duas implementações da mesma regra divergiriam no primeiro
// ajuste, e o supervisor receberia uma lista diferente da que ele vê no
// sistema — que é o pior tipo de erro nesse contexto: o que faz duvidar dos dois.

import { createClient } from '@supabase/supabase-js'
import { janelaDoMeio, horariosEsperados, diaBRT, type EventoJanelas, type DiaDaJornada } from './janelas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EtapaPendente = 'entrada' | 'meio' | 'fim'

export const ROTULO_PENDENCIA: Record<EtapaPendente, string> = {
  entrada: 'Não credenciou a entrada',
  meio: 'Não registrou o meio',
  fim: 'Não fez o descredenciamento',
}

export type Pendencia = {
  funcionarioId: string
  nome: string
  cpf: string
  telefone: string | null
  setorId: string
  setorNome: string
  eventoId: string
  eventoNome: string
  /** Dia de referência da operação, "2026-09-10". */
  data: string
  etapa: EtapaPendente
  /** Que horas era pra ter batido. `null` num dia sem horário definido. */
  esperadoEm: string | null
  /**
   * Horário realizado da etapa que ANCORA a pendência: a entrada de quem não
   * fez o meio ou a saída. Na pendência de entrada não existe — é justamente
   * o que está faltando.
   */
  realizadoEm: string | null
}

type Opcoes = {
  eventoId: string
  /** Dia da operação. Padrão: hoje em Brasília. */
  data?: string
  /** Supervisor: restringe ao próprio setor. */
  fornecedorId?: string
  etapas?: EtapaPendente[]
}

/**
 * As pendências de um dia.
 *
 * "Previsto para trabalhar" é quem está ATIVO no setor. Quem se cadastrou mas
 * não foi ativado (excedente acima do teto contratado) não é cobrado de nada —
 * ele não vai trabalhar, e listá-lo faria o supervisor caçar gente que não
 * deveria estar lá.
 */
export async function pendenciasDoDia(opcoes: Opcoes): Promise<Pendencia[]> {
  const { eventoId, fornecedorId } = opcoes
  const etapas = opcoes.etapas ?? (['entrada', 'meio', 'fim'] as EtapaPendente[])
  const data = opcoes.data ?? diaBRT()
  const agora = Date.now()

  const { data: evento } = await supabase
    .from('eventos')
    .select('id, nome, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
    .eq('id', eventoId)
    .single()
  if (!evento) return []

  /*
   * Quem ainda está credenciado. Quem já foi descredenciado cumpriu o evento e
   * foi embora — cobrar dele a saída de amanhã seria cobrar de quem terminou.
   */
  let equipeQuery = supabase
    .from('funcionarios')
    .select('id, nome, cpf, telefone, fornecedor_id, fornecedores!inner(id, nome, evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .eq('ativo', true)
    .is('descredenciado_em', null)
    .order('nome')
  if (fornecedorId) equipeQuery = equipeQuery.eq('fornecedor_id', fornecedorId)

  const { data: equipe } = await equipeQuery
  if (!equipe?.length) return []

  // Os registros DAQUELE dia. `data_ref` é o que separa o dia 2 do dia 1 num
  // evento de vários dias — sem ele esta consulta traria a operação inteira.
  const { data: registros } = await supabase
    .from('registros')
    .select('funcionario_id, tipo, created_at')
    .eq('evento_id', eventoId)
    .eq('data_ref', data)
    .in('funcionario_id', equipe.map(f => f.id))

  const feitos = new Map<string, string>() // "funcId:etapa" → created_at
  for (const r of registros ?? []) feitos.set(`${r.funcionario_id}:${r.tipo}`, r.created_at as string)

  /*
   * O dia de trabalho. Se aquela data não é dia de trabalho deste evento, não
   * existe pendência nenhuma: ninguém era esperado, então ninguém faltou.
   */
  const { data: diasJornada } = await supabase
    .from('jornada_dias')
    .select('tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', eventoId)
    .eq('data', data)
    .order('turno')
    .limit(1)

  const dia = (diasJornada?.[0] as DiaDaJornada | undefined) ?? null
  if (!dia || dia.cancelado) return []

  const esperados = horariosEsperados(evento as EventoJanelas, data, dia)

  const lista: Pendencia[] = []

  for (const f of equipe) {
    const setor = f.fornecedores as unknown as { id: string; nome: string }
    const entradaEm = feitos.get(`${f.id}:entrada`) ?? null

    const comum = {
      funcionarioId: f.id as string,
      nome: f.nome as string,
      cpf: f.cpf as string,
      telefone: (f.telefone as string | null) ?? null,
      setorId: setor?.id ?? (f.fornecedor_id as string),
      setorNome: setor?.nome ?? '—',
      eventoId,
      eventoNome: evento.nome as string,
      data,
    }

    // ── Entrada: escalado e não bateu, depois do limite do dia ──────────────
    // Antes do limite não é pendência, é gente que ainda vai chegar.
    if (etapas.includes('entrada') && !entradaEm && agora > new Date(esperados.entradaLimite).getTime()) {
      lista.push({ ...comum, etapa: 'entrada', esperadoEm: esperados.entrada, realizadoEm: null })
    }

    // As duas etapas seguintes só existem para quem entrou. Cobrar o meio de
    // quem nunca chegou seria contar a mesma ausência três vezes e enterrar a
    // informação que importa — a de que essa pessoa não apareceu.
    if (!entradaEm) continue

    // ── Meio: horário fixo no dia principal, individual nos de preparação ───
    if (etapas.includes('meio') && !feitos.has(`${f.id}:meio`)) {
      const j = janelaDoMeio(evento as EventoJanelas, dia, entradaEm)
      if (j && agora > new Date(j.fim).getTime()) {
        lista.push({ ...comum, etapa: 'meio', esperadoEm: j.inicio, realizadoEm: entradaEm })
      }
    }

    // ── Saída: entrou e não descredenciou ───────────────────────────────────
    if (etapas.includes('fim') && !feitos.has(`${f.id}:fim`) && agora > new Date(esperados.fimLimite).getTime()) {
      lista.push({ ...comum, etapa: 'fim', esperadoEm: esperados.fim, realizadoEm: entradaEm })
    }
  }

  return lista
}

/** Só a contagem por etapa — para cartões e cabeçalhos, sem carregar a lista. */
export function contarPorEtapa(pendencias: Pendencia[]): Record<EtapaPendente, number> {
  return pendencias.reduce(
    (acc, p) => ({ ...acc, [p.etapa]: acc[p.etapa] + 1 }),
    { entrada: 0, meio: 0, fim: 0 } as Record<EtapaPendente, number>
  )
}
