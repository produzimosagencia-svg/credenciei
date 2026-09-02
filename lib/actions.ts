'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getPerfil, supabaseAdmin, podeEscanearEvento, meusSetores } from './supabase-server'
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
  podeGerenciarOrganizacoes,
  podeExcluirEventos,
  podeExcluir,
  podeEditarIdentidade,
  podeEscanear,
  podeAcompanhar,
  ehMaster,
  ROLE_LABELS,
  type Role,
} from './permissions'
import { inputParaISO, formatarBR } from './tz'
import {
  diaBRT, janelaDoMeio, dentroDaJanela, avaliarEntradaSaida, faseDoDia, conferirHorariosDoEvento,
  TETO_TURNO_H, type EventoJanelas, type DiaDaJornada,
} from './janelas'
import { validarCpf } from './format'
import { normalizarCidade } from './cidades'
import { normalizarCpf, cpfParaEmail } from './usuario'
import { mensagemAmigavel } from './erros'
import { podePassar } from './limite'
import { setoresComMeio, diasComMeio } from './meio'
import { sincronizarAgendamentos, agendarBoasVindasFuncionario, agendarMeioAposEntrada, agendarTemplateSupervisor } from './mensagens'
import { enderecoAproximado } from './geocoding'
import { lerCodigoQR, faseConfere, NOME_DA_FASE } from './credencial-qr'
import { criarConviteSenhaSupervisor } from './supervisor-convite'

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
async function garantirDiaPrincipal(eventoId: string, dataInicioISO: string | null) {
  if (!dataInicioISO) return
  const dia = diaBRT(dataInicioISO)

  // A data mudou? O dia antigo vira preparação em vez de sumir: se houve
  // batida nele, ela precisa continuar tendo um dia ao qual pertencer.
  await supabaseAdmin
    .from('jornada_dias')
    .update({ tipo: 'preparacao' })
    .eq('evento_id', eventoId)
    .eq('tipo', 'principal')
    .neq('data', dia)

  const { error } = await supabaseAdmin.from('jornada_dias').upsert(
    [{ evento_id: eventoId, jornada_id: null, data: dia, turno: 0, tipo: 'principal', cancelado: false }],
    { onConflict: 'evento_id,data,turno' },
  )
  if (error) console.error('[evento] não consegui materializar o dia principal:', error.message)
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

async function exigirGestorDeEventos() {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil.role)) throw new Error('Sem permissão')
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
    if (perfil.fornecedor_id !== fornecedorId) throw new Error('Sem permissão sobre este setor')
    return perfil
  }
  if (!podeGerenciarEventos(perfil.role)) throw new Error('Sem permissão')
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) throw new Error('Evento não encontrado')
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
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

/** Campos da mensagem pré-evento (confirmação de escala via WhatsApp). */
function preEventoDoForm(formData: FormData) {
  return {
    msg_pre_evento_envio: inputParaISO(formData.get('msg_pre_evento_envio') as string),
    msg_pre_evento_instrucoes: ((formData.get('msg_pre_evento_instrucoes') as string) || '').trim() || null,
  }
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
  if (!podeGerenciarOrganizacoes(perfil?.role)) throw new Error('Apenas o master pode criar organizações')

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
  const eventoNome = ((formData.get('evento_nome') as string) || '').trim()
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

  revalidatePath('/admin/organizacoes')
  redirect('/admin/organizacoes')
}

export async function toggleAtivoOrganizacao(id: string, ativo: boolean) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) throw new Error('Sem permissão')
  const admin = getAdminSupabase()
  await admin.from('organizacoes').update({ ativo: !ativo }).eq('id', id)
  revalidatePath('/admin/organizacoes')
}

export async function editarOrganizacao(id: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) throw new Error('Sem permissão')
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

  await admin.from('organizacoes').update(dados).eq('id', id)
  revalidatePath('/admin/organizacoes')
}

export async function deletarOrganizacao(id: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) throw new Error('Sem permissão')
  const admin = getAdminSupabase()
  // remove os logins de auth dos membros antes do cascade das tabelas
  const { data: membros } = await admin.from('perfis').select('id').eq('organizacao_id', id)
  for (const m of membros ?? []) {
    try { await admin.auth.admin.deleteUser(m.id) } catch (e) { console.error('Erro ao remover login:', e) }
  }
  await admin.from('organizacoes').delete().eq('id', id) // cascade: perfis + eventos
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

  if (nomes.length <= 1) return nomes[0] ?? 'seu setor'
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`
  return 'vários setores'
}

async function vincularSupervisorAoSetor(perfilId: string, fornecedorId: string) {
  const { error } = await supabaseAdmin
    .from('supervisor_setores')
    .upsert([{ perfil_id: perfilId, fornecedor_id: fornecedorId }], { onConflict: 'perfil_id,fornecedor_id' })
  if (error) console.error('[supervisor_setores] vínculo não gravado (migração pendente?)', error.message)
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
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para consultar acessos')

  const digitos = normalizarCpf(cpf)
  if (digitos.length !== 11) return { role: null, nomePapel: null }

  const { data } = await supabaseAdmin.from('perfis').select('role').eq('cpf', digitos).maybeSingle()
  const role = (data?.role as Role | undefined) ?? null
  return { role, nomePapel: role ? (ROLE_LABELS[role] ?? role) : null }
}

export async function criarSupervisor(fornecedorId: string, eventoId: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para criar supervisores')

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome, token_formulario, eventos(organizacao_id, nome, data_inicio, local)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) throw new Error('Setor não encontrado')
  if (fornecedor.evento_id !== eventoId) throw new Error('Este setor não pertence ao evento informado')
  const eventoDoFornecedor = fornecedor.eventos as any
  const organizacaoId = eventoDoFornecedor?.organizacao_id
  if (!ehMaster(perfil!.role) && organizacaoId !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este setor')
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
    .select('id, nome, role, organizacao_id')
    .eq('cpf', cpf)
    .maybeSingle()
  if (existente) {
    if (existente.role !== 'supervisor') {
      throw new Error('Este CPF já pertence a outro tipo de acesso no sistema.')
    }
    if (!ehMaster(perfil!.role) && existente.organizacao_id !== organizacaoId) {
      throw new Error('Este CPF já está cadastrado em outra organização.')
    }

    const { error: erroAtualizacao } = await admin.from('perfis').update({
      nome,
      telefone,
      ativo,
      organizacao_id: organizacaoId,
      fornecedor_id: fornecedorId,
    }).eq('id', existente.id)
    if (erroAtualizacao) throw new Error(mensagemAmigavel(erroAtualizacao))

    await vincularSupervisorAoSetor(existente.id, fornecedorId)

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
    return { ok: true as const, novo: false as const, usuario: cpf }
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
    throw new Error(jaExiste
      ? `Já existe um supervisor com o CPF ${cpf}. Se for a mesma pessoa em outro setor, edite o acesso dela em vez de criar outro.`
      : mensagemAuth(error.message))
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
  }])

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(user.user!.id).catch(() => {})
    console.error('[criarSupervisor] falha ao inserir perfil', {
      fornecedorId, eventoId, organizacaoId, erro: erroPerfil,
    })
    throw new Error(mensagemAmigavel(erroPerfil))
  }

  await vincularSupervisorAoSetor(user.user!.id, fornecedorId)

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
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para criar operadores de portão')

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
      throw new Error('Este CPF já pertence a outro tipo de acesso no sistema.')
    }
    if (!ehMaster(perfil!.role) && existente.organizacao_id !== organizacaoId) {
      throw new Error('Este CPF já está cadastrado em outra organização.')
    }

    const { error: erroAtualizacao } = await admin.from('perfis').update({
      nome, telefone, ativo, organizacao_id: organizacaoId,
    }).eq('id', existente.id)
    if (erroAtualizacao) throw new Error(mensagemAmigavel(erroAtualizacao))

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

  return { ok: true as const, novo: true as const, usuario: cpf, linkSenha }
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
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão')

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

/** Edita nome/e-mail/telefone/status e, opcionalmente, a senha do supervisor. */
export async function editarSupervisor(id: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('organizacao_id, fornecedor_id, email').eq('id', id).single()
  if (!alvo) throw new Error('Supervisor não encontrado')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este supervisor')
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

  revalidatePath('/admin/usuarios')
  if (alvo.fornecedor_id) {
    const { data: fornecedor } = await admin.from('fornecedores').select('evento_id').eq('id', alvo.fornecedor_id).single()
    if (fornecedor) revalidatePath(`/admin/eventos/${fornecedor.evento_id}`)
  }
}

export async function deletarUsuario(id: string) {
  const perfil = await getPerfil()
  if (!podeExcluir(perfil?.role)) {
    throw new Error('Apenas o master pode excluir acessos. Você pode desativar o usuário, que bloqueia o login sem perder o histórico.')
  }
  if (perfil!.id === id) throw new Error('Você não pode excluir a si mesmo')

  const admin = getAdminSupabase()

  // Admin só pode excluir membros da própria organização
  if (!ehMaster(perfil!.role)) {
    const { data: alvo } = await admin.from('perfis').select('organizacao_id').eq('id', id).single()
    if (!alvo || alvo.organizacao_id !== perfil!.organizacao_id) throw new Error('Sem permissão sobre este usuário')
  }

  await admin.auth.admin.deleteUser(id)
  await admin.from('perfis').delete().eq('id', id)
  revalidatePath('/admin/usuarios')
}

// ─── Eventos ────────────────────────────────────────────────────────────────

export async function criarEvento(formData: FormData) {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil.role)) throw new Error('Sem permissão para criar eventos')

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

  const nome = formData.get('nome') as string
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

  // Antes da planilha e de qualquer outra coisa: sem o dia principal, o evento
  // nasce inutilizável — ninguém consegue bater ponto nele.
  await garantirDiaPrincipal(novo.id, data.data_inicio)

  // Cria planilha na pasta da organização no Drive
  try {
    const spreadsheetId = await criarPlanilhaEvento(nome, driveFolder)
    await db.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', novo.id)
  } catch (e) {
    console.error('Erro ao criar planilha:', e)
  }

  after(() => sincronizarAgendamentos(novo.id).catch(console.error))
  redirect(`/admin/eventos/${novo.id}`)
}

export async function editarEvento(id: string, formData: FormData) {
  await exigirEventoDaOrg(id)
  const db = supabaseAdmin
  const data = {
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    data_inicio: inputParaISO(formData.get('data_inicio') as string),
    data_fim: inputParaISO(formData.get('data_fim') as string),
    local: (formData.get('local') as string) || null,
    ...janelasDoForm(formData),
    ...preEventoDoForm(formData),
  }
  exigirHorariosCoerentes(data)

  await db.from('eventos').update(data).eq('id', id)
  await garantirDiaPrincipal(id, data.data_inicio)
  after(() => sincronizarAgendamentos(id).catch(console.error))
  revalidatePath(`/admin/eventos/${id}`)
  redirect(`/admin/eventos/${id}`)
}

export async function toggleAtivoEvento(id: string, ativo: boolean) {
  await exigirEventoDaOrg(id)
  const db = supabaseAdmin
  await db.from('eventos').update({ ativo: !ativo }).eq('id', id)
  revalidatePath(`/admin/eventos/${id}`)
  revalidatePath('/admin/eventos')
  revalidatePath('/admin')
}

export async function deletarEvento(id: string) {
  const perfil = await getPerfil()
  if (!podeExcluirEventos(perfil?.role)) throw new Error('Apenas o master pode excluir eventos')
  const db = supabaseAdmin

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
  return { ok: true as const, evento: evento.nome, organizacao: nomeOrg, supervisores: idsSetores.length }
}

/**
 * Redefine a senha de qualquer acesso.
 *
 * Existe porque a troca de senha só era possível pela tela de supervisor —
 * admin e master não tinham nenhum caminho, e quem esquece a senha fica de
 * fora do próprio sistema no dia do evento.
 *
 * Master mexe em qualquer um; admin só na própria equipe. Ninguém redefine a
 * própria senha por aqui: para isso existe o fluxo de conta, e um caminho
 * administrativo sobre si mesmo só serve pra confundir.
 */
export async function redefinirSenha(usuarioId: string, novaSenha: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para redefinir senhas')
  if (!novaSenha || novaSenha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('id, nome, email, role, organizacao_id').eq('id', usuarioId).single()
  if (!alvo) throw new Error('Usuário não encontrado')

  // Admin não mexe em quem é de outra organização, nem em master.
  if (!ehMaster(perfil!.role)) {
    if (alvo.organizacao_id !== perfil!.organizacao_id) throw new Error('Sem permissão sobre este usuário')
    if (alvo.role === 'master') throw new Error('Sem permissão sobre este usuário')
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha })
  if (error) throw new Error(mensagemAuth(error.message))

  console.warn(`[redefinirSenha] ${perfil!.email} redefiniu a senha de ${alvo.email}`)
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

export async function criarFornecedor(eventoId: string, formData: FormData) {
  await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin
  const nomeFornecedor = formData.get('nome') as string
  const data = {
    evento_id: eventoId,
    nome: nomeFornecedor,
    valor_combinado: parseValor(formData.get('valor_combinado')),
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

  // Cria a aba na planilha depois da resposta (after: sobrevive ao serverless da Vercel)
  after(() => garantirAbaFornecedorAsync(eventoId, nomeFornecedor))

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

export async function editarFornecedor(id: string, eventoId: string, formData: FormData) {
  await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin
  const { error } = await db.from('fornecedores').update({
    nome: formData.get('nome') as string,
    valor_combinado: parseValor(formData.get('valor_combinado')),
  }).eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))

  // Mesmo motivo de criarFornecedor: coluna nova, à parte, pra migração
  // pendente nunca travar o resto da edição do setor.
  const { error: erroMeio } = await db.from('fornecedores')
    .update({ exige_meio: formData.get('exige_meio') === 'on' })
    .eq('id', id)
  if (erroMeio) console.error('[editarFornecedor] exige_meio não gravado (migração pendente?)', erroMeio.message)
  /*
   * Ligar/desligar o meio muda o que está AGENDADO daqui pra frente:
   * `sincronizarAgendamentos` recria a fila do evento, cancelando o que
   * deixou de fazer sentido. Sem isto, desligar o meio de um setor não
   * pararia os lembretes já enfileirados — que é justamente o custo de
   * WhatsApp que se quer cortar.
   */
  after(() => sincronizarAgendamentos(eventoId).catch(console.error))
  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function deletarFornecedor(id: string, eventoId: string) {
  await exigirEventoDaOrg(eventoId)
  // Exclusão é só do master (ver `podeExcluir` em lib/permissions). Esta
  // checagem é a que vale: esconder o botão não impede a chamada direta.
  const perfilExclusao = await getPerfil()
  if (!podeExcluir(perfilExclusao?.role)) {
    throw new Error('Apenas o master pode excluir. Você pode desativar, que é reversível.')
  }
  const db = supabaseAdmin

  // Setor com supervisores vinculados não pode ser excluído (teriam que ser
  // realocados ou removidos primeiro)
  const { data: supervisores } = await db.from('perfis').select('id').eq('fornecedor_id', id).limit(1)
  if (supervisores && supervisores.length) {
    throw new Error('Este setor tem supervisores vinculados. Exclua ou realoque os supervisores antes de excluir o setor.')
  }

  await db.from('fornecedores').delete().eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}`)
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
 * Só admin e master, de propósito — não o supervisor. Mover gente de setor
 * afeta a equipe de OUTRO supervisor sem ele saber; deixar cada supervisor
 * mexer na composição alheia seria o tipo de ação que exige alguém com visão
 * do evento inteiro.
 */
export async function moverFuncionarioDeSetor(
  funcionarioId: string,
  eventoId: string,
  novoFornecedorId: string,
) {
  await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin

  const { data: func } = await db
    .from('funcionarios')
    .select('id, cpf, fornecedor_id, fornecedores!inner(evento_id)')
    .eq('id', funcionarioId)
    .single()
  if (!func) throw new Error('Funcionário não encontrado.')
  // Confere que ele É deste evento — sem isto, um id de outro evento passado
  // por engano (ou de propósito) moveria gente para um setor de outro cliente.
  if ((func.fornecedores as unknown as { evento_id: string }).evento_id !== eventoId) {
    throw new Error('Este funcionário não pertence a este evento.')
  }

  if (func.fornecedor_id === novoFornecedorId) {
    return { ok: true as const, mudou: false }
  }

  const { data: destino } = await db
    .from('fornecedores')
    .select('id, nome, evento_id')
    .eq('id', novoFornecedorId)
    .single()
  if (!destino) throw new Error('Setor de destino não encontrado.')
  // O destino precisa ser do MESMO evento — mover entre eventos é outra
  // operação (o funcionário pertenceria a duas credenciais, dois QR
  // diferentes), fora do que este botão resolve.
  if (destino.evento_id !== eventoId) {
    throw new Error('O setor de destino não é deste evento.')
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
    throw new Error(`Já existe um cadastro com este CPF no setor ${destino.nome}.`)
  }

  const { error } = await db
    .from('funcionarios')
    .update({ fornecedor_id: novoFornecedorId })
    .eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível mover o funcionário. Tente de novo.')

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
  if (!fornecedor) throw new Error('Setor não encontrado')
  if (fornecedor.evento_id !== eventoId) throw new Error('Este setor não pertence ao evento informado')

  const { data: funcionarios, error } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, telefone, cargo, chave_pix, valor_receber, pago, pago_em, ativo')
    .eq('fornecedor_id', fornecedorId)
    .order('nome')
  if (error) throw new Error(mensagemAmigavel(error))

  const porFuncionario: Record<string, Record<'entrada' | 'meio' | 'fim', string | null>> = {}
  if (filtro && filtro.tipos.length > 0 && funcionarios?.length) {
    const { data: registros, error: erroRegistros } = await supabaseAdmin
      .from('registros')
      .select('funcionario_id, tipo, created_at')
      .eq('data_ref', filtro.dataRef)
      .in('tipo', filtro.tipos)
      .in('funcionario_id', funcionarios.map(f => f.id))
    if (erroRegistros) throw new Error(mensagemAmigavel(erroRegistros))
    for (const r of registros ?? []) {
      (porFuncionario[r.funcionario_id] ??= { entrada: null, meio: null, fim: null })[r.tipo as 'entrada' | 'meio' | 'fim'] = r.created_at
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

export async function criarSetor(eventoId: string, formData: FormData) {
  await exigirEventoDaOrg(eventoId)
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) return
  const db = supabaseAdmin
  await db.from('setores').insert([{ evento_id: eventoId, nome }])
  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function deletarSetor(id: string, eventoId: string) {
  await exigirEventoDaOrg(eventoId)
  // Exclusão é só do master (ver `podeExcluir` em lib/permissions). Esta
  // checagem é a que vale: esconder o botão não impede a chamada direta.
  const perfilExclusao = await getPerfil()
  if (!podeExcluir(perfilExclusao?.role)) {
    throw new Error('Apenas o master pode excluir. Você pode desativar, que é reversível.')
  }
  const db = supabaseAdmin
  await db.from('setores').delete().eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}`)
}

// ─── QR Codes ────────────────────────────────────────────────────────────────

/**
 * Renova a validade dos QR codes de todos os funcionários do evento por +24h.
 * O token (link/QR impresso) NÃO muda — só a data de expiração.
 */
export async function renovarQRs(eventoId: string) {
  await exigirEventoDaOrg(eventoId)
  const admin = getAdminSupabase()

  const { data: fornecedores } = await admin.from('fornecedores').select('id').eq('evento_id', eventoId)
  const fornecedorIds = fornecedores?.map(f => f.id) ?? []
  if (!fornecedorIds.length) return { renovados: 0 }

  const novaValidade = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('funcionarios')
    .update({ qr_expira_em: novaValidade })
    .in('fornecedor_id', fornecedorIds)
    .select('id')

  revalidatePath(`/admin/eventos/${eventoId}`)
  return { renovados: data?.length ?? 0 }
}

// ─── Funcionários ────────────────────────────────────────────────────────────

export async function criarFuncionario(fornecedorId: string, eventoId: string, formData: FormData) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin

  const cpf = (formData.get('cpf') as string).replace(/\D/g, '')
  if (!validarCpf(cpf)) throw new Error('O CPF precisa ter 11 dígitos.')

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
  if (!validarCpf(cpf)) throw new Error('O CPF precisa ter 11 dígitos.')

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

  const pessoa = base?.[0]
  if (!pessoa) throw new Error('Esta pessoa não está na base do Credenciei')
  if (!setor) throw new Error('Setor não encontrado')

  // Mesma trava do formulário público e da importação: um CPF por evento.
  const { data: jaNoEvento } = await db
    .from('funcionarios')
    .select('id, fornecedores!inner(nome, evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', setor.evento_id)
    .limit(1)
  if (jaNoEvento?.length) {
    const outro = (jaNoEvento[0].fornecedores as unknown as { nome: string }).nome
    throw new Error(`${pessoa.nome} já está neste evento, no setor "${outro}".`)
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
  return {
    ok: true as const,
    ativo: novo.ativo !== false,
    setor: setor.nome,
    evento,
    semTelefone: !pessoa.telefone,
  }
}

export async function deletarFuncionario(id: string, fornecedorId: string, eventoId: string) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  // Exclusão é só do master (ver `podeExcluir` em lib/permissions). Esta
  // checagem é a que vale: esconder o botão não impede a chamada direta.
  const perfilExclusao = await getPerfil()
  if (!podeExcluir(perfilExclusao?.role)) {
    throw new Error('Apenas o master pode excluir. Você pode desativar, que é reversível.')
  }
  const db = supabaseAdmin
  const { error } = await db.from('funcionarios').delete().eq('id', id)
  if (error) throw new Error(mensagemAmigavel(error))
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Valor que este funcionário deve receber dos demais integrantes do setor.
 * Mesma permissão de "gerenciar a equipe": admin/master da organização, ou o
 * supervisor vinculado a este setor especificamente.
 */
export async function atualizarValorReceber(funcionarioId: string, fornecedorId: string, eventoId: string, valor: number) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor inválido')
  const db = supabaseAdmin
  const { error } = await db.from('funcionarios').update({ valor_receber: valor }).eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível salvar o valor. Tente de novo.')

  // Reflete na planilha depois da resposta (não bloqueia; sobrevive ao serverless)
  after(() => sincronizarValorNaPlanilha(funcionarioId, valor).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/**
 * Corrige o CPF de um funcionário já cadastrado.
 *
 * Existe porque refazer o cadastro do zero (a alternativa óbvia) perde o QR
 * já impresso/salvo, o histórico de batidas e o vínculo de pagamento — tudo
 * amarrado ao `id` antigo. Corrigir o CPF NO MESMO registro preserva os três.
 *
 * Só master edita, por enquanto — ver `podeEditarIdentidade`. CPF é a
 * identidade da pessoa em todo o sistema (login de supervisor, base
 * regional, histórico entre eventos); trocá-lo sem cuidado troca quem a
 * pessoa É pro sistema, não só um campo de formulário.
 */
export async function editarCpfFuncionario(
  funcionarioId: string, fornecedorId: string, eventoId: string, novoCpfBruto: string,
) {
  const perfil = await getPerfil()
  if (!podeEditarIdentidade(perfil?.role)) throw new Error('Só o master pode corrigir o CPF de um cadastro.')

  const novoCpf = normalizarCpf(novoCpfBruto)
  if (!validarCpf(novoCpf)) throw new Error('O CPF precisa ter 11 dígitos válidos.')

  const { data: fornecedor } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).single()
  if (!fornecedor || fornecedor.evento_id !== eventoId) throw new Error('Setor não encontrado neste evento.')

  const { data: atual } = await supabaseAdmin.from('funcionarios').select('id, cpf, fornecedor_id').eq('id', funcionarioId).single()
  if (!atual || atual.fornecedor_id !== fornecedorId) throw new Error('Funcionário não encontrado neste setor.')
  if (atual.cpf === novoCpf) return { ok: true as const } // nada mudou

  /*
   * Mesma régua do cadastro público: uma pessoa não pode estar em dois
   * setores do mesmo evento. Corrigir o CPF pra um que já é de OUTRA pessoa
   * neste evento fundiria as duas identidades — o oposto do que se quer.
   */
  const { data: conflito } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, fornecedores!inner(evento_id, nome)')
    .eq('cpf', novoCpf)
    .eq('fornecedores.evento_id', eventoId)
    .neq('id', funcionarioId)
    .maybeSingle()
  if (conflito) {
    const setorConflito = (conflito.fornecedores as unknown as { nome: string })?.nome ?? 'outro setor'
    throw new Error(`Este CPF já é de ${conflito.nome}, no setor ${setorConflito}. Confira o número antes de salvar.`)
  }

  const { error } = await supabaseAdmin.from('funcionarios').update({ cpf: novoCpf }).eq('id', funcionarioId)
  if (error) throw new Error(mensagemAmigavel(error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const }
}

/** Marca/desmarca a baixa de pagamento do valor a receber do setor. */
export async function alternarPagamento(funcionarioId: string, fornecedorId: string, eventoId: string, pago: boolean) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
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
 */
export async function trocarSetorAtivo(fornecedorId: string) {
  const perfil = await getPerfil()
  if (!perfil || perfil.role !== 'supervisor') throw new Error('Sem permissão')

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
  if (error || !vinculo) throw new Error('Você não tem acesso a este setor.')

  const { error: erroTroca } = await supabaseAdmin
    .from('perfis').update({ fornecedor_id: fornecedorId }).eq('id', perfil.id)
  if (erroTroca) throw new Error(mensagemAmigavel(erroTroca))

  const { data: setor } = await supabaseAdmin
    .from('fornecedores').select('evento_id').eq('id', fornecedorId).single()

  revalidatePath('/admin', 'layout')
  return { ok: true as const, eventoId: setor?.evento_id as string | undefined }
}

export async function alternarAtivacao(funcionarioId: string, fornecedorId: string, eventoId: string, ativo: boolean) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin

  const { error } = await db.from('funcionarios').update({ ativo }).eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível alterar a ativação desta pessoa. Tente de novo.')
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
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

export async function sincronizarFuncionarioNaPlanilha(funcionarioId: string) {
  try {
    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('*, fornecedores(nome, eventos(spreadsheet_id))')
      .eq('id', funcionarioId)
      .single()

    if (!func) return
    const fornecedor = func.fornecedores as any
    const evento = fornecedor?.eventos as any
    if (!evento?.spreadsheet_id) return

    await adicionarFuncionarioNaPlanilha(evento.spreadsheet_id, fornecedor.nome, {
      nome: func.nome,
      cpf: func.cpf,
      telefone: func.telefone,
      cargo: func.cargo,
      valorReceber: func.valor_receber,
      chavePix: func.chave_pix,
      qr_token: func.qr_token,
    })
  } catch (e) {
    console.error('Erro ao sincronizar funcionário na planilha:', e)
  }
}

export async function sincronizarRegistroNaPlanilha(
  funcionarioId: string,
  eventoId: string,
  tipo: 'entrada' | 'saida'
) {
  try {
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabaseAdmin.from('funcionarios').select('nome, fornecedores(nome)').eq('id', funcionarioId).single(),
      supabaseAdmin.from('eventos').select('spreadsheet_id').eq('id', eventoId).single(),
    ])

    if (!func || !evento?.spreadsheet_id) return

    const fornecedor = func.fornecedores as any
    /*
      * Horário de Brasília, não o do servidor.
      *
      * `format` do date-fns usa o fuso do runtime, e a Vercel roda em UTC: a
      * batida das 17:00 ia parar na planilha do cliente como 20:00. É o número
      * que o produtor usa pra conferir jornada e pagar — não podia estar errado.
      */
     const horario = formatarBR(new Date().toISOString(), 'completo')

    await registrarPresencaNaPlanilha(
      evento.spreadsheet_id,
      fornecedor.nome,
      func.nome,
      tipo,
      horario
    )
  } catch (e) {
    console.error('Erro ao sincronizar registro na planilha:', e)
  }
}

// ─── Jornadas recorrentes ("despertador") ────────────────────────────────────


// ─── Dias de trabalho do evento ───────────────────────────────────────────────

export type DiaDoEvento = {
  data: string
  tipo: 'principal' | 'preparacao'
  cancelado: boolean
  /** Já tem batida registrada — não pode ser desmarcado sem perder a prova. */
  temBatidas: boolean
}

/**
 * Os dias de trabalho de um evento, na ordem.
 *
 * O dia principal sempre aparece, mesmo que ninguém tenha marcado dia nenhum:
 * ele é a data do próprio evento.
 */
export async function diasDoEvento(eventoId: string): Promise<DiaDoEvento[]> {
  const { data: dias } = await supabaseAdmin
    .from('jornada_dias')
    .select('id, data, tipo, cancelado')
    .eq('evento_id', eventoId)
    .order('data')

  if (!dias?.length) return []

  // Quais desses dias já têm batida. Uma consulta só, em vez de uma por dia.
  const { data: comBatida } = await supabaseAdmin
    .from('registros')
    .select('data_ref')
    .eq('evento_id', eventoId)
    .in('data_ref', dias.map(d => d.data as string))
  const batidos = new Set((comBatida ?? []).map(r => r.data_ref as string))

  return dias.map(d => ({
    data: d.data as string,
    tipo: (d.tipo as 'principal' | 'preparacao') ?? 'preparacao',
    cancelado: d.cancelado === true,
    temBatidas: batidos.has(d.data as string),
  }))
}

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
export async function salvarDiasDeTrabalho(eventoId: string, datas: string[]) {
  await exigirEventoDaOrg(eventoId)

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, data_inicio').eq('id', eventoId).single()
  if (!evento?.data_inicio) throw new Error('Este evento ainda não tem data definida.')

  const principal = diaBRT(evento.data_inicio as string)
  const escolhidos = [...new Set((datas ?? []).map(d => String(d).slice(0, 10)))]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== principal)
    .sort()

  // ── O dia principal, sempre exatamente um e na data do evento ────────────
  const { data: principaisAtuais } = await supabaseAdmin
    .from('jornada_dias').select('id, data').eq('evento_id', eventoId).eq('tipo', 'principal')

  for (const antigo of principaisAtuais ?? []) {
    if (antigo.data === principal) continue
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
    const { data: comBatida } = await supabaseAdmin
      .from('registros').select('data_ref')
      .eq('evento_id', eventoId)
      .in('data_ref', paraRemover.map(d => d.data as string))
    const batidos = new Set((comBatida ?? []).map(r => r.data_ref as string))

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
  // Só os dias de preparação: o dia principal não é escolha do produtor, ele
  // é a data do evento, e contá-lo aqui faria o número divergir da tela.
  return { ok: true as const, dias: escolhidos.length, preservados }
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
 * O teto de 18h existe pra uma entrada esquecida da semana passada não capturar
 * a saída de hoje — ver TETO_TURNO_H.
 */
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

type DiaDeTrabalho = DiaDaJornada & { id: string; data: string }

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
    .from('eventos').select('data_inicio').eq('id', eventoId).single()
  if (!ev?.data_inicio || diaBRT(ev.data_inicio) !== data) return null

  console.warn(`[jornada] evento ${eventoId} estava sem o dia principal ${data}; criando agora`)
  await garantirDiaPrincipal(eventoId, ev.data_inicio)
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
      jaEm: string | null
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
  agora = new Date()
): Promise<Resolucao> {
  const hoje = diaBRT(agora)
  let dataRef = hoje

  /*
   * A entrada em aberto define o DIA de tudo que vem depois dela.
   *
   * É assim que o turno da madrugada fecha no dia certo: quem entrou 22:00 do
   * dia 5 e sai 04:00 do dia 6 fecha o dia 5, em vez de abrir um dia novo às
   * quatro da manhã.
   */
  const entrada = momento === 'entrada' ? null : await entradaDoTurno(funcionarioId, evento.id, agora)
  if (entrada) dataRef = entrada.dataRef

  const dia = await diaDeTrabalho(evento.id, dataRef)

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
    const veredito = avaliarEntradaSaida(evento, dia, momento, dataRef, agora)
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

  const { data: jaExiste } = await supabaseAdmin
    .from('registros')
    .select('created_at')
    .eq('funcionario_id', funcionarioId)
    .eq('evento_id', evento.id)
    .eq('tipo', momento)
    .eq('data_ref', dataRef)
    .limit(1)

  return {
    ok: true,
    dataRef,
    jornadaDiaId: dia?.id ?? null,
    diaPrincipal: dia?.tipo === 'principal',
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
 * resto: o dia da entrada em aberto, ou hoje quando não há nenhuma.
 */
async function diaDeReferencia(evento: { id: string; data_inicio?: string | null }, funcionarioId: string) {
  const agora = new Date()
  const entrada = await entradaDoTurno(funcionarioId, evento.id, agora)
  const dataRef = entrada?.dataRef ?? diaBRT(agora)
  const dia = await diaDeTrabalho(evento.id, dataRef)
  return { dataRef, jornadaDiaId: dia?.id ?? null, diaPrincipal: dia?.tipo === 'principal' }
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
 * Encerra o vínculo da pessoa com AQUELE evento.
 *
 * ⚠️ Descredenciar NÃO apaga ninguém. A linha em `funcionarios` é o que mantém
 * a pessoa na base geral (que é agregada por CPF a partir dela) e o que segura
 * o histórico de batidas pelo `funcionario_id`. Apagar aqui destruiria o
 * histórico do evento junto — inclusive o que sustenta o pagamento.
 *
 * O que muda é só um carimbo de data: a pessoa sai das listas de credenciados
 * daquele evento e o QR dela para de ser aceito ali. Ela continua na base,
 * continua com todo o histórico, e pode ser credenciada em outro evento
 * amanhã — o vínculo é por evento, não global.
 */
async function descredenciar(funcionarioId: string, perfilId: string | null) {
  const { error } = await supabaseAdmin
    .from('funcionarios')
    .update({ descredenciado_em: new Date().toISOString(), descredenciado_por: perfilId })
    .eq('id', funcionarioId)
    .is('descredenciado_em', null) // idempotente: não reescreve a data original
  if (error) console.error('[descredenciar] falhou:', error)
}

/**
 * Recoloca alguém no evento depois de um descredenciamento indevido.
 *
 * Existe porque a saída no dia principal descredencia sozinha: se o operador
 * escaneou a pessoa errada, ou ela precisou voltar ao posto, sem isto o único
 * jeito de desfazer seria mexer no banco à mão.
 */
export async function recredenciarFuncionario(funcionarioId: string, fornecedorId: string, eventoId: string) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const { error } = await supabaseAdmin
    .from('funcionarios')
    .update({ descredenciado_em: null, descredenciado_por: null })
    .eq('id', funcionarioId)
  if (error) throw new Error('Não foi possível recredenciar esta pessoa. Tente de novo.')
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
  return { ok: true as const }
}

export type ResultadoScan = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null }
  momento?: MomentoPresenca
  /** Já havia registro desta etapa no dia — nada foi gravado agora. */
  jaRegistrado?: boolean
  /**
   * O crachá é de OUTRA etapa do evento.
   *
   * Sinalizado à parte da mensagem porque exige uma ação, não só um aviso: a
   * pessoa está de pé no portão com um QR que não serve, e quem credencia
   * precisa decidir na hora se ela entra. A tela usa isto para oferecer a
   * conferência pelo CPF.
   */
  faseErrada?: { doQR: string; deHoje: string }
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
  if (!perfil || !podeEscanear(perfil.role)) return { credenciado: false, erro: 'Sem permissão' }
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

  // Supervisor confere só a própria equipe, igual ao resto do sistema.
  if (perfil.role === 'supervisor' && perfil.fornecedor_id && f.fornecedor_id !== perfil.fornecedor_id) {
    return { credenciado: false, erro: `Esta pessoa é do setor ${setor ?? 'outro'}, fora do seu. Chame o credenciamento do evento.` }
  }

  const { data: hoje } = await supabaseAdmin
    .from('registros')
    .select('tipo')
    .eq('funcionario_id', f.id)
    .eq('evento_id', eventoId)
    .eq('data_ref', diaBRT())

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
 */
export async function registrarPresencaQR(eventoId: string, qrData: string, momento: 'entrada' | 'fim'): Promise<ResultadoScan> {
  const perfil = await getPerfil()
  // Todos os papéis autenticados podem escanear (inclui supervisor).
  if (!perfil || !podeEscanear(perfil.role)) return { success: false, message: 'Sem permissão' }
  if (momento !== 'entrada' && momento !== 'fim') return { success: false, message: 'Momento inválido' }

  // O QR carrega um código ASSINADO e com prazo, não o token cru — ver
  // lib/credencial-qr.ts. O split de "|" sobrevive só por causa de um formato
  // antigo que já circulou com o tipo grudado no fim.
  // O dia de HOJE, não o `data_ref` do registro: num turno que vira a
  // madrugada o registro pertence a ontem, mas o crachá na mão da pessoa é o
  // de hoje. Comparar com data_ref recusaria quem está saindo às 4 da manhã.
  const leitura = lerCodigoQR((qrData ?? '').split('|')[0]?.trim() ?? '', diaBRT())
  if (!leitura.ok) return { success: false, message: leitura.erro }
  const token = leitura.token

  const { data: evento } = await supabaseAdmin
    .from('eventos')
    .select(`id, organizacao_id, ${JANELA_SELECT}`)
    .eq('id', eventoId)
    .single()
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
  const inicioDoEvento = (evento as { data_inicio?: string | null }).data_inicio
  const faseDeHoje = faseDoDia(diaBRT(), inicioDoEvento ? diaBRT(inicioDoEvento) : '')
  const etapa = faseConfere(leitura.fase, faseDeHoje)
  if (!etapa.ok) {
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
      message: `Este QR Code não é do dia do evento — é da ${NOME_DA_FASE[leitura.fase ?? 'montagem']}. Confira se esta pessoa está credenciada: peça o CPF dela.`,
      faseErrada: { doQR: NOME_DA_FASE[leitura.fase ?? 'montagem'], deHoje: NOME_DA_FASE[faseDeHoje] },
    }
  }
  // Isolamento: master → qualquer evento; admin → só da org; supervisor → só vinculado
  if (!(await podeEscanearEvento(perfil, eventoId))) {
    return { success: false, message: 'Sem acesso a este evento' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cargo, telefone, ativo, descredenciado_em, fornecedor_id, fornecedores(evento_id)')
    .eq('qr_token', token)
    .single()
  if (!func) return { success: false, message: 'Funcionário não encontrado' }

  const funcInfo = { nome: func.nome, cargo: func.cargo ?? null }
  if ((func.fornecedores as any)?.evento_id !== eventoId) {
    return { success: false, message: 'Credencial não pertence a este evento' }
  }
  if (func.ativo === false) {
    return { success: false, message: 'Funcionário cadastrado mas NÃO ativado para trabalhar. Ative-o no painel do setor antes de registrar.', funcionario: funcInfo }
  }
  // Já cumpriu o evento e saiu: o crachá não vale mais aqui. O histórico
  // continua inteiro — o que acabou foi o vínculo com ESTE evento.
  if (func.descredenciado_em) {
    return {
      success: false,
      message: `Já descredenciado deste evento em ${formatarBR(func.descredenciado_em as string, 'curto')}. Para voltar, o organizador precisa recredenciar no painel do setor.`,
      funcionario: funcInfo,
    }
  }

  // Supervisor de setor só escaneia funcionários do próprio setor (fornecedor)
  if (perfil.role === 'supervisor' && perfil.fornecedor_id && func.fornecedor_id !== perfil.fornecedor_id) {
    return { success: false, message: 'Funcionário não pertence ao seu setor', funcionario: funcInfo }
  }

  const resolucao = await resolverRegistro(evento as EventoJanelas & { id: string }, func.id, momento)
  if (!resolucao.ok) return { success: false, message: resolucao.erro, funcionario: funcInfo }

  /*
   * Segunda leitura do mesmo QR no mesmo dia não reescreve nada.
   *
   * Antes valia a última batida. Não vale mais para a entrada, porque ela virou
   * a âncora do horário do meio: reler o crachá uma hora depois empurraria o
   * meio junto, e a pessoa perderia a etapa sem ter feito nada de errado.
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

  const extra: Record<string, unknown> = perfil.role === 'supervisor' ? { criado_por_perfil_id: perfil.id } : {}
  if (momento === 'fim') {
    const justificativa = await observacaoSemMeio(func.id, eventoId, resolucao.dataRef)
    if (justificativa) extra.justificativa = justificativa
  }
  const { error } = await upsertRegistro(func.id, eventoId, momento, extra, resolucao.dataRef, resolucao.jornadaDiaId)
  if (error) return { success: false, message: 'Erro ao registrar. Tente de novo.' }

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
   * Saída no DIA PRINCIPAL fecha o ciclo da pessoa no evento.
   *
   * Só no dia principal: nos dias de preparação a pessoa sai e volta no dia
   * seguinte, e descredenciar ali a impediria de bater o ponto na montagem do
   * dia seguinte.
   */
  const encerrou = momento === 'fim' && resolucao.diaPrincipal
  if (encerrou) await descredenciar(func.id, perfil.id)

  return {
    success: true,
    message: momento === 'entrada'
      ? 'Entrada registrada!'
      : encerrou
        ? 'Saída registrada. Descredenciado do evento!'
        : 'Saída registrada!',
    funcionario: funcInfo,
    momento,
  }
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
  if (!podePassar(`foto:${token}`, 20, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, ativo, fornecedores(evento_id, eventos(id, ${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (func.ativo === false) return { error: 'Seu cadastro ainda não foi ativado pelo organizador. Fale com o seu supervisor.' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  const resolucao = await resolverRegistro({ ...evento, id: eventoId }, func.id, 'meio')
  if (!resolucao.ok) return { error: resolucao.erro }
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
  /*
   * SAÍDA livre desligada — decisão do Juan, não limitação técnica.
   *
   * O auto-atendimento de entrada e saída (cartaz da portaria ou botão livre)
   * foi construído e chegou a funcionar, mas a saída específica ainda não
   * está madura pra operação real: "não tá mapeado, não tá estudado como a
   * gente pode fazer na prática" — o risco é alguém sair sem ninguém
   * confirmar de verdade que foi ela. Por ora a saída volta a exigir sempre
   * o QR mostrado no credenciamento (Fluxo 1), igual sempre foi.
   *
   * A trava fica aqui, não só escondendo o botão em CheckinPresenca.tsx: uma
   * recusa só na tela não impede quem chama esta action direto.
   *
   * Reversível: tirar este bloco (e o `info.momento !== 'fim'` equivalente em
   * CheckinPresenca.tsx) religa exatamente o que já existia, sem reescrever
   * nada — o resto da função continua intacto.
   */
  if (momento === 'fim') {
    return { error: 'A saída ainda precisa ser feita mostrando o QR Code no credenciamento.' }
  }

  // Mesmo teto da foto do meio: ação pública, protegida só pelo token.
  if (!podePassar(`livre:${token}`, 20, 10 * 60 * 1000)) {
    return { error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, telefone, ativo, fornecedores(evento_id, eventos(id, token_portaria, ${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }
  if (func.ativo === false) return { error: 'Seu cadastro ainda não foi ativado pelo organizador. Fale com o seu supervisor.' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  const resolucao = await resolverRegistro({ ...evento, id: eventoId }, func.id, momento)
  if (!resolucao.ok) return { error: resolucao.erro }

  /*
   * No dia principal, este caminho só existe se o admin ligou. Fora dele
   * (montagem/desmontagem), é sempre permitido — não depende de nenhuma
   * configuração, porque não existe operador de plantão o tempo todo nesses
   * dias.
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
  /*
   * Inalcançável ENQUANTO a saída livre estiver desligada (ver o retorno
   * antecipado no topo da função) — `momento` só chega aqui como 'entrada'.
   * Mantido de propósito, não apagado: é o que volta a valer sozinho no dia
   * em que aquele bloqueio for removido. O `as string` só evita o TypeScript
   * reclamar de uma comparação que, por enquanto, nunca é verdadeira.
   */
  if ((momento as string) === 'fim') {
    const semMeio = await observacaoSemMeio(func.id, eventoId, resolucao.dataRef)
    if (semMeio) observacoes.push(semMeio)
  }
  if (observacoes.length) extra.justificativa = observacoes.join(' ')

  const { data: registro, error } = await upsertRegistro(func.id, eventoId, momento, extra, resolucao.dataRef, resolucao.jornadaDiaId)
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

  if (latitude != null && longitude != null) {
    after(() => sincronizarEndereco(registro.id, latitude, longitude).catch(console.error))
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
 * Insere um funcionário a partir do formulário público. O token do formulário já
 * foi validado ao abrir a página; aqui revalidamos o fornecedor no servidor.
 * Formulário curto: nome, CPF, telefone, função e cidade.
 */
export async function cadastrarFuncionarioPublico(
  fornecedorId: string,
  dados: { nome: string; cpf: string; telefone: string; cargo: string; chavePix?: string; cidade?: string; consentimento?: boolean; fotoBase64?: string; origem?: string }
): Promise<{ qrToken?: string; error?: string }> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) return { error: 'Formulário inválido' }

  // O link do formulário circula em grupo de WhatsApp: sem teto, um script
  // enche o setor de cadastros falsos e trava a operação no dia do evento.
  if (!podePassar(`cadastro:${fornecedorId}`, 60, 60 * 60 * 1000)) {
    return { error: 'Muitos cadastros seguidos por este link. Espere alguns minutos e tente de novo.' }
  }

  const cpf = dados.cpf.replace(/\D/g, '')
  if (!validarCpf(cpf)) return { error: 'O CPF precisa ter 11 dígitos.' }

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
   */
  const cidade = (dados.cidade ?? '').trim()
  if (cidade.length < 2) {
    return { error: 'Informe a cidade onde você mora — é por ela que os organizadores encontram você para outros eventos.' }
  }

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
    .select('qr_token, fornecedor_id, fornecedores!inner(evento_id, nome)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', fornecedor.evento_id)
    .limit(1)
  if (existentes && existentes.length) {
    const existente = existentes[0] as any
    if (existente.fornecedor_id === fornecedorId) return { qrToken: existente.qr_token }
    const setorExistente = existente.fornecedores?.nome ?? 'outro setor'
    return { error: `Este CPF já está credenciado neste evento pelo setor ${setorExistente}. Não é permitido se cadastrar em duas empresas ou funções no mesmo evento.` }
  }

  const { data, error } = await supabaseAdmin.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: dados.nome.trim(),
    cpf,
    telefone: dados.telefone.replace(/\D/g, ''),
    cargo: dados.cargo.trim(),
    chave_pix: dados.chavePix?.trim() || null,
    cidade,
    consentimento_base: true,
    consentimento_em: new Date().toISOString(),
    ativo: true,
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

  after(() => sincronizarFuncionarioNaPlanilha(data.id).catch(console.error))
  after(() => sincronizarAgendamentos(fornecedor.evento_id).catch(console.error))
  after(() => agendarBoasVindasFuncionario({
    eventoId: fornecedor.evento_id,
    funcionarioId: data.id,
    telefone: dados.telefone,
  }).catch(console.error))
  return { qrToken: data.qr_token }
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
): Promise<{ nome: string; telefone: string; empresa: string; cargo: string; chavePix: string | null; cidade: string | null } | null> {
  const cpf = cpfBruto.replace(/\D/g, '')
  if (!validarCpf(cpf)) return null

  /*
   * 40 consultas por hora por setor. Uma pessoa preenchendo o formulário faz
   * UMA; quem faz quarenta está varrendo. O limite é por token de formulário
   * porque é o único identificador estável que existe aqui — não há sessão, e
   * IP em serverless atrás de CDN não é confiável.
   */
  if (!podePassar(`cpf:${fornecedorId}`, 40, 60 * 60 * 1000)) return null

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
  return {
    nome: func.nome,
    telefone: func.telefone,
    empresa: func.empresa ?? '',
    cargo: func.cargo ?? '',
    chavePix: func.chave_pix ?? null,
    cidade: func.cidade ?? null,
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
  if (!validarCpf(cpf)) return { error: 'O CPF precisa ter 11 dígitos.' }

  // Mesmo teto do resto do fluxo público: protege um QR fixo, impresso e
  // exposto, de virar varredura de CPF.
  if (!podePassar(`portaria-cpf:${eventoId}`, 60, 60 * 60 * 1000)) {
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

/** Teto de resultados por busca — lista maior que isso não se escolhe, se refina. */
const MAX_CANDIDATOS = 25

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
  return { historico: h }
}

export async function localizarFuncionario(
  termo: string
): Promise<{ funcionario?: FuncionarioLocalizado; candidatos?: CandidatoLocalizado[]; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil.role)) return { error: 'Sem permissão para localizar funcionários.' }

  const busca = termo.trim()
  const digitos = busca.replace(/\D/g, '')
  // Só tratamos como CPF quando o que veio é essencialmente número: um nome
  // com um dígito no meio continua sendo nome.
  const pareceCpf = digitos.length >= 3 && digitos.length >= busca.replace(/\s/g, '').length - 3

  if (!busca) return { error: 'Digite o CPF ou o nome da pessoa.' }
  if (!pareceCpf && busca.length < 3) return { error: 'Digite pelo menos 3 letras do nome.' }
  if (pareceCpf && digitos.length === 11 && !validarCpf(digitos)) {
    return { error: 'O CPF precisa ter 11 dígitos.' }
  }

  const consulta = supabaseAdmin
    .from('funcionarios')
    .select(SELECT_LOCALIZAR)
    .eq('fornecedores.eventos.ativo', true)
    .limit(200)

  if (pareceCpf) {
    if (digitos.length === 11) consulta.eq('cpf', digitos)
    else consulta.like('cpf', `%${digitos}%`)
  } else {
    consulta.ilike('nome', `%${busca}%`)
  }

  const { data: achados } = await consulta

  // Filtra pelo que ESTE usuário pode enxergar antes de dizer se achou ou não —
  // "não encontrado" também protege quem está fora do escopo dele.
  const visiveis = (achados ?? []).filter(f => {
    if (perfil.role === 'supervisor') return f.fornecedor_id === perfil.fornecedor_id
    if (ehMaster(perfil.role)) return true
    return comEvento(f.fornecedores)?.eventos?.organizacao_id === perfil.organizacao_id
  })

  if (!visiveis.length) {
    const onde = perfil.role === 'supervisor' ? 'no seu setor' : 'nos eventos ativos'
    return {
      error: pareceCpf
        ? `Nenhuma pessoa com este CPF ${onde}. Confira o número ou tente pelo nome.`
        : `Ninguém com esse nome ${onde}. Tente parte do nome ou busque pelo CPF.`,
    }
  }

  // Mais de uma pessoa: quem escolhe é o supervisor, não o sistema. Com nome
  // isso é o normal; com CPF acontece quando a pessoa está em dois eventos
  // ativos ao mesmo tempo.
  if (visiveis.length > 1) {
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
        }
      }),
    }
  }

  return fichaDoFuncionario(visiveis[0])
}

/** Carrega a ficha completa depois que o supervisor escolhe alguém da lista. */
export async function abrirFuncionarioLocalizado(
  funcionarioId: string
): Promise<{ funcionario?: FuncionarioLocalizado; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil.role)) return { error: 'Sem permissão para localizar funcionários.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(SELECT_LOCALIZAR)
    .eq('id', funcionarioId)
    .eq('fornecedores.eventos.ativo', true)
    .single()

  // O escopo é conferido de novo aqui: o id chega do navegador, então não dá
  // pra confiar que veio de uma lista que já tinha sido filtrada.
  if (!func) return { error: 'Esta pessoa não está em nenhum evento ativo.' }
  const dentroDoEscopo = perfil.role === 'supervisor'
    ? func.fornecedor_id === perfil.fornecedor_id
    : ehMaster(perfil.role) || comEvento(func.fornecedores)?.eventos?.organizacao_id === perfil.organizacao_id
  if (!dentroDoEscopo) return { error: 'Esta pessoa está fora do seu acesso.' }

  return fichaDoFuncionario(func)
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
  dados: { fotoBase64: string; latitude?: number; longitude?: number; dispositivo?: string }
): Promise<{ ok?: boolean; error?: string; nome?: string; etapa?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeAcompanhar(perfil.role)) return { error: 'Sem permissão para registrar presença.' }
  const etapaEscolhida = ORDEM_ETAPAS.find(e => e.momento === momento)
  if (!etapaEscolhida) return { error: 'Etapa inválida.' }

  const match = dados.fotoBase64?.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { error: 'A foto da pessoa é obrigatória — é ela que comprova que o colaborador estava presente.' }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, telefone, ativo, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, ativo, organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return { error: 'Funcionário não encontrado.' }

  const evento = comEvento(func.fornecedores)?.eventos

  if (perfil.role === 'supervisor') {
    if (func.fornecedor_id !== perfil.fornecedor_id) return { error: 'Esta pessoa é de outro setor. Você só registra a sua equipe.' }
  } else if (!ehMaster(perfil.role) && evento?.organizacao_id !== perfil.organizacao_id) {
    return { error: 'Esta pessoa é de outra organização.' }
  }

  if (!evento?.ativo) return { error: 'Este evento já foi encerrado.' }
  if (func.ativo === false) return { error: 'Esta pessoa não está ativada no evento. Ative no painel do setor antes de registrar.' }

  /*
   * O dia é recalculado no servidor (o que a tela mostrou pode ter mudado),
   * mas a ETAPA é a que o operador escolheu — não é mais recomputada aqui.
   * Escolher uma etapa que já tem registro é uma correção deliberada, não
   * um erro: `upsertRegistro` grava por cima, e o índice único do banco
   * garante que nunca vira uma segunda linha.
   */
  const refAssistido = await diaDeReferencia(evento, func.id)

  const contentType = match[1]
  const ext = contentType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  const path = `${evento.id}/${func.id}/assistido-${momento}-${refAssistido.dataRef}.${ext}`
  const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, { contentType, upsert: true })
  if (up.error) return { error: 'Não foi possível salvar a foto. Tente de novo.' }

  const temGps = typeof dados.latitude === 'number' && typeof dados.longitude === 'number'
  const { data: registro, error } = await upsertRegistro(func.id, evento.id, momento, {
    foto_url: path,
    criado_por_perfil_id: perfil.id,
    registro_manual: true,
    justificativa: JUSTIFICATIVA_ASSISTIDO,
    dispositivo: dados.dispositivo?.slice(0, 300) ?? null,
    ...(temGps ? { latitude: dados.latitude, longitude: dados.longitude } : {}),
  }, refAssistido.dataRef, refAssistido.jornadaDiaId)
  if (error) return { error: mensagemAmigavel(error) }

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
  // Mesma regra do scanner: a saída do dia principal fecha o vínculo.
  if (momento === 'fim' && refAssistido.diaPrincipal) {
    await descredenciar(func.id, perfil.id)
  }

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
  if (!perfil || !(podeGerenciarEventos(perfil.role) || perfil.role === 'supervisor')) {
    return { error: 'Sem permissão para lançar ponto manualmente.' }
  }

  const etapaEscolhida = ORDEM_ETAPAS.find(e => e.momento === momento)
  if (!etapaEscolhida) return { error: 'Etapa inválida.' }

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
    .select('id, nome, telefone, ativo, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, ativo, organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return { error: 'Funcionário não encontrado.' }

  const evento = comEvento(func.fornecedores)?.eventos
  if (!evento) return { error: 'Evento não encontrado.' }

  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    if (!meus.some(s => s.id === func.fornecedor_id)) {
      return { error: 'Esta pessoa é de outro setor. Você só lança ponto da sua equipe.' }
    }
  } else if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { error: 'Esta pessoa é de outra organização.' }
  }

  if (func.ativo === false) {
    return { error: 'Esta pessoa não está ativada no evento. Ative no painel do setor antes de lançar o ponto.' }
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

  const { error } = await upsertRegistro(func.id, evento.id, momento, {
    created_at: quandoISO,
    criado_por_perfil_id: perfil.id,
    registro_manual: true,
    justificativa,
  }, dataRef, dia.id ?? null)
  if (error) return { error: mensagemAmigavel(error) }

  revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
  revalidatePath(`/admin/eventos/${evento.id}/presenca`)
  return { ok: true, nome: func.nome as string, etapa: etapaEscolhida.rotulo }
}

/**
 * URL temporária de uma foto de presença, para o admin conferir a batida.
 *
 * ⚠️ Esta função é uma Server Action: qualquer pessoa na internet pode
 * chamá-la. Antes ela aceitava um caminho QUALQUER e devolvia uma URL
 * assinada — bastava adivinhar o caminho pra baixar a selfie de qualquer
 * funcionário de qualquer organização, ou a foto de perfil de qualquer
 * cliente. Um IDOR clássico.
 *
 * Agora o caminho não é confiado: ele é procurado no banco, e só é liberado
 * se pertencer a um registro/funcionário que ESTE usuário pode ver.
 */
export async function urlAssinadaFoto(path: string): Promise<string | null> {
  const perfil = await getPerfil()
  if (!perfil) return null

  const caminho = String(path ?? '').trim()
  if (!caminho) return null

  /*
   * De onde a foto pode vir, e quem pode vê-la:
   *   registros.foto_url       → selfie de presença   → quem enxerga o evento
   *   funcionarios.foto_perfil → avatar da pessoa     → quem enxerga o evento
   *   organizacoes.foto_perfil → logo do cliente      → a própria org, ou master
   * Qualquer caminho fora disso não existe pro sistema, então não é assinado.
   */
  const [{ data: registro }, { data: func }, { data: org }] = await Promise.all([
    supabaseAdmin.from('registros')
      .select('evento_id, funcionarios!inner(fornecedor_id)')
      .eq('foto_url', caminho).limit(1).maybeSingle(),
    supabaseAdmin.from('funcionarios')
      .select('fornecedor_id, fornecedores!inner(evento_id)')
      .eq('foto_perfil_path', caminho).limit(1).maybeSingle(),
    supabaseAdmin.from('organizacoes')
      .select('id').eq('foto_perfil_path', caminho).limit(1).maybeSingle(),
  ])

  let liberado = false

  if (org) {
    liberado = ehMaster(perfil.role) || org.id === perfil.organizacao_id
  } else if (registro || func) {
    const eventoId = registro
      ? (registro.evento_id as string)
      : ((func!.fornecedores as unknown as { evento_id: string }).evento_id)
    const fornecedorId = registro
      ? ((registro.funcionarios as unknown as { fornecedor_id: string }).fornecedor_id)
      : (func!.fornecedor_id as string)

    if (perfil.role === 'supervisor') {
      // Supervisor vê a foto só de quem é do setor dele.
      liberado = perfil.fornecedor_id === fornecedorId
    } else {
      const { data: evento } = await supabaseAdmin
        .from('eventos').select('organizacao_id').eq('id', eventoId).single()
      liberado = ehMaster(perfil.role) || (!!evento && evento.organizacao_id === perfil.organizacao_id)
    }
  }

  if (!liberado) return null

  const { data } = await supabaseAdmin.storage.from('presencas').createSignedUrl(caminho, 60 * 60)
  return data?.signedUrl ?? null
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
  await exigirEventoDaOrg(eventoId)

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('token_portaria').eq('id', eventoId).single()

  const token = (evento?.token_portaria as string | null) ?? randomBytes(16).toString('hex')

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ portaria_ativa: ligar, token_portaria: token })
    .eq('id', eventoId)

  if (error) throw new Error('Não foi possível mudar o cadastro da portaria. Tente de novo.')

  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const, token }
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
  await exigirEventoDaOrg(eventoId)

  const { error } = await supabaseAdmin
    .from('eventos')
    .update({ token_portaria: randomBytes(16).toString('hex') })
    .eq('id', eventoId)

  if (error) throw new Error('Não foi possível gerar um novo QR. Tente de novo.')
  revalidatePath(`/admin/eventos/${eventoId}`)
  return { ok: true as const }
}

// ─── Configuração do meio (setores × dias) ────────────────────────────────

export type ConfiguracaoDoMeio = {
  setores: { id: string; nome: string; exigeMeio: boolean }[]
  dias: { data: string; tipo: 'principal' | 'preparacao'; exigeMeio: boolean }[]
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
export async function obterConfiguracaoDoMeio(eventoId: string): Promise<ConfiguracaoDoMeio> {
  await exigirEventoDaOrg(eventoId)

  const [{ data: setoresBase }, { data: diasBase }] = await Promise.all([
    supabaseAdmin.from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome'),
    supabaseAdmin.from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
  ])

  const comMeio = await setoresComMeio((setoresBase ?? []).map(s => s.id as string))
  const { ok: diasDisponiveis, dias: diasComMeioSet } = await diasComMeio(eventoId)

  return {
    setores: (setoresBase ?? []).map(s => ({ id: s.id as string, nome: s.nome as string, exigeMeio: comMeio.has(s.id as string) })),
    dias: (diasBase ?? []).map(d => ({
      data: d.data as string,
      tipo: ((d.tipo as string) === 'principal' ? 'principal' : 'preparacao') as 'principal' | 'preparacao',
      // Migração pendente ⇒ todos ligados, que é o padrão da coluna.
      exigeMeio: diasDisponiveis ? diasComMeioSet.has(d.data as string) : true,
    })),
    diasDisponiveis,
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
  await exigirEventoDaOrg(eventoId)

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
  if (erroSetor) throw new Error('A configuração por setor precisa da migração supabase/upgrade-meio-por-setor.sql aplicada no banco.')

  const { data: diasDoEvento } = await supabaseAdmin
    .from('jornada_dias').select('data').eq('evento_id', eventoId)
  const datasDoEvento = (diasDoEvento ?? []).map(d => d.data as string)
  const datasLigadas = datasDoEvento.filter(d => diasLigados.includes(d))
  const datasDesligadas = datasDoEvento.filter(d => !diasLigados.includes(d))

  const erroDia = (
    (datasLigadas.length ? (await supabaseAdmin.from('jornada_dias').update({ exige_meio: true }).eq('evento_id', eventoId).in('data', datasLigadas)).error : null)
    ?? (datasDesligadas.length ? (await supabaseAdmin.from('jornada_dias').update({ exige_meio: false }).eq('evento_id', eventoId).in('data', datasDesligadas)).error : null)
  )
  if (erroDia) throw new Error('A configuração por dia precisa da migração supabase/upgrade-meio-por-dia.sql aplicada no banco.')

  after(() => sincronizarAgendamentos(eventoId).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}`)
  revalidatePath(`/admin/eventos/${eventoId}/editar`)
  return { ok: true as const, setores: ligados.length, dias: datasLigadas.length }
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
    throw new Error('Escolha ao menos um setor pra este aviso.')
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
      throw new Error('Um dos setores escolhidos não pertence a este evento.')
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

  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

export async function editarAviso(avisoId: string, eventoId: string, formData: FormData) {
  await exigirEventoDaOrg(eventoId)
  const dados = dadosAvisoDoForm(formData)
  await exigirDestinatariosDoEvento(eventoId, dados)

  const { data: atual } = await supabaseAdmin.from('avisos').select('id, evento_id').eq('id', avisoId).single()
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

  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

export async function alternarAtivoAviso(avisoId: string, eventoId: string, ativo: boolean) {
  await exigirEventoDaOrg(eventoId)
  const { error } = await supabaseAdmin.from('avisos').update({ ativo }).eq('id', avisoId).eq('evento_id', eventoId)
  if (error) throw new Error(mensagemAmigavel(error))
  revalidatePath(`/admin/eventos/${eventoId}/avisos`)
}

/**
 * Exclui um aviso. Diferente da regra geral de exclusão (`podeExcluir`, só
 * master): aviso é conteúdo de comunicação, sem histórico de presença nem
 * pagamento embaixo — o próprio admin que criou pode apagar, é o que o
 * pedido descreve.
 */
export async function excluirAviso(avisoId: string, eventoId: string) {
  await exigirEventoDaOrg(eventoId)
  const { error } = await supabaseAdmin.from('avisos').delete().eq('id', avisoId).eq('evento_id', eventoId)
  if (error) throw new Error(mensagemAmigavel(error))
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
