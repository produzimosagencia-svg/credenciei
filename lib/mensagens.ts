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
import { formatarBR } from './tz'
import {
  diaBRT, janelaMeio, horariosEsperados, periodoDoEvento,
  type EventoJanelas, type DiaDaJornada,
} from './janelas'
import { pendenciasDoDia, ROTULO_PENDENCIA } from './pendencias'
import { formatCpf } from './format'
import { formatarNumeroWhatsApp, enviarWhatsApp, estadoDaInstancia, ESPACAMENTO_MS, type ResultadoEnvio } from './whatsapp'
import { renderizarMensagem } from './mensagens-modelos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ANTECEDENCIA_REFORCO_MINUTOS = 2
const BATCH_SIZE_PADRAO = 10
const PACING_MS_MIN = 1000
const PACING_MS_MAX = 2000
const pacingAleatorio = () => PACING_MS_MIN + Math.floor(Math.random() * (PACING_MS_MAX - PACING_MS_MIN))
const BACKOFF_MINUTOS = [2, 10, 30] // por tentativa: 1ª, 2ª, 3ª...

export type TipoMensagem =
  | 'lembrete_entrada' | 'lembrete_meio' | 'lembrete_fim'
  | 'alerta_supervisor_entrada' | 'alerta_supervisor_meio' | 'alerta_supervisor_fim'
  | 'reforco_entrada' | 'reforco_meio' | 'reforco_fim'
  | 'credenciais_supervisor'
  | 'confirmacao_escala'
  | 'aviso_dia_evento'
  | 'boas_vindas_funcionario'

const ANTECEDENCIA_AVISO_DIA_HORAS = 2

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
  credenciais_supervisor: 'credenciais_supervisor',
  aviso_dia_evento: 'aviso_dia_evento',
  boas_vindas_funcionario: 'boas_vindas_funcionario',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

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
    .select('data, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', evento.id)
    .eq('cancelado', false)
    .gte('data', hoje)
    .order('data')
    .limit(HORIZONTE_DIAS)

  if (dias?.length) {
    return dias.map(d => ({ data: d.data as string, jornadaDia: d as DiaDaJornada }))
  }

  const periodo = periodoDoEvento(evento)
  if (!periodo) return []
  const principal = periodo.primeiro
  return principal >= hoje ? [{ data: principal, jornadaDia: null }] : []
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
  const dias = await diasDaOperacao(evento as EventoJanelas & { id: string })
  const diaPrincipal = diaBRT(evento.data_inicio as string)

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
    if (evento.janela_entrada_inicio) {
      const quando = new Date(new Date(evento.janela_entrada_inicio as string).getTime() - ANTECEDENCIA_AVISO_DIA_HORAS * 60 * 60_000)
      agendarFunc(func.id, func.telefone, 'aviso_dia_evento', diaPrincipal, quando.toISOString())
    }

    for (const dia of dias) {
      const esperado = horariosEsperados(evento as EventoJanelas, dia.data, dia.jornadaDia)

      // Lembrete quando se espera a pessoa; reforço pouco antes de ela virar
      // pendência. Sem horário esperado (dia livre sem jornada) não há o que
      // lembrar — cobrar horário que ninguém combinou só gera ruído.
      agendarFunc(func.id, func.telefone, 'lembrete_entrada', dia.data, esperado.entrada)
      agendarFunc(func.id, func.telefone, 'reforco_entrada', dia.data,
        new Date(new Date(esperado.entradaLimite).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000).toISOString(),
        'sem_registro')

      agendarFunc(func.id, func.telefone, 'lembrete_fim', dia.data, esperado.fim)
      agendarFunc(func.id, func.telefone, 'reforco_fim', dia.data,
        new Date(new Date(esperado.fimLimite).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000).toISOString(),
        'sem_registro')
    }
  }

  // Alerta ao supervisor: UMA mensagem por setor, etapa e DIA. O conteúdo (quem
  // está faltando) só dá pra saber na hora do envio; aqui só marca o gatilho.
  for (const dia of dias) {
    const esperado = horariosEsperados(evento as EventoJanelas, dia.data, dia.jornadaDia)
    const gatilhos: [TipoMensagem, string][] = [
      ['alerta_supervisor_entrada', esperado.entradaLimite],
      ['alerta_supervisor_meio', esperado.meioAlerta],
      ['alerta_supervisor_fim', esperado.fimLimite],
    ]

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
 * Agenda o envio (imediato) das credenciais de acesso pro supervisor
 * recém-criado. Chamado uma vez, direto de criarSupervisor. Não repete: se
 * já existe uma linha pra esse perfil (por qualquer motivo), não duplica.
 *
 * Diferente dos outros tipos, os parâmetros aqui (principalmente a senha em
 * texto puro) não existem em lugar nenhum do banco depois deste momento —
 * por isso ficam salvos como JSON na própria coluna `mensagem`, em vez de
 * recalculados na hora do envio.
 */
export async function agendarCredenciaisSupervisor(params: {
  eventoId: string
  perfilId: string
  telefone: string
  nome: string
  setorNome: string
  eventoNome: string
  dataEvento: string
  email: string
  senha: string
  linkFormulario: string
}): Promise<void> {
  const { data: existe } = await supabase
    .from('mensagens_agendadas')
    .select('id')
    .eq('perfil_id', params.perfilId)
    .eq('tipo', 'credenciais_supervisor')
    .limit(1)
  if (existe?.length) return

  const templateParams = [
    params.nome,
    params.setorNome,
    params.eventoNome,
    params.dataEvento,
    params.email,
    params.senha,
    `${SITE_URL}/login`,
    params.linkFormulario,
  ]

  const { error } = await supabase.from('mensagens_agendadas').insert([{
    evento_id: params.eventoId,
    perfil_id: params.perfilId,
    tipo: 'credenciais_supervisor',
    agendado_para: new Date().toISOString(),
    telefone: params.telefone,
    mensagem: JSON.stringify(templateParams),
  }])
  if (error && error.code !== '23505') throw error // 23505 = unique_violation (corrida rara), ignora
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
  if (!canal.conectada) {
    console.warn(`[mensagens] instância desconectada (${canal.estado}) — nada enviado, fila preservada`)
    return { processadas: 0 }
  }

  const agoraISO = new Date().toISOString()

  const { data: candidatos } = await supabase
    .from('mensagens_agendadas')
    .select('id')
    .eq('status', 'pendente')
    .lte('agendado_para', agoraISO)
    .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agoraISO}`)
    .order('agendado_para', { ascending: true })
    .limit(limite)

  const ids = (candidatos ?? []).map(c => c.id)
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
  tipo: TipoMensagem
  data_ref: string
  condicao: string | null
  telefone: string
  mensagem: string
  tentativas: number
  max_tentativas: number
}

/** Pra reforços condicionais: só envia se o funcionário AINDA não tiver o registro daquela batida. */
async function devoEnviar(msg: MensagemClaimada): Promise<boolean> {
  if (msg.condicao !== 'sem_registro') return true
  const momento = MOMENTO_POR_TIPO[msg.tipo]
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
    .select('entrada_inicio, entrada_fim, saida_inicio, saida_fim')
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
async function montarEnvioTemplate(msg: MensagemClaimada): Promise<{ template: string; params: string[] } | null> {
  const template = TEMPLATE_POR_TIPO[msg.tipo]

  // Credenciais do supervisor: parâmetros já foram capturados no agendamento
  // (a senha em texto puro não existe em nenhum outro lugar do banco).
  if (msg.tipo === 'credenciais_supervisor') {
    try {
      const params = JSON.parse(msg.mensagem)
      return Array.isArray(params) ? { template, params } : null
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
        .select('nome, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
        .eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null

    const horarioLimiteISO = await limiteDaEtapa(msg, momento, evento as EventoJanelas)

    return {
      template,
      params: [
        func.nome,
        evento.nome as string,
        INSTRUCAO_ETAPA[momento],
        horarioLimiteISO ? formatarBR(horarioLimiteISO, 'hora') : 'a definir',
        `${SITE_URL}/credential/${func.qr_token}`,
      ],
    }
  }

  // Alerta ao supervisor: conta quantos do setor ainda estão sem registro
  // naquela etapa. Cancela (retorna null) se ninguém estiver faltando.
  if (msg.tipo.startsWith('alerta_supervisor_')) {
    if (!msg.perfil_id) return null
    const momento = MOMENTO_POR_TIPO[msg.tipo]
    if (!momento) return null

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

    return {
      template,
      params: [
        supervisor.nome,
        String(pendentes.length),
        pendentes[0].setorNome,
        ROTULO_PENDENCIA[momento],
        `${pendentes[0].eventoNome} · ${formatarBR(`${msg.data_ref}T12:00:00-03:00`, 'data')}`,
        linhas.join('\n'),
        `${SITE_URL}/admin/eventos/${msg.evento_id}/pendencias?dia=${msg.data_ref}`,
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

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        func.cargo?.trim() || 'não informada',
        fornecedor?.nome ?? 'seu setor',
        dataLocal,
        instrucoes,
        `${SITE_URL}/credential/${func.qr_token}`,
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

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        fornecedor?.nome ?? 'seu setor',
        evento.data_inicio ? formatarBR(evento.data_inicio, 'curto') : 'a confirmar',
        evento.local?.trim() || 'a confirmar',
        `${SITE_URL}/credential/${func.qr_token}`,
      ],
    }
  }

  // Aviso do dia do evento: 2h antes do credenciamento, resume o horário de
  // entrada e lembra do check-in do meio e do descredenciamento.
  if (msg.tipo === 'aviso_dia_evento') {
    if (!msg.funcionario_id) return null
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos').select('nome, janela_entrada_inicio, janela_entrada_fim').eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null

    return {
      template,
      params: [
        func.nome,
        evento.nome,
        evento.janela_entrada_inicio ? formatarBR(evento.janela_entrada_inicio, 'hora') : 'a definir',
        evento.janela_entrada_fim ? formatarBR(evento.janela_entrada_fim, 'hora') : 'a definir',
        `${SITE_URL}/credential/${func.qr_token}`,
      ],
    }
  }

  return null
}

async function enviarUma(msg: MensagemClaimada): Promise<void> {
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

  const resultado: ResultadoEnvio = !numero
    ? { ok: false, statusHttp: 0, resposta: { erro: 'Telefone inválido' } }
    : !texto
      ? { ok: false, statusHttp: 0, resposta: { erro: `Modelo de mensagem desconhecido: ${envio.template}` } }
      : await enviarWhatsApp(numero, texto)

  await supabase.from('mensagens_log').insert({
    mensagem_agendada_id: msg.id,
    tentativa,
    status: resultado.ok ? 'sucesso' : 'erro',
    status_http: resultado.statusHttp,
    resposta_evolution: resultado.resposta,
    erro: resultado.ok ? null : JSON.stringify(resultado.resposta),
    destinatario_telefone: msg.telefone,
    tipo: msg.tipo,
  })

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

  const esgotou = tentativa >= msg.max_tentativas
  const backoffMin = BACKOFF_MINUTOS[Math.min(tentativa - 1, BACKOFF_MINUTOS.length - 1)]
  await supabase.from('mensagens_agendadas').update({
    status: esgotou ? 'falhou' : 'pendente',
    tentativas: tentativa,
    proxima_tentativa: esgotou ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
    erro: JSON.stringify(resultado.resposta),
  }).eq('id', msg.id)
}
