'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { ehMaster, podeGerenciarUsuarios } from './permissions'
import { registrarAuditoria } from './auditoria'
import { mensagemAmigavel } from './erros'
import { verificarTurnstile } from './turnstile'
import { podePassar } from './limite'
import { contextoDoPedido } from './pedidos-setor-consulta'
import { criarFornecedor } from './actions'
import { agendarTemplateSupervisor, enviarMensagemAgora } from './mensagens'
import { chaveDoSetor, normalizarAmpliacao, lerQuantidadeAprovada, respostaDaAmpliacao, MAX_PESSOAS } from './pedido-setor-regras'
import { alcancaSetor } from './autorizacao'
import {
  camposParaCriarFornecedor, descreverDias, motivoNoTexto, normalizarPedidoPublico, normalizarSetor,
  podeDecidirPedidos, setoresNoTexto, situacaoDoLink, type Pessoa, type SetorPedido,
} from './pedido-setor-regras'

/**
 * Pedido de setor — as escritas (formulário público, fila do admin).
 *
 * O fornecedor envia um pedido pelo link do evento; o admin/master edita e decide CADA setor.
 * Aprovado, o setor nasce pela MESMA criação da tela de fornecedores (`criarFornecedor`: setor,
 * supervisor pelo CPF, mensagem de WhatsApp e limite por dia) — não existe um segundo caminho que
 * pudesse divergir. Negado, o supervisor recebe a mensagem com o motivo.
 *
 * Toda ação devolve `{ ok }` / `{ erro }` e NUNCA lança: em produção o Next esconde a mensagem de uma
 * exceção de Server Action, e quem enviou ficaria sem saber o que corrigir.
 *
 * Banco: supabase/upgrade-pedidos-de-setor.sql. Regras: lib/pedido-setor-regras.ts.
 */

/** Texto curto para a auditoria (a linha não é lugar de lista inteira). */
const cortar = (t: string, max = 120) => (t.length > max ? `${t.slice(0, max - 1)}…` : t)

const AJUDA_MIGRACAO = 'Falta rodar a atualização do banco (upgrade-pedidos-de-setor.sql).'
const ERRO_BANCO = /pedidos_setor|pedido_setor|does not exist|schema cache/i
const MOTIVO_MAX = 300

type PerfilLogado = NonNullable<Awaited<ReturnType<typeof getPerfil>>>
type EventoDoPedido = { id: string; nome: string; organizacaoId: string | null }
type Decisor = { ok: true; perfil: PerfilLogado; evento: EventoDoPedido } | { ok: false; erro: string }

/** Quem pode decidir pedidos deste evento: admin da organização dele, ou master. */
async function decisorDoEvento(eventoId: string): Promise<Decisor> {
  const perfil = await getPerfil()
  if (!perfil) return { ok: false, erro: 'Sessão expirada. Entre de novo.' }
  if (!podeDecidirPedidos(perfil.role) || !podeGerenciarUsuarios(perfil)) {
    return { ok: false, erro: 'Só o administrador do evento (ou o master) decide pedidos de setor.' }
  }
  const { data: ev } = await supabaseAdmin.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).maybeSingle()
  if (!ev) return { ok: false, erro: 'Evento não encontrado.' }
  if (!ehMaster(perfil.role) && ev.organizacao_id !== perfil.organizacao_id) {
    return { ok: false, erro: 'Sem permissão sobre este evento.' }
  }
  return { ok: true, perfil, evento: { id: ev.id as string, nome: ev.nome as string, organizacaoId: (ev.organizacao_id as string | null) ?? null } }
}

// ─── O link público do evento ───────────────────────────────────────────────

/**
 * Liga ou desliga o link de pedido de setor do evento, com prazo opcional.
 *
 * O token nasce na primeira vez que se liga (e é reaproveitado depois: o link já divulgado no grupo continua
 * valendo se o admin desligar e religar). `prazo` é uma data/hora ISO; vazio tira o prazo.
 */
export async function alternarLinkPedidoSetor(
  eventoId: string, ligar: boolean, prazo?: string | null,
): Promise<{ ok: true; token: string } | { erro: string }> {
  try {
    const g = await decisorDoEvento(eventoId)
    if (!g.ok) return { erro: g.erro }

    let prazoIso: string | null = null
    if (prazo) {
      const d = new Date(prazo)
      if (Number.isNaN(d.getTime())) return { erro: 'O prazo informado não é uma data válida.' }
      prazoIso = d.toISOString()
    }

    const { data: atual, error: erroLeitura } = await supabaseAdmin
      .from('eventos').select('pedido_setor_token, pedido_setor_ativo').eq('id', eventoId).maybeSingle()
    if (erroLeitura) return { erro: ERRO_BANCO.test(erroLeitura.message) ? AJUDA_MIGRACAO : mensagemAmigavel(erroLeitura) }

    const token = ((atual as { pedido_setor_token?: string | null } | null)?.pedido_setor_token) ?? randomBytes(16).toString('hex')
    const eraAtivo = (atual as { pedido_setor_ativo?: boolean } | null)?.pedido_setor_ativo === true
    const { error } = await supabaseAdmin
      .from('eventos').update({ pedido_setor_ativo: ligar, pedido_setor_token: token, pedido_setor_prazo: prazoIso }).eq('id', eventoId)
    if (error) return { erro: ERRO_BANCO.test(error.message) ? AJUDA_MIGRACAO : mensagemAmigavel(error) }

    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'ALTERACAO_LINK_PEDIDO_SETOR', campoAlterado: 'Link de pedido de setor',
      valorAnterior: eraAtivo ? 'Aberto' : 'Fechado', valorNovo: ligar ? 'Aberto' : 'Fechado',
      eventoId, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true, token }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Troca o endereço do link (quando ele vazou para quem não devia). Os pedidos já enviados não são afetados. */
export async function trocarTokenPedidoSetor(eventoId: string): Promise<{ ok: true; token: string } | { erro: string }> {
  try {
    const g = await decisorDoEvento(eventoId)
    if (!g.ok) return { erro: g.erro }
    const token = randomBytes(16).toString('hex')
    const { error } = await supabaseAdmin.from('eventos').update({ pedido_setor_token: token }).eq('id', eventoId)
    if (error) return { erro: ERRO_BANCO.test(error.message) ? AJUDA_MIGRACAO : mensagemAmigavel(error) }
    // O token em si não vai para a auditoria: é o segredo do link, e a linha é lida por mais gente.
    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'LINK_PEDIDO_SETOR_TROCADO', campoAlterado: 'Link de pedido de setor',
      valorAnterior: 'Endereço antigo (deixa de funcionar)', valorNovo: 'Endereço novo gerado',
      eventoId, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true, token }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

// ─── O formulário público ───────────────────────────────────────────────────

/**
 * Recebe o pedido do fornecedor. PÚBLICA — sem sessão —, por isso passa por três barreiras antes de gravar:
 * captcha (quando configurado), limite de envios por origem e a validação completa das regras.
 *
 * Reenvio em seguida (duplo clique, rede lenta) devolve o MESMO pedido, em vez de criar outro.
 */
export async function enviarPedidoDeSetor(
  tokenDoEvento: string, dados: unknown, turnstileToken?: string,
): Promise<{ ok: true; token: string } | { erro: string }> {
  try {
    if (!(await verificarTurnstile(turnstileToken))) {
      return { erro: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.' }
    }

    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'sem-ip'
    if (!(await podePassar(`pedido-setor:${ip}`, 8, 60 * 60 * 1000)) || !(await podePassar(`pedido-setor-evento:${tokenDoEvento}`, 300, 60 * 60 * 1000))) {
      return { erro: 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.' }
    }

    const { data: ev, error: erroEvento } = await supabaseAdmin
      .from('eventos').select('id, nome, pedido_setor_ativo, pedido_setor_prazo')
      .eq('pedido_setor_token', String(tokenDoEvento ?? '')).maybeSingle()
    if (erroEvento || !ev) return { erro: 'Este formulário não está disponível.' }

    const situacao = situacaoDoLink({ ativo: ev.pedido_setor_ativo === true, prazo: ev.pedido_setor_prazo as string | null })
    if (!situacao.aberto) {
      return { erro: situacao.motivo === 'prazo' ? 'O prazo para enviar pedidos terminou.' : 'Os pedidos de setor deste evento estão fechados.' }
    }

    const eventoId = ev.id as string
    const pedido = normalizarPedidoPublico(dados, (await contextoDoPedido(eventoId)).ctx)
    if (!pedido.ok) return { erro: pedido.erro }
    const { contato, observacao, setores } = pedido.valor

    // Reenvio em seguida (duplo clique, rede lenta): se o conteúdo é IDÊNTICO ao pedido que acabou de entrar,
    // devolve esse mesmo pedido. Pedido diferente do mesmo supervisor, mesmo logo depois, é outro pedido.
    const { data: recentes } = await supabaseAdmin.from('pedidos_setor')
      .select('token, pedidos_setor_itens(nome, subevento_id, quantidade)')
      .eq('evento_id', eventoId).eq('contato_cpf', contato.cpf)
      .gte('criado_em', new Date(Date.now() - 60_000).toISOString())
      .order('criado_em', { ascending: false }).limit(3)
    const impressao = (xs: { nome: string; subevento_id: string | null; quantidade: number | null }[]) =>
      xs.map(x => `${chaveDoSetor(x.nome, x.subevento_id ?? null)}#${x.quantidade ?? ''}`).sort().join(';')
    const procurado = impressao(setores.map(x => ({ nome: x.nome, subevento_id: x.subeventoId, quantidade: x.quantidade })))
    const repetido = (recentes ?? []).find(r =>
      impressao((r.pedidos_setor_itens ?? []) as unknown as { nome: string; subevento_id: string | null; quantidade: number | null }[]) === procurado)
    if (repetido) return { ok: true, token: repetido.token as string }

    const token = randomBytes(16).toString('hex')
    const { data: criado, error } = await supabaseAdmin.from('pedidos_setor').insert({
      evento_id: eventoId, token, contato_nome: contato.nome, contato_cpf: contato.cpf,
      contato_telefone: contato.telefone, observacao,
    }).select('id').single()
    if (error || !criado) return { erro: ERRO_BANCO.test(error?.message ?? '') ? 'Este formulário ainda não está disponível.' : 'Não foi possível enviar o pedido. Tente de novo.' }

    const { error: erroItens } = await supabaseAdmin.from('pedidos_setor_itens').insert(setores.map((s, ordem) => ({
      pedido_id: criado.id, evento_id: eventoId, ordem, nome: s.nome, subevento_id: s.subeventoId,
      quantidade: s.quantidade, quantidade_por_dia: s.porDia,
      supervisor_nome: s.supervisor.nome, supervisor_cpf: s.supervisor.cpf, supervisor_telefone: s.supervisor.telefone,
      original: s,
    })))
    if (erroItens) {
      // Pedido sem setor não serve pra nada: desfaz, para o fornecedor poder reenviar inteiro.
      await supabaseAdmin.from('pedidos_setor').delete().eq('id', criado.id)
      return { erro: 'Não foi possível enviar o pedido. Tente de novo.' }
    }

    // Sem login: quem fez é o contato que preencheu o formulário (id nulo). A organização vem do evento.
    after(() => registrarAuditoria({
      perfil: { id: null, nome: `${contato.nome} (pelo link de pedido de setor)` },
      acao: 'PEDIDO_SETOR_ENVIADO', campoAlterado: 'Pedido de setor',
      valorNovo: cortar(`${setores.length} setor(es): ${setores.map(x => x.nome).join(', ')}`),
      eventoId,
    }))
    revalidatePath(`/admin/eventos/${eventoId}`)
    revalidatePath(`/admin/eventos/${eventoId}/pedidos-setor`)
    return { ok: true, token }
  } catch (e) {
    console.error('[pedido-setor] envio falhou', e)
    return { erro: 'Não foi possível enviar o pedido. Tente de novo.' }
  }
}

// ─── A fila do admin ────────────────────────────────────────────────────────

type ItemCarregado = {
  id: string; pedido_id: string; evento_id: string; nome: string; subevento_id: string | null
  quantidade: number | null; quantidade_por_dia: Record<string, number> | null
  supervisor_nome: string; supervisor_cpf: string; supervisor_telefone: string
  status: string; original: Record<string, unknown> | null
  pedidos_setor: { id: string; contato_nome: string; contato_telefone: string; contato_cpf: string } | null
}

async function carregarItem(itemId: string): Promise<ItemCarregado | null> {
  const { data } = await supabaseAdmin
    .from('pedidos_setor_itens')
    .select('id, pedido_id, evento_id, nome, subevento_id, quantidade, quantidade_por_dia, supervisor_nome, supervisor_cpf, supervisor_telefone, status, original, pedidos_setor(id, contato_nome, contato_telefone, contato_cpf)')
    .eq('id', itemId).maybeSingle()
  return (data as unknown as ItemCarregado | null) ?? null
}

const supervisorDoItem = (i: ItemCarregado): Pessoa => ({ nome: i.supervisor_nome, cpf: i.supervisor_cpf, telefone: i.supervisor_telefone })

/** O que a tela mostra de um setor ao decidir — editável pelo admin. */
export type DadosDoSetor = {
  nome: string
  subeventoId: string | null
  quantidade: number | string
  porDia: Record<string, number | string>
  supervisor: { nome: string; cpf: string; telefone: string }
}

/** Grava as edições do admin num setor ainda pendente. */
export async function salvarItemDoPedido(itemId: string, dados: DadosDoSetor): Promise<{ ok: true } | { erro: string }> {
  try {
    const item = await carregarItem(itemId)
    if (!item) return { erro: 'Setor não encontrado.' }
    const g = await decisorDoEvento(item.evento_id)
    if (!g.ok) return { erro: g.erro }
    if (item.status !== 'pendente') return { erro: 'Este setor já foi decidido e não pode mais ser editado.' }

    const setor = normalizarSetor(dados, (await contextoDoPedido(item.evento_id)).ctx, '', supervisorDoItem(item))
    if (!setor.ok) return { erro: setor.erro }

    const { error } = await supabaseAdmin.from('pedidos_setor_itens').update(colunasDoSetor(setor.valor)).eq('id', itemId).eq('status', 'pendente')
    if (error) return { erro: mensagemAmigavel(error) }
    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'PEDIDO_SETOR_EDITADO', campoAlterado: 'Pedido de setor',
      valorAnterior: cortar(resumoDoSetor({ nome: item.nome, quantidade: item.quantidade, porDia: item.quantidade_por_dia ?? {} })),
      valorNovo: cortar(resumoDoSetor(setor.valor)),
      eventoId: item.evento_id, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${item.evento_id}/pedidos-setor`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

const colunasDoSetor = (s: SetorPedido) => ({
  nome: s.nome, subevento_id: s.subeventoId, quantidade: s.quantidade, quantidade_por_dia: s.porDia,
  supervisor_nome: s.supervisor.nome, supervisor_cpf: s.supervisor.cpf, supervisor_telefone: s.supervisor.telefone,
})

const resumoDoSetor = (s: { nome: string; quantidade: number | null; porDia: Record<string, number> }) =>
  `${s.nome} — ${s.quantidade ?? '?'} pessoas${descreverDias(s.porDia) ? ` (${descreverDias(s.porDia)})` : ''}`

/**
 * Aprova UM setor — com as edições da tela, se vierem junto.
 *
 * A ordem importa: primeiro "reserva" a decisão (só uma chamada consegue passar de pendente para aprovado;
 * dois cliques ou dois admins ao mesmo tempo não criam o setor duas vezes), depois cria pelo caminho da tela
 * de fornecedores. Se a criação falhar (CPF que já é de outro tipo de acesso, por exemplo), a decisão
 * volta a pendente e o erro vai inteiro para quem aprovou.
 */
export async function aprovarItemDoPedido(itemId: string, dados?: DadosDoSetor): Promise<{ ok: true; fornecedorId: string | null } | { erro: string }> {
  try {
    const item = await carregarItem(itemId)
    if (!item) return { erro: 'Setor não encontrado.' }
    const g = await decisorDoEvento(item.evento_id)
    if (!g.ok) return { erro: g.erro }
    if (item.status !== 'pendente') return { erro: 'Este setor já foi decidido.' }

    const { ctx } = await contextoDoPedido(item.evento_id)
    const setor = normalizarSetor(
      dados ?? { nome: item.nome, subeventoId: item.subevento_id, quantidade: item.quantidade, porDia: item.quantidade_por_dia ?? {}, supervisor: supervisorDoItem(item) },
      ctx, '', supervisorDoItem(item),
    )
    if (!setor.ok) return { erro: setor.erro }

    // Já existe um setor com este nome neste subevento? Criar de novo duplicaria equipe, link e QR.
    const { data: existentes } = await supabaseAdmin.from('fornecedores').select('id, nome, subevento_id').eq('evento_id', item.evento_id)
    const chave = chaveDoSetor(setor.valor.nome, setor.valor.subeventoId)
    if ((existentes ?? []).some(f => chaveDoSetor(f.nome as string, (f.subevento_id as string | null) ?? null) === chave)) {
      return { erro: `Já existe um setor "${setor.valor.nome}" neste subevento. Troque o nome antes de aprovar, ou negue o pedido.` }
    }

    const agora = new Date().toISOString()
    const { data: reservado, error: erroReserva } = await supabaseAdmin.from('pedidos_setor_itens')
      .update({ ...colunasDoSetor(setor.valor), status: 'aprovado', decidido_por: g.perfil.id, decidido_em: agora, motivo_negacao: null })
      .eq('id', itemId).eq('status', 'pendente').select('id')
    if (erroReserva) return { erro: mensagemAmigavel(erroReserva) }
    if (!reservado?.length) return { erro: 'Este setor acabou de ser decidido por outra pessoa.' }

    const desfazer = () => supabaseAdmin.from('pedidos_setor_itens')
      .update({ status: 'pendente', decidido_por: null, decidido_em: null }).eq('id', itemId)

    /*
     * CPF que JÁ TEM conta: vale o nome e o telefone DA CONTA, não os do formulário público. A criação do setor
     * atualiza o telefone da conta com o que vier aqui — e o telefone é para onde vai o link de senha. Sem isto,
     * qualquer pessoa pedia um setor com o CPF de outra e o PRÓPRIO telefone e, aprovado, recebia o acesso dela.
     * Achado em 08/10/2026, quando um número digitado com o 55 (cortado no fim) foi parar na conta do supervisor.
     */
    const { data: contaExistente } = await supabaseAdmin
      .from('perfis').select('nome, telefone').eq('cpf', setor.valor.supervisor.cpf).maybeSingle()
    const supervisorFinal = contaExistente?.telefone
      ? { ...setor.valor.supervisor, nome: (contaExistente.nome as string) || setor.valor.supervisor.nome, telefone: String(contaExistente.telefone) }
      : setor.valor.supervisor

    const formulario = new FormData()
    for (const [campo, valor] of Object.entries(camposParaCriarFornecedor({ ...setor.valor, supervisor: supervisorFinal }))) formulario.set(campo, valor)
    const criado = await criarFornecedor(item.evento_id, formulario)
    if (criado.error) {
      await desfazer()
      return { erro: criado.error }
    }

    // O setor recém-criado: o mais novo com este nome neste subevento.
    let consulta = supabaseAdmin.from('fornecedores').select('id').eq('evento_id', item.evento_id).eq('nome', setor.valor.nome)
    consulta = setor.valor.subeventoId ? consulta.eq('subevento_id', setor.valor.subeventoId) : consulta.is('subevento_id', null)
    const { data: novo } = await consulta.order('created_at', { ascending: false }).limit(1).maybeSingle()
    const fornecedorId = (novo?.id as string | undefined) ?? null
    if (fornecedorId) await supabaseAdmin.from('pedidos_setor_itens').update({ fornecedor_id: fornecedorId }).eq('id', itemId)

    const original = (item.original ?? {}) as { nome?: string; quantidade?: number; porDia?: Record<string, number> }
    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'APROVACAO_PEDIDO_SETOR', campoAlterado: 'Pedido de setor',
      valorAnterior: `Pedido: ${resumoDoSetor({ nome: original.nome ?? item.nome, quantidade: original.quantidade ?? item.quantidade, porDia: original.porDia ?? {} })}`,
      valorNovo: `Aprovado: ${resumoDoSetor(setor.valor)}`,
      eventoId: item.evento_id, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    revalidatePath(`/admin/eventos/${item.evento_id}/pedidos-setor`)
    return { ok: true, fornecedorId }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Nega um ou mais setores, com o motivo, e avisa o responsável pelo pedido por WhatsApp.
 *
 * Uma mensagem por PEDIDO (não por setor): negar três setores do mesmo fornecedor de uma vez manda uma
 * mensagem só, listando os três. A decisão vale mesmo se a mensagem não sair — o motivo também aparece na
 * página de acompanhamento do pedido.
 */
export async function negarItensDoPedido(
  itemIds: string[], motivo: string,
): Promise<{ ok: true; negados: number; mensagem: boolean } | { erro: string }> {
  try {
    const razao = motivoNoTexto(String(motivo ?? ''))
    if (razao.length < 3) return { erro: 'Escreva o motivo da reprovação.' }
    if (razao.length > MOTIVO_MAX) return { erro: `O motivo está muito comprido (máximo ${MOTIVO_MAX} caracteres).` }
    const ids = [...new Set(itemIds ?? [])].slice(0, 50)
    if (!ids.length) return { erro: 'Escolha o setor que será negado.' }

    const { data: linhas } = await supabaseAdmin
      .from('pedidos_setor_itens')
      .select('id, pedido_id, evento_id, nome, status, pedidos_setor(id, contato_nome, contato_telefone)')
      .in('id', ids)
    const itens = (linhas ?? []) as unknown as { id: string; pedido_id: string; evento_id: string; nome: string; status: string; pedidos_setor: { id: string; contato_nome: string; contato_telefone: string } | null }[]
    if (!itens.length) return { erro: 'Setor não encontrado.' }

    const eventoId = itens[0].evento_id
    if (itens.some(i => i.evento_id !== eventoId)) return { erro: 'Escolha setores de um evento só.' }
    const g = await decisorDoEvento(eventoId)
    if (!g.ok) return { erro: g.erro }

    const pendentes = itens.filter(i => i.status === 'pendente')
    if (!pendentes.length) return { erro: 'Este setor já foi decidido.' }

    const { data: reservados, error } = await supabaseAdmin.from('pedidos_setor_itens')
      .update({ status: 'negado', motivo_negacao: razao, decidido_por: g.perfil.id, decidido_em: new Date().toISOString() })
      .in('id', pendentes.map(i => i.id)).eq('status', 'pendente').select('id')
    if (error) return { erro: mensagemAmigavel(error) }
    const negadosIds = new Set((reservados ?? []).map(r => r.id as string))
    const negados = pendentes.filter(i => negadosIds.has(i.id))
    if (!negados.length) return { erro: 'Este setor acabou de ser decidido por outra pessoa.' }

    for (const i of negados) {
      after(() => registrarAuditoria({
        perfil: g.perfil, acao: 'NEGACAO_PEDIDO_SETOR', campoAlterado: 'Pedido de setor',
        valorAnterior: 'Aguardando decisão', valorNovo: `Negado: ${i.nome}`, motivo: razao,
        eventoId, organizacaoId: g.evento.organizacaoId ?? undefined,
      }))
    }

    // Uma mensagem por pedido, listando os setores negados dele.
    const porPedido = new Map<string, { contato: { nome: string; telefone: string }; setores: string[] }>()
    for (const i of negados) {
      const p = i.pedidos_setor
      if (!p) continue
      const grupo = porPedido.get(p.id) ?? { contato: { nome: p.contato_nome, telefone: p.contato_telefone }, setores: [] }
      grupo.setores.push(i.nome)
      porPedido.set(p.id, grupo)
    }
    let mensagem = true
    for (const { contato, setores } of porPedido.values()) {
      try {
        const id = await agendarTemplateSupervisor({
          eventoId, telefone: contato.telefone, template: 'pedido_setor_reprovado',
          // Ordem do texto: {{1}} nome · {{2}} setor(es) · {{3}} evento · {{4}} motivo
          parametros: [contato.nome, setoresNoTexto(setores), g.evento.nome, razao],
        })
        if (id) after(() => enviarMensagemAgora(id).catch(e => console.error('[pedido-setor] envio imediato falhou', e)))
        else mensagem = false
      } catch (e) {
        mensagem = false
        console.error('[pedido-setor] mensagem de reprovação não agendou', e)
      }
    }

    revalidatePath(`/admin/eventos/${eventoId}/pedidos-setor`)
    return { ok: true, negados: negados.length, mensagem }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/**
 * Quantos pedidos esperam decisão (setores novos + mais colaboradores) — o número ao lado do item do menu. Master vê todos os eventos; admin, os da
 * organização dele; os demais papéis, zero. Nunca lança: o menu aparece em toda tela.
 */
export async function contarPedidosPendentes(): Promise<number> {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeDecidirPedidos(perfil.role)) return 0

    let eventoIds: string[] | null = null
    if (!ehMaster(perfil.role)) {
      const { data } = await supabaseAdmin.from('eventos').select('id').eq('organizacao_id', perfil.organizacao_id)
      eventoIds = (data ?? []).map(e => e.id as string)
      if (!eventoIds.length) return 0
    }
    let itens = supabaseAdmin.from('pedidos_setor_itens').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    let ampliacoes = supabaseAdmin.from('pedidos_ampliacao').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    if (eventoIds) {
      itens = itens.in('evento_id', eventoIds)
      ampliacoes = ampliacoes.in('evento_id', eventoIds)
    }
    const [a, b] = await Promise.all([itens, ampliacoes])
    return (a.count ?? 0) + (b.count ?? 0)
  } catch {
    return 0
  }
}

// ─── Pedido de MAIS colaboradores (do supervisor, para o admin) ─────────────

/**
 * O supervisor pede mais gente para o setor DELE: quantos tem hoje (o combinado — ou, sem combinado, quantos estão
 * cadastrados), quantos quer e por quê. Cai na mesma fila dos pedidos de setor, para o admin/master decidir. Um
 * pedido aberto por setor de cada vez: o segundo, enquanto o primeiro espera, é recusado com a explicação.
 */
export async function solicitarMaisColaboradores(
  fornecedorId: string, quantidadeDesejada: number | string, motivo: string,
): Promise<{ ok: true } | { erro: string }> {
  try {
    const perfil = await getPerfil()
    if (!perfil) return { erro: 'Sessão expirada. Entre de novo.' }
    if (perfil.role !== 'supervisor' || !(await alcancaSetor(perfil, fornecedorId))) {
      return { erro: 'Só o supervisor deste setor pode pedir mais colaboradores.' }
    }

    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, nome, evento_id, quantidade_estimada').eq('id', fornecedorId).maybeSingle()
    if (!setor) return { erro: 'Setor não encontrado.' }

    const { count: cadastrados } = await supabaseAdmin
      .from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedorId)
      .or('origem.is.null,origem.neq.supervisor')
    const combinado = (setor.quantidade_estimada as number | null) ?? null
    const atual = combinado ?? cadastrados ?? 0

    const pedido = normalizarAmpliacao({ atual, desejada: quantidadeDesejada, motivo })
    if (!pedido.ok) return { erro: pedido.erro }

    const { data: aberto, error: erroAberto } = await supabaseAdmin
      .from('pedidos_ampliacao').select('id').eq('fornecedor_id', fornecedorId).eq('status', 'pendente').limit(1)
    if (erroAberto) return { erro: ERRO_BANCO.test(erroAberto.message) ? AJUDA_MIGRACAO : mensagemAmigavel(erroAberto) }
    if (aberto?.length) return { erro: 'Você já tem um pedido aguardando a decisão do administrador para este setor.' }

    const { error } = await supabaseAdmin.from('pedidos_ampliacao').insert({
      evento_id: setor.evento_id, fornecedor_id: fornecedorId, solicitante_id: perfil.id, solicitante_nome: perfil.nome,
      quantidade_atual: combinado, cadastrados: cadastrados ?? 0, quantidade_desejada: pedido.valor.desejada, motivo: pedido.valor.motivo,
    })
    if (error) return { erro: ERRO_BANCO.test(error.message) ? AJUDA_MIGRACAO : mensagemAmigavel(error) }

    after(() => registrarAuditoria({
      perfil, acao: 'PEDIDO_AMPLIACAO', campoAlterado: `Mais colaboradores — ${setor.nome}`,
      valorAnterior: `${atual} colaboradores`, valorNovo: `Pediu ${pedido.valor.desejada}`, motivo: pedido.valor.motivo,
      eventoId: setor.evento_id as string,
    }))
    revalidatePath(`/admin/eventos/${setor.evento_id}/fornecedor/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${setor.evento_id}/pedidos-setor`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

type AmpliacaoCarregada = {
  id: string; evento_id: string; fornecedor_id: string; solicitante_id: string | null; solicitante_nome: string
  quantidade_atual: number | null; quantidade_desejada: number; status: string
  fornecedores: { nome: string } | null
}

async function carregarAmpliacao(id: string): Promise<AmpliacaoCarregada | null> {
  const { data } = await supabaseAdmin
    .from('pedidos_ampliacao')
    .select('id, evento_id, fornecedor_id, solicitante_id, solicitante_nome, quantidade_atual, quantidade_desejada, status, fornecedores(nome)')
    .eq('id', id).maybeSingle()
  return (data as unknown as AmpliacaoCarregada | null) ?? null
}

/** Avisa o supervisor da decisão (modelo `ampliacao_resposta`). Falhar não desfaz a decisão: ele também a vê na tela. */
async function avisarSupervisorDaAmpliacao(a: AmpliacaoCarregada, evento: EventoDoPedido, resposta: string): Promise<boolean> {
  try {
    if (!a.solicitante_id) return false
    const { data: sup } = await supabaseAdmin.from('perfis').select('nome, telefone').eq('id', a.solicitante_id).maybeSingle()
    if (!sup?.telefone) return false
    const id = await agendarTemplateSupervisor({
      eventoId: evento.id, telefone: sup.telefone as string, template: 'ampliacao_resposta',
      // Ordem do texto: {{1}} nome · {{2}} setor · {{3}} evento · {{4}} resposta
      parametros: [sup.nome as string, a.fornecedores?.nome ?? '', evento.nome, resposta],
    })
    if (id) after(() => enviarMensagemAgora(id).catch(e => console.error('[ampliacao] envio imediato falhou', e)))
    return !!id
  } catch (e) {
    console.error('[ampliacao] mensagem não agendou', e)
    return false
  }
}

/**
 * Aprova o pedido — com o número que o admin decidir (pode ser menos que o pedido). O combinado do setor
 * (`quantidade_estimada`) passa a ser esse número. Reserva a decisão antes de mexer no setor: dois cliques não
 * aprovam duas vezes; se o setor não gravar, a decisão volta a pendente.
 */
export async function aprovarAmpliacao(id: string, quantidadeAprovada: number | string): Promise<{ ok: true; mensagem: boolean } | { erro: string }> {
  try {
    const a = await carregarAmpliacao(id)
    if (!a) return { erro: 'Pedido não encontrado.' }
    const g = await decisorDoEvento(a.evento_id)
    if (!g.ok) return { erro: g.erro }
    if (a.status !== 'pendente') return { erro: 'Este pedido já foi decidido.' }
    const aprovada = lerQuantidadeAprovada(quantidadeAprovada)
    if (!aprovada) return { erro: `Informe quantos colaboradores ficam aprovados (de 1 a ${MAX_PESSOAS}).` }

    const { data: reservado, error } = await supabaseAdmin.from('pedidos_ampliacao')
      .update({ status: 'aprovado', quantidade_aprovada: aprovada, decidido_por: g.perfil.id, decidido_em: new Date().toISOString() })
      .eq('id', id).eq('status', 'pendente').select('id')
    if (error) return { erro: mensagemAmigavel(error) }
    if (!reservado?.length) return { erro: 'Este pedido acabou de ser decidido por outra pessoa.' }

    const { error: erroSetor } = await supabaseAdmin.from('fornecedores').update({ quantidade_estimada: aprovada }).eq('id', a.fornecedor_id)
    if (erroSetor) {
      await supabaseAdmin.from('pedidos_ampliacao').update({ status: 'pendente', quantidade_aprovada: null, decidido_por: null, decidido_em: null }).eq('id', id)
      return { erro: mensagemAmigavel(erroSetor) }
    }

    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'APROVACAO_AMPLIACAO', campoAlterado: `Mais colaboradores — ${a.fornecedores?.nome ?? ''}`,
      valorAnterior: `${a.quantidade_atual ?? 'sem número'} combinados (pediu ${a.quantidade_desejada})`, valorNovo: `${aprovada} combinados`,
      eventoId: a.evento_id, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    const mensagem = await avisarSupervisorDaAmpliacao(a, g.evento, respostaDaAmpliacao({ aprovado: true, aprovada, desejada: a.quantidade_desejada }))
    revalidatePath(`/admin/eventos/${a.evento_id}/pedidos-setor`)
    revalidatePath(`/admin/eventos/${a.evento_id}/fornecedor/${a.fornecedor_id}`)
    return { ok: true, mensagem }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}

/** Nega o pedido, com o motivo. O combinado do setor não muda. */
export async function negarAmpliacao(id: string, motivo: string): Promise<{ ok: true; mensagem: boolean } | { erro: string }> {
  try {
    const razao = motivoNoTexto(String(motivo ?? ''))
    if (razao.length < 3) return { erro: 'Escreva o motivo.' }
    if (razao.length > MOTIVO_MAX) return { erro: `O motivo está muito comprido (máximo ${MOTIVO_MAX} caracteres).` }
    const a = await carregarAmpliacao(id)
    if (!a) return { erro: 'Pedido não encontrado.' }
    const g = await decisorDoEvento(a.evento_id)
    if (!g.ok) return { erro: g.erro }
    if (a.status !== 'pendente') return { erro: 'Este pedido já foi decidido.' }

    const { data: reservado, error } = await supabaseAdmin.from('pedidos_ampliacao')
      .update({ status: 'negado', motivo_negacao: razao, decidido_por: g.perfil.id, decidido_em: new Date().toISOString() })
      .eq('id', id).eq('status', 'pendente').select('id')
    if (error) return { erro: mensagemAmigavel(error) }
    if (!reservado?.length) return { erro: 'Este pedido acabou de ser decidido por outra pessoa.' }

    after(() => registrarAuditoria({
      perfil: g.perfil, acao: 'NEGACAO_AMPLIACAO', campoAlterado: `Mais colaboradores — ${a.fornecedores?.nome ?? ''}`,
      valorAnterior: `Pediu ${a.quantidade_desejada}`, valorNovo: 'Negado', motivo: razao,
      eventoId: a.evento_id, organizacaoId: g.evento.organizacaoId ?? undefined,
    }))
    const mensagem = await avisarSupervisorDaAmpliacao(a, g.evento, respostaDaAmpliacao({ aprovado: false, motivo: razao }))
    revalidatePath(`/admin/eventos/${a.evento_id}/pedidos-setor`)
    revalidatePath(`/admin/eventos/${a.evento_id}/fornecedor/${a.fornecedor_id}`)
    return { ok: true, mensagem }
  } catch (e) {
    return { erro: mensagemAmigavel(e) }
  }
}
