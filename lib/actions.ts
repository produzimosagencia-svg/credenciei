'use server'
import { revalidatePath } from 'next/cache'
import { supabase } from './supabase'
import { createClient, getPerfil } from './supabase-server'
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
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export async function criarCliente(formData: FormData) {
  const nome = formData.get('nome') as string
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string

  const admin = getAdminSupabase()

  // Cria usuário no Supabase Auth
  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (error) throw new Error(`Erro ao criar usuário: ${error.message}`)

  // Cria pasta no Google Drive para o cliente
  let driveFolderId: string | null = null
  try {
    driveFolderId = await garantirPastaCliente(nome)
  } catch (e) {
    console.error('Erro ao criar pasta no Drive:', e)
  }

  // Cria perfil
  await admin.from('perfis').insert([{
    id: user.user!.id,
    nome,
    email,
    role: 'cliente',
    drive_folder_id: driveFolderId,
  }])

  revalidatePath('/admin/clientes')
  redirect('/admin/clientes')
}

export async function deletarCliente(id: string) {
  const admin = getAdminSupabase()
  await admin.auth.admin.deleteUser(id)
  await admin.from('perfis').delete().eq('id', id)
  revalidatePath('/admin/clientes')
}

// ─── Eventos ────────────────────────────────────────────────────────────────

export async function criarEvento(formData: FormData) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Não autenticado')

  const nome = formData.get('nome') as string
  const data = {
    nome,
    descricao: (formData.get('descricao') as string) || null,
    data_inicio: formData.get('data_inicio') as string,
    data_fim: formData.get('data_fim') as string,
    local: (formData.get('local') as string) || null,
    cliente_id: perfil.id,
  }

  const db = await createClient()
  const { data: novo, error } = await db.from('eventos').insert([data]).select('id').single()
  if (error) throw new Error(`Erro ao criar evento: ${error.message} (code: ${error.code})`)

  // Cria planilha na pasta do cliente no Drive
  try {
    const spreadsheetId = await criarPlanilhaEvento(nome, perfil.drive_folder_id)
    await db.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', novo.id)
  } catch (e) {
    console.error('Erro ao criar planilha:', e)
  }

  redirect(`/admin/eventos/${novo.id}`)
}

export async function editarEvento(id: string, formData: FormData) {
  const db = await createClient()
  const data = {
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    data_inicio: formData.get('data_inicio') as string,
    data_fim: formData.get('data_fim') as string,
    local: (formData.get('local') as string) || null,
  }
  await db.from('eventos').update(data).eq('id', id)
  revalidatePath(`/admin/eventos/${id}`)
  redirect(`/admin/eventos/${id}`)
}

export async function toggleAtivoEvento(id: string, ativo: boolean) {
  const db = await createClient()
  await db.from('eventos').update({ ativo: !ativo }).eq('id', id)
  revalidatePath(`/admin/eventos/${id}`)
  revalidatePath('/admin/eventos')
  revalidatePath('/admin')
}

export async function deletarEvento(id: string) {
  const db = await createClient()
  await db.from('eventos').delete().eq('id', id)
  revalidatePath('/admin/eventos')
  revalidatePath('/admin')
  redirect('/admin/eventos')
}

// ─── Fornecedores ────────────────────────────────────────────────────────────

export async function criarFornecedor(eventoId: string, formData: FormData) {
  const db = await createClient()
  const qtd = formData.get('quantidade_estimada') as string
  const nomeFornecedor = formData.get('nome') as string
  const data = {
    evento_id: eventoId,
    nome: nomeFornecedor,
    email_contato: (formData.get('email_contato') as string) || null,
    quantidade_estimada: qtd ? parseInt(qtd) : null,
  }
  await db.from('fornecedores').insert([data])

  try {
    const { data: evento } = await db.from('eventos').select('spreadsheet_id').eq('id', eventoId).single()
    if (evento?.spreadsheet_id) {
      await garantirAbaFornecedor(evento.spreadsheet_id, nomeFornecedor)
    }
  } catch (e) {
    console.error('Erro ao criar aba do fornecedor:', e)
  }

  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function editarFornecedor(id: string, eventoId: string, formData: FormData) {
  const db = await createClient()
  const qtd = formData.get('quantidade_estimada') as string
  await db.from('fornecedores').update({
    nome: formData.get('nome') as string,
    email_contato: (formData.get('email_contato') as string) || null,
    quantidade_estimada: qtd ? parseInt(qtd) : null,
  }).eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}`)
}

export async function deletarFornecedor(id: string, eventoId: string) {
  const db = await createClient()
  await db.from('fornecedores').delete().eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}`)
  redirect(`/admin/eventos/${eventoId}`)
}

// ─── Funcionários ────────────────────────────────────────────────────────────

export async function deletarFuncionario(id: string, fornecedorId: string, eventoId: string) {
  const db = await createClient()
  await db.from('funcionarios').delete().eq('id', id)
  revalidatePath(`/admin/eventos/${eventoId}/fornecedor/${fornecedorId}`)
}

// ─── Google Sheets ───────────────────────────────────────────────────────────

export async function sincronizarFuncionarioNaPlanilha(funcionarioId: string) {
  try {
    const { data: func } = await supabase
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
      supabase.from('funcionarios').select('nome, fornecedores(nome)').eq('id', funcionarioId).single(),
      supabase.from('eventos').select('spreadsheet_id').eq('id', eventoId).single(),
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
