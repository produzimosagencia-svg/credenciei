'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { supabaseAdmin, buscarTudo, eventosAcontecendoHoje } from './supabase-server'
import { registrarAuditoria } from './auditoria'
import { mensagemAmigavel } from './erros'
import { chaveBusca } from './format'
import { formatarBR } from './tz'
import { agendarTemplateSupervisor, enviarMensagemAgora } from './mensagens'
import { acessoAListaManual, ehMigracaoPendente, paraTela, COLUNAS_DA_LISTA, type AcessoListaManual, type LinhaDaLista } from './lista-manual'
import { lerPessoaDaLista, mascararCpf, type DadosDaPessoa, type PessoaDaLista } from './lista-manual-regras'

/*
 * LISTA MANUAL — entrada sem QR Code (Juan, 16/10/2026). Toda action confere de novo, ela mesma, quem chama e o
 * evento (a página esconder o botão não impede uma chamada direta), e toda linha é lida pelo `id` E pelo `evento_id`:
 * uma pessoa da lista de um evento nunca é tocada pela tela de outro. Erros voltam como `{ erro }` — em produção o
 * Next esconde a mensagem de uma exceção de Server Action.
 */

type Erro = { erro: string }

const SEM_TABELA = 'Falta rodar supabase/upgrade-lista-manual.sql no SQL Editor do Supabase.'
const CAMINHO = '/admin/lista-manual'

async function exigirGerenciar(eventoId: string): Promise<AcessoListaManual | Erro> {
  const acesso = await acessoAListaManual(eventoId)
  if ('erro' in acesso) return acesso
  if (!acesso.podeGerenciar) return { erro: 'Só quem gerencia a lista (master ou administrador) cadastra, corrige ou tira pessoas dela.' }
  return acesso
}

const resumo = (d: { nome: string; categoria: string; cpf: string | null }) =>
  `${d.nome} · ${d.categoria}${d.cpf ? ` · CPF ${mascararCpf(d.cpf)}` : ''}`

function auditar(acesso: AcessoListaManual, acao: string, campos: { valorAnterior?: string | null; valorNovo?: string | null; motivo?: string | null }) {
  after(() => registrarAuditoria({
    perfil: { id: acesso.perfil.id as string, nome: acesso.perfil.nome as string },
    acao, campoAlterado: 'Lista manual',
    valorAnterior: campos.valorAnterior ?? null, valorNovo: campos.valorNovo ?? null, motivo: campos.motivo ?? null,
    eventoId: acesso.evento.id, organizacaoId: acesso.evento.organizacao_id ?? undefined,
  }))
}

/** A linha DESTE evento (ainda na lista), ou null. */
async function linhaDoEvento(eventoId: string, id: string): Promise<LinhaDaLista | null> {
  const { data } = await supabaseAdmin.from('lista_manual').select(COLUNAS_DA_LISTA)
    .eq('id', id).eq('evento_id', eventoId).is('removido_em', null).maybeSingle()
  return (data as LinhaDaLista | null) ?? null
}

/**
 * Alguém igual já está na lista deste evento? Pelo CPF; sem CPF, o mesmo nome (sem acento nem caixa) também sem CPF.
 * Dois "João Silva" com CPFs diferentes são duas pessoas — passam.
 */
async function duplicadoNaLista(eventoId: string, d: DadosDaPessoa, ignorarId?: string): Promise<string | null> {
  if (d.cpf) {
    let q = supabaseAdmin.from('lista_manual').select('id, nome, categoria')
      .eq('evento_id', eventoId).eq('cpf', d.cpf).is('removido_em', null).limit(1)
    if (ignorarId) q = q.neq('id', ignorarId)
    const { data } = await q
    return data?.length ? `Este CPF já está na lista: ${data[0].nome} (${data[0].categoria}).` : null
  }
  const semCpf = await buscarTudo<{ id: string; nome: string }>((de, ate) => supabaseAdmin.from('lista_manual')
    .select('id, nome').eq('evento_id', eventoId).is('cpf', null).is('removido_em', null).order('id').range(de, ate))
  const igual = semCpf.find(p => p.id !== ignorarId && chaveBusca(p.nome) === chaveBusca(d.nome))
  return igual ? `${igual.nome} já está na lista, sem CPF. Se for outra pessoa com o mesmo nome, informe o CPF.` : null
}

type EntradaDoFormulario = { nome?: string; cpf?: string; telefone?: string; categoria?: string }

/**
 * O aviso no WhatsApp de quem entrou na lista (modelo `lista_manual_confirmacao`, aprovado na Meta). Falhar não desfaz
 * o cadastro: a pessoa está na lista do mesmo jeito. Devolve se a mensagem entrou na fila.
 */
async function avisarNoWhatsapp(eventoId: string, d: DadosDaPessoa): Promise<boolean> {
  if (!d.telefone) return false
  try {
    const { data: ev } = await supabaseAdmin.from('eventos').select('nome, data_inicio, local').eq('id', eventoId).maybeSingle()
    // Ordem do texto: {{1}} nome · {{2}} evento · {{3}} categoria · {{4}} data · {{5}} local — sem quebra de linha (a Meta recusa).
    const umaLinha = (t: string) => t.replace(/\s*\n+\s*/g, ' ').trim()
    const id = await agendarTemplateSupervisor({
      eventoId, telefone: d.telefone, template: 'lista_manual_confirmacao',
      parametros: [
        umaLinha(d.nome.split(' ')[0] ?? d.nome),
        umaLinha((ev?.nome as string | undefined) ?? 'Evento'),
        umaLinha(d.categoria),
        ev?.data_inicio ? formatarBR(ev.data_inicio as string, 'completo') : 'a confirmar',
        umaLinha((ev?.local as string | null | undefined)?.trim() || 'a confirmar'),
      ],
    })
    if (id) after(() => enviarMensagemAgora(id).catch(e => console.error('[lista-manual] envio imediato falhou', e)))
    return !!id
  } catch (e) {
    console.error('[lista-manual] aviso no WhatsApp não agendou', e)
    return false
  }
}

/** "Adicionar pessoa à lista". */
export async function adicionarPessoaNaLista(eventoId: string, entrada: EntradaDoFormulario & { avisarWhatsapp?: boolean }): Promise<{ ok: true; pessoa: PessoaDaLista; avisado: boolean } | Erro> {
  try {
    const acesso = await exigirGerenciar(eventoId)
    if ('erro' in acesso) return acesso
    const lido = lerPessoaDaLista(entrada)
    if (!lido.ok) return { erro: lido.erro }
    const dados = lido.dados

    const duplicado = await duplicadoNaLista(eventoId, dados)
    if (duplicado) return { erro: duplicado }

    const { data, error } = await supabaseAdmin.from('lista_manual').insert([{
      evento_id: eventoId, ...dados,
      criado_por_perfil_id: acesso.perfil.id, criado_por_nome: acesso.perfil.nome,
    }]).select(COLUNAS_DA_LISTA).single()
    if (error) {
      if (ehMigracaoPendente(error)) return { erro: SEM_TABELA }
      // O índice único pegou dois cadastros do mesmo CPF ao mesmo tempo.
      if (error.code === '23505') return { erro: 'Este CPF já está na lista deste evento.' }
      return { erro: mensagemAmigavel(error) }
    }
    const avisado = entrada.avisarWhatsapp === true ? await avisarNoWhatsapp(eventoId, dados) : false
    auditar(acesso, 'LISTA_MANUAL_CADASTRO', { valorNovo: `${resumo(dados)}${avisado ? ' · avisada no WhatsApp' : ''}` })
    revalidatePath(CAMINHO)
    return { ok: true, pessoa: paraTela(data as LinhaDaLista, true), avisado }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Corrige nome, CPF, telefone ou categoria. */
export async function editarPessoaDaLista(eventoId: string, id: string, entrada: EntradaDoFormulario): Promise<{ ok: true; pessoa: PessoaDaLista } | Erro> {
  try {
    const acesso = await exigirGerenciar(eventoId)
    if ('erro' in acesso) return acesso
    const antes = await linhaDoEvento(eventoId, id)
    if (!antes) return { erro: 'Esta pessoa não está mais na lista. Atualize a página.' }
    const lido = lerPessoaDaLista(entrada)
    if (!lido.ok) return { erro: lido.erro }
    const dados = lido.dados

    const duplicado = await duplicadoNaLista(eventoId, dados, id)
    if (duplicado) return { erro: duplicado }

    const { data, error } = await supabaseAdmin.from('lista_manual')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', id).eq('evento_id', eventoId).is('removido_em', null)
      .select(COLUNAS_DA_LISTA)
    if (error) return { erro: error.code === '23505' ? 'Este CPF já está na lista deste evento.' : mensagemAmigavel(error) }
    if (!data?.length) return { erro: 'Esta pessoa não está mais na lista. Atualize a página.' }

    auditar(acesso, 'LISTA_MANUAL_EDICAO', { valorAnterior: resumo(antes), valorNovo: resumo(dados) })
    revalidatePath(CAMINHO)
    return { ok: true, pessoa: paraTela(data[0] as LinhaDaLista, true) }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Tira da lista — sem apagar: a linha some das telas e o histórico (quem cadastrou, a auditoria) fica. Quem já entrou
 * não sai assim: desfaz-se a entrada antes (a presença registrada não some por um clique).
 */
export async function tirarDaLista(eventoId: string, id: string, motivo?: string): Promise<{ ok: true } | Erro> {
  try {
    const acesso = await exigirGerenciar(eventoId)
    if ('erro' in acesso) return acesso
    const linha = await linhaDoEvento(eventoId, id)
    if (!linha) return { erro: 'Esta pessoa não está mais na lista. Atualize a página.' }
    if (linha.presente_em) {
      return { erro: `${linha.nome} já entrou (${formatarBR(linha.presente_em, 'hora')}). Para tirar da lista, desfaça a entrada antes.` }
    }

    const { data, error } = await supabaseAdmin.from('lista_manual')
      .update({ removido_em: new Date().toISOString(), removido_por_perfil_id: acesso.perfil.id })
      .eq('id', id).eq('evento_id', eventoId).is('removido_em', null).is('presente_em', null)
      .select('id')
    if (error) return { erro: mensagemAmigavel(error) }
    if (!data?.length) return { erro: 'Não deu para tirar: a entrada pode ter sido confirmada agora. Atualize a página.' }

    auditar(acesso, 'LISTA_MANUAL_REMOCAO', { valorAnterior: resumo(linha), valorNovo: 'Tirada da lista', motivo: (motivo ?? '').trim() || null })
    revalidatePath(CAMINHO)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * "Confirmar entrada" na portaria (master/admin — ver `podeConfirmarEntradaListaManual`). O UPDATE só pega quem AINDA não entrou (`presente_em is null`): com dois
 * operadores confirmando a mesma pessoa ao mesmo tempo, só um grava — o outro recebe `jaEntrou`, com o horário e
 * quem confirmou. Como o scanner, só nos dias do evento (vale até para o master).
 */
export async function confirmarEntradaNaLista(eventoId: string, id: string): Promise<
  { ok: true; pessoa: PessoaDaLista } | { jaEntrou: true; pessoa: PessoaDaLista } | Erro
> {
  try {
    const acesso = await acessoAListaManual(eventoId)
    if ('erro' in acesso) return acesso
    // Consultar é ler; confirmar é gravar — o operador de portão só lê, a não ser que a permissão seja ligada para ele.
    if (!acesso.podeConfirmar) return { erro: 'Você pode consultar a lista, mas não confirmar a entrada. Chame quem gerencia o evento.' }
    if (!(await eventosAcontecendoHoje([eventoId])).has(eventoId)) {
      return { erro: 'A entrada só é confirmada nos dias do evento.' }
    }

    const agora = new Date().toISOString()
    const { data, error } = await supabaseAdmin.from('lista_manual')
      .update({ presente_em: agora, confirmado_por_perfil_id: acesso.perfil.id, confirmado_por_nome: acesso.perfil.nome })
      .eq('id', id).eq('evento_id', eventoId).is('removido_em', null).is('presente_em', null)
      .select(COLUNAS_DA_LISTA)
    if (error) return { erro: ehMigracaoPendente(error) ? SEM_TABELA : mensagemAmigavel(error) }

    if (data?.length) {
      const linha = data[0] as LinhaDaLista
      auditar(acesso, 'LISTA_MANUAL_ENTRADA', { valorNovo: `${resumo(linha)} · entrou às ${formatarBR(agora, 'hora')}` })
      revalidatePath(CAMINHO)
      return { ok: true, pessoa: paraTela(linha, acesso.podeGerenciar) }
    }

    // Nada mudou: ou já tinha entrado (o caso do aviso), ou saiu da lista.
    const atual = await linhaDoEvento(eventoId, id)
    if (!atual) return { erro: 'Esta pessoa não está mais na lista. Atualize a página.' }
    return { jaEntrou: true, pessoa: paraTela(atual, acesso.podeGerenciar) }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Desfaz uma entrada confirmada por engano — só quem gerencia a lista, com motivo (vai para a auditoria). */
export async function desfazerEntradaNaLista(eventoId: string, id: string, motivo: string): Promise<{ ok: true; pessoa: PessoaDaLista } | Erro> {
  try {
    const acesso = await exigirGerenciar(eventoId)
    if ('erro' in acesso) return acesso
    const porque = (motivo ?? '').trim()
    if (porque.length < 5) return { erro: 'Escreva o motivo — ele fica na auditoria.' }
    const linha = await linhaDoEvento(eventoId, id)
    if (!linha) return { erro: 'Esta pessoa não está mais na lista. Atualize a página.' }
    if (!linha.presente_em) return { erro: `${linha.nome} ainda não tem entrada confirmada.` }

    const { data, error } = await supabaseAdmin.from('lista_manual')
      .update({ presente_em: null, confirmado_por_perfil_id: null, confirmado_por_nome: null })
      .eq('id', id).eq('evento_id', eventoId).is('removido_em', null).not('presente_em', 'is', null)
      .select(COLUNAS_DA_LISTA)
    if (error) return { erro: mensagemAmigavel(error) }
    if (!data?.length) return { erro: 'A entrada já tinha sido desfeita. Atualize a página.' }

    auditar(acesso, 'LISTA_MANUAL_ENTRADA_DESFEITA', {
      valorAnterior: `${resumo(linha)} · entrou às ${formatarBR(linha.presente_em, 'curto')}${linha.confirmado_por_nome ? ` (por ${linha.confirmado_por_nome})` : ''}`,
      valorNovo: 'Aguardando entrada', motivo: porque,
    })
    revalidatePath(CAMINHO)
    return { ok: true, pessoa: paraTela(data[0] as LinhaDaLista, true) }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * A busca por CPF de quem só vê a máscara (o operador de portão): devolve os ids que batem — o CPF inteiro nunca vai
 * para a tela dele. 11 dígitos = o CPF exato (o do documento na mão); menos, um pedaço (a partir de 3).
 */
export async function buscarCpfNaListaManual(eventoId: string, termo: string): Promise<{ ids: string[] } | Erro> {
  try {
    const acesso = await acessoAListaManual(eventoId)
    if ('erro' in acesso) return acesso
    const digitos = (termo ?? '').replace(/\D/g, '')
    if (digitos.length < 3) return { ids: [] }
    let q = supabaseAdmin.from('lista_manual').select('id').eq('evento_id', eventoId).is('removido_em', null)
    q = digitos.length === 11 ? q.eq('cpf', digitos) : q.like('cpf', `%${digitos.slice(0, 11)}%`)
    const { data, error } = await q.limit(50)
    if (error) return { erro: ehMigracaoPendente(error) ? SEM_TABELA : mensagemAmigavel(error) }
    return { ids: (data ?? []).map(l => l.id as string) }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
