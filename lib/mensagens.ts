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
import { formatarNumeroWhatsApp, enviarWhatsApp, type ResultadoEnvio } from './whatsapp'

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

type MomentoRegistro = 'entrada' | 'meio' | 'fim'

// Cada batida tem uma janela de abertura (janela_X_inicio) e um "horário
// limite" de fechamento (janela_X_fim, o mesmo campo que já valida o
// check-in em registrarPresencaQR/registrarPresencaFoto).
//   - lembrete ao funcionário: exatamente quando a janela ABRE.
//   - reforço ao funcionário: 2min antes do limite FECHAR, só se ele ainda
//     não tiver registrado (condicional).
//   - alerta ao supervisor: exatamente quando o limite expira, também
//     condicional a não ter registro.
const JANELAS: {
  momento: MomentoRegistro
  campoInicio: 'janela_entrada_inicio' | 'janela_meio_inicio' | 'janela_fim_inicio'
  campoFim: 'janela_entrada_fim' | 'janela_meio_fim' | 'janela_fim_fim'
  tipoLembrete: TipoMensagem
  tipoReforco: TipoMensagem
  tipoAlerta: TipoMensagem
  rotulo: string
}[] = [
  { momento: 'entrada', campoInicio: 'janela_entrada_inicio', campoFim: 'janela_entrada_fim', tipoLembrete: 'lembrete_entrada', tipoReforco: 'reforco_entrada', tipoAlerta: 'alerta_supervisor_entrada', rotulo: 'Entrada' },
  { momento: 'meio', campoInicio: 'janela_meio_inicio', campoFim: 'janela_meio_fim', tipoLembrete: 'lembrete_meio', tipoReforco: 'reforco_meio', tipoAlerta: 'alerta_supervisor_meio', rotulo: 'Meio do Evento' },
  { momento: 'fim', campoInicio: 'janela_fim_inicio', campoFim: 'janela_fim_fim', tipoLembrete: 'lembrete_fim', tipoReforco: 'reforco_fim', tipoAlerta: 'alerta_supervisor_fim', rotulo: 'Saída' },
]

/** A qual etapa (entrada/meio/fim) cada tipo de mensagem pertence — usado tanto pra achar a janela quanto pro texto do template. */
const MOMENTO_POR_TIPO: Partial<Record<TipoMensagem, MomentoRegistro>> = {
  lembrete_entrada: 'entrada', lembrete_meio: 'meio', lembrete_fim: 'fim',
  reforco_entrada: 'entrada', reforco_meio: 'meio', reforco_fim: 'fim',
  alerta_supervisor_entrada: 'entrada', alerta_supervisor_meio: 'meio', alerta_supervisor_fim: 'fim',
}

const INSTRUCAO_ETAPA: Record<MomentoRegistro, string> = {
  entrada: 'Procure seu supervisor para registrar seu QR Code de entrada',
  meio: 'Tire uma selfie pelo sistema, com a localização ativada',
  fim: 'Procure seu supervisor para registrar seu QR Code de saída',
}

/**
 * Nome do template aprovado no WhatsApp Manager (Meta) pra cada tipo.
 * Vários tipos compartilham o mesmo template (a etapa entra como parâmetro
 * de texto) — reduz de 11 pra 5 templates precisando de aprovação.
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
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

/**
 * Garante que todo funcionário do evento tenha agendado (1) o lembrete de
 * cada batida, (2) o reforço condicional a ele mesmo perto do fechamento e
 * (3) o alerta condicional ao supervisor caso não registre. Só decide
 * QUANDO enviar — o conteúdo (template + parâmetros) é montado na hora do
 * envio, com dados frescos.
 * Idempotente: chamado toda vez que o evento (janelas) ou a equipe
 * (funcionários) mudam. Nunca mexe em linhas já 'enviado'/'cancelado';
 * linhas 'pendente'/'falhou' são atualizadas (reagendamento quando o admin
 * edita a janela).
 */
export async function sincronizarAgendamentos(eventoId: string): Promise<void> {
  const { data: evento } = await supabase
    .from('eventos')
    .select('id, msg_pre_evento_envio, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
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
  // Se houver mais de um supervisor ativo no mesmo setor, o alerta vai só
  // pro primeiro encontrado (a constraint de dedupe é por perfil+tipo, não
  // dá pra notificar vários sem redesenhar a chave de dedupe).
  const supervisorPorFornecedor = new Map<string, { perfilId: string; telefone: string | null }>()
  for (const s of supervisores ?? []) {
    if (!supervisorPorFornecedor.has(s.fornecedor_id as string)) {
      supervisorPorFornecedor.set(s.fornecedor_id as string, { perfilId: s.id, telefone: s.telefone })
    }
  }

  const { data: existentes } = await supabase
    .from('mensagens_agendadas')
    .select('funcionario_id, perfil_id, tipo, status')
    .eq('evento_id', eventoId)
  const travadosPorFuncionario = new Set(
    (existentes ?? [])
      .filter(m => m.funcionario_id && (m.status === 'enviado' || m.status === 'cancelado'))
      .map(m => `${m.funcionario_id}:${m.tipo}`)
  )
  const travadosPorSupervisor = new Set(
    (existentes ?? [])
      .filter(m => m.perfil_id && (m.status === 'enviado' || m.status === 'cancelado'))
      .map(m => `${m.perfil_id}:${m.tipo}`)
  )

  const agora = Date.now()
  const PLACEHOLDER = '(gerado no momento do envio)'
  const linhasFuncionario: {
    evento_id: string; funcionario_id: string; tipo: TipoMensagem
    agendado_para: string; telefone: string; mensagem: string; condicao?: string
  }[] = []
  const linhasSupervisor: {
    evento_id: string; perfil_id: string; tipo: TipoMensagem
    agendado_para: string; telefone: string; mensagem: string
  }[] = []

  for (const func of funcionarios) {
    // Confirmação de escala pré-evento, no horário definido pelo produtor
    if (evento.msg_pre_evento_envio && !travadosPorFuncionario.has(`${func.id}:confirmacao_escala`)) {
      const agendadoPara = new Date(evento.msg_pre_evento_envio)
      if (agendadoPara.getTime() > agora) {
        linhasFuncionario.push({
          evento_id: eventoId,
          funcionario_id: func.id,
          tipo: 'confirmacao_escala',
          agendado_para: agendadoPara.toISOString(),
          telefone: func.telefone,
          mensagem: PLACEHOLDER,
        })
      }
    }

    for (const janela of JANELAS) {
      const horarioInicioISO = (evento as Record<string, unknown>)[janela.campoInicio] as string | null
      const horarioLimiteISO = (evento as Record<string, unknown>)[janela.campoFim] as string | null

      // Lembrete ao funcionário, exatamente quando a janela abre
      if (horarioInicioISO && !travadosPorFuncionario.has(`${func.id}:${janela.tipoLembrete}`)) {
        const agendadoPara = new Date(horarioInicioISO)
        if (agendadoPara.getTime() > agora) {
          linhasFuncionario.push({
            evento_id: eventoId,
            funcionario_id: func.id,
            tipo: janela.tipoLembrete,
            agendado_para: agendadoPara.toISOString(),
            telefone: func.telefone,
            mensagem: PLACEHOLDER,
          })
        }
      }

      // Reforço ao próprio funcionário, 2min antes do limite fechar, condicionado a não ter registro
      if (horarioLimiteISO && !travadosPorFuncionario.has(`${func.id}:${janela.tipoReforco}`)) {
        const agendadoPara = new Date(new Date(horarioLimiteISO).getTime() - ANTECEDENCIA_REFORCO_MINUTOS * 60_000)
        if (agendadoPara.getTime() > agora) {
          linhasFuncionario.push({
            evento_id: eventoId,
            funcionario_id: func.id,
            tipo: janela.tipoReforco,
            agendado_para: agendadoPara.toISOString(),
            telefone: func.telefone,
            mensagem: PLACEHOLDER,
            condicao: 'sem_registro',
          })
        }
      }
    }
  }

  // Alerta ao supervisor: UMA mensagem por setor/etapa (não por
  // funcionário). O texto real (quantos e quem está faltando) só dá pra
  // saber no momento do envio — aqui só agenda o "gatilho".
  for (const janela of JANELAS) {
    const horarioLimiteISO = (evento as Record<string, unknown>)[janela.campoFim] as string | null
    if (!horarioLimiteISO) continue
    const limiteMs = new Date(horarioLimiteISO).getTime()
    if (limiteMs <= agora) continue

    for (const [, supervisor] of supervisorPorFornecedor) {
      if (!supervisor.telefone) continue
      if (travadosPorSupervisor.has(`${supervisor.perfilId}:${janela.tipoAlerta}`)) continue
      linhasSupervisor.push({
        evento_id: eventoId,
        perfil_id: supervisor.perfilId,
        tipo: janela.tipoAlerta,
        agendado_para: horarioLimiteISO,
        telefone: supervisor.telefone,
        mensagem: PLACEHOLDER,
      })
    }
  }

  if (linhasFuncionario.length) {
    await supabase.from('mensagens_agendadas').upsert(linhasFuncionario, { onConflict: 'evento_id,funcionario_id,tipo' })
  }
  if (linhasSupervisor.length) {
    await supabase.from('mensagens_agendadas').upsert(linhasSupervisor, { onConflict: 'perfil_id,tipo' })
  }
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
  for (const msg of claimados ?? []) {
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
  const { data } = await supabase
    .from('registros')
    .select('id')
    .eq('funcionario_id', msg.funcionario_id)
    .eq('evento_id', msg.evento_id)
    .eq('tipo', momento)
    .limit(1)
  return !(data && data.length)
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
    const janela = JANELAS.find(j => j.momento === momento)
    if (!momento || !janela) return null

    const [{ data: func }, { data: evento }] = await Promise.all([
      supabase.from('funcionarios').select('nome, qr_token').eq('id', msg.funcionario_id).single(),
      supabase.from('eventos').select(`nome, ${janela.campoFim}`).eq('id', msg.evento_id).single(),
    ])
    if (!func || !evento) return null
    const horarioLimiteISO = (evento as Record<string, unknown>)[janela.campoFim] as string | null

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

    const { data: fornecedor } = await supabase.from('fornecedores').select('nome').eq('id', supervisor.fornecedor_id).single()

    const { data: funcionarios } = await supabase
      .from('funcionarios')
      .select('id')
      .eq('fornecedor_id', supervisor.fornecedor_id)
      .eq('ativo', true)
    if (!funcionarios?.length) return null

    const { data: registros } = await supabase
      .from('registros')
      .select('funcionario_id')
      .eq('evento_id', msg.evento_id)
      .eq('tipo', momento)
      .in('funcionario_id', funcionarios.map(f => f.id))

    const registrados = new Set((registros ?? []).map(r => r.funcionario_id))
    const semRegistro = funcionarios.filter(f => !registrados.has(f.id))
    if (!semRegistro.length) return null

    const rotulo = JANELAS.find(j => j.momento === momento)?.rotulo ?? momento

    return {
      template,
      params: [
        supervisor.nome,
        String(semRegistro.length),
        fornecedor?.nome ?? 'seu setor',
        rotulo,
        `${SITE_URL}/admin/eventos/${msg.evento_id}/fornecedor/${supervisor.fornecedor_id}`,
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

  const resultado: ResultadoEnvio = numero
    ? await enviarWhatsApp(numero, envio.template, envio.params)
    : { ok: false, statusHttp: 0, resposta: { erro: 'Telefone inválido' } }

  await supabase.from('mensagens_log').insert({
    mensagem_agendada_id: msg.id,
    tentativa,
    status: resultado.ok ? 'sucesso' : 'erro',
    status_http: resultado.statusHttp,
    resposta_evolution: resultado.resposta, // coluna legada de nome; agora guarda a resposta da Cloud API
    erro: resultado.ok ? null : JSON.stringify(resultado.resposta),
    destinatario_telefone: msg.telefone,
    tipo: msg.tipo,
  })

  if (resultado.ok) {
    await supabase.from('mensagens_agendadas').update({
      status: 'enviado',
      tentativas: tentativa,
      evolution_message_id: resultado.messageId ?? null, // coluna legada de nome; agora guarda o wamid da Cloud API
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
