// Fila de mensagens automáticas via WhatsApp (Evolution API).
// Framework-agnostic de propósito: importado tanto pelos server actions/rotas
// do Next.js quanto pelo worker standalone que roda 24/7 na VPS — por isso
// cria o próprio client Supabase (service role) em vez de depender de
// lib/supabase-server.ts, que usa cookies do Next.
import { createClient } from '@supabase/supabase-js'
import { formatarBR } from './tz'
import { formatarNumeroWhatsApp, enviarWhatsApp, type ResultadoEnvio } from './evolution'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ANTECEDENCIA_MINUTOS = 10
const BATCH_SIZE_PADRAO = 10
const PACING_MS = 1500
const BACKOFF_MINUTOS = [2, 10, 30] // por tentativa: 1ª, 2ª, 3ª...

export type TipoMensagem =
  | 'lembrete_entrada' | 'lembrete_meio' | 'lembrete_fim'
  | 'alerta_supervisor_entrada' | 'alerta_supervisor_meio' | 'alerta_supervisor_fim'
  | 'credenciais_supervisor'

type MomentoRegistro = 'entrada' | 'meio' | 'fim'

// Cada batida tem UM "horário limite" (janela_X_fim, o mesmo campo que já
// valida o check-in em registrarPresencaQR/registrarPresencaFoto). O
// lembrete sai 10min antes desse limite; o alerta ao supervisor sai
// exatamente quando o limite expira, se o funcionário ainda não bateu.
const JANELAS: {
  momento: MomentoRegistro
  campoLimite: 'janela_entrada_fim' | 'janela_meio_fim' | 'janela_fim_fim'
  tipoLembrete: TipoMensagem
  tipoAlerta: TipoMensagem
  rotulo: string
}[] = [
  { momento: 'entrada', campoLimite: 'janela_entrada_fim', tipoLembrete: 'lembrete_entrada', tipoAlerta: 'alerta_supervisor_entrada', rotulo: 'Entrada' },
  { momento: 'meio', campoLimite: 'janela_meio_fim', tipoLembrete: 'lembrete_meio', tipoAlerta: 'alerta_supervisor_meio', rotulo: 'Meio do Evento' },
  { momento: 'fim', campoLimite: 'janela_fim_fim', tipoLembrete: 'lembrete_fim', tipoAlerta: 'alerta_supervisor_fim', rotulo: 'Saída' },
]

const MOMENTO_POR_TIPO_ALERTA: Partial<Record<TipoMensagem, MomentoRegistro>> = {
  alerta_supervisor_entrada: 'entrada',
  alerta_supervisor_meio: 'meio',
  alerta_supervisor_fim: 'fim',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

function montarMensagemLembrete(tipo: TipoMensagem, ctx: { nome: string; nomeEvento: string; horarioLimite: string }): string {
  const { nome, nomeEvento, horarioLimite } = ctx
  if (tipo === 'lembrete_entrada') {
    return `Olá, ${nome}!\n\nVocê está escalado para trabalhar no evento ${nomeEvento}.\n\nLembre-se de procurar seu supervisor para registrar seu QR Code de entrada.\n\nHorário limite para o registro: ${horarioLimite}.\n\nNão deixe de registrar sua entrada para evitar problemas na validação da sua presença.`
  }
  if (tipo === 'lembrete_meio') {
    return `Olá, ${nome}!\n\nEstá chegando o momento de confirmar sua presença durante o evento.\n\nTire uma selfie utilizando o sistema, mantendo a geolocalização do seu celular ativada.\n\nPrazo para realizar o registro: ${horarioLimite}.\n\nCaso o registro não seja realizado dentro do prazo, sua presença durante esse período poderá não ser validada.\n\nImportante: Para esta etapa, não é necessário procurar seu supervisor. Você pode realizar o registro de qualquer local dentro do evento.`
  }
  return `Olá, ${nome}!\n\nO evento ${nomeEvento} está chegando ao fim.\n\nProcure seu supervisor para realizar o registro do seu QR Code de saída.\n\nHorário limite: ${horarioLimite}.\n\nApós esse horário, sua saída poderá não ser validada corretamente.`
}

function montarMensagemAlerta(ctx: { nomeSupervisor: string; nomeFuncionario: string; rotulo: string }): string {
  return `Olá, ${ctx.nomeSupervisor}!\n\nO funcionário ${ctx.nomeFuncionario} da sua equipe não registrou o ponto de ${ctx.rotulo} dentro do prazo estabelecido.\n\nVerifique a situação e, caso necessário, entre em contato com o colaborador para identificar o motivo da ausência do registro.`
}

function montarMensagemCredenciais(ctx: {
  nome: string; setorNome: string; eventoNome: string; dataEvento: string; email: string; senha: string
}): string {
  const link = `${SITE_URL}/login`
  return `Olá, ${ctx.nome}!\n\nVocê foi cadastrado como Supervisor no sistema Credenciei e será o responsável pela equipe do setor ${ctx.setorNome} durante o evento ${ctx.eventoNome}, que acontecerá no dia ${ctx.dataEvento}.\n\nAbaixo estão seus dados de acesso:\n\nLogin: ${ctx.email}\nSenha: ${ctx.senha}\nAcesso ao sistema: ${link}\n\nEm caso de dúvidas sobre a utilização da plataforma, entre em contato com o administrador do evento.\n\nSeja bem-vindo!`
}

/**
 * Garante que todo funcionário do evento tenha agendado (1) o lembrete de
 * cada batida e (2) o alerta condicional ao supervisor caso não registre.
 * Idempotente: chamado toda vez que o evento (janelas) ou a equipe
 * (funcionários) mudam. Nunca mexe em linhas já 'enviado'/'cancelado';
 * linhas 'pendente'/'falhou' são atualizadas (reagendamento quando o admin
 * edita a janela).
 */
export async function sincronizarAgendamentos(eventoId: string): Promise<void> {
  const { data: evento } = await supabase
    .from('eventos')
    .select('id, nome, janela_entrada_fim, janela_meio_fim, janela_fim_fim')
    .eq('id', eventoId)
    .single()
  if (!evento) return

  const { data: funcionarios } = await supabase
    .from('funcionarios')
    .select('id, nome, telefone, qr_token, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('fornecedores.evento_id', eventoId)
  if (!funcionarios?.length) return

  const fornecedorIds = [...new Set(funcionarios.map(f => f.fornecedor_id))]
  const { data: supervisores } = await supabase
    .from('perfis')
    .select('nome, telefone, fornecedor_id')
    .eq('role', 'supervisor')
    .eq('ativo', true)
    .in('fornecedor_id', fornecedorIds)
  // Se houver mais de um supervisor ativo no mesmo setor, o alerta vai só
  // pro primeiro encontrado (a constraint de dedupe é por funcionário+tipo,
  // não dá pra notificar vários sem redesenhar a chave de dedupe).
  const supervisorPorFornecedor = new Map<string, { nome: string; telefone: string | null }>()
  for (const s of supervisores ?? []) {
    if (!supervisorPorFornecedor.has(s.fornecedor_id as string)) {
      supervisorPorFornecedor.set(s.fornecedor_id as string, { nome: s.nome, telefone: s.telefone })
    }
  }

  const { data: existentes } = await supabase
    .from('mensagens_agendadas')
    .select('funcionario_id, tipo, status')
    .eq('evento_id', eventoId)
  const travados = new Set(
    (existentes ?? [])
      .filter(m => m.status === 'enviado' || m.status === 'cancelado')
      .map(m => `${m.funcionario_id}:${m.tipo}`)
  )

  const agora = Date.now()
  const linhas: {
    evento_id: string; funcionario_id: string; tipo: TipoMensagem
    agendado_para: string; telefone: string; mensagem: string; condicao?: string
  }[] = []

  for (const func of funcionarios) {
    for (const janela of JANELAS) {
      const horarioLimiteISO = (evento as Record<string, unknown>)[janela.campoLimite] as string | null
      if (!horarioLimiteISO) continue
      const horarioLimiteFmt = formatarBR(horarioLimiteISO, 'hora')

      // Lembrete ao funcionário, 10min antes do limite
      if (!travados.has(`${func.id}:${janela.tipoLembrete}`)) {
        const agendadoPara = new Date(new Date(horarioLimiteISO).getTime() - ANTECEDENCIA_MINUTOS * 60_000)
        if (agendadoPara.getTime() > agora) {
          linhas.push({
            evento_id: eventoId,
            funcionario_id: func.id,
            tipo: janela.tipoLembrete,
            agendado_para: agendadoPara.toISOString(),
            telefone: func.telefone,
            mensagem: montarMensagemLembrete(janela.tipoLembrete, {
              nome: func.nome,
              nomeEvento: evento.nome,
              horarioLimite: horarioLimiteFmt,
            }),
          })
        }
      }

      // Alerta ao supervisor, exatamente no limite, condicionado a não ter registro
      if (!travados.has(`${func.id}:${janela.tipoAlerta}`)) {
        const supervisor = supervisorPorFornecedor.get(func.fornecedor_id as string)
        const limiteMs = new Date(horarioLimiteISO).getTime()
        if (supervisor?.telefone && limiteMs > agora) {
          linhas.push({
            evento_id: eventoId,
            funcionario_id: func.id,
            tipo: janela.tipoAlerta,
            agendado_para: horarioLimiteISO,
            telefone: supervisor.telefone,
            mensagem: montarMensagemAlerta({
              nomeSupervisor: supervisor.nome,
              nomeFuncionario: func.nome,
              rotulo: janela.rotulo,
            }),
            condicao: 'sem_registro',
          })
        }
      }
    }
  }
  if (!linhas.length) return

  await supabase.from('mensagens_agendadas').upsert(linhas, { onConflict: 'evento_id,funcionario_id,tipo' })
}

/**
 * Agenda o envio (imediato) das credenciais de acesso pro supervisor
 * recém-criado. Chamado uma vez, direto de criarSupervisor. Não repete: se
 * já existe uma linha pra esse perfil (por qualquer motivo), não duplica.
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
}): Promise<void> {
  const { data: existe } = await supabase
    .from('mensagens_agendadas')
    .select('id')
    .eq('perfil_id', params.perfilId)
    .eq('tipo', 'credenciais_supervisor')
    .limit(1)
  if (existe?.length) return

  const { error } = await supabase.from('mensagens_agendadas').insert([{
    evento_id: params.eventoId,
    perfil_id: params.perfilId,
    tipo: 'credenciais_supervisor',
    agendado_para: new Date().toISOString(),
    telefone: params.telefone,
    mensagem: montarMensagemCredenciais(params),
  }])
  if (error && error.code !== '23505') throw error // 23505 = unique_violation (corrida rara), ignora
}

/**
 * Processa um lote de mensagens devidas: reivindica (claim atômico via UPDATE
 * condicional — sem função de banco), checa condição (quando houver), envia
 * pela Evolution API, loga cada tentativa e aplica retry com backoff.
 * Chamado tanto pelo worker da VPS (a cada ~20s) quanto pela rota /api/cron
 * (fallback via Vercel Cron).
 */
export async function processarFilaMensagens(limite = BATCH_SIZE_PADRAO): Promise<{ processadas: number }> {
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
    await new Promise(r => setTimeout(r, PACING_MS))
  }
  return { processadas }
}

type MensagemClaimada = {
  id: string
  evento_id: string
  funcionario_id: string | null
  tipo: TipoMensagem
  condicao: string | null
  telefone: string
  mensagem: string
  tentativas: number
  max_tentativas: number
}

/** Pra alertas condicionais: só envia se o funcionário AINDA não tiver o registro daquela batida. */
async function devoEnviar(msg: MensagemClaimada): Promise<boolean> {
  if (msg.condicao !== 'sem_registro') return true
  const momento = MOMENTO_POR_TIPO_ALERTA[msg.tipo]
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

async function enviarUma(msg: MensagemClaimada): Promise<void> {
  if (!(await devoEnviar(msg))) {
    await supabase.from('mensagens_agendadas').update({ status: 'cancelado' }).eq('id', msg.id)
    return
  }

  const tentativa = msg.tentativas + 1
  const numero = formatarNumeroWhatsApp(msg.telefone)

  const resultado: ResultadoEnvio = numero
    ? await enviarWhatsApp(numero, msg.mensagem)
    : { ok: false, statusHttp: 0, resposta: { erro: 'Telefone inválido' } }

  await supabase.from('mensagens_log').insert({
    mensagem_agendada_id: msg.id,
    tentativa,
    status: resultado.ok ? 'sucesso' : 'erro',
    status_http: resultado.statusHttp,
    resposta_evolution: resultado.resposta,
    erro: resultado.ok ? null : JSON.stringify(resultado.resposta),
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
