'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { ehMaster } from './permissions'
import { mensagemAmigavel } from './erros'
import { CATEGORIAS_CUSTO } from './financeiro'

/**
 * As ações do Financeiro — cadastrar, editar, apagar. Todas exclusivas do
 * MASTER, sempre checado aqui dentro: a tela que esconde o botão não é a
 * barreira, é só a primeira camada. Ver o porquê da isolação (tabelas e
 * bucket próprios) em supabase/upgrade-financeiro.sql.
 */
async function exigirMaster() {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) throw new Error('Financeiro é exclusivo do master.')
  return perfil!
}

const TIPOS_ANEXO_ACEITOS = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf',
])

async function subirAnexo(
  pasta: string, arquivo: FormDataEntryValue | null,
): Promise<{ path: string; nome: string } | null> {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (!TIPOS_ANEXO_ACEITOS.has(arquivo.type)) {
    throw new Error('Formato não aceito. Envie uma imagem (JPG, PNG, WEBP) ou um PDF.')
  }
  // 10MB — NFe e comprovante em foto de celular cabem folgado nisso; existe
  // só pra recusar um anexo errado antes de ele consumir o storage à toa.
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande. O limite é 10MB.')

  const path = `${pasta}/${Date.now()}-${arquivo.name.replace(/[^\w.\-]/g, '_')}`
  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const { error } = await supabaseAdmin.storage.from('financeiro').upload(path, buffer, {
    contentType: arquivo.type,
  })
  if (error) throw new Error('Erro ao enviar o arquivo. Tente novamente.')
  return { path, nome: arquivo.name }
}

function parseValor(bruto: FormDataEntryValue | null): number {
  const n = Number(String(bruto ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new Error('Valor inválido.')
  return n
}

/**
 * Salva o faturamento do evento — e a NFe, se veio uma nova. `upsert` porque
 * a linha só nasce na primeira vez que alguém salva (ver a migração): não
 * existe "criar financeiro do evento" separado de "editar".
 */
export async function salvarFaturamento(eventoId: string, formData: FormData) {
  const perfil = await exigirMaster()

  const faturamento = parseValor(formData.get('faturamento'))
  const removerNfeAtual = formData.get('remover_nfe') === '1'

  const { data: atual } = await supabaseAdmin
    .from('financeiro_eventos').select('nfe_path').eq('evento_id', eventoId).maybeSingle()

  let nfePath = atual?.nfe_path as string | null ?? null
  let nfeNome: string | null = null

  const novaNfe = await subirAnexo(`nfe/${eventoId}`, formData.get('nfe'))
  if (novaNfe) {
    if (atual?.nfe_path) await supabaseAdmin.storage.from('financeiro').remove([atual.nfe_path as string])
    nfePath = novaNfe.path
    nfeNome = novaNfe.nome
  } else if (removerNfeAtual && atual?.nfe_path) {
    await supabaseAdmin.storage.from('financeiro').remove([atual.nfe_path as string])
    nfePath = null
    nfeNome = null
  }

  const { error } = await supabaseAdmin.from('financeiro_eventos').upsert({
    evento_id: eventoId,
    faturamento,
    nfe_path: nfePath,
    ...(novaNfe || removerNfeAtual ? { nfe_nome: nfeNome } : {}),
    atualizado_por: perfil.id,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'evento_id' })
  if (error) throw new Error(mensagemAmigavel(error))

  revalidatePath(`/admin/eventos/${eventoId}/financeiro`)
  revalidatePath('/admin/financeiro')
}

/**
 * `eventoId: null` é despesa INTERNA — não pertence a evento nenhum (salário
 * da equipe da agência, serviço contratado pra empresa). Ver o porquê da
 * coluna aceitar NULL em supabase/upgrade-financeiro.sql.
 */
export async function criarCusto(eventoId: string | null, formData: FormData) {
  const perfil = await exigirMaster()

  const descricao = String(formData.get('descricao') ?? '').trim()
  const categoria = String(formData.get('categoria') ?? '')
  if (!descricao) throw new Error('Descreva o gasto.')
  if (!CATEGORIAS_CUSTO.includes(categoria as (typeof CATEGORIAS_CUSTO)[number])) {
    throw new Error('Escolha uma categoria.')
  }
  const valor = parseValor(formData.get('valor'))
  const data = String(formData.get('data') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do gasto.')
  const observacao = String(formData.get('observacao') ?? '').trim() || null

  const { data: novo, error } = await supabaseAdmin.from('custos_evento').insert([{
    evento_id: eventoId, descricao, categoria, valor, data, observacao, criado_por: perfil.id,
  }]).select('id').single()
  if (error) throw new Error(mensagemAmigavel(error))

  /*
   * O custo já está salvo aqui embaixo — se o anexo falhar (formato, rede),
   * o gasto não pode sumir por causa da foto do recibo. O comprovante dá
   * pra anexar depois, editando o custo; sem isto, um upload que falhasse
   * levaria o master a achar que nem o custo foi lançado.
   */
  try {
    const comprovante = await subirAnexo(`custos/${eventoId ?? 'interno'}`, formData.get('comprovante'))
    if (comprovante) {
      await supabaseAdmin.from('custos_evento')
        .update({ comprovante_path: comprovante.path, comprovante_nome: comprovante.nome })
        .eq('id', novo.id)
    }
  } catch (erroAnexo) {
    console.error('[criarCusto] falha ao subir comprovante', { custoId: novo.id, erro: erroAnexo })
  }

  if (eventoId) revalidatePath(`/admin/eventos/${eventoId}/financeiro`)
  revalidatePath('/admin/financeiro')
}

export async function editarCusto(custoId: string, eventoId: string | null, formData: FormData) {
  await exigirMaster()

  const { data: atual } = await supabaseAdmin
    .from('custos_evento').select('id, evento_id, comprovante_path').eq('id', custoId).single()
  if (!atual || atual.evento_id !== eventoId) throw new Error('Custo não encontrado neste evento.')

  const descricao = String(formData.get('descricao') ?? '').trim()
  const categoria = String(formData.get('categoria') ?? '')
  if (!descricao) throw new Error('Descreva o gasto.')
  if (!CATEGORIAS_CUSTO.includes(categoria as (typeof CATEGORIAS_CUSTO)[number])) {
    throw new Error('Escolha uma categoria.')
  }
  const valor = parseValor(formData.get('valor'))
  const data = String(formData.get('data') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do gasto.')
  const observacao = String(formData.get('observacao') ?? '').trim() || null

  /*
   * Tentado ANTES do update dos campos, mas sem deixar uma falha aqui
   * derrubar a edição inteira: se o anexo novo falhar, descrição, valor e
   * data continuam sendo salvos — só o comprovante fica como estava.
   */
  let novoComprovante: { path: string; nome: string } | null = null
  try {
    novoComprovante = await subirAnexo(`custos/${eventoId ?? 'interno'}`, formData.get('comprovante'))
  } catch (erroAnexo) {
    console.error('[editarCusto] falha ao subir comprovante novo', { custoId, erro: erroAnexo })
  }

  const { error } = await supabaseAdmin.from('custos_evento').update({
    descricao, categoria, valor, data, observacao,
    atualizado_em: new Date().toISOString(),
    ...(novoComprovante ? { comprovante_path: novoComprovante.path, comprovante_nome: novoComprovante.nome } : {}),
  }).eq('id', custoId)
  if (error) throw new Error(mensagemAmigavel(error))

  // O comprovante velho só sai do storage DEPOIS do update ter dado certo —
  // trocar a ordem deixaria o custo sem nenhum anexo se o update falhasse.
  if (novoComprovante && atual.comprovante_path) {
    await supabaseAdmin.storage.from('financeiro').remove([atual.comprovante_path as string])
  }

  if (eventoId) revalidatePath(`/admin/eventos/${eventoId}/financeiro`)
  revalidatePath('/admin/financeiro')
}

export async function excluirCusto(custoId: string, eventoId: string | null) {
  await exigirMaster()

  const { data: atual } = await supabaseAdmin
    .from('custos_evento').select('id, evento_id, comprovante_path').eq('id', custoId).single()
  if (!atual || atual.evento_id !== eventoId) throw new Error('Custo não encontrado neste evento.')

  const { error } = await supabaseAdmin.from('custos_evento').delete().eq('id', custoId)
  if (error) throw new Error(mensagemAmigavel(error))

  if (atual.comprovante_path) {
    await supabaseAdmin.storage.from('financeiro').remove([atual.comprovante_path as string])
  }

  if (eventoId) revalidatePath(`/admin/eventos/${eventoId}/financeiro`)
  revalidatePath('/admin/financeiro')
}

/**
 * URLs assinadas dos anexos — comprovante de custo e NFe do evento. Geradas
 * na hora de abrir, não guardadas em lugar nenhum: o bucket é privado, e um
 * link pronto na tela venceria ou, pior, ficaria certo pra sempre sem
 * controle.
 *
 * Recebem o ID, não o caminho: o caminho vem de uma nova consulta ao banco
 * aqui dentro, não do que o cliente mandou — mesmo padrão de
 * `urlFotoVeiculo` em lib/actions.ts. Um caminho aceito direto do cliente
 * seria confiar que ele só pediria os próprios arquivos.
 */
export async function urlComprovanteCusto(custoId: string): Promise<string | null> {
  await exigirMaster()
  const { data } = await supabaseAdmin.from('custos_evento').select('comprovante_path').eq('id', custoId).maybeSingle()
  if (!data?.comprovante_path) return null
  const { data: assinada } = await supabaseAdmin.storage.from('financeiro').createSignedUrl(data.comprovante_path as string, 60 * 15)
  return assinada?.signedUrl ?? null
}

export async function urlNfeEvento(eventoId: string): Promise<string | null> {
  await exigirMaster()
  const { data } = await supabaseAdmin.from('financeiro_eventos').select('nfe_path').eq('evento_id', eventoId).maybeSingle()
  if (!data?.nfe_path) return null
  const { data: assinada } = await supabaseAdmin.storage.from('financeiro').createSignedUrl(data.nfe_path as string, 60 * 15)
  return assinada?.signedUrl ?? null
}
