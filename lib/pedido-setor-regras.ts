/**
 * Pedido de setor — as REGRAS, sem banco (mesmo espírito de lib/escala-regras.ts e
 * lib/estrutura-regras.ts): o que o formulário público aceita, o que o admin pode editar,
 * em que estado fica um pedido e como um setor aprovado vira o cadastro de verdade.
 *
 * Quem grava é lib/actions-pedidos-setor.ts. Aqui só se decide — por isso é testável
 * sozinho (testes/pedido-setor.mjs) e a tela usa as mesmas funções do servidor.
 *
 * O fluxo:
 *   1. o fornecedor abre o link do evento e envia um pedido com um ou mais setores;
 *   2. o admin/master do evento edita o que quiser e decide CADA setor: aprova ou nega;
 *   3. aprovado → nasce o setor + o supervisor (a mesma criação da tela de fornecedores);
 *      negado → o supervisor recebe a mensagem com o motivo.
 *
 * Banco: supabase/upgrade-pedidos-de-setor.sql.
 */
import { validarCpf, nomeEmMaiusculo } from './format'
import { rotuloDoDia } from './escala-regras'
import { normalizarNome } from './estrutura-regras'
import { listarEmTexto } from './encarregado'

export const MAX_SETORES_POR_PEDIDO = 12
/** Teto de pessoas num único número — barra erro de digitação ("1000" em vez de "10"), não é limite de negócio. */
export const MAX_PESSOAS = 5000
const MAX_NOME = 80
const MAX_OBSERVACAO = 500

export type StatusDoItem = 'pendente' | 'aprovado' | 'negado'
export type StatusDoPedido = StatusDoItem | 'parcial'

/** Quem pode DECIDIR um pedido: admin e master (decisão do Juan, 08/10/2026). */
export const podeDecidirPedidos = (role?: string | null) => role === 'master' || role === 'admin'

export type Pessoa = { nome: string; cpf: string; telefone: string }

export type SetorPedido = {
  nome: string
  subeventoId: string | null
  /** O total de colaboradores do setor (vira `quantidade_estimada`). */
  quantidade: number
  /** Pessoas por dia de trabalho, "YYYY-MM-DD" → número. Só dias com número. */
  porDia: Record<string, number>
  supervisor: Pessoa
}

export type PedidoNormalizado = {
  contato: Pessoa
  observacao: string | null
  setores: SetorPedido[]
}

export type ContextoDoPedido = {
  /** Os dias de trabalho do evento. Vazio = o evento não tem dias configurados: vale só o total. */
  dias: string[]
  /** Os subeventos do evento, quando ele usa subeventos; `null` = não usa (nenhum setor tem subevento). */
  subeventoIds: string[] | null
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }
const falha = <T>(erro: string): Resultado<T> => ({ ok: false, erro })

// ─── Campos soltos ──────────────────────────────────────────────────────────

/** Só dígitos, sem o 55 do país: 10 ou 11 dígitos (DDD + número). `null` = não serve. */
export function normalizarTelefone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

/** Inteiro de 1 a MAX_PESSOAS; aceita número ou texto. Vazio/0 = `null` ("não informado"); lixo = `undefined`. */
function lerQuantidade(v: unknown): number | null | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PESSOAS) return undefined
  return n === 0 ? null : n
}

function lerPessoa(entrada: unknown, quem: string): Resultado<Pessoa> {
  const e = (entrada ?? {}) as Record<string, unknown>
  const nome = String(e.nome ?? '').replace(/\s+/g, ' ').trim()
  if (nome.length < 3) return falha(`Informe o nome completo ${quem}.`)
  if (nome.length > MAX_NOME) return falha(`O nome ${quem} está muito comprido.`)
  const cpf = String(e.cpf ?? '').replace(/\D/g, '')
  if (!validarCpf(cpf)) return falha(`O CPF ${quem} não é válido. Confira os números.`)
  const telefone = normalizarTelefone(e.telefone)
  if (!telefone) return falha(`Informe o WhatsApp ${quem} com DDD (ex.: 27 99999-9999).`)
  return { ok: true, valor: { nome, cpf, telefone } }
}

// ─── Um setor ───────────────────────────────────────────────────────────────

/**
 * Valida UM setor — o mesmo conjunto de regras para o formulário público e para a edição do admin.
 * `padrao` é o supervisor a usar quando o setor não traz o dele (no formulário, o contato do pedido).
 */
export function normalizarSetor(
  entrada: unknown, ctx: ContextoDoPedido, rotulo: string, padrao?: Pessoa,
): Resultado<SetorPedido> {
  const e = (entrada ?? {}) as Record<string, unknown>
  const prefixo = rotulo ? `${rotulo}: ` : ''

  const nome = nomeEmMaiusculo(String(e.nome ?? ''))
  if (nome.length < 2) return falha(`${prefixo}informe o nome do setor.`)
  if (nome.length > MAX_NOME) return falha(`${prefixo}o nome do setor está muito comprido.`)

  const subRaw = String(e.subeventoId ?? '').trim()
  let subeventoId: string | null = null
  if (ctx.subeventoIds) {
    if (!subRaw) return falha(`${prefixo}escolha o subevento do setor.`)
    if (!ctx.subeventoIds.includes(subRaw)) return falha(`${prefixo}o subevento escolhido não existe neste evento.`)
    subeventoId = subRaw
  }

  const quantidade = lerQuantidade(e.quantidade)
  if (quantidade === undefined) return falha(`${prefixo}a quantidade de colaboradores precisa ser um número inteiro.`)
  if (quantidade === null) return falha(`${prefixo}informe quantos colaboradores o setor precisa.`)

  const porDia: Record<string, number> = {}
  const dias = (e.porDia ?? {}) as Record<string, unknown>
  for (const [dia, bruto] of Object.entries(dias)) {
    const n = lerQuantidade(bruto)
    if (n === undefined) return falha(`${prefixo}a quantidade de um dos dias não é um número válido.`)
    if (n === null) continue
    if (!ctx.dias.includes(dia)) return falha(`${prefixo}um dos dias escolhidos não faz parte deste evento.`)
    if (n > quantidade) {
      const r = rotuloDoDia(dia)
      return falha(`${prefixo}em ${r.semanaCurta} ${r.curto} você pediu ${n}, mais que o total de ${quantidade} colaboradores.`)
    }
    porDia[dia] = n
  }
  if (ctx.dias.length && !Object.keys(porDia).length) {
    return falha(`${prefixo}marque pelo menos um dia de trabalho e diga quantas pessoas precisa nele.`)
  }

  let supervisor = padrao
  const proprio = e.supervisor as Record<string, unknown> | null | undefined
  if (proprio && (String(proprio.nome ?? '').trim() || String(proprio.cpf ?? '').trim() || String(proprio.telefone ?? '').trim())) {
    const r = lerPessoa(proprio, 'do supervisor deste setor')
    if (!r.ok) return falha(`${prefixo}${r.erro[0].toLocaleLowerCase('pt-BR')}${r.erro.slice(1)}`)
    supervisor = r.valor
  }
  if (!supervisor) return falha(`${prefixo}informe o supervisor do setor.`)

  return { ok: true, valor: { nome, subeventoId, quantidade, porDia, supervisor } }
}

/** A mesma identidade de setor para achar repetido dentro do pedido: nome (sem caixa/acento) + subevento. */
export const chaveDoSetor = (nome: string, subeventoId: string | null) => `${normalizarNome(nome)}|${subeventoId ?? ''}`

// ─── O pedido inteiro (formulário público) ──────────────────────────────────

export function normalizarPedidoPublico(entrada: unknown, ctx: ContextoDoPedido): Resultado<PedidoNormalizado> {
  const e = (entrada ?? {}) as Record<string, unknown>

  const contato = lerPessoa(e.contato, 'do supervisor responsável')
  if (!contato.ok) return falha(contato.erro)

  const lista = Array.isArray(e.setores) ? e.setores : []
  if (!lista.length) return falha('Inclua pelo menos um setor no pedido.')
  if (lista.length > MAX_SETORES_POR_PEDIDO) {
    return falha(`Um pedido aceita até ${MAX_SETORES_POR_PEDIDO} setores. Envie os demais em outro pedido.`)
  }

  const setores: SetorPedido[] = []
  const vistos = new Set<string>()
  for (let i = 0; i < lista.length; i++) {
    const r = normalizarSetor(lista[i], ctx, lista.length > 1 ? `Setor ${i + 1}` : '', contato.valor)
    if (!r.ok) return falha(r.erro)
    const chave = chaveDoSetor(r.valor.nome, r.valor.subeventoId)
    if (vistos.has(chave)) return falha(`O setor "${r.valor.nome}" aparece mais de uma vez neste pedido.`)
    vistos.add(chave)
    setores.push(r.valor)
  }

  const observacao = String(e.observacao ?? '').replace(/\s+/g, ' ').trim()
  if (observacao.length > MAX_OBSERVACAO) return falha(`A observação está muito comprida (máximo ${MAX_OBSERVACAO} caracteres).`)

  return { ok: true, valor: { contato: contato.valor, observacao: observacao || null, setores } }
}

// ─── Estado ─────────────────────────────────────────────────────────────────

export const statusDoItemValido = (v: unknown): StatusDoItem =>
  v === 'aprovado' || v === 'negado' ? v : 'pendente'

/** O estado do pedido, pelo que aconteceu com cada setor dele. */
export function statusDoPedido(itens: { status: string }[]): StatusDoPedido {
  if (!itens.length || itens.some(i => statusDoItemValido(i.status) === 'pendente')) return 'pendente'
  const aprovados = itens.filter(i => i.status === 'aprovado').length
  if (aprovados === itens.length) return 'aprovado'
  if (aprovados === 0) return 'negado'
  return 'parcial'
}

/** O link público aceita pedido agora? Desligado, ou depois do prazo, recusa — e diz por quê. */
export function situacaoDoLink(
  l: { ativo: boolean; prazo?: string | Date | null }, agora: Date = new Date(),
): { aberto: true } | { aberto: false; motivo: 'desligado' | 'prazo' } {
  if (!l.ativo) return { aberto: false, motivo: 'desligado' }
  if (l.prazo) {
    const limite = new Date(l.prazo).getTime()
    if (Number.isFinite(limite) && agora.getTime() > limite) return { aberto: false, motivo: 'prazo' }
  }
  return { aberto: true }
}

// ─── Do pedido aprovado para o cadastro ─────────────────────────────────────

/**
 * Os campos do formulário de "Novo fornecedor" que um setor aprovado preenche — é o que a ação
 * entrega à MESMA criação da tela (supervisor pelo CPF, mensagem de WhatsApp, limite por dia).
 */
export function camposParaCriarFornecedor(s: SetorPedido): Record<string, string> {
  const campos: Record<string, string> = {
    nome: s.nome,
    quantidade_estimada: String(s.quantidade),
    supervisor_nome: s.supervisor.nome,
    supervisor_cpf: s.supervisor.cpf,
    supervisor_telefone: s.supervisor.telefone,
  }
  if (s.subeventoId) campos.subevento_id = s.subeventoId
  const dias = Object.entries(s.porDia).filter(([, n]) => n > 0)
  if (dias.length) {
    campos.trava_presente = '1'
    for (const [dia, n] of dias) campos[`trava_${dia}`] = String(n)
  }
  return campos
}

// ─── Textos ─────────────────────────────────────────────────────────────────

/** "Sáb 10/10: 8 · Dom 11/10: 6" — os dias do pedido, em ordem. */
export function descreverDias(porDia: Record<string, number>): string {
  const linhas = Object.entries(porDia).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b))
  if (!linhas.length) return ''
  return linhas.map(([dia, n]) => {
    const r = rotuloDoDia(dia)
    const semana = r.semanaCurta.charAt(0).toLocaleUpperCase('pt-BR') + r.semanaCurta.slice(1)
    return `${semana} ${r.curto}: ${n}`
  }).join(' · ')
}

/** Os setores no texto da mensagem: "A, B e C" — sem quebra de linha (a Meta recusa parâmetro com quebra). */
export const setoresNoTexto = (nomes: string[]) => listarEmTexto(nomes.map(n => n.replace(/\s+/g, ' ').trim()).filter(Boolean))

/** O motivo no texto da mensagem: uma linha só, sem ponto final repetido. */
export function motivoNoTexto(motivo: string): string {
  return motivo.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '')
}
