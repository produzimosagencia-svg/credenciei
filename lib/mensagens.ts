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

const ANTECEDENCIA_REFORCO_MINUTOS = 2
// Baileys (WhatsApp Web não-oficial) pune padrão de envio automatizado —
// mensagens parecidas, pra gente diferente, com link, num intervalo curto
// e uniforme é a assinatura clássica de spam. Lote pequeno + intervalo
// variável (não fixo) reduz bastante o risco de restrição da conta.
const BATCH_SIZE_PADRAO = 5
const PACING_MS_MIN = 4000
const PACING_MS_MAX = 9000
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

const MOMENTO_POR_TIPO_CONDICIONAL: Partial<Record<TipoMensagem, MomentoRegistro>> = {
  alerta_supervisor_entrada: 'entrada',
  alerta_supervisor_meio: 'meio',
  alerta_supervisor_fim: 'fim',
  reforco_entrada: 'entrada',
  reforco_meio: 'meio',
  reforco_fim: 'fim',
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

/** Telefone de exibição (mensagens_agendadas.telefone/funcionarios.telefone são só dígitos, sem DDI). */
function formatarTelefoneExibicao(tel: string): string {
  const d = (tel ?? '').replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return tel
}

function montarMensagemLembrete(tipo: TipoMensagem, ctx: { nome: string; nomeEvento: string; horarioAbertura: string; horarioLimite: string; link: string }): string {
  const { nome, nomeEvento, horarioAbertura, horarioLimite, link } = ctx
  if (tipo === 'lembrete_entrada') {
    return `Olá, ${nome}! 👋\n\nVocê está escalado para trabalhar no evento ${nomeEvento} 🎉\n\n📋 Lembre-se de procurar seu supervisor para registrar seu QR Code de entrada.\n\n⏰ Registro de entrada disponível de ${horarioAbertura} até ${horarioLimite}.\n\n⚠️ Não deixe de registrar sua entrada para evitar problemas na validação da sua presença.\n\n🔗 Sua credencial com QR Code:\n${link}`
  }
  if (tipo === 'lembrete_meio') {
    return `Olá, ${nome}! 👋\n\n📸 Está chegando o momento de confirmar sua presença durante o evento.\n\nTire uma selfie utilizando o sistema, mantendo a geolocalização do seu celular ativada 📍\n\n⏰ Registro disponível de ${horarioAbertura} até ${horarioLimite}.\n\n⚠️ Caso o registro não seja realizado dentro do prazo, sua presença durante esse período poderá não ser validada.\n\nℹ️ Importante: para esta etapa, não é necessário procurar seu supervisor. Você pode realizar o registro de qualquer local dentro do evento.\n\n🔗 Toque no link para registrar:\n${link}`
  }
  return `Olá, ${nome}! 👋\n\nO evento ${nomeEvento} está chegando ao fim 🏁\n\n📋 Procure seu supervisor para realizar o registro do seu QR Code de saída.\n\n⏰ Registro de saída disponível de ${horarioAbertura} até ${horarioLimite}.\n\n⚠️ Após esse horário, sua saída poderá não ser validada corretamente.\n\n🔗 Sua credencial com QR Code:\n${link}`
}

function montarMensagemReforco(tipo: TipoMensagem, ctx: { nome: string; nomeEvento: string; horarioLimite: string; link: string }): string {
  const { nome, nomeEvento, horarioLimite, link } = ctx
  if (tipo === 'reforco_entrada') {
    return `Olá, ${nome}! ⏰\n\n🚨 Faltam poucos minutos para o prazo de registro da sua entrada no evento ${nomeEvento} se encerrar!\n\nProcure seu supervisor AGORA para registrar seu QR Code de entrada.\n\n⏰ Horário limite: ${horarioLimite}.\n\n⚠️ Após esse horário, sua entrada poderá não ser validada.\n\n🔗 Sua credencial com QR Code:\n${link}`
  }
  if (tipo === 'reforco_meio') {
    return `Olá, ${nome}! ⏰\n\n🚨 Faltam poucos minutos para o prazo de confirmação da sua presença no evento ${nomeEvento} se encerrar!\n\nTire sua selfie AGORA pelo sistema, com a geolocalização ativada 📍\n\n⏰ Prazo: ${horarioLimite}.\n\n⚠️ Após esse horário, sua presença nesse período poderá não ser validada.\n\n🔗 Toque no link para registrar:\n${link}`
  }
  return `Olá, ${nome}! ⏰\n\n🚨 Faltam poucos minutos para o prazo de registro da sua saída do evento ${nomeEvento} se encerrar!\n\nProcure seu supervisor AGORA para registrar seu QR Code de saída.\n\n⏰ Horário limite: ${horarioLimite}.\n\n⚠️ Após esse horário, sua saída poderá não ser validada.\n\n🔗 Sua credencial com QR Code:\n${link}`
}

/**
 * Confirmação de escala pré-evento: enviada no horário que o produtor definir
 * (horas antes ou no dia), confirmando função/setor e trazendo as instruções
 * específicas do evento (documento, uniforme etc.), personalizáveis por evento.
 */
function montarMensagemConfirmacaoEscala(ctx: {
  nome: string; nomeEvento: string; setorNome: string; cargo: string
  dataEvento: string; local: string | null; instrucoes: string | null; link: string
}): string {
  const partes = [
    `Olá, ${ctx.nome}! 👋`,
    `✅ Confirmação de escala: você está escalado para trabalhar no evento ${ctx.nomeEvento} 🎉`,
    `📋 Função: ${ctx.cargo || 'não informada'}\n🏢 Setor/Equipe: ${ctx.setorNome}\n📅 Data: ${ctx.dataEvento}${ctx.local ? `\n📍 Local: ${ctx.local}` : ''}`,
  ]
  if (ctx.instrucoes) partes.push(`ℹ️ Instruções do evento:\n${ctx.instrucoes}`)
  partes.push(`🔗 Sua credencial com QR Code:\n${ctx.link}`)
  return partes.join('\n\n')
}

function montarMensagemCredenciais(ctx: {
  nome: string; setorNome: string; eventoNome: string; dataEvento: string; email: string; senha: string; linkFormulario: string
}): string {
  const link = `${SITE_URL}/login`
  return `Olá, ${ctx.nome}! 🎉\n\nVocê foi cadastrado como Supervisor no sistema Credenciei e será o responsável pela equipe do setor ${ctx.setorNome} durante o evento ${ctx.eventoNome}, que acontecerá no dia ${ctx.dataEvento} 📅\n\n🔑 Abaixo estão seus dados de acesso:\n\nLogin: ${ctx.email}\nSenha: ${ctx.senha}\n\n🔗 Acesso ao sistema:\n${link}\n\n📝 Formulário de cadastro da sua equipe:\n${ctx.linkFormulario}\n\nEm caso de dúvidas sobre a utilização da plataforma, entre em contato com o administrador do evento.\n\nSeja bem-vindo! 👏`
}

/**
 * Garante que todo funcionário do evento tenha agendado (1) o lembrete de
 * cada batida, (2) o reforço condicional a ele mesmo perto do fechamento e
 * (3) o alerta condicional ao supervisor caso não registre.
 * Idempotente: chamado toda vez que o evento (janelas) ou a equipe
 * (funcionários) mudam. Nunca mexe em linhas já 'enviado'/'cancelado';
 * linhas 'pendente'/'falhou' são atualizadas (reagendamento quando o admin
 * edita a janela).
 */
export async function sincronizarAgendamentos(eventoId: string): Promise<void> {
  const { data: evento } = await supabase
    .from('eventos')
    .select('id, nome, local, data_inicio, msg_pre_evento_envio, msg_pre_evento_instrucoes, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
    .eq('id', eventoId)
    .single()
  if (!evento) return

  // Só quem está ATIVADO trabalha — excedentes (acima do teto do setor) não
  // recebem lembrete nenhum até serem ativados no painel.
  const { data: funcionarios } = await supabase
    .from('funcionarios')
    .select('id, nome, telefone, cargo, qr_token, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .eq('ativo', true)
  if (!funcionarios?.length) return

  const fornecedorIds = [...new Set(funcionarios.map(f => f.fornecedor_id))]
  const { data: supervisores } = await supabase
    .from('perfis')
    .select('id, nome, telefone, fornecedor_id')
    .eq('role', 'supervisor')
    .eq('ativo', true)
    .in('fornecedor_id', fornecedorIds)
  // Se houver mais de um supervisor ativo no mesmo setor, o alerta vai só
  // pro primeiro encontrado (a constraint de dedupe é por perfil+tipo, não
  // dá pra notificar vários sem redesenhar a chave de dedupe).
  const supervisorPorFornecedor = new Map<string, { perfilId: string; nome: string; telefone: string | null }>()
  for (const s of supervisores ?? []) {
    if (!supervisorPorFornecedor.has(s.fornecedor_id as string)) {
      supervisorPorFornecedor.set(s.fornecedor_id as string, { perfilId: s.id, nome: s.nome, telefone: s.telefone })
    }
  }

  const { data: fornecedores } = await supabase.from('fornecedores').select('id, nome').in('id', fornecedorIds)
  const nomeSetorPorFornecedor = new Map((fornecedores ?? []).map(f => [f.id as string, f.nome as string]))

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
  const linhasFuncionario: {
    evento_id: string; funcionario_id: string; tipo: TipoMensagem
    agendado_para: string; telefone: string; mensagem: string; condicao?: string
  }[] = []
  const linhasSupervisor: {
    evento_id: string; perfil_id: string; tipo: TipoMensagem
    agendado_para: string; telefone: string; mensagem: string; condicao?: string
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
          mensagem: montarMensagemConfirmacaoEscala({
            nome: func.nome,
            nomeEvento: evento.nome,
            setorNome: nomeSetorPorFornecedor.get(func.fornecedor_id as string) ?? 'seu setor',
            cargo: func.cargo ?? '',
            dataEvento: evento.data_inicio ? formatarBR(evento.data_inicio, 'curto') : 'a confirmar',
            local: evento.local ?? null,
            instrucoes: evento.msg_pre_evento_instrucoes ?? null,
            link: `${SITE_URL}/credential/${func.qr_token}`,
          }),
        })
      }
    }

    for (const janela of JANELAS) {
      const horarioInicioISO = (evento as Record<string, unknown>)[janela.campoInicio] as string | null
      const horarioLimiteISO = (evento as Record<string, unknown>)[janela.campoFim] as string | null
      const horarioLimiteFmt = horarioLimiteISO ? formatarBR(horarioLimiteISO, 'hora') : ''

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
            mensagem: montarMensagemLembrete(janela.tipoLembrete, {
              nome: func.nome,
              nomeEvento: evento.nome,
              horarioAbertura: formatarBR(horarioInicioISO, 'hora'),
              horarioLimite: horarioLimiteFmt,
              link: `${SITE_URL}/credential/${func.qr_token}`,
            }),
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
            mensagem: montarMensagemReforco(janela.tipoReforco, {
              nome: func.nome,
              nomeEvento: evento.nome,
              horarioLimite: horarioLimiteFmt,
              link: `${SITE_URL}/credential/${func.qr_token}`,
            }),
            condicao: 'sem_registro',
          })
        }
      }
    }
  }

  // Alerta ao supervisor: UMA mensagem por setor/etapa (não por funcionário),
  // listando todo mundo que ainda estiver sem registro. O texto real (quem
  // exatamente está faltando) só dá pra saber no momento do envio — aqui só
  // agenda o "gatilho"; processarFilaMensagens monta a lista na hora.
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
        mensagem: '(gerado no momento do envio)',
        condicao: 'lista_sem_registro',
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
  // Interruptor de emergência: seta WHATSAPP_PAUSADO=true (worker na VPS e/ou
  // Vercel) pra parar todo envio na hora, sem precisar redeployar — útil se a
  // conta levar uma restrição da própria WhatsApp e for preciso parar rápido.
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

/** Pra alertas condicionais ao próprio funcionário: só envia se ele AINDA não tiver o registro daquela batida. */
async function devoEnviar(msg: MensagemClaimada): Promise<boolean> {
  if (msg.condicao !== 'sem_registro') return true
  const momento = MOMENTO_POR_TIPO_CONDICIONAL[msg.tipo]
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
 * Alerta agregado ao supervisor: monta, na hora do envio (não dá pra
 * pré-computar no agendamento), a lista de todos os funcionários do setor
 * ainda sem registro naquela batida. Retorna null se ninguém estiver
 * faltando (nada a avisar) — nesse caso a mensagem é cancelada.
 */
async function montarMensagemAgregada(msg: MensagemClaimada): Promise<string | null> {
  const momento = MOMENTO_POR_TIPO_CONDICIONAL[msg.tipo]
  if (!momento || !msg.perfil_id) return null

  const { data: supervisor } = await supabase
    .from('perfis')
    .select('nome, fornecedor_id')
    .eq('id', msg.perfil_id)
    .single()
  if (!supervisor?.fornecedor_id) return null

  const { data: fornecedor } = await supabase
    .from('fornecedores')
    .select('nome')
    .eq('id', supervisor.fornecedor_id)
    .single()

  const { data: funcionarios } = await supabase
    .from('funcionarios')
    .select('id, nome, telefone')
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
  const lista = semRegistro.map(f => `• ${f.nome} (${formatarTelefoneExibicao(f.telefone)})`).join('\n')

  return `Olá, ${supervisor.nome}! 👋\n\n⚠️ Os funcionários abaixo do setor ${fornecedor?.nome ?? 'seu setor'} não registraram o ponto de ${rotulo} dentro do prazo estabelecido:\n\n${lista}\n\n🔎 Verifique a situação e, caso necessário, entre em contato com os colaboradores para identificar o motivo da ausência do registro.`
}

async function enviarUma(msg: MensagemClaimada): Promise<void> {
  let mensagem = msg.mensagem

  if (msg.condicao === 'lista_sem_registro') {
    const agregada = await montarMensagemAgregada(msg)
    if (!agregada) {
      await supabase.from('mensagens_agendadas').update({ status: 'cancelado' }).eq('id', msg.id)
      return
    }
    mensagem = agregada
  } else if (!(await devoEnviar(msg))) {
    await supabase.from('mensagens_agendadas').update({ status: 'cancelado' }).eq('id', msg.id)
    return
  }

  const tentativa = msg.tentativas + 1
  const numero = formatarNumeroWhatsApp(msg.telefone)

  const resultado: ResultadoEnvio = numero
    ? await enviarWhatsApp(numero, mensagem)
    : { ok: false, statusHttp: 0, resposta: { erro: 'Telefone inválido' } }

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
