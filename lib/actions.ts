'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getPerfil, supabaseAdmin, podeEscanearEvento, meusSetores, buscarTudo, eventosAcontecendoHoje, diaDoTurno, ehDaOrganizacaoDoPerfil } from './supabase-server'
import { historicoDoFuncionario, podeVerHistoricoDe, type HistoricoNoEvento } from './historico'
import { redirect } from 'next/navigation'
import {
  criarPlanilhaEvento,
  garantirAbaFornecedor,
  adicionarFuncionarioNaPlanilha,
  registrarPresencaNaPlanilha,
  atualizarValorNaPlanilha,
  garantirPastaCliente,
} from './google-sheets'
import {
  podeGerenciarUsuarios,
  podeGerenciarEventos,
  podeGerenciarVeiculos,
  podeGerenciarOrganizacoes,
  podeExcluir,
  podeExcluirDaEquipe,
  podeExcluirOperadorPortao,
  CAPACIDADES,
  PAPEIS_CONFIGURAVEIS,
  capacidadesDoPapel,
  podeEditarIdentidade,
  podeEscanear,
  podeAcompanhar,
  ehMaster,
  soBateMeio,
  ROLE_LABELS,
  type Role,
} from './permissions'
import { inputParaISO, formatarBR } from './tz'
import {
  diaBRT, janelaDoMeio, janelaMeio, avaliarEntradaSaida, faseAtualDoQR, conferirHorariosDoEvento, periodoDoEvento,
  somarDias, TETO_TURNO_H, horariosEsperados, type EventoJanelas, type DiaDaJornada, type FaseDoDia,
} from './janelas'
import { chaveBusca, validarCpf, formatCpf, nomeEmMaiusculo } from './format'
import { grafiaDaCidade } from './cidades'
import { normalizarCpf, cpfParaEmail, usuarioParaEmail } from './usuario'
import { mensagemAmigavel } from './erros'
import { statusVeiculoValido, tipoCadastroValido, type StatusVeiculo } from './veiculos-constantes'
import { sincronizarFuncionarioNaPlanilha, sincronizarRegistroNaPlanilha, diasDoEvento, diasComBatida, cpfEstaBloqueado, obterFuncionalidadesOrganizacao, obterFuncionalidadesDoEvento, garantirFuncaoExtra, removerFuncaoExtra, jaRecebeuMensagemNoEvento, subeventosComCadastroSuspenso, travasDeCadastroDoEvento, motivoCadastroTravado, CHAVES_FUNCIONALIDADES } from './internos-servidor'
import { podeReceberFuncaoExtra, MSG_FUNCAO_NAO_COMBINA } from './funcoes'
import { ehFuncaoNaEquipe, rotuloDaFuncao, cargoAcompanhaFuncao, type FuncaoNaEquipe } from './funcao-na-equipe'
import { pessoaDaBase } from './base-pessoas'
import { MSG_FUNCIONALIDADE_DESLIGADA } from './encarregado'
import { alterarEncarregadoNoSetor } from './actions-encarregado'
import { alcancaSetor } from './autorizacao'
import { statusCredenciamentoValido, minutosParaNovoPedido, ESPERA_NOVO_PEDIDO_MIN, type StatusCredenciamento } from './credenciamento-constantes'
import {
  eventoUsaEscalaPorDia, diasDaEscalaDoEvento, escalaDoFuncionario, conferirEscalaNoDia,
  gravarDiasEscolhidos, gravarEscalaAprovada, diasLotados, travasDoFornecedor, gravarTravasDoFornecedor, vagaNoSetorNoDia,
  pessoaEhSupervisor, relatorioTravasPorDia,
  type DetalheCredenciamento, type RelatorioTravas,
} from './escala'
import { conferirDiasPermitidos, listarDias, rotuloDoDia, type DiaDaEscala } from './escala-regras'
import {
  planejarEstrutura, mesmoNome, normalizarCpfPlanilha, maiorTrava,
  type LinhaEstrutura, type LinhaPlanejada, type PlanoEstrutura, type ContextoEstrutura, type ResultadoLinhaEstrutura,
  type DecisoesEstrutura,
} from './estrutura-regras'
import { emLotes } from './lotes'
import {
  TAMANHO_MINIMO_DEPOIMENTO, TAMANHO_MAXIMO_DEPOIMENTO, TAMANHO_MINIMO_JUSTIFICATIVA,
  resumirAvaliacoes, type Depoimento, type TipoDepoimento, type Avaliacao, type ResumoAvaliacoes,
} from './depoimentos'
import { podePassar } from './limite'
import { verificarTurnstile } from './turnstile'
import { setoresComMeio, diasComMeio } from './meio'
import { suporteTemEscopo } from './suporte'
import { registrarAuditoria, registrarCadastroFuncionario } from './auditoria'
import { guardarNaLixeira } from './lixeira'
import { avaliarLocal, posicaoValida, descreverDistancia, type Posicao, type LocalDoEvento } from './geo-local'
import {
  obterAutoatendimento, autoatendimentoLiberadoAgora, diaDoAutoatendimentoLiberado, descreverJanela,
  diasAutoatendimentoDoEvento, diaPermiteAutoatendimento, diaDaAtivacao,
} from './autoatendimento'
import { relatorioForaDoLocal, tentativasForaDoLocalDe, type RelatorioForaDoLocal } from './alertas-local'
import { enviarMensagemAgora, sincronizarAgendamentos, agendarBoasVindasFuncionario, agendarMeioAposEntrada, agendarTemplateSupervisor, cancelarMeioDesligado, agendarConfirmacaoVeiculo, agendarCredenciamentoNegado } from './mensagens'
import QRCode from 'qrcode'

type PerfilDaSessao = NonNullable<Awaited<ReturnType<typeof getPerfil>>>
import { enderecoAproximado } from './geocoding'
import { lerCodigoQR, gerarCodigoQR, faseConfere, NOME_DA_FASE } from './credencial-qr'
import { descritorValido, distanciaEuclidiana, decidirMatch, MENSAGEM_POR_MOTIVO, LIMIAR_PADRAO, type Candidato } from './biometria'
import { urlBase } from './ia/ferramentas/base'
import { criarConviteSenhaSupervisor } from './supervisor-convite'
import {
  consultarAutorizacaoCadastroIndividual,
  criarAutorizacaoCadastroIndividual,
} from './cadastro-individual'

/** "12345678900" → "123.456.789-00". Só para leitura humana na mensagem. */
function formatarCpfExibicao(cpf: string): string {
  const d = (cpf ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

/**
 * Garante que o evento tenha o DIA PRINCIPAL materializado.
 *
 * Sem essa linha ninguém bate ponto: a validação pergunta "esta data é dia de
 * trabalho deste evento?" e, não achando nada, recusa com "não está marcado
 * como dia de trabalho". Foi exatamente o que aconteceu — o evento nasceu
 * vazio e a equipe ficou parada no portão.
 *
 * Antes quem criava essa linha era a tela de dias de preparação, que saiu do
 * ar a pedido. O dia principal não pode depender dela: ele é a data do próprio
 * evento, não uma escolha do produtor.
 *
 * Chamada também ao EDITAR: mudar a data do evento move o dia principal junto,
 * senão o sistema seguiria cobrando ponto num dia que não existe mais.
 */
async function garantirDiaPrincipal(eventoId: string, dataInicioISO: string | null, dataFimISO?: string | null) {
  if (!dataInicioISO) return
  const dia = diaBRT(dataInicioISO)
  const periodo = periodoDoEvento({ data_inicio: dataInicioISO, data_fim: dataFimISO ?? null })!

  /*
   * A data mudou? O dia antigo vira preparação em vez de sumir: se houve
   * batida nele, ela precisa continuar tendo um dia ao qual pertencer.
   *
   * MAS: um dia principal EXTRA de verdade (a segunda noite de um festival,
   * ver `salvarDiasPrincipaisExtras`) nunca pode ser rebaixado aqui — ele
   * está DENTRO do período do evento e sempre tem horário próprio
   * (`entrada_inicio`). Só rebaixa quem está fora do período OU sem
   * horário próprio — sinal de que é sobra de uma data antiga, não um dia
   * principal extra deliberado.
   */
  await supabaseAdmin
    .from('jornada_dias')
    .update({ tipo: 'preparacao' })
    .eq('evento_id', eventoId)
    .eq('tipo', 'principal')
    .neq('data', dia)
    .or(`entrada_inicio.is.null,data.lt.${periodo.primeiro},data.gt.${periodo.ultimo}`)

  const { error } = await supabaseAdmin.from('jornada_dias').upsert(
    [{ evento_id: eventoId, jornada_id: null, data: dia, turno: 0, tipo: 'principal', cancelado: false }],
    { onConflict: 'evento_id,data,turno' },
  )
  if (error) console.error('[evento] não consegui materializar o dia principal:', error.message)

  await preencherDiasEntre(eventoId, periodo)
}

/**
 * Evento de mais de um dia: os dias ENTRE início e fim viram dia de trabalho
 * automaticamente, como 'preparacao' (entrada/saída livres).
 *
 * Pedido do Juan (28/09/2026, teste ao vivo): marcar "27 a 30" na data do
 * evento e só aparecerem 2 dias de trabalho (27 e 30, quando alguém lembrou
 * de marcar a desmontagem) confundia — ele esperava ver a sequência inteira.
 * Antes disso o produtor precisava marcar cada dia do meio à mão na grade
 * "Dias de trabalho"; continua podendo DESMARCAR um dia de folga de verdade
 * lá, isto só preenche o padrão. Só entra o que ainda não existe — nunca
 * sobrescreve um dia já marcado (ex.: uma desmontagem cadastrada antes de o
 * fim do evento mudar).
 *
 * Chamada por `garantirDiaPrincipal` (todo evento CRIADO ou EDITADO depois
 * de 28/09/2026 já sai com isto certo) e por `preencherDiasFaltantesDeTodosEventos`
 * (a limpeza única pros eventos que já existiam antes desta data).
 */
async function preencherDiasEntre(eventoId: string, periodo: { primeiro: string; ultimo: string }): Promise<number> {
  if (periodo.ultimo <= periodo.primeiro) return 0

  const { data: existentes } = await supabaseAdmin
    .from('jornada_dias').select('data')
    .eq('evento_id', eventoId)
    .gte('data', periodo.primeiro).lte('data', periodo.ultimo)
  const jaTem = new Set((existentes ?? []).map(d => d.data as string))
  const faltando: { evento_id: string; jornada_id: null; data: string; turno: number; tipo: 'preparacao'; cancelado: boolean }[] = []
  for (let d = somarDias(periodo.primeiro, 1); d <= periodo.ultimo; d = somarDias(d, 1)) {
    if (!jaTem.has(d)) faltando.push({ evento_id: eventoId, jornada_id: null, data: d, turno: 0, tipo: 'preparacao', cancelado: false })
  }
  if (!faltando.length) return 0

  const { error } = await supabaseAdmin.from('jornada_dias').insert(faltando)
  if (error) { console.error('[evento] não consegui preencher os dias entre início e fim:', error.message); return 0 }
  return faltando.length
}

/**
 * Limpeza ÚNICA (28/09/2026): aplica `preencherDiasEntre` em TODO evento que
 * já existia antes desta correção — sem esperar que alguém reabra e salve a
 * tela de editar evento de cada um. Só master, mesma razão de
 * `liberarDescredenciamentosIndevidos`: mexe em qualquer organização.
 */
export async function preencherDiasFaltantesDeTodosEventos(): Promise<{ eventos: number; dias: number }> {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) throw new Error('Só o acesso master pode rodar esta limpeza.')

  const { data: eventos } = await supabaseAdmin.from('eventos').select('id, data_inicio, data_fim')

  let eventosAfetados = 0
  let diasCriados = 0
  for (const e of eventos ?? []) {
    const periodo = periodoDoEvento(e as { data_inicio: string | null; data_fim: string | null })
    if (!periodo) continue
    const n = await preencherDiasEntre(e.id as string, periodo)
    if (n > 0) { eventosAfetados++; diasCriados += n }
  }

  if (diasCriados) {
    after(() => registrarAuditoria({
      perfil: perfil as { id: string; nome: string },
      acao: 'LIMPEZA_DIAS_DE_TRABALHO',
      motivo: `Preencheu ${diasCriados} dia(s) de trabalho faltando em ${eventosAfetados} evento(s) (dias entre início e fim sem jornada_dias)`,
    }))
  }

  return { eventos: eventosAfetados, dias: diasCriados }
}

// Com RLS ligado, o banco só é acessível pela service role (no servidor).
// A autorização por organização é feita aqui, via getPerfil, antes de cada operação.
function getAdminSupabase() {
  return supabaseAdmin
}

/**
 * Recusa horários impossíveis antes de gravar.
 *
 * A conferência também roda no navegador, enquanto a pessoa preenche — que é
 * onde ela ajuda de verdade. Esta aqui é a regra: JavaScript desligado, aba
 * antiga, requisição montada à mão, tudo passa por este ponto. Sem ela, a
 * validação do formulário seria uma sugestão.
 *
 * Só o que é IMPOSSÍVEL bloqueia. Os alertas de "confira este ponto" ficam na
 * tela e não impedem nada: são casos raros mas legítimos, e barrá-los aqui
 * deixaria o produtor sem saída num evento fora do padrão.
 */
function exigirHorariosCoerentes(dados: Parameters<typeof conferirHorariosDoEvento>[0]) {
  const impossivel = conferirHorariosDoEvento(dados).filter(p => p.bloqueia)
  if (impossivel.length) throw new Error(impossivel.map(p => p.mensagem).join(' '))
}

/**
 * Atalho da auditoria para as ações deste arquivo: grava DEPOIS da resposta (`after`) e nunca derruba a ação.
 * "Tudo que acontece no sistema, de todas as pessoas, precisa estar na auditoria" (Juan, 08/10/2026) — a régua
 * é conferida por testes/auditoria-cobertura.mjs: ação nova que grava sem passar por aqui quebra o teste.
 */
function auditar(
  perfil: { id: string | null; nome: string } | null | undefined,
  acao: string,
  dados: Omit<Parameters<typeof registrarAuditoria>[0], 'perfil' | 'acao'> = {},
) {
  if (!perfil) return
  after(() => registrarAuditoria({ perfil: { id: perfil.id, nome: perfil.nome }, acao, ...dados }))
}

/** Texto curto para a auditoria (nada de parágrafo inteiro na linha). */
const curto = (v: unknown, max = 120) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

async function exigirGestorDeEventos() {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil)) throw new Error('Sem permissão')
  return perfil
}

/**
 * Garante que quem chama pode gerenciar eventos E que o evento pertence à
 * organização dele (master passa por qualquer evento). Isolamento por org nas
 * escritas — necessário porque o id do evento vem do cliente.
 */
async function exigirEventoDaOrg(eventoId: string) {
  const perfil = await exigirGestorDeEventos()
  const { data: evento } = await supabaseAdmin
    .from('eventos')
    .select('id, organizacao_id')
    .eq('id', eventoId)
    .single()
  if (!evento) throw new Error('Evento não encontrado')
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    throw new Error('Sem permissão sobre este evento')
  }
  return perfil
}

/**
 * Acesso à equipe (funcionários) de um fornecedor/setor: gestores de evento da
 * própria organização, OU o supervisor vinculado a ESTE setor especificamente
 * ("Gerenciar a equipe vinculada ao seu setor").
 */
async function exigirAcessoFuncionarios(fornecedorId: string, eventoId: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')
  if (perfil.role === 'supervisor') {
    /*
     * Os setores DELE, no plural.
     *
     * Um supervisor pode cobrir vários setores (`supervisor_setores`, e o
     * botão "Trocar de setor" no painel existe pra isso). Comparar só com
     * `perfil.fornecedor_id` dava a ele um painel que abre e botões que
     * recusam em todos os setores menos um — e a rota de importação já
     * usava a régua certa, então as duas discordavam sobre o mesmo setor.
     */
    const meus = await meusSetores(perfil)
    if (!meus.some(s => s.id === fornecedorId)) throw new Error('Sem permissão sobre este fornecedor')
    return perfil
  }
  if (!podeGerenciarEventos(perfil)) throw new Error('Sem permissão')
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')
  if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) {
    throw new Error('Sem permissão sobre este evento')
  }
  return perfil
}

/** Extrai as 3 janelas de horário (entrada/meio/fim) do formulário, já em BRT. */
function janelasDoForm(formData: FormData) {
  const g = (k: string) => inputParaISO(formData.get(k) as string)
  return {
    /*
     * Caixa desmarcada não é enviada pelo navegador — o campo simplesmente não
     * aparece no formulário. Por isso a leitura é "veio marcado?", e não
     * "qual o valor?": ler o valor faria desmarcar virar `null` em vez de
     * `false`, e o evento continuaria travado sem ninguém entender por quê.
     */
    batida_livre: formData.get('batida_livre') === 'on',
    /*
     * Os dois fluxos coexistem por evento, não é uma coisa que o sistema
     * decide sozinho. Desligado, o dia principal continua só no Fluxo 1
     * (crachá lido por um operador) — igual sempre foi. Ligado, o QR fixo da
     * portaria (auto-cadastro/identificação por CPF) TAMBÉM libera entrada
     * e saída no dia principal, sem tirar o scanner do operador de cena: os
     * dois caminhos ficam disponíveis ao mesmo tempo, e cada pessoa usa o
     * que estiver mais à mão. Nos dias de montagem/desmontagem isto nunca
     * entra em jogo — lá o auto-atendimento já é sempre o padrão.
     */
    checkin_autonomo: formData.get('checkin_autonomo') === 'on',
    janela_entrada_inicio: g('janela_entrada_inicio'),
    janela_entrada_fim: g('janela_entrada_fim'),
    janela_meio_inicio: g('janela_meio_inicio'),
    janela_meio_fim: g('janela_meio_fim'),
    janela_fim_inicio: g('janela_fim_inicio'),
    janela_fim_fim: g('janela_fim_fim'),
  }
}

/**
 * Os dias principais EXTRAS do formulário de criação — "o evento tem mais
 * de uma noite?" (`DiasPrincipaisExtrasNovo.tsx`). Cada campo usa o MESMO
 * `name` em todos os blocos; `getAll` devolve um por bloco, na ordem do DOM.
 * Blocos totalmente vazios (usuário clicou "adicionar" e não preencheu nada)
 * são ignorados — só vira erro se preencheu PARTE de um bloco.
 */
function diasPrincipaisExtrasDoForm(formData: FormData): DiaPrincipalExtra[] {
  const entradaInicio = formData.getAll('extra_entrada_inicio') as string[]
  const entradaFim = formData.getAll('extra_entrada_fim') as string[]
  const saidaInicio = formData.getAll('extra_saida_inicio') as string[]
  const saidaFim = formData.getAll('extra_saida_fim') as string[]

  const dias: DiaPrincipalExtra[] = []
  for (let i = 0; i < entradaInicio.length; i++) {
    const linha = {
      entradaInicio: entradaInicio[i]?.trim() ?? '',
      entradaFim: entradaFim[i]?.trim() ?? '',
      saidaInicio: saidaInicio[i]?.trim() ?? '',
      saidaFim: saidaFim[i]?.trim() ?? '',
    }
    if (!linha.entradaInicio && !linha.entradaFim && !linha.saidaInicio && !linha.saidaFim) continue
    dias.push({
      entradaInicio: linha.entradaInicio,
      entradaFim: linha.entradaFim || undefined,
      saidaInicio: linha.saidaInicio,
      saidaFim: linha.saidaFim || undefined,
    })
  }
  return dias
}

/** Campos da mensagem pré-evento (confirmação de escala via WhatsApp). */
function preEventoDoForm(formData: FormData) {
  return {
    msg_pre_evento_envio: inputParaISO(formData.get('msg_pre_evento_envio') as string),
    msg_pre_evento_instrucoes: ((formData.get('msg_pre_evento_instrucoes') as string) || '').trim() || null,
  }
}

const METODOS_IDENTIFICACAO = new Set(['qr', 'biometria', 'biometria_qr'])

/**
 * "Método de identificação" (QR / Biometria / Biometria + QR) — coluna nova
 * (supabase/upgrade-biometria-facial.sql). Update à parte e tolerante, mesmo
 * padrão de `hora_aviso_dia_evento`: sem a migração, o resto do evento salva
 * normal e o método fica implicitamente 'qr' (o padrão de sempre) — o QR
 * nunca deixa de funcionar por causa de uma migração pendente.
 */
async function gravarMetodoIdentificacao(eventoId: string, formData: FormData) {
  if (!formData.has('metodo_identificacao')) return
  const metodo = (formData.get('metodo_identificacao') as string) || 'qr'
  if (!METODOS_IDENTIFICACAO.has(metodo)) return
  const { error } = await supabaseAdmin.from('eventos').update({ metodo_identificacao: metodo }).eq('id', eventoId)
  if (error) console.error('[gravarMetodoIdentificacao] não gravado (migração pendente?)', error.message)

  /*
   * Os dois JEITOS de bater por biometria (totem / autoatendimento) —
   * coluna nova (supabase/upgrade-biometria-modos.sql), tolerante do mesmo
   * jeito. Só existem os checkboxes na tela quando um modo de biometria está
   * marcado, mas um checkbox DESMARCADO não manda campo nenhum no FormData —
   * por isso lê como "false" sempre que o formulário não mandar "on",
   * nunca como "não mudar".
   */
  const { error: erroModos } = await supabaseAdmin.from('eventos').update({
    biometria_totem: formData.get('biometria_totem') === 'on',
    biometria_autoatendimento: formData.get('biometria_autoatendimento') === 'on',
  }).eq('id', eventoId)
  if (erroModos) console.error('[gravarMetodoIdentificacao] modos não gravados (migração pendente?)', erroModos.message)
}

/*
 * O TETO DE ATIVAÇÃO por setor foi removido a pedido.
 *
 * O setor tinha um limite de quantas pessoas podiam estar ativas ao mesmo
 * tempo; quem passasse disso entrava como excedente e ficava fora de tudo —
 * sem mensagem, sem ponto, sem pagamento — até alguém ativar à mão. Na
 * operação isso virava gente parada no portão porque ninguém lembrou.
 *
 * `funcionarios.ativo` continua existindo: todo cadastro nasce ativo, e
 * desativar segue servindo para o caso pontual de quem desistiu.
 */

/** Formatos aceitos pra foto de perfil de organização. */
const TIPOS_FOTO_ACEITOS = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

/**
 * Sobe a foto de perfil de uma organização pro bucket privado `presencas`
 * (prefixo `organizacoes/`) e devolve o path salvo. Retorna null se nenhum
 * arquivo foi enviado (campo de foto é opcional); lança erro se o arquivo
 * enviado não for de um formato aceito.
 */
async function subirFotoOrganizacao(orgId: string, arquivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (!TIPOS_FOTO_ACEITOS.has(arquivo.type)) {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG ou WEBP.')
  }
  const ext = arquivo.type.split('/')[1] === 'jpeg' ? 'jpg' : arquivo.type.split('/')[1]
  const path = `organizacoes/${orgId}.${ext}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const { error } = await supabaseAdmin.storage.from('presencas').upload(path, buffer, {
    contentType: arquivo.type,
    upsert: true,
  })
  if (error) throw new Error('Erro ao enviar a foto. Tente novamente.')
  return path
}

/** Traduz erros comuns do Supabase Auth para mensagens amigáveis em PT-BR. */
function mensagemAuth(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('already') && (m.includes('registered') || m.includes('exist'))) {
    return 'Este e-mail já está em uso. Use outro e-mail.'
  }
  if (m.includes('password')) return 'Senha inválida. Use ao menos 6 caracteres.'
  if (m.includes('email')) return 'E-mail inválido. Confira o endereço.'
  return 'Não foi possível criar o acesso. Confira os dados e tente de novo.'
}

// ─── Organizações (somente master) ───────────────────────────────────────────

/**
 * Cria uma organização completa: a organização em si, o usuário admin dono dela
 * e o primeiro evento. Exclusivo do master.
 */
export async function criarOrganizacao(formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil)) throw new Error('Apenas o master pode criar organizações')

  const orgNome = (formData.get('org_nome') as string).trim()
  const documento = ((formData.get('documento') as string) || '').trim() || null
  const responsavel = ((formData.get('responsavel_nome') as string) || '').trim() || null
  const limite = parseInt((formData.get('limite_eventos') as string) || '1') || 1
  const valorCobrado = parseValor(formData.get('valor_cobrado'))
  const valorCobradoPeriodo = ((formData.get('valor_cobrado_periodo') as string) || 'mensal').trim()

  const adminNome = (formData.get('admin_nome') as string).trim()
  const email = (formData.get('email') as string).trim()
  const senha = formData.get('senha') as string

  // Primeiro evento é OPCIONAL: o master pode já cadastrar, ou deixar o admin
  // criar depois (dentro do limite de licenças definido acima).
  const eventoNome = nomeEmMaiusculo((formData.get('evento_nome') as string) || '')
  const dataInicio = formData.get('data_inicio') as string
  const dataFim = formData.get('data_fim') as string
  const local = ((formData.get('local') as string) || '').trim() || null
  const criarPrimeiroEvento = !!(eventoNome && dataInicio && dataFim)

  const admin = getAdminSupabase()

  // 1) Pasta da organização no Drive (planilhas dos eventos vão pra cá)
  let driveFolderId: string | null = null
  try {
    driveFolderId = await garantirPastaCliente(orgNome)
  } catch (e) {
    console.error('Erro ao criar pasta da organização no Drive:', e)
  }

  // 2) Organização
  const { data: org, error: orgErr } = await admin.from('organizacoes').insert([{
    nome: orgNome,
    documento,
    responsavel_nome: responsavel,
    limite_eventos: limite,
    valor_cobrado: valorCobrado,
    valor_cobrado_periodo: valorCobradoPeriodo,
    drive_folder_id: driveFolderId,
  }]).select('id').single()
  if (orgErr) throw new Error(mensagemAmigavel(orgErr))

  // 2.1) Foto de perfil (opcional) — só depois de ter o id da organização
  try {
    const fotoPath = await subirFotoOrganizacao(org.id, formData.get('foto'))
    if (fotoPath) await admin.from('organizacoes').update({ foto_perfil_path: fotoPath }).eq('id', org.id)
  } catch (e) {
    console.error('Erro ao enviar foto da organização:', e)
  }

  // 3) Usuário admin dono da organização
  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (userErr) {
    // desfaz a organização para não deixar lixo caso o e-mail já exista
    await admin.from('organizacoes').delete().eq('id', org.id)
    throw new Error(mensagemAuth(userErr.message))
  }

  // Mesmo cuidado do supervisor: sem checar o erro, o usuário do Auth ficava
  // órfão e o e-mail do cliente ficava queimado para sempre.
  const { error: erroPerfilAdmin } = await admin.from('perfis').insert([{
    id: user.user!.id,
    nome: adminNome,
    email,
    role: 'admin',
    organizacao_id: org.id,
  }])
  if (erroPerfilAdmin) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    await admin.from('organizacoes').delete().eq('id', org.id)
    console.error('[criarOrganizacao] falha ao inserir perfil do admin', erroPerfilAdmin)
    throw new Error(mensagemAmigavel(erroPerfilAdmin))
  }

  // 4) Primeiro evento da organização (apenas se o master preencheu os dados)
  if (criarPrimeiroEvento) {
    const { data: evento } = await admin.from('eventos').insert([{
      nome: eventoNome,
      data_inicio: inputParaISO(dataInicio),
      data_fim: inputParaISO(dataFim),
      local,
      organizacao_id: org.id,
      cliente_id: user.user!.id,
    }]).select('id').single()

    // 5) Planilha do evento na pasta da organização
    if (evento) {
      try {
        const spreadsheetId = await criarPlanilhaEvento(eventoNome, driveFolderId)
        await admin.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', evento.id)
      } catch (e) {
        console.error('Erro ao criar planilha do primeiro evento:', e)
      }
    }
  }

  auditar(perfil, 'ORGANIZACAO_CRIADA', {
    campoAlterado: 'Organização', organizacaoId: org.id,
    valorNovo: curto(`${orgNome} — administrador ${adminNome} (${email})${criarPrimeiroEvento ? ` · primeiro evento ${eventoNome}` : ''}`),
  })
  revalidatePath('/admin/organizacoes')
  redirect('/admin/organizacoes')
}

export async function toggleAtivoOrganizacao(id: string, ativo: boolean) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil)) throw new Error('Sem permissão')
  const admin = getAdminSupabase()
  const { data: org } = await admin.from('organizacoes').select('nome').eq('id', id).maybeSingle()
  await admin.from('organizacoes').update({ ativo: !ativo }).eq('id', id)
  auditar(perfil, 'ORGANIZACAO_SITUACAO', {
    campoAlterado: `Organização ${org?.nome ?? ''}`.trim(), organizacaoId: id,
    valorAnterior: ativo ? 'Ativa' : 'Suspensa', valorNovo: ativo ? 'Suspensa' : 'Ativa',
  })
  revalidatePath('/admin/organizacoes')
}

export async function editarOrganizacao(id: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil)) throw new Error('Sem permissão')
  const admin = getAdminSupabase()
  const limite = parseInt((formData.get('limite_eventos') as string) || '1') || 1
  const valorCobrado = parseValor(formData.get('valor_cobrado'))
  const valorCobradoPeriodo = ((formData.get('valor_cobrado_periodo') as string) || 'mensal').trim()

  const dados: Record<string, unknown> = {
    nome: (formData.get('org_nome') as string).trim(),
    documento: ((formData.get('documento') as string) || '').trim() || null,
    responsavel_nome: ((formData.get('responsavel_nome') as string) || '').trim() || null,
    limite_eventos: limite,
    valor_cobrado: valorCobrado,
    valor_cobrado_periodo: valorCobradoPeriodo,
  }

  // Remover foto tem prioridade sobre enviar uma nova (o usuário não faz as
  // duas coisas ao mesmo tempo — a UI só mostra um dos dois controles).
  if (formData.get('remover_foto') === 'true') {
    const { data: atual } = await admin.from('organizacoes').select('foto_perfil_path').eq('id', id).single()
    if (atual?.foto_perfil_path) await admin.storage.from('presencas').remove([atual.foto_perfil_path])
    dados.foto_perfil_path = null
  } else {
    try {
      const fotoPath = await subirFotoOrganizacao(id, formData.get('foto'))
      if (fotoPath) dados.foto_perfil_path = fotoPath
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Erro ao enviar a foto.')
    }
  }

  const { data: antes } = await admin.from('organizacoes').select('nome, limite_eventos, valor_cobrado, valor_cobrado_periodo').eq('id', id).maybeSingle()
  await admin.from('organizacoes').update(dados).eq('id', id)
  auditar(perfil, 'ORGANIZACAO_EDITADA', {
    campoAlterado: 'Organização', organizacaoId: id,
    valorAnterior: antes ? curto(`${antes.nome} · limite ${antes.limite_eventos} eventos · R$ ${antes.valor_cobrado ?? '—'} ${antes.valor_cobrado_periodo ?? ''}`) : null,
    valorNovo: curto(`${dados.nome} · limite ${limite} eventos · R$ ${valorCobrado ?? '—'} ${valorCobradoPeriodo}`),
  })
  revalidatePath('/admin/organizacoes')
}

export async function deletarOrganizacao(id: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil)) throw new Error('Sem permissão')
  const admin = getAdminSupabase()
  // remove os logins de auth dos membros antes do cascade das tabelas
  const { data: org } = await admin.from('organizacoes').select('nome').eq('id', id).maybeSingle()
  const { data: membros } = await admin.from('perfis').select('id').eq('organizacao_id', id)
  for (const m of membros ?? []) {
    try { await admin.auth.admin.deleteUser(m.id) } catch (e) { console.error('Erro ao remover login:', e) }
  }
  await admin.from('organizacoes').delete().eq('id', id) // cascade: perfis + eventos
  // Sem organizacaoId: a organização acabou de deixar de existir (a linha fica para o master).
  auditar(perfil, 'ORGANIZACAO_EXCLUIDA', { campoAlterado: 'Organização', valorAnterior: org?.nome ?? id })
  revalidatePath('/admin/organizacoes')
}

// ─── Supervisores (equipe vinculada a um setor/fornecedor) ────────────────────

/**
 * Cria um supervisor vinculado a EXATAMENTE UM setor (fornecedor). Ele só
 * enxerga/gerencia a equipe e o scanner daquele setor. Apenas admin/gerente
 * da organização (ou master) pode criar.
 */
/**
 * Registra que este supervisor pode acessar este setor.
 *
 * Falha em silêncio de propósito: antes de a migração
 * supabase/upgrade-supervisor-multi-setor.sql rodar, a tabela não existe — e
 * derrubar a criação do supervisor por causa disso trocaria um recurso novo
 * por um cadastro que não acontece. Sem a tabela, o comportamento é o antigo
 * (um setor por login), que continua correto.
 */
/**
 * Como os setores da pessoa aparecem na mensagem de WhatsApp.
 *
 * Um setor: o nome dele. Dois: os dois, separados por "e". Mais que isso:
 * "vários setores" — listar seis nomes num template deixa a frase ilegível no
 * celular, e o supervisor vê a lista completa ao entrar no sistema.
 *
 * Existe porque o texto aprovado na Meta tem "do setor {{2}}" fixo: não dá
 * para tirar a palavra "setor" da frase, só para escolher bem o que entra no
 * lugar dela. Antes ia sempre o setor recém-atribuído sozinho, o que fazia a
 * mensagem parecer que os outros tinham sido perdidos.
 */
async function nomeDosSetores(perfilId: string, fornecedorIdNovo: string): Promise<string> {
  const { data: vinculos } = await supabaseAdmin
    .from('supervisor_setores').select('fornecedor_id').eq('perfil_id', perfilId)

  const ids = new Set<string>([fornecedorIdNovo])
  for (const v of vinculos ?? []) ids.add(v.fornecedor_id as string)

  const { data: setores } = await supabaseAdmin
    .from('fornecedores').select('nome').in('id', [...ids]).order('nome')
  const nomes = (setores ?? []).map(f => (f.nome as string).trim()).filter(Boolean)

  if (nomes.length <= 1) return nomes[0] ?? 'seu fornecedor'
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`
  return 'vários fornecedores'
}

/** Esta pessoa cobre algum setor de um evento desta organização? */
async function supervisionaSetorDaOrganizacao(perfilId: string, organizacaoId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('supervisor_setores')
    .select('fornecedor_id, fornecedores!inner(eventos!inner(organizacao_id))')
    .eq('perfil_id', perfilId)
    .eq('fornecedores.eventos.organizacao_id', organizacaoId)
    .limit(1)
  return !!data?.length
}

/** Mesmo texto nos dois sentidos da regra — ver `vincularSupervisorAoSetor`. */
async function vincularSupervisorAoSetor(perfilId: string, fornecedorId: string) {
  /*
   * REGRA (Juan, 06/10/2026): supervisor não pode ser Gestor de credenciamento
   * (`operador_portao`). Fica AQUI, e não em cada tela, porque todo vínculo
   * de supervisor passa por esta função — criar fornecedor, criar supervisor,
   * importação de estrutura e IA. Antes a regra era a oposta ("ganha o setor
   * sem perder o acesso que já tem"), e assim nasceram os casos duplos.
   */
  /*
   * NOVA REGRA (Juan, 07/10/2026): o CPF PODE ter mais de uma função — Gestor de
   * credenciamento, Encarregado e supervisor se combinam. Quem tem outra função de
   * base GANHA a de supervisor como função EXTRA e passa a trocar de perfil pela
   * foto do usuário. Só as identidades próprias (master, suporte, produtor) não se
   * misturam. (Antes: "supervisor não pode ser Gestor de credenciamento".)
   */
  /*
   * MASTER também supervisiona (08/10/2026, Gabriel Valiati no VITAL): ele já enxerga e faz tudo, então não precisa
   * — e não pode — ganhar a FUNÇÃO de supervisor (master é identidade própria, não troca de perfil). Recebe só o
   * vínculo com o setor e o crachá, que é o que faz ele aparecer como supervisor da equipe e entrar com QR.
   * Antes, o vínculo era recusado com "identidade própria" e o setor ficava sem o supervisor certo.
   */
  const { data: alvo } = await supabaseAdmin.from('perfis').select('role').eq('id', perfilId).maybeSingle()
  if (alvo && alvo.role !== 'supervisor' && alvo.role !== 'master') {
    const { data: forn } = await supabaseAdmin.from('fornecedores').select('eventos(organizacao_id)').eq('id', fornecedorId).maybeSingle()
    const orgDoSetor = (forn?.eventos as unknown as { organizacao_id?: string | null } | null)?.organizacao_id ?? null
    const funcao = await garantirFuncaoExtra(perfilId, 'supervisor', orgDoSetor)
    if (!funcao.ok) throw new Error(funcao.erro)
  }

  const { error } = await supabaseAdmin
    .from('supervisor_setores')
    .upsert([{ perfil_id: perfilId, fornecedor_id: fornecedorId }], { onConflict: 'perfil_id,fornecedor_id' })
  if (error) console.error('[supervisor_setores] vínculo não gravado (migração pendente?)', error.message)
  // O supervisor também é funcionário ativo do setor: QR + lista da equipe.
  await garantirCrachaDoSupervisorNoSetor(perfilId, fornecedorId)
}

/**
 * Esta pessoa JÁ RECEBEU o aviso de escala deste evento?
 *
 * Serve para não repetir o WhatsApp. Escalar a mesma pessoa em três setores
 * do mesmo evento disparava três vezes as DUAS mensagens (aviso de escala +
 * link de senha) — seis mensagens cobradas para dizer a mesma coisa a quem
 * já sabia. Aconteceu de verdade com a Fernanda, em três setores do Bar.
 *
 * O corte é POR EVENTO, não por pessoa: ser escalada num evento novo é
 * notícia e merece aviso; ganhar mais um setor no mesmo evento não é — ela
 * troca de setor dentro do próprio acesso (ver `trocarSetorAtivo` e o menu
 * "Meus setores").
 *
 * Olha a MENSAGEM na fila, não o vínculo com o setor. Era o vínculo, e isso
 * deixou o Erivelton sem link nenhum (24/09/2026): uma tentativa falhou no
 * meio depois de gravar o vínculo e antes de agendar a mensagem, e a
 * tentativa seguinte achou "já é deste evento" e pulou o aviso. Mensagem
 * cancelada ou falhada não conta — aí ninguém foi avisado de verdade.
 *
 * Erro de consulta devolve `false` — ou seja, avisa. Na dúvida, a mensagem a
 * mais incomoda; a de menos deixa alguém sem saber que foi escalado.
 */
async function jaFoiAvisadoNesteEvento(telefone: string | (string | null | undefined)[], eventoId: string): Promise<boolean> {
  /*
   * Aceita mais de um número: o digitado agora e o que já está no cadastro da pessoa. Se o
   * supervisor foi avisado num número e agora é ligado a outro setor com o telefone escrito
   * diferente (ou o da lista de funcionários), a checagem só pelo número digitado não o achava
   * e mandava a mensagem de novo — o aviso repetido que o Juan quer evitar (07/10/2026).
   *
   * Qualquer uma das duas conta: supervisor novo recebe só o link de senha, quem já tinha conta
   * recebe o aviso de escala. A consulta mora em lib/internos-servidor.ts (o Encarregado usa a mesma).
   */
  return jaRecebeuMensagemNoEvento(telefone, eventoId, ['supervisor_escalado_evento', 'cadastro_supervisor_cpf_link'])
}

/**
 * O CPF já tem outro tipo de acesso, antes de a pessoa preencher o resto?
 *
 * "Tornar supervisor" descobria isso só depois do telefone preenchido e do
 * "Confirmar" clicado — a pessoa perdia esses passos pra ler um erro que já
 * era sabido antes de começar. Aconteceu de verdade: uma operadora de portão
 * (Keyci) recebeu esse erro depois de preencher tudo, quando o CPF dela já
 * era conhecido desde o primeiro clique.
 *
 * Mesma permissão de `criarSupervisor`, porque é a mesma decisão — só que
 * checada mais cedo.
 */
export async function situacaoDoAcesso(cpf: string): Promise<{ role: string | null; nomePapel: string | null }> {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para consultar acessos')

  const digitos = normalizarCpf(cpf)
  if (digitos.length !== 11) return { role: null, nomePapel: null }

  const { data } = await supabaseAdmin.from('perfis').select('role').eq('cpf', digitos).maybeSingle()
  const role = (data?.role as Role | undefined) ?? null
  return { role, nomePapel: role ? (ROLE_LABELS[role] ?? role) : null }
}

/*
 * Admin/master sempre; suporte também, dentro do escopo — sem risco de
 * escalar privilégio, porque esta função só cria/reatribui `role:'supervisor'`,
 * nunca admin/master, em qualquer um dos dois branches abaixo (novo ou já
 * existente).
 */
export async function criarSupervisor(fornecedorId: string, eventoId: string, formData: FormData) {
  try {
    return await criarSupervisorOuLanca(fornecedorId, eventoId, formData)
  } catch (e) {
    // Nunca deixa escapar cru: em produção o Next mascara a mensagem de toda
    // exceção que sai de uma Server Action (RSC error masking), e quem
    // chama via formulário via um "página desatualizada" genérico em vez do
    // motivo de verdade ("CPF já pertence a outro tipo de acesso", etc.) —
    // foi o que aconteceu de verdade em produção em 24/09/2026. Os `throw`
    // internos continuam existindo (é o jeito mais curto de sair cedo no
    // meio da função), só não atravessam mais o limite da action.
    return { error: mensagemAmigavel(e) }
  }
}

/** O usuário do Auth com este e-mail (o do CPF), se existir — só no caminho de erro, então a listagem é aceitável. */
async function acharUsuarioAuthPorEmail(admin: ReturnType<typeof getAdminSupabase>, email: string) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) return null
    const achado = data.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (achado) return achado
    if (data.users.length < 1000) return null
  }
  return null
}

/** `jaAutorizado`: quem chama já conferiu a permissão (a Função da ficha da equipe, que também aceita o supervisor do setor). */
async function criarSupervisorOuLanca(fornecedorId: string, eventoId: string, formData: FormData, jaAutorizado?: PerfilDaSessao) {
  const perfil = jaAutorizado ?? await getPerfil()
  if (!perfil) throw new Error('Sem permissão para criar supervisores')

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome, token_formulario, eventos(organizacao_id, nome, data_inicio, local)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) throw new Error('Fornecedor não encontrado')
  if (fornecedor.evento_id !== eventoId) throw new Error('Este fornecedor não pertence ao evento informado')
  const eventoDoFornecedor = fornecedor.eventos as any
  const organizacaoId = eventoDoFornecedor?.organizacao_id

  if (jaAutorizado) {
    // Conferido por quem chamou — ver `definirFuncaoNaEquipe`.
  } else if (podeGerenciarUsuarios(perfil)) {
    if (!ehMaster(perfil.role) && organizacaoId !== perfil.organizacao_id) {
      throw new Error('Sem permissão sobre este fornecedor')
    }
  } else if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
      throw new Error('Este evento não está no seu escopo de atendimento.')
    }
  } else {
    throw new Error('Sem permissão para criar supervisores')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  if (!nome) throw new Error('Informe o nome do supervisor.')
  if (telefone.length < 10 || telefone.length > 13) {
    throw new Error('Informe um telefone válido para enviar o acesso pelo WhatsApp.')
  }

  /*
   * Supervisor entra por CPF.
   *
   * Já foi e-mail (o organizador inventava um endereço) e já foi nome de
   * usuário (que ele precisava lembrar ter criado). O CPF resolve os dois: a
   * pessoa sabe o dela de cor e ninguém inventa nada. Por baixo, vira um
   * endereço num domínio interno que ninguém possui e que nunca recebe nada.
   */
  const cpf = normalizarCpf((formData.get('cpf') as string) ?? '')
  if (cpf.length !== 11) throw new Error('Informe o CPF do supervisor, com 11 dígitos.')
  const email = cpfParaEmail(cpf)

  /*
   * Trava de cadastro (09/10/2026): supervisor que ainda NÃO está no evento seria uma pessoa nova entrando no setor
   * (ganha crachá) — com o cadastro travado, não entra. Quem já está no evento (a Função da ficha da equipe, por
   * exemplo) passa: não é cadastro novo.
   */
  const { data: fichaNoEvento } = await supabaseAdmin
    .from('funcionarios').select('id, fornecedores!inner(evento_id)').eq('cpf', cpf).eq('fornecedores.evento_id', eventoId).limit(1)
  if (!fichaNoEvento?.length) {
    const travado = await motivoCadastroTravado(eventoId, { fornecedorId })
    if (travado) throw new Error(travado)
  }

  const admin = getAdminSupabase()

  /*
   * CPF identifica a pessoa; os setores dela SOMAM, não se substituem.
   *
   * Antes o segundo setor era uma REALOCAÇÃO: cadastrar a mesma pessoa no
   * setor B a tirava do setor A, sem avisar ninguém. Quem cobre dois setores
   * (comum em evento grande) ficava sem acesso a um deles, e a única saída
   * seria um segundo login — que não existe, porque a pessoa tem um CPF só.
   *
   * Agora o vínculo novo entra em `supervisor_setores` e o setor recém-criado
   * vira o ativo. Ver supabase/upgrade-supervisor-multi-setor.sql.
   */
  const { data: existente } = await admin
    .from('perfis')
    .select('id, nome, role, organizacao_id, ativo, telefone')
    .eq('cpf', cpf)
    .maybeSingle()
  if (existente) {
    /*
     * CPF que já é OUTRO tipo de acesso (master, admin, suporte...) não
     * bloqueia — regra do Juan (24/09/2026): a mesma pessoa pode
     * supervisionar um setor sem perder o acesso que já tem. EXCETO Gestor de
     * credenciamento (operador de portão): desde 06/10/2026 supervisor não
     * pode ser gestor, e `vincularSupervisorAoSetor` recusa. Ganha só
     * o vínculo com o setor; a conta dela (papel, organização, e-mail,
     * senha, nome) não é tocada — ela entra com o login que já usa.
     */
    if (existente.role !== 'supervisor') {
      const jaAvisado = await jaFoiAvisadoNesteEvento([telefone, existente.telefone as string | null], eventoId)
      await vincularSupervisorAoSetor(existente.id, fornecedorId)
      after(() => registrarAuditoria({
        perfil, acao: 'ALTERACAO_SUPERVISOR',
        campoAlterado: `Supervisor do fornecedor ${fornecedor.nome}`,
        valorNovo: `${existente.nome} — CPF ${formatCpf(cpf)} (já tinha outro acesso, ganhou este fornecedor)`,
        eventoId, organizacaoId: organizacaoId ?? undefined,
      }))
      /*
       * Ninguém fica sem aviso — regra do Juan: supervisor sem o link do
       * formulário da equipe trava a operação inteira do setor. Só o aviso
       * de escala (que leva o link); o de senha não, porque ela já tem
       * login e trocaria a senha de uma conta que não é de supervisor.
       */
      if (!jaAvisado) {
        const setoresNaMensagem = await nomeDosSetores(existente.id, fornecedorId)
        const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app').replace(/\/$/, '')
        await agendarTemplateSupervisor({
          eventoId,
          telefone,
          template: 'supervisor_escalado_evento',
          parametros: [
            nome,
            eventoDoFornecedor?.nome ?? 'Evento',
            setoresNaMensagem,
            eventoDoFornecedor?.data_inicio ? formatarBR(eventoDoFornecedor.data_inicio, 'completo') : 'a confirmar',
            eventoDoFornecedor?.local?.trim() || 'a confirmar',
            `${site}/login`,
            `${site}/form/${fornecedor.token_formulario}`,
          ],
        })
      }
      revalidatePath('/admin/usuarios')
      revalidatePath(`/admin/eventos/${eventoId}`)
      return { ok: true as const, novo: false as const, usuario: cpf, avisado: !jaAvisado }
    }

    /*
     * Supervisor de OUTRA organização também não bloqueia: a mesma pessoa
     * trabalha em eventos de organizações diferentes, inclusive ao mesmo
     * tempo. O acesso de supervisor é por SETOR (`supervisor_setores` + o
     * seletor "Meus setores"), então somar o setor novo não tira os que ela
     * já tinha. E a organização da conta NÃO é trocada — trocar tirava da
     * organização anterior o poder de editar essa pessoa.
     */
    const { error: erroAtualizacao } = await admin.from('perfis').update({
      nome,
      telefone,
      ativo,
      organizacao_id: existente.organizacao_id ?? organizacaoId,
      fornecedor_id: fornecedorId,
    }).eq('id', existente.id)
    if (erroAtualizacao) throw new Error(mensagemAmigavel(erroAtualizacao))

    // Pela MENSAGEM de fato agendada/enviada, não pelo vínculo — ver o
    // comentário de `jaFoiAvisadoNesteEvento` (caso do Erivelton).
    const jaEraDesteEvento = await jaFoiAvisadoNesteEvento([telefone, existente.telefone as string | null], eventoId)

    await vincularSupervisorAoSetor(existente.id, fornecedorId)
    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_SUPERVISOR',
      campoAlterado: `Supervisor do fornecedor ${fornecedor.nome}`,
      valorNovo: `${nome} — CPF ${formatCpf(cpf)} (já era supervisor, ganhou mais este fornecedor)`,
      eventoId, organizacaoId: organizacaoId ?? undefined,
    }))

    /*
     * Ganhar mais um setor no MESMO evento não gera mensagem.
     *
     * São duas mensagens cobradas por atribuição (aviso de escala + link de
     * senha). Escalar alguém em três setores do Bar mandava seis mensagens
     * para dizer a mesma coisa a quem já sabia — aconteceu com a Fernanda.
     * Ela troca de setor dentro do próprio acesso, em "Meus setores".
     *
     * Evento NOVO continua avisando: aí é notícia de verdade.
     */
    if (jaEraDesteEvento) {
      revalidatePath('/admin/usuarios')
      revalidatePath(`/admin/eventos/${eventoId}`)
      return { ok: true as const, novo: false as const, usuario: cpf, avisado: false as const }
    }

    // Todos os setores dela, não só o recém-atribuído — ver `nomeDosSetores`.
    const setoresNaMensagem = await nomeDosSetores(existente.id, fornecedorId)

    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app').replace(/\/$/, '')
    await agendarTemplateSupervisor({
      eventoId,
      telefone,
      template: 'supervisor_escalado_evento',
      parametros: [
        nome,
        eventoDoFornecedor?.nome ?? 'Evento',
        setoresNaMensagem,
        eventoDoFornecedor?.data_inicio ? formatarBR(eventoDoFornecedor.data_inicio, 'completo') : 'a confirmar',
        eventoDoFornecedor?.local?.trim() || 'a confirmar',
        `${site}/login`,
        `${site}/form/${fornecedor.token_formulario}`,
      ],
    })

    /*
     * Um segundo aviso, com um link para (re)criar a senha.
     *
     * A mensagem acima manda "faça login" partindo do princípio de que a
     * pessoa já sabe a senha — mas ela pode nunca ter chegado a criar uma
     * (convite antigo expirado, conta de teste, escalada de outro evento
     * há meses), e "faça login" não leva a lugar nenhum. Foi exatamente
     * isso que aconteceu: reassinalar um CPF que já existia como supervisor
     * mandava só o aviso, sem nenhum caminho de entrada.
     *
     * O link é de uso único e não força ninguém a trocar senha: quem já
     * sabe a sua simplesmente ignora esta segunda mensagem.
     */
    try {
      const linkSenha = await criarConviteSenhaSupervisor({
        perfilId: existente.id,
        nome,
        cpf,
        eventoId,
        evento: eventoDoFornecedor?.nome ?? 'Evento',
        setor: setoresNaMensagem,
      })
      await agendarTemplateSupervisor({
        eventoId,
        telefone,
        template: 'cadastro_supervisor_cpf_link',
        parametros: [
          nome,
          setoresNaMensagem,
          eventoDoFornecedor?.nome ?? 'Evento',
          formatarCpfExibicao(cpf),
          linkSenha,
        ],
      })
    } catch (erroConvite) {
      // A realocação já foi salva e avisada; não travar por causa do link extra.
      console.error('[criarSupervisor] falha ao enviar link de senha na realocação', {
        fornecedorId, eventoId, erro: erroConvite,
      })
    }

    revalidatePath('/admin/usuarios')
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true as const, novo: false as const, usuario: cpf, avisado: true as const }
  }

  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    // A senha inicial nunca é mostrada nem enviada. Ela só mantém a conta
    // inacessível até o próprio supervisor usar o convite individual.
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
  })
  if (error) {
    // O Auth fala em "e-mail"; aqui quem existe é o nome de usuário.
    const jaExiste = /already|exist|registered/i.test(error.message)
    if (jaExiste) {
      /*
       * O LOGIN deste CPF existe, mas nenhum perfil tem este CPF — achado
       * importando a estrutura do Vital (06/10/2026): a conta da Rosane foi
       * criada com o CPF certo e, depois, alguém gravou um CPF digitado errado
       * no perfil (antes de o sistema validar o dígito). A busca por CPF não
       * a achava, e o login "já existia".
       *
       * O login nasce do CPF, então o perfil que tem o MESMO id é a mesma
       * pessoa. Quando o CPF do perfil é vazio ou INVÁLIDO, o do login é o
       * certo: acerta e segue como supervisor já existente. CPF válido e
       * diferente não se mexe — pode ser outra pessoa, e quem decide é o
       * administrador (a mensagem diz os dois CPFs).
       */
      const dono = await acharUsuarioAuthPorEmail(admin, email)
      if (dono) {
        const { data: perfilDoLogin } = await admin
          .from('perfis').select('id, nome, role, cpf').eq('id', dono.id).maybeSingle()
        if (perfilDoLogin?.role === 'supervisor') {
          const cpfDoPerfil = (perfilDoLogin.cpf as string | null) ?? ''
          if (!cpfDoPerfil || !validarCpf(cpfDoPerfil)) {
            const { error: erroCpf } = await admin.from('perfis').update({ cpf }).eq('id', perfilDoLogin.id)
            if (!erroCpf) {
              after(() => registrarAuditoria({
                perfil, acao: 'ALTERACAO_SUPERVISOR',
                campoAlterado: `CPF do supervisor ${perfilDoLogin.nome}`,
                valorAnterior: cpfDoPerfil ? formatCpf(cpfDoPerfil) : 'sem CPF',
                valorNovo: `${formatCpf(cpf)} (o do login dela — o anterior era inválido)`,
                eventoId, organizacaoId: organizacaoId ?? undefined,
              }))
              // Agora a busca por CPF a acha: segue pelo ramo de supervisor existente.
              return criarSupervisorOuLanca(fornecedorId, eventoId, formData)
            }
          } else {
            throw new Error(`O login do CPF ${formatCpf(cpf)} pertence a ${perfilDoLogin.nome}, que no cadastro tem outro CPF (${formatCpf(cpfDoPerfil)}). Confira qual está certo em Usuários antes de continuar.`)
          }
        }
      }
      throw new Error(`Já existe um acesso com o CPF ${formatCpf(cpf)}, mas não consegui ligá-lo a um supervisor. Fale com o suporte.`)
    }
    throw new Error(mensagemAuth(error.message))
  }

  /*
   * O perfil PRECISA entrar, e o erro precisa ser lido.
   *
   * Antes o insert era disparado sem checar `error`: quando ele falhava, o
   * usuário do Auth já existia e ficava órfão — conta sem perfil, invisível no
   * sistema e impossível de recriar, porque o e-mail passava a acusar "já
   * cadastrado". Havia 9 contas nesse estado quando isto foi descoberto.
   *
   * Falhando, desfazemos a criação no Auth. Sem esse rollback, uma tentativa
   * malsucedida queima o endereço de e-mail da pessoa para sempre.
   */
  const { error: erroPerfil } = await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    telefone,
    ativo,
    // O CPF fica no perfil, e não só escondido dentro do e-mail interno: é
    // por ele que a tela de acessos mostra quem é quem, e é o que a pessoa
    // digita para entrar.
    cpf,
    role: 'supervisor',
    organizacao_id: organizacaoId,
    fornecedor_id: fornecedorId,
    permissoes_usuario: permissoesUsuarioDoForm(formData, 'supervisor'),
    email_contato: ((formData.get('email_contato') as string) || '').trim().toLowerCase() || null,
  }])

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    console.error('[criarSupervisor] falha ao inserir perfil', {
      fornecedorId, eventoId, organizacaoId, erro: erroPerfil,
    })
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  await vincularSupervisorAoSetor(user.user!.id, fornecedorId)
  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Supervisor do fornecedor ${fornecedor.nome}`,
    valorNovo: `${nome} — CPF ${formatCpf(cpf)} (acesso novo)`,
    eventoId, organizacaoId: organizacaoId ?? undefined,
  }))

  try {
    const linkSenha = await criarConviteSenhaSupervisor({
      cpf,
      perfilId: user.user!.id,
      nome,
      eventoId,
      evento: eventoDoFornecedor?.nome ?? 'Evento',
      setor: fornecedor.nome,
    })
    await agendarTemplateSupervisor({
      eventoId,
      telefone,
      template: 'cadastro_supervisor_cpf_link',
      /*
       * Ordem do texto aprovado na Meta:
       *   {{1}} nome · {{2}} setor · {{3}} evento · {{4}} CPF · {{5}} link
       *
       * O CPF entra porque é o LOGIN da pessoa, e sem ele a mensagem mandava
       * criar a senha sem dizer o que digitar no primeiro campo depois.
       */
      parametros: [
        nome,
        fornecedor.nome,
        eventoDoFornecedor?.nome ?? 'Evento',
        formatarCpfExibicao(cpf),
        linkSenha,
      ],
    })
  } catch (erro) {
    // Cadastro sem convite deixaria uma conta inacessível. Desfazemos tudo
    // para o responsável poder corrigir o WhatsApp e tentar novamente.
    await admin.from('perfis').delete().eq('id', user.user!.id)
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    throw erro
  }

  revalidatePath('/admin/usuarios')
  revalidatePath(`/admin/eventos/${eventoId}`)

  return {
    ok: true as const,
    novo: true as const,
    usuario: cpf,
  }
}

/**
 * Cria (ou realoca) um Operador de Portão: lê QR e registra ponto manual,
 * mas nunca gerencia evento, equipe ou usuários — ver `podeEscanear` e
 * `podeGerenciarEventos` em `lib/permissions.ts`.
 *
 * Mesmo mecanismo de login do supervisor (CPF, convite de senha de uso
 * único, WhatsApp automático), com uma diferença:
 *
 *   • sem `fornecedor_id` — o operador não é de UM setor, é do PORTÃO do
 *     evento inteiro. Por isso o escopo dele acaba sendo a ORGANIZAÇÃO
 *     inteira (mesma regra que já vale pra admin/cliente em
 *     `eventosEscaneaveis`/`podeEscanearEvento`, ver lib/supabase-server.ts),
 *     não só este evento — não existe hoje um jeito de prender um perfil a
 *     um evento específico sem prendê-lo a um setor.
 *
 * O WhatsApp reaproveita o template `cadastro_supervisor_cpf_link` — não
 * existe um modelo próprio pro operador aprovado na Meta, e submeter um
 * novo não sai a tempo. O texto fixo do lado da Meta diz "supervisor" mesmo
 * sendo operador; decisão explícita do Juan, ciente da limitação. O link
 * também volta na resposta desta action, pra tela mostrar como reforço.
 */
export async function criarOperadorPortaria(eventoId: string, formData: FormData) {
  try {
    return await criarOperadorPortariaOuLanca(eventoId, formData)
  } catch (e) {
    // Mesmo cuidado de criarSupervisor: em produção o Next mascara a mensagem
    // de toda exceção que sai de uma Server Action, e quem chama via
    // formulário via um "página desatualizada" genérico em vez do motivo de
    // verdade — foi exatamente o que aconteceu criando a operadora Lais
    // (02/10/2026): o erro de verdade (provavelmente CPF já cadastrado, ou
    // outro motivo de validação) nunca chegava na tela.
    return { error: mensagemAmigavel(e) }
  }
}

async function criarOperadorPortariaOuLanca(eventoId: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para criar operadores de portão')

  const { data: evento } = await supabaseAdmin
    .from('eventos')
    .select('id, organizacao_id, nome')
    .eq('id', eventoId)
    .single()
  if (!evento) throw new Error('Evento não encontrado')
  const organizacaoId = evento.organizacao_id
  if (!ehMaster(perfil!.role) && organizacaoId !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este evento')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  if (!nome) throw new Error('Informe o nome do operador.')
  if (telefone.length < 10 || telefone.length > 13) {
    throw new Error('Informe um telefone válido — é por ele que você vai repassar o acesso.')
  }

  const cpf = normalizarCpf((formData.get('cpf') as string) ?? '')
  if (cpf.length !== 11) throw new Error('Informe o CPF do operador, com 11 dígitos.')
  const email = cpfParaEmail(cpf)

  const admin = getAdminSupabase()

  const { data: existente } = await admin
    .from('perfis')
    .select('id, nome, role, organizacao_id')
    .eq('cpf', cpf)
    .maybeSingle()
  if (existente) {
    if (existente.role !== 'operador_portao') {
      /*
       * IDENTIDADE PRÓPRIA (master, suporte, produtor) NÃO RECEBE FUNÇÃO EXTRA — mas já pode escanear mesmo assim
       * (achado ao vivo, 08/10/2026, Gabriel Valiati: master já está em `podeEscanear` direto, então criar o
       * operador aqui não muda NADA que ele já não tenha — e tentar dar a função travava com "identidade própria").
       * Mesmo espírito da correção em `vincularSupervisorAoSetor`: pula a função, só avisa.
       */
      if (!podeReceberFuncaoExtra(existente.role)) {
        after(() => registrarAuditoria({
          perfil: perfil!, acao: 'ALTERACAO_OPERADOR',
          campoAlterado: `Operador de portão — ${evento.nome}`,
          valorNovo: `${existente.nome} — CPF ${formatCpf(cpf)} (identidade própria — já escaneia, sem precisar da função)`,
          eventoId, organizacaoId: organizacaoId ?? undefined,
        }))
      } else {
        /*
         * Quem já tem OUTRA função (supervisor, Encarregado, administrador…) ganha a de
         * Gestor de credenciamento como função EXTRA e troca de perfil pela foto do
         * usuário (regra de 07/10/2026). A conta dele NÃO é tocada — nome, organização,
         * senha e função de base continuam; só entra a função a mais.
         */
        const funcao = await garantirFuncaoExtra(existente.id, 'operador_portao', organizacaoId)
        if (!funcao.ok) throw new Error(funcao.erro)
        after(() => registrarAuditoria({
          perfil: perfil!, acao: 'ALTERACAO_OPERADOR',
          campoAlterado: `Operador de portão — ${evento.nome}`,
          valorNovo: `${existente.nome} — CPF ${formatCpf(cpf)} (já tinha outro acesso, ganhou a função de operador)`,
          eventoId, organizacaoId: organizacaoId ?? undefined,
        }))
      }
    } else if (existente.organizacao_id && existente.organizacao_id !== organizacaoId) {
      /*
       * JÁ É OPERADOR, MAS DE OUTRA ORGANIZAÇÃO (Juan, 09/10/2026 — Livia, VITAL): a mesma pessoa trabalha em eventos
       * de organizações diferentes. Antes recusava ("Este CPF já está cadastrado em outra organização") — e, pro
       * master, MOVIA a conta de organização, tirando a pessoa da primeira. Agora a conta não é tocada: ela ganha o
       * operador desta organização como função extra e troca de uma pra outra pela foto do usuário.
       */
      const funcao = await garantirFuncaoExtra(existente.id, 'operador_portao', organizacaoId)
      if (!funcao.ok) throw new Error(funcao.erro)
      after(() => registrarAuditoria({
        perfil: perfil!, acao: 'ALTERACAO_OPERADOR',
        campoAlterado: `Operador de portão — ${evento.nome}`,
        valorNovo: `${existente.nome} — CPF ${formatCpf(cpf)} (já era operador de outra organização, ganhou esta também)`,
        eventoId, organizacaoId: organizacaoId ?? undefined,
      }))
    } else {
      const { error: erroAtualizacao } = await admin.from('perfis').update({
        nome, telefone, ativo, organizacao_id: organizacaoId,
        permissoes_usuario: permissoesUsuarioDoForm(formData, 'operador_portao'),
      }).eq('id', existente.id)
      if (erroAtualizacao) throw new Error(mensagemAmigavel(erroAtualizacao))
    }

    /*
     * Identidade própria (master/suporte/produtor): NÃO manda link de senha nova — a conta dele já tem login e
     * senha de verdade, e o link criado aqui ("crie sua senha") não faria sentido nenhum pra ele. Ver o comentário
     * acima, no ramo que pulou a função extra.
     */
    if (existente.role !== 'operador_portao' && !podeReceberFuncaoExtra(existente.role)) {
      revalidatePath('/admin/usuarios')
      revalidatePath(`/admin/eventos/${eventoId}`)
      return { ok: true as const, novo: false as const, usuario: cpf, linkSenha: null, identidadePropria: true as const }
    }

    const linkSenha = await criarConviteSenhaSupervisor({
      perfilId: existente.id, nome, cpf, eventoId, evento: evento.nome, setor: 'Portão',
    })

    /*
     * Reaproveita o template do supervisor — não existe um modelo próprio
     * aprovado na Meta pro operador, e submeter um novo não sai a tempo.
     * O texto fixo do lado da Meta diz "supervisor" mesmo sendo operador;
     * decisão explícita do Juan, sabendo da limitação.
     */
    await agendarTemplateSupervisor({
      eventoId,
      telefone,
      template: 'cadastro_supervisor_cpf_link',
      parametros: [nome, 'Portão', evento.nome, formatarCpfExibicao(cpf), linkSenha],
    })

    revalidatePath('/admin/usuarios')
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true as const, novo: false as const, usuario: cpf, linkSenha }
  }

  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
  })
  if (error) {
    const jaExiste = /already|exist|registered/i.test(error.message)
    throw new Error(jaExiste
      ? `Já existe um acesso com o CPF ${cpf}. Se for a mesma pessoa, edite o acesso dela em vez de criar outro.`
      : mensagemAuth(error.message))
  }

  const { error: erroPerfil } = await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    telefone,
    ativo,
    cpf,
    role: 'operador_portao',
    organizacao_id: organizacaoId,
    fornecedor_id: null,
    permissoes_usuario: permissoesUsuarioDoForm(formData, 'operador_portao'),
  }])
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    console.error('[criarOperadorPortaria] falha ao inserir perfil', { eventoId, organizacaoId, erro: erroPerfil })
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  let linkSenha: string
  try {
    linkSenha = await criarConviteSenhaSupervisor({
      cpf, perfilId: user.user!.id, nome, eventoId, evento: evento.nome, setor: 'Portão',
    })
    // Mesma ressalva da realocação acima: template do supervisor, sem um
    // próprio pro operador — o texto fixo da Meta diz "supervisor".
    await agendarTemplateSupervisor({
      eventoId,
      telefone,
      template: 'cadastro_supervisor_cpf_link',
      parametros: [nome, 'Portão', evento.nome, formatarCpfExibicao(cpf), linkSenha],
    })
  } catch (erro) {
    // Sem convite a conta fica inacessível — desfaz tudo pra poder tentar de novo.
    await admin.from('perfis').delete().eq('id', user.user!.id)
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    throw erro
  }

  revalidatePath('/admin/usuarios')
  revalidatePath(`/admin/eventos/${eventoId}`)

  return { ok: true as const, novo: true as const, usuario: cpf, linkSenha, avisado: true as const }
}

/**
 * Cadastra um totem — um TABLET/CELULAR FIXO no portão, não uma pessoa.
 *
 * Só pra eventos em Biometria + QR Code (pedido do Juan, 27/09/2026: "esse
 * campo seja para criar totem"). Login e senha vêm PRONTOS — `totem1`,
 * `totem2`... na ordem em que forem criados NESTA ORGANIZAÇÃO (mesmo escopo
 * dos operadores de portão comuns, ver o comentário em
 * `OperadorPortariaCard.tsx`) — sem pedir nome, CPF nem telefone: um
 * aparelho não tem nada disso, e não tem WhatsApp pra receber convite.
 *
 * A SENHA É O MESMO NOME DO LOGIN (pedido do Juan, 28/09/2026) — quem
 * configura o tablet digita "totem1" duas vezes, sem precisar anotar nada à
 * parte. É uma conta `operador_portao` (só lê QR/rosto e registra ponto,
 * sem acesso a editar evento, equipe ou usuários) — o mesmo baixo risco já
 * aceito pra essa role justifica a troca por simplicidade aqui.
 *
 * Reaproveita o login por NOME DE USUÁRIO que já existia pro formato antigo
 * de supervisor (`usuarioParaEmail`, lib/usuario.ts) — a tela de login já
 * sabe tratar "totem1" como usuário (não tem "@", não são 11 dígitos de
 * CPF), sem precisar mudar nada lá.
 */
export async function criarTotem(eventoId: string, portaoNome?: string) {
  try {
    return await criarTotemOuLanca(eventoId, portaoNome)
  } catch (e) {
    // Mesmo cuidado de criarOperadorPortaria/criarSupervisor logo acima.
    return { error: mensagemAmigavel(e) }
  }
}

async function criarTotemOuLanca(eventoId: string, portaoNome?: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para criar totem')

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, organizacao_id, nome, metodo_identificacao').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')
  const organizacaoId = evento.organizacao_id
  if (!ehMaster(perfil!.role) && organizacaoId !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este evento')
  }
  if ((evento as { metodo_identificacao?: string }).metodo_identificacao !== 'biometria_qr') {
    throw new Error('Este evento não está configurado para Biometria + QR Code.')
  }

  const admin = getAdminSupabase()

  /*
   * Próximo número da sequência DESTA ORGANIZAÇÃO — não deste evento: o
   * mesmo totem físico pode servir em mais de um evento com o tempo. Só o
   * prefixo do e-mail interno importa (`totemN@...`); operadores comuns têm
   * e-mail por CPF e nunca batem nesse `.like()`.
   */
  const { data: totensExistentes } = await admin
    .from('perfis').select('email').eq('organizacao_id', organizacaoId).eq('role', 'operador_portao').like('email', 'totem%@%')

  let proximoNumero = 1 + (totensExistentes ?? [])
    .map(t => parseInt(/^totem(\d+)@/.exec(t.email ?? '')?.[1] ?? '0', 10))
    .reduce((max, n) => Math.max(max, n), 0)

  // Tenta criar; se o login já existir (corrida rara com outra criação ao
  // mesmo tempo), avança pro próximo número — nunca sobrescreve um totem
  // que já existe.
  for (let tentativas = 0; tentativas < 5; tentativas++) {
    const usuario = `totem${proximoNumero}`
    const email = usuarioParaEmail(usuario)
    const senha = usuario

    const { data: user, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (error) {
      if (/already|exist|registered/i.test(error.message)) { proximoNumero++; continue }
      throw new Error(mensagemAuth(error.message))
    }

    const { error: erroPerfil } = await admin.from('perfis').insert([{
      id: user.user!.id,
      nome: `Totem ${proximoNumero}`,
      email,
      telefone: null,
      ativo: true,
      cpf: null,
      role: 'operador_portao',
      organizacao_id: organizacaoId,
      fornecedor_id: null,
      permissoes_usuario: {},
      /*
       * Preso a ESTE evento — antes só a organização, e um totem físico
       * numa organização que roda dois eventos no mesmo dia acabava
       * mostrando os dois pra escolher (pedido do Juan, 29/09/2026). Com
       * isto preenchido, o seletor de evento nem aparece na tela do totem
       * (ver `eventosEscaneaveisSemData`) — sempre este evento, sem chance
       * de esquecer trocado.
       */
      evento_fixo_id: eventoId,
      portao_nome: portaoNome?.trim() || null,
    }])
    if (erroPerfil) {
      await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
      console.error('[criarTotem] falha ao inserir perfil', { eventoId, organizacaoId, erro: erroPerfil })
      throw new Error(mensagemAmigavel(erroPerfil))
    }

    auditar(perfil, 'TOTEM_CRIADO', {
      campoAlterado: 'Totem', valorNovo: curto(`Totem ${proximoNumero} (${usuario})${portaoNome?.trim() ? ` · portão ${portaoNome.trim()}` : ''}`), eventoId,
    })
    revalidatePath('/admin/usuarios')
    revalidatePath(`/admin/eventos/${eventoId}`)

    return { ok: true as const, nome: `Totem ${proximoNumero}`, usuario, senha }
  }

  throw new Error('Não foi possível gerar um login de totem disponível. Tente de novo.')
}

/**
 * Edita um totem — SÓ status e senha, nunca nome/CPF/telefone.
 *
 * Bug real encontrado em 28/09/2026: editar um totem caía no mesmo formulário
 * de operador humano, que EXIGE CPF de 11 dígitos e telefone — `editarSupervisor`
 * até recalcula o e-mail a partir do CPF digitado, o que trocaria o login
 * `totemN@...` por um baseado em CPF, quebrando o acesso do tablet. Um totem
 * não tem nenhum desses dados, então precisa do próprio caminho.
 */
export async function editarTotem(id: string, formData: FormData): Promise<{ error?: string }> {
  try {
    const perfil = await getPerfil()
    if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão')

    const admin = getAdminSupabase()
    const { data: alvo } = await admin.from('perfis').select('organizacao_id, email, role').eq('id', id).single()
    if (!alvo) throw new Error('Totem não encontrado')
    if (alvo.role !== 'operador_portao' || !/^totem\d+@/.test(alvo.email ?? '')) {
      throw new Error('Este acesso não é um totem.')
    }
    if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
      throw new Error('Sem permissão sobre este totem')
    }

    const ativo = formData.get('ativo') !== 'false'
    const novaSenha = (formData.get('senha') as string) || ''
    if (novaSenha && novaSenha.length < 6) throw new Error('Senha muito curta. Use ao menos 6 caracteres.')

    const { error: erroPerfil } = await admin.from('perfis').update({ ativo }).eq('id', id)
    if (erroPerfil) throw new Error(mensagemAmigavel(erroPerfil))

    if (novaSenha) {
      const { error: erroSenha } = await admin.auth.admin.updateUserById(id, { password: novaSenha })
      if (erroSenha) throw new Error(mensagemAuth(erroSenha.message))
    }

    auditar(perfil, 'TOTEM_EDITADO', {
      campoAlterado: `Totem ${alvo.email ?? ''}`.trim(), organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
      valorNovo: `${ativo ? 'Ativo' : 'Desativado'}${novaSenha ? ' · senha trocada' : ''}`,
    })
    revalidatePath('/admin/usuarios')
    return {}
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

// ─── Suporte de Sistema ─────────────────────────────────────────────────────
/*
 * Gente CONTRATADA pro dia do evento — corrige a operação, nunca administra.
 * Ver lib/permissions.ts (`ehSuporte`, `podeEditarIdentidade`), lib/suporte.ts
 * (o escopo) e supabase/upgrade-suporte.sql (o desenho das tabelas).
 *
 * SÓ MASTER cria/edita suporte, de propósito: diferente de supervisor
 * (preso a UM setor da própria organização do admin), o escopo do suporte
 * atravessa organizações — "Cliente A e Cliente B", no exemplo do pedido.
 * É a mesma régua de quem cria organização: quem contrata pessoa pra apoiar
 * vários clientes é a plataforma, não um admin de cliente específico.
 */

function escoposDoForm(formData: FormData): { organizacaoId?: string; eventoId?: string }[] {
  const orgs = formData.getAll('escopo_organizacao_id').map(String).filter(Boolean)
  const eventos = formData.getAll('escopo_evento_id').map(String).filter(Boolean)
  return [
    ...orgs.map(organizacaoId => ({ organizacaoId })),
    ...eventos.map(eventoId => ({ eventoId })),
  ]
}

async function gravarEscopoSuporte(perfilId: string, escopos: { organizacaoId?: string; eventoId?: string }[]) {
  await supabaseAdmin.from('suporte_escopo').delete().eq('perfil_id', perfilId)
  if (!escopos.length) return
  const linhas = escopos.map(e => ({
    perfil_id: perfilId, organizacao_id: e.organizacaoId ?? null, evento_id: e.eventoId ?? null,
  }))
  const { error } = await supabaseAdmin.from('suporte_escopo').insert(linhas)
  if (error) throw new Error(mensagemAmigavel(error))
}

/** Só pro TEXTO do convite de senha — o acesso de verdade é `suporte_escopo`, não isto. */
async function eventoDeReferencia(escopos: { organizacaoId?: string; eventoId?: string }[]): Promise<{ id: string; nome: string } | null> {
  const direto = escopos.find(e => e.eventoId)
  if (direto?.eventoId) {
    const { data } = await supabaseAdmin.from('eventos').select('id, nome').eq('id', direto.eventoId).maybeSingle()
    if (data) return data as { id: string; nome: string }
  }
  const porOrg = escopos.find(e => e.organizacaoId)
  if (porOrg?.organizacaoId) {
    const { data } = await supabaseAdmin
      .from('eventos').select('id, nome').eq('organizacao_id', porOrg.organizacaoId)
      .order('data_inicio', { ascending: false }).limit(1).maybeSingle()
    if (data) return data as { id: string; nome: string }
  }
  return null
}

export async function criarSuporte(formData: FormData) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Só o master cria acesso de suporte.')

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const expiraEmBruto = (formData.get('acesso_expira_em') as string) || ''
  if (!nome) throw new Error('Informe o nome.')
  if (telefone.length < 10 || telefone.length > 13) throw new Error('Informe um telefone válido para enviar o acesso pelo WhatsApp.')

  const escopos = escoposDoForm(formData)
  if (!escopos.length) throw new Error('Escolha ao menos uma organização ou evento de atendimento.')

  const cpf = normalizarCpf((formData.get('cpf') as string) ?? '')
  if (cpf.length !== 11) throw new Error('Informe o CPF, com 11 dígitos.')
  const email = cpfParaEmail(cpf)
  const acessoExpiraEm = expiraEmBruto ? inputParaISO(`${expiraEmBruto}T23:59`) : null

  const admin = getAdminSupabase()

  const { data: existente } = await admin.from('perfis').select('id').eq('cpf', cpf).maybeSingle()
  if (existente) throw new Error(`Já existe um acesso com o CPF ${cpf}. Edite esse acesso em vez de criar outro.`)

  const { data: user, error } = await admin.auth.admin.createUser({
    email, password: randomBytes(32).toString('base64url'), email_confirm: true,
  })
  if (error) throw new Error(mensagemAuth(error.message))

  const { error: erroPerfil } = await admin.from('perfis').insert([{
    id: user.user!.id, nome, email, telefone, ativo, cpf,
    role: 'suporte', organizacao_id: null, fornecedor_id: null,
    acesso_expira_em: acessoExpiraEm,
    permissoes_usuario: permissoesUsuarioDoForm(formData, 'suporte'),
  }])
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  await gravarEscopoSuporte(user.user!.id, escopos)

  const referencia = await eventoDeReferencia(escopos)
  let linkSenha: string | null = null
  try {
    linkSenha = await criarConviteSenhaSupervisor({
      cpf, perfilId: user.user!.id, nome,
      eventoId: referencia?.id ?? '', evento: referencia?.nome ?? 'Credenciei', setor: 'Suporte de Sistema',
    })
  } catch (erro) {
    // O acesso já existe mesmo sem o link — o master gera um novo depois,
    // pela mesma tela (mesmo caminho de `gerarLinkDeAcesso`).
    console.error('[criarSuporte] falha ao gerar link de senha', erro)
  }

  auditar(perfil, 'SUPORTE_CRIADO', {
    campoAlterado: 'Acesso de suporte', valorNovo: curto(`${nome} · ${escopos.length} escopo(s)${expiraEmBruto ? ` · expira ${expiraEmBruto}` : ''}${ativo ? '' : ' · inativo'}`),
  })
  revalidatePath('/admin/suporte')
  return { ok: true as const, linkSenha }
}

/**
 * Cria um acesso de PRODUTOR — cliente do produto Gastos.
 *
 * CPF + link de senha por WhatsApp, como o supervisor. Amarrado a UMA
 * organização (`organizacao_id`) e aos eventos escolhidos (`produtor_eventos`).
 * Não toca em nada do credenciamento. Só o master cria — é venda de produto.
 */
export async function criarProdutor(formData: FormData) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Só o master cria acesso de produtor.')

  const admin = getAdminSupabase()

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const organizacaoId = ((formData.get('organizacao_id') as string) ?? '').trim()
  const eventoIds = [...new Set(formData.getAll('produtor_evento_id').map(String).filter(Boolean))]

  if (!nome) throw new Error('Informe o nome.')
  if (telefone.length < 10 || telefone.length > 13) throw new Error('Informe um telefone válido para enviar o acesso pelo WhatsApp.')
  if (!organizacaoId) throw new Error('Escolha a organização do produtor.')
  if (!eventoIds.length) throw new Error('Vincule ao menos um evento ao produtor.')

  const cpf = normalizarCpf((formData.get('cpf') as string) ?? '')
  if (cpf.length !== 11) throw new Error('Informe o CPF, com 11 dígitos.')
  const email = cpfParaEmail(cpf)

  const { data: org } = await admin.from('organizacoes').select('id, nome').eq('id', organizacaoId).single()
  if (!org) throw new Error('Organização não encontrada.')

  // Os eventos têm que ser DESTA organização — a org é a fronteira.
  const { data: eventosOk } = await admin
    .from('eventos').select('id').eq('organizacao_id', organizacaoId).in('id', eventoIds)
  const idsValidos = (eventosOk ?? []).map(e => e.id as string)
  if (!idsValidos.length) throw new Error('Nenhum dos eventos escolhidos é desta organização.')

  const { data: existente } = await admin.from('perfis').select('id, role').eq('cpf', cpf).maybeSingle()
  if (existente) throw new Error(`Já existe um acesso com o CPF ${formatCpf(cpf)}. Edite esse acesso em vez de criar outro.`)

  const { data: user, error } = await admin.auth.admin.createUser({
    email, password: randomBytes(32).toString('base64url'), email_confirm: true,
  })
  if (error) throw new Error(mensagemAuth(error.message))

  const { error: erroPerfil } = await admin.from('perfis').insert([{
    id: user.user!.id, nome, email, telefone, ativo, cpf,
    role: 'produtor', organizacao_id: organizacaoId, fornecedor_id: null,
  }])
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  const { error: erroVinculo } = await admin.from('produtor_eventos').insert(
    idsValidos.map(evento_id => ({ produtor_id: user.user!.id, evento_id, criado_por: perfil!.id })),
  )
  if (erroVinculo) console.error('[criarProdutor] vínculo de eventos falhou', erroVinculo)

  let linkSenha: string | null = null
  try {
    const { data: refEvento } = await admin.from('eventos').select('id, nome').eq('id', idsValidos[0]).maybeSingle()
    linkSenha = await criarConviteSenhaSupervisor({
      cpf, perfilId: user.user!.id, nome,
      eventoId: refEvento?.id ?? '', evento: refEvento?.nome ?? 'Credenciei', setor: 'Gastos',
    })
  } catch (erro) {
    console.error('[criarProdutor] falha ao gerar link de senha', erro)
  }

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Acesso de produtor — ${org.nome}`,
    valorNovo: `${nome} — CPF ${formatCpf(cpf)}, ${idsValidos.length} evento(s)`,
    organizacaoId,
  }))

  revalidatePath('/admin/usuarios')
  return { ok: true as const, linkSenha }
}

/** Edita nome/telefone/status/expiração/escopo de um suporte já existente. */
export async function editarSuporte(perfilId: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Só o master edita acesso de suporte.')

  const { data: alvo } = await supabaseAdmin.from('perfis').select('id, role').eq('id', perfilId).single()
  if (!alvo || alvo.role !== 'suporte') throw new Error('Acesso de suporte não encontrado.')

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const expiraEmBruto = (formData.get('acesso_expira_em') as string) || ''
  if (!nome) throw new Error('Informe o nome.')

  const escopos = escoposDoForm(formData)
  if (!escopos.length) throw new Error('Escolha ao menos uma organização ou evento de atendimento.')

  const { error } = await supabaseAdmin.from('perfis').update({
    nome, telefone, ativo,
    acesso_expira_em: expiraEmBruto ? inputParaISO(`${expiraEmBruto}T23:59`) : null,
  }).eq('id', perfilId)
  if (error) throw new Error(mensagemAmigavel(error))

  await gravarEscopoSuporte(perfilId, escopos)

  auditar(perfil, 'SUPORTE_EDITADO', {
    campoAlterado: 'Acesso de suporte', valorNovo: curto(`${nome} · ${escopos.length} escopo(s)${expiraEmBruto ? ` · expira ${expiraEmBruto}` : ''} · ${ativo ? 'ativo' : 'inativo'}`),
  })
  revalidatePath('/admin/suporte')
  return { ok: true as const }
}

export type LinhaAuditoria = {
  id: string; acao: string; usuarioResponsavel: string; campoAlterado: string | null
  valorAnterior: string | null; valorNovo: string | null; motivo: string | null
  eventoNome: string | null; funcionarioNome: string | null; criadoEm: string
  /** Papel de quem fez — "supervisor" e "admin" respondem por coisas diferentes. */
  autorRole: string | null
  autorId: string | null
  /** De onde o autor é: os setores dele, em texto. Vazio pra quem não tem setor. */
  autorSetor: string | null
  funcionarioId: string | null
  funcionarioCpf: string | null
  funcionarioSetor: string | null
  ip: string | null
  /** Só em linhas de CADASTRO_FUNCIONARIO: quando essa pessoa bateu a primeira entrada. `null` = ainda não apareceu no evento. */
  primeiraEntradaEm: string | null
}

/**
 * A trilha de auditoria — filtrada pelo escopo de quem consulta: master vê
 * tudo, admin só a própria organização, suporte só o próprio escopo (o que
 * ele mesmo fez, dentro do que tem acesso).
 */
export async function obterAuditoria(
  opcoes: {
    eventoId?: string; limite?: number; dias?: number
    /** Tudo que ESTA pessoa fez. */
    autorId?: string
    /** Só um tipo de ação — "todos os excluídos", "todos os cadastrados". */
    acao?: string
    /**
     * Tudo que aconteceu NESTE setor. Casa dos dois lados: o setor da pessoa
     * afetada e o setor de quem fez. Sem o segundo, exclusão ficaria de fora
     * justamente aqui — quem foi apagado perde o vínculo com o setor
     * (`funcionario_id` vira nulo), e "o que houve no Bar" é exatamente a
     * pergunta que se faz sobre exclusão.
     */
    setor?: string
    /** Nome (ou CPF) da PESSOA AFETADA — "o que aconteceu com o Fulano". */
    nome?: string
  } = {},
): Promise<LinhaAuditoria[]> {
  const perfil = await getPerfil()
  if (!perfil) return []

  const termoNome = (opcoes.nome ?? '').trim()
  const digitosNome = termoNome.replace(/\D/g, '')

  /*
   * Duas consultas quando há busca por nome/CPF, somadas:
   *   1. pela PESSOA (cadastro atual, via `funcionarios!inner`);
   *   2. pelo TEXTO da linha (`valor_anterior`/`valor_novo`).
   * A 2ª existe porque quem foi EXCLUÍDO não tem mais cadastro — `funcionario_id` vira nulo — e o nome e o CPF
   * dele só ficam escritos no texto ("Fulano — CPF 000.000.000-00"). Só com a 1ª, procurar o excluído pelo nome
   * dava "nada encontrado" mesmo com a exclusão registrada (achado em 08/10/2026, no VITAL).
   */
  const montar = (pelaPessoa: boolean) => {
    let q = supabaseAdmin
      .from('alteracoes_cadastro')
      /*
       * `perfis` e `fornecedores` entram no mesmo select porque a linha sozinha
       * não respondia o que se pergunta na frente dela: "quem é esse nome?" e
       * "de qual setor era a pessoa?". São dois joins por chave estrangeira que
       * já existem — nenhuma coluna nova, nada que dependa de migração.
       *
       * `funcionarios!inner` só na busca pela pessoa: precisa virar INNER
       * pra o `.or()` de baixo filtrar no banco (embutido em LEFT JOIN o
       * Postgres não filtra a linha pai).
       */
      .select(`id, acao, usuario_responsavel, usuario_responsavel_id, campo_alterado, valor_anterior, valor_novo, motivo, ip, created_at, funcionario_id, eventos(nome), perfis(role), funcionarios${pelaPessoa && termoNome ? '!inner' : ''}(nome, cpf, fornecedores(nome))`)
      .order('created_at', { ascending: false })
      .limit(opcoes.limite ?? 100)

    if (opcoes.eventoId) q = q.eq('evento_id', opcoes.eventoId)
    if (opcoes.autorId) q = q.eq('usuario_responsavel_id', opcoes.autorId)
    if (opcoes.acao) q = q.eq('acao', opcoes.acao)
    if (termoNome && pelaPessoa) {
      const condicoes = [`nome.ilike.%${termoNome}%`]
      if (digitosNome) condicoes.push(`cpf.ilike.%${digitosNome}%`)
      q = q.or(condicoes.join(','), { foreignTable: 'funcionarios' })
    }
    if (termoNome && !pelaPessoa) {
      // No texto o CPF está FORMATADO; 11 dígitos digitados viram "000.000.000-00". Aspas: o valor tem ponto.
      const alvo = digitosNome.length === 11 ? formatCpf(digitosNome) : termoNome
      const valor = `"%${alvo.replace(/"/g, '')}%"`
      q = q.or(`valor_anterior.ilike.${valor},valor_novo.ilike.${valor}`)
    }

    /*
     * O corte é por DIA, e o dia é o de Brasília.
     *
     * "Hoje" (dias = 1) começa à meia-noite daqui, não 24 horas atrás: quem
     * abre a tela às 9h da manhã quer o que aconteceu hoje, e não metade de
     * ontem junto. Em UTC a virada cairia às 21h, e a auditoria da noite de
     * ontem apareceria como sendo de hoje.
     */
    if (opcoes.dias && opcoes.dias > 0) {
      const inicio = new Date(`${diaBRT()}T00:00:00-03:00`)
      inicio.setUTCDate(inicio.getUTCDate() - (opcoes.dias - 1))
      q = q.gte('created_at', inicio.toISOString())
    }

    if (perfil.role === 'suporte') {
      q = q.eq('usuario_responsavel_id', perfil.id)
    } else if (!ehMaster(perfil.role)) {
      q = q.eq('organizacao_id', perfil.organizacao_id)
    }
    return q
  }

  if (perfil.role !== 'suporte' && !ehMaster(perfil.role) && !podeGerenciarUsuarios(perfil)) return []

  const [pelaPessoa, peloTexto] = await Promise.all([
    montar(true),
    termoNome ? montar(false) : Promise.resolve({ data: [] as never[] }),
  ])
  const vistos = new Set<string>()
  const data = [...(pelaPessoa.data ?? []), ...(peloTexto.data ?? [])]
    .filter(a => (vistos.has(a.id as string) ? false : (vistos.add(a.id as string), true)))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, opcoes.limite ?? 100)

  /*
   * De onde o autor é — numa consulta só, pro lote inteiro.
   *
   * "Igor exclui gente" e "o supervisor do Bar exclui gente" são leituras
   * diferentes da mesma linha, e só a segunda diz alguma coisa a quem está
   * conferindo. Vem de `supervisor_setores` porque um supervisor pode cobrir
   * vários setores; buscar por linha seria uma consulta por registro na tela.
   */
  const autorIds = [...new Set((data ?? []).map(a => a.usuario_responsavel_id as string | null).filter((v): v is string => !!v))]
  const setoresPorAutor = new Map<string, string[]>()
  if (autorIds.length) {
    const { data: vinculos } = await supabaseAdmin
      .from('supervisor_setores').select('perfil_id, fornecedores(nome)').in('perfil_id', autorIds)
    for (const v of vinculos ?? []) {
      const nome = (v.fornecedores as unknown as { nome: string } | null)?.nome
      if (!nome) continue
      const id = v.perfil_id as string
      setoresPorAutor.set(id, [...(setoresPorAutor.get(id) ?? []), nome])
    }
  }

  /*
   * Primeira entrada de cada pessoa — só pra quem tem linha de CADASTRO na
   * tela: é a resposta de "ela chegou a aparecer no evento depois de se
   * cadastrar?". Uma consulta só, batendo todos os `funcionario_id` da
   * página de uma vez (nunca um SELECT por linha).
   */
  const idsCadastro = [...new Set(
    (data ?? [])
      .filter(a => a.acao === 'CADASTRO_FUNCIONARIO')
      .map(a => a.funcionario_id as string | null)
      .filter((v): v is string => !!v)
  )]
  const primeiraEntradaPorFuncionario = new Map<string, string>()
  if (idsCadastro.length) {
    const { data: entradas } = await supabaseAdmin
      .from('registros')
      .select('funcionario_id, created_at')
      .in('funcionario_id', idsCadastro)
      .eq('tipo', 'entrada')
      .order('created_at', { ascending: true })
    for (const e of entradas ?? []) {
      const fid = e.funcionario_id as string
      if (!primeiraEntradaPorFuncionario.has(fid)) primeiraEntradaPorFuncionario.set(fid, e.created_at as string)
    }
  }

  return (data ?? []).map(a => {
    const autorId = (a.usuario_responsavel_id as string | null) ?? null
    const setoresDoAutor = autorId ? setoresPorAutor.get(autorId) ?? [] : []
    const funcionarioId = (a.funcionario_id as string | null) ?? null
    return {
      id: a.id as string,
      acao: a.acao as string,
      usuarioResponsavel: a.usuario_responsavel as string,
      campoAlterado: (a.campo_alterado as string | null) ?? null,
      valorAnterior: (a.valor_anterior as string | null) ?? null,
      valorNovo: (a.valor_novo as string | null) ?? null,
      motivo: (a.motivo as string | null) ?? null,
      eventoNome: (a.eventos as unknown as { nome: string } | null)?.nome ?? null,
      funcionarioId,
      funcionarioNome: (a.funcionarios as unknown as { nome: string } | null)?.nome ?? null,
      funcionarioCpf: (a.funcionarios as unknown as { cpf: string } | null)?.cpf ?? null,
      funcionarioSetor: (a.funcionarios as unknown as { fornecedores: { nome: string } | null } | null)?.fornecedores?.nome ?? null,
      autorRole: (a.perfis as unknown as { role: string } | null)?.role ?? null,
      autorId,
      autorSetor: setoresDoAutor.length ? [...new Set(setoresDoAutor)].join(', ') : null,
      ip: (a.ip as string | null) ?? null,
      criadoEm: a.created_at as string,
      primeiraEntradaEm: (a.acao === 'CADASTRO_FUNCIONARIO' && funcionarioId)
        ? primeiraEntradaPorFuncionario.get(funcionarioId) ?? null
        : null,
    }
  }).filter(l => {
    if (!opcoes.setor) return true
    const alvo = opcoes.setor.toLowerCase()
    // Filtrado aqui, e não no banco: o setor vem de dois joins diferentes
    // (o da pessoa afetada e o de quem fez), e um `or` sobre tabela embutida
    // não existe no PostgREST.
    return (l.funcionarioSetor ?? '').toLowerCase() === alvo
      || (l.autorSetor ?? '').toLowerCase().split(', ').includes(alvo)
  })
}

/**
 * As opções dos filtros da auditoria — quem aparece como autor e quais
 * setores existem, dentro do escopo de quem consulta.
 *
 * Vem de `perfis` e `fornecedores`, e não dos registros de auditoria já
 * carregados: as opções não podem depender do período escolhido, senão
 * filtrar por "hoje" esconderia a pessoa que se quer procurar em "tudo".
 */
export async function opcoesDaAuditoria(): Promise<{
  autores: { id: string; nome: string; role: string; setor: string | null }[]
  eventos: { id: string; nome: string }[]
  /** `eventoId` amarra o setor ao evento dele — é o que deixa a tela filtrar
   *  Setor em cascata depois que Evento é escolhido, sem outra ida ao banco. */
  setores: { nome: string; eventoId: string }[]
}> {
  const perfil = await getPerfil()
  if (!perfil || !(podeGerenciarUsuarios(perfil) || perfil.role === 'suporte')) {
    return { autores: [], eventos: [], setores: [] }
  }

  let consultaPerfis = supabaseAdmin
    .from('perfis').select('id, nome, role, fornecedor_id, fornecedores(nome)').order('nome')
  if (!ehMaster(perfil.role)) consultaPerfis = consultaPerfis.eq('organizacao_id', perfil.organizacao_id)

  let consultaEventos = supabaseAdmin.from('eventos').select('id, nome').order('data_inicio', { ascending: false })
  if (!ehMaster(perfil.role)) consultaEventos = consultaEventos.eq('organizacao_id', perfil.organizacao_id)

  const [{ data: perfis }, { data: eventos }] = await Promise.all([consultaPerfis, consultaEventos])

  const { data: setores } = await supabaseAdmin
    .from('fornecedores').select('nome, evento_id')
    .in('evento_id', (eventos ?? []).map(e => e.id as string))
    .order('nome')

  return {
    autores: (perfis ?? []).map(p => ({
      id: p.id as string,
      nome: p.nome as string,
      role: (p.role as string) ?? '',
      setor: (p.fornecedores as unknown as { nome: string } | null)?.nome ?? null,
    })),
    eventos: (eventos ?? []).map(e => ({ id: e.id as string, nome: e.nome as string })),
    setores: (setores ?? []).map(f => ({ nome: f.nome as string, eventoId: f.evento_id as string })),
  }
}

export type EscopoSuporte = { organizacaoNome: string | null; eventoNome: string | null }

/**
 * Revoga na hora — não espera a data marcada. Zera `acesso_expira_em` pra
 * "agora": `getPerfil()` já trata isso como deslogado no próximo request,
 * sem precisar de um campo/estado novo.
 */
export async function revogarSuporte(perfilId: string) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Só o master revoga acesso de suporte.')

  const { error } = await supabaseAdmin.from('perfis')
    .update({ acesso_expira_em: new Date().toISOString(), ativo: false })
    .eq('id', perfilId).eq('role', 'suporte')
  if (error) throw new Error(mensagemAmigavel(error))

  const { data: revogado } = await supabaseAdmin.from('perfis').select('nome').eq('id', perfilId).maybeSingle()
  auditar(perfil, 'SUPORTE_REVOGADO', { campoAlterado: 'Acesso de suporte', valorAnterior: revogado?.nome ?? perfilId, valorNovo: 'Revogado' })
  revalidatePath('/admin/suporte')
  return { ok: true as const }
}

/**
 * Gera um link novo de criar senha para quem já tem acesso.
 *
 * Existe para o organizador não depender de ninguém quando alguém esquece a
 * senha no meio da operação — que é quando isso sempre acontece. Antes, cada
 * caso virava um pedido de socorro; com dez eventos no mesmo dia, viraria dez.
 *
 * NÃO invalida a senha atual. Quem lembra continua entrando normalmente; o
 * link só oferece um caminho de troca a quem precisar. É de uso único e vale
 * 24h — as duas travas que já valem para o convite de cadastro.
 */
export async function gerarLinkDeAcesso(perfilId: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin
    .from('perfis').select('id, nome, cpf, role, organizacao_id, fornecedor_id')
    .eq('id', perfilId).single()
  if (!alvo) throw new Error('Acesso não encontrado')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este acesso')
  }

  /*
   * O convite guarda evento e setor só para o texto da tela de criar senha.
   * Um operador de portão não tem setor, e um supervisor pode ter vários —
   * então o rótulo é do vínculo atual, e a ausência dele não impede nada.
   */
  const { data: setor } = alvo.fornecedor_id
    ? await admin.from('fornecedores').select('nome, evento_id, eventos(nome)').eq('id', alvo.fornecedor_id).single()
    : { data: null }
  const eventoDoSetor = setor?.eventos as unknown as { nome: string } | null

  const linkSenha = await criarConviteSenhaSupervisor({
    perfilId: alvo.id,
    nome: alvo.nome,
    cpf: alvo.cpf ?? undefined,
    eventoId: (setor?.evento_id as string | undefined) ?? '',
    evento: eventoDoSetor?.nome ?? 'Credenciei',
    setor: setor?.nome ?? 'Portão',
  })

  return { ok: true as const, linkSenha, nome: alvo.nome as string, cpf: (alvo.cpf as string | null) ?? null }
}

/**
 * Evento pra pendurar a mensagem de WhatsApp (`mensagens_agendadas.evento_id`
 * é obrigatório) quando a ação não tem um evento específico em mãos — o
 * conteúdo da mensagem não fala do evento, é só o FK que a tabela exige.
 * Setor atual → evento dele; senão o mais recente da organização; master
 * sem organização → o mais recente do sistema inteiro.
 */
async function eventoDeReferenciaParaMensagem(perfil: {
  organizacao_id: string | null
  fornecedor_id: string | null
}): Promise<string | null> {
  if (perfil.fornecedor_id) {
    const { data } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', perfil.fornecedor_id).maybeSingle()
    if (data?.evento_id) return data.evento_id as string
  }
  const query = supabaseAdmin.from('eventos').select('id').order('created_at', { ascending: false }).limit(1)
  if (perfil.organizacao_id) query.eq('organizacao_id', perfil.organizacao_id)
  const { data } = await query.maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * "Esqueci minha senha" — autoatendimento (pedido do Juan, 03/10/2026).
 * Antes o único caminho era mandar mensagem pro WhatsApp do suporte e
 * esperar alguém resetar na mão (ver `WHATSAPP_SUPORTE` em
 * `modern-stunning-sign-in.tsx`). Esta ação acha o acesso pelo CPF e manda
 * um link de criar senha nova pro WhatsApp JÁ CADASTRADO — mesmo
 * mecanismo/token de `gerarLinkDeAcesso` (`criarConviteSenhaSupervisor`),
 * só que disparado pela própria pessoa, sem precisar de admin.
 *
 * A resposta é SEMPRE a mesma, exista ou não o CPF no sistema — contar a
 * diferença deixaria alguém descobrir por tentativa quais CPFs têm conta
 * aqui (mesmo cuidado de "e-mail não encontrado" em qualquer login sério).
 *
 * Depende do template `recuperar_senha_cpf_link` estar aprovado na Meta —
 * até lá, o link é gerado e a mensagem entra na fila, mas o envio de
 * verdade falha (fica tentando e marca erro, não quebra o resto).
 */
export async function solicitarRecuperacaoSenha(cpfBruto: string): Promise<{ ok: true } | { error: string }> {
  const cpf = normalizarCpf(cpfBruto)
  if (cpf.length !== 11) return { error: 'Informe um CPF válido, com 11 dígitos.' }

  if (!await podePassar(`recuperar-senha:${cpf}`, 3, 60 * 60 * 1000)) {
    return { error: 'Muitas tentativas com este CPF. Espere um pouco e tente de novo.' }
  }

  try {
    const { data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('id, nome, cpf, telefone, role, organizacao_id, fornecedor_id, ativo')
      .eq('cpf', cpf)
      .maybeSingle()

    if (perfil && perfil.ativo !== false && perfil.telefone) {
      const eventoId = await eventoDeReferenciaParaMensagem(perfil)
      if (eventoId) {
        const { data: evento } = await supabaseAdmin.from('eventos').select('nome').eq('id', eventoId).maybeSingle()
        const linkSenha = await criarConviteSenhaSupervisor({
          perfilId: perfil.id,
          nome: perfil.nome as string,
          cpf: perfil.cpf as string,
          eventoId,
          evento: (evento as { nome?: string } | null)?.nome ?? 'Credenciei',
          setor: ROLE_LABELS[perfil.role as Role] ?? 'Acesso',
          finalidade: 'recuperacao',
        })
        const mensagemId = await agendarTemplateSupervisor({
          eventoId,
          telefone: perfil.telefone as string,
          template: 'recuperar_senha_cpf_link',
          parametros: [perfil.nome as string, linkSenha],
        })
        // Sai AGORA, depois da resposta: quem pede a senha está olhando a tela
        // e não pode esperar o ciclo de 1 minuto da fila. Se falhar, a fila
        // normal tenta de novo (ver `enviarMensagemAgora`).
        if (mensagemId) after(() => enviarMensagemAgora(mensagemId).catch(e => console.error('[recuperar-senha] envio imediato falhou', e)))
      }
    }
  } catch (e) {
    // Nunca revela erro interno nem existência do CPF — loga e segue como sucesso.
    console.error('[solicitarRecuperacaoSenha] falha ao processar', e)
  }

  return { ok: true as const }
}

/** Edita nome/e-mail/telefone/status e, opcionalmente, a senha do supervisor. */
export async function editarSupervisor(id: string, formData: FormData): Promise<{ error?: string }> {
  try {
    await editarSupervisorOuLanca(id, formData)
    return {}
  } catch (e) {
    // Mesmo cuidado de `criarSupervisor`: sem isto, o Next mascara a
    // mensagem em produção e o formulário mostra "página desatualizada" em
    // vez do motivo de verdade — achado real em produção (24/09/2026).
    return { error: mensagemAmigavel(e) }
  }
}

async function editarSupervisorOuLanca(id: string, formData: FormData): Promise<void> {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('organizacao_id, fornecedor_id, email, role, nome, telefone, ativo, cpf').eq('id', id).single()
  if (!alvo) throw new Error('Supervisor não encontrado')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    /*
     * Supervisor de outra organização que TAMBÉM cobre um setor desta: a
     * organização da conta dele não muda mais ao ser escalado aqui (ver
     * `criarSupervisorOuLanca`), então sem isto a organização que o
     * escalou não conseguiria editá-lo. Só vale pra papel `supervisor` —
     * conta master/admin/operador de fora continua fora do alcance.
     */
    const podeViaSetor = alvo.role === 'supervisor' && !!perfil!.organizacao_id
      && await supervisionaSetorDaOrganizacao(id, perfil!.organizacao_id)
    if (!podeViaSetor) throw new Error('Sem permissão sobre este supervisor')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const novaSenha = (formData.get('senha') as string) || ''
  if (novaSenha && novaSenha.length < 6) throw new Error('Senha muito curta. Use ao menos 6 caracteres.')

  const cpf = normalizarCpf((formData.get('cpf') as string) ?? '')
  if (cpf.length !== 11) throw new Error('Informe o CPF do supervisor, com 11 dígitos.')
  const email = cpfParaEmail(cpf)

  /*
   * O CPF digitado já é de OUTRO perfil (não deste que está sendo editado)?
   *
   * Achado real (24/09/2026, dois turnos seguidos): a mesma pessoa já pode
   * ter outro tipo de acesso no sistema (master, admin, operador de portão,
   * suporte...) e AINDA assim precisar ajudar como supervisora de um setor
   * — o Juan mesmo é o exemplo (é master, e também precisa aparecer como
   * supervisor quando vai pessoalmente a um evento). Ninguém deveria
   * precisar de um SEGUNDO login pra isso: a regra é geral, não só pra
   * master/admin — QUALQUER acesso existente ganha só mais um vínculo de
   * supervisão (`supervisor_setores`) em cima da conta que já tem. Role,
   * e-mail e senha da conta original nunca mudam.
   *
   * A ÚNICA exceção é quando o CPF já É de outro supervisor: aí existe um
   * fluxo dedicado e mais completo pra isso (`criarSupervisorOuLanca`,
   * atrás do botão "Adicionar supervisor"), que já trata organização
   * diferente, mensagem de escala etc. — editar aqui não deveria duplicar
   * essa lógica.
   */
  const { data: outroComEsteCpf } = await admin
    .from('perfis').select('id, nome, role').eq('cpf', cpf).neq('id', id).maybeSingle()
  if (outroComEsteCpf) {
    if (outroComEsteCpf.role === 'supervisor') {
      throw new Error(`Este CPF já pertence a ${outroComEsteCpf.nome}, supervisor(a). Para reatribuir um supervisor já existente, use "Adicionar supervisor" no card do fornecedor em vez de editar aqui.`)
    }
    if (alvo.fornecedor_id) {
      await admin.from('supervisor_setores')
        .upsert({ perfil_id: outroComEsteCpf.id, fornecedor_id: alvo.fornecedor_id }, { onConflict: 'perfil_id,fornecedor_id', ignoreDuplicates: true })
    }
    auditar(perfil, 'SUPERVISOR_EDITADO', {
      campoAlterado: 'Supervisor', organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
      valorAnterior: curto(`${alvo.nome} — CPF ${formatCpf(String(alvo.cpf ?? ''))}`),
      valorNovo: curto(`Setor passou para ${outroComEsteCpf.nome}, que já tinha este CPF (CPF ${formatCpf(cpf)})`),
    })
    revalidatePath('/admin/usuarios')
    if (alvo.fornecedor_id) {
      const { data: fornecedor } = await admin.from('fornecedores').select('evento_id').eq('id', alvo.fornecedor_id).single()
      if (fornecedor) revalidatePath(`/admin/eventos/${fornecedor.evento_id}`)
    }
    return
  }

  /*
   * NÃO MEXER NO E-MAIL QUANDO ELE NÃO MUDOU.
   *
   * Isto reescrevia o e-mail no Auth em TODA edição — mesmo salvando só o
   * telefone, mesmo com o CPF idêntico. Trocar e-mail no Supabase abre um
   * fluxo de confirmação; e o endereço aqui é interno
   * (`@supervisor.credenciei`), num domínio que não existe e nunca recebe
   * nada. Confirmação que nunca chega deixa a conta num estado do qual ela
   * não sai sozinha — e quem descobre é a pessoa, no portão, no meio da
   * operação, com "senha inválida" numa senha que estava certa.
   *
   * Agora: só toca no e-mail se o CPF realmente mudou, e quando toca já
   * confirma junto (`email_confirm`), exatamente como `createUser` faz na
   * criação. Editar telefone, nome ou status não encosta mais no Auth.
   */
  const precisaTrocarEmail = email !== (alvo as { email?: string }).email
  if (precisaTrocarEmail || novaSenha) {
    const { error: authErr } = await admin.auth.admin.updateUserById(id, {
      ...(precisaTrocarEmail ? { email, email_confirm: true } : {}),
      ...(novaSenha ? { password: novaSenha } : {}),
    })
    if (authErr) {
      const jaExiste = /already|exist|registered/i.test(authErr.message)
      throw new Error(jaExiste ? `Já existe um supervisor com o CPF ${cpf}.` : mensagemAuth(authErr.message))
    }
  }

  await admin.from('perfis').update({ nome, email, telefone, ativo }).eq('id', id)

  // O que mudou, campo a campo — "quem trocou o telefone do supervisor?" é a pergunta que traz alguém aqui.
  const mudancas = [
    alvo.nome !== nome ? `nome: ${alvo.nome} → ${nome}` : '',
    String(alvo.cpf ?? '') !== cpf ? `CPF: ${formatCpf(String(alvo.cpf ?? ''))} → ${formatCpf(cpf)}` : '',
    String(alvo.telefone ?? '') !== telefone ? `telefone: ${alvo.telefone ?? '—'} → ${telefone || '—'}` : '',
    (alvo.ativo !== false) !== ativo ? (ativo ? 'reativado' : 'desativado') : '',
    novaSenha ? 'senha trocada' : '',
  ].filter(Boolean)
  auditar(perfil, 'SUPERVISOR_EDITADO', {
    campoAlterado: `Supervisor ${nome}`, organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
    valorNovo: curto(mudancas.join(' · ') || 'Salvo sem alterações', 300),
  })

  revalidatePath('/admin/usuarios')
  if (alvo.fornecedor_id) {
    const { data: fornecedor } = await admin.from('fornecedores').select('evento_id').eq('id', alvo.fornecedor_id).single()
    if (fornecedor) revalidatePath(`/admin/eventos/${fornecedor.evento_id}`)
  }
}

/**
 * Tira o supervisor de UM setor — e só dele.
 *
 * Antes, o botão de excluir do cartão do setor chamava `deletarUsuario`, que apaga o LOGIN inteiro: quem
 * supervisionava outros setores (até de outros eventos) perdia todos e a senha deixava de valer. Foi o que
 * aconteceu com o próprio Juan e com a Lucy (08/10/2026). A conta é de uma PESSOA e só some quando alguém a
 * exclui em Acessos ou a bloqueia; sair de um setor é apagar um vínculo.
 *
 *   - tira o vínculo daquele setor (`supervisor_setores`); os outros continuam;
 *   - se aquele era o setor aberto na tela dele, passa para outro dele (ou nenhum);
 *   - o crachá de supervisor daquele evento (um por CPF) acompanha: vai para outro setor dele no MESMO evento, e só
 *     é desativado quando ele não supervisiona mais nada ali;
 *   - se o supervisor era uma função EXTRA e acabaram os setores, a função sai — a conta e a função de base ficam.
 */
export async function removerSupervisorDoSetor(perfilId: string, fornecedorId: string): Promise<{ ok: true; restantes: number } | { error: string }> {
  return tirarSupervisorDoSetor(perfilId, fornecedorId)
}

/** O corpo de `removerSupervisorDoSetor`; `jaAutorizado` é quem chama já tendo conferido a permissão (ver `definirFuncaoNaEquipe`). */
async function tirarSupervisorDoSetor(perfilId: string, fornecedorId: string, jaAutorizado?: PerfilDaSessao): Promise<{ ok: true; restantes: number } | { error: string }> {
  try {
    const perfil = jaAutorizado ?? await getPerfil()
    if (!perfil) return { error: 'Sessão expirada. Entre de novo.' }

    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, nome, evento_id, eventos(organizacao_id)').eq('id', fornecedorId).maybeSingle()
    if (!setor) return { error: 'Setor não encontrado.' }
    const organizacaoId = ((setor.eventos as unknown as { organizacao_id?: string | null } | null)?.organizacao_id ?? null) as string | null
    const eventoId = setor.evento_id as string

    if (jaAutorizado) {
      // Conferido por quem chamou.
    } else if (podeGerenciarUsuarios(perfil)) {
      if (!ehMaster(perfil.role) && organizacaoId !== perfil.organizacao_id) return { error: 'Sem permissão sobre este setor.' }
    } else if (perfil.role === 'suporte') {
      if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
        return { error: 'Este evento não está no seu escopo de atendimento.' }
      }
    } else {
      return { error: 'Sem permissão.' }
    }

    const { data: alvo } = await supabaseAdmin.from('perfis').select('id, nome, cpf, role, fornecedor_id').eq('id', perfilId).maybeSingle()
    if (!alvo) return { error: 'Este acesso não existe mais.' }

    const { error: erroVinculo } = await supabaseAdmin
      .from('supervisor_setores').delete().eq('perfil_id', perfilId).eq('fornecedor_id', fornecedorId)
    if (erroVinculo) return { error: mensagemAmigavel(erroVinculo) }

    // O que sobrou dos vínculos dele (todos os eventos).
    const { data: sobraram } = await supabaseAdmin.from('supervisor_setores').select('fornecedor_id').eq('perfil_id', perfilId)
    const idsRestantes = (sobraram ?? []).map(v => v.fornecedor_id as string)
    const { data: setoresRestantes } = idsRestantes.length
      ? await supabaseAdmin.from('fornecedores').select('id, evento_id').in('id', idsRestantes)
      : { data: [] as { id: string; evento_id: string }[] }
    const restantes = (setoresRestantes ?? []) as { id: string; evento_id: string }[]
    const doMesmoEvento = restantes.find(r => r.evento_id === eventoId) ?? null

    // O setor aberto na tela dele era este? Passa pra outro (de preferência do mesmo evento) ou nenhum.
    if (alvo.fornecedor_id === fornecedorId) {
      await supabaseAdmin.from('perfis').update({ fornecedor_id: (doMesmoEvento ?? restantes[0])?.id ?? null }).eq('id', perfilId)
    }

    // O crachá de supervisor deste evento (um por CPF) acompanha o vínculo.
    try {
      const cpf = (alvo.cpf as string | null) ?? ''
      if (cpf) {
        const { data: crachas } = await supabaseAdmin
          .from('funcionarios').select('id, fornecedor_id, cargo, origem, fornecedores!inner(evento_id)')
          .eq('cpf', cpf).eq('fornecedor_id', fornecedorId).eq('fornecedores.evento_id', eventoId)
        for (const c of crachas ?? []) {
          if (c.origem !== 'supervisor') continue   // quem se cadastrou como equipe (pelo link/planilha) segue na equipe
          if (doMesmoEvento) {
            const { data: forn } = await supabaseAdmin.from('fornecedores').select('subevento_id').eq('id', doMesmoEvento.id).maybeSingle()
            await supabaseAdmin.from('funcionarios')
              .update({ fornecedor_id: doMesmoEvento.id, subevento_id: (forn as { subevento_id?: string | null } | null)?.subevento_id ?? null })
              .eq('id', c.id)
          } else {
            await supabaseAdmin.from('funcionarios').update({ ativo: false }).eq('id', c.id)
          }
        }
      }
    } catch (e) { console.error('[removerSupervisorDoSetor] crachá não ajustado', e) }

    // Sem nenhum setor e a função de supervisor era EXTRA: ela sai. A conta (e a função de base) ficam.
    if (!restantes.length && alvo.role !== 'supervisor') await removerFuncaoExtra(perfilId, 'supervisor')

    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_SUPERVISOR',
      campoAlterado: `Supervisor do fornecedor ${setor.nome}`,
      valorNovo: `${alvo.nome} — removido deste fornecedor (a conta e os outros ${restantes.length} fornecedor${restantes.length === 1 ? '' : 'es'} dele continuam)`,
      eventoId, organizacaoId: organizacaoId ?? undefined,
    }))
    revalidatePath('/admin/usuarios')
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true, restantes: restantes.length }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/** A função de hoje da pessoa NESTE setor — ver lib/funcao-na-equipe.ts. Sem tabela/consulta falha → colaborador. */
async function funcaoAtualNaEquipe(funcionarioId: string, fornecedorId: string, contaId: string | null): Promise<FuncaoNaEquipe> {
  if (contaId) {
    const { data } = await supabaseAdmin.from('supervisor_setores').select('perfil_id')
      .eq('perfil_id', contaId).eq('fornecedor_id', fornecedorId).limit(1)
    if (data?.length) return 'supervisor'
  }
  const { data: enc } = await supabaseAdmin.from('encarregados_setor').select('id')
    .eq('funcionario_id', funcionarioId).eq('fornecedor_id', fornecedorId).limit(1)
  return enc?.length ? 'encarregado' : 'colaborador'
}

/**
 * A função de hoje da pessoa no setor dela e se QUEM PERGUNTA pode mudá-la — pra ficha aberta por uma tela que não
 * calcula isso (a busca do evento, por exemplo). Mesma régua de `definirFuncaoNaEquipe`. `null` = sem acesso.
 */
export async function funcaoDaPessoaNaEquipe(funcionarioId: string): Promise<{ funcao: FuncaoNaEquipe; podeMudar: boolean } | null> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return null
    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('id, cpf, fornecedor_id, fornecedores(evento_id, eventos(organizacao_id))').eq('id', funcionarioId).maybeSingle()
    if (!func) return null
    const orgId = (func.fornecedores as unknown as { eventos?: { organizacao_id?: string | null } | null } | null)?.eventos?.organizacao_id ?? null
    const ehAdminDaOrg = ehMaster(perfil.role)
      || (podeGerenciarUsuarios(perfil) && !!orgId && orgId === perfil.organizacao_id)
    const doSetor = !ehAdminDaOrg && (await meusSetores(perfil)).some(s => s.id === func.fornecedor_id)
    if (!ehAdminDaOrg && !doSetor && orgId !== perfil.organizacao_id && perfil.role !== 'suporte') return null
    const cpf = normalizarCpf((func.cpf as string | null) ?? '')
    const { data: conta } = cpf.length === 11
      ? await supabaseAdmin.from('perfis').select('id').eq('cpf', cpf).maybeSingle()
      : { data: null }
    const funcao = await funcaoAtualNaEquipe(funcionarioId, func.fornecedor_id as string, (conta?.id as string | undefined) ?? null)
    return { funcao, podeMudar: ehAdminDaOrg || doSetor }
  } catch {
    return null
  }
}

/**
 * A FUNÇÃO da pessoa na ficha da equipe: Colaborador, Encarregado ou Supervisor (pedido do Juan, 09/10/2026). Mudar
 * a função muda o ACESSO na hora, e a pessoa nunca sai da equipe — continua com o QR, as batidas e o pagamento.
 *
 *   * Supervisor  → ganha o acesso de supervisor deste setor e sai liberado em TODOS os dias do evento.
 *   * Encarregado → ganha a consulta da equipe deste setor (lib/actions-encarregado.ts).
 *   * Colaborador → só o QR. Quem deixa de ser supervisor/Encarregado perde o acesso daquele setor; sem nenhum
 *     outro setor, a conta é desativada (volta quando alguém der a função de novo — a senha continua a mesma).
 *
 * O LINK VAI UMA VEZ POR EVENTO e por tipo: quem já recebeu o de supervisor (ou o de Encarregado) neste evento —
 * por outro setor, ou porque saiu e voltou — não recebe outro (`jaRecebeuMensagemNoEvento`).
 *
 * Quem pode: master, administrador da organização e o supervisor DESTE setor. Tudo que pode recusar é conferido
 * ANTES de mexer em qualquer acesso, pra não sobrar meio-termo (perdeu a função velha e não ganhou a nova).
 */
export async function definirFuncaoNaEquipe(
  funcionarioId: string, fornecedorId: string, eventoId: string, funcao: FuncaoNaEquipe,
): Promise<{ ok: true; mensagem: string } | { erro: string }> {
  try {
    if (!ehFuncaoNaEquipe(funcao)) return { erro: 'Função inválida.' }
    const perfil = await getPerfil()
    if (!perfil) return { erro: 'Sessão expirada. Entre de novo.' }

    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, nome, evento_id, eventos(organizacao_id, nome)').eq('id', fornecedorId).maybeSingle()
    if (!setor || setor.evento_id !== eventoId) return { erro: 'Setor não encontrado neste evento.' }
    const ev = setor.eventos as unknown as { organizacao_id?: string | null; nome?: string } | null
    const organizacaoId = ev?.organizacao_id ?? null

    const ehAdminDaOrg = ehMaster(perfil.role)
      || (podeGerenciarUsuarios(perfil) && !!organizacaoId && organizacaoId === perfil.organizacao_id)
    const ehSupervisorDoSetor = !ehAdminDaOrg && (await meusSetores(perfil)).some(s => s.id === fornecedorId)
    if (!ehAdminDaOrg && !ehSupervisorDoSetor) {
      return { erro: 'Só o supervisor do setor, o administrador ou o master mudam a função.' }
    }

    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, origem, ativo, status_credenciamento, descredenciado_em, fornecedor_id')
      .eq('id', funcionarioId).maybeSingle()
    if (!func || func.fornecedor_id !== fornecedorId) return { erro: 'Esta pessoa não é desta equipe.' }
    const nome = (func.nome as string).trim()
    const primeiro = nome.split(/\s+/)[0]
    const cpf = normalizarCpf((func.cpf as string | null) ?? '')
    const telefone = ((func.telefone as string | null) ?? '').replace(/\D/g, '')
    if (cpf.length === 11 && cpf === normalizarCpf((perfil.cpf as string | null) ?? '') && !ehMaster(perfil.role)) {
      return { erro: 'Você não pode mudar a sua própria função.' }
    }

    const { data: contaLida } = cpf.length === 11
      ? await supabaseAdmin.from('perfis').select('id, role, ativo').eq('cpf', cpf).maybeSingle()
      : { data: null }
    const conta = contaLida as { id: string; role: string; ativo: boolean | null } | null
    const atual = await funcaoAtualNaEquipe(funcionarioId, fornecedorId, conta?.id ?? null)
    if (atual === funcao) return { ok: true, mensagem: `${primeiro} já é ${rotuloDaFuncao(funcao)} deste setor.` }

    // ── Conferências (nada foi mexido ainda) ──
    if (funcao !== 'colaborador') {
      if (func.ativo === false || func.descredenciado_em) return { erro: 'Esta pessoa não está ativa na equipe. Ative antes de mudar a função.' }
      if (!validarCpf(cpf)) return { erro: 'O CPF desta pessoa está inválido. Corrija antes de mudar a função.' }
      if (telefone.length < 10 || telefone.length > 13) {
        return { erro: 'Esta pessoa não tem um WhatsApp válido no cadastro. É por ele que o acesso é enviado.' }
      }
      const combina = !conta || conta.role === 'supervisor' || conta.role === 'encarregado'
        || (funcao === 'supervisor' && conta.role === 'master') || podeReceberFuncaoExtra(conta.role)
      if (!combina) return { erro: MSG_FUNCAO_NAO_COMBINA }
      if (conta && conta.ativo === false && conta.role !== 'supervisor' && conta.role !== 'encarregado') {
        return { erro: 'O acesso desta pessoa está bloqueado em Acessos. Fale com o master.' }
      }
    }
    if (funcao === 'encarregado') {
      if (func.status_credenciamento !== 'aprovado') return { erro: 'O credenciamento desta pessoa ainda não foi aprovado.' }
      if (!(await obterFuncionalidadesDoEvento(eventoId)).encarregadosHabilitado) return { erro: MSG_FUNCIONALIDADE_DESLIGADA }
    }

    // ── 1. Sai da função de hoje NESTE setor (continua na equipe) ──
    let perdeuAcesso = false
    if (atual === 'supervisor' && conta) {
      // O crachá nascido de "tornar supervisor" iria embora junto com o vínculo (ver `tirarSupervisorDoSetor`): vira da equipe.
      if (func.origem === 'supervisor') await supabaseAdmin.from('funcionarios').update({ origem: 'equipe' }).eq('id', funcionarioId)
      const r = await tirarSupervisorDoSetor(conta.id, fornecedorId, perfil)
      if ('error' in r) return { erro: r.error }
      if (r.restantes === 0 && conta.role === 'supervisor' && funcao === 'colaborador') {
        // Sem setor nenhum, não entra mais. Quem ainda tem outra função (extra) fica com ela.
        const { count: extras } = await supabaseAdmin.from('perfil_funcoes').select('id', { count: 'exact', head: true }).eq('perfil_id', conta.id)
        if (!extras) {
          await supabaseAdmin.from('perfis').update({ ativo: false }).eq('id', conta.id)
          perdeuAcesso = true
        }
      }
    }
    if (atual === 'encarregado') {
      const r = await alterarEncarregadoNoSetor(funcionarioId, eventoId, fornecedorId, false)
      if ('erro' in r) return { erro: r.erro }
      if (conta?.role === 'encarregado' && funcao === 'colaborador') {
        const { count } = await supabaseAdmin.from('encarregados_setor').select('id', { count: 'exact', head: true }).eq('perfil_id', conta.id)
        if (!count) perdeuAcesso = true   // `salvarEncarregado` já desativou a conta
      }
    }

    // ── 2. Entra na função nova ──
    /*
     * Conta que só existia pela função VELHA (nenhum setor sobrando nela — inclusive quem foi rebaixado a colaborador
     * antes e ficou com a conta desativada) troca de tipo, em vez de ganhar a nova como função extra numa conta
     * desativada. A senha continua a mesma.
     */
    if (conta && funcao === 'supervisor' && conta.role === 'encarregado') {
      const { count } = await supabaseAdmin.from('encarregados_setor').select('id', { count: 'exact', head: true }).eq('perfil_id', conta.id)
      if (!count) {
        await supabaseAdmin.from('perfis').update({ role: 'supervisor', ativo: true }).eq('id', conta.id)
        await removerFuncaoExtra(conta.id, 'supervisor')
        conta.role = 'supervisor'
      }
    }
    if (conta && funcao === 'encarregado' && conta.role === 'supervisor') {
      const { count } = await supabaseAdmin.from('supervisor_setores').select('perfil_id', { count: 'exact', head: true }).eq('perfil_id', conta.id)
      if (!count) {
        // Sem organização nem setor ativo, como toda conta de Encarregado (ver lib/encarregado.ts); `salvarEncarregado` reativa.
        await supabaseAdmin.from('perfis').update({ role: 'encarregado', organizacao_id: null, fornecedor_id: null }).eq('id', conta.id)
        await removerFuncaoExtra(conta.id, 'encarregado')
        conta.role = 'encarregado'
      }
    }

    let aviso = ''
    if (funcao === 'supervisor') {
      const dados = new FormData()
      dados.set('nome', nome)
      dados.set('cpf', cpf)
      dados.set('telefone', telefone)
      dados.set('ativo', 'true')
      let r: Awaited<ReturnType<typeof criarSupervisorOuLanca>>
      try {
        r = await criarSupervisorOuLanca(fornecedorId, eventoId, dados, perfil)
      } catch (e) {
        return { erro: `${mensagemAmigavel(e)}${atual !== 'colaborador' ? ` ${primeiro} ficou como Colaborador.` : ''}` }
      }
      if (r && typeof r === 'object' && 'error' in r) return { erro: String((r as { error: unknown }).error) }
      const res = r as { novo?: boolean; avisado?: boolean }
      aviso = res.novo || res.avisado
        ? 'Recebeu o acesso pelo WhatsApp.'
        : 'Não reenviamos o link: já tinha recebido neste evento.'

      // Supervisor: todos os dias do evento — ver `pessoaEhSupervisor`.
      if (await eventoUsaEscalaPorDia(eventoId)) {
        const disponiveis = (await diasDaEscalaDoEvento(eventoId)).map(d => d.data)
        if (disponiveis.length) {
          const g = await gravarEscalaAprovada({ funcionarioId, eventoId, aprovados: disponiveis, perfilId: perfil.id })
          if (g.ok) after(() => sincronizarAgendamentos(eventoId, { funcionarioId }).catch(console.error))
        }
      }
    }
    if (funcao === 'encarregado') {
      const r = await alterarEncarregadoNoSetor(funcionarioId, eventoId, fornecedorId, true)
      if ('erro' in r) return { erro: `${r.erro}${atual !== 'colaborador' ? ` ${primeiro} ficou como Colaborador.` : ''}` }
      aviso = !r.primeiroAcesso || r.jaTinhaLink
        ? 'Não reenviamos o link: já tinha recebido neste evento.'
        : r.mensagemEnviada
          ? 'Recebeu o acesso pelo WhatsApp.'
          : 'O WhatsApp não saiu: peça para tocar em "Esqueci a senha" no login, com o CPF.'
    }

    // O cargo acompanha só quando está vazio ou é o nome de uma função — "Bartender" não é sobrescrito.
    if (cargoAcompanhaFuncao(func.cargo as string | null)) {
      await supabaseAdmin.from('funcionarios').update({ cargo: rotuloDaFuncao(funcao) }).eq('id', funcionarioId)
    }

    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_SETOR', campoAlterado: 'função na equipe',
      valorAnterior: `${nome}: ${rotuloDaFuncao(atual)}`, valorNovo: `${nome}: ${rotuloDaFuncao(funcao)} (${setor.nome})`,
      funcionarioId, eventoId, organizacaoId: organizacaoId ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}`)
    revalidatePath('/admin/encarregados')
    revalidatePath('/admin/usuarios')

    const mensagem = funcao === 'supervisor'
      ? `${primeiro} agora é Supervisor deste setor, liberado em todos os dias. ${aviso}`
      : funcao === 'encarregado'
        ? `${primeiro} agora é Encarregado deste setor. ${aviso}`
        : `${primeiro} agora é Colaborador: só o QR Code. ${perdeuAcesso ? 'Não entra mais no sistema.' : `Perdeu o acesso de ${rotuloDaFuncao(atual)} deste setor.`} Continua na equipe; os dias você ajusta abaixo.`
    return { ok: true, mensagem }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Tira SÓ a função de operador de portão de quem a recebeu como função extra (um supervisor ou
 * Encarregado que também opera o portão). A conta, o login e a função de base ficam intactos —
 * `deletarUsuario` apagaria a pessoa inteira, que é o que NÃO se quer aqui.
 */
export async function removerFuncaoOperador(perfilId: string, eventoId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const perfil = await getPerfil()
    if (!podeGerenciarUsuarios(perfil)) return { error: 'Sem permissão.' }
    // A organização vem do EVENTO da tela: o mesmo CPF pode ser Gestor em duas organizações, e só a deste evento sai.
    const { data: evento } = await supabaseAdmin.from('eventos').select('organizacao_id').eq('id', eventoId).maybeSingle()
    if (!evento?.organizacao_id) return { error: 'Evento não encontrado.' }
    const { data: funcao } = await supabaseAdmin
      .from('perfil_funcoes').select('organizacao_id').eq('perfil_id', perfilId).eq('role', 'operador_portao')
      .eq('organizacao_id', evento.organizacao_id as string).maybeSingle()
    if (!funcao) return { error: 'Esta pessoa não tem a função de operador como extra nesta organização.' }
    if (!ehMaster(perfil!.role) && funcao.organizacao_id !== perfil!.organizacao_id) return { error: 'Sem permissão sobre este acesso.' }
    const { data: alvo } = await supabaseAdmin.from('perfis').select('nome').eq('id', perfilId).maybeSingle()
    await removerFuncaoExtra(perfilId, 'operador_portao', funcao.organizacao_id as string)
    after(() => registrarAuditoria({
      perfil: perfil!, acao: 'ALTERACAO_OPERADOR',
      campoAlterado: 'Função de operador de portão',
      valorNovo: `${alvo?.nome ?? 'Pessoa'} — função de operador retirada (o acesso dela continua)`,
      organizacaoId: (funcao.organizacao_id as string | null) ?? undefined,
    }))
    revalidatePath('/admin/usuarios')
    revalidatePath('/admin/criar-porteiro')
    return { ok: true }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

export async function deletarUsuario(id: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')
  if (perfil.id === id) throw new Error('Você não pode excluir a si mesmo')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('role, organizacao_id, nome, cpf, email').eq('id', id).single()
  if (!alvo) throw new Error('Este acesso não existe mais.')

  /*
   * Exceção pontual: admin também exclui operador de portão (pedido do
   * Juan, 02/10/2026 — é o acesso mais simples do sistema, sem dado
   * sensível, e o admin é quem contrata/demite essas pessoas no dia a dia).
   * Qualquer outro tipo de acesso (supervisor, outro admin...) continua
   * exigindo master — ver `podeExcluir`.
   */
  const podeViaOperadorPortao = alvo.role === 'operador_portao' && podeExcluirOperadorPortao(perfil.role)
  if (!podeViaOperadorPortao && !podeExcluir(perfil)) {
    throw new Error('Apenas o master pode excluir acessos. Você pode desativar o usuário, que bloqueia o login sem perder o histórico.')
  }

  // Admin só pode excluir membros da própria organização
  if (!ehMaster(perfil.role) && alvo.organizacao_id !== perfil.organizacao_id) {
    throw new Error('Sem permissão sobre este usuário')
  }

  await admin.auth.admin.deleteUser(id)
  await admin.from('perfis').delete().eq('id', id)
  auditar(perfil, 'USUARIO_EXCLUIDO', {
    campoAlterado: `Acesso (${ROLE_LABELS[alvo.role as Role] ?? alvo.role})`, organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
    valorAnterior: curto(`${alvo.nome}${alvo.cpf ? ` — CPF ${formatCpf(String(alvo.cpf))}` : ` — ${alvo.email ?? ''}`}`),
  })
  revalidatePath('/admin/usuarios')
}

// ─── Acesso: papel, escopo, funções ligadas ─────────────────────────────────

/**
 * Lê a aba "Funções" do formulário de acesso e devolve o mapa de overrides
 * PRONTO pra gravar em `perfis.permissoes_usuario`.
 *
 * Só entra o que DIFERE do padrão do papel: se o toggle está igual ao que a
 * pessoa já teria por `role`, a chave nem vai — assim o override some sozinho
 * quando a régua do código muda, e `{}` continua significando "comportamento
 * padrão". Ignora chave desconhecida (o form é do cliente).
 */
function permissoesUsuarioDoForm(formData: FormData, role: string): Record<string, boolean> {
  const bruto = (formData.get('permissoes_usuario') as string | null)?.trim()
  if (!bruto) return {}
  let cru: unknown
  try { cru = JSON.parse(bruto) } catch { return {} }
  if (!cru || typeof cru !== 'object') return {}

  const oferecidas = capacidadesDoPapel(role)
  const mapa: Record<string, boolean> = {}
  for (const cap of oferecidas) {
    const v = (cru as Record<string, unknown>)[cap.chave]
    if (typeof v === 'boolean' && v !== cap.padraoAtual) mapa[cap.chave] = v
  }
  return mapa
}

/**
 * Adiciona MAIS UM admin a uma organização que já existe.
 *
 * Diferente de `criarOrganizacao`, que cria a org E o primeiro admin junto:
 * aqui a org já está lá. Master escolhe qual; admin não-master só adiciona à
 * própria. Admin entra por E-MAIL + senha (não por CPF, como os papéis de
 * operação).
 */
export async function adicionarAdmin(formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para criar acessos.')

  const admin = getAdminSupabase()

  let organizacaoId = perfil!.organizacao_id as string | null
  if (ehMaster(perfil!.role)) {
    organizacaoId = ((formData.get('organizacao_id') as string) ?? '').trim() || null
    if (!organizacaoId) throw new Error('Escolha a organização deste admin.')
  }
  if (!organizacaoId) throw new Error('Seu acesso não está vinculado a uma organização.')

  const { data: org } = await admin.from('organizacoes').select('id, nome, ativo').eq('id', organizacaoId).single()
  if (!org) throw new Error('Organização não encontrada.')

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const email = ((formData.get('email') as string) ?? '').trim().toLowerCase()
  const senha = ((formData.get('senha') as string) ?? '').trim()
  const ativo = formData.get('ativo') !== 'false'
  if (!nome) throw new Error('Informe o nome.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Informe um e-mail válido — é por ele que o admin entra.')
  if (senha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.')

  const { data: jaTem } = await admin.from('perfis').select('id').eq('email', email).maybeSingle()
  if (jaTem) throw new Error(`Já existe um acesso com o e-mail ${email}.`)

  const { data: user, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
  if (error) throw new Error(mensagemAuth(error.message))

  const { error: erroPerfil } = await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    role: 'admin',
    organizacao_id: organizacaoId,
    ativo,
    permissoes_usuario: permissoesUsuarioDoForm(formData, 'admin'),
  }])
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    console.error('[adicionarAdmin] falha ao inserir perfil', { organizacaoId, erro: erroPerfil })
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Admin da organização ${org.nome}`,
    valorNovo: `${nome} — ${email} (acesso novo)`,
    organizacaoId,
  }))

  revalidatePath('/admin/usuarios')
  return { ok: true as const }
}

/** Organizações ativas, pro seletor de "mover de organização" (só master vê). */
export async function listarOrganizacoesAtivas(): Promise<{ id: string; nome: string }[]> {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) return []
  const { data } = await supabaseAdmin.from('organizacoes').select('id, nome').eq('ativo', true).order('nome')
  return (data ?? []) as { id: string; nome: string }[]
}

/**
 * Move um admin pra outra organização — conserto pra quando a organização
 * errada foi escolhida na criação (achado ao vivo, 03/10/2026: admin criado
 * apontando pra "Homologação" em vez da organização certa do cliente, e até
 * agora não existia como editar isso depois de criado, só excluir e
 * recriar).
 *
 * Só ADMIN por enquanto — supervisor/operador/suporte têm a organização
 * DERIVADA de outro vínculo (fornecedor, escopo de suporte); mover só o
 * campo `organizacao_id` deles deixaria esse vínculo inconsistente. Se
 * precisar mover um desses outros papéis, é outro problema, com outro
 * conserto.
 */
export async function moverDeOrganizacao(perfilId: string, novaOrganizacaoId: string) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Só o master move acessos entre organizações.')

  const { data: alvo } = await supabaseAdmin.from('perfis').select('id, nome, role, organizacao_id').eq('id', perfilId).single()
  if (!alvo) throw new Error('Acesso não encontrado.')
  if (alvo.role !== 'admin') throw new Error('Por enquanto, só dá pra mover acesso do tipo admin entre organizações.')

  const { data: org } = await supabaseAdmin.from('organizacoes').select('id, nome').eq('id', novaOrganizacaoId).single()
  if (!org) throw new Error('Organização não encontrada.')

  const organizacaoAnteriorId = alvo.organizacao_id as string | null
  const { data: orgAnterior } = organizacaoAnteriorId
    ? await supabaseAdmin.from('organizacoes').select('nome').eq('id', organizacaoAnteriorId).maybeSingle()
    : { data: null }

  const { error } = await supabaseAdmin.from('perfis').update({ organizacao_id: novaOrganizacaoId }).eq('id', perfilId)
  if (error) throw new Error(mensagemAmigavel(error))

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Organização de ${alvo.nome}`,
    valorAnterior: (orgAnterior as { nome?: string } | null)?.nome ?? 'nenhuma',
    valorNovo: org.nome as string,
  }))

  revalidatePath('/admin/usuarios')
  return { ok: true as const, organizacaoNome: org.nome as string }
}

/**
 * Liga/desliga um acesso (`perfis.ativo`). Inativo bloqueia o login sem perder
 * o histórico — ver `getPerfil`, que trata `ativo = false` como não-logado.
 */
export async function alternarAtivoUsuario(id: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para alterar acessos.')
  if (perfil!.id === id) throw new Error('Você não pode inativar o próprio acesso.')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('id, nome, ativo, role, organizacao_id').eq('id', id).single()
  if (!alvo) throw new Error('Este acesso não existe mais.')
  if (alvo.role === 'master') throw new Error('O acesso master não é gerenciado por aqui.')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este acesso.')
  }

  const novo = !(alvo.ativo !== false)
  // Ligar/desligar na mão desfaz o "é do evento": reativar o evento não mexe
  // mais neste acesso.
  const patch: Record<string, unknown> = { ativo: novo }
  if (novo) patch.inativado_em_evento = null
  const { error } = await admin.from('perfis').update(patch).eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Status do acesso de ${alvo.nome}`,
    valorNovo: novo ? 'Ativo' : 'Inativo',
    organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
  }))

  revalidatePath('/admin/usuarios')
  return { ok: true as const, ativo: novo }
}

/**
 * Edita um acesso já existente: nome, telefone, status e as funções ligadas.
 * NÃO troca o papel nem o escopo (setor/evento) — pra isso, inativa e cria de
 * novo. Muda só o que não dispara recadastro de vínculo.
 */
export async function editarUsuario(id: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil)) throw new Error('Sem permissão para editar acessos.')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin
    .from('perfis').select('id, nome, role, organizacao_id, ativo').eq('id', id).single()
  if (!alvo) throw new Error('Este acesso não existe mais.')
  if (alvo.role === 'master') throw new Error('O acesso master não é editado por aqui.')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este acesso.')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  if (!nome) throw new Error('O nome não pode ficar em branco.')
  const telefoneBruto = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const patch: Record<string, unknown> = {
    nome,
    ativo: formData.get('ativo') !== 'false',
    permissoes_usuario: permissoesUsuarioDoForm(formData, alvo.role as string),
  }
  // Telefone é opcional no admin (ele entra por e-mail); pros outros, se veio,
  // tem que ser válido.
  if (telefoneBruto) {
    if (telefoneBruto.length < 10 || telefoneBruto.length > 13) {
      throw new Error('Telefone inválido. Use DDD + número.')
    }
    patch.telefone = telefoneBruto
  } else if (alvo.role !== 'admin') {
    patch.telefone = null
  }

  // Email de contato — só faz sentido pro supervisor (o lembrete de
  // conferência). `null` limpa; ausente não mexe.
  if (alvo.role === 'supervisor' && formData.has('email_contato')) {
    const e = ((formData.get('email_contato') as string) || '').trim().toLowerCase()
    patch.email_contato = e || null
  }

  const { error } = await admin.from('perfis').update(patch).eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Acesso de ${alvo.nome}`,
    valorNovo: `Editado (nome/telefone/status/funções)`,
    organizacaoId: (alvo.organizacao_id as string | null) ?? undefined,
  }))

  revalidatePath('/admin/usuarios')
  return { ok: true as const }
}

// ─── Eventos ────────────────────────────────────────────────────────────────

export async function criarEvento(formData: FormData) {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil)) throw new Error('Sem permissão para criar eventos')

  const admin = getAdminSupabase()

  /*
   * De quem é o evento.
   *
   * O admin cria sempre para a própria organização. O MASTER não pertence a
   * nenhuma (organizacao_id nulo), então antes o evento nascia órfão — sem
   * organização, invisível para qualquer admin e com supervisores criados sem
   * vínculo. Agora ele escolhe no formulário, e a escolha é obrigatória.
   */
  let organizacaoId = perfil.organizacao_id
  if (ehMaster(perfil.role)) {
    const escolhida = (formData.get('organizacao_id') as string | null)?.trim()
    if (!escolhida) throw new Error('Escolha a organização dona deste evento.')
    const { data: org } = await admin.from('organizacoes').select('id, ativo').eq('id', escolhida).single()
    if (!org) throw new Error('Organização não encontrada.')
    if (!org.ativo) throw new Error('Esta organização está suspensa. Reative-a antes de criar eventos.')
    organizacaoId = escolhida
  }

  let driveFolder: string | null = perfil.drive_folder_id ?? null

  // Admin: respeita o limite de eventos e o status da organização
  if (!ehMaster(perfil.role) && organizacaoId) {
    const [{ count }, { data: org }] = await Promise.all([
      admin.from('eventos').select('id', { count: 'exact', head: true }).eq('organizacao_id', organizacaoId),
      admin.from('organizacoes').select('limite_eventos, ativo, drive_folder_id').eq('id', organizacaoId).single(),
    ])
    if (org && !org.ativo) throw new Error('Organização suspensa. Fale com o administrador da plataforma.')
    if (org && (count ?? 0) >= org.limite_eventos) {
      throw new Error(`Limite de eventos atingido (${org.limite_eventos}). Fale com o administrador da plataforma para liberar mais.`)
    }
    driveFolder = org?.drive_folder_id ?? driveFolder
  }

  const nome = nomeEmMaiusculo(formData.get('nome') as string)
  const data = {
    nome,
    descricao: (formData.get('descricao') as string) || null,
    data_inicio: inputParaISO(formData.get('data_inicio') as string),
    data_fim: inputParaISO(formData.get('data_fim') as string),
    local: (formData.get('local') as string) || null,
    cliente_id: perfil.id,
    organizacao_id: organizacaoId,
    ...janelasDoForm(formData),
    ...preEventoDoForm(formData),
  }

  exigirHorariosCoerentes(data)

  const db = supabaseAdmin
  const { data: novo, error } = await db.from('eventos').insert([data]).select('id').single()
  if (error) throw new Error('Não foi possível criar o evento. Confira os dados e tente de novo.')

  /*
   * "Este evento possui subeventos" (Vital, 01/10/2026) — já nasce ligado
   * em vez de precisar de um 2º passo em Editar evento. Mesmo padrão
   * tolerante de `editarEvento`: sentinela `tem_subeventos_presente` porque
   * checkbox desmarcado não manda nada no FormData, e o campo só existe na
   * tela quando a organização (escolhida ou fixa) já liberou o recurso.
   */
  if (formData.has('tem_subeventos_presente')) {
    const temSubeventos = formData.get('tem_subeventos') === 'on'
    const { error: erroSubeventos } = await db.from('eventos')
      .update({ tem_subeventos: temSubeventos })
      .eq('id', novo.id)
    if (erroSubeventos) console.error('[criarEvento] tem_subeventos não gravado (migração pendente?)', erroSubeventos.message)
    if (temSubeventos) await garantirSubeventosHabilitadoNaOrg(organizacaoId)
  }

  await gravarMetodoIdentificacao(novo.id, formData)

  // Antes da planilha e de qualquer outra coisa: sem o dia principal, o evento
  // nasce inutilizável — ninguém consegue bater ponto nele.
  await garantirDiaPrincipal(novo.id, data.data_inicio, data.data_fim)

  // O evento tem mais de uma noite principal? (festival de 2+ dias)
  const diasExtras = diasPrincipaisExtrasDoForm(formData)
  if (diasExtras.length) await salvarDiasPrincipaisExtras(novo.id, diasExtras)

  // Cria planilha na pasta da organização no Drive
  try {
    const spreadsheetId = await criarPlanilhaEvento(nome, driveFolder)
    await db.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', novo.id)
  } catch (e) {
    console.error('Erro ao criar planilha:', e)
  }

  after(() => sincronizarAgendamentos(novo.id).catch(console.error))
  auditar(perfil, 'EVENTO_CRIADO', {
    campoAlterado: 'Evento', eventoId: novo.id as string, organizacaoId: organizacaoId ?? undefined,
    valorNovo: curto(`${nome} · ${formatarBR(data.data_inicio, 'completo')} a ${formatarBR(data.data_fim, 'completo')}${data.local ? ` · ${data.local}` : ''}`),
  })
  redirect(`/admin/eventos/${novo.id}`)
}

export async function editarEvento(id: string, formData: FormData) {
  const perfil = await exigirEventoDaOrg(id)
  const db = supabaseAdmin
  const data = {
    nome: nomeEmMaiusculo(formData.get('nome') as string),
    descricao: (formData.get('descricao') as string) || null,
    data_inicio: inputParaISO(formData.get('data_inicio') as string),
    data_fim: inputParaISO(formData.get('data_fim') as string),
    local: (formData.get('local') as string) || null,
    ...janelasDoForm(formData),
    ...preEventoDoForm(formData),
  }
  exigirHorariosCoerentes(data)

  const { data: antesDoEvento } = await db.from('eventos').select('nome, data_inicio, data_fim, local').eq('id', id).maybeSingle()
  await db.from('eventos').update(data).eq('id', id)
  const resumoEvento = (e: { nome?: unknown; data_inicio?: unknown; data_fim?: unknown; local?: unknown } | null) => e
    ? curto(`${e.nome} · ${formatarBR(e.data_inicio as string, 'completo')} a ${formatarBR(e.data_fim as string, 'completo')}${e.local ? ` · ${e.local}` : ''}`)
    : null
  auditar(perfil, 'EVENTO_EDITADO', {
    campoAlterado: 'Evento (dados, horários e janelas)', eventoId: id,
    valorAnterior: resumoEvento(antesDoEvento), valorNovo: resumoEvento(data),
  })

  /*
   * Horário do aviso do dia (WhatsApp) — coluna nova
   * (supabase/upgrade-hora-aviso-dia-evento.sql). Update à parte e
   * tolerante, mesmo padrão de `exige_meio` em criarFornecedor: sem a
   * migração, o resto do evento salva normal e só este campo fica de fora.
   * Antes do `sincronizarAgendamentos` abaixo, pra fila já nascer no
   * horário novo.
   */
  if (formData.has('hora_aviso_dia_evento')) {
    const hora = ((formData.get('hora_aviso_dia_evento') as string) || '').trim()
    const { error: erroHora } = await db.from('eventos')
      .update({ hora_aviso_dia_evento: /^\d{2}:\d{2}$/.test(hora) ? hora : null })
      .eq('id', id)
    if (erroHora) console.error('[editarEvento] hora_aviso_dia_evento não gravado (migração pendente?)', erroHora.message)
  }

  /*
   * Aviso de uniforme/identificação (Vital, item 4, 30/09/2026) — coluna
   * nova, à parte e tolerante, mesmo cuidado de `hora_aviso_dia_evento`
   * acima. Só existe no form quando a organização ligou a funcionalidade;
   * sem o campo no form, `has()` é falso e nada é sobrescrito.
   */
  if (formData.has('aviso_uniforme_texto')) {
    const texto = ((formData.get('aviso_uniforme_texto') as string) || '').trim()
    const { error: erroAviso } = await db.from('eventos')
      .update({ aviso_uniforme_texto: texto || null })
      .eq('id', id)
    if (erroAviso) console.error('[editarEvento] aviso_uniforme_texto não gravado (migração pendente?)', erroAviso.message)
  }

  /*
   * "Este evento possui subeventos" (correção 30/09/2026, teste ao vivo do
   * Juan) — coluna nova, à parte e tolerante. Checkbox desmarcado não manda
   * nada no FormData (mesmo problema de sempre); o sentinela
   * `tem_subeventos_presente` distingue isso de "campo nem existe na tela"
   * (não existe mais essa 2ª hipótese desde 01/10/2026 — o campo agora é
   * sempre visível — mas o sentinela não atrapalha, só deixou de ser
   * estritamente necessário). Marcar ATIVA o recurso pra organização
   * inteira também (`garantirSubeventosHabilitadoNaOrg`) — não é mais
   * pré-requisito ligar antes em Configurações.
   */
  if (formData.has('tem_subeventos_presente')) {
    const temSubeventos = formData.get('tem_subeventos') === 'on'
    const { error: erroSubeventos } = await db.from('eventos')
      .update({ tem_subeventos: temSubeventos })
      .eq('id', id)
    if (erroSubeventos) console.error('[editarEvento] tem_subeventos não gravado (migração pendente?)', erroSubeventos.message)
    if (temSubeventos) {
      const { data: eventoOrg } = await db.from('eventos').select('organizacao_id').eq('id', id).maybeSingle()
      await garantirSubeventosHabilitadoNaOrg((eventoOrg as { organizacao_id?: string | null } | null)?.organizacao_id ?? null)
    }
  }

  /*
   * Tutorial guiado por evento (supabase/upgrade-tutorial-por-evento.sql) — nasce ligado; à parte e tolerante,
   * mesmo cuidado de `tem_subeventos` acima.
   */
  if (formData.has('tutorial_habilitado_presente')) {
    const { error: erroTutorial } = await db.from('eventos')
      .update({ tutorial_habilitado: formData.get('tutorial_habilitado') === 'on' })
      .eq('id', id)
    if (erroTutorial) console.error('[editarEvento] tutorial_habilitado não gravado (migração pendente?)', erroTutorial.message)
  }

  /*
   * Método de identificação (QR / Biometria) — só o master troca (pedido do
   * Juan, 02/10/2026): admin não deve poder ligar biometria sozinho no
   * próprio evento. Trava aqui também, não só escondendo o campo na tela —
   * uma Server Action é alcançável por POST direto, sem passar pela UI.
   */
  if (ehMaster(perfil.role)) {
    await gravarMetodoIdentificacao(id, formData)
  }


  await garantirDiaPrincipal(id, data.data_inicio, data.data_fim)
  after(() => sincronizarAgendamentos(id).catch(console.error))
  revalidatePath(`/admin/eventos/${id}`)
  redirect(`/admin/eventos/${id}`)
}

export async function toggleAtivoEvento(id: string, ativo: boolean) {
  const perfil = await exigirEventoDaOrg(id)
  const db = supabaseAdmin
  await db.from('eventos').update({ ativo: !ativo }).eq('id', id)

  // Encerrar (ativo → false) inativa os acessos criados PARA este evento;
  // reativar religa exatamente quem este evento inativou. Ver
  // supabase/upgrade-evento-encerrado-inativa-acesso.sql.
  try {
    if (ativo) await inativarAcessosDoEvento(id)
    else await reativarAcessosDoEvento(id)
  } catch (e) {
    // A coluna pode não ter sido migrada ainda — o encerramento do evento em
    // si não pode falhar por causa disso.
    console.error('[toggleAtivoEvento] acessos do evento não foram atualizados', {
      eventoId: id, erro: e instanceof Error ? e.message : e,
    })
  }

  after(() => registrarAuditoria({
    perfil: perfil!,
    acao: 'ALTERACAO_EVENTO',
    campoAlterado: 'Status do evento',
    valorNovo: ativo ? 'Encerrado' : 'Reativado',
    eventoId: id,
  }))

  revalidatePath(`/admin/eventos/${id}`)
  revalidatePath('/admin/eventos')
  revalidatePath('/admin/usuarios')
  revalidatePath('/admin')
}

/**
 * Quais acessos são "deste evento": suporte cujo escopo é SÓ este evento
 * (nenhuma organização inteira, nenhum outro evento). Operador de portão
 * fica de fora — é da organização.
 *
 * Supervisor SAIU daqui em 02/10/2026 (pedido do Juan, "Meus eventos"):
 * encerrar um evento não derruba mais o login dele — o evento vira "passado"
 * na tela `/admin/meus-eventos`, e `meusSetores`/`eventosQuePossoAbrir` já
 * devolvem o histórico inteiro sozinhos (via `supervisor_setores`, que nunca
 * é apagado). Inativar a CONTA do supervisor junto seria perder o próprio
 * acesso que a nova tela existe para mostrar.
 */
async function acessosDoEvento(eventoId: string): Promise<string[]> {
  const db = supabaseAdmin

  const alvos = new Set<string>()

  // Suporte: candidatos = quem tem escopo neste evento; entra só quem NÃO tem
  // nenhum outro escopo (org ou outro evento).
  const { data: comEsteEvento } = await db
    .from('suporte_escopo').select('perfil_id').eq('evento_id', eventoId)
  const candidatos = [...new Set((comEsteEvento ?? []).map(r => r.perfil_id as string))]
  if (candidatos.length) {
    const { data: todosEscopos } = await db
      .from('suporte_escopo').select('perfil_id, evento_id, organizacao_id').in('perfil_id', candidatos)
    const porPerfil = new Map<string, { evento_id: string | null; organizacao_id: string | null }[]>()
    for (const r of todosEscopos ?? []) {
      const k = r.perfil_id as string
      if (!porPerfil.has(k)) porPerfil.set(k, [])
      porPerfil.get(k)!.push({ evento_id: r.evento_id as string | null, organizacao_id: r.organizacao_id as string | null })
    }
    for (const [perfilId, linhas] of porPerfil) {
      const soEsteEvento = linhas.every(l => l.organizacao_id === null && l.evento_id === eventoId)
      if (soEsteEvento) alvos.add(perfilId)
    }
  }

  return [...alvos]
}

async function inativarAcessosDoEvento(eventoId: string) {
  const ids = await acessosDoEvento(eventoId)
  if (!ids.length) return
  // Só quem está ativo E ainda não tem marca — pra não "roubar" pro evento
  // alguém já inativado por outro motivo.
  await supabaseAdmin
    .from('perfis')
    .update({ ativo: false, inativado_em_evento: eventoId })
    .in('id', ids)
    .neq('ativo', false)
    .is('inativado_em_evento', null)
}

async function reativarAcessosDoEvento(eventoId: string) {
  await supabaseAdmin
    .from('perfis')
    .update({ ativo: true, inativado_em_evento: null })
    .eq('inativado_em_evento', eventoId)
}

export async function deletarEvento(id: string) {
  const perfil = await getPerfil()
  if (!podeExcluir(perfil)) throw new Error('Apenas o master pode excluir eventos')
  const db = supabaseAdmin
  const { data: eventoExcluido } = await db.from('eventos').select('nome, organizacao_id').eq('id', id).maybeSingle()

  /*
   * Desvincula os supervisores ANTES de apagar.
   *
   * `perfis.fornecedor_id` referencia `fornecedores(id)` sem `on delete`, então
   * o padrão do Postgres é BLOQUEAR. Apagar o evento cascateia pros setores, e
   * qualquer supervisor ligado a um deles derrubava a operação inteira com
   * violação de chave estrangeira.
   *
   * Desvincular é o desfecho certo: o supervisor é a conta de uma PESSOA, que
   * continua existindo depois do evento — o que deixa de fazer sentido é o
   * vínculo com um setor que não existe mais. Apagar a conta junto seria pior;
   * bloquear a exclusão obrigaria o master a caçar supervisor por supervisor
   * antes de remover um evento de teste.
   */
  const { data: setores } = await db.from('fornecedores').select('id').eq('evento_id', id)
  const idsSetores = (setores ?? []).map(f => f.id)
  if (idsSetores.length) {
    await db.from('perfis').update({ fornecedor_id: null }).in('fornecedor_id', idsSetores)
  }

  // O erro precisa ser LIDO. Sem isto, uma falha de chave estrangeira era
  // descartada em silêncio e o código seguia pro redirect — a tela voltava
  // pra lista, o evento continuava lá, e nada explicava o porquê.
  const { error } = await db.from('eventos').delete().eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))

  // Sem eventoId: o evento não existe mais (a coluna aponta para eventos e o insert falharia).
  auditar(perfil, 'EVENTO_EXCLUIDO', {
    campoAlterado: 'Evento', valorAnterior: eventoExcluido?.nome ?? id,
    organizacaoId: (eventoExcluido?.organizacao_id as string | null) ?? undefined,
  })
  revalidatePath('/admin/eventos')
  revalidatePath('/admin')
  redirect('/admin/eventos')
}

/**
 * Move um evento de organização — ou dá dono a um evento órfão.
 *
 * Evento criado pelo master nascia sem organização (ele não pertence a
 * nenhuma), e evento sem dono some da tela de todo admin. É a correção para os
 * que já ficaram assim, e a forma de transferir um evento entre clientes.
 *
 * Só o master: mover evento entre organizações é mexer no dado de dois
 * clientes ao mesmo tempo.
 */
export async function atribuirEventoAOrganizacao(eventoId: string, organizacaoId: string | null) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Apenas o master atribui eventos a organizações')

  const db = supabaseAdmin
  const { data: evento } = await db.from('eventos').select('id, nome').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')

  let nomeOrg = 'nenhuma organização'
  if (organizacaoId) {
    const { data: org } = await db.from('organizacoes').select('id, nome').eq('id', organizacaoId).single()
    if (!org) throw new Error('Organização não encontrada')
    nomeOrg = org.nome
  }

  const { error } = await db.from('eventos').update({ organizacao_id: organizacaoId }).eq('id', eventoId)
  if (error) throw new Error(mensagemAmigavel(error))

  /*
   * Os perfis vinculados aos setores deste evento acompanham a mudança. Sem
   * isto o supervisor continuaria apontando pra organização antiga e veria
   * (ou deixaria de ver) coisa errada — o vínculo dele com o setor é o que
   * define a organização a que ele pertence.
   */
  const { data: setores } = await db.from('fornecedores').select('id').eq('evento_id', eventoId)
  const idsSetores = (setores ?? []).map(f => f.id)
  if (idsSetores.length) {
    await db.from('perfis').update({ organizacao_id: organizacaoId }).in('fornecedor_id', idsSetores)
  }

  revalidatePath('/admin/organizacoes')
  revalidatePath('/admin/eventos')
  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath('/admin')
  auditar(perfil, 'EVENTO_ORGANIZACAO_ALTERADA', {
    campoAlterado: `Evento ${evento.nome}`, eventoId, organizacaoId: organizacaoId ?? undefined,
    valorNovo: `Agora pertence a ${nomeOrg}`,
  })
  return { ok: true as const, evento: evento.nome, organizacao: nomeOrg, supervisores: idsSetores.length }
}

/**
 * Redefine a senha de qualquer acesso.
 *
 * Existe porque a troca de senha só era possível pela tela de supervisor —
 * admin e master não tinham nenhum caminho, e quem esquece a senha fica de
 * fora do próprio sistema no dia do evento.
 *
 * Master mexe em qualquer um; admin só na própria equipe; suporte só em
 * supervisor/operador de portão dentro do escopo dele — nunca em admin ou
 * master, mesmo que por algum acidente estivesse "na mesma organização".
 * Ninguém redefine a própria senha por aqui: para isso existe o fluxo de
 * conta, e um caminho administrativo sobre si mesmo só serve pra confundir.
 */
export async function redefinirSenha(usuarioId: string, novaSenha: string, motivo?: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão para redefinir senhas')
  if (!novaSenha || novaSenha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('id, nome, email, cpf, role, organizacao_id, fornecedor_id').eq('id', usuarioId).single()
  if (!alvo) throw new Error('Usuário não encontrado')

  if (podeGerenciarUsuarios(perfil)) {
    // Admin não mexe em quem é de outra organização, nem em master.
    if (!ehMaster(perfil.role)) {
      if (alvo.organizacao_id !== perfil.organizacao_id) throw new Error('Sem permissão sobre este usuário')
      if (alvo.role === 'master') throw new Error('Sem permissão sobre este usuário')
    }
  } else if (perfil.role === 'suporte') {
    if (alvo.role !== 'supervisor' && alvo.role !== 'operador_portao') {
      throw new Error('Suporte só redefine senha de supervisor ou operador de portão.')
    }
    if (!(motivo ?? '').trim()) throw new Error('Informe o motivo da redefinição.')
    const escopo = alvo.organizacao_id
      ? await suporteTemEscopo(perfil.id, { organizacaoId: alvo.organizacao_id })
      : false
    if (!escopo) throw new Error('Esta pessoa não está no seu escopo de atendimento.')
  } else {
    throw new Error('Sem permissão para redefinir senhas')
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha })
  if (error) throw new Error(mensagemAuth(error.message))

  console.warn(`[redefinirSenha] ${perfil.email} redefiniu a senha de ${alvo.email}`)
  after(() => registrarAuditoria({
    perfil, acao: 'RESET_SENHA', motivo: motivo ?? null, organizacaoId: alvo.organizacao_id ?? undefined,
    // Sem isto a linha dizia só "Redefinição de senha", sem dizer de quem.
    campoAlterado: 'Senha de acesso',
    valorNovo: `${alvo.nome}${alvo.cpf ? ` — CPF ${formatCpf(alvo.cpf as string)}` : ''}`,
  }))
  revalidatePath('/admin/usuarios')
  return { ok: true as const, nome: alvo.nome as string, email: alvo.email as string }
}

// ─── Fornecedores ────────────────────────────────────────────────────────────

function parseValor(v: FormDataEntryValue | null): number | null {
  const s = ((v as string) || '').replace(',', '.').trim()
  if (!s) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** A cota do fornecedor (Vital, 01/10/2026 — campo que faltava no modal, só existia via planilha). */
function parseQuantidade(v: FormDataEntryValue | null): number | null {
  const s = ((v as string) || '').trim()
  if (!s) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Cria um setor — com supervisor, sempre.
 *
 * O supervisor deixou de ser um segundo passo em 04/09/2026, a pedido do
 * Juan. Setor sem supervisor abria o link de cadastro e recebia gente sem
 * ninguém responsvel por conferir a equipe — e como criar o acesso era
 * outra tela, em outro menu, sempre ficava pra depois.
 *
 * Quem já é supervisor no sistema entra pelo próprio CPF: `criarSupervisor`
 * reconhece o CPF, soma o setor novo aos que a pessoa já cobre e não cria
 * acesso duplicado (ver `supervisor_setores` lá).
 *
 * Se o supervisor falhar, o setor recém-criado é desfeito. Sem isso, o
 * primeiro CPF digitado errado deixaria na tela exatamente o que esta
 * mudança existe pra impedir: um setor sem ninguém respondendo por ele.
 */
/**
 * Acha um supervisor já cadastrado pelo CPF — pra preencher nome/WhatsApp
 * sozinho no formulário de "Novo Fornecedor" (pedido do Juan, 02/10/2026):
 * digitar o CPF de quem já é supervisor aqui não devia pedir nome e telefone
 * de novo, já que o sistema já tem os dois. `null` tanto pra "não achou"
 * quanto pra "sem permissão" — a tela não precisa distinguir os dois casos,
 * só decide se preenche ou deixa em branco.
 */
export async function buscarSupervisorPorCpf(cpfBruto: string): Promise<{ nome: string; telefone: string | null } | null> {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil)) return null
  const cpf = normalizarCpf(cpfBruto)
  if (cpf.length !== 11) return null

  let query = supabaseAdmin.from('perfis').select('nome, telefone, organizacao_id').eq('role', 'supervisor').eq('cpf', cpf)
  if (!ehMaster(perfil.role)) query = query.eq('organizacao_id', perfil.organizacao_id)
  const { data } = await query.maybeSingle()
  if (!data) return null
  return { nome: data.nome as string, telefone: (data.telefone as string | null) ?? null }
}

export async function criarFornecedor(eventoId: string, formData: FormData): Promise<{ error?: string }> {
  try {
    await criarFornecedorOuLanca(eventoId, formData)
    return {}
  } catch (e) {
    // Mesmo cuidado de `criarSupervisor`: sem isto, o Next mascara a
    // mensagem em produção e o formulário mostra "página desatualizada" em
    // vez do motivo de verdade — foi o que aconteceu de verdade (24/09/2026).
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Lê do formulário do fornecedor as travas por dia (`trava_YYYY-MM-DD`) e
 * grava. Só age quando a seção apareceu na tela (`trava_presente`) — modal
 * de evento sem dias de trabalho não manda nada, e nada é apagado por engano.
 * O cadastro do fornecedor já foi salvo quando isto roda; se a gravação do
 * limite falhar, devolve a frase pra quem chamou AVISAR (antes ia só pro log e
 * o limite "não mudava" sem ninguém saber por quê).
 */
async function gravarTravasDoFormulario(fornecedorId: string, formData: FormData): Promise<string | null> {
  if (!formData.has('trava_presente')) return null
  const porDia: Record<string, number | null> = {}
  for (const [campo, valor] of formData.entries()) {
    const dia = campo.match(/^trava_(\d{4}-\d{2}-\d{2})$/)?.[1]
    if (!dia) continue
    const n = Math.floor(Number(String(valor).trim()))
    porDia[dia] = String(valor).trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
  }
  if (!Object.keys(porDia).length) return null
  const r = await gravarTravasDoFornecedor(fornecedorId, porDia)
  if (r.ok) return null
  console.error('[fornecedor] trava por dia não gravada (migração upgrade-trava-por-dia.sql pendente?)', r.erro)
  return 'Os dados do setor foram salvos, mas o limite por dia não foi gravado. Peça ao suporte para rodar a atualização do banco (upgrade-trava-por-dia.sql).'
}

/** Os dias do evento e a trava atual do fornecedor — o que o modal de fornecedor mostra ao abrir. */
export async function carregarTravasDoModal(eventoId: string, fornecedorId?: string): Promise<{
  usaEscala: boolean; dias: DiaDaEscala[]; travas: Record<string, number>
}> {
  try {
    await exigirEventoDaOrg(eventoId)
    // Vale em QUALQUER evento com dias de trabalho: a trava é conferida no
    // portão (`vagaNoSetorNoDia`), não depende da escala por dia. Quem não
    // preenche nenhum limite não muda nada.
    const [dias, travas] = await Promise.all([
      diasDaEscalaDoEvento(eventoId),
      fornecedorId ? travasDoFornecedor(fornecedorId) : Promise.resolve(new Map<string, number>()),
    ])
    return { usaEscala: dias.length > 0, dias, travas: Object.fromEntries(travas) }
  } catch {
    return { usaEscala: false, dias: [], travas: {} }
  }
}

/**
 * O relatório de "quem está sem trava, com trava parcial, ou com trava completa" — pedido do Juan, 08/10/2026,
 * depois de eu levantar isso manualmente num script pra ele: "qual caminho pra eu extrair isso?". Mesma régua de
 * `carregarTravasDoModal` (admin/master/gerente da organização do evento) — é visão de TODOS os fornecedores,
 * não cabe pro supervisor ver.
 */
export async function obterRelatorioTravas(eventoId: string): Promise<
  { ok: true; eventoNome: string; relatorio: RelatorioTravas } | { ok?: false; error: string }
> {
  try {
    await exigirEventoDaOrg(eventoId)
    const [{ data: evento }, relatorio] = await Promise.all([
      supabaseAdmin.from('eventos').select('nome').eq('id', eventoId).maybeSingle(),
      relatorioTravasPorDia(eventoId),
    ])
    return { ok: true, eventoNome: (evento?.nome as string | null) ?? 'Evento', relatorio }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Edita a trava por dia de UM setor direto do painel "Limite por dia" (pedido do Juan, 08/10/2026: "seria bom a
 * gente editar os dias por aqui também, ser meio que um painel"). Mesma gravação do modal do fornecedor
 * (`gravarTravasDoFornecedor`): número = limite; `null` = sem trava (livre). Só os dias do evento são aceitos.
 */
export async function salvarTravasDoSetor(
  eventoId: string, fornecedorId: string, porDia: Record<string, number | null>,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, nome, evento_id').eq('id', fornecedorId).maybeSingle()
    if (!setor || setor.evento_id !== eventoId) return { ok: false, erro: 'Este setor não pertence a este evento.' }

    const diasDoEvento = new Set((await diasDaEscalaDoEvento(eventoId)).map(d => d.data))
    const limpo: Record<string, number | null> = {}
    for (const [dia, valor] of Object.entries(porDia)) {
      if (!diasDoEvento.has(dia)) return { ok: false, erro: 'Um dos dias não faz parte deste evento. Atualize a página.' }
      if (valor === null) { limpo[dia] = null; continue }
      const n = Math.floor(Number(valor))
      if (!Number.isFinite(n) || n < 1 || n > 100000) return { ok: false, erro: 'O limite precisa ser um número a partir de 1 (ou vazio para deixar livre).' }
      limpo[dia] = n
    }
    if (!Object.keys(limpo).length) return { ok: true }

    const antes = await travasDoFornecedor(fornecedorId)
    const r = await gravarTravasDoFornecedor(fornecedorId, limpo)
    if (!r.ok) return { ok: false, erro: 'Não foi possível gravar o limite (migração upgrade-trava-por-dia.sql pendente?).' }

    const resumo = (m: (dia: string) => number | null | undefined) =>
      Object.keys(limpo).sort().map(d => `${rotuloDoDia(d).curto}: ${m(d) ?? 'livre'}`).join(' · ')
    auditar(perfil, 'TRAVA_POR_DIA_ALTERADA', {
      eventoId, campoAlterado: `Limite por dia — ${setor.nome as string}`,
      valorAnterior: curto(resumo(d => antes.get(d) ?? null), 400),
      valorNovo: curto(resumo(d => limpo[d]), 400),
    })
    revalidatePath(`/admin/eventos/${eventoId}/travas`)
    revalidatePath('/admin/travas')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/** Relatório "Batidas fora do local" — ver `relatorioForaDoLocal` (lib/alertas-local.ts). Só quem gerencia o evento. */
export async function obterRelatorioForaDoLocal(eventoId: string): Promise<
  { ok: true; eventoNome: string; relatorio: RelatorioForaDoLocal; eventoInteiro: boolean } | { ok?: false; error: string }
> {
  try {
    /*
     * Quem gerencia o evento (admin/master) vê o evento inteiro. O supervisor vê só os setores DELE neste evento
     * (pedido do Juan, 08/10/2026: "precisa aparecer esse fora do local para o supervisor daquela pessoa também…
     * o supervisor só vai conseguir puxar do setor dele").
     */
    const perfil = await getPerfil()
    if (!perfil) return { error: 'Sem permissão' }
    let setoresPermitidos: { id: string; nome: string }[] | null = null
    if (podeGerenciarEventos(perfil)) {
      await exigirEventoDaOrg(eventoId)
    } else {
      const meus = (await meusSetores(perfil)).filter(st => st.evento_id === eventoId)
      if (!meus.length) return { error: 'Sem permissão sobre este evento' }
      setoresPermitidos = meus.map(st => ({ id: st.id, nome: st.nome }))
    }
    const [{ data: evento }, relatorio] = await Promise.all([
      supabaseAdmin.from('eventos').select('nome').eq('id', eventoId).maybeSingle(),
      relatorioForaDoLocal(eventoId, setoresPermitidos),
    ])
    return { ok: true, eventoNome: (evento?.nome as string | null) ?? 'Evento', relatorio, eventoInteiro: !setoresPermitidos }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

async function criarFornecedorOuLanca(eventoId: string, formData: FormData): Promise<void> {
  const perfilCriador = await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin
  const nomeFornecedor = nomeEmMaiusculo(formData.get('nome') as string)

  /*
   * Validado ANTES de criar o setor — as mesmas regras de `criarSupervisor`,
   * repetidas aqui de propósito: falhar depois do insert obrigaria a desfazer
   * o setor por um campo em branco, e desfazer é sempre a opção pior.
   *
   * `cliente` é papél legado que gerencia evento mas não cria acesso nenhum
   * (ver `podeGerenciarUsuarios`): pra ele o setor continua nascendo sem
   * supervisor, porque exigir o que ele não pode fazer o deixaria sem poder
   * criar setor.
   */
  const exigeSupervisor = podeGerenciarUsuarios(perfilCriador) || perfilCriador?.role === 'suporte'
  const supNome = ((formData.get('supervisor_nome') as string) ?? '').trim()
  const supCpf = normalizarCpf((formData.get('supervisor_cpf') as string) ?? '')
  const supTelefone = ((formData.get('supervisor_telefone') as string) ?? '').replace(/\D/g, '')
  if (exigeSupervisor) {
    if (!supNome) throw new Error('Informe o nome do supervisor deste fornecedor.')
    if (supCpf.length !== 11) throw new Error('Informe o CPF do supervisor, com 11 dígitos.')
    if (supTelefone.length < 10 || supTelefone.length > 13) {
      throw new Error('Informe o WhatsApp do supervisor — é por ele que o acesso chega.')
    }
  }
  // Trava de cadastro (09/10/2026): evento ou subgrupo de destino travado → nenhum setor novo, nem pela tela.
  const travado = await motivoCadastroTravado(eventoId, { subeventoId: ((formData.get('subevento_id') as string) || '').trim() || null, oQue: 'setores' })
  if (travado) throw new Error(travado)
  const data = {
    evento_id: eventoId,
    nome: nomeFornecedor,
    valor_combinado: parseValor(formData.get('valor_combinado')),
    quantidade_estimada: parseQuantidade(formData.get('quantidade_estimada')),
  }
  /*
   * Caixa desmarcada não é enviada pelo navegador — por isso a leitura é
   * "veio marcado?" e não "qual o valor?". Mesmo cuidado de `batida_livre`.
   *
   * `exige_meio` é coluna nova (migração supabase/upgrade-meio-por-setor.sql).
   * Antes de ela rodar no banco, gravar direto no `insert` derrubava o
   * cadastro do setor INTEIRO com "column does not exist" — sem avisar
   * ninguém, porque o erro do insert nem era lido. Por isso ela entra à
   * parte, e o erro dela nunca impede o setor de ser criado.
   */
  const { data: novo, error } = await db.from('fornecedores').insert([data]).select('id').single()
  if (error) throw new Error(mensagemAmigavel(error))

  const { error: erroMeio } = await db.from('fornecedores')
    .update({ exige_meio: formData.get('exige_meio') === 'on' })
    .eq('id', novo.id)
  if (erroMeio) console.error('[criarFornecedor] exige_meio não gravado (migração pendente?)', erroMeio.message)

  const { error: erroHorario } = await db.from('fornecedores')
    .update({ entrada_qualquer_horario: formData.get('entrada_qualquer_horario') === 'on' })
    .eq('id', novo.id)
  if (erroHorario) console.error('[criarFornecedor] entrada_qualquer_horario não gravado (migração pendente?)', erroHorario.message)

  /*
   * Subevento (correção 30/09/2026) — fixo (hidden) quando o fornecedor
   * nasce dentro da página de um subevento; ausente quando nasce direto no
   * evento (evento sem subeventos, ou fornecedor "sem subevento" legado).
   */
  const subeventoIdNovo = ((formData.get('subevento_id') as string) || '').trim() || null
  if (subeventoIdNovo) {
    const { error: erroSubevento } = await db.from('fornecedores')
      .update({ subevento_id: subeventoIdNovo })
      .eq('id', novo.id)
    if (erroSubevento) console.error('[criarFornecedor] subevento_id não gravado (migração pendente?)', erroSubevento.message)
  }

  // No cadastro novo o erro já foi pro log; avisar aqui deixaria o modal aberto e convidaria a criar o setor duas vezes.
  await gravarTravasDoFormulario(novo.id as string, formData)

  if (exigeSupervisor) {
    const dadosSupervisor = new FormData()
    dadosSupervisor.set('nome', supNome)
    dadosSupervisor.set('cpf', supCpf)
    dadosSupervisor.set('telefone', supTelefone)
    try {
      await criarSupervisorOuLanca(novo.id, eventoId, dadosSupervisor)
    } catch (e) {
      // Desfaz o setor: melhor não existir do que existir sem responsável.
      await db.from('fornecedores').delete().eq('id', novo.id)
      throw e
    }
  }

  // Cria a aba na planilha depois da resposta (after: sobrevive ao serverless da Vercel)
  after(() => garantirAbaFornecedorAsync(eventoId, nomeFornecedor))

  auditar(perfilCriador, 'SETOR_CRIADO', {
    campoAlterado: 'Fornecedor', eventoId,
    valorNovo: curto(`${nomeFornecedor}${data.quantidade_estimada ? ` · ${data.quantidade_estimada} colaboradores` : ''}${exigeSupervisor ? ` · supervisor ${supNome} (CPF ${formatCpf(supCpf)})` : ''}`),
  })
  revalidatePath(`/admin/eventos/${eventoId}`)
}

async function garantirAbaFornecedorAsync(eventoId: string, nomeFornecedor: string) {
  try {
    const { data: evento } = await supabaseAdmin.from('eventos').select('spreadsheet_id').eq('id', eventoId).single()
    if (evento?.spreadsheet_id) await garantirAbaFornecedor(evento.spreadsheet_id, nomeFornecedor)
  } catch (e) {
    console.error('Erro ao criar aba do fornecedor:', e)
  }
}

export async function editarFornecedor(id: string, eventoId: string, formData: FormData): Promise<{ error?: string }> {
  const perfilEditor = await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin
  const { data: antesDoSetor } = await db.from('fornecedores').select('nome, valor_combinado, quantidade_estimada').eq('id', id).maybeSingle()
  const { error } = await db.from('fornecedores').update({
    nome: nomeEmMaiusculo(formData.get('nome') as string),
    valor_combinado: parseValor(formData.get('valor_combinado')),
    quantidade_estimada: parseQuantidade(formData.get('quantidade_estimada')),
  }).eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))

  // Mesmo motivo de criarFornecedor: coluna nova, à parte, pra migração
  // pendente nunca travar o resto da edição do setor.
  const { error: erroMeio } = await db.from('fornecedores')
    .update({ exige_meio: formData.get('exige_meio') === 'on' })
    .eq('id', id)
  if (erroMeio) console.error('[editarFornecedor] exige_meio não gravado (migração pendente?)', erroMeio.message)

  const { error: erroHorario } = await db.from('fornecedores')
    .update({ entrada_qualquer_horario: formData.get('entrada_qualquer_horario') === 'on' })
    .eq('id', id)
  if (erroHorario) console.error('[editarFornecedor] entrada_qualquer_horario não gravado (migração pendente?)', erroHorario.message)

  /*
   * Subevento (correção 30/09/2026) — só mexe quando o campo veio na tela
   * (seletor só aparece em evento com `tem_subeventos`). Vazio = "Nenhum",
   * pra poder tirar um fornecedor de um subevento também, não só atribuir.
   */
  if (formData.has('subevento_id')) {
    const subeventoIdEditado = ((formData.get('subevento_id') as string) || '').trim() || null
    const { error: erroSubevento } = await db.from('fornecedores')
      .update({ subevento_id: subeventoIdEditado })
      .eq('id', id)
    if (erroSubevento) console.error('[editarFornecedor] subevento_id não gravado (migração pendente?)', erroSubevento.message)
  }
  const avisoTrava = await gravarTravasDoFormulario(id, formData)

  /*
   * Ligar/desligar o meio muda o que está AGENDADO daqui pra frente:
   * `sincronizarAgendamentos` recria a fila do evento, cancelando o que
   * deixou de fazer sentido. Sem isto, desligar o meio de um setor não
   * pararia os lembretes já enfileirados — que é justamente o custo de
   * WhatsApp que se quer cortar.
   */
  after(() => sincronizarAgendamentos(eventoId).catch(console.error))
  const resumoSetor = (f: { nome?: unknown; valor_combinado?: unknown; quantidade_estimada?: unknown } | null) => f
    ? curto(`${f.nome} · ${f.quantidade_estimada ?? 'sem'} colaboradores · R$ ${f.valor_combinado ?? '—'} por pessoa`)
    : null
  auditar(perfilEditor, 'SETOR_EDITADO', {
    campoAlterado: 'Fornecedor', eventoId,
    valorAnterior: resumoSetor(antesDoSetor),
    valorNovo: resumoSetor({
      nome: nomeEmMaiusculo(formData.get('nome') as string),
      valor_combinado: parseValor(formData.get('valor_combinado')),
      quantidade_estimada: parseQuantidade(formData.get('quantidade_estimada')),
    }),
  })
  revalidatePath(`/admin/eventos/${eventoId}`)
  // Devolvido (não lançado): em produção o Next esconde a mensagem de uma exceção de Server Action.
  return avisoTrava ? { error: avisoTrava } : {}
}

/**
 * `redirect()` fica FORA do try/catch de propósito: ele funciona lançando
 * uma exceção especial (`NEXT_REDIRECT`) que o próprio Next intercepta — se
 * estivesse dentro do try, o catch abaixo confundiria isso com um erro de
 * verdade e devolveria `{error}` em vez de navegar. Mesmo cuidado do resto
 * desta rodada de correções: em produção o Next mascara toda mensagem de
 * exceção que sai de uma Server Action, então motivos específicos como
 * "tem supervisor vinculado" viravam "página desatualizada" — achado real
 * em produção (24/09/2026).
 */
export async function deletarFornecedor(id: string, eventoId: string): Promise<{ error?: string } | void> {
  try {
    await exigirEventoDaOrg(eventoId)
    // Exclusão é só do master (ver `podeExcluir` em lib/permissions). Esta
    // checagem é a que vale: esconder o botão não impede a chamada direta.
    const perfilExclusao = await getPerfil()
    if (!podeExcluir(perfilExclusao)) {
      return { error: 'Apenas o master pode excluir. Você pode desativar, que é reversível.' }
    }
    const db = supabaseAdmin

    // Setor com supervisores vinculados não pode ser excluído (teriam que ser
    // realocados ou removidos primeiro)
    const { data: supervisores } = await db.from('perfis').select('id').eq('fornecedor_id', id).limit(1)
    if (supervisores && supervisores.length) {
      return { error: 'Este fornecedor tem supervisores vinculados. Exclua ou realoque os supervisores antes de excluir o fornecedor.' }
    }

    const { data: setorExcluido } = await db.from('fornecedores').select('nome').eq('id', id).maybeSingle()
    const { count: equipeExcluida } = await db.from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', id)
    await db.from('fornecedores').delete().eq('id', id)
    auditar(perfilExclusao, 'SETOR_EXCLUIDO', {
      campoAlterado: 'Fornecedor', eventoId,
      valorAnterior: curto(`${setorExcluido?.nome ?? id} · ${equipeExcluida ?? 0} pessoa(s) na equipe, apagadas junto`),
    })
    revalidatePath(`/admin/eventos/${eventoId}`)
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
  redirect(`/admin/eventos/${eventoId}`)
}

/**
 * Move um funcionário para outro setor DO MESMO EVENTO.
 *
 * Existe para não depender de mim de novo. É exatamente o que fiz na mão para
 * os dois "Carregadores" duplicados do Henrique e Juliano — um UPDATE no
 * `fornecedor_id` — só que como botão, para o admin resolver sozinho quando
 * alguém foi cadastrado no setor errado.
 *
 * NÃO muda nada da pessoa: nome, CPF, telefone, foto e o `qr_token` da
 * credencial continuam os mesmos. E as batidas já feitas não somem — elas
 * ficam presas ao funcionário (`funcionario_id`), não ao setor, então o
 * histórico dela migra junto, automaticamente, sem precisar tocar em
 * `registros`.
 *
 * Admin e master sempre; suporte também, mas só dentro do escopo dele — não
 * o supervisor. Mover gente de setor afeta a equipe de OUTRO supervisor sem
 * ele saber; deixar cada supervisor mexer na composição alheia seria o tipo
 * de ação que exige alguém com visão do evento inteiro.
 */
export async function moverFuncionarioDeSetor(
  funcionarioId: string,
  eventoId: string,
  novoFornecedorId: string,
  motivo?: string,
) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')

  const podeSempre = podeGerenciarEventos(perfil) && (ehMaster(perfil.role) || evento.organizacao_id === perfil.organizacao_id)

  /*
   * Quem NÃO é admin/master precisa de motivo (auditoria) e de uma checagem
   * de escopo própria. A do supervisor depende do setor de ORIGEM, que só se
   * conhece depois de carregar o funcionário — por isso a validação dele
   * acontece logo abaixo, e não aqui.
   */
  let setoresDoSupervisor: Set<string> | null = null
  if (!podeSempre) {
    if (!(motivo ?? '').trim()) throw new Error('Informe o motivo da mudança de fornecedor.')
    if (perfil.role === 'supervisor') {
      setoresDoSupervisor = new Set((await meusSetores(perfil)).map(s => s.id))
      // O DESTINO tem que ser um setor dele; a ORIGEM é conferida adiante.
      if (!setoresDoSupervisor.has(novoFornecedorId)) {
        throw new Error('Você só pode mover para um fornecedor que você também supervisiona.')
      }
    } else if (perfil.role === 'suporte') {
      if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) {
        throw new Error('Este evento não está no seu escopo de atendimento.')
      }
    } else {
      throw new Error('Sem permissão sobre este evento')
    }
  }
  const db = supabaseAdmin

  const { data: func } = await db
    .from('funcionarios')
    .select('id, nome, cpf, fornecedor_id, fornecedores!inner(evento_id, nome)')
    .eq('id', funcionarioId)
    .single()
  if (!func) throw new Error('Funcionário não encontrado.')
  // Confere que ele É deste evento — sem isto, um id de outro evento passado
  // por engano (ou de propósito) moveria gente para um setor de outro cliente.
  if ((func.fornecedores as unknown as { evento_id: string }).evento_id !== eventoId) {
    throw new Error('Este funcionário não pertence a este evento.')
  }

  // Supervisor: a ORIGEM também tem que ser dele — só remaneja entre setores
  // que ele cobre, nunca puxa gente de um setor de outro supervisor.
  if (setoresDoSupervisor && !setoresDoSupervisor.has(func.fornecedor_id as string)) {
    throw new Error('Você só pode mover pessoas de um fornecedor que você supervisiona.')
  }

  if (func.fornecedor_id === novoFornecedorId) {
    return { ok: true as const, mudou: false }
  }

  const { data: destino } = await db
    .from('fornecedores')
    .select('id, nome, evento_id')
    .eq('id', novoFornecedorId)
    .single()
  if (!destino) throw new Error('Fornecedor de destino não encontrado.')
  // O destino precisa ser do MESMO evento — mover entre eventos é outra
  // operação (o funcionário pertenceria a duas credenciais, dois QR
  // diferentes), fora do que este botão resolve.
  if (destino.evento_id !== eventoId) {
    throw new Error('O fornecedor de destino não é deste evento.')
  }

  /*
   * A mesma regra que vale ao se cadastrar: uma pessoa não pode estar em dois
   * setores do mesmo evento. Aqui é defensivo — não deveria haver como esse
   * estado existir — mas mover às cegas por cima de um cadastro duplicado
   * criaria confusão pior do que a que se está tentando resolver.
   */
  const { data: colisao } = await db
    .from('funcionarios')
    .select('id')
    .eq('fornecedor_id', novoFornecedorId)
    .eq('cpf', func.cpf)
    .limit(1)
  if (colisao && colisao.length) {
    throw new Error(`Já existe um cadastro com este CPF no fornecedor ${destino.nome}.`)
  }

  const { error } = await db
    .from('funcionarios')
    .update({ fornecedor_id: novoFornecedorId })
    .eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível mover o funcionário. Tente de novo.')

  /*
   * Leva o subevento junto (correção 30/09/2026) — consulta À PARTE e
   * tolerante (coluna nova): sem isto, a pessoa ficaria com o subevento do
   * fornecedor ANTIGO depois de mudar de fornecedor, e o scanner barraria
   * ela no portão certo achando que é o errado.
   */
  try {
    const { data: destinoSubevento } = await db
      .from('fornecedores').select('subevento_id').eq('id', novoFornecedorId).maybeSingle()
    await db.from('funcionarios')
      .update({ subevento_id: (destinoSubevento as { subevento_id?: string | null } | null)?.subevento_id ?? null })
      .eq('id', funcionarioId)
  } catch (e) {
    console.error('[moverFuncionarioDeSetor] subevento_id não atualizado (migração pendente?)', e)
  }

  const setorAntigo = (func.fornecedores as unknown as { nome: string }).nome
  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SETOR', campoAlterado: 'fornecedor',
    valorAnterior: setorAntigo, valorNovo: destino.nome, motivo: motivo ?? null,
    funcionarioId, eventoId, organizacaoId: evento.organizacao_id ?? undefined,
  }))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${func.fornecedor_id}`)
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${novoFornecedorId}`)
  revalidatePath(`/admin/eventos/${eventoId}`)

  return { ok: true as const, mudou: true, novoSetorNome: destino.nome as string }
}

export type FuncionarioParaExportar = {
  nome: string
  cpf: string
  telefone: string
  cargo: string
  chave_pix: string
  valor_receber: number | null
  pago: boolean
  pago_em: string | null
  ativo: boolean
  /** Só vem preenchido quando `filtro` foi passado — hora de cada etapa, no dia escolhido. */
  entrada?: string | null
  meio?: string | null
  fim?: string | null
}

/**
 * A lista de quem está neste setor, pronta para virar planilha no cliente.
 *
 * Devolve os dados brutos, não o arquivo: montar o .xlsx roda no navegador
 * (mesmo pacote `xlsx` que já lê a planilha de importação), então o server
 * não precisa gerar nem servir um arquivo binário para isto.
 *
 * `filtro` é opcional: sem ele, só o cadastro (nome, CPF, financeiro). Com
 * ele, soma o horário de cada etapa marcada, NUM dia só — juntar o evento
 * inteiro misturaria montagem com o dia do show na mesma coluna, e quem olha
 * a planilha não teria como saber de qual dia é cada horário.
 */
export async function exportarFuncionariosDoSetor(
  fornecedorId: string,
  eventoId: string,
  filtro?: { dataRef: string; tipos: ('entrada' | 'meio' | 'fim')[] },
) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, nome, evento_id, eventos(nome)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) throw new Error('Fornecedor não encontrado')
  if (fornecedor.evento_id !== eventoId) throw new Error('Este fornecedor não pertence ao evento informado')

  // Paginado: um setor do Vital pode passar de 1.000 pessoas, e a planilha sairia cortada sem aviso.
  let funcionarios: { id: string; nome: string; cpf: string; telefone: string | null; cargo: string | null; chave_pix: string | null; valor_receber: number | null; pago: boolean | null; pago_em: string | null; ativo: boolean | null; created_at: string }[]
  try {
    funcionarios = await buscarTudo((de, ate) =>
      supabaseAdmin
        .from('funcionarios')
        .select('id, nome, cpf, telefone, cargo, chave_pix, valor_receber, pago, pago_em, ativo, created_at')
        .eq('fornecedor_id', fornecedorId)
        .order('nome').order('id').range(de, ate))
  } catch (e) {
    throw new Error(mensagemAmigavel(e))
  }

  const porFuncionario: Record<string, Record<'entrada' | 'meio' | 'fim', string | null>> = {}
  if (filtro && filtro.tipos.length > 0 && funcionarios?.length) {
    // Em lotes de pessoas (um `.in(...)` com centenas de ids estoura a URL) e paginado por lote.
    for (const lote of emLotes(funcionarios.map(f => f.id), 200)) {
      let registros: { funcionario_id: string; tipo: string; created_at: string }[]
      try {
        registros = await buscarTudo((de, ate) =>
          supabaseAdmin
            .from('registros')
            .select('funcionario_id, tipo, created_at')
            .eq('data_ref', filtro.dataRef)
            .in('tipo', filtro.tipos)
            .in('funcionario_id', lote)
            .order('id').range(de, ate))
      } catch (e) {
        throw new Error(mensagemAmigavel(e))
      }
      for (const r of registros) {
        (porFuncionario[r.funcionario_id] ??= { entrada: null, meio: null, fim: null })[r.tipo as 'entrada' | 'meio' | 'fim'] = r.created_at
      }
    }
  }

  return {
    setorNome: fornecedor.nome as string,
    eventoNome: (fornecedor.eventos as unknown as { nome: string } | null)?.nome ?? 'Evento',
    funcionarios: (funcionarios ?? []).map(({ id, ...f }) => ({
      ...f,
      ...(filtro ? {
        entrada: filtro.tipos.includes('entrada') ? (porFuncionario[id]?.entrada ?? null) : undefined,
        meio: filtro.tipos.includes('meio') ? (porFuncionario[id]?.meio ?? null) : undefined,
        fim: filtro.tipos.includes('fim') ? (porFuncionario[id]?.fim ?? null) : undefined,
      } : {}),
    })) as FuncionarioParaExportar[],
  }
}

// ─── Setores ─────────────────────────────────────────────────────────────────

// ─── QR Codes ────────────────────────────────────────────────────────────────

// ─── Funcionários ────────────────────────────────────────────────────────────

export async function criarFuncionario(fornecedorId: string, eventoId: string, formData: FormData) {
  const perfilCadastro = await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin
  const travado = await motivoCadastroTravado(eventoId, { fornecedorId })
  if (travado) throw new Error(travado)

  const cpf = (formData.get('cpf') as string).replace(/\D/g, '')
  if (!validarCpf(cpf)) throw new Error('CPF inválido. Confira os 11 dígitos.')

  // Não deixa cadastrar o mesmo CPF duas vezes no mesmo evento
  const { data: existentes } = await db
    .from('funcionarios')
    .select('id, fornecedores!inner(evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', eventoId)
    .limit(1)
  if (existentes && existentes.length) throw new Error('Já existe um funcionário com este CPF neste evento.')

  const { data: novo, error } = await db.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: (formData.get('nome') as string).trim(),
    cpf,
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    cargo: ((formData.get('cargo') as string) || '').trim(),
    ativo: true,
  }]).select('id').single()

  if (error) throw new Error(mensagemAmigavel(error))

  /*
   * Subevento (Vital, 02/10/2026) — cadastro feito direto pelo supervisor/
   * admin (não pelo formulário público) nascia sem o subevento do
   * fornecedor, e o scanner com área configurada barrava a pessoa como
   * "área diferente" mesmo estando no fornecedor certo. Mesmo achado do
   * crachá de supervisor — consulta à parte e tolerante, de sempre.
   */
  try {
    const { data: forn } = await db.from('fornecedores').select('subevento_id').eq('id', fornecedorId).maybeSingle()
    const subeventoId = (forn as { subevento_id?: string | null } | null)?.subevento_id ?? null
    if (subeventoId) await db.from('funcionarios').update({ subevento_id: subeventoId }).eq('id', novo.id)
  } catch { /* migração pendente */ }

  // Sincroniza com a planilha e agenda os lembretes de WhatsApp depois da
  // resposta (não bloqueia; sobrevive ao serverless)
  after(() => sincronizarFuncionarioNaPlanilha(novo.id).catch(console.error))
  after(() => sincronizarAgendamentos(eventoId).catch(console.error))
  // Cadastrado pelo supervisor, não pelo formulário: a pessoa ainda não viu a
  // credencial em tela nenhuma, então as boas-vindas no WhatsApp são o único
  // caminho até o link dela.
  after(() => agendarBoasVindasFuncionario({
    eventoId,
    funcionarioId: novo.id,
    telefone: (formData.get('telefone') as string) ?? '',
  }).catch(console.error))

  auditar(perfilCadastro, 'CADASTRO_FUNCIONARIO', {
    campoAlterado: 'Cadastro', eventoId, funcionarioId: novo.id as string,
    valorNovo: curto(`Cadastrado pelo painel: ${(formData.get('nome') as string).trim()} — CPF ${formatCpf(cpf)}`),
  })
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Atribui alguém da base regional a um setor de um evento.
 *
 * É a ponta comercial da base: a organização contrata o serviço de montagem de
 * equipe, e o master coloca a pessoa dentro do evento dela — a partir daí o
 * cliente enxerga essa pessoa na própria tela de setor e fala com ela.
 *
 * Exclusiva do master. Um admin fazendo isso significaria puxar gente de dentro
 * de outra organização sem que ninguém intermediasse.
 *
 * Os dados vêm do cadastro MAIS RECENTE daquele CPF: é o telefone que ainda
 * atende e a função que a pessoa exerceu por último. Nada é digitado de novo,
 * então não há chance de errar um dígito do CPF ao recopiar.
 */
export async function atribuirColaboradorAoEvento(cpfBruto: string, fornecedorId: string) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Apenas o master atribui colaboradores da base')

  const cpf = cpfBruto.replace(/\D/g, '')
  if (!validarCpf(cpf)) throw new Error('CPF inválido. Confira os 11 dígitos.')

  const db = supabaseAdmin

  const [{ data: base }, { data: setor }] = await Promise.all([
    db.from('funcionarios')
      .select('nome, cpf, telefone, cargo, cidade, chave_pix')
      .eq('cpf', cpf)
      .order('created_at', { ascending: false })
      .limit(1),
    db.from('fornecedores')
      .select('id, nome, evento_id, eventos(nome)')
      .eq('id', fornecedorId)
      .single(),
  ])

  /*
   * Sem ficha em evento nenhum (excluída de todos), a pessoa continua na base permanente (10/10/2026) — os dados
   * vêm de lá (`base_pessoas`, ou a lixeira sem o SQL).
   */
  const daBase = base?.length ? null : await pessoaDaBase(cpf)
  const pessoa = base?.[0] ?? (daBase
    ? { nome: daBase.nome, cpf, telefone: daBase.telefone, cargo: daBase.cargo, cidade: daBase.cidade, chave_pix: daBase.chavePix }
    : undefined)
  if (!pessoa) throw new Error('Esta pessoa não está na base do Credenciei')
  if (!setor) throw new Error('Fornecedor não encontrado')
  const travado = await motivoCadastroTravado(setor.evento_id as string, { fornecedorId })
  if (travado) throw new Error(travado)

  // Mesma trava do formulário público e da importação: um CPF por evento.
  const { data: jaNoEvento } = await db
    .from('funcionarios')
    .select('id, fornecedores!inner(nome, evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', setor.evento_id)
    .limit(1)
  if (jaNoEvento?.length) {
    const outro = (jaNoEvento[0].fornecedores as unknown as { nome: string }).nome
    throw new Error(`${pessoa.nome} já está neste evento, no fornecedor "${outro}".`)
  }

  const { data: novo, error } = await db.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: pessoa.nome,
    cpf,
    telefone: pessoa.telefone ?? '',
    // trabalha NESTE evento, não onde trabalhou no anterior.
    cargo: pessoa.cargo ?? '',
    cidade: pessoa.cidade ?? null,
    chave_pix: pessoa.chave_pix ?? null,
    ativo: true,
  }]).select('id, ativo').single()

  if (error || !novo) throw new Error(mensagemAmigavel(error))

  // Subevento (Vital, 02/10/2026) — mesmo achado/conserto de `criarFuncionario`.
  try {
    const { data: forn } = await db.from('fornecedores').select('subevento_id').eq('id', fornecedorId).maybeSingle()
    const subeventoId = (forn as { subevento_id?: string | null } | null)?.subevento_id ?? null
    if (subeventoId) await db.from('funcionarios').update({ subevento_id: subeventoId }).eq('id', novo.id)
  } catch { /* migração pendente */ }

  // Fora do caminho crítico: WhatsApp fora do ar não pode derrubar a atribuição.
  if (pessoa.telefone) {
    after(() => agendarBoasVindasFuncionario({
      eventoId: setor.evento_id,
      funcionarioId: novo.id,
      telefone: pessoa.telefone!,
    }).catch(console.error))
  }
  after(() => sincronizarAgendamentos(setor.evento_id).catch(console.error))

  revalidatePath(`/admin/eventos/${setor.evento_id}/fornecedor/${fornecedorId}`)
  revalidatePath(`/admin/pessoas/${cpf}`)

  const evento = (setor.eventos as unknown as { nome: string } | null)?.nome ?? 'o evento'
  auditar(perfil, 'COLABORADOR_ATRIBUIDO', {
    campoAlterado: 'Pessoa da base', eventoId: setor.evento_id as string, funcionarioId: novo.id as string,
    valorNovo: curto(`CPF ${formatCpf(cpf)} colocado em ${setor.nome}`),
  })
  return {
    ok: true as const,
    ativo: novo.ativo !== false,
    setor: setor.nome,
    evento,
    semTelefone: !pessoa.telefone,
  }
}

/**
 * Apaga um funcionário — o cadastro e tudo que está pendurado nele.
 *
 * O supervisor entrou aqui em 04/09/2026, a pedido do Juan. O gargalo era
 * concreto: desativar não resolvia (a pessoa reaparecia ativa no dia
 * seguinte) e ele dependia de outra pessoa pra limpar a própria equipe. Ele
 * só apaga de setor DELE — quem garante isso é `exigirAcessoFuncionarios`.
 *
 * É destrutivo de verdade: `registros`, `veiculos` e os lembretes têm
 * `on delete cascade` pro funcionário, então as batidas de ponto vão junto e
 * não voltam. Pra "esta pessoa não trabalha mais aqui" existe
 * `descredenciarFuncionario`, que preserva o histórico — a tela oferece os
 * dois lado a lado e diz qual faz o quê.
 *
 * A auditoria é gravada DEPOIS do delete e com nome e CPF escritos no texto:
 * `alteracoes_cadastro.funcionario_id` é `on delete set null`, então o link
 * some junto com a pessoa. Sem o nome no registro, sobraria "alguém apagou
 * alguém" — que é o mesmo que não ter auditoria.
 */
export async function deletarFuncionario(id: string, fornecedorId: string, eventoId: string, motivo?: string): Promise<{ error?: string }> {
  try {
    const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
    // Esta checagem é a que vale: esconder o botão não impede a chamada direta.
    if (!podeExcluirDaEquipe(perfil)) {
      throw new Error('Você não pode excluir. Use "Tirar da equipe", que preserva o histórico.')
    }
    const db = supabaseAdmin

    // Lido ANTES: depois do delete não existe mais de onde tirar nome e CPF.
    const { data: alvo } = await db
      .from('funcionarios').select('id, nome, cpf, fornecedor_id').eq('id', id).single()
    if (!alvo) throw new Error('Esta pessoa já não está mais aqui. Recarregue a página.')
    // Segunda tranca: o id vem do cliente, e sem isto um id colado apagaria
    // gente de outro setor com a permissão deste.
    if (alvo.fornecedor_id !== fornecedorId) throw new Error('Esta pessoa não é deste fornecedor.')

    /*
     * QUEM JÁ BATEU PONTO NÃO É APAGADO (só o master apaga). Excluir leva as batidas junto (`on delete
     * cascade`) e mata o QR que a pessoa tem no celular. Foi o que aconteceu em 08/10/2026 no VITAL: um
     * supervisor excluiu da equipe alguém que tinha registrado a ENTRADA de manhã — a pessoa continuou
     * trabalhando, o QR passou a dar inválido e ela sumiu do sistema. Para quem não vai mais trabalhar, "Tirar
     * da equipe" resolve igual e preserva o histórico. Na dúvida (consulta falhou), não apaga.
     */
    if (!ehMaster(perfil.role)) {
      const { data: batidas, error: erroBatidas } = await db.from('registros').select('id').eq('funcionario_id', id).limit(1)
      if (erroBatidas) throw new Error('Não foi possível conferir as batidas desta pessoa. Tente de novo.')
      if (batidas?.length) {
        throw new Error(`${alvo.nome} já registrou ponto neste evento e não pode ser excluída — isso apagaria as batidas dela e o QR que ela está usando. Use "Tirar da equipe": o QR para de valer e o histórico fica.`)
      }
    }

    // Cópia completa ANTES de apagar — é o que deixa o master restaurar (lixeira, lib/lixeira.ts).
    await guardarNaLixeira(id, { id: perfil.id, nome: perfil.nome }, motivo)

    const { error } = await db.from('funcionarios').delete().eq('id', id)
    if (error) throw new Error(mensagemAmigavel(error))

    after(() => registrarAuditoria({
      perfil, acao: 'EXCLUSAO_FUNCIONARIO', eventoId,
      campoAlterado: 'Funcionário excluído',
      valorAnterior: `${alvo.nome} — CPF ${formatCpf(alvo.cpf as string)}`,
      motivo: motivo ?? null,
    }))

    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    return {}
  } catch (e) {
    // Devolvido, não lançado: em produção o Next esconde a mensagem de uma exceção de Server Action.
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Valor que este funcionário deve receber dos demais integrantes do setor.
 * Mesma permissão de "gerenciar a equipe": admin/master da organização, ou o
 * supervisor vinculado a este setor especificamente.
 */
export async function atualizarValorReceber(funcionarioId: string, fornecedorId: string, eventoId: string, valor: number) {
  const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor inválido')
  const db = supabaseAdmin
  const { data: antes } = await db.from('funcionarios').select('valor_receber').eq('id', funcionarioId).maybeSingle()
  const { error } = await db.from('funcionarios').update({ valor_receber: valor }).eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível salvar o valor. Tente de novo.')
  auditar(perfil, 'VALOR_A_RECEBER_ALTERADO', {
    campoAlterado: 'Valor a receber', eventoId, funcionarioId,
    valorAnterior: `R$ ${Number(antes?.valor_receber ?? 0).toFixed(2)}`, valorNovo: `R$ ${valor.toFixed(2)}`,
  })

  // Reflete na planilha depois da resposta (não bloqueia; sobrevive ao serverless)
  after(() => sincronizarValorNaPlanilha(funcionarioId, valor).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Quem pode corrigir NOME e CPF na ficha do colaborador — e com qual alcance (pedido do Juan, 09/10/2026:
 * "supervisor também pode editar o nome, cpf, telefone").
 *
 *   - master e quem tem `podeEditarIdentidade` → corrige qualquer um (suporte, como sempre, só no escopo e com motivo);
 *   - quem cuida da equipe → a régua do telefone (`exigirAcessoFuncionarios`): supervisor só nos setores DELE (e com
 *     motivo, que vai pra auditoria), admin/gerente/cliente na própria organização.
 *
 * `plena: false` é o segundo caso: ali o CPF de quem tem LOGIN no sistema (supervisor, operador...) não é mexido —
 * ver `editarCpfFuncionario`.
 */
async function conferirCorrecaoDeIdentidade(fornecedorId: string, eventoId: string, motivo: string | undefined, oQue: string): Promise<
  { erro: string } | { perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>; plena: boolean }
> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: `Sem permissão para corrigir ${oQue}.` }

  const { data: fornecedor } = await supabaseAdmin.from('fornecedores').select('evento_id, eventos(organizacao_id)').eq('id', fornecedorId).single()
  if (!fornecedor || fornecedor.evento_id !== eventoId) return { erro: 'Fornecedor não encontrado neste evento.' }

  if (perfil.role === 'suporte') {
    if (!podeEditarIdentidade(perfil)) return { erro: `Sem permissão para corrigir ${oQue}.` }
    if (!(motivo ?? '').trim()) return { erro: 'Informe o motivo da correção.' }
    const organizacaoId = (fornecedor.eventos as unknown as { organizacao_id: string | null } | null)?.organizacao_id
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
      return { erro: 'Este evento não está no seu escopo de atendimento.' }
    }
    return { perfil, plena: true }
  }
  if (podeEditarIdentidade(perfil)) return { perfil, plena: true }

  try {
    await exigirAcessoFuncionarios(fornecedorId, eventoId)
  } catch {
    return { erro: `Sem permissão para corrigir ${oQue} desta pessoa.` }
  }
  if (perfil.role === 'supervisor' && !(motivo ?? '').trim()) return { erro: 'Informe o motivo da correção.' }
  return { perfil, plena: false }
}

/**
 * Corrige o CPF de um funcionário já cadastrado.
 *
 * Existe porque refazer o cadastro do zero (a alternativa óbvia) perde o QR
 * já impresso/salvo, o histórico de batidas e o vínculo de pagamento — tudo
 * amarrado ao `id` antigo. Corrigir o CPF NO MESMO registro preserva os três.
 *
 * Quem pode: ver `conferirCorrecaoDeIdentidade` (desde 09/10/2026 o supervisor
 * corrige os do setor dele, como já fazia com telefone). CPF é a identidade da pessoa em todo o sistema
 * (login de supervisor, base regional, histórico entre eventos); trocá-lo
 * sem cuidado troca quem a pessoa É pro sistema, não só um campo de
 * formulário — por isso exige motivo e fica na auditoria.
 */
/*
 * ⚠️ DEVOLVE o erro, nunca o LANÇA — e isto não é estilo, é o que faz a
 * mensagem chegar ao usuário.
 *
 * Em produção o Next.js APAGA a mensagem de qualquer erro lançado dentro de
 * uma Server Action e entrega ao cliente um texto genérico em inglês
 * ("An error occurred in the Server Components render... omitted in
 * production builds"). Esse texto casa com o padrão `server component` em
 * `lib/erros.ts` e vira "Ocorreu um erro interno nesta tela" — foi
 * exatamente o que apareceu ao tentar corrigir o CPF da Maria da Penha, e
 * antes dela ao tornar a Keyci supervisora. Quem escreve a mensagem em
 * português aqui nunca vê ela na tela; o `throw` a destrói no caminho.
 *
 * Devolver `{ erro }` como VALOR atravessa a fronteira intacto, porque é
 * dado de retorno e não exceção. É o mesmo padrão de
 * `registrarPresencaAssistida` e `lancarPontoManual`, que sempre
 * funcionaram.
 */
export async function editarCpfFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, novoCpfBruto: string, motivo?: string,
): Promise<{ ok: true } | { erro: string }> {
  const novoCpf = normalizarCpf(novoCpfBruto)
  if (!validarCpf(novoCpf)) return { erro: 'CPF inválido. Confira os 11 dígitos.' }

  const permissao = await conferirCorrecaoDeIdentidade(fornecedorId, eventoId, motivo, 'o CPF')
  if ('erro' in permissao) return permissao
  const { perfil } = permissao

  const { data: atual } = await supabaseAdmin.from('funcionarios').select('id, nome, cpf, fornecedor_id').eq('id', funcionarioId).single()
  if (!atual || atual.fornecedor_id !== fornecedorId) return { erro: 'Funcionário não encontrado neste fornecedor.' }
  if (atual.cpf === novoCpf) return { ok: true } // nada mudou

  /*
   * Quem corrige pela régua da equipe (supervisor, admin) não mexe no CPF de quem tem LOGIN no sistema, nem põe
   * na ficha o CPF de um login: o CPF é o que liga a ficha ao acesso (supervisor sai liberado em todos os dias
   * por ele — `pessoaEhSupervisor`). Trocar de um lado só separaria os dois, ou daria a alguém o que é de outro.
   */
  if (!permissao.plena) {
    const { data: comLogin } = await supabaseAdmin.from('perfis').select('id').in('cpf', [atual.cpf as string, novoCpf]).limit(1)
    if (comLogin?.length) {
      return { erro: 'Este CPF é de alguém com acesso ao sistema (supervisor, operador...). Peça ao administrador master para corrigir.' }
    }
  }

  /*
   * Mesma régua do cadastro público: uma pessoa não pode estar em dois
   * setores do mesmo evento. Corrigir o CPF pra um que já é de OUTRA pessoa
   * neste evento fundiria as duas identidades — o oposto do que se quer.
   *
   * `limit(1)` em vez de `maybeSingle()`: havendo DOIS cadastros com o CPF
   * de destino, o `maybeSingle` estouraria com erro técnico em vez de dizer
   * qual é o conflito — trocaria uma mensagem útil por uma inútil.
   */
  const { data: conflitos } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, fornecedores!inner(evento_id, nome)')
    .eq('cpf', novoCpf)
    .eq('fornecedores.evento_id', eventoId)
    .neq('id', funcionarioId)
    .limit(1)
  const conflito = conflitos?.[0]
  if (conflito) {
    const setorConflito = (conflito.fornecedores as unknown as { nome: string })?.nome ?? 'outro fornecedor'
    return {
      erro: `Este CPF já é de "${conflito.nome}", no fornecedor ${setorConflito}. `
        + 'Se as duas linhas forem a mesma pessoa, apague a duplicada antes de corrigir o CPF aqui.',
    }
  }

  const { error } = await supabaseAdmin.from('funcionarios').update({ cpf: novoCpf }).eq('id', funcionarioId)
  if (error) return { erro: mensagemAmigavel(error) }

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_CPF', campoAlterado: 'cpf',
    valorAnterior: atual.cpf, valorNovo: novoCpf, motivo: motivo ?? null,
    funcionarioId, eventoId,
  }))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true }
}

/**
 * Corrige o NOME de uma pessoa NESTE cadastro (um evento) — pedido do Juan, 08/10/2026: a ficha do colaborador já
 * deixava corrigir CPF, telefone e função, mas não o nome, que é exatamente o mesmo tipo de erro de digitação
 * (ou nome incompleto) no cadastro público. Mesma régua de `editarCpfFuncionario` — `conferirCorrecaoDeIdentidade`:
 * desde 09/10/2026 o supervisor também corrige, nos setores dele e com motivo.
 *
 * Para trocar o nome em TODOS os eventos da pessoa de uma vez, o caminho é a Base de funcionários
 * (`editarDadosDaPessoaNaBase`); aqui corrige só este cadastro.
 */
export async function editarNomeFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, novoNomeBruto: string, motivo?: string,
): Promise<{ ok: true } | { erro: string }> {
  const novoNome = (novoNomeBruto ?? '').replace(/\s+/g, ' ').trim()
  if (novoNome.length < 2 || novoNome.length > 120) return { erro: 'Informe um nome válido.' }

  const permissao = await conferirCorrecaoDeIdentidade(fornecedorId, eventoId, motivo, 'o nome')
  if ('erro' in permissao) return permissao
  const { perfil } = permissao

  const { data: atual } = await supabaseAdmin.from('funcionarios').select('id, nome, fornecedor_id').eq('id', funcionarioId).single()
  if (!atual || atual.fornecedor_id !== fornecedorId) return { erro: 'Funcionário não encontrado neste fornecedor.' }
  if (atual.nome === novoNome) return { ok: true } // nada mudou

  const { error } = await supabaseAdmin.from('funcionarios').update({ nome: novoNome }).eq('id', funcionarioId)
  if (error) return { erro: mensagemAmigavel(error) }

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_NOME', campoAlterado: 'nome',
    valorAnterior: atual.nome as string, valorNovo: novoNome, motivo: motivo ?? null,
    funcionarioId, eventoId,
  }))
  after(() => sincronizarFuncionarioNaPlanilha(funcionarioId).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true }
}

/**
 * Edita os DADOS DA PESSOA na Base de funcionários — só o master (pedido do
 * Juan, 06/10/2026): nome, telefone, cidade, chave PIX e CPF.
 *
 * A pessoa aparece uma vez por evento em `funcionarios`, então a edição vale
 * para TODOS os cadastros dela (o que a ficha mostra é a identidade, não um
 * evento). A função (`cargo`) fica de fora: ela muda de evento para evento.
 *
 * Mudar o CPF segue as mesmas travas de `editarCpfFuncionario`: dígito válido
 * e nenhum conflito com OUTRA pessoa dentro de um mesmo evento (senão duas
 * identidades se fundiriam). Cada campo que mudou vira uma linha de auditoria.
 */
export async function editarDadosDaPessoaNaBase(
  cpfAtualBruto: string,
  dados: { nome: string; cpf: string; telefone: string; cidade: string; chavePix: string },
): Promise<{ ok: true; cpf: string; cadastros: number } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !ehMaster(perfil.role)) return { erro: 'Só o master edita os dados da base.' }

    const cpfAtual = normalizarCpf(cpfAtualBruto)
    const { data: cadastros } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cidade, chave_pix, fornecedores!inner(evento_id)')
      .eq('cpf', cpfAtual)
    if (!cadastros?.length) return { erro: 'Esta pessoa não está mais na base.' }

    const nome = dados.nome.replace(/\s+/g, ' ').trim()
    if (nome.length < 2 || nome.length > 120) return { erro: 'Informe um nome válido.' }
    const telefone = dados.telefone.replace(/\D/g, '')
    if (telefone.length < 10 || telefone.length > 13) return { erro: 'Informe um telefone válido, com DDD.' }
    const cidade = grafiaDaCidade(dados.cidade) || null
    if (cidade && cidade.length > 80) return { erro: 'Cidade inválida — confira o que foi digitado.' }
    const chavePix = dados.chavePix.trim() || null
    if (chavePix && chavePix.length > 140) return { erro: 'Chave PIX inválida — confira o que foi digitado.' }

    const novoCpf = normalizarCpf(dados.cpf)
    if (!validarCpf(novoCpf)) return { erro: 'CPF inválido. Confira os 11 dígitos.' }

    // CPF novo: nenhum cadastro de OUTRA pessoa com ele nos eventos desta pessoa.
    if (novoCpf !== cpfAtual) {
      const eventos = [...new Set(cadastros.map(c => (c.fornecedores as unknown as { evento_id: string }).evento_id))]
      const { data: conflitos } = await supabaseAdmin
        .from('funcionarios').select('nome, fornecedores!inner(evento_id)')
        .eq('cpf', novoCpf).in('fornecedores.evento_id', eventos).limit(1)
      if (conflitos?.length) {
        return { erro: `O CPF ${formatCpf(novoCpf)} já é de "${conflitos[0].nome}" em um dos eventos desta pessoa. Se for a mesma pessoa, apague a duplicada antes.` }
      }
    }

    const ids = cadastros.map(c => c.id as string)
    const { error } = await supabaseAdmin.from('funcionarios')
      .update({ nome, telefone, cidade, chave_pix: chavePix, cpf: novoCpf }).in('id', ids)
    if (error) return { erro: mensagemAmigavel(error) }

    // Auditoria por campo que mudou, ligada ao cadastro mais recente.
    const ref = cadastros[0]
    const antes = { nome: ref.nome as string, cpf: ref.cpf as string, telefone: (ref.telefone as string | null) ?? '', cidade: (ref.cidade as string | null) ?? '', chave_pix: (ref.chave_pix as string | null) ?? '' }
    const depois = { nome, cpf: novoCpf, telefone, cidade: cidade ?? '', chave_pix: chavePix ?? '' }
    const eventoRef = (ref.fornecedores as unknown as { evento_id: string }).evento_id
    for (const campo of Object.keys(depois) as (keyof typeof depois)[]) {
      if (antes[campo] === depois[campo]) continue
      after(() => registrarAuditoria({
        perfil, acao: 'EDICAO_BASE_FUNCIONARIO', campoAlterado: campo,
        valorAnterior: antes[campo] || null, valorNovo: depois[campo] || null,
        motivo: `Editado na Base de funcionários (${ids.length} cadastro${ids.length === 1 ? '' : 's'})`,
        funcionarioId: ref.id as string, eventoId: eventoRef,
      }))
    }

    revalidatePath('/admin/base-funcionarios')
    revalidatePath(`/admin/pessoas/${cpfAtual}`)
    revalidatePath(`/admin/pessoas/${novoCpf}`)
    return { ok: true as const, cpf: novoCpf, cadastros: ids.length }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Marca/desmarca a baixa de pagamento do valor a receber do setor. */
export async function alternarPagamento(funcionarioId: string, fornecedorId: string, eventoId: string, pago: boolean) {
  const perfilPagamento = await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin

  // Pagamento só para quem está ativado
  if (pago) {
    const { data: func } = await db.from('funcionarios').select('ativo').eq('id', funcionarioId).single()
    if (func && func.ativo === false) {
      throw new Error('Este funcionário não está ativado. Ative-o antes de marcar o pagamento.')
    }
  }

  const { error } = await db.from('funcionarios').update({
    pago,
    pago_em: pago ? new Date().toISOString() : null,
  }).eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível atualizar o pagamento. Tente de novo.')
  auditar(perfilPagamento, 'PAGAMENTO_ALTERADO', {
    campoAlterado: 'Pagamento', eventoId, funcionarioId,
    valorAnterior: pago ? 'Não pago' : 'Pago', valorNovo: pago ? 'Pago' : 'Não pago',
  })
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Ativa/desativa um funcionário do setor.
 *
 * Sem teto: o limite por setor saiu e todo cadastro nasce ativo. Isto segue
 * servindo para o caso pontual — tirar quem desistiu, sem apagar o cadastro
 * nem o histórico dela.
 */
/**
 * Troca qual setor o supervisor está vendo.
 *
 * É o único ponto que escreve `perfis.fornecedor_id` para um supervisor em
 * uso normal — e é de propósito. Os vinte e nove lugares que comparam
 * `perfil.fornecedor_id` continuam significando "o setor aberto agora", sem
 * saber que existe mais de um; quem garante que a troca é legítima é esta
 * função, contra `supervisor_setores`.
 *
 * Ver supabase/upgrade-supervisor-multi-setor.sql para o desenho inteiro.
 *
 * Não trava mais em `role === 'supervisor'` (achado ao vivo, 05/10/2026,
 * caso da Mara Lúcia, mesmo raciocínio de `entrarNoEventoSupervisor`): a
 * consulta a `supervisor_setores` logo abaixo já barra quem não tem vínculo
 * NENHUM com este fornecedor, então travar também pelo papel principal só
 * escondia o vínculo de quem tem outro papel e ainda assim supervisiona.
 */
export async function trocarSetorAtivo(fornecedorId: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')

  const { data: vinculo, error } = await supabaseAdmin
    .from('supervisor_setores')
    .select('fornecedor_id')
    .eq('perfil_id', perfil.id)
    .eq('fornecedor_id', fornecedorId)
    .maybeSingle()

  /*
   * Sem o vínculo, não troca. A checagem é aqui e não na tela porque esconder
   * o botão não impede a chamada direta — e o que está do outro lado é a
   * equipe de outro cliente.
   *
   * `error` conta como negativa também: se a tabela ainda não existe (migração
   * pendente), ninguém troca de setor, que é o comportamento de antes.
   */
  if (error || !vinculo) throw new Error('Você não tem acesso a este fornecedor.')

  const { error: erroTroca } = await supabaseAdmin
    .from('perfis').update({ fornecedor_id: fornecedorId }).eq('id', perfil.id)
  if (erroTroca) throw new Error(mensagemAmigavel(erroTroca))

  const { data: setor } = await supabaseAdmin
    .from('fornecedores').select('evento_id').eq('id', fornecedorId).single()

  revalidatePath('/admin', 'layout')
  return { ok: true as const, eventoId: setor?.evento_id as string | undefined }
}

/**
 * "Meus eventos" (pedido do Juan, 02/10/2026) — o supervisor escolhe QUAL
 * EVENTO quer abrir agora, não só qual setor dentro do mesmo evento de
 * sempre. Grava o setor dele NAQUELE evento como ativo — mesma escrita de
 * `trocarSetorAtivo`, logo acima, só que a entrada é um evento (podem existir
 * vários setores dele dentro do mesmo evento; entra no primeiro, e a partir
 * daí "Meus fornecedores" troca entre eles como sempre).
 *
 * Funciona IGUAL para evento atual ou encerrado: `meusSetores` já devolve o
 * histórico inteiro, current ou não — ver o comentário em `acessosDoEvento`
 * sobre por que encerrar um evento não derruba mais o login do supervisor.
 *
 * Não trava mais em `role === 'supervisor'` (achado ao vivo, 05/10/2026,
 * caso da Mara Lúcia): quem tem outro papel principal mas GANHOU um
 * vínculo de supervisor também precisa entrar por aqui — `meusSetores` já
 * responde pela EXISTÊNCIA do vínculo (ver seu comentário), e o `if (!setor)`
 * logo abaixo já barra quem não tem vínculo NENHUM pra aquele evento, então
 * a proteção continua de pé sem depender do papel principal da conta.
 */
/*
 * Devolve `{error}` em vez de lançar — igual a `criarSupervisor` e demais
 * Server Actions chamadas direto do cliente. Lançar aqui some em produção: o
 * React Server Components troca qualquer `throw` não-capturado por "An error
 * occurred in the Server Components render", e o card de histórico sem
 * vínculo (ver `EscolherMeuEvento.tsx`) batia nesse exato caminho — achado ao
 * vivo, 05/10/2026, mesmo caso da Mara Lúcia.
 */
export async function entrarNoEventoSupervisor(
  eventoId: string,
  /**
   * O setor escolhido em "Selecione onde deseja atuar" (supervisor com mais
   * de um setor no evento). Ausente = o primeiro dele no evento, como antes.
   * Só vale se for MESMO dele e deste evento.
   */
  fornecedorId?: string,
): Promise<
  { ok: true; fornecedorId: string; eventoId: string; error?: undefined } | { ok?: undefined; error: string }
> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return { error: 'Sem permissão' }

    const meus = await meusSetores(perfil)
    const setor = fornecedorId
      ? meus.find(s => s.id === fornecedorId && s.evento_id === eventoId)
      : meus.find(s => s.evento_id === eventoId)
    if (!setor) return { error: 'Você não tem um vínculo de supervisor neste evento.' }

    const { error } = await supabaseAdmin.from('perfis').update({ fornecedor_id: setor.id }).eq('id', perfil.id)
    if (error) return { error: mensagemAmigavel(error) }

    revalidatePath('/admin', 'layout')
    return { ok: true as const, fornecedorId: setor.id, eventoId }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Ativa/desativa um funcionário. Supervisor do próprio setor, admin/master
 * da organização, ou suporte dentro do escopo — nunca por `exigirAcessoFuncionarios`
 * puro, de propósito: essa mesma checagem também guarda `atualizarValorReceber`
 * e `alternarPagamento` (financeiro), que o suporte NUNCA pode tocar. Juntar
 * os dois deixaria fácil, num ajuste futuro, abrir financeiro pro suporte
 * sem querer.
 */
export async function alternarAtivacao(funcionarioId: string, fornecedorId: string, eventoId: string, ativo: boolean, motivo?: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')

  if (perfil.role === 'supervisor') {
    // Todos os setores onde ele é supervisor, não só o ativo no momento (supervisor de vários setores era recusado nos outros).
    if (!(await alcancaSetor(perfil, fornecedorId))) throw new Error('Sem permissão sobre este fornecedor')
  } else {
    const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
    if (!evento) throw new Error('Evento não encontrado')
    const podeSempre = podeGerenciarEventos(perfil) && (ehMaster(perfil.role) || evento.organizacao_id === perfil.organizacao_id)
    if (!podeSempre) {
      if (perfil.role !== 'suporte') {
        // Quem tem vínculo de supervisor com este setor sem ter o papel principal (ex.: operador que também supervisiona).
        if (!(await meusSetores(perfil)).some(s => s.id === fornecedorId)) throw new Error('Sem permissão')
      } else {
        if (!(motivo ?? '').trim()) throw new Error(`Informe o motivo da ${ativo ? 'ativação' : 'desativação'}.`)
        if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) {
          throw new Error('Este evento não está no seu escopo de atendimento.')
        }
      }
    }
  }

  const db = supabaseAdmin
  const { error } = await db.from('funcionarios').update({ ativo }).eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível alterar a ativação desta pessoa. Tente de novo.')

  after(() => registrarAuditoria({
    perfil, acao: ativo ? 'ATIVACAO_FUNCIONARIO' : 'DESATIVACAO_FUNCIONARIO',
    // O de→para importa aqui mais do que em qualquer outra ação: a dúvida
    // que traz alguém à auditoria é "quem reativou fulano?", e sem os dois
    // estados escritos a linha não responde.
    campoAlterado: 'Situação no evento',
    valorAnterior: ativo ? 'Inativo' : 'Ativo',
    valorNovo: ativo ? 'Ativo' : 'Inativo',
    motivo: motivo ?? null, funcionarioId, eventoId,
  }))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Guarda de acesso pra aprovar/negar um credenciamento — cópia literal do
 * guard de `alternarAtivacao` (mesmos papéis, mesma ordem): supervisor só do
 * seu próprio setor, senão admin/master da organização, senão suporte com
 * escopo + motivo obrigatório. Sem `Role` novo — "gestor de credenciamento"
 * do pedido já é o que `admin` cobre hoje.
 */
async function exigirAcessoAAprovacao(fornecedorId: string, eventoId: string, motivo?: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')

  if (perfil.role === 'supervisor') {
    // Todos os setores onde ele é supervisor, não só o ativo no momento (supervisor de vários setores era recusado nos outros).
    if (!(await alcancaSetor(perfil, fornecedorId))) throw new Error('Sem permissão sobre este fornecedor')
  } else {
    const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
    if (!evento) throw new Error('Evento não encontrado')
    const podeSempre = podeGerenciarEventos(perfil) && (ehMaster(perfil.role) || evento.organizacao_id === perfil.organizacao_id)
    if (!podeSempre) {
      if (perfil.role !== 'suporte') {
        // Quem tem vínculo de supervisor com este setor sem ter o papel principal (ex.: operador que também supervisiona).
        if (!(await meusSetores(perfil)).some(s => s.id === fornecedorId)) throw new Error('Sem permissão')
      } else {
        if (!(motivo ?? '').trim()) throw new Error('Informe o motivo da decisão.')
        if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) {
          throw new Error('Este evento não está no seu escopo de atendimento.')
        }
      }
    }
  }
  return perfil
}

/**
 * Aprova um credenciamento pendente: libera o QR (via `status_credenciamento`)
 * e só AGORA agenda a mensagem de boas-vindas com o link da credencial — no
 * cadastro público ela fica represada de propósito (ver `cadastrarFuncionarioPublico`).
 *
 * Só age em cima de `pendente` — REGRA 10 do pedido (negado não volta a
 * aprovado num clique do mesmo botão; reabrir uma decisão é fora de escopo).
 */
export async function aprovarCredenciamento(
  funcionarioId: string, fornecedorId: string, eventoId: string,
  /**
   * Evento de subeventos: os dias em que o QR vai valer, confirmados pelo
   * supervisor na própria aprovação. Ausente = confirma exatamente os dias
   * que a pessoa escolheu. Ignorado para quem está fora da escala por dia.
   */
  diasAprovados?: string[],
): Promise<
  { ok?: false; error: string } | { ok: true }
> {
  try {
    const perfil = await exigirAcessoAAprovacao(fornecedorId, eventoId)

    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('status_credenciamento, telefone, qr_token, cpf').eq('id', funcionarioId).single()
    if (!func) return { error: 'Funcionário não encontrado.' }
    if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'pendente') {
      return { error: 'Este credenciamento já foi decidido.' }
    }

    /*
     * ESCALA POR DIA — a escala é confirmada ANTES do credenciamento: se os
     * dias não gravarem, a pessoa continua pendente (e não aprovada com um QR
     * que não vale dia nenhum).
     */
    /*
     * SEMPRE confere os dias quando o evento usa escala — não só quando a pessoa já tinha um `escala.status`
     * (pedido do Juan, 08/10/2026: "os dias precisa ser algo obrigatório"). Antes, cadastro sem dias escolhidos
     * (planilha, ou evento que ligou a escala depois) aprovava direto com ZERO dias — e o QR "valia todo dia", o
     * oposto do que se queria. `conferirDiasPermitidos` já recusa lista vazia com a frase pronta.
     *
     * EXCETO supervisor (pessoaEhSupervisor): esta pessoa pode estar presente em qualquer dia do evento, então os
     * dias "pedidos"/escolhidos na tela são ignorados e ela sai aprovada para TODOS os dias disponíveis.
     */
    const escala = await escalaDoFuncionario(funcionarioId)
    if (await eventoUsaEscalaPorDia(eventoId)) {
      const disponiveis = (await diasDaEscalaDoEvento(eventoId)).map(d => d.data)
      const souSupervisor = await pessoaEhSupervisor(func.cpf as string | null, eventoId)
      const pedidos = (escala?.dias ?? []).filter(d => d.selecionado).map(d => d.data)
      const conferido = souSupervisor
        ? conferirDiasPermitidos(disponiveis, disponiveis)
        : conferirDiasPermitidos(diasAprovados ?? pedidos, disponiveis)
      if (!conferido.ok) return { error: conferido.erro }
      const cheios = await diasAcimaDaTrava(fornecedorId, funcionarioId, conferido.dias, [])
      if (cheios) return { error: cheios }
      const gravado = await gravarEscalaAprovada({ funcionarioId, eventoId, aprovados: conferido.dias, perfilId: perfil.id })
      if (!gravado.ok) return { error: mensagemAmigavel(gravado.erro) }
      after(() => registrarAuditoria({
        perfil, acao: 'APROVACAO_ESCALA', campoAlterado: 'Dias de trabalho',
        valorAnterior: `Pedidos: ${listarDias(pedidos)}`, valorNovo: `Aprovados: ${listarDias(gravado.depois)}`,
        funcionarioId, eventoId,
      }))
      // Lembretes dos dias que ficaram de fora saem da fila (só desta pessoa).
      after(() => sincronizarAgendamentos(eventoId, { funcionarioId }).catch(console.error))
    }

    const { error } = await supabaseAdmin.from('funcionarios').update({
      status_credenciamento: 'aprovado', decidido_por: perfil.id, decidido_em: new Date().toISOString(),
      // Aprovar é dizer "entra": a pessoa sai daqui ATIVA, sempre. Evita o
      // estado "aprovado mas desativado" (QR bloqueado sem ninguém entender),
      // que aconteceu no Pontal Weekend com um clique errado na desativação.
      ativo: true,
    }).eq('id', funcionarioId)
    if (error) return { error: mensagemAmigavel(error) }

    after(() => registrarAuditoria({
      perfil, acao: 'APROVACAO_CREDENCIAMENTO', campoAlterado: 'Credenciamento',
      valorAnterior: 'Aguardando aprovação', valorNovo: 'Aprovado', funcionarioId, eventoId,
    }))
    after(() => agendarBoasVindasFuncionario({
      eventoId, funcionarioId, telefone: func.telefone as string,
    }).catch(console.error))

    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}/aprovacoes`)
    revalidatePath(`/credential/${func.qr_token}`)
    return { ok: true as const }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Trava por dia do setor na APROVAÇÃO: algum dia NOVO desta pessoa passaria
 * do limite? Dia que ela já tinha aprovado não conta (ajustar a escala não
 * pode tirar um dia que já valia só porque o setor encheu depois).
 * Devolve a mensagem de erro, ou null.
 */
async function diasAcimaDaTrava(
  fornecedorId: string, funcionarioId: string, dias: string[], jaAprovados: string[],
): Promise<string | null> {
  const novos = dias.filter(d => !jaAprovados.includes(d))
  if (!novos.length) return null
  const cheios = (await diasLotados(fornecedorId, 'aprovado', funcionarioId)).filter(d => novos.includes(d))
  if (!cheios.length) return null
  return `${listarDias(cheios)} já ${cheios.length === 1 ? 'atingiu' : 'atingiram'} o limite de pessoas aprovadas neste setor. Tire ${cheios.length === 1 ? 'esse dia' : 'esses dias'} ou aumente a trava.`
}

/**
 * Aprova VÁRIOS credenciamentos pendentes de uma vez — "Aprovar selecionados"
 * em Aguardando aprovação. Evento de 4 mil pessoas não se aprova um por um.
 *
 * Não tem regra própria: cada pessoa passa pela MESMA `aprovarCredenciamento`
 * (permissão, auditoria, boas-vindas). Em evento com escala por dia, aprova
 * com os dias que a pessoa pediu — quem precisa de ajuste, o supervisor abre
 * pelo nome. Cinco em paralelo, até 200 por clique: rápido sem afogar o
 * banco nem estourar o tempo da função.
 */
export async function aprovarCredenciamentosEmLote(
  itens: { funcionarioId: string; fornecedorId: string }[], eventoId: string,
): Promise<{ aprovados: number; falhas: { funcionarioId: string; erro: string }[] }> {
  const lote = itens.slice(0, 200)
  let aprovados = 0
  const falhas: { funcionarioId: string; erro: string }[] = []
  for (let i = 0; i < lote.length; i += 5) {
    const resultados = await Promise.all(
      lote.slice(i, i + 5).map(it => aprovarCredenciamento(it.funcionarioId, it.fornecedorId, eventoId)),
    )
    resultados.forEach((r, k) => {
      if (r.ok) aprovados++
      else falhas.push({ funcionarioId: lote[i + k].funcionarioId, erro: r.error })
    })
  }
  return { aprovados, falhas }
}

/**
 * O supervisor ajusta a escala de quem já está no evento (evento de
 * subeventos): troca um dia, acrescenta outro. A pessoa NÃO consegue mudar os
 * próprios dias depois do cadastro — o pedido passa por aqui. O QR passa a
 * respeitar a escala nova na leitura seguinte (a checagem é feita na hora,
 * em `conferirEscalaNoDia`, sem nada em cache).
 *
 * Mesma régua de permissão da aprovação do credenciamento.
 */
export async function ajustarEscalaDoFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, dias: string[], motivo?: string,
): Promise<{ ok?: false; error: string } | { ok: true }> {
  try {
    const perfil = await exigirAcessoAAprovacao(fornecedorId, eventoId, motivo)

    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('fornecedor_id, qr_token, cpf, fornecedores(evento_id)').eq('id', funcionarioId).maybeSingle()
    if (!func) return { error: 'Funcionário não encontrado.' }
    // A guarda acima confere o setor informado; aqui, que a pessoa É desse setor e desse evento.
    if (func.fornecedor_id !== fornecedorId || (func.fornecedores as unknown as { evento_id?: string } | null)?.evento_id !== eventoId) {
      return { error: 'Este funcionário não pertence a este fornecedor.' }
    }
    if (!(await eventoUsaEscalaPorDia(eventoId))) return { error: 'Este evento não usa escala por dia.' }

    const disponiveis = (await diasDaEscalaDoEvento(eventoId)).map(d => d.data)
    // Supervisor: todos os dias, sempre — ver `pessoaEhSupervisor`. Ignora `dias` e a trava de cota do setor.
    const souSupervisor = await pessoaEhSupervisor(func.cpf as string | null, eventoId)
    const conferido = conferirDiasPermitidos(souSupervisor ? disponiveis : dias, disponiveis)
    if (!conferido.ok) return { error: conferido.erro }
    if (!souSupervisor) {
      const jaAprovados = ((await escalaDoFuncionario(funcionarioId))?.dias ?? []).filter(d => d.aprovado).map(d => d.data)
      const cheios = await diasAcimaDaTrava(fornecedorId, funcionarioId, conferido.dias, jaAprovados)
      if (cheios) return { error: cheios }
    }

    const gravado = await gravarEscalaAprovada({ funcionarioId, eventoId, aprovados: conferido.dias, perfilId: perfil.id })
    if (!gravado.ok) return { error: mensagemAmigavel(gravado.erro) }

    after(() => registrarAuditoria({
      perfil, acao: 'AJUSTE_ESCALA', campoAlterado: 'Dias de trabalho',
      valorAnterior: listarDias(gravado.antes), valorNovo: listarDias(gravado.depois),
      motivo: (motivo ?? '').trim() || null, funcionarioId, eventoId,
    }))
    // Os lembretes acompanham a escala nova (dia tirado sai da fila, dia novo entra).
    after(() => sincronizarAgendamentos(eventoId, { funcionarioId }).catch(console.error))

    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}/aprovacoes`)
    revalidatePath(`/credential/${func.qr_token}`)
    return { ok: true as const }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Tudo que o modal de aprovação mostra de UMA pessoa: os dados do cadastro,
 * a situação do credenciamento e — em evento com escala por dia — os dias
 * do evento, os que ela pediu e os que já foram aprovados.
 *
 * Abre pelo nome, em "Aguardando aprovação" e na equipe do fornecedor. Mesma
 * régua de permissão de aprovar (`exigirAcessoAAprovacao`); o CPF vai inteiro
 * porque quem aprova precisa conferir a pessoa, como na tabela ao lado.
 */
export async function detalheDoCredenciamento(funcionarioId: string, fornecedorId: string, eventoId: string): Promise<
  { ok?: false; error: string } | { ok: true; detalhe: DetalheCredenciamento }
> {
  try {
    await exigirAcessoAAprovacao(fornecedorId, eventoId, 'consulta do credenciamento')
    const { data: f } = await supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cidade, cargo, origem, created_at, foto_perfil_path, status_credenciamento, motivo_negacao, decidido_em, decidido_por, fornecedor_id, fornecedores(nome, evento_id)')
      .eq('id', funcionarioId).maybeSingle()
    const setor = f?.fornecedores as unknown as { nome?: string; evento_id?: string } | null
    if (!f || f.fornecedor_id !== fornecedorId || setor?.evento_id !== eventoId) {
      return { error: 'Este funcionário não pertence a este fornecedor.' }
    }

    const [usaEscala, foto, decisor, subevento] = await Promise.all([
      eventoUsaEscalaPorDia(eventoId),
      f.foto_perfil_path
        ? supabaseAdmin.storage.from('presencas').createSignedUrl(f.foto_perfil_path as string, 60 * 60)
        : Promise.resolve({ data: null }),
      f.decidido_por
        ? supabaseAdmin.from('perfis').select('nome').eq('id', f.decidido_por as string).maybeSingle()
        : Promise.resolve({ data: null }),
      // Coluna nova, à parte e tolerante — mesmo cuidado da credencial.
      supabaseAdmin.from('funcionarios').select('subeventos(nome)').eq('id', funcionarioId).maybeSingle()
        .then(r => (r.data as unknown as { subeventos?: { nome?: string } | null } | null)?.subeventos?.nome ?? null, () => null),
    ])
    const diasDoEvento: DiaDaEscala[] = usaEscala ? await diasDaEscalaDoEvento(eventoId) : []
    const escala = usaEscala ? await escalaDoFuncionario(funcionarioId) : null
    const lotados = usaEscala ? await diasLotados(fornecedorId, 'aprovado', funcionarioId) : []
    const ehSupervisor = usaEscala ? await pessoaEhSupervisor(f.cpf as string | null, eventoId) : false

    return {
      ok: true,
      detalhe: {
        nome: f.nome as string,
        cpf: f.cpf as string,
        telefone: (f.telefone as string | null) ?? '',
        cidade: (f.cidade as string | null) ?? null,
        cargo: (f.cargo as string | null) ?? null,
        origem: (f.origem as string | null) ?? 'formulario',
        criadoEm: f.created_at as string,
        fotoUrl: foto.data?.signedUrl ?? null,
        setorNome: setor?.nome ?? '',
        subeventoNome: subevento,
        status: statusCredenciamentoValido(f.status_credenciamento as string),
        motivoNegacao: (f.motivo_negacao as string | null) ?? null,
        decididoEm: (f.decidido_em as string | null) ?? null,
        decididoPor: (decisor.data as { nome?: string } | null)?.nome ?? null,
        usaEscala,
        diasDoEvento,
        escala,
        lotados,
        ehSupervisor,
      },
    }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/** Nega um credenciamento pendente. Mesmas regras de `aprovarCredenciamento`. */
export async function negarCredenciamento(funcionarioId: string, fornecedorId: string, eventoId: string, motivo?: string): Promise<
  { ok?: false; error: string } | { ok: true }
> {
  try {
    const perfil = await exigirAcessoAAprovacao(fornecedorId, eventoId, motivo)

    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('status_credenciamento, telefone, qr_token').eq('id', funcionarioId).single()
    if (!func) return { error: 'Funcionário não encontrado.' }
    if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'pendente') {
      return { error: 'Este credenciamento já foi decidido.' }
    }

    const { error } = await supabaseAdmin.from('funcionarios').update({
      status_credenciamento: 'negado', decidido_por: perfil.id, decidido_em: new Date().toISOString(),
      motivo_negacao: (motivo ?? '').trim() || null,
    }).eq('id', funcionarioId)
    if (error) return { error: mensagemAmigavel(error) }

    after(() => registrarAuditoria({
      perfil, acao: 'NEGACAO_CREDENCIAMENTO', campoAlterado: 'Credenciamento',
      valorAnterior: 'Aguardando aprovação', valorNovo: 'Negado', motivo: motivo ?? null, funcionarioId, eventoId,
    }))
    after(() => agendarCredenciamentoNegado({
      eventoId, funcionarioId, telefone: func.telefone as string,
    }).catch(console.error))

    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}/aprovacoes`)
    revalidatePath(`/credential/${func.qr_token}`)
    return { ok: true as const }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Os setores (`fornecedor_id`) onde ESTE usuário pode aprovar/negar
 * credenciamento — mesmo escopo de `exigirAcessoAAprovacao`, mas pra ler em
 * vez de agir. `null` = todos (master). Usado pelo badge do menu e pela
 * tela de destino do item "Aguardando aprovação".
 */
async function setoresComAcessoAAprovacao(perfil: Awaited<ReturnType<typeof getPerfil>>): Promise<string[] | null> {
  if (!perfil) return []
  if (ehMaster(perfil.role)) return null

  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    return meus.map(s => s.id)
  }

  if (podeGerenciarEventos(perfil) && perfil.organizacao_id) {
    // Paginado: todos os setores de TODOS os eventos da organização passam fácil de 1.000.
    const data = await buscarTudo<{ id: string }>((de, ate) =>
      supabaseAdmin.from('fornecedores').select('id, eventos!inner(organizacao_id)')
        .eq('eventos.organizacao_id', perfil.organizacao_id).order('id').range(de, ate))
    return data.map(f => f.id)
  }

  if (perfil.role === 'suporte') {
    const { data: escopos } = await supabaseAdmin.from('suporte_escopo').select('evento_id, organizacao_id').eq('perfil_id', perfil.id)
    const eventoIds = (escopos ?? []).map(e => e.evento_id as string | null).filter((v): v is string => !!v)
    const orgIds = (escopos ?? []).map(e => e.organizacao_id as string | null).filter((v): v is string => !!v)
    if (!eventoIds.length && !orgIds.length) return []
    const condicoes: string[] = []
    if (eventoIds.length) condicoes.push(`evento_id.in.(${eventoIds.join(',')})`)
    if (orgIds.length) condicoes.push(`eventos.organizacao_id.in.(${orgIds.join(',')})`)
    // A consulta é montada DENTRO do callback: o construtor do Supabase é mutável e reaproveitá-lo entre páginas empilha filtros.
    const data = await buscarTudo<{ id: string }>((de, ate) =>
      supabaseAdmin.from('fornecedores').select('id, evento_id, eventos!inner(organizacao_id)')
        .or(condicoes.join(',')).order('id').range(de, ate))
    return data.map(f => f.id)
  }

  /*
   * Ninguém dos branches acima bateu (ex.: operador de portão) — mas pode
   * ter um vínculo de supervisor mesmo assim (achado ao vivo, 05/10/2026,
   * caso da Mara Lúcia). `meusSetores` já responde pela EXISTÊNCIA do
   * vínculo, não pelo papel principal — mesma régua usada em
   * `meuSetor`/`entrarNoEventoSupervisor`.
   */
  const meusVinculos = await meusSetores(perfil)
  if (meusVinculos.length) return meusVinculos.map(s => s.id)

  return []
}

/** Quantos credenciamentos pendentes este usuário pode decidir — pro numerozinho do menu. */
export async function contarPendentesDeAprovacao(): Promise<number> {
  const perfil = await getPerfil()
  if (!perfil) return 0
  const setorIds = await setoresComAcessoAAprovacao(perfil)
  if (setorIds && !setorIds.length) return 0

  return contarPendentes({ setorIds })
}

/**
 * Pendentes de aprovação, por CONTAGEM no banco (nunca lendo as linhas: o banco corta em
 * 1.000). Com lista de setores, soma por lotes — um `.in(...)` com centenas de setores
 * estoura o tamanho da URL e a resposta vinha vazia (o número do menu sumia).
 * `eventoId` restringe a um evento; `setorIds` nulo = sem restrição de setor (master).
 */
async function contarPendentes(filtro: { setorIds: string[] | null; eventoId?: string }): Promise<number> {
  const { setorIds, eventoId } = filtro
  const contar = async (ids: string[] | null) => {
    let q = supabaseAdmin
      .from('funcionarios').select('id, fornecedores!inner(evento_id)', { count: 'exact', head: true })
      .eq('status_credenciamento', 'pendente')
    if (eventoId) q = q.eq('fornecedores.evento_id', eventoId)
    if (ids) q = q.in('fornecedor_id', ids)
    const { count } = await q
    return count ?? 0
  }
  if (!setorIds) return contar(null)
  let total = 0
  for (const lote of emLotes(setorIds, 200)) total += await contar(lote)
  return total
}

/**
 * TODOS os eventos no escopo deste usuário, com o total de pendentes de
 * cada um (0 incluso) — alimenta a tela ponte `/admin/aprovacoes`, que
 * existe porque o menu é da plataforma inteira e a tela de decisão é de UM
 * evento.
 *
 * Antes só listava quem JÁ TINHA pendente, e pulava direto pra dentro
 * quando sobrava um só — pedido do Juan, 05/10/2026: a escolha do evento
 * precisa ser sempre explícita, mesmo sem nenhum pendente agora (mesma
 * régua já aplicada em Atividades do evento desde 09/09/2026: "um seletor
 * que some sozinho vira 'o sistema não filtra por evento' pra quem olha").
 */
export async function eventosComPendentesDeAprovacao(): Promise<{ id: string; nome: string; pendentes: number; ativo: boolean }[]> {
  const perfil = await getPerfil()
  if (!perfil) return []
  const setorIds = await setoresComAcessoAAprovacao(perfil)
  if (setorIds && !setorIds.length) return []

  let eventosQuery = supabaseAdmin.from('eventos').select('id, nome, ativo').order('data_inicio', { ascending: false })
  if (setorIds) {
    const eventoIds: string[] = []
    for (const lote of emLotes(setorIds, 200)) {
      const { data: fornecedores } = await supabaseAdmin.from('fornecedores').select('evento_id').in('id', lote)
      for (const f of fornecedores ?? []) if (!eventoIds.includes(f.evento_id as string)) eventoIds.push(f.evento_id as string)
    }
    if (!eventoIds.length) return []
    eventosQuery = eventosQuery.in('id', eventoIds)
  } else if (!ehMaster(perfil.role) && perfil.organizacao_id) {
    eventosQuery = eventosQuery.eq('organizacao_id', perfil.organizacao_id)
  }
  const { data: eventosData } = await eventosQuery
  if (!eventosData?.length) return []

  // Uma CONTAGEM por evento (nunca as linhas: o banco corta em 1.000 e o número de cada evento ficaria errado).
  const pendentesPorEvento = new Map<string, number>()
  await Promise.all(eventosData.map(async e => {
    pendentesPorEvento.set(e.id as string, await contarPendentes({ setorIds, eventoId: e.id as string }))
  }))

  return eventosData
    .map(e => ({
      id: e.id as string,
      nome: e.nome as string,
      ativo: e.ativo !== false,
      pendentes: pendentesPorEvento.get(e.id as string) ?? 0,
    }))
    .sort((a, b) => b.pendentes - a.pendentes)
}

export type CredenciamentoNegado = {
  id: string
  nome: string
  cpf: string
  telefone: string
  cargo: string | null
  eventoId: string
  eventoNome: string
  setorNome: string
  motivo: string | null
  negadoEm: string | null
  negadoPor: string | null
}

/**
 * Histórico dos credenciamentos NEGADOS que este usuário pode ver — e por
 * quem (pedido do Juan, 25/09/2026). Mesmo escopo de
 * `setoresComAcessoAAprovacao`: supervisor os próprios setores, admin a
 * organização, master tudo.
 *
 * O nome de quem negou vem numa consulta à parte (`decidido_por` →
 * `perfis`), em vez de um join embutido: não depende do nome da constraint
 * no banco pra funcionar.
 */
export async function historicoDeNegados(): Promise<CredenciamentoNegado[]> {
  const perfil = await getPerfil()
  if (!perfil) return []
  const setorIds = await setoresComAcessoAAprovacao(perfil)
  if (setorIds && !setorIds.length) return []

  let query = supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, telefone, cargo, motivo_negacao, decidido_em, decidido_por, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(nome))')
    .eq('status_credenciamento', 'negado')
    .order('decidido_em', { ascending: false })
    .limit(500)
  if (setorIds) query = query.in('fornecedor_id', setorIds)
  const { data } = await query

  const decisores = [...new Set((data ?? []).map(f => f.decidido_por as string | null).filter((v): v is string => !!v))]
  const { data: perfis } = decisores.length
    ? await supabaseAdmin.from('perfis').select('id, nome').in('id', decisores)
    : { data: [] as { id: string; nome: string }[] }
  const nomePorId = new Map((perfis ?? []).map(p => [p.id as string, p.nome as string]))

  return (data ?? []).map(f => {
    const fornecedor = f.fornecedores as unknown as { nome: string; evento_id: string; eventos: { nome: string } }
    return {
      id: f.id as string,
      nome: f.nome as string,
      cpf: f.cpf as string,
      telefone: f.telefone as string,
      cargo: (f.cargo as string | null) ?? null,
      eventoId: fornecedor.evento_id,
      eventoNome: fornecedor.eventos.nome,
      setorNome: fornecedor.nome,
      motivo: (f.motivo_negacao as string | null) ?? null,
      negadoEm: (f.decidido_em as string | null) ?? null,
      negadoPor: f.decidido_por ? (nomePorId.get(f.decidido_por as string) ?? null) : null,
    }
  })
}

/**
 * "Meu Crachá" — pedido do Juan, 24/09/2026: o supervisor também precisa se
 * credenciar no evento que supervisiona, pra passar pela portaria como
 * qualquer outra pessoa da equipe. Sem template de WhatsApp novo, sem
 * disparo novo, sem fluxo de aprovação novo, sem modelo de QR novo — é a
 * mesma linha em `funcionarios`, o mesmo QR, a mesma `/credential/[token]`
 * já usados por todo mundo.
 *
 * Ampliado em 24/09/2026 pro admin também: ele não tem um `fornecedor_id`
 * fixo (cobre o evento inteiro, não um setor), então quem chama por ele
 * escolhe o setor antes (tela `/admin/meu-cracha`) e manda o `fornecedorId`.
 * O supervisor continua sem escolher nada — usa o setor onde já está.
 *
 * Sob demanda: só cria o crachá quando a pessoa pedir pra ver o dela. Se já
 * existir um (mesmo CPF, mesmo evento — inclusive se ela já tinha virado
 * colaborador de outro setor antes), reaproveita em vez de duplicar, mesma
 * regra anti-duplicidade de `cadastrarFuncionarioPublico`.
 */
export async function garantirMeuCracha(fornecedorId?: string): Promise<{ qrToken: string } | { error: string }> {
  const perfil = await getPerfil()
  if (!perfil) return { error: 'Sem permissão.' }
  if (!perfil.cpf) return { error: 'Seu cadastro não tem CPF. Fale com o suporte.' }

  let alvoFornecedorId: string
  /*
   * Vale também pra quem tem outro papel principal mas GANHOU um vínculo
   * de supervisor (achado ao vivo, 05/10/2026, caso da Mara Lúcia).
   *
   * `perfil.fornecedor_id` é o setor ATIVO — pra ela, gravado quando entrou
   * no evento por "Meus eventos" (`entrarNoEventoSupervisor`), exatamente
   * como funciona pro supervisor de papel. Checar contra `meusSetores` (em
   * vez de só o papel) é o que permite os dois caminharem pelo MESMO branch
   * direto, sem cair no seletor "escolha o fornecedor" do admin — o
   * crachá dela é pessoal, não uma escolha administrativa.
   */
  let viaVinculo = false
  const meus = await meusSetores(perfil)
  /*
   * Escolheu um fornecedor que é DELE (supervisor em mais de um evento —
   * "Meu Crachá" pergunta de qual evento, pedido do Juan, 06/10/2026): esse
   * vence o setor ativo. Sem isto a escolha era ignorada e sempre abria o
   * crachá do evento em que ele entrou por último.
   */
  if (fornecedorId && meus.some(s => s.id === fornecedorId)) {
    alvoFornecedorId = fornecedorId
    viaVinculo = perfil.role !== 'supervisor'
  } else if (perfil.fornecedor_id && meus.some(s => s.id === perfil.fornecedor_id)) {
    alvoFornecedorId = perfil.fornecedor_id
    viaVinculo = perfil.role !== 'supervisor'
  } else if (perfil.role === 'supervisor') {
    return { error: 'Você ainda não está vinculado a um fornecedor.' }
  } else if (perfil.role === 'admin' || ehMaster(perfil.role)) {
    if (!fornecedorId) return { error: 'Escolha o fornecedor.' }
    alvoFornecedorId = fornecedorId
  } else {
    if (!fornecedorId) return { error: 'Escolha o fornecedor.' }
    if (!meus.some(s => s.id === fornecedorId)) return { error: 'Sem permissão sobre este fornecedor.' }
    alvoFornecedorId = fornecedorId
    viaVinculo = true
  }

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, eventos!inner(organizacao_id)')
    .eq('id', alvoFornecedorId)
    .single()
  if (!fornecedor) return { error: 'Fornecedor não encontrado.' }

  // Admin só num setor de evento da própria organização — o master, de qualquer uma.
  if (perfil.role === 'admin') {
    const orgDoEvento = (fornecedor.eventos as unknown as { organizacao_id: string }).organizacao_id
    if (orgDoEvento !== perfil.organizacao_id) return { error: 'Sem permissão sobre este fornecedor.' }
  }

  return crachaNoEvento({
    fornecedorId: alvoFornecedorId,
    eventoId: fornecedor.evento_id as string,
    organizacaoId: (fornecedor.eventos as unknown as { organizacao_id: string | null }).organizacao_id ?? perfil.organizacao_id,
    nome: perfil.nome,
    cpf: perfil.cpf,
    telefone: perfil.telefone ?? '',
    cargo: (perfil.role === 'supervisor' || viaVinculo) ? 'Supervisor' : 'Administração',
  })
}

/**
 * Acha ou cria o crachá (linha em `funcionarios`) desta pessoa NESTE evento.
 *
 * Um crachá por CPF por evento — mesma regra anti-duplicidade do cadastro
 * público: se a pessoa já estava na equipe de outro setor do mesmo evento
 * (virou supervisora depois), reaproveita o que existe. Um cadastro dela
 * ainda PENDENTE é aprovado aqui: quem virou supervisor já é gente de
 * confiança da operação, e ficar preso aguardando aprovação do próprio setor
 * não faz sentido. Um desativado de propósito continua desativado.
 *
 * Sem boas-vindas no WhatsApp: o supervisor já recebe o convite dele, e o
 * crachá é pra passar no portão, não pra virar mais uma mensagem.
 */
async function crachaNoEvento(p: {
  fornecedorId: string
  eventoId: string
  organizacaoId: string | null
  nome: string
  cpf: string
  telefone: string
  cargo: string
}): Promise<{ qrToken: string; criado: boolean } | { error: string }> {
  const { data: existentes } = await supabaseAdmin
    .from('funcionarios')
    .select('id, qr_token, status_credenciamento, fornecedor_id, subevento_id, fornecedores!inner(evento_id)')
    .eq('cpf', p.cpf)
    .eq('fornecedores.evento_id', p.eventoId)
    .limit(1)
  const existente = existentes?.[0]
  if (existente) {
    if (existente.status_credenciamento === 'pendente') {
      await supabaseAdmin.from('funcionarios')
        .update({ status_credenciamento: 'aprovado', decidido_em: new Date().toISOString() })
        .eq('id', existente.id)
    }
    /*
     * Autocorrige um crachá antigo (de antes do fix acima) sem subevento —
     * só quando o fornecedor do crachá é o mesmo que ele supervisiona
     * agora: fornecedor diferente é outra história (ver o comentário da
     * função) e não é este fix que decide pra qual subevento ele vai.
     */
    if (!existente.subevento_id && existente.fornecedor_id === p.fornecedorId) {
      try {
        const { data: forn } = await supabaseAdmin.from('fornecedores').select('subevento_id').eq('id', p.fornecedorId).maybeSingle()
        const subeventoId = (forn as { subevento_id?: string | null } | null)?.subevento_id ?? null
        if (subeventoId) await supabaseAdmin.from('funcionarios').update({ subevento_id: subeventoId }).eq('id', existente.id)
      } catch { /* migração pendente */ }
    }
    return { qrToken: existente.qr_token as string, criado: false }
  }

  const { data: novo, error } = await supabaseAdmin.from('funcionarios').insert([{
    fornecedor_id: p.fornecedorId,
    nome: p.nome,
    cpf: p.cpf,
    telefone: p.telefone,
    cargo: p.cargo,
    ativo: true,
    consentimento_base: true,
    consentimento_em: new Date().toISOString(),
    origem: 'supervisor',
  }]).select('id, qr_token').single()
  if (error || !novo) return { error: mensagemAmigavel(error) }

  /*
   * Subevento (Vital, 02/10/2026) — achado validando o fluxo de ponta a
   * ponta (pedido do Juan): o crachá do supervisor nascia SEM o subevento
   * do fornecedor dele, então o scanner com área configurada barrava o
   * PRÓPRIO supervisor como "área diferente", mesmo estando no fornecedor
   * certo. Consulta à parte e tolerante, mesmo padrão de sempre — coluna
   * nova, não pode derrubar a criação do crachá.
   */
  try {
    const { data: forn } = await supabaseAdmin.from('fornecedores').select('subevento_id').eq('id', p.fornecedorId).maybeSingle()
    const subeventoId = (forn as { subevento_id?: string | null } | null)?.subevento_id ?? null
    if (subeventoId) await supabaseAdmin.from('funcionarios').update({ subevento_id: subeventoId }).eq('id', novo.id)
  } catch { /* migração pendente */ }

  after(() => registrarCadastroFuncionario({
    funcionarioId: novo.id,
    nome: p.nome,
    eventoId: p.eventoId,
    organizacaoId: p.organizacaoId,
    origem: 'supervisor',
  }))

  return { qrToken: novo.qr_token, criado: true }
}

/**
 * Todo supervisor é também um funcionário ATIVO do setor que ele cobre — com
 * QR e na lista da equipe (pedido do Juan, 25/09/2026). Antes o crachá só
 * nascia quando ele abria "Meu Crachá"; quem nunca abriu passava no portão
 * sem credencial e não aparecia na equipe.
 *
 * Chamada em `vincularSupervisorAoSetor`, o ponto por onde TODO vínculo de
 * supervisor passa (criar novo, reaproveitar conta existente, outra função).
 * Nunca lança: falhar o crachá não pode desfazer o cadastro do supervisor —
 * "Meu Crachá" continua cobrindo o que escapar daqui.
 */
async function garantirCrachaDoSupervisorNoSetor(perfilId: string, fornecedorId: string): Promise<void> {
  try {
    const [{ data: perfil }, { data: fornecedor }] = await Promise.all([
      supabaseAdmin.from('perfis').select('nome, cpf, telefone').eq('id', perfilId).single(),
      supabaseAdmin.from('fornecedores').select('evento_id, eventos!inner(organizacao_id)').eq('id', fornecedorId).single(),
    ])
    if (!perfil?.cpf || !fornecedor) return
    const r = await crachaNoEvento({
      fornecedorId,
      eventoId: fornecedor.evento_id as string,
      organizacaoId: (fornecedor.eventos as unknown as { organizacao_id: string | null }).organizacao_id,
      nome: perfil.nome as string,
      cpf: perfil.cpf as string,
      telefone: (perfil.telefone as string | null) ?? '',
      cargo: 'Supervisor',
    })
    if ('error' in r) console.error('[supervisor] crachá não criado:', r.error)
  } catch (e) {
    console.error('[supervisor] falha inesperada ao criar o crachá', e)
  }
}

async function sincronizarValorNaPlanilha(funcionarioId: string, valor: number) {
  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('nome, fornecedores(nome, eventos(spreadsheet_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return
  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  if (!evento?.spreadsheet_id) return
  await atualizarValorNaPlanilha(evento.spreadsheet_id, fornecedor.nome, func.nome, valor)
}

// ─── Google Sheets ───────────────────────────────────────────────────────────

// `sincronizarFuncionarioNaPlanilha` mora em lib/internos-servidor.ts: função de servidor SEM login, que não pode ser endpoint público.

// `sincronizarRegistroNaPlanilha` mora em lib/internos-servidor.ts: função de servidor SEM login, que não pode ser endpoint público.

// ─── Jornadas recorrentes ("despertador") ────────────────────────────────────


// ─── Dias de trabalho do evento ───────────────────────────────────────────────

export type DiaDoEvento = {
  data: string
  tipo: 'principal' | 'preparacao'
  cancelado: boolean
  /** Já tem batida registrada — não pode ser desmarcado sem perder a prova. */
  temBatidas: boolean
  /** Só em dia principal EXTRA (o automático usa os campos únicos do evento). */
  entradaInicio: string | null
  entradaFim: string | null
  saidaInicio: string | null
  saidaFim: string | null
}

// `diasDoEvento` mora em lib/internos-servidor.ts: função de servidor SEM login, que não pode ser endpoint público.

/**
 * Salva quais dias este evento tem trabalho.
 *
 * O dia principal não entra na lista: ele é a data do evento e é mantido em
 * sincronia com ela aqui mesmo — se o produtor mudar a data do evento, o dia
 * principal se muda junto, senão o sistema ficaria cobrando ponto num dia que
 * não existe mais.
 *
 * Dia que já tem batida NUNCA é removido, mesmo que o produtor desmarque. A
 * linha é a prova de que aquele dia foi de trabalho; apagá-la transformaria a
 * ausência de alguém em "esse dia nem existia" no fechamento do pagamento.
 */
/**
 * Devolve o erro em vez de lançar (padrão de `criarSupervisor`): em produção o
 * Next esconde a mensagem de QUALQUER exceção de Server Action e a tela mostra
 * só "An error occurred in the Server Components render" — o produtor nunca
 * sabia o que corrigir (06/10/2026, dia principal extra do Vital).
 */
export async function salvarDiasDeTrabalho(eventoId: string, datas: string[]): Promise<
  | { ok: true; dias: number; preservados: number }
  | { ok?: false; error: string }
> {
  try {
    return await salvarDiasDeTrabalhoOuLanca(eventoId, datas)
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

async function salvarDiasDeTrabalhoOuLanca(eventoId: string, datas: string[]) {
  const perfilDias = await exigirEventoDaOrg(eventoId)

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, data_inicio, data_fim').eq('id', eventoId).single()
  if (!evento?.data_inicio) throw new Error('Este evento ainda não tem data definida.')

  const principal = diaBRT(evento.data_inicio as string)
  const periodo = periodoDoEvento(evento as EventoJanelas)!

  // ── O dia principal automático, sempre na data do evento ─────────────────
  const { data: principaisAtuais } = await supabaseAdmin
    .from('jornada_dias').select('id, data, entrada_inicio').eq('evento_id', eventoId).eq('tipo', 'principal')

  /*
   * Dias principais EXTRAS de verdade (a segunda noite de um festival, ver
   * `salvarDiasPrincipaisExtras`): estão dentro do período do evento E têm
   * horário próprio — mesmo critério de `garantirDiaPrincipal`. Protegidos
   * dos dois jeitos que esta função poderia destruí-los: no laço de
   * rebaixamento abaixo, E no filtro de `escolhidos` (que sem isto só
   * excluía a data do dia principal automático).
   */
  const protegidos = new Set(
    (principaisAtuais ?? [])
      .filter(a => a.data !== principal && a.entrada_inicio != null && (a.data as string) >= periodo.primeiro && (a.data as string) <= periodo.ultimo)
      .map(a => a.data as string),
  )

  const escolhidos = [...new Set((datas ?? []).map(d => String(d).slice(0, 10)))]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== principal && !protegidos.has(d))
    .sort()

  for (const antigo of principaisAtuais ?? []) {
    if (antigo.data === principal || protegidos.has(antigo.data as string)) continue
    // A data do evento mudou. Vira dia de preparação em vez de sumir: se
    // houve batida naquele dia, ela precisa continuar tendo um dia ao qual
    // pertencer.
    await supabaseAdmin.from('jornada_dias').update({ tipo: 'preparacao' }).eq('id', antigo.id)
  }

  await supabaseAdmin.from('jornada_dias').upsert(
    [{ evento_id: eventoId, jornada_id: null, data: principal, turno: 0, tipo: 'principal', cancelado: false }],
    { onConflict: 'evento_id,data,turno' },
  )

  // ── Os dias de preparação escolhidos ────────────────────────────────────
  if (escolhidos.length) {
    await supabaseAdmin.from('jornada_dias').upsert(
      escolhidos.map(data => ({
        evento_id: eventoId, jornada_id: null, data, turno: 0, tipo: 'preparacao', cancelado: false,
      })),
      { onConflict: 'evento_id,data,turno' },
    )
  }

  // ── Os desmarcados ──────────────────────────────────────────────────────
  const { data: todos } = await supabaseAdmin
    .from('jornada_dias').select('id, data').eq('evento_id', eventoId).eq('tipo', 'preparacao')
  const paraRemover = (todos ?? []).filter(d => !escolhidos.includes(d.data as string))

  let preservados = 0
  if (paraRemover.length) {
    const batidos = await diasComBatida(eventoId, paraRemover.map(d => d.data as string))

    const removiveis = paraRemover.filter(d => !batidos.has(d.data as string))
    preservados = paraRemover.length - removiveis.length
    if (removiveis.length) {
      await supabaseAdmin.from('jornada_dias').delete().in('id', removiveis.map(d => d.id))
    }
  }

  // Os dias mudaram, então os lembretes daquele evento mudam junto.
  after(() => sincronizarAgendamentos(eventoId).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/admin/eventos/${eventoId}/editar`)
  auditar(perfilDias, 'DIAS_DO_EVENTO_ALTERADOS', {
    campoAlterado: 'Dias de montagem/desmontagem', eventoId,
    valorNovo: curto(`${escolhidos.length ? listarDias(escolhidos) : 'nenhum dia extra'}${preservados ? ` · ${preservados} dia(s) mantido(s) por já terem batida` : ''}`, 300),
  })
  // Só os dias de preparação: o dia principal não é escolha do produtor, ele
  // é a data do evento, e contá-lo aqui faria o número divergir da tela.
  return { ok: true as const, dias: escolhidos.length, preservados }
}

export type DiaPrincipalExtra = {
  entradaInicio: string
  entradaFim?: string | null
  saidaInicio: string
  saidaFim?: string | null
}

/**
 * Dias principais EXTRAS de um evento — a segunda (ou terceira) noite de um
 * festival, cada uma com sua PRÓPRIA janela de entrada/saída (ver
 * lib/janelas.ts, que já prefere o horário do dia quando existir).
 *
 * Diferente de `salvarDiasDeTrabalho`: aqui os dois INÍCIOS (entrada e
 * saída) são sempre obrigatórios — são eles que impedem a "saída" de um dia
 * cair sem querer no horário configurado de OUTRO dia (o evento ou o dia
 * automático), misturando duas noites sem avisar ninguém. Os dois FINS são
 * opcionais: um dia principal pode ser aberto de propósito (sem hora pra
 * fechar), exatamente como o dia principal automático já permite hoje —
 * fim em aberto cai pro campo do evento, que também está em aberto, então
 * não há mistura nenhuma.
 */
export async function salvarDiasPrincipaisExtras(eventoId: string, dias: DiaPrincipalExtra[]): Promise<
  | { ok: true; dias: number; preservados: number }
  | { ok?: false; error: string }
> {
  // Devolve o erro em vez de lançar — ver `salvarDiasDeTrabalho`.
  try {
    return await salvarDiasPrincipaisExtrasOuLanca(eventoId, dias)
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

async function salvarDiasPrincipaisExtrasOuLanca(eventoId: string, dias: DiaPrincipalExtra[]) {
  const perfilDias = await exigirEventoDaOrg(eventoId)

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, data_inicio, data_fim').eq('id', eventoId).single()
  if (!evento?.data_inicio) throw new Error('Este evento ainda não tem data definida.')

  const diaAutomatico = diaBRT(evento.data_inicio as string)
  const periodo = periodoDoEvento(evento as EventoJanelas)!

  const normalizados = (dias ?? []).map(d => ({
    entradaInicio: inputParaISO(d.entradaInicio),
    entradaFim: d.entradaFim ? inputParaISO(d.entradaFim) : null,
    saidaInicio: inputParaISO(d.saidaInicio),
    saidaFim: d.saidaFim ? inputParaISO(d.saidaFim) : null,
  }))

  for (const d of normalizados) {
    if (!d.entradaInicio || !d.saidaInicio) {
      throw new Error('Preencha ao menos o início de entrada e o início de saída de cada dia principal extra.')
    }
    /*
     * Saída ANTES da entrada, sem horário de fim: o caso mais comum de dia
     * extra que vira a madrugada — a saída das 01:30 pertence ao dia SEGUINTE,
     * e o seletor de data não troca o dia sozinho. A regra geral logo abaixo
     * bloquearia com "o evento está terminando antes de começar", que não diz
     * o que fazer; aqui a mensagem aponta o campo e a data certa.
     */
    const antes = new Date(d.saidaInicio).getTime() < new Date(d.entradaInicio).getTime()
    if (antes && !d.saidaFim) {
      const diaSeguinte = somarDias(diaBRT(d.saidaInicio), 1).split('-').reverse().slice(0, 2).join('/')
      throw new Error(
        `A saída (${formatarBR(d.saidaInicio, 'curto')}) está antes da entrada (${formatarBR(d.entradaInicio, 'curto')}). ` +
        `Se a saída é de madrugada, escolha o DIA SEGUINTE (${diaSeguinte}) no início da saída — ou preencha o fim da saída.`,
      )
    }
    // Mesma checagem do dia principal automático (o erro do Kleber Andrade
    // pode acontecer em qualquer dia principal, não só no primeiro).
    exigirHorariosCoerentes({
      data_inicio: d.entradaInicio,
      data_fim: d.saidaFim ?? d.saidaInicio,
      janela_entrada_inicio: d.entradaInicio,
      janela_entrada_fim: d.entradaFim,
      janela_fim_inicio: d.saidaInicio,
      janela_fim_fim: d.saidaFim,
    })
  }

  const linhas = normalizados.map(d => ({ ...d, data: diaBRT(d.entradaInicio!) }))

  for (const l of linhas) {
    if (l.data === diaAutomatico) {
      throw new Error('Esta data já é o dia principal automático do evento (definido pela Data de início).')
    }
    if (l.data < periodo.primeiro || l.data > periodo.ultimo) {
      throw new Error(`${l.data} está fora do período do evento (${periodo.primeiro} a ${periodo.ultimo}).`)
    }
  }
  const datasComMesmoDia = new Set(linhas.map(l => l.data))
  if (datasComMesmoDia.size !== linhas.length) {
    throw new Error('Duas entradas caíram no mesmo dia — confira os horários (cada dia principal extra precisa cair numa data diferente).')
  }

  const { data: existentes } = await supabaseAdmin
    .from('jornada_dias').select('id, data').eq('evento_id', eventoId).eq('tipo', 'principal').neq('data', diaAutomatico)

  const batidos = await diasComBatida(eventoId, (existentes ?? []).map(e => e.data as string))

  // Sai da lista + sem batida = volta a ser preparação. Com batida, preserva
  // (mesma régua de `salvarDiasDeTrabalho`).
  let preservados = 0
  for (const antigo of existentes ?? []) {
    if (datasComMesmoDia.has(antigo.data as string)) continue
    if (batidos.has(antigo.data as string)) { preservados++; continue }
    await supabaseAdmin.from('jornada_dias').update({ tipo: 'preparacao' }).eq('id', antigo.id)
  }

  if (linhas.length) {
    const { error } = await supabaseAdmin.from('jornada_dias').upsert(
      linhas.map(l => ({
        evento_id: eventoId, jornada_id: null, data: l.data, turno: 0, tipo: 'principal' as const, cancelado: false,
        entrada_inicio: l.entradaInicio, entrada_fim: l.entradaFim,
        saida_inicio: l.saidaInicio, saida_fim: l.saidaFim,
      })),
      { onConflict: 'evento_id,data,turno' },
    )
    if (error) throw new Error(mensagemAmigavel(error))
  }

  after(() => sincronizarAgendamentos(eventoId).catch(console.error))
  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/admin/eventos/${eventoId}/editar`)
  auditar(perfilDias, 'DIAS_DO_EVENTO_ALTERADOS', {
    campoAlterado: 'Dias principais extras', eventoId,
    valorNovo: curto(`${linhas.length ? linhas.map(l => `${formatarBR(l.entradaInicio, 'curto')}–${formatarBR(l.saidaFim ?? l.saidaInicio, 'curto')}`).join(', ') : 'nenhum'}${preservados ? ` · ${preservados} mantido(s) por já terem batida` : ''}`, 300),
  })
  return { ok: true as const, dias: linhas.length, preservados }
}

// ─── Presença: QR (entrada/saída) + foto (meio) ───────────────────────────────
//
// Regra do fluxo: QR CODE escaneado na ENTRADA, FOTO tirada pelo próprio
// funcionário DURANTE o evento (meio), e QR CODE escaneado na SAÍDA (fim).
//
// Os horários dessas etapas seguem `lib/janelas.ts`: entrada e saída são
// livres em qualquer dia do período (o dia principal do evento é a exceção,
// onde a janela configurada continua travando), e o meio abre quatro horas
// depois da entrada REAL de cada pessoa.

export type MomentoPresenca = 'entrada' | 'meio' | 'fim'

const JANELA_SELECT = 'data_inicio, data_fim, batida_livre, checkin_autonomo, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim'

/**
 * A entrada que ancora o turno atual desta pessoa.
 *
 * É a peça central do modelo novo: o meio é contado a partir dela, e é ela que
 * decide a que DIA a saída pertence. Quem entrou 22:00 e sai 04:00 fecha o dia
 * anterior, não o de hoje.
 *
 * O teto (`TETO_TURNO_H`) existe pra uma entrada esquecida da semana passada
 * não capturar a saída de hoje.
 */
/**
 * Quanto tempo depois da ENTRADA o scanner passa a aceitar a saída.
 *
 * Trava contra a leitura dupla acidental no portão: o QR continua na tela
 * da pessoa, o operador aponta a câmera de novo sem querer, e a entrada
 * que acabou de ser gravada virava entrada + saída no mesmo minuto. Vale
 * só pro scanner (`inferirMomentoQR`) — o registro assistido com foto e o
 * lançamento manual não passam por aqui, de propósito: os dois são
 * conscientes, e o manual existe justamente pra consertar o que o portão
 * errou.
 */
const CARENCIA_SAIDA_MIN = 5

async function entradaDoTurno(funcionarioId: string, eventoId: string, agora: Date) {
  const desde = new Date(agora.getTime() - TETO_TURNO_H * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('registros')
    .select('id, data_ref, created_at')
    .eq('funcionario_id', funcionarioId)
    .eq('evento_id', eventoId)
    .eq('tipo', 'entrada')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
  const r = data?.[0]
  if (!r) return null
  return {
    em: r.created_at as string,
    dataRef: (r.data_ref as string | null) ?? diaBRT(r.created_at as string),
  }
}

/**
 * Decide sozinho se esta leitura de QR é ENTRADA ou SAÍDA — a pessoa no
 * portão não escolhe mais o botão, e o operador também não.
 *
 * Regra pedida pelo Juan (03/09/2026): os dois botões (Entrada/Saída)
 * confundiam quem estava escaneando, com fila andando. Primeira leitura do
 * turno = entrada. Segunda = saída. Terceira NO MESMO DIA = recusada — a
 * pessoa já fechou o dia, e deixar passar criaria uma segunda entrada por
 * cima da saída que já valeu.
 *
 * ── O BUG QUE ESTA ORDEM CORRIGE (03/09/2026, manhã) ──────────────────
 *
 * A primeira versão perguntava só "o turno de `entradaDoTurno` já tem
 * saída?" — e `entradaDoTurno` olha os últimos TETO_TURNO_H (18h), janela
 * que existe pro turno que vira a madrugada. Só que 18h atrás também
 * alcança a TARDE DE ONTEM: quem entrou 17h e saiu 20h ontem chegava hoje
 * de manhã, o sistema achava aquele turno de ontem (fechado) e recusava
 * com "já registrou entrada e saída hoje" — sendo que hoje ela não tinha
 * registrado nada. Parou a portaria numa manhã de montagem.
 *
 * A ordem certa é decidir pelo que está ABERTO primeiro, e só depois
 * perguntar sobre o dia de hoje:
 *
 *   1. Turno em aberto (entrada sem saída, dentro de TETO_TURNO_H)?
 *      → é a SAÍDA. É isto que fecha certo quem virou a madrugada.
 *      Exceto se a entrada foi agorinha — ver CARENCIA_SAIDA_MIN.
 *   2. Já tem entrada E saída com a data de HOJE? → recusa (3ª leitura).
 *   3. Caso contrário → ENTRADA. Dia novo, turno novo.
 */
/**
 * O que a leitura de agora significa: entrada, saída, ou a volta de quem já
 * tinha ido embora hoje.
 *
 * `reabrir` é o terceiro caso, e existe porque o banco não aceita duas
 * entradas no mesmo dia (índice único `registros_unico_por_dia`). Quem sai no
 * almoço e volta à tarde não consegue uma entrada nova — então a volta APAGA
 * a saída daquele dia e o turno fica aberto de novo, com a chegada original
 * preservada. A próxima leitura vira a saída final.
 *
 * O que se perde com isso é o intervalo: o relatório mostra 08:00 → 20:00,
 * não os dois blocos. Foi decisão do Juan em 05/09/2026, com o evento em
 * andamento; a versão completa (vários turnos por dia) precisa trocar aquele
 * índice e reescrever as leituras de presença do sistema inteiro. A saída
 * apagada não some: vai pra Auditoria com o horário.
 */
/**
 * O botão ENTRADA/SAÍDA escolhido pelo operador manda, sem gente nenhuma —
 * simplificação pedida pelo Juan (28/09/2026), depois de três bugs reais
 * seguidos virem da mesma complicação (janela de horário, dia marcado como
 * trabalho, carência de alguns minutos, turno "ainda aberto" só dentro de
 * um teto de horas): "não importa quantas vezes a pessoa passe o rosto, se
 * bater uma vez é uma entrada, se bater a segunda é uma saída, se bater a
 * terceira é outra entrada, assim por diante." A única coisa que o sistema
 * ainda decide sozinho é qual das duas isto é — o CONTEÚDO de cada uma
 * (quando, quem, em qual evento) sempre foi e continua sendo o que o
 * operador escolheu e a leitura identificou.
 *
 * `escolhido` só falta em caminhos antigos que não passam pelo botão — pra
 * esses, a régua completa (abaixo, no "sem botão") continua de pé.
 */
async function entradaEmAberto(funcionarioId: string, eventoId: string) {
  const { data } = await supabaseAdmin
    .from('registros')
    .select('id, data_ref, created_at')
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', 'entrada')
    .order('created_at', { ascending: false })
    .limit(1)
  const e = data?.[0]
  if (!e) return null
  const { data: fim } = await supabaseAdmin
    .from('registros')
    .select('id')
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', 'fim')
    .eq('data_ref', e.data_ref as string).gt('created_at', e.created_at as string)
    .limit(1)
  if (fim?.length) return null
  return { em: e.created_at as string, dataRef: e.data_ref as string }
}

async function inferirMomentoQR(
  funcionarioId: string, eventoId: string, agora: Date,
  /**
   * O que quem chama JÁ buscou — o scanner busca os dois em paralelo com o
   * resto da leitura, em vez de pagar mais duas idas ao banco em série aqui.
   * Omitido, é buscado aqui mesmo (mesmo resultado). Só vale pro caminho
   * "sem botão" — o caminho com botão sempre busca fresco (ver `entradaEmAberto`).
   */
  pre?: { entrada?: Awaited<ReturnType<typeof entradaDoTurno>>; diaTurno?: string },
  escolhido?: 'entrada' | 'fim',
): Promise<
  | { momento: 'entrada' | 'fim'; entrada?: { em: string; dataRef: string } }
  | { reabrir: { id: string; em: string; dataRef: string } }
  | { erro: string; recente?: boolean }
> {
  if (escolhido) {
    const aberta = await entradaEmAberto(funcionarioId, eventoId)
    if (escolhido === 'fim') {
      if (aberta) return { momento: 'fim', entrada: aberta }
      return { erro: 'Esta pessoa não tem entrada em aberto pra fechar. Se ela está chegando, use o botão ENTRADA.' }
    }
    // escolhido === 'entrada'
    if (aberta) {
      return { erro: `Entrada já registrada às ${formatarBR(aberta.em, 'hora')}. Se a pessoa está saindo, use o botão SAÍDA.`, recente: true }
    }
    /*
     * Sem turno aberto. O banco não aceita duas entradas no mesmo
     * `data_ref` (índice único) — se já existe um par entrada+saída fechado
     * HOJE, esta entrada REABRE aquele dia (a saída vira pausa) em vez de
     * tentar duplicar a linha. De outro dia, é só uma entrada nova.
     */
    const hoje = pre?.diaTurno ?? await diaDoTurno(eventoId, agora)
    const { data: fechadoHoje } = await supabaseAdmin
      .from('registros')
      .select('id, created_at')
      .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId)
      .eq('tipo', 'fim').eq('data_ref', hoje)
      .order('created_at', { ascending: false })
      .limit(1)
    const f = fechadoHoje?.[0]
    if (f) return { reabrir: { id: f.id as string, em: f.created_at as string, dataRef: hoje } }
    return { momento: 'entrada' }
  }

  // ─── SEM BOTÃO (caminhos antigos que não escolhem) ─────────────────────
  const entrada = pre && 'entrada' in pre ? pre.entrada ?? null : await entradaDoTurno(funcionarioId, eventoId, agora)
  const hoje = pre?.diaTurno ?? await diaDoTurno(eventoId, agora)

  if (entrada) {
    /*
     * A saída só FECHA esta entrada se veio DEPOIS dela.
     *
     * Quem dobra o turno tem duas jornadas no mesmo `data_ref`: sai 08:46
     * da manhã, volta 18:21 da noite e vai embora só às 08:00 do dia
     * seguinte (caso real do Juan, 03/09/2026). Perguntar só "existe
     * saída neste dia?" acha a saída DA MANHÃ, conclui que o turno da
     * noite está fechado, e manda ENTRADA pra quem está indo embora —
     * jogando fora a saída de quem virou a noite trabalhando.
     */
    const { data: fimDoTurno } = await supabaseAdmin
      .from('registros')
      .select('created_at')
      .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId)
      .eq('tipo', 'fim').eq('data_ref', entrada.dataRef)
      .gt('created_at', entrada.em)
      .limit(1)

    if (!fimDoTurno?.length) {
      /*
       * Turno aberto: a leitura de agora seria a saída. Mas se a ENTRADA
       * acabou de acontecer, quase certamente é a mesma pessoa sendo lida
       * duas vezes seguidas — o QR fica na tela, o operador aponta a câmera
       * de novo, e o que era pra ser uma entrada virava entrada + saída
       * imediata. Tirar os botões resolveu a confusão de escolher a etapa
       * errada, mas não esta (relato do Juan, 03/09/2026).
       *
       * Ninguém trabalha 5 minutos: dentro da carência a segunda leitura é
       * recusada com um aviso que explica ao operador o que aconteceu, em
       * vez de gravar uma saída falsa. Passados os 5 minutos, a saída
       * registra normalmente — quem de fato entrou e precisou sair logo
       * depois só espera um pouco.
       */
      const desdeEntradaMs = agora.getTime() - new Date(entrada.em).getTime()
      const carenciaMs = CARENCIA_SAIDA_MIN * 60 * 1000
      if (desdeEntradaMs < carenciaMs) {
        const faltam = Math.max(1, Math.ceil((carenciaMs - desdeEntradaMs) / 60_000))
        return {
          erro: `Esta pessoa acabou de registrar a ENTRADA (às ${formatarBR(entrada.em, 'hora')}). `
            + `Se for saída mesmo, aguarde ${faltam} min e leia de novo.`,
          recente: true,
        }
      }
      return { momento: 'fim' }
    }
  }

  /*
   * Nenhum turno aberto. Só recusa se o par entrada+saída for DE HOJE —
   * turno fechado de ontem não bloqueia o dia de hoje (era exatamente o
   * bug acima).
   *
   * "Hoje" é o dia do TURNO, não o do calendário (`diaDoTurno`): às 05:15 do
   * dia 26 a noite de 25 ainda está acontecendo. Com o calendário, a leitura
   * dupla na despedida (saída 05:15, QR lido de novo 05:15) virava ENTRADA
   * do dia 26 — Pontal Weekend, 26/09/2026.
   */
  const { data: deHoje } = await supabaseAdmin
    .from('registros')
    .select('id, tipo, created_at')
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId)
    .eq('data_ref', hoje)
    .in('tipo', ['entrada', 'fim'])

  const entradaHoje = (deHoje ?? []).find(r => r.tipo === 'entrada')
  const saidaHoje = (deHoje ?? []).find(r => r.tipo === 'fim')

  // O sistema decide sozinho (como sempre foi, pra quem não manda `escolhido`).
  if (entradaHoje && saidaHoje) {
    /*
     * Ela já foi embora hoje e está de volta — caso real: sai no almoço,
     * volta à tarde. Antes era recusa seca, e a pessoa ficava no portão sem
     * poder voltar a trabalhar.
     *
     * A carência é a mesma da saída, e pelo mesmo motivo: sem ela, o QR lido
     * duas vezes seguidas na despedida apagaria a saída que acabou de ser
     * gravada. Ninguém vai embora e volta em cinco minutos.
     */
    const desdeSaidaMs = agora.getTime() - new Date(saidaHoje.created_at as string).getTime()
    const carenciaMs = CARENCIA_SAIDA_MIN * 60 * 1000
    if (desdeSaidaMs < carenciaMs) {
      const faltam = Math.max(1, Math.ceil((carenciaMs - desdeSaidaMs) / 60_000))
      return {
        erro: `Esta pessoa acabou de registrar a SAÍDA (às ${formatarBR(saidaHoje.created_at as string, 'hora')}). `
          + `Se ela está voltando a trabalhar, aguarde ${faltam} min e leia de novo.`,
        recente: true,
      }
    }
    return { reabrir: { id: saidaHoje.id as string, em: saidaHoje.created_at as string, dataRef: hoje } }
  }

  /*
   * Entrou HOJE (no dia do turno) e ainda não saiu: é a SAÍDA — mesmo que a
   * entrada já tenha passado de TETO_TURNO_H.
   *
   * Pontal Weekend, 26/09/2026: gente chegou às 11h pra uma noite que acaba
   * às 08:00 do dia seguinte — 20h de turno. Passadas as 18h, `entradaDoTurno`
   * não achava mais a entrada, e a leitura da despedida virava "entrada" →
   * "Entrada já registrada", sem gravar a saída. Aqui o dia do turno é o
   * certo (`diaDoTurno`), então não há risco de pegar a entrada de outro dia.
   */
  if (entradaHoje && !saidaHoje) {
    const desdeEntradaMs = agora.getTime() - new Date(entradaHoje.created_at as string).getTime()
    const carenciaMs = CARENCIA_SAIDA_MIN * 60 * 1000
    if (desdeEntradaMs < carenciaMs) {
      const faltam = Math.max(1, Math.ceil((carenciaMs - desdeEntradaMs) / 60_000))
      return {
        erro: `Esta pessoa acabou de registrar a ENTRADA (às ${formatarBR(entradaHoje.created_at as string, 'hora')}). `
          + `Se for saída mesmo, aguarde ${faltam} min e leia de novo.`,
        recente: true,
      }
    }
    return { momento: 'fim' }
  }

  // Depois do fim do evento (hoje não é dia de trabalho): a saída do turno
  // que ficou aberto — ver `turnoAbertoForaDoDiaDeTrabalho`.
  if (!entradaHoje) {
    const aberto = await turnoAbertoForaDoDiaDeTrabalho(funcionarioId, eventoId, hoje, agora)
    if (aberto) return { momento: 'fim', entrada: aberto }
  }
  return { momento: 'entrada' }
}

type DiaDeTrabalho = DiaDaJornada & { id: string; data: string }

/**
 * Turno ainda aberto quando o dia de AGORA não é dia de trabalho — a saída
 * depois do fim do evento.
 *
 * Pontal Weekend, 27/09/2026: a última noite acaba às 08:00, mas tem gente
 * que sai às 08:30. Depois das 08:00 o dia do turno já é 27 (que não é dia de
 * trabalho), e quem entrou antes das 14h do dia 26 já passou das 18h de
 * TETO_TURNO_H — a leitura virava "entrada" e era recusada ("27/09 não está
 * marcado como dia de trabalho"). A saída tem que acontecer, com o
 * descredenciamento (pedido do Juan).
 *
 * Só vale quando HOJE não é dia de trabalho: num dia normal, uma entrada
 * antiga sem saída NÃO pode capturar a leitura (era o bug de 26/09, em que a
 * chegada virava saída da noite anterior). Aqui não há o que capturar por
 * engano — uma entrada seria recusada de qualquer jeito.
 */
async function turnoAbertoForaDoDiaDeTrabalho(
  funcionarioId: string, eventoId: string, diaTurno: string, agora: Date,
): Promise<{ em: string; dataRef: string } | null> {
  const dia = await diaDeTrabalho(eventoId, diaTurno)
  if (dia && !dia.cancelado) return null // hoje é dia de trabalho: regra normal

  const desde = new Date(agora.getTime() - 36 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('registros')
    .select('data_ref, created_at')
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', 'entrada')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
  const e = data?.[0]
  if (!e) return null
  const dataRef = (e.data_ref as string | null) ?? diaBRT(e.created_at as string)
  const { data: fim } = await supabaseAdmin
    .from('registros')
    .select('id')
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', 'fim')
    .eq('data_ref', dataRef).gt('created_at', e.created_at as string)
    .limit(1)
  return fim?.length ? null : { em: e.created_at as string, dataRef }
}

/**
 * O dia de trabalho do evento naquela data — ou `null` se aquele dia não foi
 * marcado como dia de trabalho.
 *
 * É o `null` que faz o relatório de fechamento existir: sem ele, qualquer data
 * seria dia de trabalho e "estava escalado para 5 dias e veio em 4" não teria
 * como ser respondido.
 */
async function diaDeTrabalho(eventoId: string, data: string): Promise<DiaDeTrabalho | null> {
  const { data: dias } = await supabaseAdmin
    .from('jornada_dias')
    .select('id, data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', eventoId)
    .eq('data', data)
    .order('turno')
    .limit(1)
  if (dias?.[0]) return dias[0] as DiaDeTrabalho

  /*
   * Rede de segurança: o dia principal se conserta sozinho.
   *
   * Se a data pedida é a data do próprio evento e mesmo assim não existe linha
   * de jornada, o evento nasceu incompleto — e a pessoa está no portão agora,
   * com o QR na mão, ouvindo que hoje "não é dia de trabalho deste evento".
   * Materializar aqui custa uma consulta no caminho de falha e evita que uma
   * lacuna de cadastro vire equipe parada.
   *
   * Só vale para o dia do evento. Qualquer outra data continua sendo recusada:
   * é o que impede bater ponto num dia que ninguém marcou.
   */
  const { data: ev } = await supabaseAdmin
    .from('eventos').select('data_inicio, data_fim').eq('id', eventoId).single()
  if (!ev?.data_inicio || diaBRT(ev.data_inicio) !== data) return null

  console.warn(`[jornada] evento ${eventoId} estava sem o dia principal ${data}; criando agora`)
  await garantirDiaPrincipal(eventoId, ev.data_inicio, ev.data_fim)
  const { data: novo } = await supabaseAdmin
    .from('jornada_dias')
    .select('id, data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', eventoId).eq('data', data).order('turno').limit(1)
  return (novo?.[0] as DiaDeTrabalho | undefined) ?? null
}

type Resolucao =
  | { ok: false; erro: string }
  | {
      ok: true
      dataRef: string
      jornadaDiaId: string | null
      /** Dia principal do evento — é o que dispara o descredenciamento na saída. */
      diaPrincipal: boolean
      /**
       * É o ÚLTIMO dia de trabalho do evento (não existe NENHUM outro depois
       * dele, de nenhum tipo)? Um festival de mais de uma noite pode ter
       * vários dias principais — só a saída do último de fato encerra o
       * ciclo da pessoa no evento. Sem isto, a saída de sexta descredenciaria
       * todo mundo antes da segunda noite nem começar. Também vale pra quem
       * tem montagem/desmontagem depois do último dia principal — ver
       * `haMaisDiasDeTrabalhoDepois`.
       */
      ultimoDiaPrincipal: boolean
      /** A saída de agora já é no horário de saída do dia — ver `ehSaidaFinal`. */
      saidaFinal: boolean
      jaEm: string | null
    }

/**
 * Esta saída é a de FIM de turno, e não uma pausa no meio dele?
 *
 * Pontal Weekend, 26/09/2026: quem entrou à tarde podia sair e voltar à
 * noite. Só que o dia era o último principal, e a saída do último dia
 * descredencia — quem saísse às 18h voltava às 21h e o QR respondia "já
 * descredenciado". A saída só encerra o vínculo a partir do horário de saída
 * configurado (ali, 03:00); antes disso é pausa. Sem horário de saída
 * configurado, vale a regra de sempre: qualquer saída encerra.
 */
function ehSaidaFinal(
  evento: { janela_fim_inicio?: string | null },
  dia: { saida_inicio?: string | null } | null,
  agora: Date,
): boolean {
  const inicio = dia?.saida_inicio ?? evento.janela_fim_inicio ?? null
  return !inicio || agora.getTime() >= new Date(inicio).getTime()
}

/**
 * Existe outro dia de trabalho (qualquer tipo, não cancelado) depois de
 * `dataRef`, neste evento?
 *
 * Pra um evento de um dia só (o caso de sempre) isto é sempre `false` — a
 * consulta não acha nada depois do único dia que existe.
 *
 * Até 28/09/2026 só contava dias tipo='principal' — certo pro festival de
 * duas noites (não descredenciar na saída da primeira), mas errado pra
 * quem tem MONTAGEM/DESMONTAGEM depois do último dia principal: evento de
 * 27 a 30 com desmontagem só no 30 fechava o vínculo de quem saiu no 27,
 * mesmo ela tendo volta marcada pra desmontagem. Achado num teste ao vivo
 * do Juan. Agora conta qualquer dia da escala — de qualquer tipo — que
 * ainda vem depois: só é "sem volta" quando não sobra mais nenhum.
 */
async function haMaisDiasDeTrabalhoDepois(eventoId: string, dataRef: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('jornada_dias')
    .select('id')
    .eq('evento_id', eventoId)
    .eq('cancelado', false)
    .gt('data', dataRef)
    .limit(1)
  return !!data?.length
}

/**
 * Onde o registro vai cair e se ele pode ser feito agora.
 *
 * Responde três coisas de uma vez, porque separá-las obrigaria cada chamador a
 * repetir as mesmas consultas:
 *
 *   1. a etapa está liberada neste instante?
 *   2. a que DIA o registro pertence (`data_ref`)?
 *   3. essa pessoa já registrou essa etapa nesse dia?
 *
 * O `data_ref` é o que dá a "uma janela por dia" pedida: o índice único
 * (funcionario, evento, tipo, data_ref) impede duas entradas no mesmo dia e,
 * ao mesmo tempo, garante que amanhã comece do zero.
 */
async function resolverRegistro(
  evento: EventoJanelas & { id: string },
  funcionarioId: string,
  momento: MomentoPresenca,
  agora = new Date(),
  /** Já buscados por quem chama (o scanner) — ver `inferirMomentoQR`. */
  pre?: { entrada?: Awaited<ReturnType<typeof entradaDoTurno>>; diaTurno?: string },
  /** Fornecedor isento da janela de horário do evento (Vital, item 5) — pula `avaliarEntradaSaida`. */
  entradaQualquerHorario = false,
): Promise<Resolucao> {
  // O dia do TURNO: quem chega à 01:00 na noite que vira a madrugada entra
  // na noite de ontem, não num dia novo (ver `diaDoTurno`).
  let dataRef = pre?.diaTurno ?? await diaDoTurno(evento.id, agora)

  /*
   * A entrada em aberto define o DIA de tudo que vem depois dela.
   *
   * É assim que o turno da madrugada fecha no dia certo: quem entrou 22:00 do
   * dia 5 e sai 04:00 do dia 6 fecha o dia 5, em vez de abrir um dia novo às
   * quatro da manhã.
   */
  const entrada = momento === 'entrada'
    ? null
    : pre && 'entrada' in pre ? pre.entrada ?? null : await entradaDoTurno(funcionarioId, evento.id, agora)
  if (entrada) dataRef = entrada.dataRef

  /*
   * As três consultas que dependem só do dia saem juntas — em série eram
   * três idas ao banco a mais em cada leitura do portão. As checagens abaixo
   * continuam na mesma ordem de sempre; `haMaisDiasDeTrabalhoDepois` só é
   * usado quando o dia é principal, mas buscar à toa custa menos que esperar.
   */
  const [dia, { data: jaExiste }, haMaisDepois] = await Promise.all([
    diaDeTrabalho(evento.id, dataRef),
    supabaseAdmin
      .from('registros')
      .select('created_at')
      .eq('funcionario_id', funcionarioId)
      .eq('evento_id', evento.id)
      .eq('tipo', momento)
      .eq('data_ref', dataRef)
      .limit(1),
    haMaisDiasDeTrabalhoDepois(evento.id, dataRef),
  ])

  if (momento === 'meio') {
    const janela = janelaDoMeio(evento, dia, entrada?.em ?? null)
    if (!janela) {
      return { ok: false, erro: 'Registre primeiro a sua entrada. O horário do meio é contado a partir dela.' }
    }

    /*
     * O meio ABRE num horário, mas não FECHA.
     *
     * O ponto dele é o horário ficar gravado — é o que permite conferir a
     * jornada com a pessoa depois. Fechar a janela faria quem passasse do
     * horário perder a chance de registrar de vez — e a saída não depende
     * mais do meio (ver `resolverRegistro`), então não é mais um beco sem
     * saída, mas continua sendo um buraco no relatório sem necessidade.
     *
     * Chegar atrasado não some do relatório: a tela de pendências e o
     * histórico comparam o horário feito com o esperado e mostram a diferença.
     */
    if (agora.getTime() < new Date(janela.inicio).getTime()) {
      /*
       * A recusa não diz a conta.
       *
       * "Abre 4h depois da entrada" ensina a burlar: bastaria bater a entrada,
       * sair e voltar no minuto certo. O horário exato aparece só para quem
       * administra; para a pessoa, o sistema avisa quando chegar a hora.
       */
      return {
        ok: false,
        erro: 'O registro do meio ainda não abriu. Você será avisado no WhatsApp quando chegar a hora.',
      }
    }
  } else {
    const veredito = (momento === 'entrada' && entradaQualquerHorario)
      ? { ok: true as const }
      : avaliarEntradaSaida(evento, dia, momento, dataRef, agora)
    if (!veredito.ok) return { ok: false, erro: veredito.erro }

    /*
     * A saída NÃO exige mais o meio.
     *
     * Chegou a existir essa trava (o meio precisava estar gravado pra
     * liberar a saída), a pedido explícito — mas travava justamente quem
     * mais precisava sair: quem perdeu o meio de verdade ficava preso no
     * evento até um supervisor destravar pelo registro assistido, e num
     * show grande isso virava fila. A ausência do meio continua visível:
     * ela aparece marcada no histórico e na tela de pendências, para o
     * organizador cobrar a justificativa no acerto — só deixou de IMPEDIR
     * a saída.
     */
  }

  const diaPrincipal = dia?.tipo === 'principal'
  const ultimoDiaPrincipal = diaPrincipal ? !haMaisDepois : false

  return {
    ok: true,
    dataRef,
    jornadaDiaId: dia?.id ?? null,
    diaPrincipal,
    ultimoDiaPrincipal,
    saidaFinal: ehSaidaFinal(evento, dia, agora),
    jaEm: (jaExiste?.[0]?.created_at as string | undefined) ?? null,
  }
}

/**
 * Grava o registro daquela pessoa, naquela etapa, NAQUELE DIA.
 *
 * O delete antes do insert é o "refazer a batida". O escopo é o DIA: antes era
 * um registro por etapa por EVENTO, o que num evento de 30 dias fazia o dia 2
 * apagar o dia 1.
 *
 * Quem chega pelo QR não passa mais por aqui duas vezes no mesmo dia — a
 * duplicata é recusada antes, em `resolverRegistro`, porque reescrever a
 * entrada moveria junto a janela do meio. O delete continua servindo ao
 * registro assistido, onde o supervisor corrige uma batida de propósito.
 */
async function upsertRegistro(
  funcionarioId: string,
  eventoId: string,
  momento: MomentoPresenca,
  extra: Record<string, unknown> = {},
  dataRef?: string,
  jornadaDiaId?: string | null
) {
  const q = supabaseAdmin.from('registros').delete()
    .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', momento)
  if (dataRef) q.eq('data_ref', dataRef)
  await q

  return supabaseAdmin.from('registros').insert([{
    funcionario_id: funcionarioId,
    evento_id: eventoId,
    tipo: momento,
    data_ref: dataRef ?? null,
    jornada_dia_id: jornadaDiaId ?? null,
    ...extra,
  }]).select('id').single()
}

/**
 * A qual dia um registro FORA de janela pertence.
 *
 * O registro assistido existe justamente pra quando o horário já passou, então
 * `resolverRegistro` não serve aqui — ele recusaria. A regra é a mesma do
 * resto: o dia da entrada em ABERTO, ou hoje quando não há nenhuma.
 *
 * ── O BUG QUE ESTA FUNÇÃO CAUSOU (03/09/2026, manhã) ──────────────────
 *
 * Faltavam as duas travas abaixo, e o estrago foi real: quem trabalhou
 * ontem à noite e teve a entrada de hoje lançada no registro assistido
 * recebia `dataRef` de ONTEM (a entrada de ontem ainda estava dentro das
 * 18h de `entradaDoTurno`, mesmo com o turno já fechado). Como
 * `upsertRegistro` APAGA a linha daquela chave antes de inserir, a
 * entrada de ontem era destruída e substituída pelo horário de hoje —
 * daí a ficha mostrando "entrada 03/09 08:07, saída 02/09 20:12", que é
 * cronologicamente impossível. Duas pessoas atingidas antes da correção.
 *
 * 1. ENTRADA nunca herda dia de turno nenhum — ela ABRE o turno, então é
 *    sempre hoje. É o que `resolverRegistro` já fazia (`momento ===
 *    'entrada' ? null : ...`) e o que faltava aqui.
 * 2. Turno com saída é turno FECHADO: não manda mais no dia de hoje.
 */
async function diaDeReferencia(
  evento: { id: string; data_inicio?: string | null },
  funcionarioId: string,
  momento?: MomentoPresenca,
) {
  const agora = new Date()

  // A entrada abre o turno; nunca pertence a um turno anterior.
  const entrada = momento === 'entrada'
    ? null
    : await entradaDoTurno(funcionarioId, evento.id, agora)

  // O dia do TURNO, não o do calendário — ver `diaDoTurno`.
  let dataRef = await diaDoTurno(evento.id, agora)
  if (entrada) {
    // `.gt(created_at, entrada.em)`: só a saída POSTERIOR fecha o turno —
    // quem dobra o turno tem a saída da manhã no mesmo dia da entrada da
    // noite, e ela não pode fazer o turno da noite parecer fechado.
    const { data: fimDoTurno } = await supabaseAdmin
      .from('registros')
      .select('id')
      .eq('funcionario_id', funcionarioId).eq('evento_id', evento.id)
      .eq('tipo', 'fim').eq('data_ref', entrada.dataRef)
      .gt('created_at', entrada.em)
      .limit(1)
    // Só um turno AINDA ABERTO puxa o registro pro dia dele.
    if (!fimDoTurno?.length) dataRef = entrada.dataRef
  }

  // Depois do fim do evento (hoje não é dia de trabalho), a saída fecha o
  // turno que ficou aberto — mesma regra do scanner.
  if (momento !== 'entrada') {
    const aberto = await turnoAbertoForaDoDiaDeTrabalho(funcionarioId, evento.id, dataRef, agora)
    if (aberto) dataRef = aberto.dataRef
  }

  const dia = await diaDeTrabalho(evento.id, dataRef)
  const diaPrincipal = dia?.tipo === 'principal'
  const ultimoDiaPrincipal = diaPrincipal ? !(await haMaisDiasDeTrabalhoDepois(evento.id, dataRef)) : false
  // Sem o horário de saída do evento em mãos, usa o do dia (a noite do
  // festival tem o próprio) — ver `ehSaidaFinal`.
  const saidaFinal = ehSaidaFinal(evento as { janela_fim_inicio?: string | null }, dia, agora)
  return { dataRef, jornadaDiaId: dia?.id ?? null, diaPrincipal, ultimoDiaPrincipal, saidaFinal }
}
const JUSTIFICATIVA_SEM_MEIO = 'Saída registrada sem registro de meio.'

/**
 * A saída não exige mais o meio (ver commit que removeu a trava), mas a
 * ausência continua precisando ficar visível para auditoria e fechamento —
 * é o que este helper grava como `justificativa` do registro de saída.
 *
 * Chamado nos dois lugares onde 'fim' é gravado (scanner do portão e o
 * registro livre da montagem/desmontagem), para não duplicar a consulta.
 */
async function observacaoSemMeio(funcionarioId: string, eventoId: string, dataRef: string): Promise<string | undefined> {
  const { data } = await supabaseAdmin
    .from('registros')
    .select('id')
    .eq('funcionario_id', funcionarioId)
    .eq('evento_id', eventoId)
    .eq('tipo', 'meio')
    .eq('data_ref', dataRef)
    .limit(1)
  return data?.length ? undefined : JUSTIFICATIVA_SEM_MEIO
}

/** Preenche o endereço aproximado (geocoding reverso) em background — cosmético, sem retry. */
async function sincronizarEndereco(registroId: string, lat: number, lng: number) {
  const endereco = await enderecoAproximado(lat, lng)
  if (!endereco) return
  await supabaseAdmin.from('registros').update({ endereco_aproximado: endereco }).eq('id', registroId)
}

/**
 * Recoloca alguém no evento depois de um descredenciamento.
 *
 * Desfaz o que `descredenciarFuncionario` (abaixo) fez de propósito — a
 * saída não descredencia mais sozinha (ver o comentário em
 * `autorizarPresenca`), então hoje isto só desfaz uma remoção manual, feita
 * de engano ou porque a pessoa precisou voltar ao posto.
 */
/**
 * Tira uma pessoa da equipe do setor — a "exclusão" do supervisor.
 *
 * Descredencia, NÃO apaga: a linha em `funcionarios` continua, e com ela o
 * histórico de batidas (que sustenta o pagamento), os veículos e a base
 * geral por CPF. Apagar de verdade cascateia e leva tudo isso junto, sem
 * desfazer — decisão do Juan em 04/09/2026, ao ver o alcance do cascade.
 *
 * O que muda pra pessoa: ela sai das listas de credenciados do evento e o
 * QR dela para de ser aceito ali. Se foi engano, `recredenciarFuncionario`
 * desfaz.
 *
 * PERMISSÃO — supervisor só na PRÓPRIA equipe:
 * `exigirAcessoFuncionarios` já é a régua que confere isso (gestor da
 * organização, ou o supervisor vinculado a ESTE setor). Não existe segunda
 * régua aqui de propósito: duplicar a checagem é como as duas divergem.
 */
export async function descredenciarFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, motivo?: string,
) {
  const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)

  /*
   * Lê antes de mexer: a auditoria precisa do NOME (o pedido do Juan é
   * "identificando o supervisor responsável e o funcionário removido"), e
   * depois de descredenciar a lista já não mostra a pessoa pra conferir.
   */
  const { data: alvo } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, fornecedor_id, descredenciado_em')
    .eq('id', funcionarioId)
    .single()
  if (!alvo) throw new Error('Funcionário não encontrado.')
  // O id vem da tela, mas quem manda é o vínculo no banco: sem isto, um id
  // de outro setor colado na chamada passaria pela régua do setor de cima.
  if (alvo.fornecedor_id !== fornecedorId) throw new Error('Esta pessoa não é deste fornecedor.')
  if (alvo.descredenciado_em) return { ok: true as const, nome: alvo.nome as string }

  const { error } = await supabaseAdmin
    .from('funcionarios')
    .update({ descredenciado_em: new Date().toISOString(), descredenciado_por: perfil?.id ?? null })
    .eq('id', funcionarioId)
    .is('descredenciado_em', null)
  if (error) throw new Error(mensagemAmigavel(error))

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('organizacao_id').eq('id', eventoId).single()

  after(() => registrarAuditoria({
    perfil: perfil!,
    acao: 'DESCREDENCIAMENTO',
    campoAlterado: 'Vínculo com o evento',
    valorAnterior: 'Credenciado',
    valorNovo: 'Descredenciado',
    motivo: (motivo ?? '').trim() || null,
    funcionarioId,
    eventoId,
    organizacaoId: evento?.organizacao_id ?? undefined,
  }))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const, nome: alvo.nome as string }
}

// ─── Bloqueio de CPF ─────────────────────────────────────────────────────────
/*
 * Barrar quem tenta entrar no evento sem trabalhar. Ver
 * supabase/upgrade-cpf-bloqueado.sql pro desenho e pro porquê do escopo.
 *
 * Tirar da equipe resolve o vínculo de hoje; o bloqueio é o que impede a
 * pessoa de se cadastrar de novo pelo mesmo link cinco minutos depois.
 */

export type CpfBloqueado = {
  id: string
  cpf: string
  motivo: string | null
  criadoEm: string
  bloqueadoPor: string | null
}

// `cpfEstaBloqueado` mora em lib/internos-servidor.ts: função de servidor SEM login, que não pode ser endpoint público.

/**
 * Quem pode bloquear CPF NESTE evento: supervisor, admin e master.
 *
 * O supervisor entra porque é ele quem vê a pessoa tentando entrar sem
 * trabalhar — mas só nos eventos onde ele tem setor. Admin fica preso à
 * própria organização; master vê tudo.
 */
async function exigirAcessoABloqueio(eventoId: string) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sem permissão')

  /*
   * Vale pro papel 'supervisor' E pra quem tem outro papel principal mas
   * GANHOU um vínculo de supervisor neste evento (achado ao vivo,
   * 05/10/2026, caso da Mara Lúcia).
   */
  const meus = await meusSetores(perfil)
  if (meus.some(s => s.evento_id === eventoId)) return perfil
  if (perfil.role === 'supervisor') throw new Error('Você não tem fornecedor neste evento.')

  if (!podeGerenciarEventos(perfil) && perfil.role !== 'suporte') throw new Error('Sem permissão')

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')

  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) {
      throw new Error('Este evento não está no seu escopo de atendimento.')
    }
    return perfil
  }
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    throw new Error('Sem permissão sobre este evento')
  }
  return perfil
}

/**
 * Bloqueia um CPF NESTE evento — e só nele.
 *
 * O bloqueio é do EVENTO, não do setor: sem isso a pessoa barrada num setor
 * se cadastraria no setor ao lado, e o furo continuaria aberto (decisão do
 * Juan, 04/09/2026, ao explicar o caso — gente tentando entrar no evento sem
 * trabalhar).
 *
 * E é SÓ deste evento: `evento_id` faz parte da chave, então a pessoa
 * continua livre pra se cadastrar em qualquer outro evento da plataforma.
 * Bloquear alguém de trabalhar em qualquer lugar é outra decisão, de outra
 * pessoa, e não é esta tela que a toma.
 */
export async function bloquearCpf(
  eventoId: string, cpfDigitado: string, motivo?: string,
) {
  const perfil = await exigirAcessoABloqueio(eventoId)

  const cpf = normalizarCpf(cpfDigitado ?? '')
  if (cpf.length !== 11) return { error: 'O CPF precisa ter 11 dígitos.' }
  if (!validarCpf(cpf)) return { error: 'Este CPF não é válido. Confira os números.' }

  const { error } = await supabaseAdmin.from('cpfs_bloqueados').insert([{
    evento_id: eventoId,
    // NULL = vale no evento inteiro. Ver o comentário da função.
    fornecedor_id: null,
    cpf,
    motivo: (motivo ?? '').trim() || null,
    bloqueado_por: perfil?.id ?? null,
  }])

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: 'Este CPF já está bloqueado neste evento.' }
    }
    if (/cpfs_bloqueados/.test(error.message)) {
      return { error: 'O banco ainda não tem a tabela de bloqueio. Rode supabase/upgrade-cpf-bloqueado.sql no SQL Editor.' }
    }
    return { error: mensagemAmigavel(error) }
  }

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('organizacao_id').eq('id', eventoId).single()

  after(() => registrarAuditoria({
    perfil: perfil!,
    acao: 'BLOQUEIO_CPF',
    campoAlterado: 'CPF bloqueado no evento',
    valorNovo: cpf,
    motivo: (motivo ?? '').trim() || null,
    eventoId,
    organizacaoId: evento?.organizacao_id ?? undefined,
  }))

  // Bloquear faz parte do comportamento da pessoa: entra no histórico dela,
  // que vale para os próximos eventos (ver `gravarDepoimento`).
  after(() => gravarDepoimentoAutomatico({
    cpf, eventoId, tipo: 'bloqueio', autor: perfil!,
    texto: `CPF bloqueado neste evento.${(motivo ?? '').trim() ? ` Motivo: ${(motivo ?? '').trim()}` : ' Sem motivo informado.'}`,
  }))

  revalidatePath('/admin/bloquear-cpf')
  return { ok: true as const, cpf }
}

/**
 * Desfaz o bloqueio. Mesma régua — quem pode bloquear pode liberar.
 *
 * Liberar exige JUSTIFICATIVA (pedido do Juan, 06/10/2026): bloquear alguém
 * é uma decisão tomada por um motivo, e desfazê-la sem dizer por quê apagaria
 * esse motivo do histórico. A justificativa vai pra auditoria e pro histórico
 * da pessoa (depoimento tipo 'desbloqueio').
 */
export async function desbloquearCpf(bloqueioId: string, eventoId: string, justificativa?: string) {
  const perfil = await exigirAcessoABloqueio(eventoId)

  const motivoLiberacao = (justificativa ?? '').replace(/\s+/g, ' ').trim()
  if (motivoLiberacao.length < TAMANHO_MINIMO_JUSTIFICATIVA) {
    return { error: 'Informe a justificativa para liberar este CPF (pelo menos 5 letras).' }
  }

  // O bloqueio tem que ser DESTE evento: sem isto, um id colado na chamada
  // liberaria o bloqueio de outro evento.
  const { data: alvo } = await supabaseAdmin
    .from('cpfs_bloqueados').select('id, cpf, evento_id').eq('id', bloqueioId).single()
  if (!alvo) return { error: 'Bloqueio não encontrado.' }
  if (alvo.evento_id !== eventoId) return { error: 'Este bloqueio não é deste evento.' }

  const { error } = await supabaseAdmin.from('cpfs_bloqueados').delete().eq('id', bloqueioId)
  if (error) return { error: mensagemAmigavel(error) }

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('organizacao_id').eq('id', eventoId).single()

  after(() => registrarAuditoria({
    perfil: perfil!,
    acao: 'DESBLOQUEIO_CPF',
    campoAlterado: 'CPF liberado no evento',
    valorAnterior: alvo.cpf as string,
    motivo: motivoLiberacao,
    eventoId,
    organizacaoId: evento?.organizacao_id ?? undefined,
  }))
  after(() => gravarDepoimentoAutomatico({
    cpf: alvo.cpf as string, eventoId, tipo: 'desbloqueio', autor: perfil!,
    texto: `CPF liberado neste evento. Justificativa: ${motivoLiberacao}`,
  }))

  revalidatePath('/admin/bloquear-cpf')
  return { ok: true as const }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPOIMENTO DO COLABORADOR — o histórico de comportamento da PESSOA.
// Guardado pelo CPF (não pelo cadastro de um evento), então vale para os
// próximos eventos e sobrevive a bloqueio de CPF. Tabela e motivo do desenho:
// supabase/upgrade-depoimentos-colaborador.sql.
// ═══════════════════════════════════════════════════════════════════════════

/** Grava a linha, com o nome do evento/setor/autor COPIADOS (o evento pode ser apagado depois). */
async function inserirDepoimento(d: {
  cpf: string; nomeNaEpoca: string | null; funcionarioId: string | null
  eventoId: string | null; setorNome: string | null; tipo: TipoDepoimento; texto: string
  autor: { id: string; nome: string }
}): Promise<{ ok: true } | { erro: string }> {
  let eventoNome: string | null = null
  let organizacaoId: string | null = null
  if (d.eventoId) {
    const { data: ev } = await supabaseAdmin.from('eventos').select('nome, organizacao_id').eq('id', d.eventoId).maybeSingle()
    eventoNome = (ev?.nome as string | undefined) ?? null
    organizacaoId = (ev?.organizacao_id as string | null | undefined) ?? null
  }
  const { error } = await supabaseAdmin.from('depoimentos_colaborador').insert([{
    cpf: d.cpf, nome_na_epoca: d.nomeNaEpoca, funcionario_id: d.funcionarioId,
    evento_id: d.eventoId, evento_nome: eventoNome, organizacao_id: organizacaoId, setor_nome: d.setorNome,
    tipo: d.tipo, texto: d.texto, autor_id: d.autor.id, autor_nome: d.autor.nome,
  }])
  if (error) {
    if (/depoimentos_colaborador/.test(error.message)) {
      return { erro: 'O banco ainda não tem a tabela de depoimentos. Rode supabase/upgrade-depoimentos-colaborador.sql no SQL Editor.' }
    }
    return { erro: mensagemAmigavel(error) }
  }
  return { ok: true }
}

/**
 * Bloqueio e liberação de CPF entram sozinhos no histórico da pessoa. Nunca
 * derruba a ação que o chamou (já feita): falha só vai pro log.
 */
async function gravarDepoimentoAutomatico(a: {
  cpf: string; eventoId: string; tipo: 'bloqueio' | 'desbloqueio'; texto: string; autor: { id: string; nome: string }
}) {
  try {
    const { data: cad } = await supabaseAdmin
      .from('funcionarios').select('id, nome, fornecedores!inner(nome, evento_id)')
      .eq('cpf', a.cpf).eq('fornecedores.evento_id', a.eventoId).limit(1)
    const f = cad?.[0] as { id: string; nome: string; fornecedores: { nome: string } } | undefined
    const r = await inserirDepoimento({
      cpf: a.cpf, nomeNaEpoca: f?.nome ?? null, funcionarioId: f?.id ?? null,
      eventoId: a.eventoId, setorNome: (f?.fornecedores as unknown as { nome?: string } | undefined)?.nome ?? null,
      tipo: a.tipo, texto: a.texto, autor: a.autor,
    })
    if ('erro' in r) console.error('[depoimento] automático não gravado:', r.erro)
  } catch (e) {
    console.error('[depoimento] falha ao gravar o automático', e)
  }
}

/**
 * Escreve um depoimento sobre o colaborador. Quem pode mexer na equipe do
 * setor (`exigirAcessoFuncionarios`) pode escrever; o texto fica no histórico
 * da PESSOA, e aparece nos próximos eventos dela.
 */
export async function adicionarDepoimento(
  funcionarioId: string, fornecedorId: string, eventoId: string,
  dados: { texto: string; tipo: string },
): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
    const texto = (dados.texto ?? '').replace(/[ \t]+\n/g, '\n').trim()
    if (texto.length < TAMANHO_MINIMO_DEPOIMENTO) return { erro: 'Escreva o depoimento (pelo menos 3 letras).' }
    if (texto.length > TAMANHO_MAXIMO_DEPOIMENTO) return { erro: `O depoimento passa de ${TAMANHO_MAXIMO_DEPOIMENTO} letras — resuma.` }
    const tipo = (['positivo', 'neutro', 'atencao'] as const).find(t => t === dados.tipo) ?? 'neutro'

    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('id, nome, cpf, fornecedor_id, fornecedores(nome)').eq('id', funcionarioId).maybeSingle()
    if (!func || func.fornecedor_id !== fornecedorId) return { erro: 'Colaborador não encontrado neste fornecedor.' }

    const r = await inserirDepoimento({
      cpf: func.cpf as string, nomeNaEpoca: func.nome as string, funcionarioId,
      eventoId, setorNome: (func.fornecedores as unknown as { nome?: string } | null)?.nome ?? null,
      tipo, texto, autor: perfil,
    })
    if ('erro' in r) return r

    after(() => registrarAuditoria({
      perfil, acao: 'DEPOIMENTO_COLABORADOR', campoAlterado: 'Depoimento',
      valorNovo: texto.slice(0, 200), funcionarioId, eventoId,
    }))
    revalidatePath(`/admin/pessoas/${func.cpf}`)
    return { ok: true as const }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * O evento já terminou? Avaliar a equipe é coisa de DEPOIS do evento (pedido do
 * Juan, 06/10/2026) — antes, a nota seria palpite. O master pode a qualquer
 * momento (ele acompanha e corrige).
 */
async function podeAvaliarAgora(
  perfil: { role: string }, eventoId: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (ehMaster(perfil.role)) return { ok: true }
  const { data: ev } = await supabaseAdmin.from('eventos').select('data_inicio, data_fim, ativo').eq('id', eventoId).maybeSingle()
  if (!ev) return { ok: false, motivo: 'Evento não encontrado.' }
  const fim = (ev.data_fim ?? ev.data_inicio) as string | null
  const terminou = ev.ativo === false || (!!fim && new Date(fim).getTime() < Date.now())
  return terminou ? { ok: true } : { ok: false, motivo: 'A avaliação abre quando o evento terminar.' }
}

/** As notas da pessoa (todos os eventos) — o master vê todas, os demais só as da organização deste evento. */
async function carregarAvaliacoes(cpf: string, funcionarioId: string, veTudo: boolean, orgDoEvento: string | null): Promise<{
  avaliacoes: ResumoAvaliacoes; minhaNota: number | null
}> {
  try {
    let q = supabaseAdmin.from('avaliacoes_colaborador')
      .select('funcionario_id, nota, evento_nome, setor_nome, avaliador_nome, organizacao_id, atualizado_em')
      .eq('cpf', cpf).order('atualizado_em', { ascending: false })
    if (!veTudo && orgDoEvento) q = q.eq('organizacao_id', orgDoEvento)
    const { data, error } = await q.limit(100)
    if (error || !data) return { avaliacoes: resumirAvaliacoes([]), minhaNota: null }
    const nomesOrg = new Map<string, string>()
    if (veTudo) {
      const ids = [...new Set(data.map(d => d.organizacao_id as string | null).filter((v): v is string => !!v))]
      if (ids.length) {
        const { data: orgs } = await supabaseAdmin.from('organizacoes').select('id, nome').in('id', ids)
        for (const o of orgs ?? []) nomesOrg.set(o.id as string, o.nome as string)
      }
    }
    const lista: Avaliacao[] = data.map(d => ({
      nota: d.nota as number, eventoNome: (d.evento_nome as string | null) ?? null, setorNome: (d.setor_nome as string | null) ?? null,
      avaliadorNome: d.avaliador_nome as string,
      organizacaoNome: veTudo && d.organizacao_id ? (nomesOrg.get(d.organizacao_id as string) ?? null) : null,
      atualizadoEm: d.atualizado_em as string,
    }))
    const minha = data.find(d => d.funcionario_id === funcionarioId)
    return { avaliacoes: resumirAvaliacoes(lista), minhaNota: (minha?.nota as number | undefined) ?? null }
  } catch {
    return { avaliacoes: resumirAvaliacoes([]), minhaNota: null }
  }
}

/**
 * O supervisor (ou quem gerencia a equipe) dá de 1 a 5 estrelas ao colaborador
 * neste evento — uma nota por pessoa por evento, que pode ser ajustada. Só
 * depois do evento (o master, a qualquer momento).
 */
export async function avaliarColaborador(
  funcionarioId: string, fornecedorId: string, eventoId: string, nota: number,
): Promise<{ ok: true; nota: number } | { erro: string }> {
  try {
    const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
    const n = Math.round(Number(nota))
    if (!Number.isFinite(n) || n < 1 || n > 5) return { erro: 'A nota vai de 1 a 5 estrelas.' }

    const pode = await podeAvaliarAgora(perfil, eventoId)
    if (!pode.ok) return { erro: pode.motivo }

    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('id, cpf, fornecedor_id, fornecedores(nome)').eq('id', funcionarioId).maybeSingle()
    if (!func || func.fornecedor_id !== fornecedorId) return { erro: 'Colaborador não encontrado neste fornecedor.' }
    const { data: ev } = await supabaseAdmin.from('eventos').select('nome, organizacao_id').eq('id', eventoId).maybeSingle()

    const { error } = await supabaseAdmin.from('avaliacoes_colaborador').upsert([{
      funcionario_id: funcionarioId, cpf: func.cpf as string, evento_id: eventoId,
      evento_nome: (ev?.nome as string | undefined) ?? null, organizacao_id: (ev?.organizacao_id as string | null | undefined) ?? null,
      setor_nome: (func.fornecedores as unknown as { nome?: string } | null)?.nome ?? null,
      nota: n, avaliador_id: perfil.id, avaliador_nome: perfil.nome, atualizado_em: new Date().toISOString(),
    }], { onConflict: 'funcionario_id' })
    if (error) {
      if (/avaliacoes_colaborador/.test(error.message)) {
        return { erro: 'O banco ainda não tem a tabela de avaliações. Rode supabase/upgrade-depoimentos-colaborador.sql no SQL Editor.' }
      }
      return { erro: mensagemAmigavel(error) }
    }
    after(() => registrarAuditoria({
      perfil, acao: 'AVALIACAO_COLABORADOR', campoAlterado: 'Nota (estrelas)',
      valorNovo: `${n} de 5`, funcionarioId, eventoId,
    }))
    revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/pessoas/${func.cpf}`)
    return { ok: true as const, nota: n }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * As notas já dadas à equipe de um setor neste evento (`funcionarioId → nota`),
 * pro painel "Avaliar equipe". Tolerante: sem a tabela, vem vazio.
 */
export async function notasDaEquipe(fornecedorId: string, eventoId: string): Promise<Record<string, number>> {
  try {
    await exigirAcessoFuncionarios(fornecedorId, eventoId)
    const { data } = await supabaseAdmin
      .from('avaliacoes_colaborador').select('funcionario_id, nota, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', eventoId).eq('funcionarios.fornecedor_id', fornecedorId).limit(1000)
    return Object.fromEntries((data ?? []).map(d => [d.funcionario_id as string, d.nota as number]))
  } catch {
    return {}
  }
}

/**
 * O histórico de depoimentos da PESSOA deste colaborador (todos os eventos).
 *
 * O master enxerga tudo, de todas as organizações. Quem não é master vê só o
 * que foi escrito na organização DESTE evento — o mesmo cuidado da Base de
 * funcionários: o que um cliente escreve sobre a equipe dele não pode chegar
 * ao concorrente.
 */
export async function listarDepoimentos(funcionarioId: string, fornecedorId: string, eventoId: string): Promise<
  | {
      ok: true; depoimentos: Depoimento[]; veTudo: boolean
      /** As notas da pessoa em todos os eventos (mesma regra de visibilidade dos depoimentos). */
      avaliacoes: ResumoAvaliacoes
      /** A nota deste colaborador NESTE evento, e se esta pessoa pode dá-la/ajustá-la agora. */
      minhaNota: number | null
      podeAvaliar: boolean
      motivoSemAvaliar: string | null
    }
  | { erro: string }
> {
  try {
    const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
    const { data: func } = await supabaseAdmin
      .from('funcionarios').select('cpf, fornecedor_id').eq('id', funcionarioId).maybeSingle()
    if (!func || func.fornecedor_id !== fornecedorId) return { erro: 'Colaborador não encontrado neste fornecedor.' }

    const veTudo = ehMaster(perfil.role)
    let orgDoEvento: string | null = null
    let consulta = supabaseAdmin.from('depoimentos_colaborador')
      .select('id, tipo, texto, autor_nome, evento_nome, setor_nome, organizacao_id, created_at')
      .eq('cpf', func.cpf as string).order('created_at', { ascending: false }).order('id')
    if (!veTudo) {
      const { data: ev } = await supabaseAdmin.from('eventos').select('organizacao_id').eq('id', eventoId).maybeSingle()
      const orgId = ev?.organizacao_id as string | null | undefined
      if (!orgId) return { ok: true as const, depoimentos: [], veTudo, avaliacoes: resumirAvaliacoes([]), minhaNota: null, podeAvaliar: false, motivoSemAvaliar: null }
      consulta = consulta.eq('organizacao_id', orgId)
      orgDoEvento = orgId
    }
    const { data, error } = await consulta.limit(300)
    if (error) {
      // Migração pendente: a aba abre vazia, sem derrubar o resto.
      if (/depoimentos_colaborador/.test(error.message)) {
        return { ok: true as const, depoimentos: [], veTudo, avaliacoes: resumirAvaliacoes([]), minhaNota: null, podeAvaliar: false, motivoSemAvaliar: null }
      }
      return { erro: mensagemAmigavel(error) }
    }

    const { avaliacoes, minhaNota } = await carregarAvaliacoes(func.cpf as string, funcionarioId, veTudo, orgDoEvento)
    const pode = await podeAvaliarAgora(perfil, eventoId)

    const nomesOrg = new Map<string, string>()
    if (veTudo) {
      const ids = [...new Set((data ?? []).map(d => d.organizacao_id as string | null).filter((v): v is string => !!v))]
      if (ids.length) {
        const { data: orgs } = await supabaseAdmin.from('organizacoes').select('id, nome').in('id', ids)
        for (const o of orgs ?? []) nomesOrg.set(o.id as string, o.nome as string)
      }
    }
    return {
      ok: true as const, veTudo, avaliacoes, minhaNota,
      podeAvaliar: pode.ok, motivoSemAvaliar: pode.ok ? null : pode.motivo,
      depoimentos: (data ?? []).map(d => ({
        id: d.id as string, tipo: d.tipo as TipoDepoimento, texto: d.texto as string,
        autorNome: d.autor_nome as string, eventoNome: (d.evento_nome as string | null) ?? null,
        setorNome: (d.setor_nome as string | null) ?? null,
        organizacaoNome: veTudo && d.organizacao_id ? (nomesOrg.get(d.organizacao_id as string) ?? null) : null,
        criadoEm: d.created_at as string,
      })),
    }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

export async function recredenciarFuncionario(funcionarioId: string, fornecedorId: string, eventoId: string) {
  const perfil = await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const { error } = await supabaseAdmin
    .from('funcionarios')
    .update({ descredenciado_em: null, descredenciado_por: null })
    .eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível recredenciar esta pessoa. Tente de novo.')
  auditar(perfil, 'RECREDENCIAMENTO', {
    campoAlterado: 'Situação no evento', eventoId, funcionarioId, valorAnterior: 'Fora da equipe', valorNovo: 'De volta à equipe',
  })
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const }
}

/**
 * Limpeza ÚNICA (28/09/2026): libera quem ficou descredenciado pelo GATILHO
 * AUTOMÁTICO que existia até hoje — saída no último dia de trabalho
 * descredenciava sozinha (ver o comentário longo em `autorizarPresenca`,
 * removido nesta mesma data). Sem tocar em quem foi removido da equipe DE
 * PROPÓSITO pelo organizador (`descredenciarFuncionario`, que continua
 * existindo e continua precisando do clique manual pra desfazer).
 *
 * Como diferenciar sem o banco ter guardado a origem (nunca guardou): o
 * gatilho automático SEMPRE gravava a saída (`registros`, tipo='fim') na
 * MESMA leitura em que descredenciava — os dois carimbos ficam a poucos
 * milissegundos um do outro, sempre dentro da mesma requisição. Uma remoção
 * manual não grava saída nenhuma. Por isso: só libera quem tem um 'fim'
 * registrado a até 15s do carimbo de descredenciamento.
 *
 * Só master — mexe em qualquer organização de propósito: o gatilho rodava
 * em produção pra todo mundo, não só numa organização ou evento.
 */
export async function liberarDescredenciamentosIndevidos(): Promise<{ total: number; nomes: string[] }> {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) throw new Error('Só o acesso master pode rodar esta limpeza.')

  const { data: descredenciados } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, descredenciado_em, fornecedores(evento_id)')
    .not('descredenciado_em', 'is', null)

  const liberados: string[] = []
  for (const f of descredenciados ?? []) {
    const eventoId = (f.fornecedores as unknown as { evento_id?: string } | null)?.evento_id
    const descredenciadoEm = f.descredenciado_em as string | null
    if (!eventoId || !descredenciadoEm) continue

    const centro = new Date(descredenciadoEm).getTime()
    const { data: fimPorPerto } = await supabaseAdmin
      .from('registros')
      .select('id')
      .eq('funcionario_id', f.id as string)
      .eq('evento_id', eventoId)
      .eq('tipo', 'fim')
      .gte('created_at', new Date(centro - 15_000).toISOString())
      .lte('created_at', new Date(centro + 15_000).toISOString())
      .limit(1)
    if (!fimPorPerto?.length) continue

    const { error } = await supabaseAdmin
      .from('funcionarios')
      .update({ descredenciado_em: null, descredenciado_por: null })
      .eq('id', f.id as string)
    if (!error) liberados.push(f.nome as string)
  }

  if (liberados.length) {
    after(() => registrarAuditoria({
      perfil: perfil as { id: string; nome: string },
      acao: 'LIMPEZA_DESCREDENCIAMENTO_AUTOMATICO',
      motivo: `Liberou ${liberados.length} pessoa(s) descredenciada(s) pelo gatilho automático removido em 28/09/2026: ${liberados.join(', ')}`,
    }))
  }

  return { total: liberados.length, nomes: liberados }
}

export type ResultadoScan = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null; setor?: string | null }
  /** Preenchido quando o QR lido é de VEÍCULO, não de funcionário — mesmo scanner, os dois tipos. */
  veiculo?: { placa: string; modelo: string; condutorNome: string; entradaLiberadaEm?: string }
  momento?: MomentoPresenca
  /**
   * Leitura repetida — já havia registro desta etapa no dia, ou a pessoa
   * ACABOU de registrar (a leitura dupla no portão). Nada foi gravado agora;
   * a tela mostra "já validado", não "acesso negado".
   */
  jaRegistrado?: boolean
  /** O código lido não é uma credencial válida deste sistema (formato/assinatura). */
  qrInvalido?: boolean
  /**
   * Biometria SEM MATCH na galeria — a pessoa ainda não cadastrou o rosto
   * neste evento (ou o rosto captado não bateu com segurança). NÃO é uma
   * recusa de acesso (pedido do Juan, 27/09/2026: "a pessoa precisa
   * cadastrar o rosto, o qr code é uma segunda opção") — é diferente de
   * `qrInvalido`, que cobre outros motivos (evento sem biometria, foto
   * ruim, sem localização) onde "cadastre o rosto" não faz sentido dizer.
   */
  naoIdentificado?: boolean
  /**
   * PRÉVIA: a leitura foi conferida mas NADA foi gravado — o scanner pede a
   * confirmação do operador (SALVAR / CANCELAR) antes de registrar.
   */
  previa?: boolean
  /** Na prévia: é a volta de quem já tinha saído hoje (a saída vira pausa). */
  volta?: boolean
  /** Só pro histórico de leituras: o operador cancelou na confirmação. */
  cancelado?: boolean
  /**
   * O crachá é de OUTRA etapa do evento.
   *
   * Sinalizado à parte da mensagem porque exige uma ação, não só um aviso: a
   * pessoa está de pé no portão com um QR que não serve, e quem credencia
   * precisa decidir na hora se ela entra. A tela usa isto para oferecer a
   * conferência pelo CPF.
   */
  faseErrada?: { doQR: string; deHoje: string }
  /**
   * Biometria: o rosto bateu com alguém, mas NÃO neste evento — a pessoa
   * está credenciada em outro evento DA MESMA organização (nunca de outra:
   * ver `validarLeituraFacial`). Nunca autoriza nada, só informa — quem
   * está achando que reconheceu alguém precisa entender que é engano.
   */
  cadastradoEmOutroEvento?: { nome: string; local: string | null; data: string | null }
  /**
   * Na prévia: esta ENTRADA está atrasada e o fornecedor exige justificativa
   * (Vital, 30/09/2026 — só fornecedor com `exige_meio` ligado). O scanner
   * precisa pedir o motivo antes de liberar o SALVAR.
   */
  precisaJustificativaAtraso?: boolean
  /**
   * Scanner multi-área (Vital, 01/10/2026): a credencial é válida, mas
   * pertence a um subevento que ESTE leitor não está autorizado a ler — bem
   * diferente de `jaRegistrado` (já foi usado) ou `qrInvalido` (nem é uma
   * credencial de verdade). Categoria visual própria, pra quem opera a
   * portaria mandar a pessoa pro portão certo em vez de achar que é fraude.
   */
  areaErrada?: boolean
  /**
   * Evento de subeventos: a credencial é válida, mas HOJE não está entre os
   * dias aprovados na escala desta pessoa (ver lib/escala.ts). Categoria
   * visual própria — não é fraude nem QR quebrado, é escala: quem resolve é
   * o supervisor.
   */
  diaNaoAutorizado?: boolean
  /**
   * A pessoa está credenciada e no dia certo, mas o SETOR dela já bateu o
   * limite de pessoas que podem entrar naquele dia (trava por dia do
   * fornecedor). O portão NÃO libera — categoria própria na tela.
   */
  setorLotado?: boolean
  /**
   * O APARELHO DE QUEM LEU estava fora do raio do local do evento configurado em Editar evento (pedido do Juan,
   * 08/10/2026: testou o próprio QR fora do estádio e o sistema liberou sem avisar nada — "é pra travar"). O
   * portão NÃO libera. Só existe quando o evento TEM local configurado; sem ele, nada bloqueia (ver `autorizarPresenca`).
   */
  foraDoLocal?: boolean
  /** A que distância (metros) a leitura foi feita, quando dá para calcular — para a mensagem do operador. */
  distanciaForaDoLocal?: number
}

/** O que a conferência por CPF devolve para quem está no portão. */
export type ConferenciaCpf = {
  /** Existe cadastro com este CPF NESTE evento. */
  credenciado: boolean
  nome?: string
  cargo?: string | null
  setor?: string | null
  /** Cadastrado mas ainda não liberado para trabalhar. */
  inativo?: boolean
  /** Já encerrou o vínculo com este evento. */
  descredenciadoEm?: string | null
  /** O que essa pessoa já bateu hoje. */
  batidasHoje?: string[]
  erro?: string
}

/**
 * "Esta pessoa está credenciada neste evento?" — a pergunta do portão.
 *
 * Existe para o caso em que o QR não serve: crachá de outra etapa, tela que
 * não abre, celular sem bateria. Sem esta saída, a única resposta possível
 * seria mandar a pessoa embora ou deixar entrar sem conferir — e das duas, a
 * segunda é a que acontece na prática quando a fila aperta.
 *
 * NÃO registra ponto. Só responde se o cadastro existe, e é de propósito: a
 * decisão de liberar a entrada é de quem está lá, com a pessoa na frente. O
 * registro continua sendo pelo QR ou pelo registro assistido, que grava quem
 * autorizou.
 */
export async function conferirCredenciamentoPorCpf(eventoId: string, cpfBruto: string): Promise<ConferenciaCpf> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return { credenciado: false, erro: 'Sem permissão' }
  if (!(await podeEscanearEvento(perfil, eventoId))) {
    return { credenciado: false, erro: 'Sem acesso a este evento' }
  }

  const cpf = (cpfBruto ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return { credenciado: false, erro: 'Digite os 11 dígitos do CPF.' }
  if (!validarCpf(cpf)) return { credenciado: false, erro: 'Este CPF não é válido. Confira os números.' }

  const { data: achados } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cargo, ativo, descredenciado_em, fornecedor_id, fornecedores!inner(nome, evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', eventoId)
    .limit(1)

  const f = achados?.[0]
  // Sem cadastro NESTE evento. A tela transforma isto no alerta forte — é o
  // caso de alguém tentando entrar sem estar na lista.
  if (!f) return { credenciado: false }

  const setor = (f.fornecedores as unknown as { nome: string } | null)?.nome ?? null

  // Supervisor confere só a própria equipe, igual ao resto do sistema —
  // qualquer um dos setores dele, não só o que está aberto no painel.
  if (perfil.role === 'supervisor' && !(await meusSetores(perfil)).some(s => s.id === f.fornecedor_id)) {
    return { credenciado: false, erro: `Esta pessoa é do fornecedor ${setor ?? 'outro'}, fora do seu. Chame o credenciamento do evento.` }
  }

  const { data: hoje } = await supabaseAdmin
    .from('registros')
    .select('tipo')
    .eq('funcionario_id', f.id)
    .eq('evento_id', eventoId)
    .eq('data_ref', await diaDoTurno(eventoId))

  return {
    credenciado: true,
    nome: f.nome as string,
    cargo: (f.cargo as string | null) ?? null,
    setor,
    inativo: f.ativo === false,
    descredenciadoEm: (f.descredenciado_em as string | null) ?? null,
    batidasHoje: (hoje ?? []).map(r => r.tipo as string),
  }
}

/**
 * Scanner (admin/equipe logada): lê o QR da credencial e registra ENTRADA ou
 * SAÍDA (fim), validando organização e janela de horário no servidor.
 *
 * A ETAPA NÃO VEM MAIS DA TELA — o sistema decide sozinho (ver
 * `inferirMomentoQR`). Antes quem estava no portão escolhia "Entrada" ou
 * "Saída" antes de cada leitura, e a fila confundia o botão errado —
 * decisão do Juan em 03/09/2026: um só leitor, sem escolha nenhuma.
 */
/*
 * ─── HISTÓRICO DE LEITURAS (aceitas E recusadas) ────────────────────────────
 *
 * Pedido do Juan (26/09/2026): leitura recusada não deixava rastro — quem
 * tentou entrar, deu erro e foi pro manual (ou embora) era invisível. Cada
 * leitura do scanner grava em `leituras_qr` quem foi lido, quem leu, o
 * resultado e a frase que o operador viu. Grava DEPOIS de responder (`after`),
 * então não atrasa o portão; e sem a tabela (supabase/upgrade-leituras-qr.sql
 * ainda não rodado) só não grava. Nunca guarda o conteúdo do QR — tem o token
 * da credencial dentro.
 */
let leiturasAusenteDesde = 0

/*
 * Pausas no meio do turno (supabase/upgrade-pausas-turno.sql) — entrada,
 * saída, entrada, saída, sem limite (pedido do Juan, 26/09/2026). O banco só
 * guarda uma entrada e uma saída por pessoa/dia, então a volta reabre o
 * turno; a saída do meio fica aqui, e o histórico mostra e desconta das
 * horas. Sem a tabela, só não grava — a auditoria continua guardando.
 */
/*
 * "Tabela ausente" vale só por um minuto — não pra sempre. Guardado como
 * booleano, um servidor que viu a tabela faltar ANTES da migração rodar
 * continuava pulando a gravação depois dela (a volta do Weberton, 21:55 de
 * 26/09/2026, ficou sem pausa assim).
 */
const AUSENTE_POR_MS = 60_000
let pausasAusenteDesde = 0
async function registrarPausa(p: {
  funcionarioId: string; eventoId: string; dataRef: string
  saiuEm: string; voltouEm: string; perfilId: string | null; origem: 'scanner' | 'assistido' | 'manual'
}) {
  if (Date.now() - pausasAusenteDesde < AUSENTE_POR_MS) return
  try {
    const { error } = await supabaseAdmin.from('pausas_turno').insert([{
      funcionario_id: p.funcionarioId, evento_id: p.eventoId, data_ref: p.dataRef,
      saiu_em: p.saiuEm, voltou_em: p.voltouEm, registrado_por: p.perfilId, origem: p.origem,
    }])
    if (error && /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) {
      pausasAusenteDesde = Date.now()
    } else if (error) {
      console.error('[pausas_turno] não gravou', error.message)
    }
  } catch (e) {
    console.error('[pausas_turno] falhou', e)
  }
}

// ─── Onde o APARELHO DO OPERADOR estava (supabase/upgrade-geolocalizacao-operador.sql) ─────────────────
/*
 * Pedido do Juan (08/10/2026, VITAL): toda leitura do scanner e todo Registro de ponto gravam a localização do
 * aparelho de quem registrou; fora do raio do local do evento, a batida VALE, mas fica marcada para a conferência
 * interna (só admin/master veem — o colaborador não sabe que existe). Colunas novas gravadas À PARTE e tolerantes:
 * sem a migração, a batida grava como sempre.
 */
async function localDoEvento(eventoId: string): Promise<LocalDoEvento | null> {
  try {
    const { data, error } = await supabaseAdmin.from('eventos').select('local_latitude, local_longitude, local_raio_m').eq('id', eventoId).maybeSingle()
    if (error || data?.local_latitude == null || data?.local_longitude == null) return null
    return { latitude: Number(data.local_latitude), longitude: Number(data.local_longitude), raioM: Number(data.local_raio_m ?? 800) }
  } catch { return null }
}

/** Marca a batida com precisão, distância e "fora do local". Nunca lança — é rastro, não trava. */
async function marcarLocalDaBatida(registroId: string | null | undefined, eventoId: string, pos: Posicao | null) {
  if (!registroId || !pos) return
  try {
    const { distanciaM, foraDoLocal } = avaliarLocal(pos, await localDoEvento(eventoId))
    await supabaseAdmin.from('registros')
      .update({ precisao_m: pos.precisao ?? null, distancia_m: distanciaM, fora_do_local: foraDoLocal })
      .eq('id', registroId)
  } catch (e) { console.error('[geo] batida não marcada (migração pendente?)', e) }
}

/**
 * Tentativa de batida RECUSADA por estar fora do raio do local do evento — fica no nome da pessoa (pedido do Juan,
 * 08/10/2026: "no tal dia, tal pessoa tentou bater fora do evento… me traga o endereço que ela bateu"). Busca o
 * endereço do ponto (Nominatim) e grava na auditoria; a linha em `leituras_qr` (relatório "Fora do local" e
 * histórico da pessoa) é gravada por quem chama, com o mesmo endereço. Nunca lança — roda depois da resposta.
 */
async function enderecoDaPosicao(pos: Posicao | null): Promise<string | null> {
  if (!pos) return null
  try { return await enderecoAproximado(pos.latitude, pos.longitude) } catch { return null }
}

const ROTULO_MOMENTO_TENTATIVA: Record<string, string> = { entrada: 'entrada', meio: 'meio', fim: 'saída' }

async function auditarTentativaForaDoLocal(t: {
  eventoId: string; funcionarioId: string | null
  /** Quem estava com o aparelho. `id` nulo = o celular da própria pessoa (autoatendimento). */
  quem: { id: string | null; nome: string }
  origem: 'celular' | 'scanner' | 'registro_manual'
  momento: string | null; distanciaM: number | null; endereco: string | null
}) {
  const ondeFoi = t.origem === 'celular' ? 'pelo próprio celular' : t.origem === 'scanner' ? 'no scanner do operador' : 'no registro manual do operador'
  await registrarAuditoria({
    perfil: t.quem, acao: 'TENTATIVA_FORA_DO_LOCAL',
    campoAlterado: `Tentativa de ${t.momento ? ROTULO_MOMENTO_TENTATIVA[t.momento] ?? t.momento : 'batida'} fora do local (${ondeFoi})`,
    valorNovo: curto(`${t.distanciaM != null ? descreverDistancia(t.distanciaM) : 'localização não confirmada'}${t.endereco ? ` — ${t.endereco}` : ''}`, 400),
    funcionarioId: t.funcionarioId ?? undefined, eventoId: t.eventoId,
  })
}

/** Insere em `leituras_qr` com o endereço; sem a coluna (upgrade-endereco-tentativa-fora.sql pendente), grava sem ele. */
async function inserirLeituraComEndereco(linha: Record<string, unknown>, endereco: string | null) {
  let { error } = await supabaseAdmin.from('leituras_qr').insert([{ ...linha, endereco_aproximado: endereco }])
  if (error && /endereco_aproximado/.test(error.message)) ({ error } = await supabaseAdmin.from('leituras_qr').insert([linha]))
  return error
}

function resultadoDaLeitura(r: ResultadoScan): string {
  if (r.cancelado) return 'cancelado'
  if (r.jaRegistrado) return 'ja_validado'
  if (r.success) return r.momento === 'fim' && !r.veiculo ? 'saida' : 'liberado'
  if (r.foraDoLocal) return 'fora_do_local'
  if (r.diaNaoAutorizado) return 'dia_nao_autorizado'
  if (r.setorLotado) return 'setor_lotado'
  return r.qrInvalido ? 'invalido' : 'negado'
}

async function gravarLeituraQR(dados: {
  eventoId: string; perfilId: string | null; tipo: 'credencial' | 'veiculo'
  qrData: string; resultado: ResultadoScan | null
  /** Onde o aparelho do operador estava — ver `marcarLocalDaBatida`. */
  local?: Posicao | null
}) {
  if (Date.now() - leiturasAusenteDesde < AUSENTE_POR_MS) return
  try {
    let funcionarioId: string | null = null
    if (dados.tipo === 'credencial') {
      const leitura = lerCodigoQR((dados.qrData ?? '').split('|')[0]?.trim() ?? '', diaBRT())
      if (leitura.ok) {
        const { data } = await supabaseAdmin.from('funcionarios').select('id').eq('qr_token', leitura.token).maybeSingle()
        funcionarioId = (data?.id as string | undefined) ?? null
      }
    } else {
      const token = extrairQrTokenDeVeiculo(dados.qrData)
      if (token) {
        const { data } = await supabaseAdmin.from('veiculos').select('funcionario_id').eq('qr_token', token).maybeSingle()
        funcionarioId = (data?.funcionario_id as string | null | undefined) ?? null
      }
    }
    const r = dados.resultado
    const base = {
      evento_id: dados.eventoId || null,
      perfil_id: dados.perfilId,
      funcionario_id: funcionarioId,
      tipo: dados.tipo,
      sucesso: !!r?.success,
      resultado: r ? resultadoDaLeitura(r) : 'erro',
      mensagem: r?.message ?? 'Erro inesperado ao validar',
    }
    const pos = dados.local ?? null
    const geo = pos && dados.eventoId ? avaliarLocal(pos, await localDoEvento(dados.eventoId)) : { distanciaM: null, foraDoLocal: null }
    // Recusada por estar fora do raio: guarda o endereço e deixa no nome da pessoa (auditoria) — ver `auditarTentativaForaDoLocal`.
    const recusadaFora = !!r?.foraDoLocal
    const endereco = recusadaFora ? await enderecoDaPosicao(pos) : null
    let error = await inserirLeituraComEndereco({
      ...base,
      latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, precisao_m: pos?.precisao ?? null,
      distancia_m: geo.distanciaM, fora_do_local: geo.foraDoLocal,
    }, endereco)
    if (recusadaFora && dados.eventoId) {
      const { data: op } = dados.perfilId
        ? await supabaseAdmin.from('perfis').select('nome').eq('id', dados.perfilId).maybeSingle()
        : { data: null }
      await auditarTentativaForaDoLocal({
        eventoId: dados.eventoId, funcionarioId,
        quem: { id: dados.perfilId, nome: (op?.nome as string | undefined) ?? 'Operador' },
        origem: 'scanner', momento: r?.momento ?? null, distanciaM: geo.distanciaM ?? r?.distanciaForaDoLocal ?? null, endereco,
      })
    }
    // Sem as colunas de localização (migração pendente): grava a leitura como antes.
    if (error && /latitude|longitude|precisao_m|distancia_m|fora_do_local/.test(error.message)) {
      ({ error } = await supabaseAdmin.from('leituras_qr').insert([base]))
    }
    if (error && /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) {
      leiturasAusenteDesde = Date.now()
    } else if (error) {
      console.error('[leituras_qr] não gravou', error.message)
    }
  } catch (e) {
    console.error('[leituras_qr] falhou', e)
  }
}

/**
 * O scanner chama isto. A validação em si é `validarLeituraQR`; aqui ela
 * ganha duas coisas: nunca lança (uma exceção virava "não foi possível
 * validar" genérico na tela) e toda leitura vai pro histórico.
 */
export async function registrarPresencaQR(
  eventoId: string, qrData: string,
  /** O botão ENTRADA/SAÍDA do scanner. Sem ele, o sistema decide (ver `inferirMomentoQR`). */
  momentoEscolhido?: 'entrada' | 'fim',
  /**
   * `apenasConferir`: a leitura é conferida e volta como PRÉVIA, sem gravar —
   * o scanner mostra SALVAR / CANCELAR e só então chama de novo sem isto
   * (pedido do Juan, 26/09/2026). A confirmação refaz TODAS as checagens.
   */
  opcoes?: {
    apenasConferir?: boolean; subeventoIds?: string[]; justificativaAtraso?: string
    /** Localização do aparelho do operador (obrigatória na tela do leitor) — ver `marcarLocalDaBatida`. */
    local?: { latitude: number; longitude: number; precisao?: number | null } | null
  },
): Promise<ResultadoScan> {
  const escolhido = momentoEscolhido === 'entrada' || momentoEscolhido === 'fim' ? momentoEscolhido : undefined
  const local = posicaoValida(opcoes?.local)
  const apenasConferir = opcoes?.apenasConferir === true
  let resultado: ResultadoScan
  try {
    resultado = await validarLeituraQR(eventoId, qrData, escolhido, apenasConferir, opcoes?.subeventoIds, opcoes?.justificativaAtraso, local)
  } catch (e) {
    console.error('[registrarPresencaQR]', e)
    resultado = { success: false, message: 'Não foi possível validar agora. Leia o QR de novo.' }
  }
  // Prévia aprovada não vai pro histórico (a confirmação vai); prévia
  // RECUSADA vai — é justamente a leitura recusada que se quer enxergar.
  if (!resultado.previa) {
    // `getPerfil` é cache() — a validação já buscou, aqui não vai ao banco.
    const perfilId = ((await getPerfil().catch(() => null))?.id as string | undefined) ?? null
    const final = resultado
    after(() => gravarLeituraQR({ eventoId, perfilId, tipo: 'credencial', qrData, resultado: final, local }))
  }
  return resultado
}

/** O operador leu, viu a prévia e CANCELOU — fica no histórico de leituras. */
export async function cancelarLeituraQR(eventoId: string, qrData: string, momento?: 'entrada' | 'fim'): Promise<void> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return
  const rotulo = momento === 'fim' ? 'SAÍDA' : 'ENTRADA'
  after(() => gravarLeituraQR({
    eventoId, perfilId: perfil.id as string, tipo: 'credencial', qrData,
    resultado: { success: false, message: `${rotulo} cancelada pelo operador na confirmação.`, cancelado: true },
  }))
}

async function validarLeituraQR(
  eventoId: string, qrData: string, escolhido?: 'entrada' | 'fim',
  /** Só confere e devolve a PRÉVIA — não grava nada (ver `ResultadoScan.previa`). */
  apenasConferir = false,
  /** Para quais áreas/subeventos este portão está configurado — ver `autorizarPresenca`. */
  subeventoIds?: string[],
  /** O motivo do atraso, já escrito — ver `autorizarPresenca`. */
  justificativaAtraso?: string,
  /** Onde o aparelho do operador estava. */
  local?: Posicao | null,
): Promise<ResultadoScan> {
  const perfil = await getPerfil()
  // Todos os papéis autenticados podem escanear (inclui supervisor).
  if (!perfil || !podeEscanear(perfil)) return { success: false, message: 'Sem permissão' }

  // O QR carrega um código ASSINADO e com prazo, não o token cru — ver
  // lib/credencial-qr.ts. O split de "|" sobrevive só por causa de um formato
  // antigo que já circulou com o tipo grudado no fim.
  // O dia de HOJE, não o `data_ref` do registro: num turno que vira a
  // madrugada o registro pertence a ontem, mas o crachá na mão da pessoa é o
  // de hoje. Comparar com data_ref recusaria quem está saindo às 4 da manhã.
  const leitura = lerCodigoQR((qrData ?? '').split('|')[0]?.trim() ?? '', diaBRT())
  if (!leitura.ok) return { success: false, message: leitura.erro, qrInvalido: true }
  const token = leitura.token
  const agora = new Date()

  /*
   * TUDO QUE NÃO DEPENDE UMA COISA DA OUTRA SAI JUNTO (portão do Pontal
   * Weekend, 26/09/2026).
   *
   * Esta leitura fazia ~20 idas ao banco UMA DEPOIS DA OUTRA, cada uma
   * atravessando da função (EUA) até o banco (São Paulo) — segundos com a
   * tela do operador parada, que era o "primeiro scan não mostra nada". As
   * checagens abaixo continuam EXATAMENTE na mesma ordem e com as mesmas
   * mensagens; o que mudou é só que os dados já chegam juntos. Nada é
   * devolvido antes de `podeEscanearEvento` aprovar.
   */
  const [{ data: evento }, diaDeHojeQR, podeEsteEvento, { data: func }, diaTurno] = await Promise.all([
    supabaseAdmin
      .from('eventos')
      .select(`id, organizacao_id, ${JANELA_SELECT}`)
      .eq('id', eventoId)
      .single(),
    // Hoje pode ser um segundo (ou terceiro) dia principal de um festival de
    // várias noites, não só a data de início — `diaDeTrabalho` já sabe ler
    // `jornada_dias` pela data certa.
    diaDeTrabalho(eventoId, diaBRT(agora)),
    podeEscanearEvento(perfil, eventoId),
    supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, cargo, telefone, ativo, status_credenciamento, descredenciado_em, fornecedor_id, origem, fornecedores(evento_id, nome, exige_meio)')
      .eq('qr_token', token)
      .single(),
    diaDoTurno(eventoId, agora),
  ])
  if (!evento) return { success: false, message: 'Evento não encontrado' }

  /*
   * A ETAPA do crachá tem que bater com a etapa de hoje.
   *
   * É aqui, e não dentro do leitor, porque a etapa depende do evento: o mesmo
   * instante é "montagem" para um evento e "dia do evento" para outro. O leitor
   * confere a assinatura (o código é nosso?); esta linha confere a validade (o
   * código serve para hoje?).
   *
   * É o que impede o crachá que circulou a semana toda na montagem de entrar
   * no dia do evento.
   */
  const dadosDoEvento = evento as { data_inicio?: string | null; data_fim?: string | null }
  const faseDeHoje = faseAtualDoQR(agora, dadosDoEvento.data_inicio, dadosDoEvento.data_fim, diaDeHojeQR?.tipo === 'principal')
  const etapa = faseConfere(leitura.fase, faseDeHoje)
  /*
   * Logo depois do FIM do evento, o crachá do dia do evento ainda vale — só
   * para a SAÍDA de quem ficou além do horário (27/09/2026: a noite acaba às
   * 08:00 e tem gente saindo às 08:30 com a credencial ainda mostrando o QR
   * da noite). Não abre brecha: hoje não é dia de trabalho, então uma
   * entrada é recusada mais adiante de qualquer jeito (`resolverRegistro`).
   */
  const fimDoEventoMs = dadosDoEvento.data_fim ? new Date(dadosDoEvento.data_fim).getTime() : NaN
  const saidaDepoisDoFim = !etapa.ok
    && leitura.fase === 'evento' && faseDeHoje === 'desmontagem'
    && (!diaDeHojeQR || diaDeHojeQR.cancelado === true)
    && agora.getTime() - fimDoEventoMs >= 0 && agora.getTime() - fimDoEventoMs < 12 * 60 * 60 * 1000
  if (!etapa.ok && !saidaDepoisDoFim) {
    /*
     * A recusa por etapa não é só um aviso — é uma decisão a tomar.
     *
     * A pessoa está de pé no portão com um crachá que não serve para hoje.
     * Isso pode ser inocente (abriu a tela de ontem, não recarregou) ou não
     * (pegou o print da montagem de alguém). Quem credencia não tem como saber
     * pelo QR, então a tela oferece a conferência pelo CPF em vez de deixar a
     * escolha entre barrar e liberar no escuro.
     */
    return {
      success: false,
      message: `Este QR Code é da ${NOME_DA_FASE[leitura.fase ?? 'montagem']}, mas agora vale o da ${NOME_DA_FASE[faseDeHoje]}. Peça para a pessoa atualizar a credencial. Se ainda não resolver, confira pelo CPF.`,
      faseErrada: { doQR: NOME_DA_FASE[leitura.fase ?? 'montagem'], deHoje: NOME_DA_FASE[faseDeHoje] },
    }
  }
  // Isolamento: master → qualquer evento; admin → só da org; supervisor → só vinculado
  if (!podeEsteEvento) {
    return { success: false, message: 'Sem acesso a este evento' }
  }

  return autorizarPresenca({
    perfil, evento: evento as EventoJanelas & { id: string; organizacao_id: string | null },
    eventoId, func, agora, escolhido, apenasConferir, diaTurno,
    origem: 'web', subeventoIdsLidos: subeventoIds, justificativaAtraso,
    latitude: local?.latitude, longitude: local?.longitude, precisao: local?.precisao ?? undefined,
  })
}

/**
 * A AUTORIZAÇÃO — uma função só, para QUALQUER jeito de identificar a
 * pessoa (`funcionarioId` já resolvido).
 *
 * Isto é o que o pedido do Juan (27/09/2026) chama de "mesma camada final de
 * autorização" para QR e biometria: nem `validarLeituraQR` (QR) nem
 * `validarLeituraFacial` (rosto) decidem sozinhos se a pessoa pode entrar —
 * os dois só descobrem QUEM ela é (por caminhos diferentes) e chamam esta
 * função, que sempre foi o corpo de `validarLeituraQR` antes de existir
 * biometria nenhuma. Extraída aqui sem mudar uma linha de lógica — é por
 * isso que o comportamento do QR não muda em nada.
 *
 * Também é a peça que garante NUNCA HAVER DUPLA ENTRADA/SAÍDA entre os dois
 * métodos: os dois passam pelo mesmo `inferirMomentoQR`/`resolverRegistro`,
 * que consultam a mesma tabela `registros` pela mesma chave — QR registra a
 * entrada, biometria lida em seguida vê "já registrado", e vice-versa.
 */
async function autorizarPresenca(args: {
  perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>
  evento: EventoJanelas & { id: string; organizacao_id: string | null }
  eventoId: string
  func: {
    id: string; nome: string; cpf: string | null; cargo: string | null; telefone: string | null
    ativo: boolean | null; status_credenciamento: string | null; descredenciado_em: string | null
    fornecedor_id: string | null; origem?: string | null; fornecedores: unknown
  } | null
  agora: Date
  escolhido?: 'entrada' | 'fim'
  apenasConferir: boolean
  /** Já calculado por quem chama, pro mesmo motivo do resto: uma ida a menos ao banco. */
  diaTurno: string
  /** Vai para `registros.origem` — o método que identificou a pessoa. */
  origem: 'web' | 'face'
  /** Onde o aparelho de quem leu estava (QR e rosto) — ver `marcarLocalDaBatida`. */
  latitude?: number
  longitude?: number
  precisao?: number
  /**
   * Para quais áreas/subeventos este portão está configurado (Vital,
   * 01/10/2026 — várias portarias no mesmo evento, cada uma cobrindo uma ou
   * mais áreas). Vazio/ausente = evento sem subeventos, ou portão ainda sem
   * configurar área nenhuma — nenhuma checagem nova entra em jogo.
   */
  subeventoIdsLidos?: string[]
  /**
   * O motivo do atraso, já escrito pelo operador (Vital, 30/09/2026) — só é
   * exigido quando `precisaJustificativaAtraso` veio `true` na prévia. Sem
   * isso a entrada segue como antes, sem pedir nada.
   */
  justificativaAtraso?: string
}): Promise<ResultadoScan> {
  const { perfil, evento, eventoId, func, agora, escolhido, apenasConferir, diaTurno, origem, latitude, longitude, precisao, subeventoIdsLidos, justificativaAtraso } = args

  if (!func) return { success: false, message: 'Funcionário não encontrado' }

  const funcInfo = {
    nome: func.nome, cargo: func.cargo ?? null,
    setor: (func.fornecedores as unknown as { nome?: string } | null)?.nome ?? null,
  }
  if ((func.fornecedores as any)?.evento_id !== eventoId) {
    return { success: false, message: 'Credencial não pertence a este evento' }
  }

  /*
   * ÁREA/SUBEVENTO — a credencial precisa ser de uma das áreas que ESTE
   * portão está autorizado a ler (Vital, 01/10/2026: várias portarias no
   * mesmo evento, cada uma cobrindo uma ou mais áreas — "Portaria 2 lê
   * Arquibancada + Camarote"). Consulta À PARTE e tolerante (mesmo padrão de
   * `exige_meio`/`link_ativo`): só roda quando o portão de fato já configurou
   * pelo menos uma área — na imensa maioria dos eventos (sem a feature) isto
   * não pesa leitura nenhuma. É controle de acesso de verdade, por isso
   * BLOQUEIA (não é só um aviso como o "cadastrado em outro evento" da
   * biometria) — e ganha categoria visual PRÓPRIA (`areaErrada`), nem "já
   * validado" nem "QR inválido" nem o "negado" genérico: a credencial é
   * válida, só pertence a outro portão.
   */
  /*
   * SAÍDA É LIVRE (Juan, 09/10/2026): a área só vale na ENTRADA. Saindo — botão SAÍDA, ou entrada em aberto sem o
   * botão ENTRADA (o mesmo critério que decide o momento logo abaixo) — qualquer leitor registra, sem "ÁREA DIFERENTE".
   */
  const conferirArea = !!subeventoIdsLidos?.length && (await obterFuncionalidadesDoEvento(evento.id)).areaNoScannerHabilitada
  const ehSaida = conferirArea && (escolhido === 'fim' || (escolhido !== 'entrada' && !!(await entradaDoTurno(func.id, eventoId, agora))))
  if (conferirArea && !ehSaida && subeventoIdsLidos?.length) {
    // Só confere a área se a organização LIGOU a seleção de área no leitor. Desligada (padrão), um leitor com áreas
    // guardadas de antes (localStorage) também não barra ninguém: o leitor só registra quem entra.
    try {
      const { data: funcSub } = await supabaseAdmin
        .from('funcionarios').select('subevento_id, origem, subeventos(nome)').eq('id', func.id).maybeSingle()
      const subeventoDaCredencial = (funcSub as { subevento_id?: string | null } | null)?.subevento_id ?? null

      /*
       * SUPERVISOR EM VÁRIAS ÁREAS (Juan, 06/10/2026): ele tem UM crachá, um
       * QR e uma diária por evento, que nasce na área do primeiro setor. Num
       * portão de outra área onde ele também tem setor, comparar só com essa
       * área o barraria como "ÁREA DIFERENTE". Aqui vale qualquer área onde
       * ele supervisiona — e só isso: ele não ganha acesso a área onde não
       * tem setor nenhum.
       */
      let areaLiberada = !!subeventoDaCredencial && subeventoIdsLidos.includes(subeventoDaCredencial)
      if (!areaLiberada && (funcSub as { origem?: string | null } | null)?.origem === 'supervisor' && func.cpf) {
        const { data: perfilDele } = await supabaseAdmin.from('perfis').select('id').eq('cpf', func.cpf as string).maybeSingle()
        if (perfilDele) {
          const { data: setoresDele } = await supabaseAdmin
            .from('supervisor_setores').select('fornecedores!inner(subevento_id, evento_id)')
            .eq('perfil_id', perfilDele.id).eq('fornecedores.evento_id', eventoId)
          areaLiberada = (setoresDele ?? []).some(l => {
            const sub = (l.fornecedores as unknown as { subevento_id?: string | null } | null)?.subevento_id
            return !!sub && subeventoIdsLidos.includes(sub)
          })
        }
      }
      if (!areaLiberada) {
        const nomeCorreto = (funcSub as unknown as { subeventos?: { nome?: string } | null } | null)?.subeventos?.nome ?? null
        const { data: areasAqui } = await supabaseAdmin.from('subeventos').select('nome').in('id', subeventoIdsLidos)
        const nomesAqui = (areasAqui ?? []).map(s => s.nome as string).join(' / ') || 'nenhuma área cadastrada'
        return {
          success: false,
          areaErrada: true,
          funcionario: funcInfo,
          message: nomeCorreto
            ? `Esta credencial é da área ${nomeCorreto}. Este leitor está autorizado só para: ${nomesAqui}. Procure a portaria certa.`
            : `Esta credencial não está vinculada a nenhuma área. Este leitor exige uma destas: ${nomesAqui}.`,
        }
      }
    } catch { /* migração pendente — sem checagem de área */ }
  }
  const statusCred = statusCredenciamentoValido(func.status_credenciamento as string)
  if (statusCred === 'pendente') {
    return { success: false, message: 'Credenciamento ainda aguardando aprovação.', funcionario: funcInfo }
  }
  if (statusCred === 'negado') {
    return { success: false, message: 'Credenciamento não autorizado.', funcionario: funcInfo }
  }
  if (func.ativo === false) {
    return { success: false, message: 'Funcionário cadastrado mas NÃO ativado para trabalhar. Ative-o no painel do fornecedor antes de registrar.', funcionario: funcInfo }
  }

  /*
   * CPF barrado pelo supervisor do setor (ver `bloquearCpf`).
   *
   * A pessoa pode ter sido bloqueada DEPOIS de já estar cadastrada e com o
   * QR no celular — descredenciar tira da lista, mas o bloqueio é o que
   * fecha a porta de vez. Aqui a mensagem é pro OPERADOR, não pra ela: ele
   * está com a pessoa na frente e precisa saber o que fazer.
   */
  // Mesma ideia da primeira leva: bloqueio, setor do supervisor e o turno em
  // aberto chegam juntos; as checagens seguem na ordem de sempre.
  const [bloqueado, setoresDoSupervisor, entradaAberta] = await Promise.all([
    func.cpf ? cpfEstaBloqueado(eventoId, func.cpf as string, func.fornecedor_id as string) : Promise.resolve(false),
    perfil.role === 'supervisor' ? meusSetores(perfil) : Promise.resolve(null),
    entradaDoTurno(func.id, eventoId, agora),
  ])

  if (bloqueado) {
    return {
      success: false,
      message: 'Esta pessoa está bloqueada neste fornecedor. Não libere a entrada — procure o supervisor do fornecedor.',
      funcionario: funcInfo,
    }
  }

  // Supervisor só escaneia a própria equipe (qualquer um dos setores dele).
  // Sem setor nenhum, não escaneia ninguém.
  if (setoresDoSupervisor && !setoresDoSupervisor.some(s => s.id === func.fornecedor_id)) {
    return { success: false, message: 'Esta pessoa não é da sua equipe. Ela precisa passar pelo credenciamento do evento.', funcionario: funcInfo }
  }

  /*
   * ESCALA POR DIA (eventos de subeventos) — o QR só vale nos dias que o
   * supervisor aprovou para esta pessoa. O dia conferido é o do TURNO: quem
   * entrou ontem à noite (dia aprovado) e sai às 4h de hoje está fechando o
   * turno de ontem, não começando um dia novo. Pessoa fora do fluxo (evento
   * normal, cadastro pelo painel) passa direto — ver `conferirEscalaNoDia`.
   */
  const escalaHoje = await conferirEscalaNoDia(func.id, eventoId, entradaAberta?.dataRef ?? diaTurno)
  if (!escalaHoje.ok) {
    return {
      success: false, diaNaoAutorizado: true, funcionario: funcInfo,
      message: `${escalaHoje.titulo} ${escalaHoje.mensagem}`,
    }
  }

  /*
   * FORA DO LOCAL DO EVENTO: BLOQUEIA (pedido do Juan, 08/10/2026 — antes só marcava para conferência; achado ao
   * vivo testando o próprio QR fora do estádio, sem nenhum aviso). Só quando o evento TEM local configurado em
   * Editar evento: sem isso não há contra o que comparar, e nada muda (o comportamento de sempre). Roda ANTES da
   * prévia, para o operador já ver a recusa ao ler o QR, sem chegar a "Confirme para registrar".
   *
   * Vale para QR e rosto (os dois passam por aqui) — não para o registro assistido, que tem a checagem própria
   * em `registrarPresencaAssistida` (localização obrigatória do operador, mesma regra).
   */
  {
    const posOperador = posicaoValida({ latitude, longitude, precisao })
    const localEvento = await localDoEvento(eventoId)
    if (localEvento) {
      const { distanciaM, foraDoLocal } = avaliarLocal(posOperador, localEvento)
      if (!posOperador || foraDoLocal) {
        return {
          success: false,
          foraDoLocal: true,
          distanciaForaDoLocal: distanciaM ?? undefined,
          funcionario: funcInfo,
          message: posOperador
            ? `FORA DO LOCAL DO EVENTO (${descreverDistancia(distanciaM!)}). A batida não foi registrada. Aproxime-se do local configurado para o evento.`
            : 'Não foi possível confirmar sua localização. Verifique o GPS e tente de novo — a batida não foi registrada.',
        }
      }
    }
  }

  const jaBuscado = { entrada: entradaAberta, diaTurno }
  const decidido = await inferirMomentoQR(func.id, eventoId, agora, jaBuscado, escolhido)
  // "Acabou de registrar" é uma leitura REPETIDA, não uma recusa: a tela
  // mostra como "já validado" (âmbar), não como acesso negado (vermelho).
  if ('erro' in decidido) {
    return { success: false, message: decidido.erro, funcionario: funcInfo, jaRegistrado: decidido.recente === true }
  }

  /*
   * DESCREDENCIADO — mas só bloqueia quando NÃO é uma volta do mesmo dia.
   *
   * Bug real (28/09/2026, achado num teste ao vivo do Juan): a saída
   * "final" é decidida por HORÁRIO (`ehSaidaFinal` — depois que a janela de
   * saída abre), não por intenção. Quem sai pra uma pausa depois desse
   * horário e volta no MESMO dia batia direto nesta trava antes mesmo de
   * `inferirMomentoQR` ter a chance de reconhecer que era uma volta —
   * reabertura de turno e descredenciamento andavam em paralelo, e o mais
   * severo sempre vencia. Por isso a checagem entra AQUI, depois de saber
   * se `decidido` é uma reabertura: reabertura prova, pelo próprio fato de
   * estar acontecendo, que aquela saída não era definitiva.
   */
  if (func.descredenciado_em && !('reabrir' in decidido)) {
    return {
      success: false,
      message: `Já descredenciado deste evento em ${formatarBR(func.descredenciado_em as string, 'curto')}. Para voltar, o organizador precisa recredenciar no painel do fornecedor.`,
      funcionario: funcInfo,
    }
  }

  /*
   * A VOLTA DE QUEM JÁ TINHA IDO EMBORA HOJE.
   *
   * Apaga a saída daquele dia e o turno fica aberto de novo, com a chegada
   * original preservada — ver `inferirMomentoQR` pro porquê de não ser uma
   * entrada nova. A próxima leitura dela vira a saída final.
   *
   * Não passa por `resolverRegistro`: não há batida nova pra validar contra
   * janela de horário, e a pessoa está voltando ao trabalho num horário que,
   * por definição, não é o da entrada nem o da saída do dia.
   */
  if ('reabrir' in decidido) {
    // Prévia: diz o que vai acontecer e para — nada é gravado.
    if (apenasConferir) {
      return {
        success: true, previa: true, volta: true, momento: 'entrada' as const, funcionario: funcInfo,
        message: `Voltando ao trabalho — saiu às ${formatarBR(decidido.reabrir.em, 'hora')}. A saída fica no histórico como pausa.`,
      }
    }
    // A saída do meio vira PAUSA antes de sair da tabela de batidas — é o
    // que o histórico mostra (saiu às X, voltou às Y) e desconta das horas.
    await registrarPausa({
      funcionarioId: func.id, eventoId, dataRef: decidido.reabrir.dataRef,
      saiuEm: decidido.reabrir.em, voltouEm: agora.toISOString(),
      perfilId: perfil.id, origem: origem === 'face' ? 'assistido' : 'scanner',
    })
    const { error: erroReabrir } = await supabaseAdmin
      .from('registros').delete().eq('id', decidido.reabrir.id)
    if (erroReabrir) {
      return { success: false, message: 'Não consegui reabrir o turno desta pessoa. Tente de novo.', funcionario: funcInfo }
    }
    // A saída que reabriu tinha descredenciado por engano (ver o comentário
    // acima) — desfaz junto, senão a PRÓXIMA saída trava tudo de novo.
    if (func.descredenciado_em) {
      await supabaseAdmin.from('funcionarios').update({ descredenciado_em: null, descredenciado_por: null }).eq('id', func.id)
    }

    // A saída apagada não some: fica aqui, com horário e com quem leu o QR.
    after(() => registrarAuditoria({
      perfil, acao: 'REABERTURA_TURNO', eventoId,
      campoAlterado: 'Voltou a trabalhar no mesmo dia',
      valorAnterior: `Saída às ${formatarBR(decidido.reabrir.em, 'hora')}`,
      valorNovo: `Turno reaberto às ${formatarBR(agora.toISOString(), 'hora')}`,
      funcionarioId: func.id,
    }))

    return {
      success: true,
      message: `Entrada registrada — voltou ao trabalho. A saída das ${formatarBR(decidido.reabrir.em, 'hora')} ficou no histórico como pausa.`,
      funcionario: funcInfo,
      momento: 'entrada' as const,
    }
  }

  const momento = decidido.momento

  /*
   * "Entrada em qualquer horário" (Vital, item 5, 30/09/2026) — versão POR
   * FORNECEDOR do `batida_livre` que já existe por evento inteiro (bandas,
   * postura e afins, que fogem da janela combinada com o cliente). Consulta
   * À PARTE e tolerante (coluna nova) e só roda em 'entrada' — é a única
   * etapa que essa isenção afeta.
   */
  let entradaQualquerHorario = false
  if (momento === 'entrada') {
    try {
      const { data: fRow } = await supabaseAdmin
        .from('fornecedores').select('entrada_qualquer_horario').eq('id', func.fornecedor_id).maybeSingle()
      entradaQualquerHorario = (fRow as { entrada_qualquer_horario?: boolean } | null)?.entrada_qualquer_horario === true
    } catch { /* migração pendente — segue com a janela normal */ }
  }

  // A saída depois do fim do evento traz a entrada que ela fecha (ver
  // `turnoAbertoForaDoDiaDeTrabalho`) — é dela que sai o dia do registro.
  const resolucao = await resolverRegistro(
    evento, func.id, momento, agora,
    decidido.entrada ? { ...jaBuscado, entrada: decidido.entrada } : jaBuscado,
    entradaQualquerHorario,
  )
  if (!resolucao.ok) return { success: false, message: resolucao.erro, funcionario: funcInfo }

  /*
   * Segunda leitura (QR ou rosto) no mesmo dia não reescreve nada.
   *
   * Antes valia a última batida. Não vale mais para a entrada, porque ela virou
   * a âncora do horário do meio: reler o crachá uma hora depois empurraria o
   * meio junto, e a pessoa perderia a etapa sem ter feito nada de errado.
   * É esta checagem que garante NUNCA HAVER DUPLA ENTRADA entre QR e
   * biometria: os dois métodos consultam a MESMA linha em `registros`.
   *
   * Devolve SUCESSO de propósito. Do ponto de vista de quem está no portão a
   * pessoa está credenciada; pintar a tela de vermelho faria o operador achar
   * que deu problema e chamar a pessoa de volta.
   */
  if (resolucao.jaEm) {
    return {
      success: true,
      message: `${momento === 'entrada' ? 'Entrada' : 'Saída'} já registrada em ${formatarBR(resolucao.jaEm, 'curto')}.`,
      funcionario: funcInfo,
      momento,
      jaRegistrado: true,
    }
  }

  /*
   * SETOR LOTADO NO DIA (trava por dia do fornecedor): só ENTRADA nova — quem
   * já entrou hoje foi devolvido acima como "já registrado", e saída/meio não
   * ocupam vaga. A mensagem é pra quem está no portão: diz o que aconteceu e
   * o que fazer, sem deixar dúvida de que NÃO é pra liberar.
   */
  if (momento === 'entrada') {
    const vaga = await vagaNoSetorNoDia(func.fornecedor_id as string, resolucao.dataRef, func.id, func.origem)
    if (!vaga.ok) {
      const setor = funcInfo.setor ?? 'este setor'
      return {
        success: false, setorLotado: true, funcionario: funcInfo,
        message: `SETOR LOTADO. ${setor} já tem ${vaga.ocupadas} de ${vaga.maximo} pessoas liberadas hoje (${listarDias([resolucao.dataRef])}). NÃO libere a entrada. Peça para a pessoa procurar o supervisor do setor.`,
      }
    }
  }

  /*
   * JUSTIFICATIVA DE ATRASO — pedido do Vital (30/09/2026), corrigido no
   * mesmo dia: só para fornecedor com "confirmação de meio" ligada
   * (`exige_meio`), não todo mundo. Reaproveita esse campo porque já marca
   * quem é pago por pessoa/hora — o perfil que também costuma cobrar
   * apontamento de atraso.
   */
  let precisaJustificativaAtraso = false
  if (momento === 'entrada') {
    const exigeMeioDoFornecedor = (func.fornecedores as unknown as { exige_meio?: boolean } | null)?.exige_meio === true
    if (exigeMeioDoFornecedor) {
      const diaDaJornada = await diaDeTrabalho(eventoId, resolucao.dataRef)
      const esperado = horariosEsperados(evento, resolucao.dataRef, diaDaJornada)
      /*
       * Atrasado = depois do FIM da janela de entrada (Juan, 09/10/2026, véspera do dia principal do VITAL: "considera
       * atraso só quem chega depois das 16h" — janela 14h–16h). Antes valia o INÍCIO: quem entrava às 14h05, dentro da
       * janela, já obrigava o porteiro a digitar motivo, nos 39 setores com meio. Sem fim configurado, vale o início
       * (como antes); sem horário de entrada no dia (montagem/desmontagem), continua sem pedir motivo.
       */
      const limiteDoAtraso = esperado.entrada ? (esperado.entradaLimite ?? esperado.entrada) : null
      if (limiteDoAtraso && agora.getTime() > new Date(limiteDoAtraso).getTime()) {
        precisaJustificativaAtraso = true
      }
    }
  }

  // Prévia: tudo conferido, nada gravado — o operador confirma antes.
  if (apenasConferir) {
    return {
      success: true, previa: true, momento, funcionario: funcInfo, precisaJustificativaAtraso,
      message: momento === 'entrada' ? 'Confirme para registrar a ENTRADA.' : 'Confirme para registrar a SAÍDA.',
    }
  }

  if (precisaJustificativaAtraso && (justificativaAtraso ?? '').trim().length < 5) {
    return {
      success: false, funcionario: funcInfo, precisaJustificativaAtraso,
      message: 'Chegou atrasado — escreva o motivo antes de salvar.',
    }
  }

  const extra: Record<string, unknown> = {
    /*
     * QUEM LEU fica gravado na batida, qualquer que seja o papel (antes, só supervisor). Sem isto, a batida do
     * scanner do operador não dizia quem leu — e no VITAL (08/10/2026) não dava para separar o que o operador
     * registrou do que a pessoa bateu sozinha. A marca de "registro assistido" continua vindo de `registro_manual`.
     */
    criado_por_perfil_id: perfil.id,
    origem,
    ...(typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : {}),
    ...(precisaJustificativaAtraso ? { justificativa: justificativaAtraso!.trim() } : {}),
  }
  if (momento === 'fim') {
    const justificativa = await observacaoSemMeio(func.id, eventoId, resolucao.dataRef)
    if (justificativa) extra.justificativa = justificativa
  }
  const { data: registroGravado, error } = await upsertRegistro(func.id, eventoId, momento, extra, resolucao.dataRef, resolucao.jornadaDiaId)
  if (error) return { success: false, message: 'Erro ao registrar. Tente de novo.' }
  {
    const pos = posicaoValida({ latitude, longitude, precisao })
    after(() => marcarLocalDaBatida(registroGravado?.id as string | undefined, eventoId, pos))
  }

  /*
   * O lembrete do meio so pode ser agendado AGORA.
   *
   * Ele nao tem horario fixo: e esta entrada + 4h. Antes de a pessoa bater o
   * ponto nao existe horario nenhum pra agendar, entao `sincronizarAgendamentos`
   * nao tem como cuidar disso — quem cuida e este momento.
   *
   * Em background: falhar o agendamento nao pode segurar a fila do portao.
   */
  if (momento === 'entrada' && func.telefone) {
    after(() =>
      agendarMeioAposEntrada({
        eventoId,
        funcionarioId: func.id,
        telefone: func.telefone as string,
        entradaEm: new Date().toISOString(),
        dataRef: resolucao.dataRef,
      }).catch(console.error)
    )
  }

  /*
   * NUNCA MAIS descredencia sozinho na saída — nem no último dia principal.
   *
   * Existiu até 28/09/2026: a saída do último dia principal fechava o
   * vínculo, achando que "acabou o show, a pessoa não volta". Três bugs
   * reais em produção vieram exatamente daqui — pausa no mesmo dia sendo
   * lida como definitiva, e quem ainda tinha montagem/desmontagem marcada
   * ficando trancado sem conseguir voltar. Pedido explícito do Juan
   * (28/09/2026, teste ao vivo): "não pode travar dele credenciar... ele
   * pode entrar e sair mais de uma vez no mesmo dia, tudo precisa estar
   * registrado" — toda entrada/saída grava normalmente, sempre, e só o
   * organizador remove alguém da equipe de propósito (`descredenciarFuncionario`,
   * o botão "Remover da equipe" no painel do setor).
   */

  return {
    success: true,
    message: momento === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!',
    funcionario: funcInfo,
    momento,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BIOMETRIA FACIAL — segundo método de IDENTIFICAÇÃO, ao LADO do QR Code.
//
// O QR Code não sai daqui em nenhuma linha: `autorizarPresenca` acima (que já
// era o corpo de `validarLeituraQR`) é chamada pelos DOIS métodos. Esta seção
// só resolve "quem é essa pessoa?" a partir de um rosto — a mesma pergunta
// que o QR resolve a partir de um token — e entrega pra função de sempre.
//
// O que NÃO está aqui, de propósito (ver o estudo em c:\Dev\credenciei-
// biometria): liveness certificado por hardware, totem, câmeras dedicadas,
// pgvector. Esta é a fatia MVP: cadastro assistido no portão (o operador já
// autenticado, com a pessoa na frente — mesmo modelo de confiança do
// registro assistido por foto que já existe) e reconhecimento no scanner do
// portão, com o QR sempre disponível como alternativa a um toque.
// ═══════════════════════════════════════════════════════════════════════════

/** O evento aceita biometria (sozinha ou junto do QR)? */
function biometriaHabilitada(metodo: string | null | undefined): boolean {
  return metodo === 'biometria' || metodo === 'biometria_qr'
}

/**
 * Grava toda TENTATIVA de reconhecimento — reconhecida ou não — sem nunca
 * guardar o rosto nem o vetor. É o que permite responder depois "quantas
 * pessoas precisaram do QR porque a biometria falhou" (pedido do Juan) sem
 * reter dado biométrico nenhum no log.
 *
 * Tolerante à tabela não existir (a migração é `supabase/upgrade-biometria-
 * facial.sql`, ainda por rodar) — mesmo padrão de `gravarLeituraQR`.
 */
let biometriaTentativasAusenteDesde = 0
async function gravarTentativaBiometrica(dados: {
  eventoId: string; perfilId: string | null; funcionarioId: string | null
  resultado: string; distancia?: number; duracaoMs?: number
}) {
  if (Date.now() - biometriaTentativasAusenteDesde < AUSENTE_POR_MS) return
  try {
    const { error } = await supabaseAdmin.from('biometria_tentativas').insert([{
      evento_id: dados.eventoId || null,
      perfil_id: dados.perfilId,
      funcionario_id: dados.funcionarioId,
      resultado: dados.resultado,
      distancia: dados.distancia ?? null,
      duracao_ms: dados.duracaoMs ?? null,
    }])
    if (error && /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) {
      biometriaTentativasAusenteDesde = Date.now()
    } else if (error) {
      console.error('[biometria_tentativas] não gravou', error.message)
    }
  } catch (e) {
    console.error('[biometria_tentativas] falhou', e)
  }
}

/**
 * Consentimento — SEMPRE antes da captura, nunca depois.
 *
 * Biometria é dado sensível (LGPD art. 5º, II); o cadastro hoje é assistido
 * no portão (o operador segura o aparelho), então quem precisa concordar é a
 * PESSOA, não o operador — a tela mostra o termo pra ELA e é o toque DELA
 * que chama isto, antes de a câmera abrir. `podeEscanear` aqui autentica o
 * APARELHO/sessão que está rodando a tela, não substitui o consentimento da
 * pessoa.
 */
export async function consentirBiometria(funcionarioId: string, eventoId: string): Promise<{ ok?: boolean; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return { error: 'Sem permissão.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('id', funcionarioId)
    .single()
  if (!func || (func.fornecedores as unknown as { evento_id: string })?.evento_id !== eventoId) {
    return { error: 'Cadastro não encontrado neste evento.' }
  }

  const { error } = await supabaseAdmin.from('biometria_consentimentos').insert([{
    funcionario_id: funcionarioId, evento_id: eventoId, registrado_por_perfil_id: perfil.id,
  }])
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) {
      return { error: 'Biometria ainda não foi ativada no sistema (migração pendente).' }
    }
    return { error: 'Não foi possível registrar o consentimento. Tente de novo.' }
  }
  auditar(perfil, 'BIOMETRIA_CONSENTIMENTO', { campoAlterado: 'Biometria', eventoId, funcionarioId, valorNovo: 'Consentimento registrado' })
  return { ok: true }
}

/**
 * Cadastra (ou substitui) o rosto de uma pessoa NESTE evento.
 *
 * O vetor (128 números) é o que sai do reconhecimento no NAVEGADOR
 * (face-api.js) — nunca a foto, nunca chega imagem nenhuma ao servidor.
 * Exige consentimento já registrado (`consentirBiometria`), e o mesmo escopo
 * de quem pode registrar presença (supervisor só a própria equipe).
 */
export async function cadastrarBiometria(
  funcionarioId: string, eventoId: string, descritor: number[],
): Promise<{ ok?: boolean; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return { error: 'Sem permissão.' }
  if (!descritorValido(descritor)) return { error: 'Rosto não capturado corretamente. Tente de novo.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('id', funcionarioId)
    .single()
  if (!func || (func.fornecedores as unknown as { evento_id: string })?.evento_id !== eventoId) {
    return { error: 'Cadastro não encontrado neste evento.' }
  }
  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    if (!meus.some(s => s.id === func.fornecedor_id)) {
      return { error: 'Esta pessoa é de outro fornecedor. Você só cadastra biometria da sua equipe.' }
    }
  }

  const { data: consentimento } = await supabaseAdmin
    .from('biometria_consentimentos')
    .select('id').eq('funcionario_id', funcionarioId).eq('evento_id', eventoId)
    .is('revogado_em', null).order('aceito_em', { ascending: false }).limit(1).maybeSingle()
  if (!consentimento) {
    return { error: 'É preciso o consentimento da pessoa antes de cadastrar o rosto dela.' }
  }

  const { error } = await supabaseAdmin.from('biometria_templates').upsert([{
    funcionario_id: funcionarioId, evento_id: eventoId, vetor: descritor, criado_por_perfil_id: perfil.id,
  }], { onConflict: 'funcionario_id,evento_id' })
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) {
      return { error: 'Biometria ainda não foi ativada no sistema (migração pendente).' }
    }
    return { error: mensagemAmigavel(error) }
  }

  auditar(perfil, 'BIOMETRIA_CADASTRADA', { campoAlterado: 'Biometria', eventoId, funcionarioId, valorNovo: `Rosto de ${func.nome} cadastrado` })
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${func.fornecedor_id}`)
  return { ok: true }
}

/**
 * O scanner chama isto pro modo rosto. Mesmo contrato de `registrarPresencaQR`
 * (prévia + confirmação, nunca lança, sempre vai pro log — aqui em
 * `biometria_tentativas`, sem nunca guardar o vetor recebido).
 */
export async function registrarPresencaFacial(
  eventoId: string, descritor: number[], escolhido?: 'entrada' | 'fim',
  opcoes?: { apenasConferir?: boolean; latitude?: number; longitude?: number; precisao?: number; subeventoIds?: string[]; justificativaAtraso?: string },
): Promise<ResultadoScan> {
  const inicio = Date.now()
  let funcionarioIdParaLog: string | null = null
  let distanciaParaLog: number | undefined
  let resultadoParaLog = 'erro'

  let resultado: ResultadoScan
  try {
    const r = await validarLeituraFacial(
      eventoId, descritor, escolhido, opcoes?.apenasConferir === true,
      opcoes?.latitude, opcoes?.longitude, opcoes?.subeventoIds, opcoes?.justificativaAtraso, opcoes?.precisao,
    )
    resultado = r.resultado
    funcionarioIdParaLog = r.funcionarioId
    distanciaParaLog = r.distancia
    resultadoParaLog = r.logResultado
  } catch (e) {
    console.error('[registrarPresencaFacial]', e)
    resultado = { success: false, message: 'Não foi possível validar agora. Tente de novo ou use o QR Code.' }
  }

  // Prévia aprovada ainda não é o registro final — só a confirmação (sem
  // `apenasConferir`) entra no log, mesmo padrão de `registrarPresencaQR`.
  if (!resultado.previa) {
    const perfilId = ((await getPerfil().catch(() => null))?.id as string | undefined) ?? null
    after(() => gravarTentativaBiometrica({
      eventoId, perfilId, funcionarioId: funcionarioIdParaLog,
      resultado: resultadoParaLog, distancia: distanciaParaLog, duracaoMs: Date.now() - inicio,
    }))
  }
  return resultado
}

type ResultadoValidacaoFacial = { resultado: ResultadoScan; funcionarioId: string | null; distancia?: number; logResultado: string }

async function validarLeituraFacial(
  eventoId: string, descritor: number[], escolhido: 'entrada' | 'fim' | undefined, apenasConferir: boolean,
  latitude?: number, longitude?: number,
  /** Para quais áreas/subeventos este portão está configurado — ver `autorizarPresenca`. */
  subeventoIds?: string[],
  /** O motivo do atraso, já escrito — ver `autorizarPresenca`. */
  justificativaAtraso?: string,
  precisao?: number,
): Promise<ResultadoValidacaoFacial> {
  const semLog = (resultado: ResultadoScan, logResultado: string, distancia?: number): ResultadoValidacaoFacial =>
    ({ resultado, funcionarioId: null, logResultado, distancia })

  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return semLog({ success: false, message: 'Sem permissão' }, 'erro')

  if (!descritorValido(descritor)) {
    return semLog({ success: false, message: 'Rosto não capturado corretamente. Use o QR Code.', qrInvalido: true }, 'qualidade_baixa')
  }

  const agora = new Date()
  const [{ data: evento }, podeEsteEvento, diaTurno] = await Promise.all([
    supabaseAdmin.from('eventos').select(`id, organizacao_id, metodo_identificacao, ${JANELA_SELECT}`).eq('id', eventoId).single(),
    podeEscanearEvento(perfil, eventoId),
    diaDoTurno(eventoId, agora),
  ])
  if (!evento) return semLog({ success: false, message: 'Evento não encontrado' }, 'erro')
  if (!biometriaHabilitada((evento as { metodo_identificacao?: string }).metodo_identificacao)) {
    return semLog({ success: false, message: 'Este evento não usa biometria facial. Use o QR Code.', qrInvalido: true }, 'erro')
  }
  if (!podeEsteEvento) return semLog({ success: false, message: 'Sem acesso a este evento' }, 'erro')

  /*
   * SEM exigência de localização aqui — mudou de ideia em 27/09/2026: este
   * caminho (`registrarPresencaFacial`) é hoje usado só pelo TOTEM
   * (`app/scan/FaceScannerView.tsx`), um aparelho FIXO no portão. Pedir GPS
   * pessoa por pessoa num tablet que nunca sai do lugar não prova nada a
   * mais, só cria fricção. A localização continua obrigatória no dia do
   * evento só no autoatendimento pelo CELULAR DA PRÓPRIA PESSOA
   * (`registrarPresencaFacialLivre`, mais abaixo) — ali sim ela prova que
   * quem está batendo está de fato no local.
   */

  /*
   * A galeria é SÓ deste evento — o coração do isolamento multi-evento
   * (pedido do Juan): um rosto cadastrado no evento A nunca é comparado
   * contra o evento B, porque a consulta abaixo nem TRAZ os templates de B.
   */
  // Paginada: o banco corta em 1.000 linhas, e num evento com milhares de rostos quem estava
  // além da primeira página dava "não identificado" no totem sem nenhum erro.
  const templates = await buscarTudo<{ funcionario_id: string; vetor: unknown }>((de, ate) =>
    supabaseAdmin.from('biometria_templates').select('funcionario_id, vetor')
      .eq('evento_id', eventoId).order('id').range(de, ate))

  const candidatos: Candidato[] = templates
    .filter(t => descritorValido(t.vetor))
    .map(t => ({ funcionarioId: t.funcionario_id as string, distancia: distanciaEuclidiana(descritor, t.vetor as number[]) }))

  const match = decidirMatch(candidatos)
  if (!match.encontrado) {
    /*
     * SEGUNDA ETAPA — só roda quando a galeria deste evento não achou
     * ninguém: "essa pessoa existe no sistema, só não está cadastrada
     * AQUI?" (pedido do Juan, 29/09/2026 — identidade da pessoa e
     * autorização no evento são perguntas separadas).
     *
     * Limitada à MESMA organização do evento atual, de propósito: comparar
     * contra a plataforma inteira (1) aumentaria a chance de confundir duas
     * pessoas parecidas numa galeria enorme, e (2) revelaria pra quem opera
     * o portão de um cliente que uma pessoa trabalha pro evento de OUTRO
     * cliente — o mesmo limite de isolamento por organização que o resto do
     * sistema já respeita. Fora da organização, ou sem achar em lugar
     * nenhum, a resposta continua a de sempre: "não identificado".
     */
    const organizacaoId = (evento as { organizacao_id?: string | null }).organizacao_id
    if (organizacaoId) {
      const templatesOutroEvento = await buscarTudo<{ funcionario_id: string; vetor: unknown; evento_id: string; eventos: unknown }>((de, ate) =>
        supabaseAdmin
          .from('biometria_templates')
          .select('funcionario_id, vetor, evento_id, eventos!inner(nome, local, data_inicio, organizacao_id)')
          .eq('eventos.organizacao_id', organizacaoId)
          .neq('evento_id', eventoId)
          .order('id').range(de, ate))

      const candidatosFora: Candidato[] = templatesOutroEvento
        .filter(t => descritorValido(t.vetor))
        .map(t => ({ funcionarioId: t.funcionario_id as string, distancia: distanciaEuclidiana(descritor, t.vetor as number[]) }))
      const matchFora = decidirMatch(candidatosFora)

      if (matchFora.encontrado) {
        const linha = templatesOutroEvento.find(t => t.funcionario_id === matchFora.funcionarioId)
        const eventoAlheio = linha?.eventos as unknown as { nome: string; local: string | null; data_inicio: string | null } | undefined
        after(() => gravarTentativaBiometrica({
          eventoId, perfilId: perfil.id as string, funcionarioId: matchFora.funcionarioId,
          resultado: 'outro_evento', distancia: matchFora.distancia,
        }))
        return semLog({
          success: false,
          /*
           * O texto antigo ("isso não autoriza a entrada neste evento") era lido como "esta pessoa NÃO PODE trabalhar
           * aqui" — e no VITAL (08/10/2026) a equipe desistiu de cadastrar quem tinha trabalhado no Henrique e
           * Juliano. Não há trava nenhuma: o mesmo CPF pode estar em eventos diferentes. Ela só não se cadastrou
           * NESTE evento ainda — e é isso que a tela precisa dizer, com o caminho.
           */
          message: `Esta pessoa ainda não está cadastrada neste evento${eventoAlheio ? ` (o cadastro encontrado é do evento ${eventoAlheio.nome}, que não vale aqui)` : ''}. Ela PODE trabalhar aqui: faça o cadastro dela pelo link do setor e, depois de aprovado, leia de novo.`,
          cadastradoEmOutroEvento: eventoAlheio
            ? { nome: eventoAlheio.nome, local: eventoAlheio.local, data: eventoAlheio.data_inicio }
            : { nome: 'outro evento', local: null, data: null },
        }, 'outro_evento', matchFora.distancia)
      }
    }

    /*
     * NUNCA revela candidatos nem "quase achei fulano" — só que não achou.
     *
     * NÃO é uma recusa de acesso — na imensa maioria das vezes é a PRIMEIRA
     * leitura de alguém que ainda não cadastrou o rosto. A biometria continua
     * sendo a PRIORIDADE mesmo aqui: a mensagem pede pra tentar de novo
     * primeiro; o QR só aparece como plano B, nunca como o caminho sugerido
     * (pedido explícito do Juan, 27/09/2026: "a prioridade é a pessoa se
     * cadastrar com a biometria, qr code é apenas um plano B no dia do
     * evento"). `naoIdentificado` é o que a tela usa pra mostrar isto sem
     * cara de erro/rejeição. O log guarda o motivo (`match.motivo`) pra
     * métricas, sem apontar pra ninguém.
     */
    return semLog({
      success: false,
      message: `${MENSAGEM_POR_MOTIVO[match.motivo] ?? 'Não conseguimos identificar seu cadastro.'} Tente de novo, olhando direto pra câmera. Se continuar sem reconhecer, use o QR Code.`,
      naoIdentificado: true,
    }, match.motivo, match.distancia)
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, cargo, telefone, ativo, status_credenciamento, descredenciado_em, fornecedor_id, origem, fornecedores(evento_id, nome, exige_meio)')
    .eq('id', match.funcionarioId)
    .single()

  const resultado = await autorizarPresenca({
    perfil, evento: evento as EventoJanelas & { id: string; organizacao_id: string | null },
    eventoId, func, agora, escolhido, apenasConferir, diaTurno,
    origem: 'face', latitude, longitude, precisao, subeventoIdsLidos: subeventoIds, justificativaAtraso,
  })
  return { resultado, funcionarioId: match.funcionarioId, distancia: match.distancia, logResultado: resultado.success ? 'sucesso' : 'negado' }
}

/**
 * Biometria SEM operador — pela credencial, o funcionário batendo sozinho.
 *
 * Irmã de `registrarPresencaLivre` (o mesmo modelo: ação pública, protegida
 * só pelo token da credencial, sem `getPerfil()` nenhum) — não passa por
 * `autorizarPresenca` porque aquela função pressupõe um OPERADOR autenticado
 * (as checagens de escopo do supervisor não fazem sentido pra alguém
 * registrando a si mesmo). Mesma régua de acesso de `registrarPresencaLivre`
 * pro resto: aprovado, ativo, dia de trabalho, "já registrou".
 *
 * SÓ ENTRADA — mesma decisão do Juan que desligou a saída livre em
 * `registrarPresencaLivre` ("não tá mapeado, não tá estudado como a gente
 * pode fazer na prática"). A saída pela biometria continua exigindo o
 * aparelho do PORTÃO (`registrarPresencaFacial`) ou o QR mostrado lá.
 *
 * Só existe se o evento ligou `biometria_autoatendimento` — nasce desligado
 * (ver supabase/upgrade-biometria-modos.sql); ligar ou não é decisão do
 * produtor, tela de Editar evento.
 */
/** Entrada e saída só no portão, pelo operador (scanner ou manual) — ver `registrarPresencaLivre`. */
const ENTRADA_E_SAIDA_SO_PELO_OPERADOR = true

export async function registrarPresencaFacialLivre(
  token: string, descritor: number[], latitude: number | null, longitude: number | null,
): Promise<{ ok?: boolean; error?: string; nome?: string }> {
  // Mesmo teto de `registrarPresencaLivre`: ação pública, só o token protege.
  if (ENTRADA_E_SAIDA_SO_PELO_OPERADOR) {
    return { error: 'A entrada é registrada no portão, pelo operador. Mostre o QR Code da sua credencial.' }
  }
  if (!await podePassar(`livre-face:${token}`, 20, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }
  if (!descritorValido(descritor)) return { error: 'Rosto não capturado corretamente. Tente de novo.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, nome, cpf, telefone, ativo, status_credenciamento, fornecedor_id, origem, fornecedores(evento_id, eventos(id, organizacao_id, metodo_identificacao, biometria_autoatendimento, ${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'aprovado') {
    return { error: 'Seu credenciamento ainda não foi aprovado pelo organizador.' }
  }
  if (func.ativo === false) return { error: 'Seu cadastro ainda não foi ativado pelo organizador. Fale com o seu supervisor.' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  if (!biometriaHabilitada(evento.metodo_identificacao) || evento.biometria_autoatendimento !== true) {
    return { error: 'Este evento não usa reconhecimento facial pela credencial. Mostre o QR Code no credenciamento.' }
  }

  // Mesmo bloqueio que o portão respeita — sem operador olhando, esta
  // conferência é a única coisa que fecha a porta pra quem foi barrado.
  if (func.cpf && await cpfEstaBloqueado(eventoId, func.cpf as string, func.fornecedor_id as string)) {
    return { error: 'Não é possível registrar sua presença agora. Procure o supervisor do seu fornecedor.' }
  }

  /*
   * LOCALIZAÇÃO OBRIGATÓRIA no dia do evento — mesma régua do aparelho do
   * portão (`validarLeituraFacial`). Sem operador nenhum olhando pra pessoa,
   * o GPS é a única prova de que ela está de fato no local.
   */
  const diaTurno = await diaDoTurno(eventoId, new Date())
  const diaDeHoje = await diaDeTrabalho(eventoId, diaTurno)
  const temGps = typeof latitude === 'number' && typeof longitude === 'number'
  if (diaDeHoje?.tipo === 'principal' && !temGps) {
    return { error: 'Ative a localização do aparelho para registrar sua entrada pela biometria no dia do evento.' }
  }

  /*
   * Verificação 1:1 contra o PRÓPRIO cadastro, quando existe.
   *
   * Sem operador confirmando com os olhos, isto é a camada que garante que
   * quem está batendo é de fato quem o token diz ser — não só "alguém com o
   * link". Sem cadastro ainda, aceita como prova de vida (o mesmo nível do
   * check-in por selfie do meio, que já existe neste sistema e nunca
   * verificou rosto nenhum).
   */
  const { data: proprioTemplate } = await supabaseAdmin
    .from('biometria_templates').select('vetor').eq('funcionario_id', func.id).eq('evento_id', eventoId).maybeSingle()
  if (proprioTemplate && descritorValido(proprioTemplate.vetor)) {
    const distancia = distanciaEuclidiana(descritor, proprioTemplate.vetor as number[])
    if (distancia > LIMIAR_PADRAO) {
      after(() => gravarTentativaBiometrica({ eventoId, perfilId: null, funcionarioId: func.id, resultado: 'acima_do_limiar', distancia }))
      return { error: 'O rosto não bateu com o seu cadastro. Tente de novo com boa luz, ou mostre o QR Code no credenciamento.' }
    }
  }

  const resolucao = await resolverRegistro({ ...evento, id: eventoId }, func.id, 'entrada')
  if (!resolucao.ok) return { error: resolucao.erro }
  // Escala por dia (eventos de subeventos) — mesma régua do portão, ver `autorizarPresenca`.
  const escalaHoje = await conferirEscalaNoDia(func.id, eventoId, resolucao.dataRef)
  if (!escalaHoje.ok) return { error: `${escalaHoje.titulo} ${escalaHoje.mensagem}` }
  // Trava por dia do setor: lotado, a entrada pelo celular também é recusada.
  {
    const vaga = await vagaNoSetorNoDia(func.fornecedor_id as string, resolucao.dataRef, func.id, func.origem as string | null)
    if (!vaga.ok) return { error: `Setor lotado: já há ${vaga.ocupadas} de ${vaga.maximo} pessoas liberadas hoje. Procure o seu supervisor.` }
  }
  if (resolucao.jaEm) {
    return { error: `Você já registrou a entrada em ${formatarBR(resolucao.jaEm, 'curto')}.` }
  }

  const extra: Record<string, unknown> = { origem: 'face', ...(temGps ? { latitude, longitude } : {}) }
  const { data: registro, error } = await upsertRegistro(func.id, eventoId, 'entrada', extra, resolucao.dataRef, resolucao.jornadaDiaId)
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

  if (temGps && registro) after(() => sincronizarEndereco(registro.id, latitude as number, longitude as number).catch(console.error))
  if (func.telefone) {
    after(() =>
      agendarMeioAposEntrada({
        eventoId, funcionarioId: func.id, telefone: func.telefone as string,
        entradaEm: new Date().toISOString(), dataRef: resolucao.dataRef,
      }).catch(console.error)
    )
  }
  after(() => gravarTentativaBiometrica({ eventoId, perfilId: null, funcionarioId: func.id, resultado: 'sucesso' }))

  return { ok: true, nome: func.nome as string }
}

/**
 * Rede de segurança: completa a biometria de quem já está aprovado e
 * credenciado, mas ainda não tem rosto cadastrado NESTE evento — pulou no
 * formulário, câmera falhou, ou o formulário nem oferecia biometria ainda
 * quando ela se cadastrou. Chamada pela própria credencial
 * (`/credential/[token]`), com o mesmo modelo de confiança de
 * `registrarPresencaFacialLivre`: o `qr_token` É o segredo, sem sessão.
 *
 * Passa pela MESMA régua de `cadastrarFuncionarioPublico`
 * (`resolverBiometriaNoCadastro`) — se o CPF já ganhou um perfil mestre
 * enquanto isso (cadastro em outro evento no meio do caminho), reaproveita
 * sem nem precisar do descritor recém-capturado.
 */
export async function completarBiometriaPublica(
  token: string, descritor: number[],
): Promise<{ ok?: boolean; reaproveitada?: boolean; error?: string }> {
  if (!await podePassar(`completar-biometria:${token}`, 10, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }
  if (!descritorValido(descritor)) return { error: 'Rosto não capturado corretamente. Tente de novo.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, cpf, status_credenciamento, fornecedor_id, fornecedores(evento_id, eventos(metodo_identificacao))')
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'aprovado') {
    return { error: 'Seu credenciamento ainda não foi aprovado pelo organizador.' }
  }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!eventoId) return { error: 'Evento não encontrado' }
  if (!biometriaHabilitada(evento?.metodo_identificacao)) {
    return { error: 'Este evento não usa reconhecimento facial.' }
  }

  const { temBiometria, biometriaReaproveitada } = await resolverBiometriaNoCadastro({
    funcionarioId: func.id as string, eventoId, cpf: func.cpf as string, descritor,
  })
  if (!temBiometria) return { error: 'Não foi possível salvar sua biometria agora. Tente de novo.' }

  return { ok: true, reaproveitada: biometriaReaproveitada }
}

/** Marca no próprio registro quem bateu o meio sem o aparelho dar a localização. */
const JUSTIFICATIVA_SEM_GPS = 'Meio registrado sem localização (aparelho não forneceu).'

/**
 * Check-in por FOTO do próprio funcionário — exclusivo da etapa MEIO
 * (durante o evento). Chamado da página pública da credencial; o token
 * (qr_token) é o segredo que identifica a pessoa.
 *
 * A localização entra quando o aparelho consegue, e o registro sai marcado
 * quando não — ver o comentário longo dentro da função.
 */
export async function registrarPresencaFoto(
  token: string,
  fotoBase64: string,
  /** Entra quando o aparelho consegue. Sem ela o registro sai marcado, não recusado. */
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: boolean; error?: string; semLocalizacao?: boolean }> {
  /*
   * A LOCALIZAÇÃO DEIXOU DE SER OBRIGATÓRIA — e isto vale a explicação.
   *
   * Ela era exigida como prova de que a pessoa estava no local. Na prática,
   * fez o oposto: em 100% dos casos o meio acabava registrado por um
   * supervisor, e não pela pessoa. Os números, no dia em que isto mudou:
   * 13 meios no histórico INTEIRO do sistema, 13 deles assistidos, ZERO
   * feitos pelo próprio funcionário.
   *
   * A causa é o navegador embutido do WhatsApp, por onde o link chega: ele
   * não responde ao pedido de localização. A câmera funciona (é o app de
   * câmera do celular, não a da página) — só o GPS não. Então a trava não
   * separava quem estava no local de quem não estava: separava quem abriu
   * fora do WhatsApp de todo o resto.
   *
   * E o registro assistido, que virou a saída de todo mundo, grava o GPS do
   * SUPERVISOR — não o da pessoa. Ou seja: exigir GPS estava produzindo
   * menos prova de localização, não mais.
   *
   * Agora a foto e o horário são a prova base, a localização entra quando o
   * aparelho conseguir, e quem bateu sem ela fica MARCADO (ver
   * `JUSTIFICATIVA_SEM_GPS`) para o organizador cobrar no fechamento.
   */
  if (!fotoBase64?.startsWith('data:image/')) return { error: 'Foto inválida' }

  // Ação pública (o qr_token é o segredo). Sem teto, um token vazado vira
  // upload ilimitado no Storage — a pessoa legítima bate uma vez, não vinte.
  if (!await podePassar(`foto:${token}`, 20, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, ativo, status_credenciamento, fornecedores(evento_id, eventos(id, ${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'aprovado') {
    return { error: 'Seu credenciamento ainda não foi aprovado pelo organizador.' }
  }
  if (func.ativo === false) return { error: 'Seu cadastro ainda não foi ativado pelo organizador. Fale com o seu supervisor.' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  const resolucao = await resolverRegistro({ ...evento, id: eventoId }, func.id, 'meio')
  if (!resolucao.ok) return { error: resolucao.erro }
  // Escala por dia (eventos de subeventos) — mesma régua do portão, ver `autorizarPresenca`.
  const escalaHoje = await conferirEscalaNoDia(func.id, eventoId, resolucao.dataRef)
  if (!escalaHoje.ok) return { error: `${escalaHoje.titulo} ${escalaHoje.mensagem}` }
  if (resolucao.jaEm) {
    return { error: `Você já registrou o meio em ${formatarBR(resolucao.jaEm, 'curto')}.` }
  }

  // Decodifica a foto (data URL) e envia ao Storage
  const match = fotoBase64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { error: 'Foto inválida' }
  const contentType = match[1]
  const ext = contentType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  const path = `${eventoId}/${func.id}/meio-${resolucao.dataRef}.${ext}`

  const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (up.error) {
    console.error('Erro no upload da foto:', up.error)
    return { error: 'Não foi possível salvar a foto. Tente de novo.' }
  }

  const semLocalizacao = latitude == null || longitude == null
  const { data: registro, error } = await upsertRegistro(
    func.id, eventoId, 'meio',
    {
      foto_url: path, latitude, longitude,
      // Marcado no próprio registro, não só ausente: "sem latitude" também
      // acontece em batida antiga e em registro assistido, e o fechamento
      // precisa distinguir "o aparelho não deu" de "nunca teve".
      ...(semLocalizacao ? { justificativa: JUSTIFICATIVA_SEM_GPS } : {}),
    },
    resolucao.dataRef,
    resolucao.jornadaDiaId,
  )
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

  // Só há endereço a buscar quando houve coordenada.
  if (!semLocalizacao) {
    after(() => sincronizarEndereco(registro.id, latitude!, longitude!).catch(console.error))
  }

  /*
   * A selfie do meio vira a foto de perfil de quem ainda não tem.
   *
   * Quem não anexou foto no cadastro é justamente quem o supervisor mais
   * precisa reconhecer no portão — e esta selfie é melhor que a do cadastro:
   * foi tirada no dia, no local, com a roupa de trabalho.
   *
   * Duas travas de propósito:
   *   • só quando está VAZIO — sobrescrever trocaria o retrato que a pessoa
   *     escolheu por uma selfie de plantão, sem ela pedir;
   *   • só a PRIMEIRA — atualizando todo dia, a foto de perfil viraria
   *     "última selfie" e mudaria sozinha, confundindo quem confere.
   *
   * Em background: falhar aqui não pode derrubar uma batida já registrada.
   */
  after(async () => {
    const { error } = await supabaseAdmin
      .from('funcionarios')
      .update({ foto_perfil_path: path })
      .eq('id', func.id)
      .is('foto_perfil_path', null)
    if (error) console.error('[presenca] não consegui usar a selfie como perfil:', error.message)
  })

  return { ok: true, semLocalizacao }
}

/**
 * Check-in de entrada/saída SEM operador — pela credencial, com localização.
 *
 * Sempre disponível na montagem/desmontagem: quem chega antes da portaria
 * abrir ou sai depois dela fechar não pode ficar esperando alguém pra ler o
 * QR. Sem selfie de propósito — é rápido no local, e a foto é o que trava a
 * câmera em navegador embutido quebrado (o mesmo problema já corrigido no
 * meio).
 *
 * No dia principal, só funciona se `eventos.checkin_autonomo` estiver
 * ligado — os DOIS fluxos coexistem por escolha do admin, nenhum substitui
 * o outro (ver a migração e o checkbox em editar evento). Desligado (padrão),
 * o dia principal continua só no Fluxo 1: crachá lido por um operador, do
 * jeito que já era. Esconder o botão na tela não seria suficiente — é esta
 * checagem, no servidor, que vale.
 */
/** Entre a entrada e a saída pelo botão do celular — ver a trava dentro de `registrarPresencaLivre`. */
const INTERVALO_MINIMO_SAIDA_MS = 5 * 60 * 1000

export async function registrarPresencaLivre(
  token: string,
  momento: 'entrada' | 'fim',
  latitude: number | null,
  longitude: number | null,
  /**
   * O token lido do QR IMPRESSO no local (o cartaz da portaria), quando a
   * pessoa registrou escaneando em vez de só tocar no botão.
   *
   * É uma prova bem mais forte que a localização: o cartaz está pendurado no
   * local, e o código dele não circula por WhatsApp. Opcional de propósito —
   * o botão continua funcionando sozinho, senão um cartaz caído ou molhado
   * travaria a operação inteira.
   */
  tokenDoLocal?: string
): Promise<{ ok?: boolean; error?: string; momento?: 'entrada' | 'fim' }> {
  if (momento !== 'entrada' && momento !== 'fim') return { error: 'Etapa inválida' }

  // Mesmo teto da foto do meio: ação pública, protegida só pelo token.
  if (!await podePassar(`livre:${token}`, 20, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, nome, telefone, ativo, status_credenciamento, fornecedor_id, origem, fornecedores(evento_id, eventos(id, token_portaria, ${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (statusCredenciamentoValido(func.status_credenciamento as string) !== 'aprovado') {
    return { error: 'Seu credenciamento ainda não foi aprovado pelo organizador.' }
  }
  if (func.ativo === false) return { error: 'Seu cadastro ainda não foi ativado pelo organizador. Fale com o seu supervisor.' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  /*
   * ENTRADA E SAÍDA SÓ PELO OPERADOR DE PORTÃO, EXCETO na janela de autoatendimento (decisão do Juan, 08/10/2026,
   * VITAL, retomada e ampliada em 08/10/2026 com o recurso "Autoatendimento fora do horário da portaria"): a
   * pessoa registrava a própria entrada/saída pelo botão da credencial, sem ninguém conferir. Hoje quem registra
   * é o operador — no scanner ou de forma manual pelo perfil dele. A credencial só mostra o QR.
   *
   * A ÚNICA exceção é esta janela: o operador apertou "Estou indo embora" (`ativarAutoatendimentoPortao`) e ainda
   * está dentro do horário configurado em Editar evento — pensada pra quando a equipe do credenciamento já foi
   * embora e ainda sobra gente dentro do evento sem jeito de bater a saída. Fora da janela, continua tudo como
   * era: só o operador. E só nos dias marcados — o dia em que a janela COMEÇOU, porque ela pode cruzar a
   * meia-noite (ver lib/autoatendimento-regras.ts).
   */
  const diaAutoatendimento = await diaDoAutoatendimentoLiberado(eventoId)
  const autoatendimentoLiberado = diaAutoatendimento !== null
  if (!autoatendimentoLiberado) {
    if (ENTRADA_E_SAIDA_SO_PELO_OPERADOR) {
      return { error: 'A entrada e a saída são registradas no portão, pelo operador. Mostre o QR Code da sua credencial.' }
    }
    if (momento === 'fim') {
      return { error: 'A saída ainda precisa ser feita mostrando o QR Code no credenciamento.' }
    }
  }
  /*
   * Geolocalização OBRIGATÓRIA neste modo (pedido do Juan: "todos os registros precisam ser feitos com
   * geolocalização") — sem operador olhando, o GPS é a única prova de que a pessoa está de fato no evento.
   */
  if (autoatendimentoLiberado && (typeof latitude !== 'number' || typeof longitude !== 'number')) {
    return { error: 'Ative a localização do aparelho para registrar fora do horário da portaria.' }
  }
  /*
   * E DENTRO DO RAIO do local do evento (Editar evento → mapa) — mesma régua do scanner do operador
   * (`autorizarPresenca`): fora do raio, a batida não é registrada. Sem isto, a localização era obrigatória mas
   * qualquer lugar servia, até de casa. A tentativa recusada fica em `leituras_qr` (resultado 'fora_do_local',
   * sem operador) e aparece no relatório "Batidas fora do local".
   */
  const posicaoPropria = autoatendimentoLiberado ? posicaoValida({ latitude, longitude, precisao: null }) : null
  if (autoatendimentoLiberado) {
    const localEvento = await localDoEvento(eventoId)
    if (localEvento) {
      const { distanciaM, foraDoLocal } = avaliarLocal(posicaoPropria, localEvento)
      if (!posicaoPropria || foraDoLocal) {
        after(async () => {
          const endereco = await enderecoDaPosicao(posicaoPropria)
          const error = await inserirLeituraComEndereco({
            evento_id: eventoId, perfil_id: null, funcionario_id: func.id, tipo: 'credencial', sucesso: false,
            resultado: 'fora_do_local',
            mensagem: `Autoatendimento pelo celular (${momento === 'entrada' ? 'entrada' : 'saída'}) recusado: fora do local do evento`,
            latitude, longitude, precisao_m: null, distancia_m: distanciaM, fora_do_local: true,
          }, endereco)
          if (error) console.error('[autoatendimento] tentativa fora do local não gravada', error.message)
          await auditarTentativaForaDoLocal({
            eventoId, funcionarioId: func.id, quem: { id: null, nome: `${(func.nome as string) ?? 'Colaborador'} (próprio celular)` },
            origem: 'celular', momento, distanciaM, endereco,
          })
        })
        return {
          error: distanciaM != null
            ? `Você está fora do local do evento (${descreverDistancia(distanciaM)}). A batida não foi registrada — aproxime-se do local e tente de novo.`
            : 'Não foi possível confirmar sua localização. Verifique o GPS e tente de novo — a batida não foi registrada.',
        }
      }
    }
  }

  /*
   * Na janela de autoatendimento, o dia da batida é o dia em que a JANELA COMEÇOU (às 03:00 de uma janela das
   * 18:00 às 09:00, é a noite de ontem) — e não o do calendário, que já pode ser o dia principal seguinte. A saída
   * de quem tem entrada em aberto continua fechando o dia da própria entrada (`resolverRegistro`).
   */
  const resolucao = await resolverRegistro(
    { ...evento, id: eventoId }, func.id, momento, undefined,
    diaAutoatendimento ? { diaTurno: diaAutoatendimento } : undefined,
  )
  if (!resolucao.ok) return { error: resolucao.erro }
  /*
   * TRAVA DE 5 MINUTOS entre a entrada e a saída (pedido do Juan, 08/10/2026): no botão único da credencial, um
   * toque duplo sem querer registraria a entrada e, em seguida, a saída. A saída só vale 5 minutos depois da
   * entrada do turno. A tela mostra a contagem; esta checagem é a que vale.
   */
  if (momento === 'fim') {
    const { data: ultimaEntrada } = await supabaseAdmin.from('registros').select('created_at')
      .eq('funcionario_id', func.id).eq('evento_id', eventoId).eq('tipo', 'entrada').eq('data_ref', resolucao.dataRef)
      .order('created_at', { ascending: false }).limit(1)
    const entradaEm = ultimaEntrada?.[0]?.created_at as string | undefined
    if (entradaEm) {
      const liberaEm = new Date(new Date(entradaEm).getTime() + INTERVALO_MINIMO_SAIDA_MS)
      if (Date.now() < liberaEm.getTime()) {
        return { error: `Você registrou a entrada às ${formatarBR(entradaEm, 'hora')}. A saída só pode ser registrada a partir das ${formatarBR(liberaEm.toISOString(), 'hora')} — 5 minutos depois, para evitar registro sem querer.` }
      }
    }
  }
  // Escala por dia (eventos de subeventos) — mesma régua do portão, ver `autorizarPresenca`.
  const escalaHoje = await conferirEscalaNoDia(func.id, eventoId, resolucao.dataRef)
  if (!escalaHoje.ok) return { error: `${escalaHoje.titulo} ${escalaHoje.mensagem}` }
  // Trava por dia do setor: lotado, a entrada pelo celular também é recusada.
  if (momento === 'entrada') {
    const vaga = await vagaNoSetorNoDia(func.fornecedor_id as string, resolucao.dataRef, func.id, func.origem as string | null)
    if (!vaga.ok) return { error: `Setor lotado: já há ${vaga.ocupadas} de ${vaga.maximo} pessoas liberadas hoje. Procure o seu supervisor.` }
  }

  /*
   * NO DIA PRINCIPAL, SEMPRE SÓ O OPERADOR — mesmo dentro da janela de autoatendimento (correção do Juan,
   * 08/10/2026, mesmo dia em que o recurso nasceu: "nos dias do evento isso não pode funcionar... dia do evento
   * não funciona a batida sozinha do funcionário, somente com os operadores e gestores de credenciamento do
   * portão da portaria"). O autoatendimento ("Estou indo embora") só tem efeito FORA do dia principal —
   * montagem/desmontagem, onde não existe operador de plantão o tempo todo. `checkin_autonomo` é a trava antiga,
   * independente, que ainda pode abrir uma exceção pontual no dia principal se o admin ligar.
   */
  if (resolucao.diaPrincipal && evento.checkin_autonomo !== true) {
    return { error: 'No dia do evento, a entrada e a saída são pelo QR Code no credenciamento.' }
  }

  /*
   * Escaneou um cartaz? Então tem que ser o DESTE evento.
   *
   * Sem esta conferência, o cartaz de outro evento (ou um print antigo) valeria
   * como prova de presença aqui — o que é pior do que não ter prova nenhuma,
   * porque o relatório passaria a afirmar uma coisa falsa com aparência de
   * verificada.
   */
  if (tokenDoLocal && tokenDoLocal !== evento.token_portaria) {
    return { error: 'Este QR Code não é o deste evento. Procure o cartaz na entrada.' }
  }

  if (resolucao.jaEm) {
    // "já registrou" (e não "já registrada") de propósito: é o texto que
    // `ehDuplicata`, na tela, reconhece para tratar como sucesso silencioso —
    // mesma frase que `registrarPresencaFoto` já usa para o meio.
    return { error: `Você já registrou ${momento === 'entrada' ? 'a entrada' : 'a saída'} em ${formatarBR(resolucao.jaEm, 'curto')}.` }
  }

  const extra: Record<string, unknown> = { latitude, longitude }
  /*
   * A justificativa carrega as duas informações que o fechamento precisa ler
   * de relance: se veio do cartaz (prova de presença no local) e se a saída
   * saiu sem o meio. Elas podem acontecer juntas, então somam em vez de uma
   * sobrescrever a outra.
   */
  const observacoes: string[] = []
  if (tokenDoLocal) observacoes.push('Registrado escaneando o QR do local.')
  if (momento === 'fim') {
    const semMeio = await observacaoSemMeio(func.id, eventoId, resolucao.dataRef)
    if (semMeio) observacoes.push(semMeio)
  }
  if (observacoes.length) extra.justificativa = observacoes.join(' ')

  const { data: registro, error } = await upsertRegistro(func.id, eventoId, momento, extra, resolucao.dataRef, resolucao.jornadaDiaId)
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

  if (latitude != null && longitude != null) {
    after(() => sincronizarEndereco(registro.id, latitude, longitude).catch(console.error))
  }
  /*
   * Fica marcado na auditoria, separado da batida comum (pedido do Juan: "isso precisa estar na auditoria") —
   * só quando saiu pela janela de autoatendimento, não a cada entrada/saída normal pela credencial.
   */
  if (autoatendimentoLiberado && registro) after(() => marcarLocalDaBatida(registro.id as string, eventoId, posicaoPropria))
  if (autoatendimentoLiberado && registro) {
    after(() => registrarAuditoria({
      perfil: { id: null, nome: func.nome as string ?? 'Autoatendimento' },
      acao: 'REGISTRO_AUTOATENDIMENTO',
      campoAlterado: momento === 'entrada' ? 'Entrada (autoatendimento)' : 'Saída (autoatendimento)',
      valorNovo: curto(`${momento === 'entrada' ? 'Entrada' : 'Saída'} fora do horário da portaria, com geolocalização`),
      funcionarioId: func.id,
      eventoId,
    }))
  }

  // Mesmo agendamento que o scanner do portão dispara na entrada — sem isso,
  // quem entra sozinho pela credencial nunca receberia o lembrete do meio.
  if (momento === 'entrada' && func.telefone) {
    after(() =>
      agendarMeioAposEntrada({
        eventoId,
        funcionarioId: func.id,
        telefone: func.telefone as string,
        entradaEm: new Date().toISOString(),
        dataRef: resolucao.dataRef,
      }).catch(console.error)
    )
  }

  return { ok: true, momento }
}

// ─── Cadastro público (formulário do fornecedor) ──────────────────────────────

/**
 * Resolve a biometria de UM funcionário/evento — captura fresca ou
 * reaproveitada de um cadastro anterior (mesmo CPF, qualquer evento
 * passado). Usada por `cadastrarFuncionarioPublico` (no formulário) e por
 * `completarBiometriaPublica` (quem pulou/falhou no formulário e completa
 * depois, pela credencial) — a MESMA régua nos dois lugares, pra nunca
 * divergir.
 *
 * `biometria_templates` continua com uma linha por (funcionario_id,
 * evento_id) — o reconhecimento no portão (`validarLeituraFacial`) não
 * muda NADA: só comparar dentro do evento, como sempre. `biometria_perfis`
 * (cpf → vetor) é só o banco mestre que alimenta essa linha sem precisar
 * de câmera de novo.
 *
 * Nunca lança pra quem chama: falha aqui não pode desfazer um cadastro que
 * já está feito — o rosto é sempre um EXTRA, nunca o motivo de recusar a
 * pessoa. Tolerante à migração `upgrade-biometria-perfil-cpf.sql` ainda não
 * ter rodado (mesmo padrão de `pausas_turno`/`metodo_identificacao`): sem a
 * tabela, o reaproveitamento simplesmente não acontece, e tudo funciona como
 * antes desta mudança.
 */
async function resolverBiometriaNoCadastro(args: {
  funcionarioId: string
  eventoId: string
  cpf: string
  /** Vetor capturado agora pela câmera — ausente quando a pessoa pulou ou o evento não usa biometria. */
  descritor?: number[]
}): Promise<{ temBiometria: boolean; biometriaReaproveitada: boolean }> {
  const { funcionarioId, eventoId, cpf, descritor } = args
  const semBiometria = { temBiometria: false, biometriaReaproveitada: false }

  const gravarConsentimento = () =>
    supabaseAdmin.from('biometria_consentimentos').insert([{
      funcionario_id: funcionarioId, evento_id: eventoId,
      // Sem operador — quem aceitou foi a própria pessoa, sem ninguém do
      // staff por perto (formulário público ou credencial).
      registrado_por_perfil_id: null,
    }])

  try {
    if (descritorValido(descritor)) {
      const [, { error: erroTemplate }] = await Promise.all([
        gravarConsentimento(),
        supabaseAdmin.from('biometria_templates').upsert([{
          funcionario_id: funcionarioId, evento_id: eventoId, vetor: descritor, cpf,
        }], { onConflict: 'funcionario_id,evento_id' }),
      ])
      if (erroTemplate) { console.error('[biometria] template não gravado', erroTemplate.message); return semBiometria }

      // Vira o novo perfil mestre pra esta pessoa — o próximo evento reaproveita.
      const { error: erroPerfil } = await supabaseAdmin.from('biometria_perfis').upsert([{
        cpf, vetor: descritor, origem_funcionario_id: funcionarioId, origem_evento_id: eventoId,
        atualizado_em: new Date().toISOString(),
      }], { onConflict: 'cpf' })
      if (erroPerfil) console.error('[biometria] perfil mestre não gravado (migração pendente?)', erroPerfil.message)

      return { temBiometria: true, biometriaReaproveitada: false }
    }

    // Sem captura agora: existe um perfil mestre deste CPF pra reaproveitar?
    const { data: perfil, error: erroBusca } = await supabaseAdmin
      .from('biometria_perfis').select('vetor').eq('cpf', cpf).maybeSingle()
    if (erroBusca || !perfil || !descritorValido(perfil.vetor)) return semBiometria

    const [, { error: erroTemplate }] = await Promise.all([
      gravarConsentimento(),
      supabaseAdmin.from('biometria_templates').upsert([{
        funcionario_id: funcionarioId, evento_id: eventoId, vetor: perfil.vetor, cpf,
      }], { onConflict: 'funcionario_id,evento_id' }),
    ])
    if (erroTemplate) { console.error('[biometria] template reaproveitado não gravado', erroTemplate.message); return semBiometria }

    return { temBiometria: true, biometriaReaproveitada: true }
  } catch (e) {
    console.error('[biometria] resolverBiometriaNoCadastro falhou', e)
    return semBiometria
  }
}

/**
 * Insere um funcionário a partir do formulário público. O token do formulário já
 * foi validado ao abrir a página; aqui revalidamos o fornecedor no servidor.
 * Formulário curto: nome, CPF, telefone, função e cidade.
 */
export async function cadastrarFuncionarioPublico(
  fornecedorId: string,
  dados: {
    nome: string; cpf: string; telefone: string; chavePix?: string; cidade?: string
    /** Fora do formulário público desde 06/10/2026 (pedido do Juan) — a função fica a cargo do supervisor. */
    cargo?: string
    consentimento?: boolean; fotoBase64?: string; origem?: string
    /**
     * O rosto (128 números), quando o evento usa biometria e a pessoa
     * aceitou cadastrar — pedido do Juan (27/09/2026): "a pessoa preenche o
     * formulário e o próximo passo é biometrar o rosto".
     *
     * Chega JUNTO com o resto do cadastro, na MESMA chamada — de propósito.
     * Uma ação pública separada que aceitasse um `funcionarioId` cru,
     * chamada DEPOIS de criar o registro, aceitaria o rosto de qualquer id
     * que alguém adivinhasse (IDOR). Aqui não há esse risco: o template só é
     * gravado no MESMO INSTANTE em que o registro nasce, preso ao id que
     * acabou de ser gerado dentro desta própria função.
     */
    biometriaDescritor?: number[]
    /** Token do widget Cloudflare Turnstile — ver `lib/turnstile.ts`. Ausente/undefined quando o captcha ainda não está configurado (tolerante). */
    turnstileToken?: string
    /**
     * Evento de subeventos: os dias ("YYYY-MM-DD") em que a pessoa diz que vai
     * trabalhar. Ignorado em evento normal — ver `eventoUsaEscalaPorDia`.
     */
    dias?: string[]
  },
  autorizacaoIndividual?: string,
): Promise<{
  qrToken?: string; status?: StatusCredenciamento; error?: string
  /** A pessoa ficou com biometria cadastrada NESTE evento — capturada agora ou reaproveitada. */
  temBiometria?: boolean
  /** `true` quando o rosto veio de um cadastro anterior (outro evento), sem passar pela câmera agora. */
  biometriaReaproveitada?: boolean
  /** Os dias da escala gravados NESTE envio — vazio quando o CPF já estava cadastrado (nada foi gravado). */
  diasSalvos?: string[]
}> {
  /*
   * Captcha — item "Bot protection" da auditoria de 01/10/2026. Tolerante:
   * `verificarTurnstile` só exige o token quando `TURNSTILE_SECRET_KEY` já
   * está configurada na Vercel (ver lib/turnstile.ts). Antes de QUALQUER
   * consulta ao banco, pra não gastar nada com um script automatizado.
   */
  if (!(await verificarTurnstile(dados.turnstileToken))) {
    return { error: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.' }
  }

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome, link_ativo, subevento_id, eventos(cadastro_suspenso, organizacao_id)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) return { error: 'Formulário inválido' }

  const cpf = dados.cpf.replace(/\D/g, '')

  /*
   * As duas trancas do cadastro por link. A tela já avisa, mas é aqui que
   * uma chamada direta é recusada — e é por isso que as duas moram juntas:
   *
   *   evento suspenso  → `alternarCadastroPorLink` (fecha o evento inteiro)
   *   setor desligado  → `alternarLinkDoSetor` (fecha só este)
   *
   * Qualquer uma das duas basta pra recusar; nenhuma vence a outra. A única
   * exceção é o link temporário emitido pelo master, preso no servidor a
   * ESTE evento e ESTE setor durante 48 horas.
   */
  const eventoSuspenso = Boolean((fornecedor.eventos as unknown as { cadastro_suspenso?: boolean } | null)?.cadastro_suspenso)
  const setorSuspenso = (fornecedor as { link_ativo?: boolean }).link_ativo === false
  // A terceira, entre as duas (09/10/2026): o SUBGRUPO inteiro travado — `alternarCadastroDoSubevento`.
  const subeventoDoSetor = (fornecedor as { subevento_id?: string | null }).subevento_id ?? null
  const subgrupoSuspenso = (await subeventosComCadastroSuspenso([subeventoDoSetor])).size > 0
  let excecaoIndividualValida = false
  if (autorizacaoIndividual) {
    const autorizacao = await consultarAutorizacaoCadastroIndividual(autorizacaoIndividual)
    excecaoIndividualValida = Boolean(
      autorizacao.valido
      && autorizacao.eventoId === fornecedor.evento_id
      && autorizacao.fornecedorId === fornecedorId,
    )
  }

  if (eventoSuspenso && !excecaoIndividualValida) {
    return { error: 'O cadastro para este evento foi encerrado pela organização.' }
  }
  if ((setorSuspenso || subgrupoSuspenso) && !excecaoIndividualValida) {
    return { error: 'O cadastro para este fornecedor foi encerrado. Fale com quem te contratou.' }
  }

  // O link do formulário circula em grupo de WhatsApp: sem teto, um script
  // enche o setor de cadastros falsos e trava a operação no dia do evento.
  // 600/h (era 60): no Vital (4 mil pessoas, 06/10/2026) um fornecedor manda
  // o link pra um grupo de 200 e todo mundo abre na mesma hora — com 60, 140
  // pessoas de verdade levavam "muitos cadastros seguidos". 600 ainda barra
  // um script despejando milhares.
  if (!excecaoIndividualValida && !await podePassar(`cadastro:${fornecedorId}`, 600, 60 * 60 * 1000)) {
    return { error: 'Muitos cadastros seguidos por este link. Espere alguns minutos e tente de novo.' }
  }

  if (!validarCpf(cpf)) return { error: 'CPF inválido. Confira os 11 dígitos.' }

  /*
   * CPF barrado pelo supervisor do setor (ver `bloquearCpf`).
   *
   * Aqui, e não só na tela: o formulário é público, e é por chamada direta
   * que alguém tirado da equipe voltaria a se cadastrar. A mensagem não diz
   * "você foi bloqueado" de propósito — quem cadastra é a própria pessoa, e
   * a conversa sobre o motivo é com quem a contratou, não com uma tela.
   */
  if (await cpfEstaBloqueado(fornecedor.evento_id as string, cpf, fornecedorId)) {
    return { error: 'Não é possível concluir o cadastro neste fornecedor. Fale com quem te contratou.' }
  }

  /*
   * Cidade é obrigatória no cadastro público.
   *
   * A checagem é aqui, e não só no `required` do formulário: aquilo é
   * validação de navegador e some com qualquer chamada direta à action. É
   * este campo que alimenta a busca por região em "Encontrar funcionários" —
   * cadastro sem cidade entra na base e nunca aparece em busca nenhuma.
   *
   * Duas letras é o piso: existe município de nome curto, mas ninguém mora em
   * "a". A coluna segue aceitando nulo no banco porque o cadastro feito pelo
   * organizador (tela do setor, planilha, IA) não pergunta cidade.
   *
   * Texto livre desde 25/09/2026 (tem evento fora do ES e gente de fora do
   * estado) — `grafiaDaCidade` só acerta a grafia das cidades do ES digitadas
   * sem acento ou com "- ES"; o resto fica como a pessoa escreveu.
   */
  const cidade = grafiaDaCidade(dados.cidade)
  if (cidade.length < 2) {
    return { error: 'Informe a cidade onde você mora — é por ela que os organizadores encontram você para outros eventos.' }
  }

  /*
   * Tamanho dos campos de texto livre (auditoria de segurança, 01/10/2026
   * — item "Validação dos Inputs"). O `required`/`maxLength` do HTML some
   * numa chamada direta à action; sem este teto, dava pra mandar um nome
   * ou cargo gigante e sujar banco, PDF, planilha e a mensagem de WhatsApp
   * que sai pra essa pessoa. Mesma régua de telefone já usada no resto do
   * sistema (10-13 dígitos, com DDD e o 9 do celular).
   */
  const nome = dados.nome.trim()
  if (nome.length < 2 || nome.length > 120) return { error: 'Informe um nome válido.' }
  const telefone = dados.telefone.replace(/\D/g, '')
  if (telefone.length < 10 || telefone.length > 13) return { error: 'Informe um WhatsApp válido, com DDD.' }
  const cargo = (dados.cargo ?? '').trim() || null
  if (cargo && cargo.length > 120) return { error: 'Função inválida — confira o que foi digitado.' }
  const chavePix = dados.chavePix?.trim() || null
  if (chavePix && chavePix.length > 140) return { error: 'Chave PIX inválida — confira o que foi digitado.' }

  /*
   * Consentimento da base regional.
   *
   * Checado no servidor pelo mesmo motivo da cidade: `required` no HTML some
   * com uma chamada direta à action. Mas aqui o motivo é mais forte — sem o
   * aceite, guardar o cadastro para recrutamento seria usar o dado para uma
   * finalidade diferente da que a pessoa aceitou (trabalhar NESTE evento).
   */
  if (dados.consentimento !== true) {
    return { error: 'Você precisa autorizar o uso dos seus dados para concluir o cadastro.' }
  }

  // Foto é OPCIONAL — mas, quando enviada, o formato precisa ser válido.
  const match = dados.fotoBase64 ? dados.fotoBase64.match(/^data:(image\/\w+);base64,(.+)$/) : null
  if (dados.fotoBase64 && !match) return { error: 'Foto inválida. Tente novamente.' }

  // Anti-duplicidade POR EVENTO: o mesmo CPF não pode estar em duas
  // empresas/funções do mesmo evento (dupla contratação). No MESMO setor,
  // devolve a credencial existente (a pessoa só perdeu o link). Em eventos
  // DIFERENTES, mesmo no mesmo dia, o cadastro é livre — freelancer escolhe
  // onde vai trabalhar.
  const { data: existentes } = await supabaseAdmin
    .from('funcionarios')
    .select('id, qr_token, fornecedor_id, status_credenciamento, decidido_em, subevento_id, subeventos(nome), fornecedores!inner(evento_id, nome)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', fornecedor.evento_id)
    .limit(1)
  // Pedido NEGADO que a pessoa está refazendo (passou da espera) — o fluxo continua e, no fim, REABRE este cadastro.
  let pedidoNegadoId: string | null = null
  if (existentes && existentes.length) {
    const existente = existentes[0] as any
    if (existente.fornecedor_id === fornecedorId) {
      const statusDoPedido = statusCredenciamentoValido(existente.status_credenciamento)
      if (statusDoPedido !== 'negado') {
        return { qrToken: existente.qr_token, status: statusDoPedido }
      }
      /*
       * NOVA REGRA (Juan, 07/10/2026): depois que o supervisor NEGA, a pessoa
       * pode tentar de novo pelo formulário — vira um novo pedido, "aguardando
       * aprovação" — mas só passados 5 minutos da negativa. Antes disso o
       * formulário diz quanto falta. Sem a espera, pedido e negativa viravam
       * um vai-e-volta imediato na fila do supervisor.
       */
      const faltam = minutosParaNovoPedido(existente.decidido_em as string | null)
      if (faltam > 0) {
        return {
          error: `Seu pedido foi negado há pouco. Você pode fazer um novo pedido em ${faltam} minuto${faltam === 1 ? '' : 's'} — se preferir, converse antes com o seu supervisor.`,
        }
      }
      pedidoNegadoId = existente.id as string
    } else {
    /*
     * Evento com subevento (Vital, 02/10/2026): a mensagem fala do
     * SUBGRUPO, não do fornecedor — é o que faz sentido pra quem está na
     * fila errada decidir pra onde ir. Evento sem subevento mantém a
     * mensagem de sempre, por fornecedor.
     */
    const nomeSubevento = (existente.subeventos as { nome?: string } | null)?.nome ?? null
    const setorExistente = existente.fornecedores?.nome ?? 'outro fornecedor'
    const mensagem = nomeSubevento
      ? `Você já está cadastrado(a) no subgrupo ${nomeSubevento}. Procure o supervisor da sua equipe — não é permitido se cadastrar em outro subgrupo do mesmo evento.`
      : `Este CPF já está credenciado neste evento pelo fornecedor ${setorExistente}. Procure o supervisor da sua equipe — não é permitido se cadastrar em duas empresas ou funções no mesmo evento.`
    return { error: mensagem }
    }
  }

  /*
   * SUBEVENTO + TRAVA DE COTA (Vital, 30/09/2026 — corrigido no mesmo dia
   * depois de um teste ao vivo: a hierarquia é Evento → Subevento →
   * Fornecedor, não "fornecedor escalado em vários subeventos"). O
   * subevento do funcionário é simplesmente o do fornecedor — fixo desde
   * que o fornecedor foi criado, a pessoa não escolhe nada. Cota continua
   * sendo sempre `fornecedores.quantidade_estimada`, com ou sem subevento;
   * só passa a bloquear quando a organização ligou `trava_cota_habilitada`
   * (nasce desligada — pra qualquer outro cliente isto não existe).
   */
  const { data: fornecedorCompleto } = await supabaseAdmin
    .from('fornecedores').select('subevento_id, quantidade_estimada').eq('id', fornecedorId).maybeSingle()
  const subeventoIdResolvido = (fornecedorCompleto as { subevento_id?: string | null } | null)?.subevento_id ?? null

  /*
   * ESCALA POR DIA (eventos de subeventos): a pessoa diz em quais dias vai
   * trabalhar, e o QR só vai valer nos dias que o supervisor confirmar. A
   * escolha é conferida AQUI contra os dias do evento — a tela só mostra os
   * dias certos, mas é o servidor que recusa um dia inventado. Dias que já
   * passaram não entram: ninguém se escala para ontem. Evento normal não
   * passa por nada disto.
   */
  const usaEscala = await eventoUsaEscalaPorDia(fornecedor.evento_id as string)
  let diasEscolhidos: string[] = []
  if (usaEscala) {
    const hoje = diaBRT()
    const disponiveis = (await diasDaEscalaDoEvento(fornecedor.evento_id as string)).map(d => d.data).filter(d => d >= hoje)
    if (!disponiveis.length) return { error: 'O período de trabalho deste evento já terminou.' }
    const conferido = conferirDiasPermitidos(dados.dias, disponiveis)
    if (!conferido.ok) return { error: conferido.erro }
    // Trava por dia do setor (importação de estrutura): a tela já mostra o dia
    // lotado, mas é aqui que um envio de quem estava com a tela aberta há
    // horas (ou chamada direta) é recusado.
    const cheios = (await diasLotados(fornecedorId, 'pedido')).filter(d => conferido.dias.includes(d))
    if (cheios.length) {
      return { error: `${listarDias(cheios)} já ${cheios.length === 1 ? 'está lotado' : 'estão lotados'} neste setor. Escolha outro dia ou fale com o seu supervisor.` }
    }
    diasEscolhidos = conferido.dias
  }

  const organizacaoIdDoEvento = (fornecedor.eventos as unknown as { organizacao_id?: string | null } | null)?.organizacao_id ?? null

  // Novo pedido de quem foi negado: reabre O MESMO cadastro (não cria outro, nem passa pela
  // cota — a pessoa já ocupa a vaga dela). Tudo acontece dentro desta função.
  if (pedidoNegadoId) {
    return await reabrirPedidoNegado({
      funcionarioId: pedidoNegadoId, eventoId: fornecedor.evento_id as string, organizacaoId: organizacaoIdDoEvento,
      cpf, nome, telefone, cargo, chavePix, cidade, foto: match,
      usaEscala, diasEscolhidos, origem: dados.origem === 'portaria' ? 'portaria' : 'formulario',
      biometriaDescritor: dados.biometriaDescritor,
    })
  }

  const { travaCotaHabilitada } = await obterFuncionalidadesDoEvento(fornecedor.evento_id as string)
  if (travaCotaHabilitada) {
    const cota = fornecedorCompleto?.quantidade_estimada ?? null
    if (cota) {
      // O crachá do próprio supervisor (origem 'supervisor') não ocupa vaga da
      // equipe — sem isto, setor de 10 vagas aceitava só 9.
      const { count } = await supabaseAdmin
        .from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedorId)
        .or('origem.is.null,origem.neq.supervisor')
      if ((count ?? 0) >= cota) {
        return { error: 'Seu fornecedor está com o número máximo de pessoas. Contate seu supervisor.' }
      }
    }
  }

  const { data, error } = await supabaseAdmin.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome,
    cpf,
    telefone,
    cargo,
    chave_pix: chavePix,
    cidade,
    consentimento_base: true,
    consentimento_em: new Date().toISOString(),
    ativo: true,
    /*
     * Cadastro público (link ou cartaz da portaria) nasce PENDENTE — só um
     * responsável aprovando libera o QR de verdade (ver `aprovarCredenciamento`).
     * Decidido com o Juan 24/09/2026: muita gente clicava no link achando
     * que era ingresso do evento. Cadastro feito por alguém já confiável do
     * sistema (supervisor, atribuição de colaborador, importação por
     * planilha) não passa por aqui — continua nascendo aprovado, sem mudança.
     */
    status_credenciamento: 'pendente',
    /*
     * De onde este cadastro veio.
     *
     * Só três valores importam na prática: `portaria` (cartaz da entrada),
     * `formulario` (link que o supervisor mandou) e `planilha`. No fechamento,
     * saber que alguém entrou pelo cartaz — e não pela lista — muda a conversa
     * sobre quem autorizou aquela contratação.
     */
    origem: dados.origem === 'portaria' ? 'portaria' : 'formulario',
  }]).select('id, qr_token').single()

  if (error || !data) return { error: 'Erro ao enviar formulário' }

  // Coluna nova, à parte — mesmo cuidado de `exige_meio` em `criarFornecedor`:
  // gravar direto no insert faria uma migração pendente derrubar o cadastro
  // INTEIRO (que já foi criado) em vez de só este campo extra.
  if (subeventoIdResolvido) {
    const { error: erroSubevento } = await supabaseAdmin
      .from('funcionarios').update({ subevento_id: subeventoIdResolvido }).eq('id', data.id)
    if (erroSubevento) console.error('[cadastrarFuncionarioPublico] subevento_id não gravado (migração pendente?)', erroSubevento.message)
  }

  // Os dias SÃO parte do cadastro num evento de subeventos (sem eles o QR
  // nunca valeria): falhou, desfaz tudo — mesmo cuidado da foto, logo abaixo.
  if (usaEscala) {
    const gravado = await gravarDiasEscolhidos(data.id as string, fornecedor.evento_id as string, diasEscolhidos)
    if (!gravado.ok) {
      console.error('[cadastrarFuncionarioPublico] dias da escala não gravados', gravado.erro)
      await supabaseAdmin.from('funcionarios').delete().eq('id', data.id)
      return { error: 'Não foi possível salvar os dias escolhidos. Tente novamente.' }
    }
  }

  if (match) {
    const contentType = match[1]
    const ext = contentType.split('/')[1] || 'jpg'
    const buffer = Buffer.from(match[2], 'base64')
    const path = `avatares/${data.qr_token}.${ext}`
    const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, { contentType, upsert: true })
    if (up.error) {
      // A pessoa tentou enviar foto e falhou — desfaz o cadastro pra ela poder
      // tentar de novo (o dedup acima devolveria esse registro sem avatar).
      await supabaseAdmin.from('funcionarios').delete().eq('id', data.id)
      return { error: 'Erro ao enviar a foto. Tente novamente.' }
    }
    await supabaseAdmin.from('funcionarios').update({ foto_perfil_path: path }).eq('id', data.id)
  }

  /*
   * Biometria — SÓ SE o evento usa (o próprio `dados.biometriaDescritor` já
   * vem vazio quando não usa: a tela nem oferece a câmera nesse caso). Falha
   * aqui NUNCA desfaz o cadastro — ao contrário da foto (que É o cadastro
   * pedindo pra tentar de novo), o rosto é um EXTRA: a pessoa sempre pode
   * cadastrar depois, no portão, na credencial (`completarBiometriaPublica`),
   * ou simplesmente usar o QR Code.
   */
  const { temBiometria, biometriaReaproveitada } = await resolverBiometriaNoCadastro({
    funcionarioId: data.id as string, eventoId: fornecedor.evento_id as string, cpf,
    descritor: dados.biometriaDescritor,
  })

  after(() => sincronizarFuncionarioNaPlanilha(data.id).catch(console.error))
  // Só esta pessoa: recalcular o evento inteiro a cada cadastro pesa demais
  // quando milhares se inscrevem no mesmo dia (ver `sincronizarAgendamentos`).
  after(() => sincronizarAgendamentos(fornecedor.evento_id, { funcionarioId: data.id as string }).catch(console.error))
  /*
   * Vai pra auditoria mesmo sem ninguém logado — quem "fez" foi a própria
   * pessoa, se cadastrando (pedido do Juan, 24/09/2026: "quem se cadastrou,
   * que horas, por meio de que"). `registrarAuditoria` exige um perfil
   * autenticado; aqui não existe um, então grava direto — mesmo cuidado de
   * nunca travar o cadastro por causa do log (best-effort, erro só no console).
   */
  after(() => registrarCadastroFuncionario({
    funcionarioId: data.id as string,
    nome: dados.nome.trim(),
    eventoId: fornecedor.evento_id,
    organizacaoId: (fornecedor.eventos as unknown as { organizacao_id?: string | null } | null)?.organizacao_id ?? null,
    origem: dados.origem === 'portaria' ? 'portaria' : 'formulario',
  }))
  // A mensagem de boas-vindas (com o link/QR) só dispara na APROVAÇÃO agora —
  // ver `aprovarCredenciamento`. Represada de propósito: mandar o link antes
  // de alguém aprovar entregaria uma credencial que ainda não vale.
  return { qrToken: data.qr_token, status: 'pendente' as const, temBiometria, biometriaReaproveitada, diasSalvos: diasEscolhidos }
}

/**
 * NOVO PEDIDO de quem foi NEGADO (regra de 07/10/2026: passados
 * `ESPERA_NOVO_PEDIDO_MIN` minutos da negativa, a pessoa pode tentar de novo
 * pelo formulário). Reabre o MESMO cadastro: volta a "aguardando aprovação",
 * limpa o motivo e quem decidiu, e atualiza os dados que ela acabou de digitar.
 *
 * Nunca apaga o cadastro (ao contrário do primeiro cadastro, que desfaz o que
 * criou se a foto falhar): aqui existe histórico a preservar. Por isso as
 * partes que podem falhar (foto, dias) vêm ANTES da virada de status — se
 * falhar, o pedido continua negado e a pessoa vê o erro.
 */
async function reabrirPedidoNegado(a: {
  funcionarioId: string; eventoId: string; organizacaoId: string | null; cpf: string
  nome: string; telefone: string; cargo: string | null; chavePix: string | null; cidade: string
  foto: RegExpMatchArray | null; usaEscala: boolean; diasEscolhidos: string[]
  origem: 'portaria' | 'formulario'; biometriaDescritor?: number[]
}): Promise<{
  qrToken?: string; status?: StatusCredenciamento; error?: string
  temBiometria?: boolean; biometriaReaproveitada?: boolean; diasSalvos?: string[]
}> {
  const { data: linha } = await supabaseAdmin.from('funcionarios').select('qr_token').eq('id', a.funcionarioId).maybeSingle()
  const qrToken = linha?.qr_token as string | undefined
  if (!qrToken) return { error: 'Não foi possível reabrir o seu pedido. Tente novamente.' }

  let fotoPath: string | null = null
  if (a.foto) {
    const contentType = a.foto[1]
    const ext = contentType.split('/')[1] || 'jpg'
    fotoPath = `avatares/${qrToken}.${ext}`
    const up = await supabaseAdmin.storage.from('presencas').upload(fotoPath, Buffer.from(a.foto[2], 'base64'), { contentType, upsert: true })
    if (up.error) return { error: 'Erro ao enviar a foto. Tente novamente.' }
  }

  if (a.usaEscala) {
    // Os dias do pedido ANTERIOR (o que ela escolheu e o que o supervisor aprovou) saem: o novo pedido traz a escolha nova.
    await supabaseAdmin.from('funcionario_dias').delete().eq('funcionario_id', a.funcionarioId)
    const gravado = await gravarDiasEscolhidos(a.funcionarioId, a.eventoId, a.diasEscolhidos)
    if (!gravado.ok) {
      console.error('[reabrirPedidoNegado] dias da escala não gravados', gravado.erro)
      return { error: 'Não foi possível salvar os dias escolhidos. Tente novamente.' }
    }
  }

  const { error } = await supabaseAdmin.from('funcionarios').update({
    nome: a.nome, telefone: a.telefone, cargo: a.cargo, chave_pix: a.chavePix, cidade: a.cidade,
    consentimento_base: true, consentimento_em: new Date().toISOString(),
    ...(fotoPath ? { foto_perfil_path: fotoPath } : {}),
    ativo: true, status_credenciamento: 'pendente',
    motivo_negacao: null, decidido_por: null, decidido_em: null,
    origem: a.origem,
  }).eq('id', a.funcionarioId).eq('status_credenciamento', 'negado')
  if (error) return { error: 'Não foi possível reabrir o seu pedido. Tente novamente.' }

  const { temBiometria, biometriaReaproveitada } = await resolverBiometriaNoCadastro({
    funcionarioId: a.funcionarioId, eventoId: a.eventoId, cpf: a.cpf, descritor: a.biometriaDescritor,
  })

  after(() => sincronizarFuncionarioNaPlanilha(a.funcionarioId).catch(console.error))
  after(() => sincronizarAgendamentos(a.eventoId, { funcionarioId: a.funcionarioId }).catch(console.error))
  // Na auditoria mesmo sem ninguém logado: quem "fez" foi a própria pessoa (mesmo cuidado de `registrarCadastroFuncionario`).
  after(async () => {
    const { error: erroLog } = await supabaseAdmin.from('alteracoes_cadastro').insert([{
      usuario_responsavel: `${a.nome} (cadastro próprio)`, usuario_responsavel_id: null,
      organizacao_id: a.organizacaoId, evento_id: a.eventoId, funcionario_id: a.funcionarioId,
      acao: 'NOVO_PEDIDO_CREDENCIAMENTO', campo_alterado: 'Credenciamento',
      valor_anterior: 'Negado', valor_novo: `Novo pedido após ${ESPERA_NOVO_PEDIDO_MIN} min — aguardando aprovação`,
    }])
    if (erroLog) console.error('[auditoria] novo pedido não gravado', erroLog.message)
  })
  // Sem mensagem de boas-vindas: ela só sai na APROVAÇÃO (ver `aprovarCredenciamento`).
  return { qrToken, status: 'pendente', temBiometria, biometriaReaproveitada, diasSalvos: a.diasEscolhidos }
}

/**
 * Base central de cadastros: busca o cadastro mais recente deste CPF para
 * pré-preencher o formulário público — quem já trabalhou antes não digita tudo
 * de novo.
 *
 * ⚠️ Esta é a superfície pública mais sensível do sistema. Ela não tem sessão
 * pra checar (é o formulário aberto), recebe um CPF e devolve nome, telefone e
 * chave PIX. O link do formulário circula em grupo de WhatsApp, então
 * considere-o conhecido: quem o tiver pode, em tese, varrer CPFs e colher
 * dados de qualquer pessoa que já passou pela plataforma.
 *
 * Três contenções, e nenhuma delas é perfeita — a de verdade seria exigir algo
 * que só a própria pessoa saiba:
 *
 * 1. Limite de tentativas por token de formulário (abaixo).
 * 2. A busca só devolve o que o formulário precisa preencher; nunca CPF,
 *    histórico, valores ou em que eventos a pessoa trabalhou.
 * 3. A preferência é o cadastro da PRÓPRIA organização; a base central é
 *    consultada só quando ela não conhece o CPF.
 */
export async function buscarCadastroPorCpf(
  fornecedorId: string,
  cpfBruto: string
): Promise<{
  nome: string; telefone: string; empresa: string; cargo: string; chavePix: string | null; cidade: string | null
  /**
   * Já existe um rosto cadastrado pra este CPF (qualquer evento passado) —
   * ver `biometria_perfis`/`resolverBiometriaNoCadastro`. O formulário usa
   * isto pra NÃO pedir a câmera de novo pra quem já cadastrou uma vez.
   * `false` também quando a migração ainda não rodou (tolerante, nunca quebra
   * o autofill por causa disso).
   */
  temBiometriaCadastrada: boolean
} | null> {
  const cpf = cpfBruto.replace(/\D/g, '')
  if (!validarCpf(cpf)) return null

  /*
   * 40 consultas por hora por setor. Uma pessoa preenchendo o formulário faz
   * UMA; quem faz quarenta está varrendo. O limite é por token de formulário
   * porque é o único identificador estável que existe aqui — não há sessão, e
   * IP em serverless atrás de CDN não é confiável.
   */
  if (!await podePassar(`cpf:${fornecedorId}`, 40, 60 * 60 * 1000)) return null

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, eventos(organizacao_id)')
    .eq('id', fornecedorId)
    .single()
  const eventoRel = fornecedor?.eventos as { organizacao_id: string | null } | { organizacao_id: string | null }[] | null
  const organizacaoId = Array.isArray(eventoRel) ? eventoRel[0]?.organizacao_id : eventoRel?.organizacao_id

  const colunas = 'nome, telefone, empresa, cargo, chave_pix, cidade, created_at'

  // Primeiro procura na própria organização: é o dado mais confiável, porque
  // veio de um evento do mesmo organizador.
  type CadastroAnterior = {
    nome: string
    telefone: string
    empresa: string | null
    cargo: string | null
    chave_pix: string | null
    cidade: string | null
  }
  let func: CadastroAnterior | undefined
  if (organizacaoId) {
    const { data } = await supabaseAdmin
      .from('funcionarios')
      .select(`${colunas}, fornecedores!inner(eventos!inner(organizacao_id))`)
      .eq('cpf', cpf)
      .eq('fornecedores.eventos.organizacao_id', organizacaoId)
      .order('created_at', { ascending: false })
      .limit(1)
    func = data?.[0]
  }

  // Não achou? Cai na base central do Credenciei — a pessoa pode já ter sido
  // credenciada por outro cliente. É o que faz um cliente novo já "conhecer"
  // a equipe dele no primeiro evento.
  if (!func) {
    const { data } = await supabaseAdmin
      .from('funcionarios')
      .select(colunas)
      .eq('cpf', cpf)
      .order('created_at', { ascending: false })
      .limit(1)
    func = data?.[0]
  }

  if (!func) return null

  // Tolerante: sem a tabela (upgrade-biometria-perfil-cpf.sql ainda não
  // rodou), ou qualquer outra falha, entra como "sem biometria" — nunca
  // quebra o autofill do resto do formulário por causa disso.
  let temBiometriaCadastrada = false
  try {
    const { data: perfil } = await supabaseAdmin.from('biometria_perfis').select('id').eq('cpf', cpf).maybeSingle()
    temBiometriaCadastrada = !!perfil
  } catch { /* biometria ainda não migrada */ }

  return {
    nome: func.nome,
    telefone: func.telefone,
    empresa: func.empresa ?? '',
    cargo: func.cargo ?? '',
    chavePix: func.chave_pix ?? null,
    cidade: func.cidade ?? null,
    temBiometriaCadastrada,
  }
}

/**
 * O primeiro passo do QR fixo da portaria: "esta pessoa já está credenciada
 * NESTE evento?"
 *
 * Já credenciada → devolve o token da credencial dela, pra a tela mandar
 * direto pro check-in — é o "mostrar a etapa" que o autocredenciamento pede
 * pra quem já passou por aqui. Não achou → a tela segue pro cadastro
 * (escolher setor), que já existe e não muda.
 */
export async function identificarNaPortaria(
  eventoId: string,
  cpfBruto: string
): Promise<{ qrToken?: string; naoEncontrado?: boolean; error?: string }> {
  const cpf = cpfBruto.replace(/\D/g, '')
  if (!validarCpf(cpf)) return { error: 'CPF inválido. Confira os 11 dígitos.' }

  // Mesmo teto do resto do fluxo público: protege um QR fixo, impresso e
  // exposto, de virar varredura de CPF.
  if (!await podePassar(`portaria-cpf:${eventoId}`, 60, 60 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('qr_token, descredenciado_em, fornecedores!inner(evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', eventoId)
    .maybeSingle()

  if (!func) return { naoEncontrado: true }
  if (func.descredenciado_em) {
    return { error: 'Você já foi descredenciado deste evento. Se isso for engano, procure o credenciamento.' }
  }
  return { qrToken: func.qr_token }
}

/**
 * Ordem canônica das etapas. "Próxima pendente" é a primeira desta lista sem
 * registro — é o que o supervisor regulariza, sem escolher nada.
 */
const ORDEM_ETAPAS: { momento: MomentoPresenca; rotulo: string }[] = [
  { momento: 'entrada', rotulo: 'Entrada' },
  { momento: 'meio', rotulo: 'Meio do evento' },
  { momento: 'fim', rotulo: 'Saída' },
]

/** Forma do join funcionário → fornecedor → evento usado no registro assistido. */
type FornecedorComEvento = {
  nome: string
  evento_id: string
  eventos: { id: string; nome: string; ativo: boolean; organizacao_id: string | null }
}
const comEvento = (v: unknown) => v as FornecedorComEvento | null

export type FuncionarioLocalizado = {
  id: string
  nome: string
  cpf: string
  cargo: string | null
  ativo: boolean
  fotoUrl: string | null
  setorId: string
  setorNome: string
  supervisorNome: string | null
  eventoId: string
  eventoNome: string
  ultimaBatida: { rotulo: string; quandoISO: string } | null
  /**
   * A etapa que o sistema RECOMENDA (a primeira sem registro) — só uma
   * sugestão pré-marcada na tela. Quem decide de verdade é o operador: ver
   * `etapas`, abaixo, e o comentário em `registrarPresencaAssistida`.
   */
  proximaPendente: { momento: MomentoPresenca; rotulo: string } | null
  /**
   * As três etapas com o estado de cada uma — o que alimenta o seletor.
   * `quandoISO: null` = ainda não registrada; presente = já tem registro
   * (e escolhê-la de novo sobrescreve o horário, não duplica).
   */
  etapas: { momento: MomentoPresenca; rotulo: string; quandoISO: string | null }[]
}

/** Resultado resumido, pra escolher quando a busca por nome dá em várias pessoas. */
export type CandidatoLocalizado = {
  id: string
  nome: string
  cpf: string
  cargo: string | null
  setorNome: string
  eventoNome: string
  /** O CPF exato não existe; este cadastro difere em no máximo dois dígitos. */
  cpfAproximado?: boolean
}

/**
 * Localiza alguém para o registro assistido, por CPF **ou** por nome.
 *
 * Nome quase nunca é único num evento grande ("Silva" pega vinte), então a
 * função pode devolver uma lista pra escolher em vez de uma pessoa só. CPF
 * completo e válido cai direto na ficha, que é o caminho rápido de quem já
 * tem o documento na mão.
 *
 * O escopo é o mesmo do resto do sistema: supervisor só enxerga o próprio
 * setor; admin, a própria organização; master, todo mundo. A busca é feita
 * apenas em eventos ATIVOS — regularizar ponto de evento encerrado não é o
 * caso de uso e só abriria espaço pra erro.
 */
const SELECT_LOCALIZAR =
  'id, nome, cpf, cargo, empresa, ativo, foto_perfil_path, fornecedor_id, fornecedores!inner(id, nome, evento_id, eventos!inner(id, nome, ativo, organizacao_id))'

/** O escopo de um suporte, como dois Sets — pra checar filtro síncrono sem uma consulta por linha. */
async function escopoDoSuporteComoConjuntos(perfilId: string): Promise<{ eventos: Set<string>; orgs: Set<string> }> {
  const { data } = await supabaseAdmin.from('suporte_escopo').select('organizacao_id, evento_id').eq('perfil_id', perfilId)
  return {
    eventos: new Set((data ?? []).map(e => e.evento_id).filter((v): v is string => !!v)),
    orgs: new Set((data ?? []).map(e => e.organizacao_id).filter((v): v is string => !!v)),
  }
}

/** Teto de resultados por busca — lista maior que isso não se escolhe, se refina. */
const MAX_CANDIDATOS = 25

/** Quantos algarismos diferem entre dois CPFs completos. */
function distanciaEntreCpfs(a: string, b: string): number {
  if (!/^\d{11}$/.test(a) || !/^\d{11}$/.test(b)) return Number.POSITIVE_INFINITY
  let diferentes = 0
  for (let i = 0; i < 11; i++) if (a[i] !== b[i]) diferentes++
  return diferentes
}

/**
 * O histórico de batidas para a aba do modal do funcionário.
 *
 * O modal abre sem navegar — clique na lista, não link — então não há uma
 * página server component pronta para buscar isto de antemão. Esta action é
 * chamada pelo cliente só quando a pessoa clica na aba "Histórico", e não
 * antes: buscar o histórico de todo mundo listado no setor a cada carga da
 * tela multiplicaria a consulta por funcionário sem necessidade — a maioria
 * dos cliques na lista nunca chega a abrir essa aba.
 *
 * Mesma verificação de acesso que a página cheia, pelo mesmo helper — ver o
 * comentário em `podeVerHistoricoDe`.
 */
export async function obterHistoricoDoFuncionario(
  funcionarioId: string,
): Promise<{ historico: HistoricoNoEvento; error?: undefined } | { historico?: undefined; error: string }> {
  const perfil = await getPerfil()
  if (!(await podeVerHistoricoDe(perfil, funcionarioId))) {
    return { error: 'Sem permissão para ver o histórico deste funcionário.' }
  }
  const h = await historicoDoFuncionario(funcionarioId)
  if (!h) return { error: 'Funcionário não encontrado.' }
  // Tentativas recusadas por estar fora do local, com endereço — admin/master e o supervisor da pessoa
  // (`podeVerHistoricoDe` acima já garante que só chega aqui quem pode ver esta pessoa).
  h.tentativasForaDoLocal = await tentativasForaDoLocalDe(funcionarioId)
  return { historico: h }
}

export type QRDoFuncionario = {
  /** PNG em data URL, pronto pra <img> e pra impressão. */
  imagem: string
  /** 'montagem' | 'evento' | 'desmontagem' — a etapa que este código cobre. */
  fase: FaseDoDia
  faseNome: string
  /** Link da credencial no celular, pra quem preferir continuar por ali. */
  link: string
}

/**
 * O MESMO QR que está na credencial da pessoa agora — pra imprimir e não
 * depender do celular dela (pedido do Juan, 03/09/2026: bateria, tela
 * quebrada, sem sinal no galpão).
 *
 * Gerado por `gerarCodigoQR`, a mesma função da tela da credencial, com a
 * mesma etapa: é literalmente o mesmo código, não uma segunda via nem um
 * código paralelo. Nada aqui altera o QR de ninguém — só desenha de novo o
 * que já existe.
 *
 * ATENÇÃO À ETAPA: o código é assinado POR ETAPA (ver lib/credencial-qr.ts),
 * então o papel impresso na montagem NÃO passa no dia do evento — o scanner
 * recusa de propósito. Quem imprime precisa saber disso, e é por isso que a
 * `fase` volta junto: a tela avisa até quando aquele papel vale.
 */
export async function obterQRDoFuncionario(
  funcionarioId: string,
): Promise<{ qr: QRDoFuncionario; error?: undefined } | { qr?: undefined; error: string }> {
  const perfil = await getPerfil()
  // Mesma régua do histórico: quem pode ver a ficha pode ver o crachá dela.
  if (!(await podeVerHistoricoDe(perfil, funcionarioId))) {
    return { error: 'Sem permissão para ver a credencial deste funcionário.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('qr_token, fornecedores!inner(eventos!inner(id, data_inicio, data_fim))')
    .eq('id', funcionarioId)
    .single()
  if (!func?.qr_token) return { error: 'Funcionário não encontrado.' }

  const evento = (func.fornecedores as unknown as {
    eventos: { id: string; data_inicio: string | null; data_fim: string | null }
  })?.eventos
  const diaDeHojeQR = evento ? await diaDeTrabalho(evento.id, diaBRT()) : null
  const fase = faseAtualDoQR(new Date(), evento?.data_inicio, evento?.data_fim, diaDeHojeQR?.tipo === 'principal')
  const { codigo } = gerarCodigoQR(func.qr_token as string, fase)

  const QRCode = (await import('qrcode')).default
  const imagem = await QRCode.toDataURL(codigo, { width: 520, margin: 1, errorCorrectionLevel: 'H' })

  return {
    qr: {
      imagem,
      fase,
      faseNome: NOME_DA_FASE[fase],
      link: `${urlBase()}/credential/${func.qr_token}`,
    },
  }
}

export async function localizarFuncionario(
  termo: string,
  /*
   * Pedido do Juan, 05/10/2026: antes a busca era GLOBAL — cruzava TODOS os
   * eventos acontecendo hoje de uma vez, o que confundia quem opera mais de
   * um evento ao mesmo tempo (achou o bug testando o próprio CPF). Agora a
   * tela pede o evento primeiro (mesmo padrão de Avisos/Relatórios/Bloquear
   * CPF) e passa o id aqui — a busca escopa só a ESTE evento.
   */
  eventoId: string
): Promise<{ funcionario?: FuncionarioLocalizado; candidatos?: CandidatoLocalizado[]; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil)) return { error: 'Sem permissão para localizar funcionários.' }
  if (!eventoId) return { error: 'Escolha o evento antes de buscar.' }

  const busca = termo.trim()
  const digitos = busca.replace(/\D/g, '')
  // Só tratamos como CPF quando o que veio é essencialmente número: um nome
  // com um dígito no meio continua sendo nome.
  const pareceCpf = digitos.length >= 3 && digitos.length >= busca.replace(/\s/g, '').length - 3

  if (!busca) return { error: 'Digite o CPF ou o nome da pessoa.' }
  if (!pareceCpf && busca.length < 3) return { error: 'Digite pelo menos 3 letras do nome.' }
  if (pareceCpf && digitos.length === 11 && !validarCpf(digitos)) {
    return { error: 'CPF inválido. Confira os 11 dígitos.' }
  }

  /*
   * O evento escolhido precisa estar ACONTECENDO HOJE (pedido do Juan,
   * 25/09/2026, preservado): registro assistido com foto é coisa de quem
   * está na frente do operador agora, não um lançamento de outro dia — isso
   * é o `lancar-ponto`. "Ativo" não bastava: um evento com datas erradas
   * continua ativo sem estar acontecendo.
   */
  const hojeNesteEvento = await eventosAcontecendoHoje([eventoId])
  if (!hojeNesteEvento.has(eventoId)) {
    return { error: 'Este evento não está acontecendo hoje. O registro assistido só vale para o dia de hoje.' }
  }

  /*
   * Nome não passa por `ilike`: ele ignora caixa, mas diferencia "Julia" de
   * "Júlia". Carregamos a equipe do evento paginada e comparamos a chave sem
   * acentos em memória. CPF continua filtrado no banco porque é identificação
   * exata e não sofre essa ambiguidade.
   */
  const achadosBrutos = await buscarTudo<LinhaLocalizada>((de, ate) => {
    let consulta = supabaseAdmin
      .from('funcionarios')
      .select(SELECT_LOCALIZAR)
      .eq('fornecedores.evento_id', eventoId)
      .order('nome')
      .order('id') // desempate: homônimos tinham a página cortada no meio
      .range(de, ate)
    if (pareceCpf) {
      consulta = digitos.length === 11
        ? consulta.eq('cpf', digitos)
        : consulta.like('cpf', `%${digitos}%`)
    }
    return consulta
  }, { tetoTotal: 10_000 })
  const termoNome = chaveBusca(busca)
  const achados = pareceCpf
    ? achadosBrutos
    : achadosBrutos.filter(f => chaveBusca(f.nome).includes(termoNome))

  // Escopo do suporte é async (consulta `suporte_escopo`) — resolvido ANTES
  // do filtro síncrono abaixo, uma vez só, não por candidato.
  const escopoSuporte = perfil.role === 'suporte' ? await escopoDoSuporteComoConjuntos(perfil.id) : null
  /*
   * Vale pro papel 'supervisor' E pra quem tem outro papel principal mas
   * GANHOU um vínculo de supervisor (achado ao vivo, 05/10/2026, caso da
   * Mara Lúcia) — `meusSetores` já responde pela EXISTÊNCIA do vínculo.
   */
  const meusVinculos = perfil.role === 'supervisor' || !ehMaster(perfil.role) ? await meusSetores(perfil) : []
  const idsVinculo = new Set(meusVinculos.map(s => s.id))

  // Filtra pelo que ESTE usuário pode enxergar antes de dizer se achou ou não —
  // "não encontrado" também protege quem está fora do escopo dele.
  const dentroDoEscopo = (f: LinhaLocalizada) => {
    if (idsVinculo.has(f.fornecedor_id)) return true
    if (perfil.role === 'supervisor') return false
    if (ehMaster(perfil.role)) return true
    if (perfil.role === 'suporte') {
      const evento = comEvento(f.fornecedores)?.eventos
      return !!evento && (escopoSuporte!.eventos.has(evento.id) || escopoSuporte!.orgs.has(evento.organizacao_id ?? ''))
    }
    return comEvento(f.fornecedores)?.eventos?.organizacao_id === perfil.organizacao_id
  }
  let visiveis = achados.filter(dentroDoEscopo)
  let buscaAproximada = false

  /*
   * Rede de segurança para CPF digitado errado NO CADASTRO.
   *
   * O documento na mão do operador está certo, mas a consulta exata não acha
   * uma linha gravada com um algarismo trocado. Só no caminho de falha
   * carregamos a equipe do evento de novo (sem filtro de CPF) e oferecemos
   * cadastros com até dois dígitos diferentes. Nunca escolhemos
   * automaticamente, mesmo quando aparece uma pessoa só: a tela mostra nome,
   * CPF salvo, setor e evento para o operador confirmar quem está na frente.
   */
  if (pareceCpf && digitos.length === 11 && !visiveis.length) {
    const possiveis = await buscarTudo<LinhaLocalizada>((de, ate) =>
      supabaseAdmin
        .from('funcionarios')
        .select(SELECT_LOCALIZAR)
        .eq('fornecedores.evento_id', eventoId)
        .order('nome')
        .order('id') // desempate: homônimos tinham a página cortada no meio
        .range(de, ate),
    { tetoTotal: 10_000 })

    visiveis = possiveis
      .filter(f => distanciaEntreCpfs(f.cpf, digitos) <= 2)
      .filter(dentroDoEscopo)
    buscaAproximada = visiveis.length > 0
  }

  if (!visiveis.length) {
    const onde = idsVinculo.size ? 'na sua equipe, neste evento' : 'neste evento'
    return {
      error: pareceCpf
        ? `Nenhuma pessoa com este CPF ${onde}. Confira o número ou tente pelo nome.`
        : `Ninguém com esse nome ${onde}. Tente parte do nome ou busque pelo CPF.`,
    }
  }

  // Mais de uma pessoa: quem escolhe é o supervisor, não o sistema. Com nome
  // isso é o normal; com CPF acontece quando a pessoa está em dois eventos
  // ativos ao mesmo tempo.
  if (buscaAproximada || visiveis.length > 1) {
    return {
      candidatos: visiveis.slice(0, MAX_CANDIDATOS).map(f => {
        const forn = comEvento(f.fornecedores)
        return {
          id: f.id,
          nome: f.nome,
          cpf: f.cpf,
          cargo: f.cargo,
          setorNome: forn?.nome ?? '—',
          eventoNome: forn?.eventos?.nome ?? '—',
          cpfAproximado: buscaAproximada,
        }
      }),
    }
  }

  return fichaDoFuncionario(visiveis[0])
}

/** Quantas pessoas por página na lista de "Registrar ponto" — pedido do Juan, 08/10/2026. */
const PESSOAS_POR_PAGINA = 30

export type PessoaDaLista = { id: string; nome: string; cpf: string; cargo: string | null; setorNome: string; ativo: boolean }

/**
 * A lista das pessoas do evento em "Registrar ponto", em ordem alfabética e paginada.
 *
 * Antes a tela só tinha a caixa de busca: quem opera o portão e não lembrava o nome exato via uma tela
 * vazia. A régua de escopo é a mesma de `localizarFuncionario` — supervisor só da própria equipe, suporte
 * dentro do escopo, os demais na organização — e a pessoa escolhida abre a ficha pelo caminho de sempre
 * (`abrirFuncionarioLocalizado`, que confere o escopo de novo). Nunca lança: devolve `{ error }`.
 */
export async function listarPessoasDoEvento(
  eventoId: string,
  pagina: number,
): Promise<{ pessoas: PessoaDaLista[]; total: number; pagina: number; paginas: number } | { error: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeAcompanhar(perfil)) return { error: 'Sem permissão para ver as pessoas do evento.' }
    if (!eventoId) return { error: 'Escolha o evento antes.' }

    const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).maybeSingle()
    if (!evento) return { error: 'Evento não encontrado.' }

    const meusNoEvento = ehMaster(perfil.role) ? [] : (await meusSetores(perfil)).filter(x => x.evento_id === eventoId).map(x => x.id)
    // `null` = o evento inteiro; uma lista = só esses setores (supervisor, ou quem tem vínculo de supervisor aqui).
    let soSetores: string[] | null = null
    if (perfil.role === 'supervisor') {
      if (!meusNoEvento.length) return { error: 'Você não tem setor neste evento.' }
      soSetores = meusNoEvento
    } else if (perfil.role === 'suporte') {
      if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: (evento.organizacao_id as string | null) ?? undefined }))) {
        return { error: 'Este evento não está no seu escopo de atendimento.' }
      }
    } else if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) {
      if (!meusNoEvento.length) return { error: 'Este evento está fora do seu acesso.' }
      soSetores = meusNoEvento
    }

    const pg = Math.max(1, Math.floor(Number(pagina) || 1))
    const de = (pg - 1) * PESSOAS_POR_PAGINA
    let consulta = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, cargo, ativo, fornecedores!inner(nome, evento_id)', { count: 'exact' })
      .eq('fornecedores.evento_id', eventoId)
    if (soSetores) consulta = consulta.in('fornecedor_id', soSetores)
    // `id` desempata: nomes iguais não podem trocar de página entre uma consulta e outra.
    const { data, count, error } = await consulta.order('nome').order('id').range(de, de + PESSOAS_POR_PAGINA - 1)
    if (error) return { error: 'Não foi possível carregar a lista agora. Tente de novo.' }

    const total = count ?? 0
    return {
      pessoas: (data ?? []).map(f => ({
        id: f.id as string,
        nome: f.nome as string,
        cpf: f.cpf as string,
        cargo: (f.cargo as string | null) ?? null,
        setorNome: ((f.fornecedores as unknown as { nome?: string } | null)?.nome ?? '—').trim(),
        ativo: f.ativo !== false,
      })),
      total,
      pagina: pg,
      paginas: Math.max(1, Math.ceil(total / PESSOAS_POR_PAGINA)),
    }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/** Carrega a ficha completa depois que o supervisor escolhe alguém da lista. */
export async function abrirFuncionarioLocalizado(
  funcionarioId: string
): Promise<{ funcionario?: FuncionarioLocalizado; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil)) return { error: 'Sem permissão para localizar funcionários.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(SELECT_LOCALIZAR)
    .eq('id', funcionarioId)
    .eq('fornecedores.eventos.ativo', true)
    .single()

  // O escopo é conferido de novo aqui: o id chega do navegador, então não dá
  // pra confiar que veio de uma lista que já tinha sido filtrada.
  if (!func) return { error: 'Esta pessoa não está em nenhum evento ativo.' }
  const eventoDoFunc = comEvento(func.fornecedores)?.eventos
  let dentroDoEscopo: boolean
  /*
   * Vale pro papel 'supervisor' E pra quem tem outro papel principal mas
   * GANHOU um vínculo de supervisor (achado ao vivo, 05/10/2026, caso da
   * Mara Lúcia).
   */
  const meuVinculo = (await meusSetores(perfil)).some(s => s.id === func.fornecedor_id)
  if (meuVinculo) {
    dentroDoEscopo = true
  } else if (perfil.role === 'supervisor') {
    dentroDoEscopo = false
  } else if (perfil.role === 'suporte') {
    dentroDoEscopo = !!eventoDoFunc && (await suporteTemEscopo(perfil.id, { eventoId: eventoDoFunc.id, organizacaoId: eventoDoFunc.organizacao_id ?? undefined }))
  } else {
    dentroDoEscopo = ehMaster(perfil.role) || eventoDoFunc?.organizacao_id === perfil.organizacao_id
  }
  if (!dentroDoEscopo) return { error: 'Esta pessoa está fora do seu acesso.' }

  return fichaDoFuncionario(func)
}

/**
 * Só "este evento usa biometria?" — consulta À PARTE, tolerante, pra não
 * arriscar a busca de gente (`localizarFuncionario`, já grande e crítica)
 * quebrando por causa de uma coluna que pode não existir ainda.
 */
export async function metodoIdentificacaoDoEvento(eventoId: string): Promise<string> {
  try {
    // Chamada do navegador (Registro de ponto): só quem acompanha a operação — nunca anônimo.
    const perfil = await getPerfil()
    if (!perfil || !podeAcompanhar(perfil)) return 'qr'
    const { data } = await supabaseAdmin.from('eventos').select('metodo_identificacao').eq('id', eventoId).maybeSingle()
    return (data?.metodo_identificacao as string | null) ?? 'qr'
  } catch {
    return 'qr'
  }
}

type LinhaLocalizada = {
  id: string
  nome: string
  cpf: string
  cargo: string | null
  empresa: string | null
  ativo: boolean | null
  foto_perfil_path: string | null
  fornecedor_id: string
  fornecedores: unknown
}

/** Monta a ficha completa — o que o supervisor precisa ver antes de confirmar. */
async function fichaDoFuncionario(
  func: LinhaLocalizada
): Promise<{ funcionario?: FuncionarioLocalizado; error?: string }> {
  const fornecedor = comEvento(func.fornecedores)
  const evento = fornecedor?.eventos
  if (!evento) return { error: 'Não foi possível identificar o evento desta pessoa.' }

  /*
   * As batidas DO DIA, nao do evento inteiro.
   *
   * Sem o recorte por dia, a partir do segundo dia de uma operacao a ficha
   * mostraria "ja registrou todas as etapas" e o supervisor nao conseguiria
   * regularizar ninguem — os registros de ontem apareceriam como os de hoje.
   * O dia sai da mesma regra do resto: o da entrada em aberto, ou hoje.
   */
  const ref = await diaDeReferencia(evento, func.id)

  const [{ data: registros }, { data: supervisores }] = await Promise.all([
    supabaseAdmin
      .from('registros')
      .select('tipo, created_at')
      .eq('funcionario_id', func.id)
      .eq('evento_id', evento.id)
      .eq('data_ref', ref.dataRef),
    supabaseAdmin
      .from('perfis')
      .select('nome')
      .eq('fornecedor_id', func.fornecedor_id)
      .eq('role', 'supervisor')
      .limit(1),
  ])

  const feitos = new Map((registros ?? []).map(r => [r.tipo as MomentoPresenca, r.created_at as string]))
  const proxima = ORDEM_ETAPAS.find(e => !feitos.has(e.momento)) ?? null
  const etapas = ORDEM_ETAPAS.map(e => ({ ...e, quandoISO: feitos.get(e.momento) ?? null }))

  // Última batida = a mais recente no relógio, não a última da ordem: alguém
  // pode ter batido o meio sem ter batido a entrada.
  const ultima = [...feitos.entries()]
    .map(([momento, quando]) => ({
      rotulo: ORDEM_ETAPAS.find(e => e.momento === momento)?.rotulo ?? momento,
      quandoISO: quando,
    }))
    .sort((a, b) => b.quandoISO.localeCompare(a.quandoISO))[0] ?? null

  let fotoUrl: string | null = null
  if (func.foto_perfil_path) {
    const { data } = await supabaseAdmin.storage.from('presencas').createSignedUrl(func.foto_perfil_path, 60 * 30)
    fotoUrl = data?.signedUrl ?? null
  }

  return {
    funcionario: {
      id: func.id,
      nome: func.nome,
      cpf: func.cpf,
      cargo: func.cargo,
      ativo: func.ativo !== false,
      fotoUrl,
      setorId: func.fornecedor_id,
      setorNome: fornecedor?.nome ?? '—',
      supervisorNome: supervisores?.[0]?.nome ?? null,
      eventoId: evento.id,
      eventoNome: evento.nome,
      ultimaBatida: ultima,
      proximaPendente: proxima ? { momento: proxima.momento, rotulo: proxima.rotulo } : null,
      etapas,
    },
  }
}

const JUSTIFICATIVA_ASSISTIDO =
  'Batida registrada por supervisor devido à ausência de registro pelo colaborador.'

/**
 * Registro assistido: o supervisor (ou operador de portão) localizou a
 * pessoa, tirou a foto do rosto dela e confirma.
 *
 * QUEM ESCOLHE A ETAPA É O OPERADOR, não o sistema — a pedido do Juan.
 * Existia uma trava aqui ("o sistema decide sozinho, a primeira pendente")
 * pensada contra erro e uso indevido; na operação real ela virou o
 * problema oposto: sem QR na hora, pode ser entrada, meio OU saída que
 * falta, e às vezes o que o sistema calcula como "próxima" não é a que
 * aconteceu de verdade (a pessoa entrou por um caminho que o sistema não
 * viu, por exemplo) — e o operador não tinha como corrigir isso.
 *
 * A escolha ainda é validada no servidor (não confia no que a tela mandou
 * sem checar), e continua tudo auditado do mesmo jeito: autor, foto da
 * pessoa na hora, GPS, aparelho e motivo. Escolher uma etapa JÁ registrada
 * sobrescreve o horário dela — é uma correção, não uma duplicata (o índice
 * único do banco não permite duas linhas para a mesma pessoa/etapa/dia).
 *
 * Não valida janela de horário de propósito: existe justamente para o caso em
 * que a janela já fechou. O que sustenta a confiança no registro é a trilha de
 * auditoria, não a hora.
 */
export async function registrarPresencaAssistida(
  funcionarioId: string,
  momento: MomentoPresenca,
  dados: { fotoBase64: string; latitude?: number; longitude?: number; precisao?: number; dispositivo?: string },
  motivo?: string,
): Promise<{ ok?: boolean; error?: string; nome?: string; etapa?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil)) return { error: 'Sem permissão para registrar presença.' }
  const etapaEscolhida = ORDEM_ETAPAS.find(e => e.momento === momento)
  if (!etapaEscolhida) return { error: 'Etapa inválida.' }
  if (soBateMeio(perfil.role) && momento !== 'meio') {
    return { error: 'O supervisor só pode registrar a batida do meio.' }
  }

  const match = dados.fotoBase64?.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { error: 'A foto da pessoa é obrigatória — é ela que comprova que o colaborador estava presente.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, telefone, ativo, status_credenciamento, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, ativo, organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return { error: 'Funcionário não encontrado.' }

  const evento = comEvento(func.fornecedores)?.eventos

  if (perfil.role === 'supervisor') {
    if (!(await alcancaSetor(perfil, func.fornecedor_id as string))) return { error: 'Esta pessoa é de outro fornecedor. Você só registra a sua equipe.' }
  } else if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento?.id, organizacaoId: evento?.organizacao_id ?? undefined }))) {
      return { error: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento?.organizacao_id)) {
    return { error: 'Esta pessoa é de outra organização.' }
  }

  if (!evento?.ativo) return { error: 'Este evento já foi encerrado.' }
  // Registro do portão só pra quem é de evento acontecendo HOJE — mesma régua
  // da busca (`localizarFuncionario`), repetida aqui porque a trava de verdade
  // é o servidor, não a lista.
  if (!(await eventosAcontecendoHoje([evento.id])).has(evento.id)) {
    return { error: 'Esta pessoa é de um evento que não está acontecendo hoje. No portão só dá pra registrar quem é do evento de hoje.' }
  }

  /*
   * FORA DO LOCAL DO EVENTO: BLOQUEIA — mesma regra do scanner (`autorizarPresenca`), e pelo mesmo motivo: o
   * operador aqui já é obrigado a ter a localização ligada (`useLocalizacaoOperador`), então dá pra exigir de
   * verdade. Antes do upload da foto, pra não gastar a captura numa tentativa que vai ser recusada.
   */
  {
    const posOperador = posicaoValida({ latitude: dados.latitude, longitude: dados.longitude, precisao: dados.precisao })
    const localEvento = await localDoEvento(evento.id)
    if (localEvento) {
      const { distanciaM, foraDoLocal } = avaliarLocal(posOperador, localEvento)
      if (!posOperador || foraDoLocal) {
        // A tentativa fica no nome da pessoa, com o endereço — mesmo rastro do scanner e do celular.
        after(async () => {
          const endereco = await enderecoDaPosicao(posOperador)
          const error = await inserirLeituraComEndereco({
            evento_id: evento.id, perfil_id: perfil.id, funcionario_id: funcionarioId, tipo: 'credencial', sucesso: false,
            resultado: 'fora_do_local',
            mensagem: `Registro manual (${ROTULO_MOMENTO_TENTATIVA[momento] ?? momento}) recusado: fora do local do evento`,
            latitude: posOperador?.latitude ?? null, longitude: posOperador?.longitude ?? null, precisao_m: posOperador?.precisao ?? null,
            distancia_m: distanciaM, fora_do_local: true,
          }, endereco)
          if (error) console.error('[registro manual] tentativa fora do local não gravada', error.message)
          await auditarTentativaForaDoLocal({
            eventoId: evento.id, funcionarioId, quem: { id: perfil.id, nome: perfil.nome },
            origem: 'registro_manual', momento, distanciaM, endereco,
          })
        })
        return {
          error: posOperador
            ? `FORA DO LOCAL DO EVENTO (${descreverDistancia(distanciaM!)}). A batida não foi registrada. Aproxime-se do local configurado para o evento.`
            : 'Não foi possível confirmar sua localização. Verifique o GPS e tente de novo — a batida não foi registrada.',
        }
      }
    }
  }

  const statusCredAssistida = statusCredenciamentoValido(func.status_credenciamento as string)
  if (statusCredAssistida !== 'aprovado') {
    return { error: statusCredAssistida === 'pendente' ? 'Este credenciamento ainda aguarda aprovação.' : 'Este credenciamento foi negado.' }
  }
  if (func.ativo === false) return { error: 'Esta pessoa não está ativada no evento. Ative no painel do fornecedor antes de registrar.' }

  /*
   * O dia é recalculado no servidor (o que a tela mostrou pode ter mudado),
   * mas a ETAPA é a que o operador escolheu — não é mais recomputada aqui.
   * Escolher uma etapa que já tem registro é uma correção deliberada, não
   * um erro: `upsertRegistro` grava por cima, e o índice único do banco
   * garante que nunca vira uma segunda linha.
   */
  const refAssistido = await diaDeReferencia(evento, func.id, momento)

  /*
   * O MEIO TAMBÉM PRECISA DAS 4 HORAS DESDE A ENTRADA aqui — achado real (08/10/2026, VITAL): o registro
   * assistido deixava o operador gravar o meio minutos depois da entrada, porque só o autoatendimento
   * (`resolverRegistro`/`registrarPresencaFoto`) conferia a janela. Mesma conta de `janelaMeio` — e, diferente do
   * autoatendimento, mostra o horário exato: quem opera a câmera já está na frente da pessoa, então o horário
   * ajuda a decidir quando voltar, em vez de abrir brecha para burlar.
   */
  if (momento === 'meio') {
    const entradaDoMeio = await entradaDoTurno(func.id, evento.id, new Date())
    const janela = entradaDoMeio ? janelaMeio(entradaDoMeio.em) : null
    if (!janela) {
      return { error: 'Registre primeiro a entrada. O horário do meio é contado a partir dela.' }
    }
    if (Date.now() < new Date(janela.inicio).getTime()) {
      return { error: `O meio só abre 4 horas depois da entrada — a partir das ${formatarBR(janela.inicio, 'hora')}.` }
    }
  }

  // Escala por dia (eventos de subeventos): mesma régua do QR. Para liberar um
  // dia fora da escala, o caminho é ajustar a escala — não contornar aqui.
  const escalaHoje = await conferirEscalaNoDia(func.id, evento.id, refAssistido.dataRef)
  if (!escalaHoje.ok) return { error: `${escalaHoje.titulo} Ajuste os dias de trabalho desta pessoa antes de registrar.` }

  const contentType = match[1]
  const ext = contentType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  const path = `${evento.id}/${func.id}/assistido-${momento}-${refAssistido.dataRef}.${ext}`
  const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, { contentType, upsert: true })
  if (up.error) return { error: 'Não foi possível salvar a foto. Tente de novo.' }

  /*
   * ENTRADA de quem já entrou E saiu hoje = a VOLTA ao trabalho (26/09/2026).
   *
   * Antes, escolher "Entrada" aqui gravava POR CIMA da entrada da tarde — a
   * hora em que a pessoa chegou se perdia, e a saída ficava antes da entrada.
   * Agora é o mesmo que o scanner faz: a saída vira pausa (histórico mostra e
   * desconta das horas) e o turno reabre com a chegada original.
   */
  if (momento === 'entrada') {
    const { data: doDia } = await supabaseAdmin
      .from('registros').select('id, tipo, created_at')
      .eq('funcionario_id', func.id).eq('evento_id', evento.id)
      .eq('data_ref', refAssistido.dataRef).in('tipo', ['entrada', 'fim'])
    const entradaDoDia = (doDia ?? []).find(r => r.tipo === 'entrada')
    const saidaDoDia = (doDia ?? []).find(r => r.tipo === 'fim')
    if (entradaDoDia && saidaDoDia && saidaDoDia.created_at > entradaDoDia.created_at) {
      const agoraISO = new Date().toISOString()
      await registrarPausa({
        funcionarioId: func.id, eventoId: evento.id, dataRef: refAssistido.dataRef,
        saiuEm: saidaDoDia.created_at as string, voltouEm: agoraISO,
        perfilId: perfil.id, origem: 'assistido',
      })
      const { error: erroVolta } = await supabaseAdmin.from('registros').delete().eq('id', saidaDoDia.id)
      if (erroVolta) return { error: 'Não consegui registrar a volta desta pessoa. Tente de novo.' }
      after(() => registrarAuditoria({
        perfil, acao: 'REABERTURA_TURNO', eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined,
        campoAlterado: 'Voltou a trabalhar no mesmo dia (registro assistido)',
        valorAnterior: `Saída às ${formatarBR(saidaDoDia.created_at as string, 'hora')}`,
        valorNovo: `Turno reaberto às ${formatarBR(agoraISO, 'hora')} — foto: ${path}`,
        motivo: motivo ?? null, funcionarioId: func.id,
      }))
      revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
      return { ok: true, nome: func.nome, etapa: 'Entrada (voltou ao trabalho)' }
    }
  }

  const temGps = typeof dados.latitude === 'number' && typeof dados.longitude === 'number'
  const { data: registro, error } = await upsertRegistro(func.id, evento.id, momento, {
    foto_url: path,
    criado_por_perfil_id: perfil.id,
    registro_manual: true,
    justificativa: (motivo ?? '').trim() || JUSTIFICATIVA_ASSISTIDO,
    dispositivo: dados.dispositivo?.slice(0, 300) ?? null,
    ...(temGps ? { latitude: dados.latitude, longitude: dados.longitude } : {}),
  }, refAssistido.dataRef, refAssistido.jornadaDiaId)
  if (error) return { error: mensagemAmigavel(error) }
  {
    // Onde o aparelho de quem tirou a foto estava — marcado à parte (ver `marcarLocalDaBatida`).
    const pos = posicaoValida({ latitude: dados.latitude, longitude: dados.longitude, precisao: dados.precisao })
    after(() => marcarLocalDaBatida(registro?.id as string | undefined, evento.id, pos))
  }

  after(() => registrarAuditoria({
    perfil, acao: momento === 'entrada' ? 'REGISTRO_ENTRADA_ASSISTIDA' : momento === 'fim' ? 'REGISTRO_SAIDA_ASSISTIDA' : 'CORRECAO_PONTO',
    motivo: motivo ?? null, funcionarioId: func.id, eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined,
  }))

  if (registro && temGps) {
    after(() => sincronizarEndereco(registro.id, dados.latitude!, dados.longitude!).catch(console.error))
  }

  // Mesma razao do scanner: o meio so ganha horario depois que a entrada
  // existe, inclusive quando quem registrou a entrada foi o supervisor.
  if (momento === 'entrada' && func.telefone) {
    after(() =>
      agendarMeioAposEntrada({
        eventoId: evento.id,
        funcionarioId: func.id,
        telefone: func.telefone as string,
        entradaEm: new Date().toISOString(),
        dataRef: refAssistido.dataRef,
      }).catch(console.error)
    )
  }
  // Mesma regra do scanner: nunca descredencia sozinho na saída — ver o
  // comentário em `autorizarPresenca`.

  revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
  return { ok: true, nome: func.nome, etapa: etapaEscolhida.rotulo }
}

/**
 * Lançamento manual de ponto — retroativo, com hora escolhida e motivo
 * escrito à mão.
 *
 * É PARENTE do registro assistido, mas não é a mesma coisa, e a diferença é
 * o motivo de existir: o assistido acontece COM A PESSOA NA FRENTE (por isso
 * exige a foto do rosto, que é a prova) e grava na hora atual. Este aqui
 * acontece DEPOIS, na mesa, quando a pessoa já foi embora — a foto é
 * impossível e a hora certa é no passado.
 *
 * Sem isto, regularizar uma saída de ontem às 22h só era possível com script
 * direto no banco, o que aconteceu de verdade com treze pessoas do Henrique
 * e Juliano em 01/09/2026. Ficar dependente de script para uma tarefa
 * rotineira é a definição de buraco de produto.
 *
 * ── DIA DA OPERAÇÃO ≠ HORA DA BATIDA ──
 *
 * São dois campos de propósito. Numa saída de madrugada, a pessoa trabalhou
 * no dia 05 e bateu a saída às 02:00 do dia 06: `dataRef` é 05 (é o dia de
 * trabalho a que a batida pertence, e por onde o fechamento conta) e
 * `created_at` é 06 às 02:00 (o instante real). Colapsar os dois num campo
 * só jogaria essa batida para o dia seguinte e sumiria com ela do dia
 * trabalhado — exatamente o tipo de erro que o pagamento não perdoa.
 *
 * A PROVA aqui é a trilha, não a foto: autor, motivo escrito por ele, e
 * `registro_manual` marcando que não foi a própria pessoa.
 */
export async function lancarPontoManual(
  funcionarioId: string,
  momento: MomentoPresenca,
  /** Dia de trabalho a que a batida pertence, 'AAAA-MM-DD'. */
  dataRef: string,
  /** Instante real da batida, no formato do input: 'AAAA-MM-DDTHH:mm' (BRT). */
  quandoLocal: string,
  motivo: string,
): Promise<{ ok?: boolean; error?: string; nome?: string; etapa?: string }> {
  const perfil = await getPerfil()
  /*
   * Mais restrito que o registro assistido de propósito: lá o operador de
   * portão registra o que está acontecendo na frente dele; aqui se escreve o
   * passado, com hora arbitrária, e isso é ato de gestão. Supervisor entra
   * porque é quem sabe quem de fato trabalhou no setor dele.
   */
  /*
   * Vale pro papel 'supervisor' E pra quem tem outro papel principal mas
   * GANHOU um vínculo de supervisor (achado ao vivo, 05/10/2026, caso da
   * Mara Lúcia) — a checagem fina de setor vem abaixo, por `meusSetores`.
   */
  const meusVinculos = perfil ? await meusSetores(perfil) : []
  if (!perfil || !(podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte' || meusVinculos.length)) {
    return { error: 'Sem permissão para lançar ponto manualmente.' }
  }

  const etapaEscolhida = ORDEM_ETAPAS.find(e => e.momento === momento)
  if (!etapaEscolhida) return { error: 'Etapa inválida.' }

  /*
   * Quem chegou aqui sem ser gestor nem suporte age como SUPERVISOR (o papel
   * ou só o vínculo de setor, caso da Mara Lúcia) — e supervisor só lança o meio.
   */
  const agindoComoSupervisor = soBateMeio(perfil.role) || (!podeGerenciarEventos(perfil) && perfil.role !== 'suporte')
  if (agindoComoSupervisor && momento !== 'meio') {
    return { error: 'O supervisor só pode lançar a batida do meio. Entrada e saída são registradas pela gestão.' }
  }

  const justificativa = (motivo ?? '').trim()
  if (justificativa.length < 5) {
    return { error: 'Escreva o motivo do lançamento manual — é ele que sustenta a batida numa conferência.' }
  }

  const quandoISO = inputParaISO(quandoLocal)
  if (!quandoISO || Number.isNaN(new Date(quandoISO).getTime())) {
    return { error: 'Informe a data e a hora da batida.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef ?? '')) return { error: 'Informe o dia de trabalho.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, telefone, ativo, status_credenciamento, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, ativo, organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return { error: 'Funcionário não encontrado.' }

  const evento = comEvento(func.fornecedores)?.eventos
  if (!evento) return { error: 'Evento não encontrado.' }

  if (meusVinculos.some(s => s.id === func.fornecedor_id)) {
    // Vínculo de supervisor neste fornecedor — liberado.
  } else if (perfil.role === 'supervisor') {
    return { error: 'Esta pessoa é de outro fornecedor. Você só lança ponto da sua equipe.' }
  } else if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) {
      return { error: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) {
    return { error: 'Esta pessoa é de outra organização.' }
  }

  const statusCredManual = statusCredenciamentoValido(func.status_credenciamento as string)
  if (statusCredManual !== 'aprovado') {
    return { error: statusCredManual === 'pendente' ? 'Este credenciamento ainda aguarda aprovação.' : 'Este credenciamento foi negado.' }
  }
  if (func.ativo === false) {
    return { error: 'Esta pessoa não está ativada no evento. Ative no painel do fornecedor antes de lançar o ponto.' }
  }

  /*
   * O dia precisa ser dia de trabalho do evento. Sem isto a batida ficaria
   * órfã: não apareceria em nenhuma visão por dia nem no relatório, e o
   * lançamento pareceria ter sumido.
   */
  const dia = await diaDeTrabalho(evento.id, dataRef)
  if (!dia || dia.cancelado) {
    return { error: 'Esse dia não é um dia de trabalho deste evento. Marque-o em Editar evento antes de lançar o ponto.' }
  }

  /*
   * A hora tem que ficar perto do dia de trabalho. Não é regra de negócio —
   * é rede contra o dedo escorregar no ano ou no mês e mandar uma batida
   * para um mês adiante sem ninguém notar. Um turno nunca passa de ~36h do
   * início do dia a que pertence.
   */
  const inicioDoDia = new Date(`${dataRef}T00:00:00-03:00`).getTime()
  const distancia = new Date(quandoISO).getTime() - inicioDoDia
  if (distancia < -12 * 60 * 60 * 1000 || distancia > 36 * 60 * 60 * 1000) {
    return { error: `A data e hora informadas estão longe demais do dia ${dataRef.split('-').reverse().join('/')}. Confira antes de salvar.` }
  }

  /*
   * ENTRADA DEPOIS DA SAÍDA = NOVA ENTRADA, não correção (pedido do Juan,
   * 26/09/2026): a pessoa saiu e voltou ao trabalho. A entrada anterior fica,
   * a saída vira pausa no histórico e o turno reabre — nada é substituído.
   * Entrada ANTES da saída continua sendo correção da primeira entrada (é o
   * que o lápis do histórico usa pra acertar um horário errado).
   */
  if (momento === 'entrada') {
    const { data: doDia } = await supabaseAdmin
      .from('registros').select('id, tipo, created_at')
      .eq('funcionario_id', func.id).eq('evento_id', evento.id)
      .eq('data_ref', dataRef).in('tipo', ['entrada', 'fim'])
    const entradaDoDia = (doDia ?? []).find(r => r.tipo === 'entrada')
    const saidaDoDia = (doDia ?? []).find(r => r.tipo === 'fim')
    const saidaMs = saidaDoDia ? new Date(saidaDoDia.created_at as string).getTime() : NaN
    if (entradaDoDia && saidaDoDia && saidaMs > new Date(entradaDoDia.created_at as string).getTime()
        && new Date(quandoISO).getTime() > saidaMs) {
      await registrarPausa({
        funcionarioId: func.id, eventoId: evento.id, dataRef,
        saiuEm: saidaDoDia.created_at as string, voltouEm: quandoISO,
        perfilId: perfil.id, origem: 'manual',
      })
      const { error: erroVolta } = await supabaseAdmin.from('registros').delete().eq('id', saidaDoDia.id)
      if (erroVolta) return { error: 'Não consegui registrar a nova entrada. Tente de novo.' }
      after(() => registrarAuditoria({
        perfil, acao: 'REABERTURA_TURNO', eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined,
        campoAlterado: 'Nova entrada — voltou ao trabalho (lançamento manual)',
        valorAnterior: `Saída às ${formatarBR(saidaDoDia.created_at as string, 'hora')}`,
        valorNovo: `Nova entrada às ${formatarBR(quandoISO, 'hora')}`,
        motivo: justificativa, funcionarioId: func.id,
      }))
      revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
      revalidatePath(`/admin/eventos/${evento.id}/presenca`)
      return { ok: true, nome: func.nome as string, etapa: 'Nova entrada (voltou ao trabalho)' }
    }
  }

  const { error } = await upsertRegistro(func.id, evento.id, momento, {
    created_at: quandoISO,
    criado_por_perfil_id: perfil.id,
    registro_manual: true,
    justificativa,
  }, dataRef, dia.id ?? null)
  if (error) return { error: mensagemAmigavel(error) }

  after(() => registrarAuditoria({
    perfil, acao: 'CORRECAO_PONTO', campoAlterado: etapaEscolhida.rotulo, valorNovo: quandoLocal,
    motivo: justificativa, funcionarioId: func.id, eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined,
  }))

  revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
  revalidatePath(`/admin/eventos/${evento.id}/presenca`)
  return { ok: true, nome: func.nome as string, etapa: etapaEscolhida.rotulo }
}

/**
 * APAGA uma batida — a saída que não existiu, a leitura dupla, o registro
 * que caiu no dia errado.
 *
 * Existe porque `lancarPontoManual` só sabe SOBRESCREVER: dá pra corrigir
 * a hora de uma batida, nunca dizer "esta batida não deveria existir". O
 * caso que motivou (Juan, 03/09/2026) foi alguém com entrada e saída no
 * MESMO minuto — a saída precisa sumir, e mudar a hora dela não resolve.
 *
 * SÓ MASTER E SUPORTE, mais restrito que o lançamento manual (que aceita
 * supervisor): lançar é acrescentar, e o excesso aparece no relatório pra
 * ser conferido; apagar é o único caminho que faz dado sumir de vez. É a
 * mesma régua de `podeEditarIdentidade` — quem conserta identidade
 * conserta batida.
 *
 * A trilha fica: a linha some de `registros`, mas o que foi apagado (etapa,
 * horário, dia) e o motivo ficam gravados em `alteracoes_cadastro`, que é
 * o que sustenta a conferência depois.
 */
export async function apagarBatida(
  funcionarioId: string,
  momento: MomentoPresenca,
  /** Dia de trabalho da batida, 'AAAA-MM-DD' — a chave junto com a etapa. */
  dataRef: string,
  motivo: string,
): Promise<{ ok?: boolean; error?: string; nome?: string; etapa?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !(ehMaster(perfil.role) || perfil.role === 'suporte')) {
    return { error: 'Só o master e o suporte podem apagar uma batida.' }
  }

  const etapaEscolhida = ORDEM_ETAPAS.find(e => e.momento === momento)
  if (!etapaEscolhida) return { error: 'Etapa inválida.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef ?? '')) return { error: 'Informe o dia da batida.' }

  const justificativa = (motivo ?? '').trim()
  if (justificativa.length < 5) {
    return { error: 'Escreva o motivo — apagar não tem desfazer, e o motivo é o que explica a falta depois.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, fornecedor_id, fornecedores!inner(evento_id, eventos!inner(id, organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return { error: 'Funcionário não encontrado.' }

  const evento = comEvento(func.fornecedores)?.eventos
  if (!evento) return { error: 'Evento não encontrado.' }

  // Suporte só age dentro do escopo contratado dele; master vê tudo.
  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) {
      return { error: 'Este evento não está no seu escopo de atendimento.' }
    }
  }

  /*
   * Lê ANTES de apagar: sem isto a auditoria não teria o que registrar —
   * "apagou a saída" sem dizer qual horário some não sustenta conferência
   * nenhuma. Também é o que diferencia "apagou" de "não existia".
   */
  const { data: alvo } = await supabaseAdmin
    .from('registros')
    .select('id, created_at')
    .eq('funcionario_id', func.id).eq('evento_id', evento.id)
    .eq('tipo', momento).eq('data_ref', dataRef)
    .limit(1)

  if (!alvo?.length) return { error: 'Não há batida desta etapa neste dia — talvez já tenha sido apagada.' }

  const horarioApagado = alvo[0].created_at as string
  const { error } = await supabaseAdmin.from('registros').delete().eq('id', alvo[0].id as string)
  if (error) return { error: mensagemAmigavel(error) }

  after(() => registrarAuditoria({
    perfil,
    acao: 'EXCLUSAO_PONTO',
    campoAlterado: `${etapaEscolhida.rotulo} · ${dataRef}`,
    valorAnterior: horarioApagado,
    valorNovo: null,
    motivo: justificativa,
    funcionarioId: func.id,
    eventoId: evento.id,
    organizacaoId: evento.organizacao_id ?? undefined,
  }))

  revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
  revalidatePath(`/admin/eventos/${evento.id}/presenca`)
  return { ok: true, nome: func.nome as string, etapa: etapaEscolhida.rotulo }
}

// ─── Portaria: o QR impresso para quem chega sem cadastro ────────────────────

/**
 * Liga ou desliga o auto cadastro, gerando o endereço na primeira vez.
 *
 * O token nasce só quando alguém liga pela primeira vez. Criar para todo evento
 * na criação encheria a base de endereços públicos que ninguém pediu — e cada
 * um deles seria uma porta aberta que alguém teria que lembrar de fechar.
 *
 * Ligar de novo REAPROVEITA o token existente: o cartaz impresso continua
 * valendo depois de o produtor desligar e religar no meio do evento, que é o
 * uso normal (fecha o credenciamento à noite, reabre no dia seguinte).
 */
export async function alternarPortaria(eventoId: string, ligar: boolean) {
  const perfil = await exigirEventoDaOrg(eventoId)

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('token_portaria').eq('id', eventoId).single()

  const token = (evento?.token_portaria as string | null) ?? randomBytes(16).toString('hex')

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ portaria_ativa: ligar, token_portaria: token })
    .eq('id', eventoId)

  if (error) throw new Error('Não foi possível mudar o cadastro da portaria. Tente de novo.')
  auditar(perfil, 'PORTARIA_ALTERADA', { campoAlterado: 'Cadastro pela portaria (cartaz)', eventoId, valorNovo: ligar ? 'Ligado' : 'Desligado' })

  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const, token }
}

/**
 * Suspende (ou reabre) o cadastro por link do evento inteiro.
 *
 * Os links dos setores circulam em grupo e não têm como ser recolhidos;
 * quando a lista fecha, é isto que faz todos eles — e o cartaz da portaria —
 * recusarem cadastro novo, sem trocar link e sem tocar em quem já está
 * dentro. Checado no formulário público (app/form), no cartaz (app/portaria)
 * e na action `cadastrarFuncionarioPublico`, que é a tranca de verdade.
 *
 * Mesma permissão de ligar a portaria: quem administra o evento.
 */
export async function alternarCadastroPorLink(eventoId: string, suspender: boolean) {
  const perfil = await exigirEventoDaOrg(eventoId)
  // Só o master trava/destrava (Juan, 09/10/2026: "somente nós master podemos ter esses dois botões de trava").
  if (!ehMaster(perfil.role)) throw new Error('Só o master trava ou destrava o cadastro do evento.')

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ cadastro_suspenso: suspender })
    .eq('id', eventoId)

  if (error) {
    // Coluna ainda não existe no banco → a migração não rodou.
    if (/cadastro_suspenso/.test(error.message)) {
      throw new Error('O banco ainda não tem o campo de suspensão. Rode supabase/upgrade-cadastro-suspenso.sql no SQL Editor.')
    }
    throw new Error('Não foi possível mudar o cadastro por link. Tente de novo.')
  }
  auditar(perfil, 'CADASTRO_POR_LINK_ALTERADO', { campoAlterado: 'Cadastro por link (evento inteiro)', eventoId, valorNovo: suspender ? 'Suspenso' : 'Aberto' })

  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const }
}

/**
 * Trava (ou destrava) o cadastro de novas pessoas de UM SUBGRUPO (subevento) inteiro — todos os fornecedores dele,
 * de uma vez, sem mexer no link de cada um (pedido do Juan, 09/10/2026: "travar o do setor geral" no VITAL).
 *
 * Fica entre `alternarCadastroPorLink` (evento inteiro) e `alternarLinkDoSetor` (um fornecedor): qualquer tranca
 * fechada basta pra recusar, nenhuma vence a outra — destravar o subgrupo não reabre fornecedor fechado no card.
 * Checado em app/form, app/portaria e `cadastrarFuncionarioPublico`. Mesma permissão das outras duas.
 */
export async function alternarCadastroDoSubevento(eventoId: string, subeventoId: string, suspender: boolean): Promise<{ ok: true } | { erro: string }> {
  // Erro como VALOR, não exceção: o Next esconde a mensagem de exceção de Server Action em produção.
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    // Só o master (Juan, 09/10/2026) — mesma regra de `alternarCadastroPorLink`.
    if (!ehMaster(perfil.role)) return { erro: 'Só o master trava ou destrava o cadastro do subgrupo.' }

    const { data: sub } = await supabaseAdmin.from('subeventos').select('id, nome, evento_id').eq('id', subeventoId).maybeSingle()
    if (!sub || sub.evento_id !== eventoId) return { erro: 'Subgrupo não encontrado neste evento.' }

    const { error } = await supabaseAdmin.from('subeventos').update({ cadastro_suspenso: suspender }).eq('id', subeventoId)
    if (error) {
      if (/cadastro_suspenso/.test(error.message)) {
        return { erro: 'O banco ainda não tem o campo da trava por subgrupo. Rode supabase/upgrade-cadastro-subevento.sql no SQL Editor do Supabase.' }
      }
      return { erro: 'Não foi possível mudar o cadastro deste subgrupo. Tente de novo.' }
    }
    auditar(perfil, 'CADASTRO_POR_LINK_ALTERADO', { campoAlterado: `Cadastro por link (subgrupo ${sub.nome})`, eventoId, valorNovo: suspender ? 'Travado' : 'Aberto' })

    revalidatePath(`/admin/eventos/${eventoId}`)
    revalidatePath(`/admin/eventos/${eventoId}/subevento/${subeventoId}`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Reabre o formulário para uma única pessoa sem mexer no interruptor geral.
 * Exclusivo do master: é uma exceção deliberada à decisão da organização de
 * fechar a lista, então um admin da própria organização não pode concedê-la.
 */
export async function criarLinkCadastroIndividual(eventoId: string, fornecedorId: string) {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) {
    throw new Error('Só o acesso master pode reabrir um cadastro individual.')
  }

  const { data: setor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, nome, evento_id, token_formulario, eventos(nome, organizacao_id)')
    .eq('id', fornecedorId)
    .single()

  if (!setor || setor.evento_id !== eventoId || !setor.token_formulario) {
    throw new Error('Fornecedor não encontrado neste evento.')
  }

  const { token, expiraEm } = await criarAutorizacaoCadastroIndividual({ eventoId, fornecedorId })
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app').replace(/\/$/, '')
  const link = `${site}/form/${setor.token_formulario}?individual=${encodeURIComponent(token)}`
  const eventoRel = setor.eventos as unknown as { nome?: string; organizacao_id?: string | null } | null

  after(() => registrarAuditoria({
    perfil,
    acao: 'REABERTURA_CADASTRO_INDIVIDUAL',
    campoAlterado: `Cadastro por link · ${setor.nome}`,
    valorNovo: 'Cadastros liberados por link temporário durante 48 horas',
    eventoId,
    organizacaoId: eventoRel?.organizacao_id ?? undefined,
  }))

  return { ok: true as const, link, expiraEm, setor: setor.nome, evento: eventoRel?.nome ?? 'Evento' }
}

/**
 * Liga/desliga o link de cadastro de UM setor.
 *
 * O interruptor do evento (`alternarCadastroPorLink`) fecha tudo de uma
 * vez; este fecha só o setor dele, no card dele — o caso de um setor que já
 * fechou a equipe enquanto os outros seguem montando (Juan, 04/09/2026).
 *
 * Nenhum dos dois vence o outro: qualquer um fechado já basta pra recusar
 * (ver `cadastrarFuncionarioPublico`, app/form e app/portaria).
 */
export async function alternarLinkDoSetor(eventoId: string, fornecedorId: string, ativo: boolean) {
  const perfil = await exigirEventoDaOrg(eventoId)

  // O setor precisa ser DESTE evento — sem isto, um id de outro cliente
  // colado na chamada mudaria o link dele.
  const { data: setor } = await supabaseAdmin
    .from('fornecedores').select('id, evento_id, nome').eq('id', fornecedorId).single()
  if (!setor || setor.evento_id !== eventoId) throw new Error('Fornecedor não encontrado neste evento.')

  const { error } = await supabaseAdmin
    .from('fornecedores').update({ link_ativo: ativo }).eq('id', fornecedorId)

  if (error) {
    if (/link_ativo/.test(error.message)) {
      throw new Error('O banco ainda não tem o campo do link por fornecedor. Rode supabase/upgrade-link-do-setor.sql no SQL Editor.')
    }
    throw new Error('Não foi possível mudar o link deste fornecedor. Tente de novo.')
  }
  auditar(perfil, 'LINK_DO_SETOR_ALTERADO', { campoAlterado: `Link de cadastro de ${setor.nome}`, eventoId, valorNovo: ativo ? 'Aberto' : 'Fechado' })

  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const }
}

/**
 * Troca o endereço da portaria, invalidando todo cartaz já impresso.
 *
 * Existe para o caso em que o QR vaza — foto no grupo errado, cartaz
 * fotografado por quem não devia. Sem isto, a única saída seria desligar o
 * auto cadastro para todo mundo.
 *
 * Quem já se cadastrou não é afetado: o vínculo com o evento não passa pelo
 * token, ele só serve para abrir a página.
 */
export async function trocarTokenDaPortaria(eventoId: string) {
  const perfil = await exigirEventoDaOrg(eventoId)

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ token_portaria: randomBytes(16).toString('hex') })
    .eq('id', eventoId)

  if (error) throw new Error('Não foi possível gerar um novo QR. Tente de novo.')
  auditar(perfil, 'PORTARIA_TOKEN_TROCADO', { campoAlterado: 'QR da portaria', eventoId, valorAnterior: 'Cartaz antigo (deixa de funcionar)', valorNovo: 'QR novo gerado' })
  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const }
}

// ─── Configuração do meio (setores × dias) ────────────────────────────────


/**
 * Salva SÓ o local do evento no mapa (endereço, pino e raio) — ação própria, sem redirecionar (pedido do Juan,
 * 08/10/2026: salvar o endereço jogava para fora da tela de Editar evento, no meio de ajustar o pino). À parte e
 * tolerante: sem a migração (upgrade-geolocalizacao-operador.sql), devolve o aviso em vez de quebrar.
 */
export async function salvarLocalDoEvento(
  eventoId: string, dados: { local: string; latitude: number | null; longitude: number | null; raioM: number },
): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const local = (dados.local ?? '').trim() || null
    if (!local) return { erro: 'Informe o endereço do local.' }

    const lat = typeof dados.latitude === 'number' && Number.isFinite(dados.latitude) && Math.abs(dados.latitude) <= 90 ? dados.latitude : null
    const lng = typeof dados.longitude === 'number' && Number.isFinite(dados.longitude) && Math.abs(dados.longitude) <= 180 ? dados.longitude : null
    const raio = Math.min(20000, Math.max(50, Math.round(Number.isFinite(dados.raioM) ? dados.raioM : 800)))

    const { data: antes } = await supabaseAdmin.from('eventos').select('local, local_latitude, local_longitude, local_raio_m').eq('id', eventoId).maybeSingle()

    const { error } = await supabaseAdmin.from('eventos').update({ local }).eq('id', eventoId)
    if (error) return { erro: mensagemAmigavel(error) }

    const { error: erroLocal } = await supabaseAdmin.from('eventos')
      .update({ local_latitude: lat, local_longitude: lng, local_raio_m: raio }).eq('id', eventoId)
    if (erroLocal) {
      return { erro: 'O endereço foi salvo, mas o pino/raio no mapa precisa da atualização do banco (upgrade-geolocalizacao-operador.sql).' }
    }

    const resumo = (l: unknown, la: unknown, lo: unknown, r: unknown) =>
      curto(`${l ?? '—'}${la != null && lo != null ? ` · ${la}, ${lo} · raio ${r ?? 800}m` : ' · sem pino no mapa'}`)
    auditar(perfil, 'LOCAL_DO_EVENTO_ALTERADO', {
      campoAlterado: 'Local do evento', eventoId,
      valorAnterior: resumo((antes as { local?: string | null } | null)?.local, (antes as { local_latitude?: number | null } | null)?.local_latitude, (antes as { local_longitude?: number | null } | null)?.local_longitude, (antes as { local_raio_m?: number | null } | null)?.local_raio_m),
      valorNovo: resumo(local, lat, lng, raio),
    })

    revalidatePath(`/admin/eventos/${eventoId}/editar`)
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

export type ConfiguracaoDoMeio = {
  setores: { id: string; nome: string; exigeMeio: boolean }[]
  dias: { data: string; tipo: 'principal' | 'preparacao'; fase: 'montagem' | 'evento' | 'desmontagem'; exigeMeio: boolean }[]
  /** false = a migração `upgrade-meio-por-dia.sql` ainda não rodou. */
  diasDisponiveis: boolean
}

/**
 * O que a tela de "Batida do meio" mostra: os setores do evento e os dias da
 * operação, cada um com o seu interruptor.
 *
 * Três consultas separadas, nunca um join — as duas colunas `exige_meio` são
 * novas, e no Supabase pedir uma coluna inexistente derruba a consulta
 * inteira. Ver o comentário no topo de `lib/meio.ts`.
 */
/**
 * Endereço legível de um ponto do mapa — usado só em "Local do evento no mapa" (Editar evento), para mostrar
 * "Rua tal, nº tal..." acima do mapa (pedido do Juan, 08/10/2026). O fetch ao Nominatim precisa de um User-Agent
 * próprio, que o navegador não deixa o cliente mandar — por isso passa pelo servidor.
 */
export async function obterEnderecoAproximado(lat: number, lng: number): Promise<string | null> {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil)) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return enderecoAproximado(lat, lng)
}

export type StatusAutoatendimento = {
  /** O evento TEM a função (ligada em Editar evento) — independente de estar ativa agora. */
  habilitado: boolean
  /** Dentro da janela e com alguém tendo apertado "Estou indo embora" — é isto que libera o autoatendimento. */
  liberadoAgora: boolean
  janelaTexto: string | null
  ativadoPorNome: string | null
}

/**
 * O que a tela de scanner consulta (e repete, enquanto o botão fica visível) pra saber se mostra "Estou indo
 * embora" ou "Cheguei", e se o autoatendimento está valendo agora.
 */
export async function statusAutoatendimentoPortao(eventoId: string): Promise<StatusAutoatendimento> {
  const perfil = await getPerfil()
  if (!(await podeEscanearEvento(perfil, eventoId))) {
    return { habilitado: false, liberadoAgora: false, janelaTexto: null, ativadoPorNome: null }
  }
  const cfg = await obterAutoatendimento(eventoId)
  let ativadoPorNome: string | null = null
  if (cfg.ativadoPor) {
    const { data } = await supabaseAdmin.from('perfis').select('nome').eq('id', cfg.ativadoPor).maybeSingle()
    ativadoPorNome = (data?.nome as string | null) ?? null
  }
  return {
    habilitado: cfg.habilitado,
    liberadoAgora: await autoatendimentoLiberadoAgora(eventoId),
    janelaTexto: descreverJanela(cfg),
    ativadoPorNome,
  }
}

/**
 * "Estou indo embora" — o operador aperta e, dali até o horário de fim configurado em Editar evento, o
 * colaborador passa a poder bater a própria entrada/saída pelo celular (lib/actions.ts, ver
 * `registrarPresencaLivre`). Não é o operador quem escolhe o horário: só ativa dentro da janela já parametrizada.
 */
export async function ativarAutoatendimentoPortao(eventoId: string): Promise<{ ok: true } | { erro: string }> {
  const perfil = await getPerfil()
  if (!(await podeEscanearEvento(perfil, eventoId))) return { erro: 'Sem permissão sobre este evento' }

  const cfg = await obterAutoatendimento(eventoId)
  if (!cfg.habilitado) return { erro: 'Este evento não tem essa função ligada. Ligue em Editar evento.' }

  // O dia da janela em andamento (às 00:10 de uma janela 18:00–00:25, é o de ontem), ou o de hoje se ela ainda vai começar.
  const dia = diaDaAtivacao(cfg)
  if (!(await diaPermiteAutoatendimento(eventoId, dia))) {
    return { erro: `O dia ${dia.slice(8, 10)}/${dia.slice(5, 7)} não está marcado para autoatendimento. Marque em Editar evento → Autoatendimento.` }
  }

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ autoatendimento_ativado_em: new Date().toISOString(), autoatendimento_ativado_por: perfil!.id })
    .eq('id', eventoId)
  if (error) return { erro: 'Não foi possível ativar (migração upgrade-autoatendimento-portao.sql pendente?).' }

  auditar(perfil, 'AUTOATENDIMENTO_ATIVADO', {
    eventoId, campoAlterado: 'Autoatendimento fora do horário da portaria',
    valorNovo: curto(`Ativado às ${formatarBR(new Date().toISOString(), 'hora')}, janela ${descreverJanela(cfg) ?? cfg.fim ?? '—'}`),
  })
  revalidatePath('/scan')
  return { ok: true }
}

/** "Cheguei" — desliga o autoatendimento na hora, mesmo antes do horário de fim. Volta a exigir o operador. */
export async function desativarAutoatendimentoPortao(eventoId: string): Promise<{ ok: true } | { erro: string }> {
  const perfil = await getPerfil()
  if (!(await podeEscanearEvento(perfil, eventoId))) return { erro: 'Sem permissão sobre este evento' }

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ autoatendimento_ativado_em: null, autoatendimento_ativado_por: null })
    .eq('id', eventoId)
  if (error) return { erro: 'Não foi possível desativar (migração upgrade-autoatendimento-portao.sql pendente?).' }

  auditar(perfil, 'AUTOATENDIMENTO_DESATIVADO', {
    eventoId, campoAlterado: 'Autoatendimento fora do horário da portaria',
    valorNovo: curto(`Desativado às ${formatarBR(new Date().toISOString(), 'hora')}`),
  })
  revalidatePath('/scan')
  return { ok: true }
}

export type ConfiguracaoDoAutoatendimento = {
  habilitado: boolean
  inicio: string
  fim: string
  /** Só os dias que NÃO são o principal do evento — nele é sempre só o operador, não tem o que marcar. */
  dias: { data: string; fase: 'montagem' | 'evento' | 'desmontagem'; habilitado: boolean }[]
  /** false = a migração `upgrade-autoatendimento-portao.sql` ainda não rodou (coluna por dia). */
  diasDisponiveis: boolean
}

/**
 * O que a tela "Autoatendimento" (Editar evento) mostra: liga/desliga, horário e em quais dias — mesmo padrão de
 * `obterConfiguracaoDoMeio` (pedido do Juan, 08/10/2026: "precisa seguir o padrão de layout do sistema").
 */
export async function obterConfiguracaoDoAutoatendimento(eventoId: string): Promise<ConfiguracaoDoAutoatendimento> {
  await exigirEventoDaOrg(eventoId)
  const [cfg, { ok: diasDisponiveis, dias }] = await Promise.all([obterAutoatendimento(eventoId), diasAutoatendimentoDoEvento(eventoId)])
  return {
    habilitado: cfg.habilitado,
    inicio: cfg.inicio?.slice(0, 5) ?? '',
    fim: cfg.fim?.slice(0, 5) ?? '',
    dias: dias.filter(d => d.tipo !== 'principal').map(d => ({ data: d.data, fase: d.fase, habilitado: d.habilitado })),
    diasDisponiveis,
  }
}

/** Liga/desliga o autoatendimento, o horário, e em quais dias — grava os três de uma vez. */
export async function salvarConfiguracaoDoAutoatendimento(
  eventoId: string, dados: { habilitado: boolean; inicio: string; fim: string; dias: string[] },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const inicio = (dados.inicio ?? '').trim() || null
    const fim = (dados.fim ?? '').trim() || null
    if (dados.habilitado && (!inicio || !fim)) {
      return { ok: false, erro: 'Para ligar o autoatendimento, informe o horário de início e de fim.' }
    }

    const { error: erroEvento } = await supabaseAdmin.from('eventos')
      .update({ autoatendimento_habilitado: dados.habilitado, autoatendimento_inicio: inicio, autoatendimento_fim: fim })
      .eq('id', eventoId)
    if (erroEvento) return { ok: false, erro: 'Não foi possível salvar (migração upgrade-autoatendimento-portao.sql pendente?).' }

    const { data: diasDoEvento } = await supabaseAdmin
      .from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false)
    // Dia principal nunca é tocado — nele é sempre só o operador, a coluna fica sempre false.
    const naoPrincipais = (diasDoEvento ?? []).filter(d => d.tipo !== 'principal').map(d => d.data as string)
    const ligar = naoPrincipais.filter(d => dados.dias.includes(d))
    const desligar = naoPrincipais.filter(d => !dados.dias.includes(d))
    const erroDias =
      (ligar.length ? (await supabaseAdmin.from('jornada_dias').update({ autoatendimento_dia: true }).eq('evento_id', eventoId).in('data', ligar)).error : null)
      ?? (desligar.length ? (await supabaseAdmin.from('jornada_dias').update({ autoatendimento_dia: false }).eq('evento_id', eventoId).in('data', desligar)).error : null)
    if (erroDias) return { ok: false, erro: 'Os dias precisam da migração supabase/upgrade-autoatendimento-portao.sql aplicada no banco.' }

    const diasLigados = naoPrincipais.filter(d => dados.dias.includes(d))
    auditar(perfil, 'AUTOATENDIMENTO_CONFIGURADO', {
      eventoId, campoAlterado: 'Autoatendimento fora do horário da portaria',
      valorNovo: dados.habilitado
        ? curto(`Ligado, ${inicio}–${fim}, em ${diasLigados.length} dia(s): ${listarDias(diasLigados)}`)
        : 'Desligado',
    })

    revalidatePath(`/admin/eventos/${eventoId}/editar`)
    revalidatePath(`/admin/eventos/${eventoId}`)
    revalidatePath('/scan')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

export async function obterConfiguracaoDoMeio(eventoId: string): Promise<ConfiguracaoDoMeio> {
  await exigirEventoDaOrg(eventoId)

  const [{ data: setoresBase }, { data: diasBase }] = await Promise.all([
    supabaseAdmin.from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome'),
    // Todos os dias: os do evento vêm ligados por padrão; montagem e desmontagem, desligados (lib/meio.ts).
    supabaseAdmin.from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
  ])

  const comMeio = await setoresComMeio((setoresBase ?? []).map(s => s.id as string))
  const { ok: diasDisponiveis, dias: diasComMeioSet } = await diasComMeio(eventoId)

  return {
    setores: (setoresBase ?? []).map(s => ({ id: s.id as string, nome: s.nome as string, exigeMeio: comMeio.has(s.id as string) })),
    dias: (diasBase ?? []).map(d => ({
      data: d.data as string,
      tipo: ((d.tipo as string) === 'principal' ? 'principal' : 'preparacao') as 'principal' | 'preparacao',
      // Antes do primeiro dia do evento é montagem; depois, desmontagem.
      fase: ((d.tipo as string) === 'principal' ? 'evento'
        : (d.data as string) < ((diasBase ?? []).find(x => x.tipo === 'principal')?.data as string ?? '9999') ? 'montagem' : 'desmontagem') as 'montagem' | 'evento' | 'desmontagem',
      // Migração pendente ⇒ todos ligados, que é o padrão da coluna.
      exigeMeio: diasDisponiveis ? diasComMeioSet.has(d.data as string) : true,
    })),
    diasDisponiveis,
  }
}

/**
 * Os horários do aviso do MEIO para o supervisor (Editar evento → "Aviso do meio para o supervisor", pedido do Juan,
 * 10/10/2026 — VITAL: 21:00 e 00:00). Em cada dia principal, em cada horário, o supervisor recebe quantos da equipe
 * dele já deveriam ter batido o meio e não bateram. Sem o 1º horário = o padrão (um aviso, 6h depois do fim da
 * janela de entrada); o 2º é opcional. Ao salvar, a fila do evento é reagendada. Erro como valor.
 */
export async function salvarAvisoMeioSupervisor(
  eventoId: string, primeira: string | null, segunda: string | null,
): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const hora = (h: string | null) => {
      const t = (h ?? '').trim()
      if (!t) return null
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`Horário inválido: "${t}". Use o formato 21:00.`)
      return t
    }
    const h1 = hora(primeira), h2 = hora(segunda)
    if (h2 && !h1) return { erro: 'Preencha o 1º horário antes do 2º.' }
    if (h1 && h2 && h1 === h2) return { erro: 'Os dois horários são iguais.' }

    const { data: antes } = await supabaseAdmin.from('eventos').select('*').eq('id', eventoId).maybeSingle()
    const { error } = await supabaseAdmin.from('eventos')
      .update({ aviso_meio_supervisor_hora: h1, aviso_meio_supervisor_hora_2: h2 }).eq('id', eventoId)
    if (error) {
      return /aviso_meio_supervisor/.test(error.message)
        ? { erro: 'O banco ainda não tem os campos do horário do aviso. Rode supabase/upgrade-aviso-meio-supervisor.sql no SQL Editor do Supabase.' }
        : { erro: mensagemAmigavel(error) }
    }
    const lido = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 5) : 'padrão')
    const a = antes as { aviso_meio_supervisor_hora?: string | null; aviso_meio_supervisor_hora_2?: string | null } | null
    auditar(perfil, 'EVENTO_EDITADO', {
      campoAlterado: 'Horário do aviso do meio para o supervisor', eventoId,
      valorAnterior: `${lido(a?.aviso_meio_supervisor_hora)} / ${a?.aviso_meio_supervisor_hora_2 ? lido(a.aviso_meio_supervisor_hora_2) : '—'}`,
      valorNovo: `${h1 ?? 'padrão'} / ${h2 ?? '—'}`,
    })
    // Reagenda os avisos já na fila (o horário novo vale a partir de agora).
    after(() => sincronizarAgendamentos(eventoId).catch(console.error))
    revalidatePath(`/admin/eventos/${eventoId}/editar`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Liga/desliga a batida do meio: quais SETORES pedem, e em quais DIAS.
 *
 * Escreve os dois lados de uma vez porque a regra é um E entre eles (ver
 * `lib/meio.ts`) — salvar metade deixaria a tela dizendo uma coisa e o
 * sistema fazendo outra.
 *
 * Grava explicitamente `false` em quem NÃO foi escolhido, e não só `true` no
 * que foi: sem isso, desmarcar um setor não desligaria nada — só deixaria de
 * ligar de novo.
 *
 * E chama `sincronizarAgendamentos` no fim, que é a parte que realmente
 * economiza: desligar o meio sem cancelar a fila já enfileirada não pararia
 * mensagem nenhuma — foi exatamente esse buraco que deixou 2.249 mensagens
 * agendadas depois de uma mudança de regra.
 */
export async function salvarConfiguracaoDoMeio(
  eventoId: string, setoresLigados: string[], diasLigados: string[],
) {
  const perfil = await exigirEventoDaOrg(eventoId)

  const { data: setoresDoEvento } = await supabaseAdmin
    .from('fornecedores').select('id').eq('evento_id', eventoId)
  const idsDoEvento = (setoresDoEvento ?? []).map(s => s.id as string)
  const ligados = idsDoEvento.filter(id => setoresLigados.includes(id))
  const desligados = idsDoEvento.filter(id => !setoresLigados.includes(id))

  // Dois updates em massa, não um por setor: o Henrique e Juliano tem 33.
  // O `.in()` com lista vazia é evitado — ele não é um no-op em todo driver.
  const erroSetor = (
    (ligados.length ? (await supabaseAdmin.from('fornecedores').update({ exige_meio: true }).in('id', ligados)).error : null)
    ?? (desligados.length ? (await supabaseAdmin.from('fornecedores').update({ exige_meio: false }).in('id', desligados)).error : null)
  )
  if (erroSetor) throw new Error('A configuração por fornecedor precisa da migração supabase/upgrade-meio-por-setor.sql aplicada no banco.')

  /*
   * Cada tipo de dia tem a SUA chave (lib/meio.ts): dia do evento usa `exige_meio` (nasce ligada); montagem e
   * desmontagem usam `meio_fora_do_evento` (nasce desligada, liga só quem marcar aqui).
   */
  const { data: diasDoEvento } = await supabaseAdmin
    .from('jornada_dias').select('data, tipo').eq('evento_id', eventoId)
  const doEvento = [...new Set((diasDoEvento ?? []).filter(d => d.tipo === 'principal').map(d => d.data as string))]
  const deMontagem = [...new Set((diasDoEvento ?? []).filter(d => d.tipo !== 'principal').map(d => d.data as string))]
  const atualizar = async (coluna: 'exige_meio' | 'meio_fora_do_evento', datas: string[]) => {
    const ligar = datas.filter(d => diasLigados.includes(d))
    const desligar = datas.filter(d => !diasLigados.includes(d))
    return (ligar.length ? (await supabaseAdmin.from('jornada_dias').update({ [coluna]: true }).eq('evento_id', eventoId).in('data', ligar)).error : null)
      ?? (desligar.length ? (await supabaseAdmin.from('jornada_dias').update({ [coluna]: false }).eq('evento_id', eventoId).in('data', desligar)).error : null)
  }
  const erroDia = await atualizar('exige_meio', doEvento)
  if (erroDia) throw new Error('A configuração por dia precisa da migração supabase/upgrade-meio-por-dia.sql aplicada no banco.')
  const erroMontagem = await atualizar('meio_fora_do_evento', deMontagem)
  if (erroMontagem && deMontagem.some(d => diasLigados.includes(d))) {
    throw new Error('Para ligar o meio em dia de montagem ou desmontagem, rode supabase/upgrade-meio-montagem.sql no banco.')
  }
  const datasLigadas = [...doEvento, ...deMontagem].filter(d => diasLigados.includes(d))

  /*
   * O cancelamento do MEIO é SÍNCRONO; o resto continua em background.
   *
   * `sincronizarAgendamentos` só varre os tipos que ela mesma agenda, e as
   * do meio nascem em `agendarMeioAposEntrada` (na hora da entrada da
   * pessoa) — ninguém limpava essas. E ele precisa ser síncrono porque o
   * pedido é o número da fila cair NA HORA de desligar: em `after()` só
   * cairia no refresh seguinte, e a tela pareceria ter ignorado o clique.
   */
  const canceladas = await cancelarMeioDesligado(eventoId)
  auditar(perfil, 'CONFIGURACAO_MEIO_ALTERADA', {
    campoAlterado: 'Batida do meio', eventoId,
    valorNovo: `${ligados.length} fornecedor(es) e ${datasLigadas.length} dia(s) exigem o meio${canceladas ? ` · ${canceladas} lembrete(s) cancelado(s)` : ''}`,
  })

  after(() => sincronizarAgendamentos(eventoId).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/admin/eventos/${eventoId}/editar`)
  revalidatePath('/admin/whatsapp')
  return { ok: true as const, setores: ligados.length, dias: datasLigadas.length, canceladas }
}

// ─── Avisos ───────────────────────────────────────────────────────────────
/*
 * Comunicado do admin, mostrado em modal ao funcionário (credencial pública)
 * e/ou ao supervisor (painel do setor) — ver `lib/avisos.ts` para a lógica
 * de "quem recebe o quê". Vive por EVENTO, mesmo padrão de Presença e
 * Relatórios (ver supabase/upgrade-avisos.sql para o desenho da tabela).
 */

/** Lê e valida os campos comuns a criar/editar aviso. */
function dadosAvisoDoForm(formData: FormData) {
  const titulo = ((formData.get('titulo') as string) || '').trim()
  const mensagem = ((formData.get('mensagem') as string) || '').trim()
  if (!titulo) throw new Error('Dê um título para o aviso.')
  if (!mensagem) throw new Error('Escreva a mensagem do aviso.')

  const publico = formData.get('publico') as string
  if (!['todos', 'setores', 'pessoa', 'supervisores'].includes(publico)) {
    throw new Error('Escolha quem recebe o aviso.')
  }

  const dataInicio = (formData.get('data_inicio') as string) || diaBRT()
  const dataFim = (formData.get('data_fim') as string) || null
  if (dataFim && dataFim < dataInicio) {
    throw new Error('A data de término precisa vir depois (ou no mesmo dia) da data de início.')
  }

  let cpfPessoa: string | null = null
  if (publico === 'pessoa') {
    cpfPessoa = normalizarCpf((formData.get('cpf_pessoa') as string) || '')
    if (!validarCpf(cpfPessoa)) throw new Error('Escolha uma pessoa específica pra este aviso.')
  }

  // Mesmo cuidado de `batida_livre`/`exige_meio`: caixa desmarcada não é
  // enviada, então "veio marcado?" é a pergunta certa, não "qual o valor?".
  const fornecedorIds = publico === 'setores' ? formData.getAll('fornecedor_id').map(String).filter(Boolean) : []
  if (publico === 'setores' && !fornecedorIds.length) {
    throw new Error('Escolha ao menos um fornecedor pra este aviso.')
  }

  return {
    titulo, mensagem,
    publico: publico as 'todos' | 'setores' | 'pessoa' | 'supervisores',
    ativo: formData.get('ativo') === 'on',
    recorrente: formData.get('recorrente') === 'on',
    data_inicio: dataInicio,
    data_fim: dataFim,
    cpf_pessoa: cpfPessoa,
    fornecedorIds,
  }
}

/** Confere que os setores/pessoa escolhidos realmente pertencem a este evento. */
async function exigirDestinatariosDoEvento(eventoId: string, dados: ReturnType<typeof dadosAvisoDoForm>) {
  if (dados.publico === 'setores') {
    const { data: setoresDoEvento } = await supabaseAdmin
      .from('fornecedores').select('id').eq('evento_id', eventoId).in('id', dados.fornecedorIds)
    if (!setoresDoEvento || setoresDoEvento.length !== dados.fornecedorIds.length) {
      throw new Error('Um dos fornecedores escolhidos não pertence a este evento.')
    }
  }
  if (dados.publico === 'pessoa') {
    const { data: pessoa } = await supabaseAdmin
      .from('funcionarios')
      .select('id, fornecedores!inner(evento_id)')
      .eq('cpf', dados.cpf_pessoa as string)
      .eq('fornecedores.evento_id', eventoId)
      .maybeSingle()
    if (!pessoa) throw new Error('Não encontrei ninguém com esse CPF neste evento.')
  }
}

export async function criarAviso(eventoId: string, formData: FormData) {
  const perfil = await exigirEventoDaOrg(eventoId)
  const dados = dadosAvisoDoForm(formData)
  await exigirDestinatariosDoEvento(eventoId, dados)

  const { data: novo, error } = await supabaseAdmin.from('avisos').insert([{
    evento_id: eventoId,
    titulo: dados.titulo,
    mensagem: dados.mensagem,
    ativo: dados.ativo,
    data_inicio: dados.data_inicio,
    data_fim: dados.data_fim,
    publico: dados.publico,
    cpf_pessoa: dados.cpf_pessoa,
    recorrente: dados.recorrente,
    criado_por: perfil.id,
  }]).select('id').single()
  if (error) throw new Error(mensagemAmigavel(error))

  if (dados.publico === 'setores') {
    const { error: erroSetores } = await supabaseAdmin
      .from('aviso_setores')
      .insert(dados.fornecedorIds.map(fornecedor_id => ({ aviso_id: novo.id, fornecedor_id })))
    if (erroSetores) throw new Error(mensagemAmigavel(erroSetores))
  }

  auditar(perfil, 'AVISO_CRIADO', { campoAlterado: 'Aviso', eventoId, valorNovo: curto(`${dados.titulo} · para ${dados.publico === 'setores' ? `${dados.fornecedorIds.length} fornecedor(es)` : dados.publico === 'pessoa' ? `CPF ${formatCpf(String(dados.cpf_pessoa ?? ''))}` : dados.publico}${dados.ativo ? '' : ' · inativo'}`) })
  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

export async function editarAviso(avisoId: string, eventoId: string, formData: FormData) {
  const perfil = await exigirEventoDaOrg(eventoId)
  const dados = dadosAvisoDoForm(formData)
  await exigirDestinatariosDoEvento(eventoId, dados)

  const { data: atual } = await supabaseAdmin.from('avisos').select('id, evento_id, titulo').eq('id', avisoId).single()
  if (!atual || atual.evento_id !== eventoId) throw new Error('Aviso não encontrado neste evento.')

  const { error } = await supabaseAdmin.from('avisos').update({
    titulo: dados.titulo,
    mensagem: dados.mensagem,
    ativo: dados.ativo,
    data_inicio: dados.data_inicio,
    data_fim: dados.data_fim,
    publico: dados.publico,
    cpf_pessoa: dados.cpf_pessoa,
    recorrente: dados.recorrente,
  }).eq('id', avisoId)
  if (error) throw new Error(mensagemAmigavel(error))

  // Substitui os setores do zero — mais simples que calcular o diff, e o
  // volume (poucas dezenas de setores por evento) não justifica a economia.
  await supabaseAdmin.from('aviso_setores').delete().eq('aviso_id', avisoId)
  if (dados.publico === 'setores') {
    const { error: erroSetores } = await supabaseAdmin
      .from('aviso_setores')
      .insert(dados.fornecedorIds.map(fornecedor_id => ({ aviso_id: avisoId, fornecedor_id })))
    if (erroSetores) throw new Error(mensagemAmigavel(erroSetores))
  }

  auditar(perfil, 'AVISO_EDITADO', { campoAlterado: 'Aviso', eventoId, valorAnterior: curto(atual.titulo), valorNovo: curto(`${dados.titulo} · para ${dados.publico === 'setores' ? `${dados.fornecedorIds.length} fornecedor(es)` : dados.publico === 'pessoa' ? `CPF ${formatCpf(String(dados.cpf_pessoa ?? ''))}` : dados.publico}${dados.ativo ? '' : ' · inativo'}`) })
  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

export async function alternarAtivoAviso(avisoId: string, eventoId: string, ativo: boolean) {
  const perfil = await exigirEventoDaOrg(eventoId)
  const { data: aviso } = await supabaseAdmin.from('avisos').select('titulo').eq('id', avisoId).maybeSingle()
  const { error } = await supabaseAdmin.from('avisos').update({ ativo }).eq('id', avisoId).eq('evento_id', eventoId)
  if (error) throw new Error(mensagemAmigavel(error))
  auditar(perfil, 'AVISO_SITUACAO', { campoAlterado: `Aviso ${curto(aviso?.titulo ?? '')}`, eventoId, valorNovo: ativo ? 'Ativo' : 'Desativado' })
  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

/**
 * Exclui um aviso. Diferente da regra geral de exclusão (`podeExcluir`, só
 * master): aviso é conteúdo de comunicação, sem histórico de presença nem
 * pagamento embaixo — o próprio admin que criou pode apagar, é o que o
 * pedido descreve.
 */
export async function excluirAviso(avisoId: string, eventoId: string) {
  const perfil = await exigirEventoDaOrg(eventoId)
  const { data: aviso } = await supabaseAdmin.from('avisos').select('titulo, mensagem').eq('id', avisoId).maybeSingle()
  const { error } = await supabaseAdmin.from('avisos').delete().eq('id', avisoId).eq('evento_id', eventoId)
  if (error) throw new Error(mensagemAmigavel(error))
  auditar(perfil, 'AVISO_EXCLUIDO', { campoAlterado: 'Aviso', eventoId, valorAnterior: curto(`${aviso?.titulo ?? ''} — ${aviso?.mensagem ?? ''}`) })
  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

/**
 * Grava (ou atualiza) a confirmação de "Entendi" — sempre por `aviso_id` +
 * UM dos dois identificadores (`funcionario_id` OU `perfil_id`, nunca os
 * dois; ver `aviso_visualizacoes_um_identificador` na migração).
 *
 * Não usa `upsert`/`ON CONFLICT`: os dois índices únicos são PARCIAIS (só
 * valem quando a respectiva coluna não é nula), e o Postgres só aceita um
 * índice parcial como alvo de `ON CONFLICT` se a cláusula repetir o mesmo
 * predicado — o que o `upsert` do supabase-js não expõe. Seleciona e decide
 * entre update/insert; corrida rara (duplo clique) é tratada pelo índice
 * único mesmo assim — só vira erro de verdade se não for 23505.
 */
async function marcarVisualizacao(avisoId: string, coluna: 'funcionario_id' | 'perfil_id', valor: string) {
  const { data: existente } = await supabaseAdmin
    .from('aviso_visualizacoes').select('id').eq('aviso_id', avisoId).eq(coluna, valor).maybeSingle()
  if (existente) {
    await supabaseAdmin.from('aviso_visualizacoes').update({ visualizado_em: new Date().toISOString() }).eq('id', existente.id)
    return
  }
  const { error } = await supabaseAdmin.from('aviso_visualizacoes').insert([{ aviso_id: avisoId, [coluna]: valor }])
  if (error && error.code !== '23505') throw new Error(mensagemAmigavel(error))
}

/**
 * Confirma que a pessoa VIU o aviso, a partir da credencial pública — sem
 * login. Resolve o funcionário de novo a partir do TOKEN, não de um id
 * vindo do client: mesmo cuidado de `registrarPresencaLivre`.
 */
export async function visualizarAvisoPorToken(avisoId: string, token: string) {
  const { data: funcionario } = await supabaseAdmin
    .from('funcionarios')
    .select('id, fornecedores(evento_id)')
    .eq('qr_token', token)
    .single()
  if (!funcionario) throw new Error('Credencial não encontrada.')

  const eventoId = (funcionario.fornecedores as unknown as { evento_id: string } | null)?.evento_id
  const { data: aviso } = await supabaseAdmin.from('avisos').select('id, evento_id').eq('id', avisoId).single()
  if (!aviso || !eventoId || aviso.evento_id !== eventoId) throw new Error('Aviso não encontrado.')

  await marcarVisualizacao(avisoId, 'funcionario_id', funcionario.id)
  return { ok: true as const }
}

/** Mesma confirmação, pro supervisor logado no painel — via `perfis`, não `funcionarios`. */
export async function visualizarAvisoSupervisor(avisoId: string, eventoId: string) {
  const perfil = await getPerfil()
  if (!perfil || perfil.role !== 'supervisor') throw new Error('Sem permissão')

  const { data: aviso } = await supabaseAdmin.from('avisos').select('id, evento_id').eq('id', avisoId).single()
  if (!aviso || aviso.evento_id !== eventoId) throw new Error('Aviso não encontrado.')

  await marcarVisualizacao(avisoId, 'perfil_id', perfil.id)
  return { ok: true as const }
}

export type VisualizacaoAviso = { nome: string; via: 'credencial' | 'painel'; em: string }

/** Pro "Ver quem já visualizou" — busca só quando o admin abre, não de graça. */
export async function obterVisualizacoesDoAviso(avisoId: string, eventoId: string): Promise<VisualizacaoAviso[]> {
  await exigirEventoDaOrg(eventoId)
  const { data: aviso } = await supabaseAdmin.from('avisos').select('id, evento_id').eq('id', avisoId).single()
  if (!aviso || aviso.evento_id !== eventoId) throw new Error('Aviso não encontrado.')

  const { data: vis } = await supabaseAdmin
    .from('aviso_visualizacoes')
    .select('funcionario_id, perfil_id, visualizado_em, funcionarios(nome), perfis(nome)')
    .eq('aviso_id', avisoId)
    .order('visualizado_em', { ascending: false })

  return (vis ?? []).map(v => {
    const nomeFuncionario = (v.funcionarios as unknown as { nome: string } | null)?.nome
    const nomePerfil = (v.perfis as unknown as { nome: string } | null)?.nome
    return {
      nome: (v.funcionario_id ? nomeFuncionario : nomePerfil) ?? '—',
      via: v.funcionario_id ? ('credencial' as const) : ('painel' as const),
      em: v.visualizado_em as string,
    }
  })
}

// ─── Veículos ────────────────────────────────────────────────────────────────
/*
 * Quem entra de caminhão/van no evento, e com qual placa. Ver
 * supabase/upgrade-veiculos.sql pro desenho das tabelas e pro escopo:
 * SÓ CADASTRO E CONSULTA — o veículo não bate ponto, não tem QR e não passa
 * pelo scanner. A portaria consulta pela placa e confere.
 *
 * A regra central é o CONDUTOR: todo veículo é vinculado ao CPF de alguém já
 * credenciado NAQUELE evento. Alguém dirige o caminhão, e essa pessoa
 * responde pelo veículo — sem isso a lista viraria placas soltas, sem
 * ninguém a quem perguntar.
 */

/**
 * Quem pode mexer nos veículos DESTE evento, com o escopo já conferido.
 *
 * `podeGerenciarVeiculos` diz o papel (master/admin/suporte); aqui vem a
 * outra metade, que o papel sozinho não responde — QUAL evento cada um
 * alcança:
 *
 *   master  → todos
 *   admin   → só os da própria organização
 *   suporte → só os do escopo contratado dele (`suporteTemEscopo`)
 *
 * Devolve o perfil quando pode, ou a mensagem de erro quando não — as três
 * actions de veículo chamam isto antes de qualquer coisa.
 */
async function exigirAcessoAVeiculos(
  eventoId: string,
): Promise<{ perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>; error?: undefined } | { perfil?: undefined; error: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarVeiculos(perfil)) {
    return { error: 'Só master, admin e suporte podem cadastrar veículos.' }
  }

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) return { error: 'Evento não encontrado.' }

  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) {
      return { error: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) {
    return { error: 'Sem permissão sobre este evento.' }
  }

  return { perfil }
}

export type CondutorEncontrado = {
  id: string
  nome: string
  cpf: string
  cargo: string | null
  setorNome: string
  empresa: string | null
}

/**
 * Acha o condutor pelo CPF, DENTRO do evento — é o que preenche o nome
 * sozinho no formulário.
 *
 * Restrito ao evento de propósito: o veículo é autorizado a entrar NESTE
 * evento, então o condutor precisa estar credenciado NELE. Um CPF que existe
 * na base mas não neste evento devolve um erro que diz exatamente isso, em
 * vez de "não encontrado" — a diferença entre "cadastra a pessoa primeiro" e
 * "confere o número digitado".
 */
export async function buscarCondutorPorCpf(
  eventoId: string,
  cpfDigitado: string,
): Promise<{ condutor: CondutorEncontrado; error?: undefined } | { condutor?: undefined; error: string }> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }

  const cpf = normalizarCpf(cpfDigitado ?? '')
  if (cpf.length !== 11) return { error: 'O CPF precisa ter 11 dígitos.' }
  if (!validarCpf(cpf)) return { error: 'Este CPF não é válido. Confira os números.' }

  const { data } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, cargo, empresa, fornecedores!inner(nome, evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', eventoId)
    .limit(1)

  const f = data?.[0]
  if (!f) {
    return {
      error: 'Este CPF não está credenciado neste evento. Cadastre a pessoa na equipe antes de vincular o veículo a ela.',
    }
  }

  const forn = f.fornecedores as unknown as { nome: string } | { nome: string }[]
  return {
    condutor: {
      id: f.id as string,
      nome: f.nome as string,
      cpf: f.cpf as string,
      cargo: (f.cargo as string | null) ?? null,
      setorNome: (Array.isArray(forn) ? forn[0]?.nome : forn?.nome) ?? '',
      empresa: (f.empresa as string | null) ?? null,
    },
  }
}

/** Placa sem máscara e em maiúscula — "abc-1d23" e "ABC1D23" viram a mesma coisa. */
function normalizarPlaca(v: string): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Sobe uma foto ligada ao veículo (do veículo em si, ou da pessoa) e devolve
 * o caminho salvo, ou null quando não veio arquivo.
 *
 * Mesmo bucket privado das outras fotos do sistema (`presencas`), com
 * `upsert: true` no caminho fixo do veículo+tipo: trocar a foto substitui a
 * anterior em vez de acumular arquivo órfão no storage. `sufixo` separa as
 * duas fotos no mesmo bucket (`veiculos/{id}.ext` pra do veículo, sempre
 * assim por compatibilidade com o que já existe; `veiculos/{id}-pessoa.ext`
 * pra da pessoa).
 */
async function subirFotoVeiculo(
  veiculoId: string, arquivo: FormDataEntryValue | null, sufixo: '' | '-pessoa' = '',
): Promise<string | null> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (!TIPOS_FOTO_ACEITOS.has(arquivo.type)) {
    throw new Error('Formato de imagem não suportado. Use JPG, PNG ou WEBP.')
  }
  const ext = arquivo.type.split('/')[1] === 'jpeg' ? 'jpg' : arquivo.type.split('/')[1]
  const path = `veiculos/${veiculoId}${sufixo}.${ext}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const { error } = await supabaseAdmin.storage.from('presencas').upload(path, buffer, {
    contentType: arquivo.type,
    upsert: true,
  })
  if (error) throw new Error('Erro ao enviar a foto. Tente novamente.')
  return path
}

/** Token opaco do QR do veículo — o QR encode `${SITE_URL}/veiculo/{token}`. */
function gerarQrTokenVeiculo(): string {
  return randomBytes(24).toString('base64url')
}

const SITE_URL_VEICULO = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

/** O link que o QR do veículo encode, e o PNG (data URL) pronto pra exibir/baixar. */
async function montarQrVeiculo(qrToken: string): Promise<{ link: string; qrDataUrl: string }> {
  const link = `${SITE_URL_VEICULO}/veiculo/${qrToken}`
  const qrDataUrl = await QRCode.toDataURL(link, { width: 260, margin: 1 })
  return { link, qrDataUrl }
}

/**
 * Troca (ou remove) a foto de um veículo já cadastrado.
 *
 * Existe separada do cadastro porque a foto quase sempre vem DEPOIS: o
 * veículo é cadastrado às pressas na chegada e a foto é tirada quando ele
 * já está parado no portão.
 */
export async function atualizarFotoVeiculo(veiculoId: string, eventoId: string, formData: FormData) {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }

  const { data: atual } = await supabaseAdmin
    .from('veiculos').select('id, foto_path, placa').eq('id', veiculoId).eq('evento_id', eventoId).single()
  if (!atual) return { error: 'Veículo não encontrado.' }

  const remover = formData.get('remover') === '1'
  if (remover) {
    if (atual.foto_path) await supabaseAdmin.storage.from('presencas').remove([atual.foto_path as string])
    await supabaseAdmin.from('veiculos').update({ foto_path: null }).eq('id', veiculoId)
    auditar(acesso.perfil, 'VEICULO_FOTO_ALTERADA', { campoAlterado: `Veículo ${atual.placa ?? ''}`.trim(), eventoId, valorNovo: 'Foto removida' })
    revalidatePath('/admin/veiculos')
    return { ok: true as const }
  }

  let path: string | null
  try {
    path = await subirFotoVeiculo(veiculoId, formData.get('foto'))
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao enviar a foto.' }
  }
  if (!path) return { error: 'Escolha uma imagem.' }

  /*
   * Se a extensão mudou (JPG -> PNG), o arquivo antigo continuaria no bucket
   * sem ninguém apontando pra ele — o `upsert` só cobre o mesmo caminho.
   */
  if (atual.foto_path && atual.foto_path !== path) {
    await supabaseAdmin.storage.from('presencas').remove([atual.foto_path as string])
  }

  const { error } = await supabaseAdmin.from('veiculos').update({ foto_path: path }).eq('id', veiculoId)
  if (error) return { error: mensagemAmigavel(error) }
  auditar(acesso.perfil, 'VEICULO_FOTO_ALTERADA', { campoAlterado: `Veículo ${atual.placa ?? ''}`.trim(), eventoId, valorNovo: 'Foto nova' })
  revalidatePath('/admin/veiculos')
  return { ok: true as const }
}

/** O QR (PNG) e o link de um veículo já cadastrado, pra "Ver QR" na listagem. */
export async function qrDataUrlVeiculo(veiculoId: string, eventoId: string): Promise<{ qrDataUrl: string; link: string } | { error: string }> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }
  const { data } = await supabaseAdmin
    .from('veiculos').select('qr_token').eq('id', veiculoId).eq('evento_id', eventoId).single()
  if (!data?.qr_token) return { error: 'Este veículo ainda não tem QR gerado.' }
  return montarQrVeiculo(data.qr_token as string)
}

/** URL assinada da foto do veículo (ou da pessoa), pra exibir na lista. Bucket é privado. */
export async function urlFotoVeiculo(veiculoId: string, eventoId: string, campo: 'veiculo' | 'pessoa' = 'veiculo'): Promise<string | null> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return null
  const coluna = campo === 'pessoa' ? 'foto_pessoa_path' : 'foto_path'
  const { data } = await supabaseAdmin
    .from('veiculos').select(coluna).eq('id', veiculoId).eq('evento_id', eventoId).single()
  const path = (data as Record<string, unknown> | null)?.[coluna] as string | undefined
  if (!path) return null
  const { data: assinada } = await supabaseAdmin.storage
    .from('presencas').createSignedUrl(path, 60 * 30)
  return assinada?.signedUrl ?? null
}

/**
 * Os campos comuns entre o cadastro manual (admin) e o público (link) — o
 * condutor não precisa mais de `funcionario_id`: nome/CPF/telefone vêm
 * direto do formulário. `funcionarioId` continua opcional, preenchido só
 * quando alguém usa o atalho "buscar por CPF" (`buscarCondutorPorCpf`) e
 * confirma que é a mesma pessoa.
 */
function camposDoVeiculo(formData: FormData) {
  const placa = normalizarPlaca(String(formData.get('placa') ?? ''))
  const modelo = String(formData.get('modelo') ?? '').trim()
  const condutorNome = String(formData.get('condutor_nome') ?? '').trim()
  const condutorCpf = normalizarCpf(String(formData.get('condutor_cpf') ?? ''))
  const condutorTelefone = String(formData.get('condutor_telefone') ?? '').replace(/\D/g, '')
  const empresa = String(formData.get('empresa') ?? '').trim() || null
  const setor = String(formData.get('setor') ?? '').trim() || null
  const cor = String(formData.get('cor') ?? '').trim() || null
  const tipo = String(formData.get('tipo') ?? '').trim() || null
  const observacoes = String(formData.get('observacoes') ?? '').trim() || null
  const anoBruto = String(formData.get('ano') ?? '').trim()
  const ano = /^\d{4}$/.test(anoBruto) ? Number(anoBruto) : null
  const funcionarioId = String(formData.get('funcionario_id') ?? '').trim() || null

  if (!condutorNome || condutorNome.length < 2) throw new Error('Informe o nome completo do condutor.')
  if (!validarCpf(condutorCpf)) throw new Error('CPF do condutor inválido. Confira os números.')
  if (!condutorTelefone || condutorTelefone.length < 10) throw new Error('Informe o telefone/WhatsApp do condutor, com DDD.')
  /*
   * Placa brasileira: 7 caracteres nos dois formatos que convivem — o antigo
   * (ABC1234) e o Mercosul (ABC1D23). Valida o tamanho e o formato, não a
   * existência: conferir se a placa existe de verdade exigiria consulta ao
   * Detran, que o sistema não tem (e não vale a pena pra portaria de evento).
   */
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) {
    throw new Error('Placa inválida. Use o formato ABC1D23 (Mercosul) ou ABC1234.')
  }
  if (modelo.length < 2) throw new Error('Informe o modelo do veículo.')

  return { placa, modelo, condutorNome, condutorCpf, condutorTelefone, empresa, setor, cor, tipo, observacoes, ano, funcionarioId }
}

/** Grava dias autorizados + fotos (veículo obrigatória, pessoa opcional) de um veículo recém-criado. */
async function finalizarCadastroVeiculo(
  veiculoId: string, formData: FormData, dias: string[],
): Promise<{ error?: string }> {
  if (dias.length) {
    const { error: erroDias } = await supabaseAdmin
      .from('veiculo_dias')
      .insert(dias.map(data => ({ veiculo_id: veiculoId, data })))
    if (erroDias) return { error: mensagemAmigavel(erroDias) }
  }

  /*
   * A foto do veículo é obrigatória por regra de negócio, mas o upload
   * ainda roda DEPOIS do insert (o caminho precisa do id) e sem derrubar o
   * cadastro se a subida falhar por instabilidade — o veículo já está
   * autorizado a entrar, e dá pra reenviar a foto depois por
   * `atualizarFotoVeiculo`. A ausência do ARQUIVO em si já foi barrada
   * antes do insert, em `camposDoVeiculo`/quem chama.
   */
  try {
    const fotoPath = await subirFotoVeiculo(veiculoId, formData.get('foto'))
    if (fotoPath) await supabaseAdmin.from('veiculos').update({ foto_path: fotoPath }).eq('id', veiculoId)
  } catch (erroFoto) {
    console.error('[veiculos] falha ao subir foto do veículo', { veiculoId, erro: erroFoto })
  }
  try {
    const fotoPessoaPath = await subirFotoVeiculo(veiculoId, formData.get('foto_pessoa'), '-pessoa')
    if (fotoPessoaPath) await supabaseAdmin.from('veiculos').update({ foto_pessoa_path: fotoPessoaPath }).eq('id', veiculoId)
  } catch (erroFoto) {
    console.error('[veiculos] falha ao subir foto da pessoa', { veiculoId, erro: erroFoto })
  }

  return {}
}

export async function cadastrarVeiculo(eventoId: string, formData: FormData): Promise<
  { ok?: false; error: string } | { ok: true; id: string; placa: string; condutor: string; qrDataUrl: string }
> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }
  const perfil = acesso.perfil

  let campos: ReturnType<typeof camposDoVeiculo>
  try {
    campos = camposDoVeiculo(formData)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Confira os dados do formulário.' }
  }

  const fotoVeiculo = formData.get('foto')
  if (!(fotoVeiculo instanceof File) || fotoVeiculo.size === 0) {
    return { error: 'A foto do veículo é obrigatória.' }
  }

  const dias = formData.getAll('dias').map(String).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  const qrToken = gerarQrTokenVeiculo()

  const { data: novo, error } = await supabaseAdmin.from('veiculos').insert([{
    evento_id: eventoId,
    funcionario_id: campos.funcionarioId,
    condutor_nome: campos.condutorNome,
    condutor_cpf: campos.condutorCpf,
    condutor_telefone: campos.condutorTelefone,
    empresa: campos.empresa,
    setor: campos.setor,
    placa: campos.placa,
    modelo: campos.modelo,
    ano: campos.ano,
    cor: campos.cor,
    tipo: campos.tipo,
    observacoes: campos.observacoes,
    tipo_cadastro: 'manual',
    status: 'ativo',
    qr_token: qrToken,
    criado_por_perfil_id: perfil.id,
  }]).select('id').single()

  if (error) {
    // O índice único (evento_id, placa) é o que barra a duplicidade; aqui só
    // se troca o erro cru do Postgres por algo que diga o que fazer.
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `A placa ${campos.placa} já está cadastrada neste evento.` }
    }
    return { error: mensagemAmigavel(error) }
  }

  const { error: erroFinal } = await finalizarCadastroVeiculo(novo.id, formData, dias)
  if (erroFinal) return { error: erroFinal }

  after(() => agendarConfirmacaoVeiculo({
    eventoId, veiculoId: novo.id, telefone: campos.condutorTelefone,
  }).catch(console.error))

  const { qrDataUrl } = await montarQrVeiculo(qrToken)

  auditar(perfil, 'VEICULO_CADASTRADO', { campoAlterado: 'Veículo', eventoId, valorNovo: curto(`${campos.placa} · condutor ${campos.condutorNome}`) })
  revalidatePath('/admin/veiculos')
  return { ok: true as const, id: novo.id as string, placa: campos.placa, condutor: campos.condutorNome, qrDataUrl }
}

// ─── Cadastro público de veículo (link, sem sessão) ──────────────────────────

/**
 * Confere se um link de cadastro de veículo está de pé — mesma checagem que
 * `cadastrarVeiculoPublico` faz, exposta à parte pra a PÁGINA (Server
 * Component, sem sessão) decidir o que mostrar antes mesmo de abrir o
 * formulário.
 */
export async function linkVeiculoValido(token: string): Promise<
  { ok: true; eventoId: string; eventoNome: string; tipo: string } | { ok: false }
> {
  const { data } = await supabaseAdmin
    .from('veiculo_links')
    .select('evento_id, tipo, ativo, eventos(nome)')
    .eq('token', token)
    .maybeSingle()
  if (!data || data.ativo === false) return { ok: false }
  const evento = data.eventos as unknown as { nome: string } | { nome: string }[] | null
  const eventoNome = (Array.isArray(evento) ? evento[0]?.nome : evento?.nome) ?? ''
  return { ok: true, eventoId: data.evento_id as string, eventoNome, tipo: tipoCadastroValido(data.tipo as string) }
}

/**
 * Cadastro de veículo pelo LINK PÚBLICO — sem `getPerfil()`, chamado direto
 * pelo wizard no navegador de quem nunca logou no sistema.
 *
 * Nasce `pendente`: diferente do cadastro manual (feito por quem já está na
 * produção, vendo a pessoa e o veículo), aqui é a própria pessoa se
 * cadastrando sozinha — o QR só passa a valer pra entrar depois que um
 * master/admin/suporte aprova (`alterarStatusVeiculo`). Decisão do Juan,
 * 23/09/2026.
 */
export async function cadastrarVeiculoPublico(token: string, formData: FormData): Promise<
  { ok?: false; error: string } | { ok: true; qrToken: string }
> {
  const link = await linkVeiculoValido(token)
  if (!link.ok) return { error: 'Este link não está mais disponível. Fale com quem te enviou.' }

  // Chave por TOKEN, não por IP — mesmo motivo de cadastrarFuncionarioPublico:
  // IP em serverless atrás de CDN não é confiável.
  if (!await podePassar(`veiculo-link:${token}`, 30, 60 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas por aqui. Aguarde um pouco e tente de novo.' }
  }

  let campos: ReturnType<typeof camposDoVeiculo>
  try {
    campos = camposDoVeiculo(formData)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Confira os dados do formulário.' }
  }

  const fotoVeiculo = formData.get('foto')
  if (!(fotoVeiculo instanceof File) || fotoVeiculo.size === 0) {
    return { error: 'A foto do veículo é obrigatória.' }
  }

  const qrToken = gerarQrTokenVeiculo()

  const { data: novo, error } = await supabaseAdmin.from('veiculos').insert([{
    evento_id: link.eventoId,
    condutor_nome: campos.condutorNome,
    condutor_cpf: campos.condutorCpf,
    condutor_telefone: campos.condutorTelefone,
    empresa: campos.empresa,
    setor: campos.setor,
    placa: campos.placa,
    modelo: campos.modelo,
    ano: campos.ano,
    cor: campos.cor,
    tipo: campos.tipo,
    observacoes: campos.observacoes,
    tipo_cadastro: link.tipo,
    status: 'pendente',
    qr_token: qrToken,
  }]).select('id').single()

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `A placa ${campos.placa} já está cadastrada neste evento.` }
    }
    return { error: mensagemAmigavel(error) }
  }

  const { error: erroFinal } = await finalizarCadastroVeiculo(novo.id, formData, [])
  if (erroFinal) return { error: erroFinal }

  after(() => agendarConfirmacaoVeiculo({
    eventoId: link.eventoId, veiculoId: novo.id, telefone: campos.condutorTelefone,
  }).catch(console.error))

  // Sem login: quem cadastrou é o próprio condutor, pelo link público.
  auditar({ id: null, nome: `${campos.condutorNome} (pelo link de veículos)` }, 'VEICULO_CADASTRADO', {
    campoAlterado: 'Veículo', eventoId: link.eventoId, valorNovo: curto(`${campos.placa} · condutor ${campos.condutorNome}`),
  })
  return { ok: true as const, qrToken }
}

/** Aprova (`pendente`→`ativo`), bloqueia ou cancela um veículo. */
export async function alterarStatusVeiculo(veiculoId: string, eventoId: string, novoStatus: string): Promise<
  { ok?: false; error: string } | { ok: true; status: StatusVeiculo }
> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }

  const status = statusVeiculoValido(novoStatus)
  const { data: antesDoVeiculo } = await supabaseAdmin.from('veiculos').select('placa, status').eq('id', veiculoId).maybeSingle()
  const { error } = await supabaseAdmin
    .from('veiculos').update({ status }).eq('id', veiculoId).eq('evento_id', eventoId)
  if (error) return { error: mensagemAmigavel(error) }
  auditar(acesso.perfil, 'VEICULO_STATUS_ALTERADO', {
    campoAlterado: `Veículo ${antesDoVeiculo?.placa ?? ''}`.trim(), eventoId,
    valorAnterior: (antesDoVeiculo?.status as string | null) ?? null, valorNovo: status,
  })

  revalidatePath('/admin/veiculos')
  return { ok: true as const, status }
}

// ─── Links de cadastro de veículo (colaborador / lounge) ─────────────────────

/** Cria (ou devolve) o link estável do tipo pedido, e liga/desliga com `ativo`. */
export async function criarOuRegenerarLinkVeiculo(eventoId: string, tipo: string, regenerar = false): Promise<
  { ok?: false; error: string } | { ok: true; token: string }
> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }

  const { data: existente } = await supabaseAdmin
    .from('veiculo_links').select('id, token').eq('evento_id', eventoId).eq('tipo', tipo).maybeSingle()

  const token = (!existente || regenerar) ? randomBytes(20).toString('base64url') : (existente.token as string)

  const { error } = existente
    ? await supabaseAdmin.from('veiculo_links').update({ token, ativo: true }).eq('id', existente.id)
    : await supabaseAdmin.from('veiculo_links').insert({
        evento_id: eventoId, tipo, token, ativo: true, criado_por_perfil_id: acesso.perfil.id,
      })
  if (error) return { error: mensagemAmigavel(error) }
  auditar(acesso.perfil, 'VEICULO_LINK_ALTERADO', {
    campoAlterado: `Link de veículos (${tipo})`, eventoId,
    valorNovo: !existente ? 'Link criado' : regenerar ? 'Endereço novo (o antigo deixa de funcionar)' : 'Link reaberto',
  })

  revalidatePath('/admin/veiculos')
  return { ok: true as const, token }
}

export async function alternarLinkVeiculo(eventoId: string, tipo: string, ativo: boolean): Promise<
  { ok?: false; error: string } | { ok: true }
> {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }

  const { error } = await supabaseAdmin
    .from('veiculo_links').update({ ativo }).eq('evento_id', eventoId).eq('tipo', tipo)
  if (error) return { error: mensagemAmigavel(error) }
  auditar(acesso.perfil, 'VEICULO_LINK_ALTERADO', { campoAlterado: `Link de veículos (${tipo})`, eventoId, valorNovo: ativo ? 'Aberto' : 'Fechado' })

  revalidatePath('/admin/veiculos')
  return { ok: true as const }
}

/** Os links já criados pra este evento, pra tela mostrar o que já existe. */
export async function linksDeVeiculoDoEvento(eventoId: string) {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return []
  const { data } = await supabaseAdmin
    .from('veiculo_links').select('tipo, token, ativo').eq('evento_id', eventoId)
  return (data ?? []) as { tipo: string; token: string; ativo: boolean }[]
}

export async function excluirVeiculo(veiculoId: string, eventoId: string) {
  const acesso = await exigirAcessoAVeiculos(eventoId)
  if (acesso.error) return { error: acesso.error }
  const { data: veiculoExcluido } = await supabaseAdmin.from('veiculos').select('placa, condutor_nome').eq('id', veiculoId).maybeSingle()
  const { error } = await supabaseAdmin.from('veiculos').delete().eq('id', veiculoId).eq('evento_id', eventoId)
  if (error) return { error: mensagemAmigavel(error) }
  auditar(acesso.perfil, 'VEICULO_EXCLUIDO', {
    campoAlterado: 'Veículo', eventoId, valorAnterior: curto(`${veiculoExcluido?.placa ?? veiculoId}${veiculoExcluido?.condutor_nome ? ` · condutor ${veiculoExcluido.condutor_nome}` : ''}`),
  })
  revalidatePath('/admin/veiculos')
  return { ok: true as const }
}

/**
 * O QR do veículo não é um crachá — não é `c2/c3/c4` assinado, é um link
 * opaco (`/veiculo/{token}`, ver `lib/actions.ts::montarQrVeiculo`). Não passa
 * por `lerCodigoQR`; a leitura é achar o `qr_token` na URL escaneada.
 */
function extrairQrTokenDeVeiculo(bruto: string): string | null {
  const m = (bruto ?? '').match(/\/veiculo\/([A-Za-z0-9_-]{10,})/)
  return m?.[1] ?? null
}

/**
 * Confere um veículo pelo mesmo scanner que lê o crachá do funcionário
 * (`app/scan/ScannerView.tsx`) — pedido do Juan (24/09/2026): quem está no
 * portão não pode precisar de uma tela separada pra cada tipo de QR.
 *
 * Usa `podeEscanear`, a MESMA guarda de `registrarPresencaQR` — não
 * `exigirAcessoAVeiculos` (essa é pra CADASTRAR/gerenciar veículo, mais
 * restrita; conferir na portaria é operação de quem já escaneia crachá).
 *
 * Não registra nada (veículo não bate ponto, ver upgrade-veiculos.sql) — só
 * diz se pode entrar, igual a página pública `/veiculo/[token]`.
 */
export async function conferirVeiculoPorQR(eventoId: string, qrData: string): Promise<ResultadoScan> {
  // Mesmo tratamento de `registrarPresencaQR`: nunca lança e vai pro histórico.
  let resultado: ResultadoScan
  try {
    resultado = await validarVeiculoPorQR(eventoId, qrData)
  } catch (e) {
    console.error('[conferirVeiculoPorQR]', e)
    resultado = { success: false, message: 'Não foi possível validar agora. Leia o QR de novo.' }
  }
  const perfilId = ((await getPerfil().catch(() => null))?.id as string | undefined) ?? null
  const final = resultado
  after(() => gravarLeituraQR({ eventoId, perfilId, tipo: 'veiculo', qrData, resultado: final }))
  return resultado
}

async function validarVeiculoPorQR(eventoId: string, qrData: string): Promise<ResultadoScan> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil)) return { success: false, message: 'Sem permissão' }
  // O supervisor escaneia a própria equipe; veículo é do evento inteiro e
  // continua com o credenciamento (quem cadastra veículo também não é ele).
  if (perfil.role === 'supervisor') {
    return { success: false, message: 'Veículo é liberado pelo credenciamento do evento, não pelo supervisor.' }
  }

  const token = extrairQrTokenDeVeiculo(qrData)
  if (!token) return { success: false, message: 'QR Code fora do padrão.', qrInvalido: true }

  const { data } = await supabaseAdmin
    .from('veiculos')
    .select('id, placa, modelo, condutor_nome, status, evento_id, funcionario_id, funcionarios(nome), eventos(organizacao_id)')
    .eq('qr_token', token)
    .maybeSingle()
  if (!data) return { success: false, message: 'Veículo não encontrado.' }
  // Mesmo cuidado de exigirAcessoAVeiculos: o QR é de OUTRO evento não vale aqui.
  if (data.evento_id !== eventoId) return { success: false, message: 'Este veículo não é deste evento.' }

  const condutor = data.funcionarios as unknown as { nome: string } | { nome: string }[] | null
  const condutorNome =
    (data.condutor_nome as string | null)
    ?? (Array.isArray(condutor) ? condutor[0]?.nome : condutor?.nome)
    ?? 'Não informado'
  const veiculo = { placa: data.placa as string, modelo: data.modelo as string, condutorNome }
  const status = statusVeiculoValido(data.status as string)

  if (status !== 'ativo') {
    const motivo = status === 'pendente' ? 'Cadastro pendente de aprovação'
      : status === 'bloqueado' ? 'Veículo bloqueado'
      : 'Cadastro cancelado'
    return { success: false, message: motivo, veiculo }
  }

  const agora = new Date().toISOString()
  await supabaseAdmin.from('veiculo_entradas').insert([{
    veiculo_id: data.id as string, evento_id: eventoId, liberado_por_perfil_id: perfil.id,
  }])

  const eventoRel = data.eventos as unknown as { organizacao_id: string | null } | { organizacao_id: string | null }[] | null
  const organizacaoId = (Array.isArray(eventoRel) ? eventoRel[0]?.organizacao_id : eventoRel?.organizacao_id) ?? undefined
  after(() => registrarAuditoria({
    perfil, acao: 'ENTRADA_VEICULO_LIBERADA', eventoId, organizacaoId,
    funcionarioId: (data.funcionario_id as string | null) ?? undefined,
    campoAlterado: 'Entrada de veículo liberada',
    valorNovo: `${veiculo.placa} — ${veiculo.condutorNome} às ${formatarBR(agora, 'hora')}`,
  }))

  revalidatePath(`/veiculo/${token}`)
  revalidatePath('/admin/veiculos')

  return { success: true, message: 'Pode entrar', veiculo: { ...veiculo, entradaLiberadaEm: agora } }
}

// ─── Permissões por organização (tela de Configurações) ──────────────────────

export type PermissaoSalva = { organizacaoId: string | null; role: string; chave: string; permitido: boolean }

/**
 * As exceções gravadas — só o que foge do padrão do código.
 *
 * `organizacaoId` nulo pede o padrão da PLATAFORMA. Só o master consulta e
 * grava: é a tela que decide quem pode o quê, e deixá-la editável por quem é
 * afetado por ela seria dar a chave junto com a fechadura.
 */
export async function obterPermissoes(organizacaoId: string | null): Promise<PermissaoSalva[]> {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) return []

  let consulta = supabaseAdmin.from('permissoes_organizacao').select('organizacao_id, role, chave, permitido')
  consulta = organizacaoId ? consulta.eq('organizacao_id', organizacaoId) : consulta.is('organizacao_id', null)

  const { data, error } = await consulta
  if (error) {
    console.error('[obterPermissoes] consulta falhou (migração pendente?):', error.message)
    return []
  }
  return (data ?? []).map(p => ({
    organizacaoId: (p.organizacao_id as string | null) ?? null,
    role: p.role as string,
    chave: p.chave as string,
    permitido: p.permitido as boolean,
  }))
}

/**
 * Liga, desliga ou devolve ao padrão uma permissão.
 *
 * `permitido: null` APAGA a linha — e apagar é como se volta ao padrão do
 * código. Sem esse caminho, "voltar ao normal" viraria adivinhar qual era o
 * padrão e gravá-lo à mão, que é a receita pra tabela e código divergirem em
 * silêncio no dia em que a regra do código mudar.
 */
export async function salvarPermissao(
  organizacaoId: string | null, role: string, chave: string, permitido: boolean | null,
) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) return { error: 'Apenas o master altera permissões.' }

  // Duas travas de sanidade: papel e chave têm que existir no catálogo. Sem
  // isso, um valor colado na chamada criaria uma linha que nenhuma tela
  // mostra e ninguém consegue mais desfazer pela interface.
  if (!PAPEIS_CONFIGURAVEIS.includes(role as Role)) {
    return { error: 'Este tipo de acesso não é configurável.' }
  }
  if (!CAPACIDADES.some(c => c.chave === chave)) return { error: 'Permissão desconhecida.' }

  if (permitido === null) {
    let del = supabaseAdmin.from('permissoes_organizacao').delete().eq('role', role).eq('chave', chave)
    del = organizacaoId ? del.eq('organizacao_id', organizacaoId) : del.is('organizacao_id', null)
    const { error } = await del
    if (error) return { error: mensagemAmigavel(error) }
  } else {
    /*
     * Sem `upsert`: o índice único usa `coalesce(organizacao_id, ...)`, e o
     * PostgREST não sabe casar `on conflict` com índice de expressão. Apagar
     * e inserir dá no mesmo aqui — a linha não guarda histórico, e quem
     * precisa dele é a auditoria abaixo.
     */
    let del = supabaseAdmin.from('permissoes_organizacao').delete().eq('role', role).eq('chave', chave)
    del = organizacaoId ? del.eq('organizacao_id', organizacaoId) : del.is('organizacao_id', null)
    await del

    const { error } = await supabaseAdmin.from('permissoes_organizacao').insert([{
      organizacao_id: organizacaoId,
      role, chave, permitido,
      atualizado_por: perfil!.id,
    }])
    if (error) {
      if (/permissoes_organizacao/.test(error.message)) {
        return { error: 'A tabela de permissões ainda não existe no banco. Rode supabase/upgrade-permissoes.sql.' }
      }
      return { error: mensagemAmigavel(error) }
    }
  }
  const capacidade = CAPACIDADES.find(c => c.chave === chave)
  after(() => registrarAuditoria({
    perfil: perfil!,
    acao: 'ALTERACAO_PERMISSAO',
    campoAlterado: `${ROLE_LABELS[role as Role] ?? role} · ${capacidade?.nome ?? chave}`,
    valorNovo: permitido === null ? 'Voltou ao padrão do sistema' : permitido ? 'Liberado' : 'Bloqueado',
    organizacaoId: organizacaoId ?? undefined,
  }))

  /*
   * Toda tela: a permissão muda o menu lateral e os botões de qualquer
   * página, não só desta. `layout` limpa a árvore inteira do admin.
   */
  revalidatePath('/admin', 'layout')
  return { ok: true as const }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONALIDADE DO SISTEMA — liga/desliga por organização (pedido do Vital,
// 30/09/2026). Diferente de `permissoes_organizacao` (que é sobre QUEM PODE
// FAZER O QUÊ), isto é sobre QUAIS RECURSOS EXISTEM pra aquele cliente —
// subeventos e trava de cota nascem desligados, e só aparecem na tela de quem
// ligou. A maioria dos clientes nunca vê nada disto.
// ═══════════════════════════════════════════════════════════════════════════

export type FuncionalidadesOrganizacao = {
  subeventosHabilitado: boolean
  travaCotaHabilitada: boolean
  /** Item 4 do pedido do Vital — libera o campo de aviso de uniforme/identificação em Editar evento. */
  avisoUniformeHabilitado: boolean
  /**
   * Funcionário escolhe os dias de trabalho no formulário, e o QR só vale nos
   * dias que o supervisor aprovar (lib/escala.ts). Por enquanto só age em
   * evento de subeventos — ver `eventoUsaEscalaPorDia`.
   */
  escalaPorDiaHabilitada: boolean
  /**
   * O supervisor pode delegar a CONSULTA do setor a alguém da equipe
   * (Encarregado — lib/encarregado.ts). Nasce desligado.
   */
  encarregadosHabilitado: boolean
  /**
   * O leitor de QR pede a ÁREA (subevento) de quem vai atuar e recusa credencial
   * de outra área ("ÁREA DIFERENTE"). Nasce desligado: o leitor só lê a câmera e
   * registra quem entra (pedido do Juan, 08/10/2026 — dias de entrada única).
   */
  areaNoScannerHabilitada: boolean
}

/**
 * Marcar "Este evento possui subeventos" (em criarEvento/editarEvento) liga
 * o recurso pra organização INTEIRA sozinho (Vital, 01/10/2026, 2ª volta —
 * "faz mais sentido" não exigir passar por Configurações antes de usar).
 * Só ACENDE, nunca apaga: desligar num evento específico não deveria tirar
 * o recurso de outro evento da mesma organização que também o use.
 */
async function garantirSubeventosHabilitadoNaOrg(organizacaoId: string | null) {
  if (!organizacaoId) return
  try {
    await supabaseAdmin.from('organizacoes').update({ subeventos_habilitado: true }).eq('id', organizacaoId)
  } catch (e) { console.error('[garantirSubeventosHabilitadoNaOrg] não gravado (migração pendente?)', e) }
}

// `obterFuncionalidadesOrganizacao` mora em lib/internos-servidor.ts: função de servidor SEM login, que não pode ser endpoint público.

/**
 * "Configurações" DENTRO do evento (pedido do Juan, 09/10/2026): as mesmas opções de Configurações →
 * Funcionalidades, valendo só para ESTE evento (`eventos.funcionalidades`, upgrade-funcionalidades-por-evento.sql).
 * Grava as 6 de uma vez — salvo aqui, o evento deixa de seguir a organização até `seguirOrganizacaoNoEvento`.
 * Master-only, como a tela da organização. Erro como valor (o Next esconde exceção em produção).
 */
export async function editarFuncionalidadesDoEvento(eventoId: string, formData: FormData): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !ehMaster(perfil.role)) return { erro: 'Apenas o master altera as configurações do evento.' }
    const { data: ev } = await supabaseAdmin.from('eventos').select('*').eq('id', eventoId).maybeSingle()
    if (!ev) return { erro: 'Evento não encontrado.' }

    const novas = Object.fromEntries(Object.keys(CHAVES_FUNCIONALIDADES).map(coluna => [coluna, formData.get(coluna) === 'on']))
    const { error } = await supabaseAdmin.from('eventos').update({ funcionalidades: novas }).eq('id', eventoId)
    if (error) {
      return /funcionalidades/.test(error.message)
        ? { erro: 'O banco ainda não tem o campo das configurações por evento. Rode supabase/upgrade-funcionalidades-por-evento.sql no SQL Editor do Supabase.' }
        : { erro: mensagemAmigavel(error) }
    }
    const antes = (ev as { funcionalidades?: Record<string, boolean> | null }).funcionalidades ?? null
    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_FUNCIONALIDADE', campoAlterado: `Configurações do evento ${(ev as { nome?: string }).nome ?? ''}`.trim(),
      valorAnterior: antes ? JSON.stringify(antes) : 'Seguia a organização', valorNovo: JSON.stringify(novas),
      eventoId, organizacaoId: ((ev as { organizacao_id?: string | null }).organizacao_id ?? undefined) || undefined,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`, 'layout')
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Apaga a configuração própria do evento: ele volta a seguir Configurações → Funcionalidades da organização. */
export async function seguirOrganizacaoNoEvento(eventoId: string): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !ehMaster(perfil.role)) return { erro: 'Apenas o master altera as configurações do evento.' }
    const { data: ev } = await supabaseAdmin.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).maybeSingle()
    if (!ev) return { erro: 'Evento não encontrado.' }
    const { error } = await supabaseAdmin.from('eventos').update({ funcionalidades: null }).eq('id', eventoId)
    if (error) return { erro: mensagemAmigavel(error) }
    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_FUNCIONALIDADE', campoAlterado: `Configurações do evento ${ev.nome as string}`,
      valorNovo: 'Volta a seguir a organização', eventoId, organizacaoId: (ev.organizacao_id as string | null) ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`, 'layout')
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Master-only — mesmo guard da tela de Configurações. */
export async function editarFuncionalidadesOrganizacao(organizacaoId: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) throw new Error('Apenas o master altera funcionalidades do sistema.')

  const basicas = {
    subeventos_habilitado: formData.get('subeventos_habilitado') === 'on',
    trava_cota_habilitada: formData.get('trava_cota_habilitada') === 'on',
    aviso_uniforme_habilitado: formData.get('aviso_uniforme_habilitado') === 'on',
  }
  const escalaLigada = formData.get('escala_por_dia_habilitada') === 'on'
  const encarregadosLigados = formData.get('encarregados_habilitado') === 'on'
  const areaNoScannerLigada = formData.get('area_no_scanner_habilitada') === 'on'

  // O valor de antes, só pra auditar a MUDANÇA (ligar/desligar Encarregados muda quem pode dar acesso).
  const { data: antes } = await supabaseAdmin.from('organizacoes').select('*').eq('id', organizacaoId).maybeSingle()
  const encarregadosAntes = (antes as { encarregados_habilitado?: boolean } | null)?.encarregados_habilitado === true
  const areaNoScannerAntes = (antes as { area_no_scanner_habilitada?: boolean } | null)?.area_no_scanner_habilitada === true

  // À parte, como as outras colunas novas: migração pendente (upgrade-area-no-scanner.sql) não pode impedir o resto de salvar.
  const { error: erroAreaScanner } = await supabaseAdmin.from('organizacoes')
    .update({ area_no_scanner_habilitada: areaNoScannerLigada }).eq('id', organizacaoId)

  // Colunas das funcionalidades mais novas: gravadas à parte, pra uma migração
  // pendente (upgrade-encarregado.sql) nunca impedir o resto de salvar.
  const { error: erroEncarregados } = await supabaseAdmin.from('organizacoes')
    .update({ encarregados_habilitado: encarregadosLigados }).eq('id', organizacaoId)

  // Uma gravação só. Se a coluna nova ainda não existe (upgrade-escala-por-dia.sql
  // pendente), cai pra gravar só as de sempre — o resto não pode deixar de salvar.
  const { error } = await supabaseAdmin.from('organizacoes')
    .update({ ...basicas, escala_por_dia_habilitada: escalaLigada }).eq('id', organizacaoId)
  if (error) {
    const { error: erroBasicas } = await supabaseAdmin.from('organizacoes').update(basicas).eq('id', organizacaoId)
    if (erroBasicas) throw new Error(mensagemAmigavel(erroBasicas))
    if (escalaLigada) {
      throw new Error('Os outros itens foram salvos, mas "Dias de trabalho" ainda precisa da atualização do banco (upgrade-escala-por-dia.sql).')
    }
  }
  if (!erroEncarregados && encarregadosAntes !== encarregadosLigados) {
    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_FUNCIONALIDADE', campoAlterado: 'Permitir criação de Encarregados',
      valorAnterior: encarregadosAntes ? 'Ativado' : 'Desativado', valorNovo: encarregadosLigados ? 'Ativado' : 'Desativado',
      organizacaoId,
    }))
  }
  if (!erroAreaScanner && areaNoScannerAntes !== areaNoScannerLigada) {
    after(() => registrarAuditoria({
      perfil, acao: 'ALTERACAO_FUNCIONALIDADE', campoAlterado: 'Selecionar a área no leitor',
      valorAnterior: areaNoScannerAntes ? 'Ativado' : 'Desativado', valorNovo: areaNoScannerLigada ? 'Ativado' : 'Desativado',
      organizacaoId,
    }))
  }
  if (erroAreaScanner && areaNoScannerLigada) {
    throw new Error('Os outros itens foram salvos, mas "Selecionar a área no leitor" ainda precisa da atualização do banco (upgrade-area-no-scanner.sql).')
  }
  if (erroEncarregados && encarregadosLigados) {
    throw new Error('Os outros itens foram salvos, mas "Encarregados" ainda precisa da atualização do banco (upgrade-encarregado.sql).')
  }

  revalidatePath('/admin/configuracoes')
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAÇÃO DE ESTRUTURA — a planilha que monta o evento de uma vez:
// Fornecedor | Subgrupo (área) | Trava por dia | Supervisor (nome, CPF, tel).
// As regras (o que cada linha vira, o que está errado) estão em
// lib/estrutura-regras.ts; aqui só se lê o banco e grava, linha por linha,
// pela MESMA `criarFornecedorOuLanca` da tela — supervisor pelo CPF, um
// acesso só, mensagem de acesso uma vez por evento.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_LINHAS_ESTRUTURA = 500

/** Quem importa estrutura cria fornecedor E supervisor — a régua de quem cria acesso. */
async function exigirImportadorDeEstrutura(eventoId: string) {
  const perfil = await exigirEventoDaOrg(eventoId)
  if (!podeGerenciarUsuarios(perfil) && perfil.role !== 'suporte') {
    throw new Error('Importar a estrutura cria supervisores — só quem cria acessos pode fazer isso.')
  }
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, nome, tem_subeventos').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')
  if ((evento as { tem_subeventos?: boolean }).tem_subeventos !== true) {
    throw new Error('Este evento não usa subeventos. Ligue "Este evento possui subeventos" em Editar evento antes de importar.')
  }
  return { perfil, evento: evento as { id: string; nome: string } }
}

/** O banco do jeito que a prévia precisa: áreas, fornecedores, quem já tem acesso, dias do evento. */
async function contextoDaEstrutura(eventoId: string, linhas: LinhaEstrutura[]): Promise<ContextoEstrutura> {
  const cpfs = [...new Set(linhas.map(l => normalizarCpfPlanilha(l.supervisorCpf)).filter(c => c.length === 11))]
  const [subeventos, fornecedores, dias, acessos] = await Promise.all([
    supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId).then(r => r.data ?? []),
    buscarTudo((de, ate) => supabaseAdmin.from('fornecedores').select('id, nome, subevento_id')
      .eq('evento_id', eventoId).order('id').range(de, ate)),
    diasDaEscalaDoEvento(eventoId).then(d => d.map(x => x.data)),
    (async () => {
      const mapa = new Map<string, { nome: string; role: string }>()
      for (const lote of emLotes(cpfs, 200)) {
        const { data } = await supabaseAdmin.from('perfis').select('cpf, nome, role').in('cpf', lote)
        for (const p of data ?? []) mapa.set(p.cpf as string, { nome: p.nome as string, role: p.role as string })
      }
      return mapa
    })(),
  ])
  return {
    dias,
    subeventos: subeventos as { id: string; nome: string }[],
    fornecedores: fornecedores as { id: string; nome: string; subevento_id: string | null }[],
    acessos,
    validarCpf,
  }
}

/** A PRÉVIA: o que vai ser criado, o que já existe e o que está errado — nada é gravado. */
export async function previaImportacaoEstrutura(eventoId: string, linhas: LinhaEstrutura[], decisoes: DecisoesEstrutura = {}): Promise<
  { ok?: false; error: string } | { ok: true; plano: PlanoEstrutura; eventoNome: string }
> {
  try {
    const { evento } = await exigirImportadorDeEstrutura(eventoId)
    if (!linhas.length) return { error: 'A planilha não tem nenhuma linha.' }
    if (linhas.length > MAX_LINHAS_ESTRUTURA) return { error: `A planilha tem ${linhas.length} linhas — o máximo por importação é ${MAX_LINHAS_ESTRUTURA}.` }
    const plano = await aplicarTravasNaEstrutura(eventoId, planejarEstrutura(linhas, await contextoDaEstrutura(eventoId, linhas), decisoes))
    return { ok: true, plano, eventoNome: evento.nome }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * GRAVA as linhas `apenas` (números de linha) da planilha — a tela manda em
 * levas pequenas e mostra o andamento; nenhuma chamada passa do tempo da
 * função mesmo com centenas de linhas.
 *
 * A planilha INTEIRA vem junto em toda leva: duplicidade (mesmo setor duas
 * vezes, mesmo CPF com dois nomes) só se vê olhando tudo. E o banco é relido
 * a cada leva — o que a leva anterior criou já conta como "existe", que é o
 * que torna repetir a importação (ou retomar uma que caiu) seguro.
 */
export async function importarEstruturaLote(eventoId: string, linhas: LinhaEstrutura[], apenas: number[], decisoes: DecisoesEstrutura = {}): Promise<
  { ok?: false; error: string } | { ok: true; resultados: ResultadoLinhaEstrutura[] }
> {
  try {
    const { perfil } = await exigirImportadorDeEstrutura(eventoId)
    if (linhas.length > MAX_LINHAS_ESTRUTURA) return { error: `Máximo de ${MAX_LINHAS_ESTRUTURA} linhas por importação.` }
    const alvo = new Set(apenas.slice(0, 20))
    const plano = await aplicarTravasNaEstrutura(eventoId, planejarEstrutura(linhas, await contextoDaEstrutura(eventoId, linhas), decisoes))

    const resultados: ResultadoLinhaEstrutura[] = []
    for (const l of plano.linhas.filter(x => alvo.has(x.linha))) {
      if (l.acao === 'erro') {
        resultados.push({ linha: l.linha, acao: 'erro', erro: l.erros.join(' ') })
        continue
      }
      try {
        resultados.push(await gravarLinhaEstrutura(eventoId, l))
      } catch (e) {
        resultados.push({ linha: l.linha, acao: 'erro', erro: mensagemAmigavel(e) })
      }
    }
    // Um resumo por leva (cada fornecedor NOVO já gravou a própria linha SETOR_CRIADO, com o supervisor).
    if (resultados.length) {
      const conta = (a: string) => resultados.filter(r => r.acao === a).length
      auditar(perfil, 'ESTRUTURA_IMPORTADA', {
        campoAlterado: 'Planilha de estrutura', eventoId,
        valorNovo: `Linhas ${resultados.map(r => r.linha).join(', ')}: ${conta('criado')} criada(s), ${conta('atualizado')} atualizada(s), ${conta('erro')} com erro`,
      })
    }
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true, resultados }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * As travas de cadastro valem para a planilha de estrutura também (Juan, 09/10/2026: "travar o cadastro de
 * funcionários e de setores por meio do link ou planilha"). Evento travado → nenhuma linha entra; subgrupo
 * travado → as linhas dele não entram (nem setor novo, nem supervisor novo); fornecedor com o link desligado →
 * a linha que mexeria nele não entra. Vira erro na PRÉVIA, linha por linha, e é refeito na gravação.
 */
async function aplicarTravasNaEstrutura(eventoId: string, plano: PlanoEstrutura): Promise<PlanoEstrutura> {
  const travas = await travasDeCadastroDoEvento(eventoId)
  if (!travas.evento && !travas.subgrupos.size && !travas.fornecedores.size) return plano
  const { data: desligados } = travas.fornecedores.size
    ? await supabaseAdmin.from('fornecedores').select('id, nome, subevento_id').in('id', [...travas.fornecedores])
    : { data: [] as { id: string; nome: string; subevento_id: string | null }[] }

  const linhas = plano.linhas.map(l => {
    if (l.acao === 'erro') return l
    const motivo = travas.evento
      ? 'O cadastro deste evento está travado.'
      : l.subeventoId && travas.subgrupos.has(l.subeventoId)
        ? `O subgrupo ${l.subgrupoUsado} está com o cadastro travado.`
        : l.acao === 'atualizar' && (desligados ?? []).some(f => f.subevento_id === l.subeventoId && mesmoNome(f.nome as string, l.fornecedor))
          ? `O fornecedor ${l.fornecedor} está com o link desligado (cadastro travado).`
          : null
    return motivo ? { ...l, acao: 'erro' as const, erros: [...l.erros, motivo] } : l
  })
  const validas = linhas.filter(l => l.acao !== 'erro')
  return {
    ...plano,
    linhas,
    contagens: {
      ...plano.contagens,
      fornecedoresCriar: validas.filter(l => l.acao === 'criar').length,
      fornecedoresAtualizar: validas.filter(l => l.acao === 'atualizar').length,
      linhasComErro: linhas.length - validas.length,
    },
  }
}

async function gravarLinhaEstrutura(
  eventoId: string, l: LinhaPlanejada,
): Promise<ResultadoLinhaEstrutura> {
  // 1. A área (subevento). A prévia já decidiu: `subeventoId` é a existente
  //    (nome igual, escrito de outro jeito, ou parecido que a pessoa aceitou).
  //    Sem id é área NOVA — mas relê o banco antes de criar: a leva anterior
  //    pode ter acabado de criar essa mesma área (mesmo nome, outra linha), e
  //    foi assim que apareceram áreas duplicadas no Vital.
  let subeventoId = l.subeventoId
  if (!subeventoId) {
    const { data: atuais } = await supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId)
    subeventoId = (atuais ?? []).find(s => mesmoNome(s.nome as string, l.subgrupoUsado))?.id as string | undefined ?? null
    if (!subeventoId) {
      const { data, error } = await supabaseAdmin.from('subeventos')
        .insert([{ evento_id: eventoId, nome: nomeEmMaiusculo(l.subgrupoUsado) }]).select('id').single()
      if (error || !data) throw new Error(`Não consegui criar a área "${l.subgrupoUsado}".`)
      subeventoId = data.id as string
    }
  }

  // 2. O fornecedor dentro da área — pelo nome, sem diferenciar caixa/acento.
  const teto = maiorTrava(l.travaPorDia)
  const acharFornecedor = async () => {
    const { data } = await supabaseAdmin.from('fornecedores').select('id, nome')
      .eq('evento_id', eventoId).eq('subevento_id', subeventoId)
    return (data ?? []).find(f => mesmoNome(f.nome as string, l.fornecedor))?.id as string | undefined
  }
  const dadosSupervisor = new FormData()
  dadosSupervisor.set('nome', l.supervisor.nome)
  dadosSupervisor.set('cpf', l.supervisor.cpf)
  dadosSupervisor.set('telefone', l.supervisor.telefone)

  let fornecedorId = await acharFornecedor()
  let acao: 'criado' | 'atualizado'
  if (!fornecedorId) {
    // A MESMA criação da tela: valida, cria, liga o supervisor pelo CPF e
    // desfaz o fornecedor se o supervisor falhar.
    const fd = new FormData()
    fd.set('nome', nomeEmMaiusculo(l.fornecedor))
    fd.set('subevento_id', subeventoId)
    if (teto) fd.set('quantidade_estimada', String(teto))
    fd.set('supervisor_nome', l.supervisor.nome)
    fd.set('supervisor_cpf', l.supervisor.cpf)
    fd.set('supervisor_telefone', l.supervisor.telefone)
    await criarFornecedorOuLanca(eventoId, fd)
    fornecedorId = await acharFornecedor()
    if (!fornecedorId) throw new Error('O fornecedor foi criado, mas não consegui confirmar a área dele. Confira na tela do evento.')
    acao = 'criado'
  } else {
    // Já existe: atualiza o teto e garante o supervisor — sem duplicar nada.
    if (teto) await supabaseAdmin.from('fornecedores').update({ quantidade_estimada: teto }).eq('id', fornecedorId)
    const { data: perfilDoCpf } = await supabaseAdmin.from('perfis').select('id').eq('cpf', l.supervisor.cpf).maybeSingle()
    const jaLigado = perfilDoCpf
      ? !!(await supabaseAdmin.from('supervisor_setores').select('perfil_id')
          .eq('perfil_id', perfilDoCpf.id).eq('fornecedor_id', fornecedorId).maybeSingle()).data
      : false
    if (!jaLigado) await criarSupervisorOuLanca(fornecedorId, eventoId, dadosSupervisor)
    acao = 'atualizado'
  }

  // 3. A trava por dia. Reimportar SUBSTITUI a trava do fornecedor; linha sem
  //    trava não mexe na que já existe.
  const dias = Object.entries(l.travaPorDia)
  if (!dias.length) return { linha: l.linha, acao }
  const { error: erroTrava } = await supabaseAdmin.from('fornecedor_cotas_dia').upsert(
    dias.map(([data, maximo]) => ({ fornecedor_id: fornecedorId, data, maximo, atualizado_em: new Date().toISOString() })),
    { onConflict: 'fornecedor_id,data' },
  )
  if (erroTrava) {
    return { linha: l.linha, acao, aviso: 'A trava por dia não foi gravada — falta rodar supabase/upgrade-trava-por-dia.sql.' }
  }
  await supabaseAdmin.from('fornecedor_cotas_dia').delete()
    .eq('fornecedor_id', fornecedorId).not('data', 'in', `(${dias.map(([d]) => d).join(',')})`)
  return { linha: l.linha, acao }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBEVENTOS — evento mãe com portões/categorias de acesso (Vital: Empresarial,
// Bloco, Camarote Navista, Camarotes em geral, Arquibancada, Geral). Cada um é
// uma linha em `subeventos`, presa ao evento mãe — sem data/local próprios.
// ═══════════════════════════════════════════════════════════════════════════

export async function criarSubevento(eventoId: string, formData: FormData): Promise<{ error?: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const nome = nomeEmMaiusculo(formData.get('nome') as string)
    if (!nome) throw new Error('Informe o nome do subevento.')
    const { error } = await supabaseAdmin.from('subeventos').insert([{ evento_id: eventoId, nome }])
    if (error) throw new Error(mensagemAmigavel(error))
    auditar(perfil, 'SUBEVENTO_CRIADO', { campoAlterado: 'Subevento', eventoId, valorNovo: nome })
    revalidatePath(`/admin/eventos/${eventoId}`)
    return {}
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

export async function editarSubevento(id: string, eventoId: string, formData: FormData): Promise<{ error?: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    const nome = nomeEmMaiusculo(formData.get('nome') as string)
    if (!nome) throw new Error('Informe o nome do subevento.')
    const { data: subAntes } = await supabaseAdmin.from('subeventos').select('nome').eq('id', id).maybeSingle()
    const { error } = await supabaseAdmin.from('subeventos').update({ nome }).eq('id', id).eq('evento_id', eventoId)
    if (error) throw new Error(mensagemAmigavel(error))
    auditar(perfil, 'SUBEVENTO_EDITADO', { campoAlterado: 'Subevento', eventoId, valorAnterior: (subAntes?.nome as string | undefined) ?? null, valorNovo: nome })
    revalidatePath(`/admin/eventos/${eventoId}`)
    return {}
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

/**
 * Junta DOIS subeventos em um: tudo que está em `origemId` (fornecedores e as
 * pessoas deles) passa pra `destinoId`, e a área de origem — agora vazia — é
 * apagada. Existe pra desfazer duplicatas ("Camarote Na Vista" /
 * "CAMAROTE NAVISTA"), que uma planilha com o nome escrito de outro jeito
 * criava antes de a importação reconhecer nomes parecidos (06/10/2026).
 *
 * Só `fornecedores.subevento_id` e `funcionarios.subevento_id` apontam pra um
 * subevento (conferido nas migrações), então não há mais nada a levar.
 * Nada é apagado além da área vazia; fornecedores de mesmo nome nas duas
 * áreas continuam como dois setores (cada um com o seu link e supervisor).
 */
export async function mesclarSubeventos(eventoId: string, origemId: string, destinoId: string): Promise<
  { ok: true; fornecedores: number; funcionarios: number; destinoNome: string } | { ok?: false; error: string }
> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    if (!origemId || !destinoId || origemId === destinoId) return { error: 'Escolha duas áreas diferentes.' }

    const { data: areas } = await supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId).in('id', [origemId, destinoId])
    const origem = areas?.find(a => a.id === origemId)
    const destino = areas?.find(a => a.id === destinoId)
    if (!origem || !destino) return { error: 'Estas áreas não são deste evento.' }

    const { data: movidos, error: erroForn } = await supabaseAdmin
      .from('fornecedores').update({ subevento_id: destinoId }).eq('subevento_id', origemId).eq('evento_id', eventoId).select('id')
    if (erroForn) return { error: mensagemAmigavel(erroForn) }
    const { data: pessoas, error: erroFunc } = await supabaseAdmin
      .from('funcionarios').update({ subevento_id: destinoId }).eq('subevento_id', origemId).select('id')
    if (erroFunc) return { error: mensagemAmigavel(erroFunc) }

    const { error: erroApagar } = await supabaseAdmin.from('subeventos').delete().eq('id', origemId)
    if (erroApagar) return { error: `Os fornecedores foram movidos, mas não consegui apagar a área "${origem.nome}": ${mensagemAmigavel(erroApagar)}` }

    after(() => registrarAuditoria({
      perfil, acao: 'MESCLA_SUBEVENTO', campoAlterado: 'Subevento',
      valorAnterior: `${origem.nome as string}`, valorNovo: `mesclado em ${destino.nome as string} (${movidos?.length ?? 0} fornecedores, ${pessoas?.length ?? 0} pessoas)`,
      eventoId,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true as const, fornecedores: movidos?.length ?? 0, funcionarios: pessoas?.length ?? 0, destinoNome: destino.nome as string }
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}

export async function excluirSubevento(id: string, eventoId: string): Promise<{ error?: string }> {
  try {
    const perfil = await exigirEventoDaOrg(eventoId)
    /*
     * Quem já está cadastrado neste subevento fica com `subevento_id = null`
     * (ON DELETE SET NULL) — não é excluído junto. Avisa antes de deixar
     * alguém "sem subevento" num evento que usa a feature, pra não virar um
     * caso estranho no portão sem ninguém ter decidido isso de propósito.
     */
    const { count } = await supabaseAdmin
      .from('funcionarios').select('id', { count: 'exact', head: true }).eq('subevento_id', id)
    if (count) {
      throw new Error(`Este subevento tem ${count} pessoa${count === 1 ? '' : 's'} vinculada${count === 1 ? '' : 's'}. Mova-as para outro subevento antes de excluir.`)
    }
    const { data: subExcluido } = await supabaseAdmin.from('subeventos').select('nome').eq('id', id).maybeSingle()
    const { error } = await supabaseAdmin.from('subeventos').delete().eq('id', id).eq('evento_id', eventoId)
    if (error) throw new Error(mensagemAmigavel(error))
    auditar(perfil, 'SUBEVENTO_EXCLUIDO', { campoAlterado: 'Subevento', eventoId, valorAnterior: (subExcluido?.nome as string | undefined) ?? id })
    revalidatePath(`/admin/eventos/${eventoId}`)
    return {}
  } catch (e) {
    return { error: mensagemAmigavel(e) }
  }
}


/**
 * Desde quando esta pessoa está na base do Credenciei.
 *
 * Duas datas diferentes se confundem o tempo todo: "quando ela se credenciou
 * NESTE evento" (o `created_at` do cadastro deste evento, que a tela já tem
 * em mãos) e "quando ela entrou na nossa base" — o primeiro cadastro dela em
 * qualquer evento, de qualquer cliente. A segunda é esta, e só ela responde
 * "essa pessoa é nova ou já trabalha com a gente há dois anos?".
 *
 * Por CPF, e não por id: a mesma pessoa tem um cadastro por evento, e é
 * justamente a soma deles que forma a base.
 */
export async function desdeQuandoNaBase(cpfDigitado: string): Promise<{
  primeiroCadastro: string | null
  totalEventos: number
} | null> {
  const perfil = await getPerfil()
  // Encarregado é só consulta do próprio setor: não pesquisa a base por CPF.
  if (!perfil || perfil.role === 'encarregado') return null
  const cpf = normalizarCpf(cpfDigitado ?? '')
  if (cpf.length !== 11) return null

  const { data, error } = await supabaseAdmin
    .from('funcionarios')
    .select('created_at, fornecedores!inner(evento_id)')
    .eq('cpf', cpf)
    .order('created_at', { ascending: true })
  if (error || !data?.length) return null

  const eventos = new Set(
    data.map(f => (f.fornecedores as unknown as { evento_id: string } | null)?.evento_id).filter(Boolean),
  )
  return { primeiroCadastro: data[0].created_at as string, totalEventos: eventos.size }
}

/**
 * Corrige o telefone de um funcionário — e a fila de WhatsApp junto.
 *
 * O telefone é o canal: é por ele que chega a credencial, o aviso do dia e
 * cada lembrete de ponto. Um dígito errado no cadastro não é um detalhe do
 * registro, é a pessoa inteira fora da comunicação do evento — e o motivo
 * pelo qual alguém abre esta ficha pra corrigir.
 *
 * POR ISSO A FILA VAI JUNTO. `mensagens_agendadas` guarda o telefone no
 * momento em que a mensagem é agendada, não na hora de enviar. Corrigir só o
 * cadastro deixaria tudo que já está agendado saindo para o número errado —
 * e quem corrigiu iria embora achando que resolveu.
 */
export async function editarTelefoneFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, novoTelefoneBruto: string, motivo?: string,
): Promise<{ ok: true; corrigidasNaFila: number } | { erro: string }> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Sem permissão.' }

  /*
   * Quem cuida da equipe corrige (admin, master, supervisor do setor) — e o
   * suporte, dentro do escopo dele, que é justamente quem é chamado quando a
   * pessoa reclama que não recebeu nada.
   */
  if (perfil.role === 'suporte') {
    const { data: forn } = await supabaseAdmin
      .from('fornecedores').select('evento_id, eventos(organizacao_id)').eq('id', fornecedorId).single()
    if (!forn || forn.evento_id !== eventoId) return { erro: 'Fornecedor não encontrado neste evento.' }
    if (!(motivo ?? '').trim()) return { erro: 'Informe o motivo da correção.' }
    const organizacaoId = (forn.eventos as unknown as { organizacao_id: string | null } | null)?.organizacao_id
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
      return { erro: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else {
    try {
      await exigirAcessoFuncionarios(fornecedorId, eventoId)
    } catch {
      return { erro: 'Sem permissão para corrigir o telefone desta pessoa.' }
    }
  }

  const novo = (novoTelefoneBruto ?? '').replace(/\D/g, '')
  // Mesma régua de `criarSupervisor`: com DDD, com ou sem o 55 na frente.
  if (novo.length < 10 || novo.length > 13) {
    return { erro: 'Telefone inválido. Informe com DDD — ex.: (27) 99999-9999.' }
  }

  const { data: atual } = await supabaseAdmin
    .from('funcionarios').select('id, nome, telefone, fornecedor_id').eq('id', funcionarioId).single()
  if (!atual || atual.fornecedor_id !== fornecedorId) return { erro: 'Funcionário não encontrado neste fornecedor.' }
  if ((atual.telefone as string) === novo) return { ok: true, corrigidasNaFila: 0 }

  const { error } = await supabaseAdmin.from('funcionarios').update({ telefone: novo }).eq('id', funcionarioId)
  if (error) return { erro: mensagemAmigavel(error) }

  // Só o que ainda NÃO saiu: mexer no que já foi enviado reescreveria o
  // histórico do que de fato aconteceu.
  const { data: corrigidas } = await supabaseAdmin
    .from('mensagens_agendadas')
    .update({ telefone: novo })
    .eq('funcionario_id', funcionarioId)
    .eq('status', 'pendente')
    .select('id')

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_TELEFONE', campoAlterado: 'Telefone',
    valorAnterior: (atual.telefone as string) || '—', valorNovo: novo,
    motivo: motivo ?? null, funcionarioId, eventoId,
  }))

  after(() => sincronizarFuncionarioNaPlanilha(funcionarioId).catch(console.error))
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const, corrigidasNaFila: corrigidas?.length ?? 0 }
}

/**
 * Corrige a FUNÇÃO (cargo) de uma pessoa da equipe.
 *
 * O campo é texto livre no cadastro público, e a mesma função aparecia
 * escrita de dez jeitos ("cx movel", "caixa móvel"…). Agora quem cuida da
 * equipe conserta: admin/master da organização, o supervisor DO setor, e o
 * suporte dentro do escopo (com motivo). Mesma régua de
 * `editarTelefoneFuncionario`.
 */
export async function editarCargoFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, novoCargoBruto: string, motivo?: string,
): Promise<{ ok: true } | { erro: string }> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Sem permissão.' }

  if (perfil.role === 'suporte') {
    const { data: forn } = await supabaseAdmin
      .from('fornecedores').select('evento_id, eventos(organizacao_id)').eq('id', fornecedorId).single()
    if (!forn || forn.evento_id !== eventoId) return { erro: 'Fornecedor não encontrado neste evento.' }
    if (!(motivo ?? '').trim()) return { erro: 'Informe o motivo da correção.' }
    const organizacaoId = (forn.eventos as unknown as { organizacao_id: string | null } | null)?.organizacao_id
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
      return { erro: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else {
    try {
      await exigirAcessoFuncionarios(fornecedorId, eventoId)
    } catch {
      return { erro: 'Sem permissão para corrigir a função desta pessoa.' }
    }
  }

  const novo = (novoCargoBruto ?? '').trim().replace(/\s+/g, ' ')
  if (!novo) return { erro: 'A função não pode ficar em branco.' }
  if (novo.length > 60) return { erro: 'Função muito longa. Encurte.' }

  const { data: atual } = await supabaseAdmin
    .from('funcionarios').select('id, nome, cargo, fornecedor_id').eq('id', funcionarioId).single()
  if (!atual) return { erro: 'Pessoa não encontrada.' }
  if (atual.fornecedor_id !== fornecedorId) return { erro: 'Esta pessoa não está neste fornecedor.' }
  if ((atual.cargo ?? '') === novo) return { ok: true as const }

  const { error } = await supabaseAdmin
    .from('funcionarios').update({ cargo: novo }).eq('id', funcionarioId)
  if (error) return { erro: mensagemAmigavel(error) }

  after(() => registrarAuditoria({
    perfil, acao: 'ALTERACAO_SETOR', campoAlterado: 'função',
    valorAnterior: (atual.cargo as string | null) ?? null, valorNovo: novo, motivo: motivo ?? null,
    funcionarioId, eventoId,
  }))
  after(() => sincronizarFuncionarioNaPlanilha(funcionarioId).catch(console.error))
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const }
}

// ─── Pesquisa dentro do evento ──────────────────────────────────────────────

export type ResultadoBuscaEvento = {
  tipo: 'subsetor' | 'setor' | 'supervisor' | 'colaborador'
  /** Texto principal (nome do subsetor, do setor, do supervisor ou do colaborador). */
  titulo: string
  /** Onde a pessoa/setor está: "SUBSETOR › SETOR". */
  contexto: string
  /** Subsetor (subevento) onde o resultado mora — a tela usa pra filtrar os cartões. */
  subeventoId: string | null
  href: string
}

/**
 * Pesquisa do evento: subsetor (subevento), setor (fornecedor), supervisor e
 * colaborador, tudo por uma caixa só. Só leitura, restrita ao evento (e à
 * organização de quem pergunta — mesma regra das escritas). Devolve `{ erro }`
 * em vez de lançar: o Next mascara exceções de Server Action em produção.
 */
export async function buscarNoEvento(eventoId: string, termo: string): Promise<
  { ok: true; resultados: ResultadoBuscaEvento[]; limitado: boolean } | { erro: string }
> {
  try {
    await exigirEventoDaOrg(eventoId)
    const q = chaveBusca(termo)
    if (q.length < 2) return { ok: true, resultados: [], limitado: false }
    const bate = (v: string | null | undefined) => chaveBusca(v).includes(q)

    const [{ data: subs }, { data: forns }] = await Promise.all([
      supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId).limit(500),
      supabaseAdmin.from('fornecedores').select('id, nome, subevento_id').eq('evento_id', eventoId).limit(2000),
    ])
    const nomeSub = new Map((subs ?? []).map(s => [s.id as string, s.nome as string]))
    const fornPorId = new Map((forns ?? []).map(f => [f.id as string, f]))
    const contextoDe = (fornecedorId: string) => {
      const f = fornPorId.get(fornecedorId)
      const sub = f?.subevento_id ? nomeSub.get(f.subevento_id as string) : null
      return { sub: (f?.subevento_id as string | null) ?? null, texto: [sub, f?.nome as string | undefined].filter(Boolean).join(' › ') }
    }
    const hrefSetor = (fid: string) => `/admin/eventos/${eventoId}/fornecedor/${fid}`

    const out: ResultadoBuscaEvento[] = []

    for (const s of subs ?? []) {
      if (bate(s.nome as string)) {
        out.push({ tipo: 'subsetor', titulo: s.nome as string, contexto: 'Subevento', subeventoId: s.id as string, href: `/admin/eventos/${eventoId}/subevento/${s.id}` })
      }
    }
    for (const f of forns ?? []) {
      if (bate(f.nome as string)) {
        const c = contextoDe(f.id as string)
        out.push({ tipo: 'setor', titulo: f.nome as string, contexto: c.sub ? (nomeSub.get(c.sub) ?? 'Setor') : 'Setor', subeventoId: c.sub, href: hrefSetor(f.id as string) })
      }
    }

    // Supervisores: um por setor que cobre (quem cobre três setores aparece nos três).
    const fornecedorIds = (forns ?? []).map(f => f.id as string)
    const vinculos: { fornecedor_id: string; nome: string }[] = []
    for (const lote of emLotes(fornecedorIds, 200)) {
      const { data } = await supabaseAdmin
        .from('supervisor_setores').select('fornecedor_id, perfis!inner(nome)').in('fornecedor_id', lote)
      for (const v of (data ?? []) as unknown as { fornecedor_id: string; perfis: { nome: string } }[]) {
        if (v.perfis?.nome) vinculos.push({ fornecedor_id: v.fornecedor_id, nome: v.perfis.nome })
      }
    }
    for (const v of vinculos) {
      if (!bate(v.nome)) continue
      const c = contextoDe(v.fornecedor_id)
      out.push({ tipo: 'supervisor', titulo: v.nome, contexto: c.texto || 'Setor', subeventoId: c.sub, href: hrefSetor(v.fornecedor_id) })
    }

    // Colaboradores: o nome é gravado em maiúsculas, mas o termo pode vir com
    // acento diferente — pesquisa no banco pelo trecho e confere com `bate`.
    const digitos = termo.replace(/\D/g, '')
    const porCpf = digitos.length >= 3
    const trecho = termo.trim().replace(/[%,()]/g, ' ')
    let consulta = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, fornecedor_id, fornecedores!inner(evento_id)')
      .eq('fornecedores.evento_id', eventoId)
    consulta = porCpf ? consulta.like('cpf', `%${digitos}%`) : consulta.ilike('nome', `%${trecho}%`)
    const { data: pessoas } = await consulta.order('nome').order('id').limit(40)
    for (const p of pessoas ?? []) {
      const c = contextoDe(p.fornecedor_id as string)
      out.push({ tipo: 'colaborador', titulo: p.nome as string, contexto: c.texto || 'Setor', subeventoId: c.sub, href: hrefSetor(p.fornecedor_id as string) })
    }

    const LIMITE = 60
    return { ok: true, resultados: out.slice(0, LIMITE), limitado: out.length > LIMITE }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
