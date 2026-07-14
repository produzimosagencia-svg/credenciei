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
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  podeGerenciarUsuarios,
  podeGerenciarEventos,
  podeGerenciarOrganizacoes,
  podeExcluirEventos,
  podeEscanear,
  ehMaster,
} from './permissions'
import { inputParaISO, formatarBR } from './tz'
import { sincronizarAgendamentos, agendarCredenciaisSupervisor } from './mensagens'
import { enderecoAproximado } from './geocoding'

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
    drive_folder_id: driveFolderId,
  }]).select('id').single()
  if (orgErr) throw new Error(`Erro ao criar organização: ${orgErr.message}`)

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

  await admin.from('perfis').insert([{
    id: user.user!.id,
    nome: adminNome,
    email,
    role: 'admin',
    organizacao_id: org.id,
  }])

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
  await admin.from('organizacoes').update({
    nome: (formData.get('org_nome') as string).trim(),
    documento: ((formData.get('documento') as string) || '').trim() || null,
    responsavel_nome: ((formData.get('responsavel_nome') as string) || '').trim() || null,
    limite_eventos: limite,
  }).eq('id', id)
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

  const nome = (formData.get('nome') as string).trim()
  const email = (formData.get('email') as string).trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const senha = formData.get('senha') as string
  const ativo = formData.get('ativo') !== 'false'

  const admin = getAdminSupabase()

  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) throw new Error(mensagemAuth(error.message))

  await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    telefone,
    ativo,
    role: 'supervisor',
    organizacao_id: organizacaoId,
    fornecedor_id: fornecedorId,
  }])

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
      email,
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

  const nome = (formData.get('nome') as string).trim()
  const email = (formData.get('email') as string).trim()
  const telefone = ((formData.get('telefone') as string) || '').replace(/\D/g, '')
  const ativo = formData.get('ativo') !== 'false'
  const novaSenha = (formData.get('senha') as string) || ''
  if (novaSenha && novaSenha.length < 6) throw new Error('Senha muito curta. Use ao menos 6 caracteres.')

  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    email,
    ...(novaSenha ? { password: novaSenha } : {}),
  })
  if (authErr) throw new Error(mensagemAuth(authErr.message))

  await admin.from('perfis').update({ nome, email, telefone, ativo }).eq('id', id)

  revalidatePath('/admin/usuarios')
  if (alvo.fornecedor_id) {
    const { data: fornecedor } = await admin.from('fornecedores').select('evento_id').eq('id', alvo.fornecedor_id).single()
    if (fornecedor) revalidatePath(`/admin/eventos/${fornecedor.evento_id}`)
  }
}

export async function deletarUsuario(id: string) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para excluir usuários')
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
  const organizacaoId = perfil.organizacao_id
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
  await db.from('eventos').delete().eq('id', id)
  revalidatePath('/admin/eventos')
  revalidatePath('/admin')
  redirect('/admin/eventos')
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
  }).eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function deletarFornecedor(id: string, eventoId: string) {
  await exigirEventoDaOrg(eventoId)
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
  if (cpf.length !== 11) throw new Error('CPF inválido. Confira os números.')

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
  }]).select('id').single()

  if (error) throw new Error(`Erro ao cadastrar funcionário: ${error.message}`)

  // Sincroniza com a planilha e agenda os lembretes de WhatsApp depois da
  // resposta (não bloqueia; sobrevive ao serverless)
  after(() => sincronizarFuncionarioNaPlanilha(novo.id).catch(console.error))
  after(() => sincronizarAgendamentos(eventoId).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

export async function deletarFuncionario(id: string, fornecedorId: string, eventoId: string) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin
  await db.from('funcionarios').delete().eq('id', id)
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
  if (error) throw new Error('Erro ao salvar o valor')

  // Reflete na planilha depois da resposta (não bloqueia; sobrevive ao serverless)
  after(() => sincronizarValorNaPlanilha(funcionarioId, valor).catch(console.error))

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

/** Marca/desmarca a baixa de pagamento do valor a receber do setor. */
export async function alternarPagamento(funcionarioId: string, fornecedorId: string, eventoId: string, pago: boolean) {
  await exigirAcessoFuncionarios(fornecedorId, eventoId)
  const db = supabaseAdmin
  const { error } = await db.from('funcionarios').update({
    pago,
    pago_em: pago ? new Date().toISOString() : null,
  }).eq('id', funcionarioId)
  if (error) throw new Error('Erro ao atualizar o pagamento')
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
    const horario = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })

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

// ─── Presença: QR (entrada/saída) + foto (meio) ───────────────────────────────
//
// Regra do fluxo: QR CODE escaneado na ENTRADA, FOTO tirada pelo próprio
// funcionário DURANTE o evento (meio), e QR CODE escaneado na SAÍDA (fim).
// Tudo dentro das janelas de horário definidas pelo admin no evento.

export type MomentoPresenca = 'entrada' | 'meio' | 'fim'

const JANELA_SELECT = 'janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim'

/** Valida se AGORA está dentro da janela do momento. Retorna mensagem de erro ou null. */
function validarJanela(evento: any, momento: MomentoPresenca): string | null {
  const inicio = evento?.[`janela_${momento}_inicio`]
  const fim = evento?.[`janela_${momento}_fim`]
  if (!inicio || !fim) return 'O organizador ainda não definiu o horário desta etapa.'
  const agora = new Date()
  if (agora < new Date(inicio)) return 'Ainda não abriu o horário desta etapa.'
  if (agora > new Date(fim)) return 'O horário desta etapa já encerrou.'
  return null
}

/** Substitui o registro do momento (um por etapa) e insere o novo. */
async function upsertRegistro(funcionarioId: string, eventoId: string, momento: MomentoPresenca, extra: Record<string, unknown> = {}) {
  await supabaseAdmin.from('registros').delete().eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('tipo', momento)
  return supabaseAdmin.from('registros').insert([{ funcionario_id: funcionarioId, evento_id: eventoId, tipo: momento, ...extra }]).select('id').single()
}

/** Preenche o endereço aproximado (geocoding reverso) em background — cosmético, sem retry. */
async function sincronizarEndereco(registroId: string, lat: number, lng: number) {
  const endereco = await enderecoAproximado(lat, lng)
  if (!endereco) return
  await supabaseAdmin.from('registros').update({ endereco_aproximado: endereco }).eq('id', registroId)
}

export type ResultadoScan = {
  success: boolean
  message: string
  funcionario?: { nome: string; empresa: string; cargo: string | null }
  momento?: MomentoPresenca
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

  // Tolerante ao formato antigo "token|tipo": usa só o token
  const token = (qrData ?? '').split('|')[0]?.trim()
  if (!token) return { success: false, message: 'QR inválido' }

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
    .select('id, nome, empresa, cargo, fornecedor_id, fornecedores(evento_id)')
    .eq('qr_token', token)
    .single()
  if (!func) return { success: false, message: 'Funcionário não encontrado' }

  const funcInfo = { nome: func.nome, empresa: func.empresa, cargo: func.cargo ?? null }
  if ((func.fornecedores as any)?.evento_id !== eventoId) {
    return { success: false, message: 'Credencial não pertence a este evento' }
  }

  // Supervisor de setor só escaneia funcionários do próprio setor (fornecedor)
  if (perfil.role === 'supervisor' && perfil.fornecedor_id && func.fornecedor_id !== perfil.fornecedor_id) {
    return { success: false, message: 'Funcionário não pertence ao seu setor', funcionario: funcInfo }
  }

  const erroJanela = validarJanela(evento, momento)
  if (erroJanela) return { success: false, message: erroJanela, funcionario: funcInfo }

  const extra = perfil.role === 'supervisor' ? { criado_por_perfil_id: perfil.id } : {}
  const { error } = await upsertRegistro(func.id, eventoId, momento, extra)
  if (error) return { success: false, message: 'Erro ao registrar. Tente de novo.' }

  return {
    success: true,
    message: momento === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!',
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

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select(`id, fornecedores(evento_id, eventos(${JANELA_SELECT}))`)
    .eq('qr_token', token)
    .single()
  if (!func) return { error: 'Credencial não encontrada' }

  const fornecedor = func.fornecedores as any
  const evento = fornecedor?.eventos as any
  const eventoId = fornecedor?.evento_id
  if (!evento || !eventoId) return { error: 'Evento não encontrado' }

  const erroJanela = validarJanela(evento, 'meio')
  if (erroJanela) return { error: erroJanela }

  // Decodifica a foto (data URL) e envia ao Storage
  const match = fotoBase64.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { error: 'Foto inválida' }
  const contentType = match[1]
  const ext = contentType.split('/')[1] || 'jpg'
  const buffer = Buffer.from(match[2], 'base64')
  const path = `${eventoId}/${func.id}/meio.${ext}`

  const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (up.error) {
    console.error('Erro no upload da foto:', up.error)
    return { error: 'Não foi possível salvar a foto. Tente de novo.' }
  }

  const { data: registro, error } = await upsertRegistro(func.id, eventoId, 'meio', { foto_url: path, latitude, longitude })
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
  dados: { nome: string; cpf: string; telefone: string; empresa: string; cargo: string; chavePix?: string; fotoBase64?: string }
): Promise<{ qrToken?: string; error?: string }> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) return { error: 'Formulário inválido' }

  const cpf = dados.cpf.replace(/\D/g, '')
  if (cpf.length !== 11) return { error: 'CPF inválido. Confira os números e tente de novo.' }

  // Evita credenciais duplicadas: se o mesmo CPF já foi cadastrado neste evento,
  // devolve a credencial existente em vez de criar outra.
  const { data: existentes } = await supabaseAdmin
    .from('funcionarios')
    .select('qr_token, fornecedores!inner(evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', fornecedor.evento_id)
    .limit(1)
  if (existentes && existentes.length) return { qrToken: (existentes[0] as any).qr_token }

  const { data, error } = await supabaseAdmin.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: dados.nome.trim(),
    cpf,
    telefone: dados.telefone.replace(/\D/g, ''),
    empresa: dados.empresa.trim(),
    cargo: dados.cargo.trim(),
    chave_pix: dados.chavePix?.trim() || null,
  }]).select('id, qr_token').single()

  if (error || !data) return { error: 'Erro ao enviar formulário' }

  // Avatar é opcional — falha no upload não impede o cadastro
  const match = dados.fotoBase64?.match(/^data:(image\/\w+);base64,(.+)$/)
  if (match) {
    const contentType = match[1]
    const ext = contentType.split('/')[1] || 'jpg'
    const buffer = Buffer.from(match[2], 'base64')
    const path = `avatares/${data.qr_token}.${ext}`
    const up = await supabaseAdmin.storage.from('presencas').upload(path, buffer, { contentType, upsert: true })
    if (!up.error) await supabaseAdmin.from('funcionarios').update({ foto_perfil_path: path }).eq('id', data.id)
  }

  after(() => sincronizarFuncionarioNaPlanilha(data.id).catch(console.error))
  after(() => sincronizarAgendamentos(fornecedor.evento_id).catch(console.error))
  return { qrToken: data.qr_token }
}

/** Gera URLs assinadas (temporárias) para o admin ver as fotos de presença. */
export async function urlAssinadaFoto(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from('presencas').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
