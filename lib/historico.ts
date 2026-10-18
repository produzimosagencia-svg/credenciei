// O histórico de trabalho de uma pessoa num evento, dia a dia.
//
// ─── POR QUE É DERIVADO E NÃO MATERIALIZADO ─────────────────────────────────
//
// A ausência de alguém num dia NÃO vira linha no banco. Ela é calculada aqui,
// cruzando os DIAS DE TRABALHO do evento (`jornada_dias`) com as BATIDAS que
// existem (`registros`). Falta é a diferença entre os dois.
//
// Gravar "faltou" como linha pareceria mais direto e seria pior: no momento em
// que o supervisor regularizasse a batida pelo registro assistido — que é o
// caminho normal quando alguém perde o horário — a linha de falta continuaria
// lá, e o fechamento do pagamento passaria a ter duas versões da verdade. Com
// o cálculo derivado, regularizar a batida corrige o relatório no mesmo
// instante, sem nenhum passo extra que alguém possa esquecer.
//
// O que o banco precisa guardar para isso funcionar são as duas pontas, e ele
// guarda: o dia esperado e a batida feita. É o que sustenta a pergunta do
// fechamento — "estava escalado para 5 dias e veio em 4".

import { supabaseAdmin, meusSetores } from './supabase-server'
import type { TentativaForaDoLocal } from './alertas-local'
import { veTodosEventos } from './permissions'
import { janelaDoMeio, faseDoDia, diaBRT, inicioDoBloco, type EventoJanelas, type DiaDaJornada, type TipoDia, type FaseDoDia } from './janelas'

export type Batida = {
  em: string
  /** Registrada pelo supervisor no lugar da pessoa, com foto e justificativa. */
  assistido: boolean
  temFoto: boolean
}

export type DiaDoHistorico = {
  data: string
  tipo: TipoDia
  /**
   * A ETAPA do evento a que este dia pertence.
   *
   * Derivada da data contra o dia do evento, não guardada no banco: montagem é
   * qualquer dia de trabalho ANTES do dia do evento, desmontagem é qualquer um
   * DEPOIS. Guardar seria criar uma segunda verdade que pode divergir quando a
   * data do evento muda — e ela muda.
   */
  fase: FaseDoDia
  cancelado: boolean
  entrada: Batida | null
  meio: Batida | null
  fim: Batida | null
  /** Que horas era pra ter feito o meio — fixo no dia principal, entrada+4h nos outros. */
  meioEsperadoEm: string | null
  /** Até que horas valia registrar o meio sem ficar em atraso. */
  meioPrazoEm: string | null
  /**
   * Quantos minutos o meio passou do prazo. `null` quando foi no prazo ou
   * quando não houve batida.
   *
   * O meio pode ser registrado depois do prazo de propósito — fechar a janela
   * faria quem passasse do horário perder a chance de registrar de vez. Mas
   * atrasar não pode sair de graça: é isto que faz o dia aparecer marcado no
   * histórico, para o organizador cobrar a justificativa no acerto.
   */
  meioAtrasoMin: number | null
  /** Bateu pelo menos a entrada. */
  compareceu: boolean
  /** Cumpriu as três etapas. */
  completo: boolean
  /**
   * Saídas e voltas no meio do turno (entrada, saída, entrada, saída…), em
   * ordem. A entrada acima é a primeira do dia e o `fim` a última saída.
   */
  pausas: { saiu: string; voltou: string; /** O meio do bloco que terminou nesta pausa (meio por bloco). */ meio?: string | null }[]
  /** Da entrada à saída, em horas, sem o tempo das pausas. `null` enquanto faltar uma das duas pontas. */
  horas: number | null
  /**
   * O cadastro (ficha) de onde vêm as batidas deste dia, e a equipe dele. A pessoa pode ter trabalhado um dia numa
   * equipe e outro dia em outra do mesmo evento (baixa numa, cadastro na outra) — pedido do Juan, 18/10/2026: "isso
   * tem que ter no histórico dele". Correções do dia vão para ESTA ficha, não para a que está aberta.
   */
  fichaId: string
  equipe: string
  /** As batidas deste dia são de outra equipe, não da do cadastro aberto. */
  outraEquipe: boolean
}

export type ResumoHistorico = {
  diasEscalados: number
  diasTrabalhados: number
  diasFaltados: number
  diasIncompletos: number
  horasTotais: number
  batidasEntrada: number
  batidasMeio: number
  batidasFim: number
}

export type HistoricoNoEvento = {
  eventoId: string
  eventoNome: string
  setorNome: string
  fornecedorId: string
  funcionarioId: string
  nome: string
  cpf: string
  descredenciadoEm: string | null
  dias: DiaDoHistorico[]
  /** As equipes em que a pessoa bateu ponto neste evento, na ordem dos dias. Mais de uma = trabalhou em equipes diferentes. */
  equipes: string[]
  resumo: ResumoHistorico
  /**
   * Tentativas de bater o ponto RECUSADAS por estar fora do raio do local do evento, com o endereço (pedido do
   * Juan, 08/10/2026). Só vem para quem gerencia o evento — `obterHistoricoDoFuncionario` preenche; o resto do
   * sistema (supervisor, encarregado) não recebe, igual às outras marcas de localização.
   */
  tentativasForaDoLocal?: TentativaForaDoLocal[]
}

const H_MS = 60 * 60 * 1000

/**
 * O histórico completo de uma pessoa no evento em que ela está vinculada.
 *
 * Devolve UMA linha por dia de trabalho do evento — inclusive os dias em que a
 * pessoa não apareceu, que são justamente os que interessam no fechamento.
 *
 * Junta os OUTROS cadastros do mesmo CPF neste evento (outra equipe, com ou sem baixa): o dia trabalhado lá aparece
 * aqui com a equipe dele. `outrasEquipes: false` mostra só este cadastro (consulta do encarregado, que é do setor dele).
 */
export async function historicoDoFuncionario(
  funcionarioId: string,
  opcoes: { outrasEquipes?: boolean } = {},
): Promise<HistoricoNoEvento | null> {
  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, descredenciado_em, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, nome, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return null

  const setor = func.fornecedores as unknown as { nome: string; eventos: EventoJanelas & { id: string; nome: string } }
  const evento = setor?.eventos
  if (!evento) return null

  // As fichas desta pessoa no evento: esta e as de outras equipes com o mesmo CPF.
  const fichas = new Map<string, string>([[funcionarioId, setor.nome]])
  if (opcoes.outrasEquipes !== false && func.cpf) {
    const { data: outras } = await supabaseAdmin
      .from('funcionarios')
      .select('id, fornecedores!inner(nome, evento_id)')
      .eq('cpf', func.cpf as string)
      .eq('fornecedores.evento_id', evento.id)
      .neq('id', funcionarioId)
    for (const o of outras ?? []) fichas.set(o.id as string, (o.fornecedores as unknown as { nome: string }).nome)
  }
  const ids = [...fichas.keys()]

  const [{ data: diasBrutos }, { data: registros }, { data: pausasBrutas }] = await Promise.all([
    supabaseAdmin
      .from('jornada_dias')
      .select('data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
      .eq('evento_id', evento.id)
      .order('data'),
    supabaseAdmin
      .from('registros')
      .select('funcionario_id, tipo, created_at, data_ref, registro_manual, foto_url')
      .in('funcionario_id', ids)
      .eq('evento_id', evento.id)
      .order('created_at'),
    // Tolerante: sem a tabela (upgrade-pausas-turno.sql), vem vazio; sem a coluna do meio por bloco
    // (upgrade-meio-por-bloco.sql), lê sem ela.
    (async () => {
      const ler = (colunas: string) => supabaseAdmin
        .from('pausas_turno').select(colunas)
        .in('funcionario_id', ids).eq('evento_id', evento.id).order('saiu_em')
      type LinhaPausa = { funcionario_id: string; data_ref: string; saiu_em: string; voltou_em: string; meio_em?: string | null }
      const comMeio = await ler('funcionario_id, data_ref, saiu_em, voltou_em, meio_em')
      if (!comMeio.error) return { data: (comMeio.data ?? []) as unknown as LinhaPausa[] }
      const semMeio = await ler('funcionario_id, data_ref, saiu_em, voltou_em')
      return { data: (semMeio.error ? [] : (semMeio.data ?? [])) as unknown as LinhaPausa[] }
    })(),
  ])

  // Chave: dia + ficha — no mesmo dia, cada equipe tem as suas batidas.
  const chave = (dia: string, ficha: string) => `${dia}|${ficha}`
  const pausasPorDia = new Map<string, { saiu: string; voltou: string; meio?: string | null }[]>()
  for (const p of pausasBrutas ?? []) {
    const k = chave(p.data_ref as string, p.funcionario_id)
    if (!pausasPorDia.has(k)) pausasPorDia.set(k, [])
    pausasPorDia.get(k)!.push({ saiu: p.saiu_em as string, voltou: p.voltou_em as string, meio: p.meio_em ?? null })
  }

  const porDia = new Map<string, Map<string, Batida>>()
  const fichasDoDia = new Map<string, string[]>()
  for (const r of registros ?? []) {
    const dia = (r.data_ref as string | null) ?? (r.created_at as string).slice(0, 10)
    const ficha = r.funcionario_id as string
    const k = chave(dia, ficha)
    if (!porDia.has(k)) {
      porDia.set(k, new Map())
      fichasDoDia.set(dia, [...(fichasDoDia.get(dia) ?? []), ficha])
    }
    porDia.get(k)!.set(r.tipo as string, {
      em: r.created_at as string,
      assistido: r.registro_manual === true,
      temFoto: !!r.foto_url,
    })
  }

  /*
   * Dias que têm batida mas não estão em `jornada_dias` entram assim mesmo.
   *
   * Acontece com registro feito antes de o dia ser marcado, ou num dia que o
   * produtor desmarcou depois. Esconder a batida seria pior que mostrar um dia
   * fora da escala: o dinheiro daquele dia foi trabalhado de qualquer jeito.
   */
  const datas = new Set<string>((diasBrutos ?? []).map(d => d.data as string))
  for (const dia of fichasDoDia.keys()) datas.add(dia)

  const metaPorData = new Map((diasBrutos ?? []).map(d => [d.data as string, d as DiaDaJornada]))

  /*
   * O(s) dia(s) do evento — a régua que separa montagem de desmontagem.
   *
   * Vem das linhas marcadas como principal em `jornada_dias` (pode ser mais
   * de uma, num festival de várias noites), com a data do evento como
   * reserva: se a data do evento mudou e a jornada ainda não acompanhou, a
   * linha marcada é a que a operação de fato usou.
   */
  const diasPrincipais = (diasBrutos ?? [])
    .filter(d => d.tipo === 'principal')
    .map(d => d.data as string)
  if (!diasPrincipais.length && evento.data_inicio) diasPrincipais.push(diaBRT(evento.data_inicio))

  /*
   * Uma linha por dia; duas no dia em que a pessoa bateu ponto em duas equipes. Dia sem batida nenhuma fica com o
   * cadastro aberto (é dele a falta). Esta ficha primeiro, as outras na ordem da primeira batida.
   */
  const linhas = [...datas].sort().flatMap(data => {
    const comBatida = fichasDoDia.get(data) ?? []
    const ordem = comBatida.includes(funcionarioId) ? [funcionarioId, ...comBatida.filter(f => f !== funcionarioId)] : comBatida
    return (ordem.length ? ordem : [funcionarioId]).map(ficha => ({ data, ficha }))
  })

  const dias: DiaDoHistorico[] = linhas.map(({ data, ficha }) => {
    const meta = metaPorData.get(data) ?? null
    const batidas = porDia.get(chave(data, ficha))
    const entrada = batidas?.get('entrada') ?? null
    const meio = batidas?.get('meio') ?? null
    const fim = batidas?.get('fim') ?? null
    const pausas = pausasPorDia.get(chave(data, ficha)) ?? []
    // O meio do bloco ATUAL conta da volta da última pausa longa (meio por bloco, 12/10/2026).
    const janela = janelaDoMeio(evento, meta, inicioDoBloco(entrada?.em ?? null, pausas.map(p => ({ saiuEm: p.saiu, voltouEm: p.voltou }))))
    const foraMs = pausas.reduce((s, p) => s + Math.max(0, new Date(p.voltou).getTime() - new Date(p.saiu).getTime()), 0)

    return {
      data,
      tipo: (meta?.tipo as TipoDia) ?? 'preparacao',
      fase: faseDoDia(data, diasPrincipais),
      cancelado: meta?.cancelado === true,
      entrada, meio, fim,
      meioEsperadoEm: janela?.inicio ?? null,
      meioPrazoEm: janela?.fim ?? null,
      meioAtrasoMin: meio && janela && new Date(meio.em) > new Date(janela.fim)
        ? Math.round((new Date(meio.em).getTime() - new Date(janela.fim).getTime()) / 60_000)
        : null,
      compareceu: !!entrada,
      completo: !!entrada && !!meio && !!fim,
      pausas,
      horas: entrada && fim
        ? Math.round((Math.max(0, new Date(fim.em).getTime() - new Date(entrada.em).getTime() - foraMs) / H_MS) * 100) / 100
        : null,
      fichaId: ficha,
      equipe: fichas.get(ficha) ?? setor.nome,
      outraEquipe: ficha !== funcionarioId,
    }
  })

  // Dia cancelado não conta como escalado: o organizador desmarcou o
  // expediente, então ninguém faltou a ele.
  const valem = dias.filter(d => !d.cancelado)
  // Dias contam por DATA: o dia com batida em duas equipes é um dia trabalhado, não dois.
  const datasEscaladas = new Set(valem.map(d => d.data))
  const datasTrabalhadas = new Set(valem.filter(d => d.compareceu).map(d => d.data))
  const equipes = [...new Set(dias.filter(d => d.entrada || d.meio || d.fim || d.pausas.length).map(d => d.equipe))]

  return {
    eventoId: evento.id,
    eventoNome: evento.nome,
    setorNome: setor.nome,
    fornecedorId: func.fornecedor_id as string,
    funcionarioId,
    nome: func.nome as string,
    cpf: func.cpf as string,
    descredenciadoEm: (func.descredenciado_em as string | null) ?? null,
    dias,
    equipes,
    resumo: {
      diasEscalados: datasEscaladas.size,
      diasTrabalhados: datasTrabalhadas.size,
      diasFaltados: datasEscaladas.size - datasTrabalhadas.size,
      diasIncompletos: valem.filter(d => d.compareceu && !d.completo).length,
      horasTotais: Math.round(valem.reduce((soma, d) => soma + (d.horas ?? 0), 0) * 100) / 100,
      // Cada pausa é uma saída E uma volta (entrada) a mais — conta como batida.
      batidasEntrada: valem.filter(d => d.entrada).length + valem.reduce((s, d) => s + d.pausas.length, 0),
      batidasMeio: valem.filter(d => d.meio).length,
      batidasFim: valem.filter(d => d.fim).length + valem.reduce((s, d) => s + d.pausas.length, 0),
    },
  }
}

/**
 * A pessoa logada pode ver o histórico deste funcionário?
 *
 * Mesma régua do resto do sistema — supervisor só a própria equipe, admin só
 * a própria organização, master tudo — extraída para um lugar só. Antes vivia
 * copiada dentro da página cheia; um segundo consumidor (o modal, aberto sem
 * navegar) precisava da mesma verificação, e duas cópias da mesma regra
 * divergem no primeiro ajuste que alguém faz numa e esquece na outra.
 *
 * Não trava mais em `role === 'supervisor'` (achado ao vivo, 05/10/2026,
 * caso da Mara Lúcia: operadora de portão que também supervisiona um
 * fornecedor — "Sem permissão" no histórico e no crachá de quem é da
 * própria equipe dela). `meusSetores` responde pela EXISTÊNCIA do vínculo
 * (supervisor_setores), não pelo papel principal da conta, e cobre todos os
 * setores dela — não só o `fornecedor_id` ATIVO no momento — mesma régua já
 * usada em `meuSetor`/`meusSetores`/`entrarNoEventoSupervisor`.
 */
export async function podeVerHistoricoDe(
  perfil: { id: string; role: string; fornecedor_id?: string | null; organizacao_id?: string | null } | null,
  funcionarioId: string,
): Promise<boolean> {
  if (!perfil) return false

  const { data: vinculo } = await supabaseAdmin
    .from('funcionarios')
    .select('fornecedor_id, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!vinculo) return false

  const org = (vinculo.fornecedores as unknown as { eventos: { organizacao_id: string | null } })?.eventos?.organizacao_id

  const meus = await meusSetores(perfil)
  if (meus.some(s => s.id === vinculo.fornecedor_id)) return true
  if (perfil.role === 'supervisor') return false
  // Encarregado é consulta do setor dele (telas de /encarregado): o histórico
  // completo e o QR da pessoa não são dele — e `org === organizacao_id` casaria
  // um evento sem organização com a conta sem organização.
  if (perfil.role === 'encarregado') return false
  return veTodosEventos(perfil) || org === perfil.organizacao_id
}
