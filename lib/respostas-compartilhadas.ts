import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase-server'
import { conversaDe, type MensagemChat } from './whatsapp-painel'

/**
 * Atendimento compartilhado: um link público, com prazo, que mostra só as
 * conversas de quem respondeu a um ou mais disparos avulsos.
 *
 * Serve para a pessoa do cliente (dono da lista) acompanhar e atender essas
 * respostas sem ter conta no sistema e sem enxergar o resto das conversas do
 * número. Segue o desenho do convite de supervisor: o link carrega um código
 * aleatório e o banco guarda só o hash dele em `sistema_estado`. Quem tem o
 * link entra; quem tem acesso ao banco não consegue reconstruir o link. Para
 * revogar antes do prazo, basta apagar a linha.
 */
const PREFIXO = 'respostas_compartilhadas:'
const JANELA_H = 24

export type EstadoCompartilhamento = {
  titulo: string
  /** Ids de campanha gravados no JSON de `mensagens_agendadas.mensagem`. */
  campanhas: string[]
  /** Mensagens anteriores a este instante não pertencem a estes disparos. */
  desde: string
  expira_em: string
  /** Com `true`, quem abre o link também responde pelo número da empresa. */
  pode_responder?: boolean
}

export type ConversaCompartilhada = {
  telefone: string
  nome: string
  ultimaEm: string
  ultimoTexto: string | null
  ultimoTipo: string
  ultimaDirecao: 'recebida' | 'enviada'
  /** A última palavra foi da pessoa: ainda espera uma resposta. */
  aguardando: boolean
  /** Dá para responder com texto livre? Só dentro de 24h da última recebida. */
  janelaAberta: boolean
}

export type Compartilhamento =
  | { valido: false; motivo: 'invalido' | 'expirado' }
  | {
      valido: true
      /** Para as checagens seguintes não lerem o link de novo. */
      estado: EstadoCompartilhamento
      titulo: string
      expiraEm: string
      podeResponder: boolean
      lista: ConversaCompartilhada[]
      totalRecebidas: number
    }

function chaveDoToken(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null
  return `${PREFIXO}${createHash('sha256').update(token).digest('hex')}`
}

/**
 * A Meta devolve número brasileiro ora com o nono dígito, ora sem. A chave
 * junta DDD e os oito dígitos finais, que são iguais nas duas formas.
 */
function chaveTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  return d.slice(2, 4) + d.slice(-8)
}

/**
 * Nome que não tem letra nem número não é nome: há quem preencha com caractere
 * invisível ou só emoji, e a conversa sairia sem título.
 */
function nomeLegivel(nome: string | null | undefined): string {
  // Os preenchimentos coreanos contam como letra para o Unicode, mas não
  // desenham nada na tela: saem antes do teste.
  const limpo = (nome ?? '').replace(/[\u3164\u115F\u1160\uFFA0\u200B-\u200F\u2060\uFEFF]/g, '').trim()
  return /[\p{L}\p{N}]/u.test(limpo) ? limpo : ''
}

function variantesDoTelefone(telefone: string): string[] {
  const d = telefone.replace(/\D/g, '')
  if (!d.startsWith('55')) return [d]
  const ddd = d.slice(2, 4)
  const final = d.slice(-8)
  return [`55${ddd}${final}`, `55${ddd}9${final}`]
}

async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>, teto = 20000): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; de < teto; de += 1000) {
    const { data } = await consulta(de, de + 999)
    linhas.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return linhas
}

/** Cria o link e devolve o código. É a única hora em que o código existe em claro. */
export async function criarCompartilhamentoDeRespostas(estado: EstadoCompartilhamento): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const chave = chaveDoToken(token)
  if (!chave) throw new Error('Não foi possível gerar o código do link.')
  const { error } = await supabaseAdmin
    .from('sistema_estado')
    .insert({ chave, valor: estado, atualizado_em: new Date().toISOString() })
  if (error) throw new Error(`Não foi possível criar o link: ${error.message}`)
  return token
}

type Leitura =
  | { valido: false; motivo: 'invalido' | 'expirado' }
  | { valido: true; estado: EstadoCompartilhamento; chave: string }

export async function lerCompartilhamento(token: string): Promise<Leitura> {
  const chave = chaveDoToken(token)
  if (!chave) return { valido: false, motivo: 'invalido' }

  const { data } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', chave).maybeSingle()
  const estado = data?.valor as EstadoCompartilhamento | undefined
  if (!estado?.campanhas?.length) return { valido: false, motivo: 'invalido' }
  if (new Date(estado.expira_em).getTime() <= Date.now()) return { valido: false, motivo: 'expirado' }
  return { valido: true, estado, chave }
}

/**
 * De uma relação de telefones, quais receberam um dos disparos do link, e com
 * que nome estavam na lista.
 *
 * É a fronteira do link: resposta de quem escreveu por outro motivo (equipe de
 * evento, lead do site) não é assunto do cliente e nunca passa daqui.
 */
async function quemEstaNosDisparos(estado: EstadoCompartilhamento, telefones: string[]): Promise<Map<string, string>> {
  const campanhas = new Set(estado.campanhas)
  const nomePorChave = new Map<string, string>()
  const procurados = [...new Set(telefones.flatMap(variantesDoTelefone))]
  for (let inicio = 0; inicio < procurados.length; inicio += 150) {
    const { data: linhas } = await supabaseAdmin
      .from('mensagens_agendadas')
      .select('telefone, mensagem')
      .eq('tipo', 'disparo_manual')
      .gte('created_at', estado.desde)
      .in('telefone', procurados.slice(inicio, inicio + 150))
    for (const linha of linhas ?? []) {
      try {
        const m = JSON.parse(linha.mensagem as string) as { campanhaId?: string; parametros?: string[] }
        if (!m.campanhaId || !campanhas.has(m.campanhaId)) continue
        nomePorChave.set(chaveTelefone(linha.telefone as string), nomeLegivel(m.parametros?.[0]))
      } catch { /* mensagem que não é JSON não é disparo avulso */ }
    }
  }
  return nomePorChave
}

/** A lista de conversas do link, mais recente primeiro. */
export async function conversasCompartilhadas(token: string): Promise<Compartilhamento> {
  const leitura = await lerCompartilhamento(token)
  if (!leitura.valido) return leitura
  const { estado } = leitura

  /*
   * Parte das respostas, não da lista do disparo: quem respondeu são centenas,
   * a lista são milhares. Ler a lista inteira a cada abertura do link seria
   * puxar dezenas de páginas só para descartar quase tudo.
   */
  const eventos = await lerTudo<{
    telefone: string | null; nome_contato: string | null
    direcao: string; tipo: string; texto: string | null; ocorrido_em: string
  }>((de, ate) => supabaseAdmin
    .from('whatsapp_eventos')
    .select('telefone, nome_contato, direcao, tipo, texto, ocorrido_em')
    .in('direcao', ['recebida', 'enviada'])
    .gte('ocorrido_em', estado.desde)
    .order('ocorrido_em')
    .range(de, ate))

  const responderam = [...new Set(eventos.filter(e => e.direcao === 'recebida' && e.telefone).map(e => e.telefone as string))]
  const nomeDaLista = responderam.length ? await quemEstaNosDisparos(estado, responderam) : new Map<string, string>()

  const porPessoa = new Map<string, ConversaCompartilhada & { ultimaRecebida: string }>()
  let totalRecebidas = 0
  for (const e of eventos) {
    if (!e.telefone) continue
    const chaveTel = chaveTelefone(e.telefone)
    if (!nomeDaLista.has(chaveTel)) continue
    const recebida = e.direcao === 'recebida'
    let conversa = porPessoa.get(chaveTel)
    if (!conversa) {
      // Quem só tem mensagem nossa no período não respondeu: a conversa só
      // nasce na primeira mensagem da pessoa.
      if (!recebida) continue
      conversa = {
        telefone: e.telefone, nome: nomeDaLista.get(chaveTel) || '', ultimaEm: e.ocorrido_em, ultimoTexto: null,
        ultimoTipo: e.tipo, ultimaDirecao: 'recebida', aguardando: true, janelaAberta: true, ultimaRecebida: e.ocorrido_em,
      }
      porPessoa.set(chaveTel, conversa)
    }
    if (recebida) {
      totalRecebidas++
      conversa.ultimaRecebida = e.ocorrido_em
      // O endereço da conversa é o número como a Meta escreve, porque é para
      // ele que a resposta sai.
      conversa.telefone = e.telefone
      if (!conversa.nome) conversa.nome = nomeLegivel(e.nome_contato)
    }
    conversa.ultimaEm = e.ocorrido_em
    conversa.ultimoTexto = e.texto
    conversa.ultimoTipo = e.tipo
    conversa.ultimaDirecao = recebida ? 'recebida' : 'enviada'
    conversa.aguardando = recebida
  }

  const limiteDaJanela = Date.now() - JANELA_H * 60 * 60 * 1000
  const lista = [...porPessoa.values()]
    .map(({ ultimaRecebida, ...conversa }) => ({
      ...conversa,
      janelaAberta: new Date(ultimaRecebida).getTime() > limiteDaJanela,
    }))
    .sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm))

  return {
    valido: true,
    estado,
    titulo: estado.titulo,
    expiraEm: estado.expira_em,
    podeResponder: estado.pode_responder === true,
    lista,
    totalRecebidas,
  }
}

/**
 * O número pertence a este link? É a checagem que protege a conversa aberta e
 * a resposta: sem ela, trocar o telefone no endereço abriria qualquer conversa
 * do número da empresa.
 */
export async function telefoneDoCompartilhamento(estado: EstadoCompartilhamento, telefone: string): Promise<boolean> {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 12 || digitos.length > 13) return false
  const nomes = await quemEstaNosDisparos(estado, [digitos])
  return nomes.has(chaveTelefone(digitos))
}

/** As mensagens de uma conversa do link, ou `null` se o número não pertence a ele. */
export async function conversaCompartilhada(estado: EstadoCompartilhamento, telefone: string): Promise<MensagemChat[] | null> {
  if (!await telefoneDoCompartilhamento(estado, telefone)) return null
  const mensagens = await conversaDe(telefone.replace(/\D/g, ''))
  // Conversa mais antiga que o disparo, se houver, é de outro assunto.
  return mensagens.filter(m => m.em >= estado.desde)
}
