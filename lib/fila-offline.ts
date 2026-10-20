/*
 * A FILA DO PORTÃO SEM INTERNET — no próprio aparelho (Juan, 18/10/2026: "a internet caiu lá no Luan Santana, muita
 * gente ficou muito tempo sem bater o registro de ponto… a gente fazer isso no local storage, deixar marcado e quando
 * pegar a internet com o servidor esses registros subirem").
 *
 * IndexedDB, não localStorage: aguenta as fotos do Registrar ponto e não some quando o navegador aperta a memória.
 * Três gavetas:
 *
 *   fila     — as batidas feitas sem internet, com a hora em que foram feitas (corrigida pelo relógio do servidor).
 *              Só saem daqui depois que o servidor responde: gravada, ou recusada pelas regras.
 *   recusas  — as que o servidor recusou ("não entraram"): o operador vê o motivo e resolve no Registrar ponto.
 *   pacotes  — a lista de quem é do evento, baixada com internet (lib/actions-offline.ts): sem ela o aparelho não
 *              saberia dizer quem foi lido. O QR e o CPF vêm só como resumo (SHA-256), nunca em texto.
 *
 * O servidor confere TUDO de novo no envio (`enviarBatidasGuardadas`): o aparelho só guarda, não decide.
 */
import { enviarBatidasGuardadas, type BatidaGuardada, type RespostaDaGuardada } from './actions'
import { pacoteParaSemInternet, estadoDeEntradasParaSemInternet, relogioDoServidor, type PessoaParaSemInternet, type SituacaoGuardada, type EstadoDeEntradas } from './actions-offline'
import { chaveBusca } from './format'

export type { PessoaParaSemInternet, SituacaoGuardada, EstadoDeEntradas }

export type ItemNaFila = BatidaGuardada & {
  eventoId: string
  /** Para a tela: quem é, se a lista guardada sabia. */
  nome: string | null
  equipe: string | null
  /** Quem é, na lista guardada (a leitura do QR só traz o código) — para saber se a entrada desta pessoa já está na fila. */
  pessoaId?: string | null
  /** Envios que falharam por erro de gravação (não por regra). */
  tentativas: number
}

export type RecusaGuardada = {
  id: string
  eventoId: string
  nome: string | null
  momento: 'entrada' | 'fim'
  lidoEm: string
  motivo: string
}

type Pacote = {
  eventoId: string; geradoEm: string; pessoas: PessoaParaSemInternet[]
  /** Quem tem entrada aberta e quem já saiu, renovado de poucos em poucos minutos (lib/estado-de-entradas.ts). */
  estado?: EstadoDeEntradas
}

const BANCO = 'credenciei-portao'
/** Avisa as telas abertas que a fila mudou. */
const EVENTO_FILA = 'credenciei:fila'
/** Depois de tantas falhas de gravação seguidas, para de insistir e mostra como "não entrou". */
const MAX_TENTATIVAS = 6
/** O pacote vale por três dias — depois disso, não serve para conferir ninguém. */
const PACOTE_VALE_MS = 3 * 24 * 60 * 60 * 1000

// ─── O banco do aparelho ──────────────────────────────────────────────────────

let bancoAberto: Promise<IDBDatabase> | null = null
function banco(): Promise<IDBDatabase> {
  bancoAberto ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('fila')) db.createObjectStore('fila', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('recusas')) db.createObjectStore('recusas', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pacotes')) db.createObjectStore('pacotes', { keyPath: 'eventoId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch(e => { bancoAberto = null; throw e })
  return bancoAberto
}

async function naGaveta<T>(gaveta: 'fila' | 'recusas' | 'pacotes', modo: IDBTransactionMode, fazer: (g: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await banco()
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(gaveta, modo)
    const req = fazer(t.objectStore(gaveta))
    let valor: T | undefined
    if (req) req.onsuccess = () => { valor = req.result as T }
    t.oncomplete = () => resolve(valor)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const avisarTelas = () => { try { window.dispatchEvent(new Event(EVENTO_FILA)) } catch { /* fora do navegador */ } }
export const EVENTO_DA_FILA = EVENTO_FILA

export function idNovo(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` }
}

// ─── A fila ───────────────────────────────────────────────────────────────────

/** `Omit` que respeita os dois tipos de batida (QR e Registrar ponto). */
type SemTentativas<T> = T extends unknown ? Omit<T, 'tentativas'> : never

export async function guardarNaFila(item: SemTentativas<ItemNaFila>): Promise<void> {
  await naGaveta('fila', 'readwrite', g => g.put({ ...item, tentativas: 0 }))
  avisarTelas()
}

/**
 * Guarda VÁRIOS itens de uma vez, numa transação só: a entrada informada e a saída (Juan, 19/10/2026) entram juntas ou
 * nenhuma — nunca uma saída guardada sem a entrada que o operador acabou de informar.
 */
export async function guardarNaFilaJuntos(itens: SemTentativas<ItemNaFila>[]): Promise<void> {
  const db = await banco()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('fila', 'readwrite')
    const g = t.objectStore('fila')
    for (const i of itens) g.put({ ...i, tentativas: 0 })
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
  avisarTelas()
}

/** "HH:MM" válido (o que o campo de hora do navegador devolve). */
export const horaDeEntradaValida = (hora: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? '')

/**
 * O item "entrada informada" que vai ANTES da saída: a hora que o operador ouviu da pessoa. Fica 1 segundo antes da
 * saída na ordem de horário — é o que faz a fila (e o servidor) lançarem a entrada primeiro.
 */
export function entradaInformadaParaSaida(
  p: { eventoId: string; pessoaId: string; nome: string | null; equipe: string | null; hora: string; saidaLidaEm: string; via: 'qr' | 'assistido' },
): SemTentativas<ItemNaFila> {
  return {
    id: idNovo(), eventoId: p.eventoId, tipo: 'entrada_informada', funcionarioId: p.pessoaId, hora: p.hora, via: p.via, momento: 'entrada',
    lidoEm: new Date(Date.parse(p.saidaLidaEm) - 1000).toISOString(), nome: p.nome, equipe: p.equipe, pessoaId: p.pessoaId,
  }
}

/**
 * Este aparelho JÁ guardou a entrada desta pessoa (e depois dela nenhuma saída)? Então não faz sentido perguntar a hora
 * da entrada na saída. Sem internet o aparelho não sabe o que outros portões gravaram — só o que está na própria fila.
 */
export async function entradaJaNaFila(eventoId: string, pessoaId: string): Promise<boolean> {
  const itens = await itensDaFila(eventoId).catch(() => [] as ItemNaFila[])
  const dela = itens.filter(i => (i.tipo === 'assistido' || i.tipo === 'entrada_informada' ? i.funcionarioId : i.pessoaId) === pessoaId)
  const ultimo = dela[dela.length - 1]
  return !!ultimo && ultimo.momento === 'entrada'
}

export async function itensDaFila(eventoId?: string): Promise<ItemNaFila[]> {
  const todos = (await naGaveta<ItemNaFila[]>('fila', 'readonly', g => g.getAll())) ?? []
  return todos.filter(i => !eventoId || i.eventoId === eventoId).sort((a, b) => a.lidoEm.localeCompare(b.lidoEm))
}

export async function recusasGuardadas(eventoId?: string): Promise<RecusaGuardada[]> {
  const todas = (await naGaveta<RecusaGuardada[]>('recusas', 'readonly', g => g.getAll())) ?? []
  return todas.filter(r => !eventoId || r.eventoId === eventoId).sort((a, b) => a.lidoEm.localeCompare(b.lidoEm))
}

/** O operador já resolveu (Registrar ponto, Lançar ponto): tira da lista "não entraram". */
export async function descartarRecusa(id: string): Promise<void> {
  await naGaveta('recusas', 'readwrite', g => g.delete(id))
  avisarTelas()
}

// ─── A lista do evento (pacote) ──────────────────────────────────────────────

const pacotesNaMemoria = new Map<string, Pacote>()

async function lerPacote(eventoId: string): Promise<Pacote | null> {
  const naMemoria = pacotesNaMemoria.get(eventoId)
  const p = naMemoria ?? (await naGaveta<Pacote>('pacotes', 'readonly', g => g.get(eventoId))) ?? null
  if (!p) return null
  if (Date.now() - new Date(p.geradoEm).getTime() > PACOTE_VALE_MS) return null
  pacotesNaMemoria.set(eventoId, p)
  return p
}

/** Quando a lista do evento foi guardada neste aparelho, e com quantas pessoas — para a tela dizer. */
export async function situacaoDoPacote(eventoId: string): Promise<{ geradoEm: string; pessoas: number } | null> {
  const p = await lerPacote(eventoId)
  return p ? { geradoEm: p.geradoEm, pessoas: p.pessoas.length } : null
}

// ─── Quem já tem entrada (para a saída sem internet) ─────────────────────────

/** Renova, com internet, quem tem entrada aberta. Falhar não é problema: fica a conferência que já estava guardada. */
export async function atualizarEstado(eventoId: string): Promise<boolean> {
  try {
    const p = await lerPacote(eventoId)
    if (!p) return false
    const r = await estadoDeEntradasParaSemInternet(eventoId)
    if (!r.estado) return false
    const novo: Pacote = { ...(pacotesNaMemoria.get(eventoId) ?? p), estado: r.estado }
    await naGaveta('pacotes', 'readwrite', g => g.put(novo))
    pacotesNaMemoria.set(eventoId, novo)
    avisarTelas()
    return true
  } catch {
    return false
  }
}

/**
 * O que ESTE aparelho sabe de uma batida feita agora, com internet (a dele mesmo): a lista guardada fica em dia entre
 * uma renovação e outra — quem acabou de entrar aqui não aparece como "sem entrada" quando a internet cair.
 */
export async function anotarBatida(eventoId: string, pessoaId: string, tipo: 'entrada' | 'fim'): Promise<void> {
  try {
    const p = await lerPacote(eventoId)
    if (!p?.estado) return
    const agora = agoraCerto().toISOString()
    const e = { ...p.estado.e }
    const s = { ...p.estado.s }
    if (tipo === 'entrada') { e[pessoaId] = agora; delete s[pessoaId] } else { s[pessoaId] = agora; delete e[pessoaId] }
    const novo: Pacote = { ...p, estado: { ...p.estado, e, s } }
    await naGaveta('pacotes', 'readwrite', g => g.put(novo))
    pacotesNaMemoria.set(eventoId, novo)
  } catch { /* é só um aviso na tela */ }
}

export async function anotarBatidaPeloQR(eventoId: string, codigo: string, tipo: 'entrada' | 'fim'): Promise<void> {
  const pessoa = await pessoaPeloQR(eventoId, codigo).catch(() => null)
  if (pessoa) await anotarBatida(eventoId, pessoa.id, tipo)
}

/** A entrada desta pessoa, como o aparelho enxerga agora. */
export type SituacaoDeEntrada =
  /** A lista guardada ainda não tem as entradas (aparelho com lista antiga): não dá para dizer. */
  | { tipo: 'desconhecida' }
  | { tipo: 'com_entrada'; em: string; conferidoEm: string | null }
  /** Já saiu depois dessa entrada: outra saída agora pode ser repetida. */
  | { tipo: 'ja_saiu'; em: string; conferidoEm: string | null }
  | { tipo: 'sem_entrada'; conferidoEm: string }

/**
 * A pessoa tem entrada? (Juan, 19/10/2026: "não tem como ele já saber isso?") Primeiro o que este aparelho guardou na
 * fila (a batida mais nova dela), depois a lista guardada. É só um AVISO: o servidor confere tudo na hora de enviar.
 */
export async function situacaoDeEntrada(eventoId: string, pessoaId: string): Promise<SituacaoDeEntrada> {
  const p = await lerPacote(eventoId).catch(() => null)
  const conferidoEm = p?.estado?.geradoEm ?? null
  const itens = await itensDaFila(eventoId).catch(() => [] as ItemNaFila[])
  const dela = itens.filter(i => (i.tipo === 'assistido' || i.tipo === 'entrada_informada' ? i.funcionarioId : i.pessoaId) === pessoaId)
  const ultimo = dela[dela.length - 1]
  if (ultimo) {
    return ultimo.momento === 'entrada'
      ? { tipo: 'com_entrada', em: ultimo.lidoEm, conferidoEm }
      : { tipo: 'ja_saiu', em: ultimo.lidoEm, conferidoEm }
  }
  if (!p?.estado) return { tipo: 'desconhecida' }
  if (p.estado.e[pessoaId]) return { tipo: 'com_entrada', em: p.estado.e[pessoaId], conferidoEm }
  if (p.estado.s[pessoaId]) return { tipo: 'ja_saiu', em: p.estado.s[pessoaId], conferidoEm }
  return { tipo: 'sem_entrada', conferidoEm: p.estado.geradoEm }
}

/** Baixa a lista de novo (com internet). Falhar não é problema: fica a que já estava guardada. */
export async function atualizarPacote(eventoId: string): Promise<boolean> {
  try {
    const r = await pacoteParaSemInternet(eventoId)
    if (!r.pessoas) return false
    const antes = pacotesNaMemoria.get(eventoId) ?? (await naGaveta<Pacote>('pacotes', 'readonly', g => g.get(eventoId))) ?? null
    const p: Pacote = { eventoId, geradoEm: r.geradoEm, pessoas: r.pessoas, ...(antes?.estado ? { estado: antes.estado } : {}) }
    await naGaveta('pacotes', 'readwrite', g => g.put(p))
    pacotesNaMemoria.set(eventoId, p)
    avisarTelas()
    // A lista nova já sai com o estado das entradas em dia (sem esperar a próxima renovação).
    void atualizarEstado(eventoId)
    return true
  } catch {
    return false
  }
}

/** O mesmo resumo do servidor (lib/actions-offline.ts). Sem `crypto.subtle` (página fora de https), não há resumo. */
async function resumo(texto: string): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
  } catch {
    return null
  }
}

/** O token de dentro do QR da credencial (c2/c3/c4.TOKEN.…) — sem conferir a assinatura, que é coisa do servidor. */
export function tokenDoQR(codigo: string): string | null {
  const partes = (codigo ?? '').split('|')[0].trim().split('.')
  return ['c2', 'c3', 'c4'].includes(partes[0]) && partes[1] ? partes[1] : null
}

export async function pessoaPeloQR(eventoId: string, codigo: string): Promise<PessoaParaSemInternet | null> {
  const token = tokenDoQR(codigo)
  const p = token ? await lerPacote(eventoId) : null
  const r = p && token ? await resumo(token) : null
  return (r && p?.pessoas.find(x => x.t === r)) || null
}

export async function pessoaPeloCpf(eventoId: string, cpf: string): Promise<PessoaParaSemInternet | null> {
  const digitos = (cpf ?? '').replace(/\D/g, '')
  if (digitos.length !== 11) return null
  const p = await lerPacote(eventoId)
  const r = p ? await resumo(`${eventoId}:${digitos}`) : null
  return (r && p?.pessoas.find(x => x.c === r)) || null
}

export async function pessoasPeloNome(eventoId: string, termo: string): Promise<PessoaParaSemInternet[]> {
  const chave = chaveBusca(termo)
  if (chave.length < 3) return []
  const p = await lerPacote(eventoId)
  return (p?.pessoas ?? []).filter(x => x.busca.includes(chave)).slice(0, 30)
}

/** O que dizer de quem a lista guardada já sabe que não pode bater. */
export function motivoDaSituacao(s: SituacaoGuardada): string | null {
  if (s === 'baixa') return 'Esta pessoa está com BAIXA na equipe. Não libere — procure o supervisor.'
  if (s === 'pendente') return 'O credenciamento desta pessoa ainda aguarda aprovação.'
  if (s === 'negado') return 'O credenciamento desta pessoa foi negado.'
  if (s === 'inativo') return 'Esta pessoa não está ativada no evento.'
  return null
}

// ─── O relógio ────────────────────────────────────────────────────────────────

const CHAVE_RELOGIO = 'credenciei:relogio-servidor'

/** A hora certa: a do aparelho corrigida pela diferença medida com o servidor (relógio de celular erra). */
export function agoraCerto(): Date {
  let diferenca = 0
  try { diferenca = Number(JSON.parse(localStorage.getItem(CHAVE_RELOGIO) ?? '{}').diferenca) || 0 } catch { /* sem localStorage */ }
  return new Date(Date.now() + diferenca)
}

/** Mede a diferença do relógio do aparelho para o do servidor (com internet). */
export async function acertarRelogio(): Promise<void> {
  try {
    const antes = Date.now()
    const servidor = await relogioDoServidor()
    const depois = Date.now()
    // Ida e volta muito lentas medem errado: melhor manter a medida anterior.
    if (depois - antes > 5000) return
    localStorage.setItem(CHAVE_RELOGIO, JSON.stringify({ diferenca: servidor - (antes + depois) / 2, medidoEm: new Date().toISOString() }))
  } catch { /* sem internet: fica a medida anterior */ }
}

// ─── O envio ──────────────────────────────────────────────────────────────────

let enviando = false

/**
 * Manda a fila para o servidor, em ordem de horário. Leituras de QR vão de 10 em 10; o Registrar ponto (com foto)
 * vai uma por vez. Para no primeiro sinal de que a internet não voltou de verdade.
 */
export async function enviarFila(): Promise<{ enviadas: number; recusadas: number; erro?: string }> {
  const resultado = { enviadas: 0, recusadas: 0 } as { enviadas: number; recusadas: number; erro?: string }
  if (enviando || (typeof navigator !== 'undefined' && navigator.onLine === false)) return resultado
  enviando = true
  try {
    const trabalho = async () => {
      const fila = await itensDaFila()
      const porEvento = new Map<string, ItemNaFila[]>()
      for (const i of fila) porEvento.set(i.eventoId, [...(porEvento.get(i.eventoId) ?? []), i])

      for (const [eventoId, itens] of porEvento) {
        // Lotes na ordem de horário: QR seguidos juntos (até 10); cada Registrar ponto sozinho.
        const lotes: ItemNaFila[][] = []
        for (const i of itens) {
          const ultimo = lotes[lotes.length - 1]
          if (i.tipo === 'qr' && ultimo && ultimo[0].tipo === 'qr' && ultimo.length < 10) ultimo.push(i)
          else lotes.push([i])
        }
        for (const lote of lotes) {
          let r: Awaited<ReturnType<typeof enviarBatidasGuardadas>>
          try {
            r = await enviarBatidasGuardadas(eventoId, lote.map(paraEnviar))
          } catch {
            resultado.erro = 'Sem internet ainda.'
            return
          }
          if (!r.respostas) { resultado.erro = r.error; return }
          await aplicarRespostas(eventoId, lote, r.respostas, resultado)
        }
      }
    }
    // Duas abas abertas não mandam a mesma fila ao mesmo tempo.
    const travas = (navigator as Navigator & { locks?: { request: (n: string, o: object, f: () => Promise<void>) => Promise<void> } }).locks
    if (travas) await travas.request('credenciei-fila', { ifAvailable: true }, async (trava: unknown) => { if (trava) await trabalho() })
    else await trabalho()
  } finally {
    enviando = false
    avisarTelas()
  }
  return resultado
}

/** Só o que o servidor precisa (sem nome, equipe, tentativas). */
function paraEnviar(i: ItemNaFila): BatidaGuardada {
  const base = { id: i.id, lidoEm: i.lidoEm, momento: i.momento, local: i.local ?? null }
  if (i.tipo === 'qr') return { ...base, tipo: 'qr', codigo: i.codigo, subeventoIds: i.subeventoIds }
  if (i.tipo === 'entrada_informada') return { ...base, tipo: 'entrada_informada', funcionarioId: i.funcionarioId, hora: i.hora, via: i.via }
  return { ...base, tipo: 'assistido', funcionarioId: i.funcionarioId, foto: i.foto, dispositivo: i.dispositivo }
}

async function aplicarRespostas(
  eventoId: string, lote: ItemNaFila[], respostas: RespostaDaGuardada[], resultado: { enviadas: number; recusadas: number },
) {
  const porId = new Map(respostas.map(r => [r.id, r]))
  for (const item of lote) {
    const r = porId.get(item.id)
    if (!r) continue
    if (r.ok) {
      await naGaveta('fila', 'readwrite', g => g.delete(item.id))
      resultado.enviadas++
    } else if (r.definitivo || item.tentativas + 1 >= MAX_TENTATIVAS) {
      const recusa: RecusaGuardada = {
        id: item.id, eventoId, nome: r.nome ?? item.nome, momento: item.momento, lidoEm: item.lidoEm,
        motivo: r.definitivo ? r.mensagem : `Não foi possível gravar depois de várias tentativas: ${r.mensagem}`,
      }
      await naGaveta('recusas', 'readwrite', g => g.put(recusa))
      await naGaveta('fila', 'readwrite', g => g.delete(item.id))
      resultado.recusadas++
    } else {
      await naGaveta('fila', 'readwrite', g => g.put({ ...item, tentativas: item.tentativas + 1 }))
    }
  }
}
