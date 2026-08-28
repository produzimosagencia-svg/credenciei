'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getPerfil, supabaseAdmin, podeEscanearEvento } from './supabase-server'
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
  podeEscanear,
  ehMaster,
} from './permissions'
import { inputParaISO, formatarBR } from './tz'
import {
  diaBRT, janelaDoMeio, dentroDaJanela, avaliarEntradaSaida,
  HORAS_ATE_MEIO, TETO_TURNO_H, type EventoJanelas, type DiaDaJornada,
} from './janelas'
import { validarCpf } from './format'
import { normalizarUsuario, validarUsuario, usuarioParaEmail } from './usuario'
import { mensagemAmigavel } from './erros'
import { podePassar } from './limite'
import { sincronizarAgendamentos, agendarCredenciaisSupervisor, agendarBoasVindasFuncionario, agendarMeioAposEntrada } from './mensagens'
import { enderecoAproximado } from './geocoding'
import { lerCodigoQR } from './credencial-qr'

// Com RLS ligado, o banco só é acessível pela service role (no servidor).
// A autorização por organização é feita aqui, via getPerfil, antes de cada operação.
function getAdminSupabase() {
  return supabaseAdmin
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

/**
 * Normaliza a lista de CPFs pré-autorizados do setor (um por linha ou
 * separados por vírgula/;). Guarda só dígitos, um CPF por linha.
 * Lista vazia → null (trava desligada).
 */
function normalizarCpfsAutorizados(bruto: FormDataEntryValue | null): string | null {
  const cpfs = ((bruto as string) || '')
    .split(/[\n,;]+/)
    .map(c => c.replace(/\D/g, ''))
    .filter(c => c.length === 11)
  return cpfs.length ? [...new Set(cpfs)].join('\n') : null
}

/**
 * Decide se um funcionário recém-cadastrado já entra ATIVADO: dentro do teto
 * (quantidade_estimada do setor) sim; acima do teto entra como excedente
 * (ativo=false), aguardando o produtor/supervisor ativar manualmente.
 * Sem teto definido, todo mundo entra ativado.
 */
async function estaDentroDoTeto(fornecedorId: string): Promise<boolean> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('quantidade_estimada')
    .eq('id', fornecedorId)
    .single()
  const teto = fornecedor?.quantidade_estimada
  if (!teto || teto <= 0) return true
  const { count } = await supabaseAdmin
    .from('funcionarios')
    .select('id', { count: 'exact', head: true })
    .eq('fornecedor_id', fornecedorId)
    .eq('ativo', true)
  return (count ?? 0) < teto
}

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
export async function criarSupervisor(fornecedorId: string, eventoId: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para criar supervisores')

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome, token_formulario, eventos(organizacao_id, nome, data_inicio)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) throw new Error('Setor não encontrado')
  const eventoDoFornecedor = fornecedor.eventos as any
  const organizacaoId = eventoDoFornecedor?.organizacao_id
  if (!ehMaster(perfil!.role) && organizacaoId !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este setor')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const senha = formData.get('senha') as string
  const ativo = formData.get('ativo') !== 'false'

  /*
   * Supervisor entra por NOME DE USUÁRIO, não por e-mail.
   *
   * Quem trabalha no portão muitas vezes não tem e-mail à mão, e o organizador
   * acabava inventando um endereço — que precisava ser único na plataforma
   * inteira e travava o cadastro na hora errada. O nome de usuário vira um
   * endereço num domínio interno, que ninguém possui e que nunca recebe nada.
   */
  const usuario = normalizarUsuario((formData.get('usuario') as string) ?? '')
  const erroUsuario = validarUsuario(usuario)
  if (erroUsuario) throw new Error(erroUsuario)
  const email = usuarioParaEmail(usuario)

  const admin = getAdminSupabase()
  if (!senha || senha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.')

  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) {
    // O Auth fala em "e-mail"; aqui quem existe é o nome de usuário.
    const jaExiste = /already|exist|registered/i.test(error.message)
    throw new Error(jaExiste
      ? `O nome de usuário "${usuario}" já está em uso. Escolha outro — por exemplo, ${usuario}.2 ou ${usuario}.bar.`
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

  // Envia as credenciais de acesso por WhatsApp (não bloqueia; sobrevive ao serverless)
  if (telefone) {
    after(() => agendarCredenciaisSupervisor({
      eventoId,
      perfilId: user.user!.id,
      telefone,
      nome,
      setorNome: fornecedor.nome,
      eventoNome: eventoDoFornecedor?.nome ?? '',
      dataEvento: formatarBR(eventoDoFornecedor?.data_inicio, 'data'),
      // O supervisor entra com o USUÁRIO; o endereço interno nunca aparece
      // pra ele.
      email: usuario,
      senha,
      linkFormulario: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'}/form/${fornecedor.token_formulario}`,
    }).catch(console.error))
  }

  revalidatePath('/admin/usuarios')
  revalidatePath(`/admin/eventos/${eventoId}`)
}

/** Edita nome/e-mail/telefone/status e, opcionalmente, a senha do supervisor. */
export async function editarSupervisor(id: string, formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão')

  const admin = getAdminSupabase()
  const { data: alvo } = await admin.from('perfis').select('organizacao_id, fornecedor_id').eq('id', id).single()
  if (!alvo) throw new Error('Supervisor não encontrado')
  if (!ehMaster(perfil!.role) && alvo.organizacao_id !== perfil!.organizacao_id) {
    throw new Error('Sem permissão sobre este supervisor')
  }

  const nome = ((formData.get('nome') as string) ?? '').trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const novaSenha = (formData.get('senha') as string) || ''
  if (novaSenha && novaSenha.length < 6) throw new Error('Senha muito curta. Use ao menos 6 caracteres.')

  const usuario = normalizarUsuario((formData.get('usuario') as string) ?? '')
  const erroUsuario = validarUsuario(usuario)
  if (erroUsuario) throw new Error(erroUsuario)
  const email = usuarioParaEmail(usuario)

  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    email,
    ...(novaSenha ? { password: novaSenha } : {}),
  })
  if (authErr) {
    const jaExiste = /already|exist|registered/i.test(authErr.message)
    throw new Error(jaExiste ? `O nome de usuário "${usuario}" já está em uso.` : mensagemAuth(authErr.message))
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

  const db = supabaseAdmin
  const { data: novo, error } = await db.from('eventos').insert([data]).select('id').single()
  if (error) throw new Error('Não foi possível criar o evento. Confira os dados e tente de novo.')

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
  await db.from('eventos').update(data).eq('id', id)
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
  const qtd = formData.get('quantidade_estimada') as string
  const nomeFornecedor = formData.get('nome') as string
  const data = {
    evento_id: eventoId,
    nome: nomeFornecedor,
    quantidade_estimada: qtd ? parseInt(qtd) : null,
    valor_combinado: parseValor(formData.get('valor_combinado')),
    cpfs_autorizados: normalizarCpfsAutorizados(formData.get('cpfs_autorizados')),
  }
  await db.from('fornecedores').insert([data])

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
  const qtd = formData.get('quantidade_estimada') as string
  await db.from('fornecedores').update({
    nome: formData.get('nome') as string,
    quantidade_estimada: qtd ? parseInt(qtd) : null,
    valor_combinado: parseValor(formData.get('valor_combinado')),
    cpfs_autorizados: normalizarCpfsAutorizados(formData.get('cpfs_autorizados')),
  }).eq('id', id)
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
    empresa: (formData.get('empresa') as string).trim(),
    cargo: ((formData.get('cargo') as string) || '').trim(),
    ativo: await estaDentroDoTeto(fornecedorId),
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
      .select('nome, cpf, telefone, empresa, cargo, cidade, chave_pix')
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
    // A empresa passa a ser o setor de destino: ela descreve onde a pessoa
    // trabalha NESTE evento, não onde trabalhou no anterior.
    empresa: setor.nome,
    cargo: pessoa.cargo ?? '',
    cidade: pessoa.cidade ?? null,
    chave_pix: pessoa.chave_pix ?? null,
    ativo: await estaDentroDoTeto(fornecedorId),
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

/** Marca/desmarca a baixa de pagamento do valor a receber do setor. */
export async function alternarPagamento(funcionarioId: string, fornecedorId: string, eventoId: string, pago: boolean) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin

  // Pagamento só para quem está ativado (selecionado dentro do teto do setor)
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
 * Ativa/desativa um funcionário do setor. A ATIVAÇÃO respeita o teto
 * (quantidade_estimada): o cadastro pode passar do estimado, mas só até o
 * teto pode estar ativo ao mesmo tempo — é a trava de seleção pedida pelo
 * cliente (pagamento e presença só para os ativados).
 */
export async function alternarAtivacao(funcionarioId: string, fornecedorId: string, eventoId: string, ativo: boolean) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin

  if (ativo) {
    const { data: fornecedor } = await db.from('fornecedores').select('quantidade_estimada').eq('id', fornecedorId).single()
    const teto = fornecedor?.quantidade_estimada
    if (teto && teto > 0) {
      const { count } = await db
        .from('funcionarios')
        .select('id', { count: 'exact', head: true })
        .eq('fornecedor_id', fornecedorId)
        .eq('ativo', true)
      if ((count ?? 0) >= teto) {
        throw new Error(`O setor já tem ${teto} funcionários ativados (limite definido). Desative alguém antes de ativar este.`)
      }
    }
  }

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
      empresa: func.empresa,
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

const JANELA_SELECT = 'data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim'

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
  return (dias?.[0] as DiaDeTrabalho | undefined) ?? null
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
     * jornada com a pessoa depois. Fechar a janela criaria um beco sem saída:
     * como a saída exige o meio, quem passasse do horário não conseguiria nem
     * registrar o meio nem ir embora, e ficaria dependendo do supervisor para
     * bater o cartão às onze da noite.
     *
     * Chegar atrasado não some do relatório: a tela de pendências e o
     * histórico comparam o horário feito com o esperado e mostram a diferença.
     */
    if (agora.getTime() < new Date(janela.inicio).getTime()) {
      const porque = dia?.tipo === 'principal' || !entrada
        ? ''
        : ` Ele abre ${HORAS_ATE_MEIO}h depois da sua entrada, que foi às ${formatarBR(entrada.em, 'hora')}.`
      return { ok: false, erro: `O registro do meio ainda não abriu.${porque}` }
    }
  } else {
    const veredito = avaliarEntradaSaida(evento, dia, momento, dataRef, agora)
    if (!veredito.ok) return { ok: false, erro: veredito.erro }

    /*
     * Saída exige o meio.
     *
     * Pedido explicitamente: o horário do meio precisa estar gravado pra ser
     * possível justificar a jornada com a pessoa depois. Deixar sair sem ele
     * deixaria um buraco no meio do turno que ninguém consegue reconstruir.
     *
     * Quando a pessoa perdeu o meio de verdade, quem resolve é o supervisor
     * pelo registro assistido — ele grava a etapa pendente com foto e
     * auditoria, e aí a saída destrava.
     */
    if (momento === 'fim') {
      const { data: temMeio } = await supabaseAdmin
        .from('registros')
        .select('id')
        .eq('funcionario_id', funcionarioId)
        .eq('evento_id', evento.id)
        .eq('tipo', 'meio')
        .eq('data_ref', dataRef)
        .limit(1)
      if (!temMeio?.length) {
        return {
          ok: false,
          erro: 'Registre o meio antes de sair. Abra sua credencial, tire a selfie do meio e volte aqui — a saída libera na hora.',
        }
      }
    }
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
  funcionario?: { nome: string; empresa: string; cargo: string | null }
  momento?: MomentoPresenca
  /** Já havia registro desta etapa no dia — nada foi gravado agora. */
  jaRegistrado?: boolean
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
  const leitura = lerCodigoQR((qrData ?? '').split('|')[0]?.trim() ?? '')
  if (!leitura.ok) return { success: false, message: leitura.erro }
  const token = leitura.token

  const { data: evento } = await supabaseAdmin
    .from('eventos')
    .select(`id, organizacao_id, ${JANELA_SELECT}`)
    .eq('id', eventoId)
    .single()
  if (!evento) return { success: false, message: 'Evento não encontrado' }
  // Isolamento: master → qualquer evento; admin → só da org; supervisor → só vinculado
  if (!(await podeEscanearEvento(perfil, eventoId))) {
    return { success: false, message: 'Sem acesso a este evento' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, empresa, cargo, telefone, ativo, descredenciado_em, fornecedor_id, fornecedores(evento_id)')
    .eq('qr_token', token)
    .single()
  if (!func) return { success: false, message: 'Funcionário não encontrado' }

  const funcInfo = { nome: func.nome, empresa: func.empresa, cargo: func.cargo ?? null }
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

  const extra = perfil.role === 'supervisor' ? { criado_por_perfil_id: perfil.id } : {}
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

/**
 * Check-in por FOTO + GPS do próprio funcionário — exclusivo da etapa MEIO
 * (durante o evento). Chamado da página pública da credencial; o token
 * (qr_token) é o segredo que identifica a pessoa.
 */
export async function registrarPresencaFoto(
  token: string,
  fotoBase64: string,
  latitude: number | null,
  longitude: number | null
): Promise<{ ok?: boolean; error?: string }> {
  if (latitude == null || longitude == null) return { error: 'Localização obrigatória. Ative o GPS e tente de novo.' }
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

  const { data: registro, error } = await upsertRegistro(
    func.id, eventoId, 'meio', { foto_url: path, latitude, longitude },
    resolucao.dataRef,
    resolucao.jornadaDiaId,
  )
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

  after(() => sincronizarEndereco(registro.id, latitude, longitude).catch(console.error))

  return { ok: true }
}

// ─── Cadastro público (formulário do fornecedor) ──────────────────────────────

/**
 * Insere um funcionário a partir do formulário público. O token do formulário já
 * foi validado ao abrir a página; aqui revalidamos o fornecedor no servidor.
 * Formulário curto: nome, CPF, telefone e empresa.
 */
export async function cadastrarFuncionarioPublico(
  fornecedorId: string,
  dados: { nome: string; cpf: string; telefone: string; empresa: string; cargo: string; chavePix?: string; cidade?: string; consentimento?: boolean; fotoBase64?: string }
): Promise<{ qrToken?: string; error?: string }> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, nome, cpfs_autorizados')
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

  // Trava opcional do setor: se o organizador definiu uma lista de CPFs
  // autorizados, só quem está nela consegue se cadastrar por este link.
  if (fornecedor.cpfs_autorizados) {
    const autorizados = new Set(fornecedor.cpfs_autorizados.split('\n'))
    if (!autorizados.has(cpf)) {
      return { error: 'Seu CPF não está na lista de pessoas autorizadas deste setor. Fale com o seu supervisor.' }
    }
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
    empresa: dados.empresa.trim(),
    cargo: dados.cargo.trim(),
    chave_pix: dados.chavePix?.trim() || null,
    cidade,
    consentimento_base: true,
    consentimento_em: new Date().toISOString(),
    ativo: await estaDentroDoTeto(fornecedorId),
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
  empresa: string | null
  ativo: boolean
  fotoUrl: string | null
  setorId: string
  setorNome: string
  supervisorNome: string | null
  eventoId: string
  eventoNome: string
  ultimaBatida: { rotulo: string; quandoISO: string } | null
  proximaPendente: { momento: MomentoPresenca; rotulo: string } | null
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

export async function localizarFuncionario(
  termo: string
): Promise<{ funcionario?: FuncionarioLocalizado; candidatos?: CandidatoLocalizado[]; error?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil.role)) return { error: 'Sem permissão para localizar funcionários.' }

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
  if (!perfil || !podeEscanear(perfil.role)) return { error: 'Sem permissão para localizar funcionários.' }

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
      empresa: func.empresa,
      ativo: func.ativo !== false,
      fotoUrl,
      setorId: func.fornecedor_id,
      setorNome: fornecedor?.nome ?? '—',
      supervisorNome: supervisores?.[0]?.nome ?? null,
      eventoId: evento.id,
      eventoNome: evento.nome,
      ultimaBatida: ultima,
      proximaPendente: proxima ? { momento: proxima.momento, rotulo: proxima.rotulo } : null,
    },
  }
}

const JUSTIFICATIVA_ASSISTIDO =
  'Batida registrada por supervisor devido à ausência de registro pelo colaborador.'

/**
 * Registro assistido: o supervisor localizou a pessoa, tirou a foto do rosto
 * dela e confirma. O sistema decide sozinho QUAL etapa gravar (a primeira
 * pendente) — o supervisor nunca escolhe, o que evita registrar a etapa errada
 * e tira dele a chance de escolher a que lhe convém.
 *
 * Não valida janela de horário de propósito: existe justamente para o caso em
 * que a janela já fechou. O que sustenta a confiança no registro é a trilha de
 * auditoria — autor, foto da pessoa na hora, GPS, aparelho e motivo.
 */
export async function registrarPresencaAssistida(
  funcionarioId: string,
  dados: { fotoBase64: string; latitude?: number; longitude?: number; dispositivo?: string }
): Promise<{ ok?: boolean; error?: string; nome?: string; etapa?: string }> {
  const perfil = await getPerfil()
  if (!perfil || !podeEscanear(perfil.role)) return { error: 'Sem permissão para registrar presença.' }

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

  // Recalcula a etapa pendente no servidor: o que a tela mostrou pode ter
  // mudado (o próprio colaborador pode ter batido nesse meio tempo).
  const refAssistido = await diaDeReferencia(evento, func.id)
  const { data: registros } = await supabaseAdmin
    .from('registros')
    .select('tipo')
    .eq('funcionario_id', func.id)
    .eq('evento_id', evento.id)
    // Do DIA, não do evento inteiro: numa operação de 30 dias, olhar o evento
    // faria a tela dizer "já registrou tudo" a partir do segundo dia.
    .eq('data_ref', refAssistido.dataRef)
  const feitos = new Set((registros ?? []).map(r => r.tipo))
  const pendente = ORDEM_ETAPAS.find(e => !feitos.has(e.momento))
  if (!pendente) return { error: 'Esta pessoa já registrou todas as etapas — não há nada pendente.' }

  const contentType = match[1]
  const ext = contentType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  const path = `${evento.id}/${func.id}/assistido-${pendente.momento}-${refAssistido.dataRef}.${ext}`
  const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, { contentType, upsert: true })
  if (up.error) return { error: 'Não foi possível salvar a foto. Tente de novo.' }

  const temGps = typeof dados.latitude === 'number' && typeof dados.longitude === 'number'
  const { data: registro, error } = await upsertRegistro(func.id, evento.id, pendente.momento, {
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
  if (pendente.momento === 'entrada' && func.telefone) {
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
  if (pendente.momento === 'fim' && refAssistido.diaPrincipal) {
    await descredenciar(func.id, perfil.id)
  }

  revalidatePath(`/admin/eventos/${evento.id}/fornecedor/${func.fornecedor_id}`)
  return { ok: true, nome: func.nome, etapa: pendente.rotulo }
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
