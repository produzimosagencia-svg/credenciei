// Fila de mensagens automáticas via WhatsApp (Cloud API oficial da Meta).
// Framework-agnostic de propósito: importado tanto pelos server actions/rotas
// do Next.js quanto pelo worker standalone que roda 24/7 na VPS — por isso
// cria o próprio client Supabase (service role) em vez de depender de
// lib/supabase-server.ts, que usa cookies do Next.
//
// Mensagens iniciadas pelo sistema só podem ser TEMPLATE aprovado pela Meta
// (nunca texto livre) — por isso o conteúdo de cada tipo não é mais montado
// no agendamento; só decide QUANDO enviar. O texto real (nome do template +
// parâmetros {{1}}, {{2}}...) é montado na hora do envio, com dados frescos
// do banco — mesmo padrão que o alerta ao supervisor já usava antes.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { formatarBR } from './tz'
import {
  diaBRT, janelaMeio, horariosEsperados, periodoDoEvento, faseDoDia, HORA_AVISO_DIA,
  type EventoJanelas, type DiaDaJornada,
} from './janelas'
import { pendenciasDoDia, ROTULO_PENDENCIA } from './pendencias'
import { setorExigeMeio, diaExigeMeio } from './meio'
import { registrarEstadoWhatsApp } from './saude'
import { formatCpf } from './format'
import { formatarNumeroWhatsApp, enviarMensagem, estadoDaInstancia, ESPACAMENTO_MS, provedor, type ResultadoEnvio } from './whatsapp'
import { renderizarMensagem } from './mensagens-modelos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ANTECEDENCIA_REFORCO_MINUTOS = 2

/**
 * Quanto uma mensagem pode atrasar e ainda valer a pena enviar.
 *
 * O worker pode ficar horas fora do ar (VPS reiniciando, instância
 * desconectada, número derrubado). Quando ele volta, a fila inteira está
 * vencida — e sem este teto ele despejaria de uma vez todo o acúmulo: gente
 * recebendo "chegou a hora de bater o ponto" de madrugada, para um horário que
 * passou, tudo no mesmo minuto. É o padrão exato que faz o número ser banido,
 * e ainda por cima com conteúdo errado.
 *
 * Três horas cobre uma queda longa sem perder o lembrete do próprio turno.
 * Mensagem mais velha que isso é cancelada, não enviada: o horário dela já
 * passou e o assunto morreu junto.
 */
const ATRASO_MAXIMO_MIN = 3 * 60
const BATCH_SIZE_PADRAO = 10
const PACING_MS_MIN = 1000
const PACING_MS_MAX = 2000
const pacingAleatorio = () => PACING_MS_MIN + Math.floor(Math.random() * (PACING_MS_MAX - PACING_MS_MIN))
const BACKOFF_MINUTOS = [2, 10, 30] // por tentativa: 1ª, 2ª, 3ª...

export type TipoMensagem =
  | 'lembrete_entrada' | 'lembrete_meio' | 'lembrete_fim'
  | 'alerta_supervisor_entrada' | 'alerta_supervisor_meio' | 'alerta_supervisor_fim'
  | 'reforco_entrada' | 'reforco_meio' | 'reforco_fim'
  | 'confirmacao_escala'
  | 'aviso_dia_evento'
  | 'boas_vindas_funcionario'
  | 'aviso_montagem'
  | 'aviso_desmontagem'
  | 'disparo_manual'
  | 'veiculo_cadastrado'
  | 'credenciamento_negado'
  | 'alerta_supervisor_credenciamento'

/**
 * A que horas sai o aviso do dia do evento — PADRÃO DE TODO EVENTO.
 *
 * Horário FIXO, não derivado da abertura do credenciamento.
 *
 * Era duas horas antes da entrada abrir, e isso amarrava o aviso a um número
 * que o produtor configura pensando em portaria, não em mensagem: uma entrada
 * às 07:00 mandava WhatsApp para a equipe inteira às 05:00 da manhã. Acordar
 * mil pessoas de madrugada é ruim por si só, e ainda derrota o propósito — às
 * 8h a mensagem já está enterrada sob as outras do grupo.
 *
 * Sete da manhã a pedido do Juan: em evento grande a equipe começa a se
 * organizar cedo, e quem trabalha de manhã precisa da informação antes de sair
 * de casa. Cedo o bastante para servir, tarde o bastante para não acordar
 * ninguém de madrugada.
 */
const HORA_AVISO_DIA_EVENTO = '07:00'

/**
 * Antecedência usada quando o credenciamento inteiro acontece antes das 9h.
 *
 * Um evento cujo credenciamento abre 06:00 e FECHA 08:00 não pode ser avisado
 * às 9h — a mensagem chegaria com a portaria já fechada. Nesse caso o horário
 * fixo cede e o aviso volta a ser relativo à abertura.
 */
const ANTECEDENCIA_AVISO_DIA_HORAS = 2

/**
 * Quando o aviso do dia do evento deve sair.
 *
 * A regra olha o FECHAMENTO da entrada, não a abertura — e essa distinção é a
 * correção de um erro meu que chegou a produção.
 *
 * A primeira versão antecipava sempre que a entrada ABRIA cedo. No Kleber
 * Andrade a entrada abre 07:00 e fica aberta até 23:55, para um show às 18:30:
 * a antecipação disparou e as 56 mensagens foram parar às 05:00 da manhã —
 * exatamente o que o horário fixo existia para evitar.
 *
 * Abrir cedo não é problema: se a janela segue aberta no horário padrão, a
 * mensagem ainda serve, e a equipe de um evento noturno chega à tarde. O que
 * torna o horário padrão inútil é a janela inteira já ter terminado.
 */
function quandoAvisarDoDia(
  diaPrincipal: string,
  entradaAbreEm: string,
  entradaFechaEm: string | null,
  hora: string = HORA_AVISO_DIA_EVENTO,
): string {
  const horaPadrao = new Date(`${diaPrincipal}T${hora}:00-03:00`)

  // A janela ainda estará aberta no horário padrão? Então ele vale, e ponto.
  if (!entradaFechaEm || horaPadrao.getTime() < new Date(entradaFechaEm).getTime()) {
    return horaPadrao.toISOString()
  }

  // A janela inteira termina antes do horário padrão: avisa antes de ela abrir.
  return new Date(
    new Date(entradaAbreEm).getTime() - ANTECEDENCIA_AVISO_DIA_HORAS * 60 * 60_000,
  ).toISOString()
}

/**
 * O horário do aviso do dia DESTE evento — `eventos.hora_aviso_dia_evento`,
 * ou o padrão de sempre (07:00) quando não configurado.
 *
 * Existe porque o horário acertado à mão não sobrevive: no Pontal Weekend
 * (25/09/2026) o Juan pediu 10h, e a primeira ressincronização da fila
 * (toda edição de equipe dispara uma) recalculou pro padrão fixo e mandou
 * às 7h. Guardado no evento, qualquer ressincronização recalcula o MESMO
 * horário — não há mais o que sobrescrever.
 *
 * Consulta à parte e tolerante: sem a coluna (migração pendente), cai no
 * padrão, em vez de derrubar o agendamento do evento inteiro.
 */
async function horaDoAvisoDoDia(eventoId: string): Promise<string> {
  const { data, error } = await supabase
    .from('eventos').select('hora_aviso_dia_evento').eq('id', eventoId).maybeSingle()
  const hora = error ? null : ((data?.hora_aviso_dia_evento as string | null) ?? null)
  return hora && /^\d{2}:\d{2}$/.test(hora) ? hora : HORA_AVISO_DIA_EVENTO
}

type MomentoRegistro = 'entrada' | 'meio' | 'fim'

/** A qual etapa cada tipo de mensagem pertence. */
const MOMENTO_POR_TIPO: Partial<Record<TipoMensagem, MomentoRegistro>> = {
  lembrete_entrada: 'entrada', lembrete_meio: 'meio', lembrete_fim: 'fim',
  reforco_entrada: 'entrada', reforco_meio: 'meio', reforco_fim: 'fim',
  alerta_supervisor_entrada: 'entrada', alerta_supervisor_meio: 'meio', alerta_supervisor_fim: 'fim',
}

/*
 * As instruções falam em CREDENCIAMENTO, não em supervisor.
 *
 * Quem lê o QR é o posto de credenciamento — que pode ser o supervisor do
 * setor, a portaria ou outra pessoa da produção. Mandar procurar "seu
 * supervisor" fazia a pessoa ir atrás de quem, na maioria dos eventos, não é
 * quem faz a leitura.
 */
const INSTRUCAO_ETAPA: Record<MomentoRegistro, string> = {
  entrada: 'Vá ao credenciamento e mostre o QR Code da sua credencial',
  meio: 'Abra sua credencial e tire uma selfie, com a localização ativada',
  fim: 'Volte ao credenciamento e mostre o QR Code para registrar a saída',
}

/**
 * Nome do modelo de texto de cada tipo. Vários tipos compartilham o mesmo
 * modelo (a etapa entra como parâmetro).
 */
const TEMPLATE_POR_TIPO: Record<TipoMensagem, string> = {
  lembrete_entrada: 'lembrete_credenciamento',
  lembrete_meio: 'lembrete_credenciamento',
  lembrete_fim: 'lembrete_credenciamento',
  reforco_entrada: 'reforco_credenciamento',
  reforco_meio: 'reforco_credenciamento',
  reforco_fim: 'reforco_credenciamento',
  alerta_supervisor_entrada: 'alerta_supervisor_pendencia',
  alerta_supervisor_meio: 'alerta_supervisor_pendencia',
  alerta_supervisor_fim: 'alerta_supervisor_pendencia',
  confirmacao_escala: 'confirmacao_escala',
  aviso_dia_evento: 'aviso_dia_evento',
  boas_vindas_funcionario: 'boas_vindas_funcionario',
  aviso_montagem: 'aviso_montagem',
  aviso_desmontagem: 'aviso_desmontagem',
  // Resolvido na hora do envio: o template vem escolhido a mão pelo painel.
  disparo_manual: '',
  // Ainda sem template aprovado na Meta (o Juan vai mandar o nome depois) —
  // `montarEnvioTemplate` devolve `null` pra este tipo até lá, então este
  // nome nunca chega a ser usado num envio de verdade.
  veiculo_cadastrado: 'veiculo_cadastrado',
  // Mesma situação: sem template aprovado ainda pra avisar negativa de
  // credenciamento. `montarEnvioTemplate` devolve `null` até existir.
  credenciamento_negado: 'credenciamento_negado',
  // Reservado em 24/09/2026: aviso ao supervisor de que há credenciamento(s)
  // pendente(s) no setor dele. Template e gatilho de disparo (recorrência,
  // digest por setor) ainda a definir com o Juan — só o nome está travado
  // por enquanto, pra ele já poder cadastrar o template na Meta.
  alerta_supervisor_credenciamento: 'alerta_supervisor_credenciamento',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

/**
 * O link da credencial daquela pessoa — ou `null`, que cancela o envio.
 *
 * ⚠️ Nunca devolve algo "quase certo". Sem o token, a interpolação produziria
 * `.../credential/undefined`, que a mensagem entregaria como se fosse um link
 * de verdade: a pessoa clica, cai numa página de erro e conclui que o sistema
 * está quebrado. Mensagem que não sai é um problema visível no log; link
 * quebrado é um problema invisível na mão de quem precisa trabalhar.
 *
 * O `https://` também é conferido: `NEXT_PUBLIC_SITE_URL` já esteve apontando
 * para `http://localhost:3000` numa configuração real, e nesse dia todo mundo
 * teria recebido um endereço que não abre fora da máquina do desenvolvedor.
 */
function linkDaCredencial(qrToken: unknown, contexto: string, segmento: 'credential' | 'veiculo' = 'credential'): string | null {
  const token = typeof qrToken === 'string' ? qrToken.trim() : ''
  if (!token) {
    console.error(`[mensagens] ${contexto}: sem qr_token — envio cancelado`)
    return null
  }
  const url = `${SITE_URL}/${segmento}/${token}`
  if (!url.startsWith('https://')) {
    console.error(`[mensagens] ${contexto}: NEXT_PUBLIC_SITE_URL não é https (${SITE_URL}) — envio cancelado`)
    return null
  }
  return url
}

/**
 * Quais avisos automáticos estão ligados, do painel.
 *
 * Lido AQUI e não importado de `whatsapp-painel.ts` porque este arquivo roda
 * também no worker da VPS, fora do Next.js — importar de lá arrastaria
 * `supabase-server`, que depende de cookies do framework.
 *
 * Sem configuração salva, tudo ligado: é o comportamento que o sistema sempre
 * teve, e emudecer por omissão seria a pior falha possível aqui.
 */
async function fluxosLigados(): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabase
      .from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    return (data?.valor ?? {}) as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Um fluxo só está desligado quando o painel disse explicitamente `false`. */
const desligado = (fluxos: Record<string, boolean>, chave: string) => fluxos[chave] === false

/**
 * Este dia tem um horário de verdade combinado — não o padrão genérico que
 * `horariosEsperados` usa quando ninguém configurou nada?
 *
 * SÓ PARA O ALERTA AO SUPERVISOR. Verdadeiro no dia principal, ou em
 * qualquer dia de preparação com horário próprio setado em `jornada_dias` —
 * um fechamento real da operação (ex.: 8h da manhã do dia seguinte), que
 * vale a pena avisar o SUPERVISOR mesmo quando `avaliarEntradaSaida` nunca
 * bloqueia ninguém por horário nesse dia (dia de preparação é sempre livre
 * na trava — ver `lib/janelas.ts`). É informação, não cobrança.
 *
 * NÃO USAR para lembrete/reforço AO FUNCIONÁRIO. Esses dois só fazem sentido
 * no dia PRINCIPAL, porque é o único dia em que o sistema de verdade RECUSA
 * fora do horário — ameaçar um prazo que o próprio sistema aceita passar é
 * cobrança vazia. Foi exatamente isso que reapareceu na fila: um dia de
 * montagem com horário configurado em `jornada_dias` (para orientar a
 * equipe) reagendou lembrete/reforço de entrada e saída para 92 pessoas,
 * mesmo a entrada e a saída daquele dia sendo livres o tempo todo.
 */
function temHorarioReal(ehPrincipal: boolean, jornadaDia: DiaDaJornada | null | undefined): boolean {
  return ehPrincipal || !!jornadaDia?.entrada_fim || !!jornadaDia?.saida_fim
}

/** Teto de dias agendados de uma vez. Além disso a fila cresce sem necessidade. */
const HORIZONTE_DIAS = 45

type DiaDaOperacao = { data: string; jornadaDia: DiaDaJornada | null }

/**
 * Os dias em que se espera gente trabalhando.
 *
 * Com jornada configurada são os dias dela (a escala). Sem jornada, o evento é
 * de um dia e o dia é o principal. Em ambos os casos o que sai daqui é
 * EXPECTATIVA — ninguém é impedido de bater fora disso, ver lib/janelas.ts.
 */
async function diasDaOperacao(evento: EventoJanelas & { id: string }): Promise<DiaDaOperacao[]> {
  const hoje = diaBRT()
  const { data: dias } = await supabase
    .from('jornada_dias')
    .select('data, tipo, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', evento.id)
    .eq('cancelado', false)
    .gte('data', hoje)
    .order('data')
    .limit(HORIZONTE_DIAS)

  if (dias?.length) {
    return dias.map(d => ({ data: d.data as string, jornadaDia: d as DiaDaJornada }))
  }

  // Evento antigo, de antes de os dias serem materializados: o dia principal
  // continua sendo a data de início.
  const periodo = periodoDoEvento(evento)
  if (!periodo) return []
  const principal = periodo.primeiro
  return principal >= hoje ? [{ data: principal, jornadaDia: { tipo: 'principal' as const } }] : []
}

/**
 * Garante que cada funcionário e cada supervisor tenham, PARA CADA DIA da
 * operação, os avisos agendados: lembrete e reforço ao funcionário, alerta ao
 * supervisor sobre quem ficou pendente.
 *
 * Idempotente — roda toda vez que o evento ou a equipe mudam. Nunca mexe em
 * linhas já 'enviado'/'cancelado'; 'pendente'/'falhou' são reagendadas.
 *
 * ⚠️ O lembrete do MEIO não é agendado aqui, e não pode ser: o horário dele é
 * a entrada real da pessoa + 4h, que só existe depois de ela bater o ponto.
 * Quem agenda é `agendarMeioAposEntrada`, chamada no momento da entrada.
 */
export async function sincronizarAgendamentos(eventoId: string): Promise<void> {
  const { data: evento } = await supabase
    .from('eventos')
    .select('id, nome, msg_pre_evento_envio, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
    .eq('id', eventoId)
    .single()
  if (!evento) return

  // Só quem está ATIVADO trabalha — excedentes (acima do teto do setor) não
  // recebem lembrete nenhum até serem ativados no painel.
  const { data: funcionarios } = await supabase
    .from('funcionarios')
    .select('id, telefone, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .eq('ativo', true)
    // Quem ja foi descredenciado cumpriu o evento: nao recebe mais lembrete.
    .is('descredenciado_em', null)
    /*
     * O crachá do supervisor (origem 'supervisor', criado junto com o vínculo
     * dele ao setor) não entra na fila de funcionário: o supervisor já tem as
     * mensagens próprias dele, e o crachá existe pra passar no portão — pedido
     * explícito do Juan: nenhum WhatsApp novo por causa do QR do supervisor.
     * `origem is null` precisa entrar à parte: `neq` sozinho descarta os nulos.
     */
    .or('origem.is.null,origem.neq.supervisor')
  if (!funcionarios?.length) return

  const fornecedorIds = [...new Set(funcionarios.map(f => f.fornecedor_id))]
  const { data: supervisores } = await supabase
    .from('perfis')
    .select('id, telefone, fornecedor_id')
    .eq('role', 'supervisor')
    .eq('ativo', true)
    .in('fornecedor_id', fornecedorIds)
  // Havendo mais de um supervisor ativo no mesmo setor, o alerta vai só pro
  // primeiro: a chave de dedupe é por perfil+tipo+dia, e notificar vários
  // exigiria redesenhá-la.
  const supervisorPorFornecedor = new Map<string, { perfilId: string; telefone: string | null }>()
  for (const s of supervisores ?? []) {
    if (!supervisorPorFornecedor.has(s.fornecedor_id as string)) {
      supervisorPorFornecedor.set(s.fornecedor_id as string, { perfilId: s.id, telefone: s.telefone })
    }
  }

  const { data: existentes } = await supabase
    .from('mensagens_agendadas')
    .select('funcionario_id, perfil_id, tipo, data_ref, status')
    .eq('evento_id', eventoId)
  const travadosPorFuncionario = new Set(
    (existentes ?? [])
      .filter(m => m.funcionario_id && (m.status === 'enviado' || m.status === 'cancelado'))
      .map(m => `${m.funcionario_id}:${m.tipo}:${m.data_ref}`)
  )
  const travadosPorSupervisor = new Set(
    (existentes ?? [])
      .filter(m => m.perfil_id && (m.status === 'enviado' || m.status === 'cancelado'))
      .map(m => `${m.perfil_id}:${m.tipo}:${m.data_ref}`)
  )

  const agora = Date.now()
  const PLACEHOLDER = '(gerado no momento do envio)'
  const fluxos = await fluxosLigados()
  const dias = await diasDaOperacao(evento as EventoJanelas & { id: string })
  const diaPrincipal = diaBRT(evento.data_inicio as string)
  const horaAvisoDia = await horaDoAvisoDoDia(eventoId)
  /*
   * Quase sempre só `diaPrincipal` mesmo (o único dia principal de hoje) —
   * mas um festival de mais de uma noite pode ter outras linhas
   * `jornada_dias.tipo === 'principal'`, e `dias` já carrega esse dado.
   * `faseDoDia` precisa da lista inteira pra não classificar a segunda
   * noite como "desmontagem" da primeira.
   */
  const diasPrincipaisEvento = [...new Set([
    diaPrincipal,
    ...dias.filter(d => d.jornadaDia?.tipo === 'principal').map(d => d.data),
  ])]

  type LinhaFunc = {
    evento_id: string; funcionario_id: string; tipo: TipoMensagem; data_ref: string
    agendado_para: string; telefone: string; mensagem: string; condicao?: string
  }
  type LinhaSup = {
    evento_id: string; perfil_id: string; tipo: TipoMensagem; data_ref: string
    agendado_para: string; telefone: string; mensagem: string
  }
  const linhasFuncionario: LinhaFunc[] = []
  const linhasSupervisor: LinhaSup[] = []

  /** Agenda se for no futuro e ainda não estiver travada. */
  const agendarFunc = (
    funcId: string, telefone: string, tipo: TipoMensagem, dataRef: string, quando: string | null, condicao?: string
  ) => {
    if (!quando || travadosPorFuncionario.has(`${funcId}:${tipo}:${dataRef}`)) return
    if (new Date(quando).getTime() <= agora) return
    linhasFuncionario.push({
      evento_id: eventoId, funcionario_id: funcId, tipo, data_ref: dataRef,
      agendado_para: new Date(quando).toISOString(), telefone, mensagem: PLACEHOLDER,
      ...(condicao ? { condicao } : {}),
    })
  }

  for (const func of funcionarios) {
    // Confirmação de escala e aviso do dia falam do EVENTO, não de um dia da
    // escala: ficam presos ao dia principal, e por isso mandados uma vez só.
    if (evento.msg_pre_evento_envio) {
      agendarFunc(func.id, func.telefone, 'confirmacao_escala', diaPrincipal, evento.msg_pre_evento_envio as string)
    }

    for (const dia of dias) {
      /*
       * O aviso do dia do evento, PARA CADA dia principal.
       *
       * Um festival de mais de uma noite tem um dia principal por noite, cada
       * um com sua própria janela (`dia.jornadaDia.entrada_inicio` etc.,
       * quando configurada — ver lib/janelas.ts) — sem isso a mensagem de
       * sábado usaria os horários de sexta, ou não sairia nenhuma.
       *
       * Continua exigindo uma janela de entrada configurada (do dia, ou do
       * evento): o texto da mensagem é feito dela. Sem isso a equipe
       * receberia "ENTRADA — das a definir às a definir", pior que nada.
       */
      if (dia.jornadaDia?.tipo === 'principal' && !desligado(fluxos, 'aviso_dia_evento')) {
        const entradaInicio = dia.jornadaDia.entrada_inicio ?? evento.janela_entrada_inicio
        const entradaFim = dia.jornadaDia.entrada_fim ?? evento.janela_entrada_fim
        if (entradaInicio) {
          agendarFunc(
            func.id, func.telefone, 'aviso_dia_evento', dia.data,
            quandoAvisarDoDia(dia.data, entradaInicio as string, (entradaFim as string | null) ?? null, horaAvisoDia),
          )
        }
      }

      /*
       * O aviso do dia, em cada dia de preparação.
       *
       * Sem ele os dias de montagem e desmontagem ficavam mudos: eles não têm
       * horário, e todo o resto do agendamento parte de um horário. A equipe
       * simplesmente não era avisada de que hoje tinha trabalho.
       *
       * O texto muda com a FASE porque o que a pessoa precisa saber muda:
       * montar não é desmontar, e nenhum dos dois é o dia do evento.
       */
      const fase = faseDoDia(dia.data, diasPrincipaisEvento)
      const chaveFase = fase === 'montagem' ? 'aviso_montagem' : 'aviso_desmontagem'
      if (fase !== 'evento' && !desligado(fluxos, chaveFase)) {
        agendarFunc(
          func.id, func.telefone,
          fase === 'montagem' ? 'aviso_montagem' : 'aviso_desmontagem',
          dia.data,
          new Date(`${dia.data}T${HORA_AVISO_DIA}:00-03:00`).toISOString(),
        )
      }

      const esperado = horariosEsperados(evento as EventoJanelas, dia.data, dia.jornadaDia)

      // Lembrete quando se espera a pessoa; reforço pouco antes de ela virar
      // pendência. Sem horário esperado (dia livre sem jornada) não há o que
      // lembrar — cobrar horário que ninguém combinou só gera ruído.
      /*
       * Sem horário ESPERADO, não há o que lembrar nem o que cobrar.
       *
       * `entradaLimite` e `fimLimite` sempre têm um valor — caem num padrão
       * genérico (12:00 / 23:59) quando o dia não tem horário configurado.
       * Usar esse padrão para agendar cobrança era o erro: num dia em que a
       * entrada é livre, ninguém está atrasado às 12:00, e mesmo assim a
       * equipe inteira recebia "sua presença ainda não foi registrada".
       *
       * O padrão continua servindo para classificar pendência na tela do
       * supervisor, que é olhar passivo. Mandar mensagem é ativo, e ativo só
       * quando existe um horário combinado de verdade.
       */
      /*
       * BATIDA LIVRE CALA O LEMBRETE E O REFORÇO — e não por economia.
       *
       * Os dois textos afirmam coisas que deixam de ser verdade:
       *
       *   lembrete  "Você tem até 23:55 — depois desse horário o sistema não
       *             aceita mais."   → aceita. É mentira, e faz gente correr.
       *
       *   reforço   "Atenção! Sua presença ainda não foi registrada."
       *             → para quem entra na escala das 2h da manhã, é acusação
       *             por algo que não aconteceu.
       *
       * ATÉ NOS DIAS DE MONTAGEM/DESMONTAGEM — mesmo problema, mesma causa.
       *
       * `entradaLimite`/`fimLimite` sempre respondem um horário: sem jornada
       * configurada para o dia, caem no padrão genérico (12:00 / 23:59). Só
       * que dia de preparação já é livre na trava (o leitor de QR nunca
       * bloqueia por horário nesses dias — ver `avaliarEntradaSaida`), e até
       * esta correção lembrete/reforço continuavam cobrando o padrão mesmo
       * assim: às 12:00 em ponto de um dia de montagem, quem ainda não tinha
       * chegado recebia "sua presença ainda não foi registrada" por um
       * horário que ninguém combinou.
       *
       * Por isso a trava (que liga lembrete e reforço) só existe no DIA
       * PRINCIPAL sem batida livre — o único dia em que a entrada/saída
       * realmente têm um horário combinado e cobrável.
       *
       * O aviso do dia continua: ele informa, não cobra.
       */
      const livre = (evento as EventoJanelas).batida_livre === true
      // `jornada_dias.tipo`, não a string única — um festival de mais de uma
      // noite tem mais de um dia com trava real (ver lib/janelas.ts).
      const ehPrincipal = dia.jornadaDia?.tipo === 'principal'
      /*
       * SÓ o dia principal, e só sem batida livre — nunca `temHorarioReal`.
       * Ver o comentário da função: aquele fallback de jornada configurada
       * serve ao alerta do SUPERVISOR, não à cobrança ao funcionário.
       */
      const diaComTrava = ehPrincipal && !livre

      /*
       * O reforço só existe se o PRAZO existe de verdade.
       *
       * `entradaLimite`/`fimLimite` nunca vêm vazios: sem fim configurado, caem
       * no padrão genérico (12:00 / 23:59). No Pontal Weekend (entrada a partir
       * das 17h, sem hora de fechar) isso agendou "sua entrada ainda não foi
       * registrada, prazo 12:00" pras 11h58 — cinco horas antes do portão abrir
       * — e o mesmo com a saída às 23h57, que só abre às 3h. Janela aberta, sem
       * fim, não tem prazo pra cobrar.
       */
      const prazoEntradaReal = dia.jornadaDia?.entrada_fim ?? (evento as EventoJanelas).janela_entrada_fim ?? null
      const prazoSaidaReal = dia.jornadaDia?.saida_fim ?? (evento as EventoJanelas).janela_fim_fim ?? null

      /*
       * O LEMBRETE também precisa de prazo real — o texto aprovado na Meta
       * imprime "Prazo para conclusão: {{4}}". Sem fim configurado, {{4}}
       * virava o 12:00 genérico: no Pontal Weekend (25/09/2026) 110 pessoas
       * receberam às 17h "registro pendente, prazo 12:00". Janela aberta,
       * sem fim, não tem lembrete de prazo — nem reforço.
       */
      if (diaComTrava && prazoEntradaReal && !desligado(fluxos, 'lembrete')) {
        agendarFunc(func.id, func.telefone, 'lembrete_entrada', dia.data, esperado.entrada)
      }
      if (diaComTrava && esperado.entrada && prazoEntradaReal && !desligado(fluxos, 'reforco')) {
        agendarFunc(func.id, func.telefone, 'reforco_entrada', dia.data,
          new Date(new Date(esperado.entradaLimite).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000).toISOString(),
          'sem_registro')
      }

      if (diaComTrava && prazoSaidaReal && !desligado(fluxos, 'lembrete')) {
        agendarFunc(func.id, func.telefone, 'lembrete_fim', dia.data, esperado.fim)
      }
      if (diaComTrava && esperado.fim && prazoSaidaReal && !desligado(fluxos, 'reforco')) {
        agendarFunc(func.id, func.telefone, 'reforco_fim', dia.data,
          new Date(new Date(esperado.fimLimite).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000).toISOString(),
          'sem_registro')
      }
    }
  }

  // Alerta ao supervisor: UMA mensagem por setor, etapa e DIA. O conteúdo (quem
  // está faltando) só dá pra saber na hora do envio; aqui só marca o gatilho.
  for (const dia of dias) {
    if (desligado(fluxos, 'alerta_supervisor')) break
    const esperado = horariosEsperados(evento as EventoJanelas, dia.data, dia.jornadaDia)
    /*
     * ALERTA AO SUPERVISOR SÓ NO DIA DO EVENTO.
     *
     * Cada mensagem de WhatsApp é cobrada, e o volume estourou: num evento de
     * onze dias com 523 pessoas, a fila chegou a 2.790 mensagens pendentes —
     * R$ 22 gastos em dois dias de montagem, com projeção de R$ 220 no
     * evento inteiro. A maior parte não informava nada:
     *
     *   • entrada e saída são LIVRES nos dias de preparação (e no dia do
     *     evento, com batida livre). Cobrar quem "não bateu" um horário que
     *     não existe é alarme falso — e alarme falso repetido faz o
     *     supervisor parar de ler os de verdade;
     *   • o meio na montagem interessa pouco: a operação é pequena e o
     *     supervisor está junto da equipe.
     *
     * Fica o que o organizador de fato usa: no DIA DO EVENTO, quem não
     * registrou o meio, e quem não fez a saída depois do fechamento. Nos
     * demais dias, a tela de pendências continua mostrando tudo — a
     * informação não sumiu, só parou de virar mensagem paga.
     */
    const ehDiaPrincipal = dia.jornadaDia?.tipo === 'principal'
    const temHorario = temHorarioReal(ehDiaPrincipal, dia.jornadaDia)
    // Mesmo motivo do reforço ao funcionário: sem fim de saída configurado,
    // `fimLimite` é o 23:59 genérico — alertar "não saíram" às 23h59 de um
    // show cuja saída só abre às 3h é alarme falso.
    const prazoSaidaReal = dia.jornadaDia?.saida_fim ?? (evento as EventoJanelas).janela_fim_fim ?? null
    const gatilhos: [TipoMensagem, string][] = ehDiaPrincipal
      ? [
          ['alerta_supervisor_meio', esperado.meioAlerta],
          ...(temHorario && prazoSaidaReal ? [['alerta_supervisor_fim', esperado.fimLimite] as [TipoMensagem, string]] : []),
        ]
      : []

    for (const [tipo, quando] of gatilhos) {
      if (new Date(quando).getTime() <= agora) continue
      for (const [, supervisor] of supervisorPorFornecedor) {
        if (!supervisor.telefone) continue
        if (travadosPorSupervisor.has(`${supervisor.perfilId}:${tipo}:${dia.data}`)) continue
        linhasSupervisor.push({
          evento_id: eventoId, perfil_id: supervisor.perfilId, tipo, data_ref: dia.data,
          agendado_para: new Date(quando).toISOString(), telefone: supervisor.telefone, mensagem: PLACEHOLDER,
        })
      }
    }
  }

  if (linhasFuncionario.length) {
    await supabase.from('mensagens_agendadas').upsert(linhasFuncionario, { onConflict: 'evento_id,funcionario_id,tipo,data_ref' })
  }
  if (linhasSupervisor.length) {
    await supabase.from('mensagens_agendadas').upsert(linhasSupervisor, { onConflict: 'perfil_id,tipo,data_ref' })
  }

  await cancelarOqueNaoValeMais(eventoId, [...linhasFuncionario, ...linhasSupervisor])
}

/**
 * Cancela o que esta função DEIXOU de agendar.
 *
 * Ela sempre soube adicionar e nunca soube remover: mudar uma regra parava de
 * criar mensagem nova, mas as antigas continuavam na fila, agendadas, e eram
 * enviadas assim mesmo. Foi assim que 2.790 mensagens sobreviveram a três
 * mudanças de regra seguidas — cobrando prazo em dia de batida livre, para
 * 523 pessoas, com cada envio faturado.
 *
 * Só toca em `pendente`, e só nos tipos que ela mesma agenda. O que já foi
 * enviado é histórico; `disparo_manual` e `boas_vindas_funcionario` são de
 * outra origem e não podem ser varridos por engano.
 */
type LinhaAgendada = { tipo: string; data_ref: string; funcionario_id?: string; perfil_id?: string }

async function cancelarOqueNaoValeMais(eventoId: string, mantidas: LinhaAgendada[]) {
  const TIPOS_DESTA_FUNCAO: TipoMensagem[] = [
    'lembrete_entrada', 'lembrete_fim', 'reforco_entrada', 'reforco_fim',
    'aviso_dia_evento', 'aviso_montagem', 'aviso_desmontagem', 'confirmacao_escala',
    'alerta_supervisor_entrada', 'alerta_supervisor_meio', 'alerta_supervisor_fim',
  ]

  const { data: naFila } = await supabase
    .from('mensagens_agendadas')
    .select('id, tipo, data_ref, funcionario_id, perfil_id')
    .eq('evento_id', eventoId)
    .eq('status', 'pendente')
    .in('tipo', TIPOS_DESTA_FUNCAO)
  if (!naFila?.length) return

  const chave = (l: LinhaAgendada) => `${l.tipo}|${l.data_ref}|${l.funcionario_id ?? ''}|${l.perfil_id ?? ''}`
  const ainda = new Set(mantidas.map(chave))

  const orfas = naFila.filter(l => !ainda.has(chave(l as LinhaAgendada))).map(l => l.id as string)
  if (!orfas.length) return

  /*
   * Em lotes: `in` com milhares de ids estoura o limite de tamanho da URL do
   * PostgREST, e a limpeza falharia calada justamente no caso que mais
   * precisa dela — o da fila grande.
   */
  for (let i = 0; i < orfas.length; i += 200) {
    await supabase
      .from('mensagens_agendadas')
      .update({ status: 'cancelado', erro: 'Cancelada: a regra que a agendou deixou de valer.' })
      .in('id', orfas.slice(i, i + 200))
  }
  console.log(`[agendamentos] ${orfas.length} mensagens canceladas por regra vencida (evento ${eventoId})`)
}

/**
 * Cancela na hora as mensagens do MEIO que a nova configuração desligou.
 *
 * `cancelarOqueNaoValeMais` não dá conta destas: ela só varre os tipos que
 * ela mesma agenda, e `lembrete_meio`/`reforco_meio` nascem em
 * `agendarMeioAposEntrada`, na hora que a pessoa bate a entrada. Resultado:
 * desligar o meio de um setor parava de criar mensagem nova, mas as de quem
 * já tinha entrado ficavam na fila — e o número não caía (pedido do Juan,
 * 03/09/2026: "precisa diminuir imediato").
 *
 * Roda SÍNCRONA no salvar, não em `after()`: o ponto é o número mudar na
 * frente de quem acabou de desligar. Em background, ele só cairia no
 * próximo refresh, e a tela pareceria ter ignorado o clique.
 *
 * Cancela (não apaga) pelo mesmo motivo do resto do arquivo: `cancelado`
 * some da fila e do custo, mas continua explicando no histórico por que
 * aquela mensagem não saiu.
 */
export async function cancelarMeioDesligado(eventoId: string): Promise<number> {
  const { data: naFila } = await supabase
    .from('mensagens_agendadas')
    .select('id, funcionario_id, data_ref')
    .eq('evento_id', eventoId)
    .eq('status', 'pendente')
    .in('tipo', ['lembrete_meio', 'reforco_meio'])
  if (!naFila?.length) return 0

  // Os dias que AINDA pedem meio. Um dia desligado derruba todo mundo dele,
  // independente do setor.
  const { data: dias } = await supabase
    .from('jornada_dias').select('data, exige_meio').eq('evento_id', eventoId)
  const diaPede = new Map((dias ?? []).map(d => [d.data as string, d.exige_meio === true]))

  // Os setores que AINDA pedem meio, e o setor de cada pessoa da fila.
  const { data: setores } = await supabase
    .from('fornecedores').select('id, exige_meio').eq('evento_id', eventoId)
  const setorPede = new Map((setores ?? []).map(f => [f.id as string, f.exige_meio === true]))

  const ids = [...new Set(naFila.map(m => m.funcionario_id).filter(Boolean))] as string[]
  const setorDe = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('funcionarios').select('id, fornecedor_id').in('id', ids.slice(i, i + 200))
    for (const f of data ?? []) setorDe.set(f.id as string, f.fornecedor_id as string)
  }

  const orfas = naFila.filter(m => {
    if (diaPede.get(m.data_ref as string) === false) return true
    const setor = setorDe.get(m.funcionario_id as string)
    return !!setor && setorPede.get(setor) === false
  }).map(m => m.id as string)
  if (!orfas.length) return 0

  // Em lotes: `in` com milhares de ids estoura o tamanho da URL do PostgREST.
  for (let i = 0; i < orfas.length; i += 200) {
    await supabase
      .from('mensagens_agendadas')
      .update({ status: 'cancelado', erro: 'Cancelada: o meio foi desligado para este setor/dia.' })
      .in('id', orfas.slice(i, i + 200))
  }
  console.log(`[agendamentos] ${orfas.length} mensagens de meio canceladas (evento ${eventoId})`)
  return orfas.length
}

/**
 * Esta pessoa, NESTE dia, pede a confirmação do meio?
 *
 * Duas chaves, as duas precisam estar ligadas: o setor dela e o dia da
 * operação — a regra inteira vive em `lib/meio.ts`, e a leitura de cada
 * coluna é tolerante a migração pendente lá.
 *
 * Uma consulta a mais pelo funcionário porque é assim que os chamadores têm
 * a informação em mãos: nenhum deles conhece o setor de antemão.
 */
async function pedeMeio(funcionarioId: string, eventoId: string, dataRef: string): Promise<boolean> {
  const { data: func } = await supabase
    .from('funcionarios').select('fornecedor_id').eq('id', funcionarioId).single()
  if (!func?.fornecedor_id) return false
  if (!(await diaExigeMeio(eventoId, dataRef))) return false
  return setorExigeMeio(func.fornecedor_id as string)
}

/**
 * Agenda os avisos do MEIO assim que a pessoa bate a entrada.
 *
 * Existe porque o meio deixou de ter horário fixo: ele é a entrada real + 4h,
 * então não há como agendar antes de a entrada acontecer. Chamada de
 * `registrarPresencaQR`, em background.
 *
 * O reforço vai perto do fim da janela e é condicional — quem já tirou a selfie
 * não recebe nada.
 */
export async function agendarMeioAposEntrada(params: {
  eventoId: string
  funcionarioId: string
  telefone: string
  entradaEm: string
  dataRef: string
}): Promise<void> {
  const telefone = (params.telefone ?? '').replace(/\D/g, '')
  if (!telefone) return
  const fluxos = await fluxosLigados()
  if (desligado(fluxos, 'lembrete') && desligado(fluxos, 'reforco')) return

  // Crachá do supervisor não recebe lembrete de funcionário (mesma regra de
  // `sincronizarAgendamentos`).
  const { data: quem } = await supabase.from('funcionarios').select('origem').eq('id', params.funcionarioId).maybeSingle()
  if (quem?.origem === 'supervisor') return

  /*
   * Setor que não pede o meio — ou DIA que não pede — não gera mensagem.
   *
   * É aqui que a economia de WhatsApp acontece de verdade: são duas
   * mensagens por pessoa por dia (lembrete + reforço), e cada uma é cobrada.
   * Com 630 pessoas, um dia de meio ligado sem necessidade passa de mil
   * mensagens. Ver `lib/meio.ts`.
   */
  if (!(await pedeMeio(params.funcionarioId, params.eventoId, params.dataRef))) return

  const janela = janelaMeio(params.entradaEm)
  const reforco = new Date(new Date(janela.fim).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000).toISOString()

  const linhas = [
    { tipo: 'lembrete_meio' as TipoMensagem, agendado_para: janela.inicio, condicao: null },
    { tipo: 'reforco_meio' as TipoMensagem, agendado_para: reforco, condicao: 'sem_registro' },
  ].map(l => ({
    evento_id: params.eventoId,
    funcionario_id: params.funcionarioId,
    tipo: l.tipo,
    data_ref: params.dataRef,
    agendado_para: l.agendado_para,
    telefone,
    mensagem: '(gerado no momento do envio)',
    condicao: l.condicao,
  }))

  await supabase.from('mensagens_agendadas')
    .upsert(linhas, { onConflict: 'evento_id,funcionario_id,tipo,data_ref' })
}

/**
 * Agenda o envio imediato das boas-vindas ao funcionário que acabou de se
 * cadastrar: link da credencial + explicação das três etapas. É o tutorial do
 * sistema traduzido pro WhatsApp, pra quem não vai abrir o link na hora.
 *
 * Idempotente pelo mesmo índice único dos outros tipos
 * (evento_id, funcionario_id, tipo) — cadastro repetido não gera duplicata.
 */
export async function agendarBoasVindasFuncionario(params: {
  eventoId: string
  funcionarioId: string
  telefone: string
}): Promise<void> {
  const telefone = params.telefone.replace(/\D/g, '')
  if (!telefone) return
  if (desligado(await fluxosLigados(), 'boas_vindas_funcionario')) return

  const { error } = await supabase.from('mensagens_agendadas').insert([{
    evento_id: params.eventoId,
    funcionario_id: params.funcionarioId,
    tipo: 'boas_vindas_funcionario',
    agendado_para: new Date().toISOString(),
    telefone,
    mensagem: 'boas-vindas (montado no envio)',
  }])
  if (error && error.code !== '23505') throw error // 23505 = já agendado, ignora
}

/**
 * Agenda a confirmação de cadastro de veículo — mesmo molde de
 * `agendarBoasVindasFuncionario`, mas apontando pro veículo, não pro
 * funcionário (o condutor pode nem ser da equipe).
 */
export async function agendarConfirmacaoVeiculo(params: {
  eventoId: string
  veiculoId: string
  telefone: string
}): Promise<void> {
  const telefone = params.telefone.replace(/\D/g, '')
  if (!telefone) return
  if (desligado(await fluxosLigados(), 'veiculo_cadastrado')) return

  const { error } = await supabase.from('mensagens_agendadas').insert([{
    evento_id: params.eventoId,
    veiculo_id: params.veiculoId,
    tipo: 'veiculo_cadastrado',
    agendado_para: new Date().toISOString(),
    telefone,
    mensagem: 'confirmação de veículo (montado no envio)',
  }])
  if (error && error.code !== '23505') throw error // 23505 = já agendado, ignora
}

/**
 * Agenda o aviso de credenciamento negado — mesmo molde de
 * `agendarConfirmacaoVeiculo`. Sem template aprovado ainda: `montarEnvioTemplate`
 * devolve `null` pra este tipo até existir, então fica pendente na fila sem
 * nunca falhar (a decisão em si já foi aplicada, isto é só o aviso).
 */
export async function agendarCredenciamentoNegado(params: {
  eventoId: string
  funcionarioId: string
  telefone: string
}): Promise<void> {
  const telefone = params.telefone.replace(/\D/g, '')
  if (!telefone) return

  const { error } = await supabase.from('mensagens_agendadas').insert([{
    evento_id: params.eventoId,
    funcionario_id: params.funcionarioId,
    tipo: 'credenciamento_negado',
    agendado_para: new Date().toISOString(),
    telefone,
    mensagem: 'credenciamento negado (montado no envio)',
  }])
  if (error && error.code !== '23505') throw error // 23505 = já agendado, ignora
}

/**
 * Contagem regressiva do aviso ao supervisor: dispara quando faltam
 * exatamente estes números de dias para `eventos.data_inicio` — não é aviso
 * diário. Template aprovado pelo Juan/sócio (24/09/2026) já escreve o corpo
 * como "Faltam {{2}} para o evento", com exemplo "5 dias"/"1 dia" — os dois
 * pontos abaixo batem com esse texto. Mudar a cadência é só editar este array.
 */
const DIAS_ANTES_ALERTA_SUPERVISOR_CREDENCIAMENTO = [5, 1] as const

/**
 * Horário do disparo no dia certo. PLACEHOLDER — nem o Juan nem o sócio
 * definiram hora ainda, só a contagem de dias. Mesmo padrão de
 * `HORA_AVISO_DIA_EVENTO`: uma constante só, fácil de trocar depois.
 */
const HORA_ALERTA_SUPERVISOR_CREDENCIAMENTO = '09:00'

const prazoPorExtenso = (dias: number) => dias === 1 ? '1 dia' : `${dias} dias`
const quantidadePorExtenso = (n: number) => n === 1 ? '1 pessoa' : `${n} pessoas`

/**
 * Agenda o aviso ao supervisor quando o evento dele entra num dos pontos de
 * contagem regressiva (`DIAS_ANTES_ALERTA_SUPERVISOR_CREDENCIAMENTO`) E o
 * setor dele ainda tem credenciamento pendente.
 *
 * Diferente dos outros `agendarX` deste arquivo (chamados no momento de um
 * evento específico — cadastro, aprovação, negativa), este roda em VARREDURA
 * PERIÓDICA: chamado a cada execução do cron de mensagens (ver
 * app/api/cron/enviar-mensagens/route.ts). Chamar isto todo minuto não
 * duplica nada — dedupe pelo índice único `(perfil_id, tipo, data_ref)` que
 * os alertas de supervisor já usam (`sincronizarAgendamentos`): como cada
 * ponto de contagem cai num dia calendário diferente, cada um vira sua
 * própria linha, e reprocessar o mesmo dia várias vezes não duplica.
 *
 * Sem template aprovado ainda quando isto foi escrito: `montarEnvioTemplate`
 * pode devolver `null` até a confirmação final — a linha fica agendada e
 * nunca sai até lá, sem erro, sem reenvio malfeito.
 */
export async function agendarAlertasSupervisorCredenciamento(): Promise<void> {
  if (desligado(await fluxosLigados(), 'alerta_supervisor_credenciamento')) return

  const hoje = diaBRT()
  const pontosDeContagem = DIAS_ANTES_ALERTA_SUPERVISOR_CREDENCIAMENTO.map(dias => {
    const alvo = new Date(`${hoje}T00:00:00-03:00`)
    alvo.setDate(alvo.getDate() + dias)
    return { dias, dataAlvo: diaBRT(alvo) }
  })

  // Todo evento ativo que ainda não começou — filtra em memória pelo dia
  // exato (diaBRT), não por comparação SQL direta: data_inicio é timestamptz,
  // e é o mesmo helper usado em todo o resto do código pra normalizar fuso.
  const { data: eventos } = await supabase
    .from('eventos').select('id, nome, data_inicio').eq('ativo', true).gte('data_inicio', hoje)
  if (!eventos?.length) return

  const eventoPorContagem = new Map<string, { eventoId: string; eventoNome: string; dias: number }>()
  for (const evento of eventos) {
    const diaDoEvento = diaBRT(evento.data_inicio as string)
    const ponto = pontosDeContagem.find(p => p.dataAlvo === diaDoEvento)
    if (ponto) eventoPorContagem.set(evento.id as string, { eventoId: evento.id as string, eventoNome: evento.nome as string, dias: ponto.dias })
  }
  if (!eventoPorContagem.size) return

  const eventoIds = [...eventoPorContagem.keys()]
  const { data: pendentes } = await supabase
    .from('funcionarios')
    .select('fornecedor_id, fornecedores!inner(evento_id)')
    .eq('status_credenciamento', 'pendente')
    .in('fornecedores.evento_id', eventoIds)
  if (!pendentes?.length) return

  const fornecedorIds = [...new Set(pendentes.map(p => p.fornecedor_id as string))]
  const { data: supervisores } = await supabase
    .from('perfis')
    .select('id, telefone, fornecedor_id')
    .eq('role', 'supervisor').eq('ativo', true)
    .in('fornecedor_id', fornecedorIds)
  // Mais de um supervisor ativo no mesmo setor: o alerta vai só pro primeiro,
  // mesma limitação já aceita em `sincronizarAgendamentos` (a chave de
  // dedupe é por perfil, notificar vários pediria redesenhá-la).
  const supervisorPorFornecedor = new Map<string, { perfilId: string; telefone: string | null }>()
  for (const s of supervisores ?? []) {
    if (!supervisorPorFornecedor.has(s.fornecedor_id as string)) {
      supervisorPorFornecedor.set(s.fornecedor_id as string, { perfilId: s.id, telefone: s.telefone })
    }
  }

  const linhas = fornecedorIds
    .map(fornecedorId => {
      const funcionario = pendentes.find(p => p.fornecedor_id === fornecedorId)
      const eventoId = (funcionario?.fornecedores as unknown as { evento_id: string } | null)?.evento_id
      const contagem = eventoId ? eventoPorContagem.get(eventoId) : null
      const supervisor = supervisorPorFornecedor.get(fornecedorId)
      if (!contagem || !supervisor?.telefone) return null

      const dataRef = diaBRT()
      const agendadoPara = new Date(`${dataRef}T${HORA_ALERTA_SUPERVISOR_CREDENCIAMENTO}:00-03:00`)
      // Cron já passou da hora hoje? Manda na hora mesmo, atrasado, em vez de
      // pular o único dia em que esse ponto de contagem existe.
      return {
        evento_id: contagem.eventoId, perfil_id: supervisor.perfilId,
        tipo: 'alerta_supervisor_credenciamento', data_ref: dataRef,
        agendado_para: agendadoPara.toISOString(), telefone: supervisor.telefone,
        mensagem: 'alerta de credenciamento pendente (montado no envio)',
      }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
  if (!linhas.length) return

  const { error } = await supabase.from('mensagens_agendadas')
    .upsert(linhas, { onConflict: 'perfil_id,tipo,data_ref', ignoreDuplicates: true })
  if (error) console.error('[mensagens] alerta_supervisor_credenciamento não agendou:', error.message)
}

/**
 * Coloca uma comunicação de supervisor na fila oficial, com retry, histórico
 * e status de entrega iguais aos demais disparos. `perfil_id` fica nulo para
 * permitir novas escalas da mesma pessoa em eventos diferentes.
 */
export async function agendarTemplateSupervisor(params: {
  eventoId: string
  telefone: string
  template: 'cadastro_supervisor_cpf_link' | 'supervisor_escalado_evento'
  parametros: string[]
}): Promise<void> {
  const telefone = params.telefone.replace(/\D/g, '')
  if (!telefone) return
  const agora = new Date()
  const { error } = await supabase.from('mensagens_agendadas').insert({
    evento_id: params.eventoId,
    tipo: 'disparo_manual',
    data_ref: agora.toISOString().slice(0, 10),
    agendado_para: agora.toISOString(),
    telefone,
    mensagem: JSON.stringify({
      campanhaId: `supervisor-${randomUUID()}`,
      origem: 'automatico',
      template: params.template,
      parametros: params.parametros,
    }),
  })
  if (error) throw new Error(`Não foi possível agendar a mensagem do supervisor: ${error.message}`)
}

/**
 * Processa um lote de mensagens devidas: reivindica (claim atômico via UPDATE
 * condicional — sem função de banco), checa condição (quando houver), monta
 * o template + parâmetros com dados frescos, envia pela Cloud API, loga cada
 * tentativa e aplica retry com backoff. Chamado tanto pelo worker da VPS
 * (a cada ~20s) quanto pela rota /api/cron (fallback via Vercel Cron).
 */
export async function processarFilaMensagens(limite = BATCH_SIZE_PADRAO): Promise<{ processadas: number }> {
  // Interruptor de emergência: seta WHATSAPP_PAUSADO=true (worker na VPS e/ou
  // Vercel) pra parar todo envio na hora, sem precisar redeployar.
  if (process.env.WHATSAPP_PAUSADO === 'true') return { processadas: 0 }

  /*
   * A instância precisa estar CONECTADA antes de qualquer coisa.
   *
   * Descoberto testando: com a instância fechada (QR não lido, sessão
   * derrubada, número banido), o `sendText` da Evolution não recusa — ele
   * PENDURA até estourar o timeout de 20s. Sem esta checagem, um lote de 10
   * levaria mais de 3 minutos preso e, pior, gastaria as três tentativas de
   * cada mensagem até marcá-las como `falhou` em definitivo. Lembrete de
   * evento perdido não volta.
   *
   * Uma consulta por lote resolve: se está fechada, nem reivindica as
   * mensagens — elas ficam `pendente` esperando a conexão voltar.
   */
  const canal = await estadoDaInstancia()
  // Grava SEMPRE, conectada ou não: é o "sinal de vida" que a tela lê para
  // avisar tanto que o WhatsApp caiu quanto que o worker parou de rodar.
  await registrarEstadoWhatsApp(canal.conectada, canal.estado)
  if (!canal.conectada) {
    console.warn(`[mensagens] instância desconectada (${canal.estado}) — nada enviado, fila preservada`)
    return { processadas: 0 }
  }

  const agoraISO = new Date().toISOString()

  /*
   * Convite de acesso não pode esperar atrás da operação do evento.
   *
   * Supervisor novo precisa do link para criar a senha antes de conseguir
   * entrar no sistema. Durante um evento, a fila pode ter centenas de
   * lembretes de entrada/meio/saída mais antigos; como a seleção era apenas
   * cronológica, o convite imediato ficava vários minutos no fim da fila.
   *
   * O conteúdo de `disparo_manual` é texto JSON. Filtrar pela assinatura
   * exata gravada por `agendarTemplateSupervisor` prioriza somente o convite
   * de acesso — campanhas manuais continuam na ordem normal e não furam a
   * fila operacional inteira.
   */
  const { data: acessosPrioritarios } = await supabase
    .from('mensagens_agendadas')
    .select('id')
    .eq('status', 'pendente')
    .eq('tipo', 'disparo_manual')
    .lte('agendado_para', agoraISO)
    .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agoraISO}`)
    .like('mensagem', '%"template":"cadastro_supervisor_cpf_link"%')
    .order('agendado_para', { ascending: true })
    .limit(limite)

  const idsPrioritarios = (acessosPrioritarios ?? []).map(c => c.id)

  const { data: candidatos } = await supabase
    .from('mensagens_agendadas')
    .select('id')
    .eq('status', 'pendente')
    .lte('agendado_para', agoraISO)
    .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agoraISO}`)
    .order('agendado_para', { ascending: true })
    // Compensa possíveis duplicatas com a consulta prioritária acima.
    .limit(limite + idsPrioritarios.length)

  const ids = [...new Set([
    ...idsPrioritarios,
    ...(candidatos ?? []).map(c => c.id),
  ])].slice(0, limite)
  if (!ids.length) return { processadas: 0 }

  // Claim: UPDATE guardado por status='pendente'. Não precisa de lock
  // pessimista pra estar correto — o Postgres serializa UPDATEs concorrentes
  // na mesma linha, então mesmo dois processos (worker + cron) rodando ao
  // mesmo tempo nunca vão os dois "ganhar" a mesma linha.
  const { data: claimados } = await supabase
    .from('mensagens_agendadas')
    .update({ status: 'enviando' })
    .in('id', ids)
    .eq('status', 'pendente')
    .select('*')

  let processadas = 0
  for (const [indice, msg] of (claimados ?? []).entries()) {
    /*
     * Espaça os envios com intervalo aleatório.
     *
     * Não é cosmético: foi disparar o lote inteiro no mesmo segundo que fez o
     * WhatsApp marcar o número como robô e bani-lo da vez anterior em que este
     * projeto usou a Evolution. Um lote de 10 passa a levar ~1 minuto, o que é
     * irrelevante para lembrete e decisivo para o número sobreviver.
     */
    if (indice > 0) {
      const { min, max } = ESPACAMENTO_MS
      await new Promise(r => setTimeout(r, min + Math.random() * (max - min)))
    }
    await enviarUma(msg)
    processadas++
    await new Promise(r => setTimeout(r, pacingAleatorio()))
  }
  return { processadas }
}

type MensagemClaimada = {
  id: string
  evento_id: string
  funcionario_id: string | null
  perfil_id: string | null
  veiculo_id: string | null
  tipo: TipoMensagem
  data_ref: string
  condicao: string | null
  telefone: string
  mensagem: string
  tentativas: number
  max_tentativas: number
}

/**
 * Esta mensagem ainda faz sentido no momento do envio?
 *
 * Duas guardas, e a primeira é a que impede o erro mais caro do sistema.
 *
 * ─── 1. MEIO E SAÍDA SÓ VALEM PARA QUEM ENTROU ─────────────────────────────
 *
 * Cobrar a saída de quem nunca bateu a entrada é acusar alguém de não ter
 * fechado um turno que ela não começou. Aconteceu de verdade: um dia de
 * trabalho configurado a mais fez 49 pessoas receberem "sua presença ainda não
 * foi registrada, corre lá" às 23:57 de um dia em que ninguém trabalhou.
 *
 * A condição `sem_registro` sozinha não pegava isso — ela só olhava se a
 * batida daquela etapa existe, e num dia sem trabalho nenhum ela realmente não
 * existe. O que faltava era a pergunta anterior: essa pessoa chegou a entrar?
 *
 * Vale para lembrete E reforço, com ou sem condição declarada: um dia mal
 * configurado não pode virar mensagem para ninguém.
 *
 * ─── 2. MENSAGEM VELHA NÃO SAI ─────────────────────────────────────────────
 *
 * Ver ATRASO_MAXIMO_MIN.
 */
async function devoEnviar(msg: MensagemClaimada): Promise<boolean> {
  const momento = MOMENTO_POR_TIPO[msg.tipo]

  /*
   * ─── 0. O MEIO PODE TER SIDO DESLIGADO DEPOIS DO AGENDAMENTO ─────────────
   *
   * `agendarMeioAposEntrada` decide na hora da ENTRADA se o meio vale pra
   * aquela pessoa. Se o setor (ou o dia) for desligado DEPOIS disso, as
   * mensagens já agendadas continuavam na fila e eram enviadas — e cobradas.
   * Quem desliga um setor no meio da operação espera que o efeito seja
   * imediato, não só pra quem ainda vai bater a entrada (pergunta do Juan,
   * 03/09/2026).
   *
   * A conferência é aqui, no envio, porque é o único ponto que enxerga o
   * estado ATUAL da configuração — a fila guarda a decisão de horas atrás.
   */
  if (momento === 'meio' && msg.funcionario_id) {
    if (!(await pedeMeio(msg.funcionario_id, msg.evento_id, msg.data_ref))) return false
  }

  if ((momento === 'meio' || momento === 'fim') && msg.funcionario_id) {
    const { data: entrou } = await supabase
      .from('registros')
      .select('id')
      .eq('funcionario_id', msg.funcionario_id)
      .eq('evento_id', msg.evento_id)
      .eq('tipo', 'entrada')
      .eq('data_ref', msg.data_ref)
      .limit(1)
    if (!entrou?.length) return false
  }

  if (msg.condicao !== 'sem_registro') return true
  if (!momento || !msg.funcionario_id) return true
  // Do DIA da mensagem, nao do evento: sem o filtro, a batida de ontem
  // cancelaria o reforco de hoje e a pessoa nunca mais seria lembrada.
  const { data } = await supabase
    .from('registros')
    .select('id')
    .eq('funcionario_id', msg.funcionario_id)
    .eq('evento_id', msg.evento_id)
    .eq('tipo', momento)
    .eq('data_ref', msg.data_ref)
    .limit(1)
  return !(data && data.length)
}

/**
 * Ate que horas a pessoa ainda pode registrar aquela etapa, naquele dia.
 *
 * O meio e o caso especial e o motivo desta funcao existir: ele nao tem
 * horario no evento, e a entrada REAL da pessoa + 4h, entao o limite muda de
 * funcionario para funcionario dentro do mesmo setor.
 */
async function limiteDaEtapa(
  msg: MensagemClaimada,
  momento: MomentoRegistro,
  evento: EventoJanelas
): Promise<string | null> {
  if (momento === 'meio') {
    const { data: entrada } = await supabase
      .from('registros').select('created_at')
      .eq('funcionario_id', msg.funcionario_id!)
      .eq('evento_id', msg.evento_id)
      .eq('tipo', 'entrada')
      .eq('data_ref', msg.data_ref)
      .limit(1)
    return entrada?.[0] ? janelaMeio(entrada[0].created_at as string).fim : null
  }

  const { data: dia } = await supabase
    .from('jornada_dias')
    // `tipo` faz parte do resultado: sem ele o dia principal chega aqui como
    // se fosse dia de preparação, e o prazo da mensagem sai como o padrão
    // genérico em vez da janela que o produtor configurou.
    .select('tipo, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', msg.evento_id)
    .eq('data', msg.data_ref)
    .eq('cancelado', false)
    .order('turno')
    .limit(1)

  const esperado = horariosEsperados(evento, msg.data_ref, (dia?.[0] as DiaDaJornada | undefined) ?? null)
  return momento === 'entrada' ? esperado.entradaLimite : esperado.fimLimite
}

/**
 * Monta o template + parâmetros de envio com dados frescos do banco — nunca
 * pré-computado no agendamento. Retorna null quando a mensagem deve ser
 * cancelada (ex.: alerta ao supervisor sem ninguém pendente).
 */
async function montarEnvioTemplate(msg: MensagemClaimada): Promise<{ template: string; params: string[]; phoneNumberId?: string; botaoParam?: string } | null> {
  const template = TEMPLATE_POR_TIPO[msg.tipo]

  /*
   * Disparo manual do painel: o master escolheu o template e os parâmetros na
   * hora. Diferente dos automáticos, isto NÃO é recalculável depois — não há
   * regra de onde deduzir o conteúdo —, então viaja gravado no agendamento.
   */
  if (msg.tipo === 'disparo_manual') {
    try {
      const escolha = JSON.parse(msg.mensagem) as { template?: string; parametros?: string[]; phoneNumberId?: string }
      if (!escolha?.template) return null
      return { template: escolha.template, params: escolha.parametros ?? [], phoneNumberId: escolha.phoneNumberId }
    } catch {
      return null
    }
  }

  // Lembrete e reforço: mesma estrutura de parâmetros, só muda a instrução da etapa.
  if (msg.tipo.startsWith('lembrete_') || msg.tipo.startsWith('reforco_')) {
    if (!msg.funcionario_id) return null
    const momento = MOMENTO_POR_TIPO[msg.tipo]
    if (!momento) return null

    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos')
        .select('nome, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim, batida_livre')
        .eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null

    /*
     * Entrada e fim recobrados aqui, no envio — mesma trava de
     * `sincronizarAgendamentos` (ver `diaComTrava`), reconferida porque esta
     * linha pode ter sido agendada ANTES de a trava existir para este dia.
     * Meio fica de fora: janela individual, vale todo dia.
     */
    if (momento !== 'meio') {
      const { data: dia } = await supabase
        .from('jornada_dias').select('tipo, entrada_fim, saida_fim')
        .eq('evento_id', msg.evento_id).eq('data', msg.data_ref)
        .order('turno').limit(1)
      const ehPrincipal = dia?.[0]?.tipo === 'principal'
      const livre = (evento as { batida_livre?: boolean | null }).batida_livre === true
      // Mesma régua do agendamento: só o dia principal, sem batida livre.
      const diaComTrava = ehPrincipal && !livre
      if (!diaComTrava) return null

      // Lembrete e reforço de entrada/saída sem prazo de verdade (janela
      // aberta, sem fim) não saem: o texto imprimiria o 12:00/23:59 genérico
      // como prazo. Ver o mesmo filtro em `sincronizarAgendamentos`;
      // reconferido aqui pra linha agendada antes dele existir.
      {
        const ev = evento as EventoJanelas
        const prazo = momento === 'entrada'
          ? ((dia?.[0]?.entrada_fim as string | null) ?? ev.janela_entrada_fim ?? null)
          : ((dia?.[0]?.saida_fim as string | null) ?? ev.janela_fim_fim ?? null)
        if (!prazo) return null
      }
    }

    const horarioLimiteISO = await limiteDaEtapa(msg, momento, evento as EventoJanelas)
    const credencial = linkDaCredencial(func.qr_token, msg.tipo)
    if (!credencial) return null

    /*
     * Montado por NOME, nunca pela ordem das colunas do banco.
     *
     * A ordem aqui é a do texto aprovado na Meta: {{1}} nome, {{2}} evento,
     * {{3}} etapa pendente, {{4}} prazo, {{5}} link. Trocar duas posições não
     * dá erro em lugar nenhum — a mensagem só chega dizendo a coisa errada.
     */
    return {
      template,
      params: [
        func.nome,                                                              // {{1}} nome
        evento.nome as string,                                                  // {{2}} evento
        INSTRUCAO_ETAPA[momento],                                               // {{3}} etapa pendente
        horarioLimiteISO ? formatarBR(horarioLimiteISO, 'hora') : 'a definir',  // {{4}} prazo
        credencial,                                                             // {{5}} link
      ],
    }
  }

  // Alerta ao supervisor: conta quantos do setor ainda estão sem registro
  // naquela etapa. Cancela (retorna null) se ninguém estiver faltando.
  if (msg.tipo.startsWith('alerta_supervisor_')) {
    if (!msg.perfil_id) return null
    const momento = MOMENTO_POR_TIPO[msg.tipo]
    if (!momento) return null

    /*
     * Entrada e fim só cobram quando existe horário DE VERDADE pro dia —
     * reconferido aqui, no envio, porque esta linha pode ter sido agendada
     * ANTES de essa trava existir (foi quase o caso do alerta de "fim" de
     * um dia de montagem, avisando o Steivan e a Michelli de gente que
     * nunca teve horário de saída combinado).
     *
     * DIFERENTE do lembrete ao funcionário, isto NÃO olha `batida_livre`:
     * a pessoa pode ter entrada/saída livres e, mesmo assim, o evento ter
     * um fechamento real — passado esse horário, quem nunca saiu é
     * informação real pro supervisor (ver `temHorarioReal`).
     *
     * O meio fica de fora: a janela dele é individual (entrada real da
     * pessoa + 4h) e vale todo santo dia, montagem incluída.
     */
    if (momento !== 'meio') {
      const { data: dia } = await supabase
        .from('jornada_dias').select('tipo, entrada_fim, saida_fim')
        .eq('evento_id', msg.evento_id).eq('data', msg.data_ref).order('turno').limit(1)
      const diaComTrava = temHorarioReal(dia?.[0]?.tipo === 'principal', dia?.[0] as DiaDaJornada | undefined)
      if (!diaComTrava) return null
    }

    const { data: supervisor } = await supabase.from('perfis').select('nome, fornecedor_id').eq('id', msg.perfil_id).single()
    if (!supervisor?.fornecedor_id) return null

    /*
     * A LISTA, nao so o numero.
     *
     * Antes a mensagem dizia "5 pessoas do setor X nao registraram a entrada" e
     * mandava um link. Isso obriga o supervisor a parar, abrir o navegador e
     * fazer login no meio da operacao so pra descobrir QUEM. Com os nomes no
     * corpo da mensagem ele ja sai atras das pessoas; o link continua ali para
     * o resto da lista e para quem quiser conferir.
     */
    const pendentes = await pendenciasDoDia({
      eventoId: msg.evento_id,
      data: msg.data_ref,
      fornecedorId: supervisor.fornecedor_id,
      etapas: [momento],
    })
    if (!pendentes.length) return null

    // Teto de nomes no WhatsApp: mensagem gigante e rolada sem ser lida, e
    // volume alto de texto automatizado e o padrao que faz o numero ser banido.
    const MAX_NOMES = 8
    const linhas = pendentes.slice(0, MAX_NOMES).map(pen => {
      const esperado = pen.esperadoEm ? ` · esperado ${formatarBR(pen.esperadoEm, 'hora')}` : ''
      const entrou = pen.realizadoEm ? ` · entrou ${formatarBR(pen.realizadoEm, 'hora')}` : ''
      return `• ${pen.nome} (${formatCpf(pen.cpf)})${esperado}${entrou}`
    })
    if (pendentes.length > MAX_NOMES) linhas.push(`…e mais ${pendentes.length - MAX_NOMES} no sistema.`)

    // "Pendências" virou uma visão de /presenca, não uma tela própria — ver
    // o comentário no topo de app/admin/eventos/[id]/presenca/page.tsx.
    const VER_POR_MOMENTO: Record<MomentoRegistro, string> = { entrada: 'faltam', meio: 'sem_meio', fim: 'sem_saida' }

    return {
      template,
      params: [
        supervisor.nome,
        String(pendentes.length),
        pendentes[0].setorNome,
        ROTULO_PENDENCIA[momento],
        `${pendentes[0].eventoNome} · ${formatarBR(`${msg.data_ref}T12:00:00-03:00`, 'data')}`,
        linhas.join('\n'),
        `${SITE_URL}/admin/eventos/${msg.evento_id}/presenca?ver=${VER_POR_MOMENTO[momento]}&dia=${msg.data_ref}`,
      ],
    }
  }

  // Confirmação de escala pré-evento
  if (msg.tipo === 'confirmacao_escala') {
    if (!msg.funcionario_id) return null
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, cargo, qr_token, fornecedor_id').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos').select('nome, local, data_inicio, msg_pre_evento_instrucoes').eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null
    const { data: fornecedor } = await supabase.from('fornecedores').select('nome').eq('id', func.fornecedor_id).single()

    const dataLocal = `dia ${evento.data_inicio ? formatarBR(evento.data_inicio, 'curto') : 'a confirmar'}${evento.local ? `, em ${evento.local}` : ''}`
    const instrucoes = evento.msg_pre_evento_instrucoes?.trim() || 'Fique atento aos horários da sua escala.'

    const credencial = linkDaCredencial(func.qr_token, 'confirmacao_escala')
    if (!credencial) return null

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        func.cargo?.trim() || 'não informada',
        fornecedor?.nome ?? 'seu setor',
        dataLocal,
        instrucoes,
        credencial,
      ],
    }
  }

  // Boas-vindas logo após o cadastro: link da credencial e o passo a passo
  // das três etapas, pra pessoa já saber o que vai acontecer no dia.
  if (msg.tipo === 'boas_vindas_funcionario') {
    if (!msg.funcionario_id) return null
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token, fornecedor_id').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos').select('nome, local, data_inicio').eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null
    const { data: fornecedor } = await supabase.from('fornecedores').select('nome').eq('id', func.fornecedor_id).single()

    const credencial = linkDaCredencial(func.qr_token, 'boas_vindas_funcionario')
    if (!credencial) return null

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        fornecedor?.nome ?? 'seu setor',
        evento.data_inicio ? formatarBR(evento.data_inicio, 'curto') : 'a confirmar',
        evento.local?.trim() || 'a confirmar',
        credencial,
      ],
    }
  }

  // Aviso do dia do evento: o texto completo, com as três etapas e horários.
  if (msg.tipo === 'aviso_dia_evento') {
    if (!msg.funcionario_id) return null
    const [{ data: func }, { data: evento }, { data: diaDaJornada }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos')
        .select('nome, local, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_fim_inicio, janela_fim_fim')
        .eq('id', msg.evento_id).single(),
      // O dia da mensagem pode ter horário próprio (2ª noite de um festival).
      supabase.from('jornada_dias')
        .select('entrada_inicio, entrada_fim, saida_inicio, saida_fim')
        .eq('evento_id', msg.evento_id).eq('data', msg.data_ref).order('turno').limit(1).maybeSingle(),
    ])
    if (!func || !evento) return null
    const hora = (v: unknown) => formatarBR(v as string, 'hora')

    /*
     * Nunca "a definir" (Pontal Weekend, 25/09/2026: saiu "ENTRADA — das 17:00
     * às a definir" e "MEIO — às a definir" pra equipe inteira).
     *
     *   - Sem FIM configurado não há prazo antes do evento acabar (regra do
     *     Juan: só início = "a partir de") — o fim mostrado é o do EVENTO
     *     (`data_fim`), o único que de fato foi configurado.
     *   - O MEIO não tem horário configurável desde a janela individual: é
     *     sempre 4h depois da entrada de cada pessoa.
     */
    const entradaInicio = diaDaJornada?.entrada_inicio ?? evento.janela_entrada_inicio
    const entradaFim = diaDaJornada?.entrada_fim ?? evento.janela_entrada_fim ?? evento.data_fim
    const saidaInicio = diaDaJornada?.saida_inicio ?? evento.janela_fim_inicio
    const saidaFim = diaDaJornada?.saida_fim ?? evento.janela_fim_fim ?? evento.data_fim
    if (!entradaInicio) return null

    const credencial = linkDaCredencial(func.qr_token, 'aviso_dia_evento')
    if (!credencial) return null

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        evento.local?.trim() || 'a confirmar',
        hora(entradaInicio),
        entradaFim ? hora(entradaFim) : 'o fim do evento',
        '4h após a sua entrada',
        saidaInicio ? hora(saidaInicio) : 'o fim do turno',
        saidaFim ? hora(saidaFim) : 'o fim do evento',
        credencial,
      ],
    }
  }

  // Avisos de montagem e desmontagem: curtos, sem horário — esses dias não têm.
  if (msg.tipo === 'aviso_montagem' || msg.tipo === 'aviso_desmontagem') {
    if (!msg.funcionario_id) return null
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos').select('nome, local').eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null

    const credencial = linkDaCredencial(func.qr_token, 'aviso_montagem/desmontagem')
    if (!credencial) return null

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        evento.local?.trim() || 'a confirmar',
        credencial,
      ],
    }
  }

  /*
   * Confirmação de cadastro de veículo — template `veiculo_cadastrado`
   * aprovado na Meta (24/09/2026): corpo com nome do condutor + evento,
   * botão "Ver instruções de acesso" com URL dinâmica pro QR do veículo.
   *
   * `params` carrega os 2 do corpo (nessa ordem) MAIS o link completo, pra
   * `renderizarMensagem` montar o texto livre da Evolution/log — mas só os
   * 2 primeiros vão no corpo de verdade quando sai pela Cloud API (ver
   * `QTD_VARIAVEIS_BODY` em lib/whatsapp-meta.ts). `botaoParam` é o token
   * cru, separado do link: é o que a Meta espera no componente do botão.
   */
  if (msg.tipo === 'veiculo_cadastrado') {
    if (!msg.veiculo_id) return null
    const [{ data: veiculo }, { data: evento }] = await Promise.all([
      supabase.from('veiculos').select('condutor_nome, qr_token, funcionarios(nome)').eq('id', msg.veiculo_id).single(),
      supabase.from('eventos').select('nome').eq('id', msg.evento_id).single(),
    ])
    if (!veiculo || !evento) return null

    const condutor = veiculo.funcionarios as unknown as { nome: string } | { nome: string }[] | null
    const condutorNome =
      (veiculo.condutor_nome as string | null)
      ?? (Array.isArray(condutor) ? condutor[0]?.nome : condutor?.nome)
      ?? 'Não informado'

    const token = typeof veiculo.qr_token === 'string' ? veiculo.qr_token.trim() : ''
    const link = linkDaCredencial(token, 'veiculo_cadastrado', 'veiculo')
    if (!link) return null

    return {
      template,
      params: [condutorNome, evento.nome, link],
      botaoParam: token,
    }
  }

  /*
   * Credenciamento negado — SEM TEMPLATE APROVADO AINDA.
   *
   * `return null` cancela o envio sem erro (mesma convenção de
   * `veiculo_cadastrado` antes de ser ligado): a negativa em si já foi
   * aplicada por `negarCredenciamento`, isto é só o aviso por WhatsApp. Fica
   * pronto pra preencher assim que o nome do template aprovado chegar —
   * mesmo padrão: nome + evento no corpo, sem link nenhum (não há mais QR
   * pra mostrar).
   */
  if (msg.tipo === 'credenciamento_negado') {
    return null
  }

  /*
   * Contagem regressiva ao supervisor: "Faltam {{2}} para o evento {{3}}...
   * pendente para: {{4}}" — corpo e variáveis definidos pelo sócio do Juan
   * (24/09/2026). Botão de URL dinâmica pro painel de aprovações, com o id
   * do evento como parâmetro do botão (numeração própria, separada do
   * corpo) — ver `botaoParam` em lib/whatsapp-meta.ts.
   *
   * `{{2}}` (prazo) e `{{4}}` (quantidade) são recalculados aqui, não
   * guardados no agendamento: `msg.data_ref` é o dia exato em que
   * `agendarAlertasSupervisorCredenciamento` bateu um dos pontos de
   * `DIAS_ANTES_ALERTA_SUPERVISOR_CREDENCIAMENTO`, e a diferença pra
   * `eventos.data_inicio` reconstrói qual ponto foi sem precisar de coluna
   * nova. A quantidade é sempre a contagem ATUAL de pendentes, não a de
   * quando foi agendado (pode ter mudado entre a manhã e o envio).
   *
   * O GATILHO já roda de verdade (chamado a cada execução do cron — ver
   * app/api/cron/enviar-mensagens/route.ts). Falta só a CONFIRMAÇÃO final de
   * que o template foi aprovado na Meta — até lá, `return null` represa sem
   * nunca tentar enviar contra um template que ainda não existe (mesmo
   * cuidado de `veiculo_cadastrado` antes de ser ligado). Confirmado, a
   * mudança é só apagar a linha `return null` logo abaixo.
   */
  if (msg.tipo === 'alerta_supervisor_credenciamento') {
    return null

    if (!msg.perfil_id) return null
    const [{ data: supervisor }, { data: evento }] = await Promise.all([
      supabase.from('perfis').select('nome, fornecedor_id').eq('id', msg.perfil_id).single(),
      supabase.from('eventos').select('nome, data_inicio').eq('id', msg.evento_id).single(),
    ])
    const fornecedorId = supervisor?.fornecedor_id as string | undefined
    if (!supervisor || !fornecedorId || !evento) return null

    const { count } = await supabase
      .from('funcionarios').select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', fornecedorId).eq('status_credenciamento', 'pendente')
    const pendentes = count ?? 0
    // Zero agora: resolveu sozinho entre o agendamento (de manhã) e o envio
    // (na hora certa) — nada a avisar, não manda mensagem vazia.
    if (!pendentes) return null

    // `!` em vez de narrowing normal: este bloco é INTENCIONALMENTE morto
    // (return null lá em cima) até a Meta aprovar, e o TS não propaga
    // narrowing de control-flow dentro de código inalcançável — já validado
    // pelo `if` acima, que roda de verdade assim que a linha for apagada.
    const diasParaOEvento = Math.round(
      (new Date(`${diaBRT(evento!.data_inicio as string)}T00:00:00-03:00`).getTime()
        - new Date(`${msg.data_ref}T00:00:00-03:00`).getTime()) / (24 * 60 * 60 * 1000)
    )

    return {
      template,
      // Os 4 primeiros vão no corpo de verdade (ver QTD_VARIAVEIS_BODY em
      // lib/whatsapp-meta.ts); o link só existe pra `renderizarMensagem`
      // montar o texto livre da Evolution/log — no corpo da Meta quem leva o
      // link é o BOTÃO, via `botaoParam`.
      params: [
        supervisor!.nome as string,
        prazoPorExtenso(Math.max(diasParaOEvento, 0)),
        evento!.nome as string,
        quantidadePorExtenso(pendentes),
        `${SITE_URL}/admin/eventos/${msg.evento_id}/aprovacoes`,
      ],
      botaoParam: msg.evento_id,
    }
  }

  return null
}

/**
 * O texto EXATO que uma mensagem agendada vai enviar, sem enviar nada.
 *
 * Ensaio antes do disparo. Passa pelo mesmo `montarEnvioTemplate` e pelo mesmo
 * renderizador do envio de verdade — se fosse uma segunda implementação "só
 * para conferir", ela divergiria da real no primeiro ajuste e a conferência
 * passaria a mentir, que é pior do que não conferir.
 *
 * Também aplica a condição: reforço para quem já bateu o ponto aparece como
 * cancelado aqui, igual apareceria no envio.
 */
export async function previsualizarMensagem(id: string): Promise<{
  id: string
  tipo: string
  telefone: string
  agendadoPara: string
  dataRef: string
  destino: string
  texto: string | null
  motivoCancelamento?: string
}> {
  const { data } = await supabase.from('mensagens_agendadas').select('*').eq('id', id).single()
  const msg = data as MensagemClaimada & { agendado_para: string }
  const base = {
    id, tipo: msg.tipo, telefone: msg.telefone,
    agendadoPara: msg.agendado_para, dataRef: msg.data_ref,
    destino: msg.perfil_id ? 'supervisor' : 'funcionário',
  }

  if (!(await devoEnviar(msg))) {
    return { ...base, texto: null, motivoCancelamento: 'condição não vale mais (a pessoa já registrou)' }
  }
  const envio = await montarEnvioTemplate(msg)
  if (!envio) return { ...base, texto: null, motivoCancelamento: 'sem conteúdo para montar' }
  return { ...base, texto: renderizarMensagem(envio.template, envio.params) }
}

async function enviarUma(msg: MensagemClaimada & { agendado_para?: string }): Promise<void> {
  // Atrasada demais: o horário dela passou e o assunto morreu junto.
  const atrasoMin = msg.agendado_para
    ? (Date.now() - new Date(msg.agendado_para).getTime()) / 60_000
    : 0
  if (atrasoMin > ATRASO_MAXIMO_MIN) {
    await supabase.from('mensagens_agendadas').update({
      status: 'cancelado',
      erro: `Cancelada por atraso: ${Math.round(atrasoMin)} min depois do horário (teto: ${ATRASO_MAXIMO_MIN}).`,
    }).eq('id', msg.id)
    return
  }

  if (!(await devoEnviar(msg))) {
    await supabase.from('mensagens_agendadas').update({ status: 'cancelado' }).eq('id', msg.id)
    return
  }

  const envio = await montarEnvioTemplate(msg)
  if (!envio) {
    await supabase.from('mensagens_agendadas').update({ status: 'cancelado' }).eq('id', msg.id)
    return
  }

  const tentativa = msg.tentativas + 1
  const numero = formatarNumeroWhatsApp(msg.telefone)

  // A Evolution manda texto livre. `montarEnvioTemplate` continua produzindo
  // template + parâmetros (é lá que estão as consultas e as regras) e o
  // renderizador transforma isso no texto final — assim voltar pra Cloud API
  // é trocar lib/whatsapp.ts, sem mexer na montagem.
  const texto = renderizarMensagem(envio.template, envio.params)

  /*
   * O conteúdo vai nas duas formas, e o canal ativo escolhe.
   *
   * A Cloud API precisa do template com os parâmetros soltos (fora da janela
   * de 24h ela não aceita texto livre); a Evolution precisa do texto pronto.
   * Montar os dois aqui é o que permite trocar de canal por variável de
   * ambiente, sem deploy — ver lib/whatsapp.ts.
   */
  const resultado: ResultadoEnvio = !numero
    ? { ok: false, statusHttp: 0, resposta: { erro: 'Telefone inválido' } }
    : !texto
      ? { ok: false, statusHttp: 0, resposta: { erro: `Modelo de mensagem desconhecido: ${envio.template}` } }
      : await enviarMensagem({
          numero,
          template: envio.template,
          parametros: envio.params,
          texto,
          phoneNumberId: envio.phoneNumberId,
          botaoParam: envio.botaoParam,
        })

  await supabase.from('mensagens_log').insert({
    mensagem_agendada_id: msg.id,
    tentativa,
    status: resultado.ok ? 'sucesso' : 'erro',
    status_http: resultado.statusHttp,
    resposta_evolution: { provedor: provedor(), ...(resultado.resposta as object ?? {}) },
    erro: resultado.ok ? null : JSON.stringify(resultado.resposta),
    destinatario_telefone: msg.telefone,
    tipo: msg.tipo,
  })

  if (resultado.ok && texto) {
    /*
     * Grava a mensagem no histórico do chat.
     *
     * O texto só existe neste instante: ele é renderizado do template com
     * dados frescos e não fica em lugar nenhum depois. Sem gravar aqui, o
     * chat mostraria "boas_vindas_funcionario" no lugar do que a pessoa leu.
     */
    await supabase.from('whatsapp_eventos').insert({
      direcao: 'enviada',
      wa_message_id: resultado.messageId ?? null,
      telefone: numero,
      tipo: 'text',
      texto,
      ocorrido_em: new Date().toISOString(),
      evento_id: msg.evento_id,
      funcionario_id: msg.funcionario_id,
    }).then(({ error }) => {
      if (error && error.code !== '23505') console.error('[fila] não gravei a enviada:', error.message)
    })
  }

  if (resultado.ok) {
    await supabase.from('mensagens_agendadas').update({
      status: 'enviado',
      tentativas: tentativa,
      evolution_message_id: resultado.messageId ?? null,
      enviado_em: new Date().toISOString(),
      erro: null,
    }).eq('id', msg.id)
    return
  }

  /*
   * Erro PERMANENTE não merece retry.
   *
   * 132001 (template não existe) e 132000 (número de parâmetros errado) não
   * mudam por tentar de novo — o template foi apagado da Meta ou o código está
   * mandando a lista errada. Gastar as três tentativas só atrasa o diagnóstico
   * e enche o log com a mesma falha repetida.
   */
  const codigo = (resultado.resposta as { error?: { code?: number } } | null)?.error?.code
  const permanente = codigo === 132000 || codigo === 132001 || codigo === 132005 || codigo === 131009
  const esgotou = permanente || tentativa >= msg.max_tentativas
  const backoffMin = BACKOFF_MINUTOS[Math.min(tentativa - 1, BACKOFF_MINUTOS.length - 1)]
  await supabase.from('mensagens_agendadas').update({
    status: esgotou ? 'falhou' : 'pendente',
    tentativas: tentativa,
    proxima_tentativa: esgotou ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
    erro: JSON.stringify(resultado.resposta),
  }).eq('id', msg.id)
}
