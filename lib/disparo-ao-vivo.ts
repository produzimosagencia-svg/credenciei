import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase-server'

/**
 * Acompanhamento ao vivo de um disparo avulso: um link público, com prazo, que
 * mostra o andamento da fila e o retorno da Meta para quem não tem conta no
 * sistema (o time do cliente dono da lista).
 *
 * Mesmo desenho do link de respostas compartilhadas: o link carrega um código
 * aleatório e o banco guarda só o hash dele em `sistema_estado`. A página só
 * mostra totais e telefone mascarado, nunca nome nem número inteiro.
 */
const PREFIXO = 'disparo_ao_vivo:'
/** Vários espectadores recarregando a cada poucos segundos leriam a fila inteira cada um; um resultado serve a todos por este tempo. */
const VALIDADE_MS = 4000
const VALIDADE_MODELO_MS = 45000

export type EstadoDisparoAoVivo = {
  titulo: string
  /** Ids de campanha gravados no JSON de `mensagens_agendadas.mensagem`. */
  campanhas: string[]
  /** Nome do modelo na Meta, para mostrar a situação e a qualidade dele. */
  template?: string
  /** Retornos da Meta anteriores a este instante não pertencem a este disparo. */
  desde: string
  expira_em: string
}

export type SituacaoDoContato = 'fila' | 'enviada' | 'entregue' | 'lida' | 'recusada' | 'cancelada'

export type DisparoAoVivo =
  | { valido: false; motivo: 'invalido' | 'expirado' }
  | {
      valido: true
      titulo: string
      expiraEm: string
      atualizadoEm: string
      total: number
      enviadas: number
      fila: number
      entregues: number
      lidas: number
      recusadas: number
      semConfirmacao: number
      canceladas: number
      ritmoPorMinuto: number
      previsaoDeTermino: string | null
      modelo: { situacao: string; qualidade: string } | null
      motivos: { motivo: string; total: number }[]
      blocos: { inicio: string; programadas: number; enviadas: number; entregues: number; lidas: number; recusadas: number }[]
      ultimos: { telefone: string; situacao: SituacaoDoContato; motivo: string; em: string }[]
    }

const MOTIVOS: Record<string, string> = {
  '131048': 'Bloqueio por suspeita de spam',
  '131049': 'Limite de marketing por pessoa',
  '130472': 'Número fora de marketing',
  '131026': 'Sem WhatsApp ou número inválido',
  '131050': 'Pediu para não receber marketing',
  '132015': 'Modelo pausado pela Meta',
}

function chaveDoToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null
  return `${PREFIXO}${createHash('sha256').update(token).digest('hex')}`
}

/** Cria o link e devolve o código. É a única hora em que o código existe em claro. */
export async function criarDisparoAoVivo(estado: EstadoDisparoAoVivo): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const chave = chaveDoToken(token)
  if (!chave) throw new Error('Não foi possível gerar o código do link.')
  const { error } = await supabaseAdmin
    .from('sistema_estado')
    .insert({ chave, valor: estado, atualizado_em: new Date().toISOString() })
  if (error) throw new Error(`Não foi possível criar o link: ${error.message}`)
  return token
}

/** DDD e os quatro dígitos finais: dá para a pessoa do atendimento reconhecer o contato sem expor o número. */
function mascarar(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  return d.startsWith('55') ? `(${d.slice(2, 4)}) 9••••-${d.slice(-4)}` : `+${d.slice(0, 2)} ••••-${d.slice(-4)}`
}

async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>, teto = 60000): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; de < teto; de += 1000) {
    const { data } = await consulta(de, de + 999)
    linhas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return linhas
}

const modelos = new Map<string, { em: number; valor: { situacao: string; qualidade: string } | null }>()

async function situacaoDoModelo(nome: string | undefined): Promise<{ situacao: string; qualidade: string } | null> {
  const conta = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!nome || !conta || !token) return null
  const guardado = modelos.get(nome)
  if (guardado && Date.now() - guardado.em < VALIDADE_MODELO_MS) return guardado.valor
  let valor: { situacao: string; qualidade: string } | null = guardado?.valor ?? null
  try {
    const resposta = await fetch(
      `https://graph.facebook.com/v21.0/${conta}/message_templates?name=${encodeURIComponent(nome)}&fields=name,status,quality_score`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000), cache: 'no-store' },
    )
    const corpo = await resposta.json() as { data?: { name: string; status: string; quality_score?: { score?: string } }[] }
    const achado = corpo.data?.find(t => t.name === nome)
    if (achado) valor = { situacao: achado.status, qualidade: achado.quality_score?.score ?? 'UNKNOWN' }
  } catch { /* sem resposta da Meta: fica o último valor conhecido */ }
  modelos.set(nome, { em: Date.now(), valor })
  return valor
}

const calculados = new Map<string, { em: number; valor: Promise<DisparoAoVivo> }>()

/** O estado do disparo para a página do link. Calculado no máximo uma vez a cada poucos segundos por link. */
export function disparoAoVivo(token: string): Promise<DisparoAoVivo> {
  const chave = chaveDoToken(token)
  if (!chave) return Promise.resolve({ valido: false, motivo: 'invalido' })
  const guardado = calculados.get(chave)
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor
  const valor = calcular(chave).catch((erro): DisparoAoVivo => {
    calculados.delete(chave)
    throw erro
  })
  calculados.set(chave, { em: Date.now(), valor })
  return valor
}

async function calcular(chave: string): Promise<DisparoAoVivo> {
  const { data } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', chave).maybeSingle()
  const estado = data?.valor as EstadoDisparoAoVivo | undefined
  if (!estado?.campanhas?.length) return { valido: false, motivo: 'invalido' }
  if (new Date(estado.expira_em).getTime() <= Date.now()) return { valido: false, motivo: 'expirado' }

  type Linha = { telefone: string; status: string; evolution_message_id: string | null; enviado_em: string | null; agendado_para: string }
  const filas = await Promise.all(estado.campanhas.map(campanha => lerTudo<Linha>((de, ate) => supabaseAdmin
    .from('mensagens_agendadas')
    .select('telefone, status, evolution_message_id, enviado_em, agendado_para')
    .eq('tipo', 'disparo_manual')
    .like('mensagem', `%${campanha}%`)
    .order('agendado_para')
    .order('id')
    .range(de, ate))))
  const fila = filas.flat()

  const retornos = await lerTudo<{ wa_message_id: string | null; tipo: string; codigo: string | null }>((de, ate) => supabaseAdmin
    .from('whatsapp_eventos')
    .select('wa_message_id, tipo, codigo:bruto->errors->0->>code')
    .eq('direcao', 'status')
    .gte('criado_em', estado.desde)
    .order('criado_em')
    .range(de, ate))
  const porMensagem = new Map<string, { tipos: Set<string>; codigo: string | null }>()
  for (const r of retornos) {
    if (!r.wa_message_id) continue
    const atual = porMensagem.get(r.wa_message_id) ?? { tipos: new Set<string>(), codigo: null }
    atual.tipos.add(r.tipo)
    if (r.codigo) atual.codigo = r.codigo
    porMensagem.set(r.wa_message_id, atual)
  }

  const agora = Date.now()
  const cont = { fila: 0, enviada: 0, entregue: 0, lida: 0, recusada: 0, cancelada: 0 }
  const motivos = new Map<string, number>()
  const blocos = new Map<number, { inicio: string; programadas: number; enviadas: number; entregues: number; lidas: number; recusadas: number }>()
  const saidas: { telefone: string; situacao: SituacaoDoContato; motivo: string; em: string }[] = []
  let ultimosCinco = 0

  for (const linha of fila) {
    const retorno = linha.evolution_message_id ? porMensagem.get(linha.evolution_message_id) : undefined
    let situacao: SituacaoDoContato
    let motivo = ''
    if (linha.status === 'pendente' || linha.status === 'enviando') situacao = 'fila'
    else if (linha.status === 'cancelado') situacao = 'cancelada'
    else if (linha.status === 'falhou') { situacao = 'recusada'; motivo = 'Falha no envio' }
    else if (retorno?.tipos.has('read')) situacao = 'lida'
    else if (retorno?.tipos.has('delivered')) situacao = 'entregue'
    else if (retorno?.tipos.has('failed')) { situacao = 'recusada'; motivo = MOTIVOS[retorno.codigo ?? ''] ?? `Erro ${retorno.codigo ?? 'desconhecido'}` }
    else situacao = 'enviada'
    cont[situacao]++
    if (motivo) motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1)

    const inicioDoBloco = Math.floor(new Date(linha.agendado_para).getTime() / 600_000) * 600_000
    const bloco = blocos.get(inicioDoBloco) ?? { inicio: new Date(inicioDoBloco).toISOString(), programadas: 0, enviadas: 0, entregues: 0, lidas: 0, recusadas: 0 }
    bloco.programadas++
    if (situacao !== 'fila' && situacao !== 'cancelada') bloco.enviadas++
    if (situacao === 'entregue' || situacao === 'lida') bloco.entregues++
    if (situacao === 'lida') bloco.lidas++
    if (situacao === 'recusada') bloco.recusadas++
    blocos.set(inicioDoBloco, bloco)

    if (linha.enviado_em) {
      if (agora - new Date(linha.enviado_em).getTime() < 5 * 60_000) ultimosCinco++
      saidas.push({ telefone: mascarar(linha.telefone), situacao, motivo, em: linha.enviado_em })
    }
  }

  const enviadas = fila.length - cont.fila - cont.cancelada
  const ritmoPorMinuto = Math.round(ultimosCinco / 5)
  return {
    valido: true,
    titulo: estado.titulo,
    expiraEm: estado.expira_em,
    atualizadoEm: new Date().toISOString(),
    total: fila.length,
    enviadas,
    fila: cont.fila,
    entregues: cont.entregue + cont.lida,
    lidas: cont.lida,
    recusadas: cont.recusada,
    semConfirmacao: cont.enviada,
    canceladas: cont.cancelada,
    ritmoPorMinuto,
    previsaoDeTermino: cont.fila && ritmoPorMinuto > 1 ? new Date(agora + (cont.fila / ritmoPorMinuto) * 60_000).toISOString() : null,
    modelo: await situacaoDoModelo(estado.template),
    motivos: [...motivos.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total),
    blocos: [...blocos.entries()].sort((a, b) => a[0] - b[0]).map(([, bloco]) => bloco),
    ultimos: saidas.sort((a, b) => b.em.localeCompare(a.em)).slice(0, 60),
  }
}
