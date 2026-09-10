'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { podeGerenciarBacklog } from './permissions'
import {
  STATUS_INICIAL, STATUS_GANHOS, rotuloDoStatus, rotuloDaPrioridade,
  type TipoItem, type Prioridade,
} from './backlog-constantes'
import { itemDoBacklog, type ItemBacklog } from './backlog'

/**
 * Escrita no Backlog Operacional.
 *
 * ─── TODA AÇÃO DEVOLVE, NENHUMA LANÇA ────────────────────────────────────────
 *
 * `{ ok: true }` ou `{ ok: false, erro }`. Não é estilo: em produção o Next
 * mascara qualquer exceção que sai de uma Server Action — o navegador recebe
 * "An error occurred in the Server Components render…" e a mensagem escrita se
 * perde. Foi o que travou o relatório de WhatsApp por dois dias (09/09/2026).
 * Valor devolvido não passa por essa máscara.
 *
 * ─── E TODA MUDANÇA VIRA HISTÓRICO ───────────────────────────────────────────
 *
 * `registrar()` grava a linha do tempo do item. Falha de histórico NUNCA
 * derruba a operação: se a tabela não existir (migração pendente) ou o insert
 * der erro, o item já foi salvo e a tela segue. Perder o registro de quem
 * mudou o quê é ruim; perder a mudança porque o registro falhou é pior.
 */

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { id?: string } : { dados: T }))
  | { ok: false; erro: string }

async function exigirBacklog() {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarBacklog(perfil)) return null
  return perfil
}

const SEM_ACESSO = 'Você não tem acesso ao Backlog. Fale com o master.'

async function registrar(
  itemId: string, acao: string, autorId: string,
  valorAnterior?: string | null, valorNovo?: string | null,
) {
  const { error } = await supabaseAdmin.from('backlog_historico').insert({
    item_id: itemId, acao, autor_id: autorId,
    valor_anterior: valorAnterior ?? null, valor_novo: valorNovo ?? null,
  })
  if (error) console.error('[backlog] histórico não gravado', { itemId, acao, erro: error.message })
}

function limpar(v: FormDataEntryValue | null): string | null {
  const texto = String(v ?? '').trim()
  return texto || null
}

function inteiro(v: FormDataEntryValue | null): number | null {
  const texto = String(v ?? '').trim()
  if (!texto) return null
  const n = Number.parseInt(texto, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Os campos que o formulário manda, já separados por tipo.
 *
 * Os campos do OUTRO tipo vão explicitamente a `null` — se alguém cria como
 * "possível cliente", preenche WhatsApp e depois muda o tipo pra tarefa, o
 * WhatsApp não pode continuar pendurado numa tarefa, invisível na tela e vivo
 * no banco.
 */
function camposDoFormulario(tipo: TipoItem, formData: FormData) {
  const comum = {
    tipo,
    titulo: String(formData.get('titulo') ?? '').trim(),
    prioridade: (String(formData.get('prioridade') ?? 'media') as Prioridade),
    responsavel_id: limpar(formData.get('responsavel_id')),
    evento_id: limpar(formData.get('evento_id')),
    observacoes: limpar(formData.get('observacoes')),
  }

  if (tipo === 'tarefa') {
    return {
      ...comum,
      descricao: limpar(formData.get('descricao')),
      prazo: limpar(formData.get('prazo')),
      contato_nome: null, whatsapp: null, email: null,
      evento_previsto_nome: null, data_evento_prevista: null,
      quantidade_estimada: null, servico_interesse: null, origem_lead: null,
      proximo_contato_data: null,
    }
  }
  return {
    ...comum,
    descricao: null, prazo: null,
    contato_nome: limpar(formData.get('contato_nome')),
    whatsapp: limpar(formData.get('whatsapp')),
    email: limpar(formData.get('email')),
    evento_previsto_nome: limpar(formData.get('evento_previsto_nome')),
    data_evento_prevista: limpar(formData.get('data_evento_prevista')),
    quantidade_estimada: inteiro(formData.get('quantidade_estimada')),
    servico_interesse: limpar(formData.get('servico_interesse')),
    origem_lead: limpar(formData.get('origem_lead')),
    proximo_contato_data: limpar(formData.get('proximo_contato_data')),
  }
}

function atualizarTelas() {
  revalidatePath('/admin/backlog')
  revalidatePath('/admin')
}

// ─── Criar ───────────────────────────────────────────────────────────────────

export async function criarItemBacklog(formData: FormData): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }

  const tipo = (String(formData.get('tipo') ?? '') as TipoItem)
  if (tipo !== 'cliente' && tipo !== 'tarefa') return { ok: false, erro: 'Escolha o tipo do item.' }

  const campos = camposDoFormulario(tipo, formData)
  if (!campos.titulo) {
    return { ok: false, erro: tipo === 'cliente' ? 'Diga o nome da empresa ou do cliente.' : 'Dê um título à tarefa.' }
  }

  const statusPedido = limpar(formData.get('status'))
  const { data, error } = await supabaseAdmin.from('backlog_itens').insert({
    ...campos,
    status: statusPedido ?? STATUS_INICIAL[tipo],
    criado_por: perfil.id,
  }).select('id').single()

  if (error) return { ok: false, erro: `Não consegui salvar: ${error.message}` }

  await registrar(data.id as string, 'CRIACAO', perfil.id as string, null, campos.titulo)
  atualizarTelas()
  return { ok: true, id: data.id as string }
}

// ─── Editar ──────────────────────────────────────────────────────────────────

export async function editarItemBacklog(id: string, formData: FormData): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }

  const antes = await itemDoBacklog(id)
  if (!antes) return { ok: false, erro: 'Este item não existe mais.' }

  const tipo = (String(formData.get('tipo') ?? antes.tipo) as TipoItem)
  const campos = camposDoFormulario(tipo, formData)
  if (!campos.titulo) return { ok: false, erro: 'O título não pode ficar vazio.' }

  const { error } = await supabaseAdmin.from('backlog_itens')
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, erro: `Não consegui salvar: ${error.message}` }

  /*
   * Uma linha de histórico por CAMPO que realmente mudou, não uma linha
   * genérica "editado". A pergunta que a linha do tempo responde é "quem
   * adiou este prazo?", e "editado" não responde.
   */
  const autor = perfil.id as string
  const mudou = <T>(a: T, b: T) => String(a ?? '') !== String(b ?? '')
  if (mudou(antes.prioridade, campos.prioridade)) {
    await registrar(id, 'PRIORIDADE', autor, rotuloDaPrioridade(antes.prioridade), rotuloDaPrioridade(campos.prioridade))
  }
  if (mudou(antes.responsavelId, campos.responsavel_id)) {
    await registrar(id, 'RESPONSAVEL', autor, antes.responsavelNome, await nomeDoPerfil(campos.responsavel_id))
  }
  if (tipo === 'tarefa' && mudou(antes.prazo, campos.prazo)) {
    await registrar(id, 'PRAZO', autor, antes.prazo, campos.prazo)
  }
  if (tipo === 'cliente' && mudou(antes.proximoContatoData, campos.proximo_contato_data)) {
    await registrar(id, 'PROXIMO_CONTATO', autor, antes.proximoContatoData, campos.proximo_contato_data)
  }
  if (mudou(antes.titulo, campos.titulo)) {
    await registrar(id, 'EDICAO', autor, antes.titulo, campos.titulo)
  }

  atualizarTelas()
  return { ok: true }
}

async function nomeDoPerfil(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await supabaseAdmin.from('perfis').select('nome').eq('id', id).maybeSingle()
  return (data?.nome as string | null) ?? null
}

// ─── Mover no quadro ─────────────────────────────────────────────────────────

/**
 * O drag and drop do Kanban. Separado de `editarItemBacklog` porque é a ação
 * mais repetida da tela e não pode exigir abrir o formulário inteiro só pra
 * arrastar um card de coluna.
 */
export async function moverItemBacklog(id: string, status: string): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }

  const antes = await itemDoBacklog(id)
  if (!antes) return { ok: false, erro: 'Este item não existe mais.' }
  if (antes.status === status) return { ok: true }

  const { error } = await supabaseAdmin.from('backlog_itens')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, erro: `Não consegui mover: ${error.message}` }

  const autor = perfil.id as string
  await registrar(id, 'STATUS', autor, rotuloDoStatus(antes.tipo, antes.status), rotuloDoStatus(antes.tipo, status))
  if (STATUS_GANHOS.has(status)) await registrar(id, 'CONCLUSAO', autor, null, rotuloDoStatus(antes.tipo, status))

  atualizarTelas()
  return { ok: true }
}

// ─── Comentar ────────────────────────────────────────────────────────────────

export async function comentarNoItem(id: string, texto: string): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }
  const limpo = texto.trim()
  if (!limpo) return { ok: false, erro: 'Escreva alguma coisa antes de enviar.' }
  if (limpo.length > 2000) return { ok: false, erro: 'O comentário é longo demais (máximo 2.000 caracteres).' }

  await registrar(id, 'COMENTARIO', perfil.id as string, null, limpo)
  // O comentário conta como movimento: sobe o item na lista, que ordena por
  // `atualizado_em` quando não há prioridade nem data desempatando.
  await supabaseAdmin.from('backlog_itens').update({ atualizado_em: new Date().toISOString() }).eq('id', id)
  atualizarTelas()
  return { ok: true }
}

// ─── Converter em cliente ────────────────────────────────────────────────────

/**
 * Liga o item a uma organização QUE JÁ EXISTE — não cria organização nova.
 *
 * Criar cliente é um fluxo próprio (/admin/organizacoes/novo), com limite de
 * evento, admin e e-mail de acesso; duplicar isso aqui daria dois caminhos
 * pra mesma coisa, que divergem no primeiro campo novo. O item do Backlog
 * continua existindo depois da conversão, com o histórico inteiro — a
 * conversão é mais uma entrada nesse histórico, como o pedido exige
 * ("preservar o histórico do Backlog").
 */
export async function converterEmCliente(id: string, organizacaoId: string): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }
  if (!organizacaoId) return { ok: false, erro: 'Escolha a organização deste cliente.' }

  const antes = await itemDoBacklog(id)
  if (!antes) return { ok: false, erro: 'Este item não existe mais.' }
  if (antes.tipo !== 'cliente') return { ok: false, erro: 'Só um possível cliente vira cliente.' }

  const { data: org } = await supabaseAdmin.from('organizacoes').select('nome').eq('id', organizacaoId).maybeSingle()
  if (!org) return { ok: false, erro: 'Essa organização não existe mais.' }

  const { error } = await supabaseAdmin.from('backlog_itens').update({
    convertido_organizacao_id: organizacaoId,
    convertido_em: new Date().toISOString(),
    status: 'fechado',
    atualizado_em: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { ok: false, erro: `Não consegui converter: ${error.message}` }

  const autor = perfil.id as string
  await registrar(id, 'CONVERSAO', autor, antes.titulo, org.nome as string)
  if (antes.status !== 'fechado') {
    await registrar(id, 'STATUS', autor, rotuloDoStatus('cliente', antes.status), 'Fechado')
  }

  atualizarTelas()
  return { ok: true }
}

// ─── Excluir ─────────────────────────────────────────────────────────────────

export async function excluirItemBacklog(id: string): Promise<Resultado> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }

  // O histórico vai junto por `on delete cascade` — é a única exclusão de
  // verdade do módulo, e por isso a tela pede confirmação antes.
  const { error } = await supabaseAdmin.from('backlog_itens').delete().eq('id', id)
  if (error) return { ok: false, erro: `Não consegui excluir: ${error.message}` }

  atualizarTelas()
  return { ok: true }
}

// ─── Leitura sob demanda (o histórico do painel lateral) ─────────────────────

export async function historicoParaTela(id: string): Promise<Resultado<{
  entradas: { id: string; acao: string; valorAnterior: string | null; valorNovo: string | null; autorNome: string | null; criadoEm: string }[]
}>> {
  const perfil = await exigirBacklog()
  if (!perfil) return { ok: false, erro: SEM_ACESSO }
  try {
    const { historicoDoItem } = await import('./backlog')
    return { ok: true, dados: { entradas: await historicoDoItem(id) } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não consegui carregar o histórico.' }
  }
}

export type { ItemBacklog }
