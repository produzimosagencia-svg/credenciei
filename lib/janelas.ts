// Quando cada etapa pode ser registrada — a parte pura, sem banco.
//
// ─── O QUE MUDOU E POR QUÊ ───────────────────────────────────────────────────
//
// Antes, as três etapas viviam presas a horários fixos gravados no evento
// (`janela_entrada_inicio`, `janela_meio_inicio`, …). Isso só funciona para
// evento de um dia. Numa operação de montagem + evento + desmontagem, obrigava
// o produtor a reconfigurar tudo todo dia, e quem chegasse fora do horário
// simplesmente não conseguia se credenciar.
//
// O modelo agora é outro:
//
// Um evento tem DOIS tipos de dia, e a regra de cada um é diferente:
//
//   DIA PRINCIPAL      → o dia do evento. Entrada, MEIO e saída seguem os
//                        horários que o produtor configurou (eventos.janela_*).
//                        É o dia que tem portaria, fila e horário combinado
//                        com o cliente.
//
//   DIAS DE PREPARAÇÃO → montagem, organização, desmontagem. Entrada e saída
//                        LIVRES — a pessoa bate quando de fato começa e quando
//                        de fato termina. O meio é a entrada REAL dela + 4h.
//
// Nos dias de preparação a janela do meio é INDIVIDUAL: duas pessoas do mesmo
// setor que começaram com uma hora de diferença têm meios diferentes, e é isso
// que se quer — o meio confirma que a pessoa continua no posto no meio do
// TURNO DELA, não no meio do relógio.
//
// Quem decide o tipo do dia é a tabela `jornada_dias` (uma linha por data de
// trabalho do evento). Dia que não está lá NÃO é dia de trabalho: a batida é
// recusada, e é isso que permite o relatório dizer "estava escalado para 5
// dias e veio em 4".

/** Distância entre a entrada real e a abertura do meio. */
export const HORAS_ATE_MEIO = 4

/**
 * Por quanto tempo o meio fica aberto depois de abrir.
 *
 * Não pode ser um instante: a pessoa está trabalhando, pode estar carregando
 * caixa exatamente às 12:00, e falhar por isso seria injusto. Também não pode
 * ser infinito — se nunca fecha, ninguém nunca entra na lista de pendência e a
 * etapa perde a função. Duas horas cobre o intervalo de almoço inteiro.
 */
export const DURACAO_JANELA_MEIO_H = 2

/**
 * Teto para considerar uma entrada "ainda em aberto" na hora de decidir a que
 * dia a saída pertence.
 *
 * Serve ao turno que vira a madrugada: entrou 22:00 do dia 5, sai 04:00 do dia
 * 6, e a saída tem que cair no dia 5 — é assim que a operação conta a noite.
 * Sem um teto, uma entrada esquecida da semana passada capturaria a saída de
 * hoje. Dezoito horas é maior que qualquer turno real e menor que um dia
 * inteiro de intervalo.
 */
export const TETO_TURNO_H = 18

const H_MS = 60 * 60 * 1000
const OFFSET_BRT_MS = 3 * H_MS

// ─── Dias em BRT ─────────────────────────────────────────────────────────────

/**
 * O dia civil (em Brasília) de um instante — "2026-08-28".
 *
 * Passa pelo offset em vez de usar `toLocaleDateString` porque o servidor da
 * Vercel roda em UTC: às 22:00 de Brasília já é o dia seguinte lá, e o registro
 * cairia no dia errado.
 */
export function diaBRT(instante: Date | string = new Date()): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante
  const br = new Date(d.getTime() - OFFSET_BRT_MS)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${br.getUTCFullYear()}-${p2(br.getUTCMonth() + 1)}-${p2(br.getUTCDate())}`
}

// ─── Período do evento ───────────────────────────────────────────────────────

export type EventoJanelas = {
  data_inicio?: string | null
  data_fim?: string | null
  janela_entrada_inicio?: string | null
  janela_entrada_fim?: string | null
  janela_meio_inicio?: string | null
  janela_meio_fim?: string | null
  janela_fim_inicio?: string | null
  janela_fim_fim?: string | null
}

/** Primeiro e último dia civil em que o evento existe. */
export function periodoDoEvento(evento: EventoJanelas): { primeiro: string; ultimo: string } | null {
  if (!evento?.data_inicio) return null
  const primeiro = diaBRT(evento.data_inicio)
  // Evento sem data de fim (ou com fim antes do início, que é dado ruim) vale
  // por um dia só — melhor que abrir o período para sempre.
  const fim = evento.data_fim ? diaBRT(evento.data_fim) : primeiro
  return { primeiro, ultimo: fim >= primeiro ? fim : primeiro }
}

/**
 * O DIA PRINCIPAL é a data de início do evento.
 *
 * É o dia em que o evento de fato acontece, e o único para o qual o produtor
 * configurou horário de portaria. Montagem e desmontagem acontecem nos outros
 * dias do período, e é justamente lá que amarrar horário atrapalhava.
 */
export function ehDiaPrincipal(evento: EventoJanelas, dia: string): boolean {
  return !!evento?.data_inicio && diaBRT(evento.data_inicio) === dia
}

// ─── A janela do meio, individual ────────────────────────────────────────────

/**
 * A janela do meio para uma pessoa, naquele dia.
 *
 * SEMPRE a entrada real dela + 4h — inclusive no dia do evento. O produtor não
 * configura mais horário de meio em lugar nenhum.
 *
 * O motivo é operacional: no estádio a equipe não entra junta. Um horário fixo
 * para todos cobraria a selfie de quem chegou às 15:00 no mesmo instante em que
 * cobra de quem chegou às 11:00 — para um deles seria o meio do turno, para o
 * outro seria a primeira hora de trabalho. Contando da entrada de cada pessoa,
 * "meio" quer dizer a mesma coisa para todo mundo.
 *
 * Devolve `null` quando a pessoa ainda não bateu a entrada: não há de onde
 * contar as quatro horas.
 */
export function janelaDoMeio(
  _evento: EventoJanelas,
  _dia: DiaDaJornada | null,
  entradaEm: string | null
): { inicio: string; fim: string } | null {
  return entradaEm ? janelaMeio(entradaEm) : null
}

/** Entrada às 08:00 → meio das 12:00 às 14:00. */
export function janelaMeio(entradaEm: string | Date): { inicio: string; fim: string } {
  const base = (typeof entradaEm === 'string' ? new Date(entradaEm) : entradaEm).getTime()
  const inicio = base + HORAS_ATE_MEIO * H_MS
  return {
    inicio: new Date(inicio).toISOString(),
    fim: new Date(inicio + DURACAO_JANELA_MEIO_H * H_MS).toISOString(),
  }
}

// ─── Avaliação ───────────────────────────────────────────────────────────────

export type Veredito = { ok: true } | { ok: false; erro: string }

const hhmm = (iso: string) =>
  new Date(new Date(iso).getTime() - OFFSET_BRT_MS)
    .toISOString()
    .slice(11, 16)

/**
 * Estamos dentro de [inicio, fim]?
 *
 * A recusa diz o horário, não só "fora da janela": quem está no portão precisa
 * saber se falta meia hora ou se já passou.
 */
export function dentroDaJanela(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  agora: Date,
  etapa: string
): Veredito {
  if (!inicio || !fim) return { ok: true } // sem horário configurado = sem trava
  const t = agora.getTime()
  if (t < new Date(inicio).getTime()) {
    return { ok: false, erro: `A ${etapa} de hoje abre às ${hhmm(inicio)}.` }
  }
  if (t > new Date(fim).getTime()) {
    return { ok: false, erro: `O horário de ${etapa} de hoje encerrou às ${hhmm(fim)}.` }
  }
  return { ok: true }
}

/**
 * Entrada ou saída podem ser registradas neste dia?
 *
 * O DIA é quem manda, não o período do evento:
 *
 * - dia que não foi marcado como dia de trabalho → recusa. É o que sustenta
 *   "estava escalado para 5 dias e veio em 4" no fechamento;
 * - dia de preparação → livre, a pessoa bate quando começa e quando termina;
 * - dia principal → vale a janela configurada pelo produtor.
 */
export function avaliarEntradaSaida(
  evento: EventoJanelas,
  dia: DiaDaJornada | null,
  momento: 'entrada' | 'fim',
  data: string,
  agora: Date
): Veredito {
  const etapa = momento === 'entrada' ? 'entrada' : 'saída'

  if (!dia) {
    return {
      ok: false,
      erro: `${diaBR(data)} não está marcado como dia de trabalho deste evento. Fale com o organizador para incluir o dia.`,
    }
  }
  if (dia.cancelado) {
    return { ok: false, erro: `O trabalho de ${diaBR(data)} foi cancelado pelo organizador.` }
  }

  // Dia de preparação: entrada e saída são livres, o dia inteiro.
  if (dia.tipo !== 'principal') return { ok: true }

  return dentroDaJanela(
    evento[`janela_${momento}_inicio`],
    evento[`janela_${momento}_fim`],
    agora,
    etapa
  )
}

// ─── Horário ESPERADO de cada etapa ──────────────────────────────────────────
//
// Nada aqui trava registro nenhum: entrada e saída ficaram livres, e o meio é
// contado da entrada real. O que estas funções respondem é outra pergunta —
// "que horas era pra essa pessoa ter batido?" — e é ela que sustenta as listas
// de pendência do supervisor e o momento de disparar cada aviso.

/**
 * Até que horas ainda se espera a entrada, num dia sem horário configurado.
 *
 * Quem chega depois disso não é recusado (a entrada é livre); ele só entra na
 * lista de "previsto e não credenciado" que o supervisor recebe.
 */
export const LIMITE_PADRAO_ENTRADA = '12:00'

/** Idem para a saída. Fecha o dia operacional. */
export const LIMITE_PADRAO_SAIDA = '23:59'

/** Entrada presumida quando o dia não tem horário nenhum configurado. */
export const ENTRADA_PADRAO = '08:00'

export type TipoDia = 'principal' | 'preparacao'

/**
 * Um dia de trabalho do evento, como vem de `jornada_dias`.
 *
 * Os horários são opcionais porque dia de preparação não tem horário — é
 * exatamente o que "entrada livre" significa. Quando existem (vieram de uma
 * jornada recorrente), valem como EXPECTATIVA: alimentam o horário esperado
 * das listas de pendência e dos lembretes, sem recusar batida nenhuma.
 */
export type DiaDaJornada = {
  tipo?: TipoDia
  cancelado?: boolean
  entrada_inicio?: string | null
  entrada_fim?: string | null
  saida_inicio?: string | null
  saida_fim?: string | null
}

export type HorariosEsperados = {
  /** Quando se esperava a entrada. `null` = dia sem expectativa definida. */
  entrada: string | null
  /** Depois disto, quem não bateu vira pendência de entrada. */
  entradaLimite: string
  fim: string | null
  fimLimite: string
  /**
   * Quando faz sentido cobrar o meio do setor: seis horas depois da entrada
   * esperada, que é quando a janela de quem chegou no horário se fecha
   * (4h para abrir + 2h de duração). Quem chegou mais tarde ainda está dentro
   * da própria janela e por isso não aparece na lista — a conta é sempre
   * individual, esta é só a hora de olhar.
   */
  meioAlerta: string
}

/** "2026-09-10" + "08:00" → instante ISO em Brasília. */
function instanteBRT(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString()
}

export function horariosEsperados(
  evento: EventoJanelas,
  dia: string,
  jornadaDia?: DiaDaJornada | null
): HorariosEsperados {
  // No dia principal a janela configurada é a referência — é o único dia em
  // que ela trava, então também é o que se espera.
  const principal = jornadaDia?.tipo === 'principal' || (!jornadaDia && ehDiaPrincipal(evento, dia))
  const doEvento = (campo: keyof EventoJanelas) => (principal ? (evento[campo] ?? null) : null)

  const entrada = jornadaDia?.entrada_inicio ?? doEvento('janela_entrada_inicio')
  const fim = jornadaDia?.saida_inicio ?? doEvento('janela_fim_inicio')

  return {
    entrada,
    entradaLimite: jornadaDia?.entrada_fim ?? doEvento('janela_entrada_fim') ?? instanteBRT(dia, LIMITE_PADRAO_ENTRADA),
    fim,
    fimLimite: jornadaDia?.saida_fim ?? doEvento('janela_fim_fim') ?? instanteBRT(dia, LIMITE_PADRAO_SAIDA),
    /*
     * No dia principal o meio tem horário próprio, então cobrar é simples:
     * logo depois de a janela configurada fechar. Nos dias de preparação a
     * janela é individual, e o que dá pra fazer é olhar seis horas depois da
     * entrada esperada — quando a janela de quem chegou no horário se fecha
     * (4h para abrir + 2h de duração). Quem chegou mais tarde ainda está
     * dentro da própria janela e por isso não entra na lista.
     */
    // Sem `janela_meio_fim`: o meio não tem mais horário configurado em lugar
    // nenhum. Seis horas depois da entrada esperada é quando a janela de quem
    // chegou no horário se fecha (4h para abrir + 2h de duração).
    meioAlerta: new Date(
      new Date(entrada ?? instanteBRT(dia, ENTRADA_PADRAO)).getTime() +
      (HORAS_ATE_MEIO + DURACAO_JANELA_MEIO_H) * H_MS
    ).toISOString(),
  }
}

// ─── A fase da operação ──────────────────────────────────────────────────────

/**
 * Em que momento da operação aquele dia está.
 *
 * Um evento tem três fases, e cada uma fala com a equipe de um jeito:
 *
 *   montagem    — antes do dia do evento. Estrutura sendo levantada. Aviso
 *                 curto e objetivo: o pessoal já sabe o que vai fazer.
 *   evento      — o dia. É o único que exige explicação completa: horário de
 *                 portaria, QR Code, as três etapas. Quem erra aqui erra na
 *                 frente do cliente.
 *   desmontagem — depois. A operação inverte e o tom muda junto.
 *
 * O corte é o DIA DO EVENTO, não a data de fim: qualquer dia depois dele já é
 * desmontagem, mesmo que o evento tecnicamente termine na madrugada seguinte.
 * É como a operação fala — "amanhã é desmonte" —, e usar `data_fim` faria o
 * dia seguinte de um evento que vira a noite cair na fase errada.
 */
export type FaseDoDia = 'montagem' | 'evento' | 'desmontagem'

export function faseDoDia(dia: string, diaPrincipal: string): FaseDoDia {
  if (!diaPrincipal) return 'montagem'
  if (dia === diaPrincipal) return 'evento'
  return dia < diaPrincipal ? 'montagem' : 'desmontagem'
}

/** Hora em que o aviso do dia sai, nos dias de montagem e desmontagem. */
export const HORA_AVISO_DIA = '07:00'

// ─── Liberação do QR ─────────────────────────────────────────────────────────

/**
 * Quando o QR Code deve aparecer para a pessoa.
 *
 * O QR fica embaçado até pouco antes da hora de bater, e a folga é o que o
 * produtor configurou (`tolerancia_qr_min`). A razão não é estética: hoje dá
 * para mandar o print no grupo com dias de antecedência e alguém entrar no seu
 * lugar. Amarrando a liberação ao horário, a janela em que aquela imagem serve
 * para alguma coisa encolhe para os minutos em que a própria pessoa deveria
 * estar no portão.
 *
 * Só as etapas de QR contam (entrada e saída) — o meio é selfie, não usa QR.
 *
 * Devolve `liberaEm: null` quando não há horário nenhum a esperar: dia livre
 * sem expectativa configurada. Nesse caso o QR aparece, porque embaçar para
 * sempre impediria a pessoa de trabalhar.
 */
export function liberacaoDoQR(
  evento: EventoJanelas,
  dia: DiaDaJornada | null,
  agora: Date,
  toleranciaMin = 15
): { liberado: boolean; liberaEm: string | null } {
  if (!dia || dia.cancelado) return { liberado: false, liberaEm: null }

  const principal = dia.tipo === 'principal'
  // No dia principal manda a janela configurada; nos dias de preparação, a
  // expectativa da jornada, quando existir.
  const janelas: [string | null | undefined, string | null | undefined][] = principal
    ? [[evento.janela_entrada_inicio, evento.janela_entrada_fim],
       [evento.janela_fim_inicio, evento.janela_fim_fim]]
    : [[dia.entrada_inicio, dia.entrada_fim], [dia.saida_inicio, dia.saida_fim]]

  const validas = janelas.filter(([i]) => !!i) as [string, string | null | undefined][]
  // Dia sem horário nenhum: entrada e saída são livres, então o QR também é.
  if (!validas.length) return { liberado: true, liberaEm: null }

  const t = agora.getTime()
  const folga = Math.max(0, toleranciaMin) * 60_000

  // Já dentro de alguma janela (ou na folga antes dela): mostra.
  for (const [inicio, fim] of validas) {
    const abre = new Date(inicio).getTime() - folga
    // Sem fim configurado a etapa não fecha, então uma vez aberta segue aberta.
    const fecha = fim ? new Date(fim).getTime() + folga : Infinity
    if (t >= abre && t <= fecha) return { liberado: true, liberaEm: null }
  }

  // Ainda não: diz QUANDO abre, para a tela poder mostrar o horário e se
  // desbloquear sozinha na hora certa, sem a pessoa precisar recarregar.
  const futuras = validas
    .map(([inicio]) => new Date(inicio).getTime() - folga)
    .filter(x => x > t)
    .sort((a, b) => a - b)

  return futuras.length
    ? { liberado: false, liberaEm: new Date(futuras[0]).toISOString() }
    : { liberado: false, liberaEm: null } // o dia já passou
}

/** "2026-08-28" → "28/08". Só para as mensagens de recusa. */
function diaBR(dia: string): string {
  const [, mes, d] = dia.split('-')
  return `${d}/${mes}`
}
