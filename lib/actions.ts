'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { redirect } from 'next/navigation'
import {
  criarPlanilhaEvento,
  garantirAbaFornecedor,
  adicionarFuncionarioNaPlanilha,
  registrarPresencaNaPlanilha,
  garantirPastaCliente,
} from './google-sheets'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  podeGerenciarUsuarios,
  podeGerenciarEventos,
  podeGerenciarOrganizacoes,
  podeExcluirEventos,
  ehMaster,
} from './permissions'
import { inputParaISO } from './tz'

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

/** Igual ao anterior, mas resolvendo a org a partir do fornecedor. */
async function exigirFornecedorDaOrg(fornecedorId: string) {
  const perfil = await exigirGestorDeEventos()
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, eventos(organizacao_id)')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) throw new Error('Fornecedor não encontrado')
  const orgDoEvento = (fornecedor.eventos as any)?.organizacao_id
  if (!ehMaster(perfil.role) && orgDoEvento !== perfil.organizacao_id) {
    throw new Error('Sem permissão sobre este fornecedor')
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
    throw new Error(`Erro ao criar usuário admin: ${userErr.message}`)
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

// ─── Usuários (equipe da organização) ─────────────────────────────────────────

/**
 * Cria um supervisor (equipe de credenciamento) dentro da organização de quem
 * está criando. Admin cria a própria equipe; o master cria admins via organização.
 */
export async function criarUsuario(formData: FormData) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) throw new Error('Sem permissão para criar usuários')

  const organizacaoId = perfil!.organizacao_id
  if (!organizacaoId) throw new Error('Somente admins de uma organização cadastram equipe. O master cria admins pela tela de Organizações.')

  const nome = formData.get('nome') as string
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string
  const eventoIds = formData.getAll('evento_ids') as string[]

  const admin = getAdminSupabase()

  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) throw new Error(`Erro ao criar usuário: ${error.message}`)

  await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    role: 'supervisor',
    organizacao_id: organizacaoId,
  }])

  // Vincula o supervisor aos eventos escolhidos (apenas da própria organização)
  if (eventoIds.length) {
    const { data: eventosDaOrg } = await admin
      .from('eventos')
      .select('id')
      .eq('organizacao_id', organizacaoId)
      .in('id', eventoIds)
    const permitidos = eventosDaOrg?.map(e => e.id) ?? []
    if (permitidos.length) {
      await admin.from('supervisor_eventos').insert(
        permitidos.map(eventoId => ({ perfil_id: user.user!.id, evento_id: eventoId }))
      )
    }
  }

  revalidatePath('/admin/usuarios')
  redirect('/admin/usuarios')
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
  if (error) throw new Error(`Erro ao criar evento: ${error.message} (code: ${error.code})`)

  // Cria planilha na pasta da organização no Drive
  try {
    const spreadsheetId = await criarPlanilhaEvento(nome, driveFolder)
    await db.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', novo.id)
  } catch (e) {
    console.error('Erro ao criar planilha:', e)
  }

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

  // Cria a aba na planilha em segundo plano (não trava a resposta pro usuário)
  garantirAbaFornecedorAsync(eventoId, nomeFornecedor)

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
  await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin

  const { data: novo, error } = await db.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: (formData.get('nome') as string).trim(),
    cpf: (formData.get('cpf') as string).replace(/\D/g, ''),
    telefone: (formData.get('telefone') as string).replace(/\D/g, ''),
    empresa: (formData.get('empresa') as string).trim(),
    cargo: ((formData.get('cargo') as string) || '').trim(),
  }]).select('id').single()

  if (error) throw new Error(`Erro ao cadastrar funcionário: ${error.message}`)

  // Sincroniza com a planilha (não bloqueia em caso de falha)
  sincronizarFuncionarioNaPlanilha(novo.id).catch(console.error)

  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

export async function deletarFuncionario(id: string, fornecedorId: string, eventoId: string) {
  await exigirEventoDaOrg(eventoId)
  const db = supabaseAdmin
  await db.from('funcionarios').delete().eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
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
      email: func.email,
      empresa: func.empresa,
      cargo: func.cargo,
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
  return supabaseAdmin.from('registros').insert([{ funcionario_id: funcionarioId, evento_id: eventoId, tipo: momento, ...extra }])
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
  if (!perfil || !podeGerenciarEventos(perfil.role)) return { success: false, message: 'Sem permissão' }
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
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { success: false, message: 'Sem acesso a este evento' }
  }

  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, empresa, cargo, fornecedores(evento_id)')
    .eq('qr_token', token)
    .single()
  if (!func) return { success: false, message: 'Funcionário não encontrado' }

  const funcInfo = { nome: func.nome, empresa: func.empresa, cargo: func.cargo ?? null }
  if ((func.fornecedores as any)?.evento_id !== eventoId) {
    return { success: false, message: 'Credencial não pertence a este evento' }
  }

  const erroJanela = validarJanela(evento, momento)
  if (erroJanela) return { success: false, message: erroJanela, funcionario: funcInfo }

  const { error } = await upsertRegistro(func.id, eventoId, momento)
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

  const { error } = await upsertRegistro(func.id, eventoId, 'meio', { foto_url: path, latitude, longitude })
  if (error) return { error: 'Erro ao registrar. Tente de novo.' }

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
  dados: { nome: string; cpf: string; telefone: string; empresa: string; cargo: string }
): Promise<{ qrToken?: string; error?: string }> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id')
    .eq('id', fornecedorId)
    .single()
  if (!fornecedor) return { error: 'Formulário inválido' }

  const { data, error } = await supabaseAdmin.from('funcionarios').insert([{
    fornecedor_id: fornecedorId,
    nome: dados.nome.trim(),
    cpf: dados.cpf.replace(/\D/g, ''),
    telefone: dados.telefone.replace(/\D/g, ''),
    empresa: dados.empresa.trim(),
    cargo: dados.cargo.trim(),
  }]).select('id, qr_token').single()

  if (error || !data) return { error: 'Erro ao enviar formulário' }

  sincronizarFuncionarioNaPlanilha(data.id).catch(console.error)
  return { qrToken: data.qr_token }
}

/** Gera URLs assinadas (temporárias) para o admin ver as fotos de presença. */
export async function urlAssinadaFoto(path: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from('presencas').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? null
}
