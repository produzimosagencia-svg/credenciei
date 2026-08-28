// O que o painel do WhatsApp lê e escreve.
//
// Separado de `lib/actions.ts` porque é outro assunto: aqui não se fala de
// evento, setor ou ponto — se fala do CANAL. Quem cuida disso é o dono da
// plataforma, não o produtor de um evento.

import { supabaseAdmin } from './supabase-server'
import { formatarNumeroWhatsApp } from './whatsapp'

const VERSAO = 'v21.0'

// ─── Templates aprovados na Meta ─────────────────────────────────────────────

export type TemplateMeta = {
  nome: string
  status: string
  categoria: string
  corpo: string
  /** Quantas variáveis o corpo espera. É o que o disparo precisa preencher. */
  variaveis: number
}

/**
 * Os templates direto da Meta, não os do código.
 *
 * A diferença importa: o texto aprovado é o que a pessoa recebe, e ele pode
 * ter sido editado no painel da Meta sem o código saber. Ler da fonte evita
 * a tela mostrar um texto e o WhatsApp entregar outro.
 */
export async function templatesAprovados(): Promise<TemplateMeta[]> {
  const token = process.env.WHATSAPP_TOKEN
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!token || !waba) return []

  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSAO}/${waba}/message_templates?fields=name,status,category,components&limit=50`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' },
    )
    const corpo = await res.json().catch(() => null) as
      { data?: { name: string; status: string; category: string; components?: { type: string; text?: string }[] }[] } | null

    return (corpo?.data ?? []).map(t => {
      const texto = t.components?.find(c => c.type === 'BODY')?.text ?? ''
      return {
        nome: t.name,
        status: t.status,
        categoria: t.category,
        corpo: texto,
        variaveis: new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size,
      }
    }).sort((a, b) => a.nome.localeCompare(b.nome))
  } catch {
    return []
  }
}

// ─── Conversas ───────────────────────────────────────────────────────────────

export type Conversa = {
  telefone: string
  nome: string | null
  ultimaEm: string
  ultimoTexto: string | null
  ultimaDirecao: 'recebida' | 'enviada'
  naoLidas: number
  /** Dá para responder com texto livre? Só dentro de 24h da última recebida. */
  janelaAberta: boolean
}

const JANELA_H = 24

/**
 * A lista de conversas, mais recente primeiro.
 *
 * Agrupa em memória em vez de no banco porque o volume é de centenas, não de
 * milhões, e um `distinct on` via PostgREST exigiria uma view só para isso.
 */
export async function conversas(limite = 100): Promise<Conversa[]> {
  const { data } = await supabaseAdmin
    .from('whatsapp_eventos')
    .select('telefone, nome_contato, direcao, texto, ocorrido_em')
    .in('direcao', ['recebida', 'enviada'])
    .not('telefone', 'is', null)
    .order('ocorrido_em', { ascending: false })
    .limit(2000)

  const agora = Date.now()
  const porNumero = new Map<string, Conversa>()

  for (const e of data ?? []) {
    const tel = e.telefone as string
    const dir = e.direcao as 'recebida' | 'enviada'
    let c = porNumero.get(tel)
    if (!c) {
      c = {
        telefone: tel,
        nome: (e.nome_contato as string | null) ?? null,
        ultimaEm: e.ocorrido_em as string,
        ultimoTexto: (e.texto as string | null) ?? null,
        ultimaDirecao: dir,
        naoLidas: 0,
        janelaAberta: false,
      }
      porNumero.set(tel, c)
    }
    if (!c.nome && e.nome_contato) c.nome = e.nome_contato as string
    // A janela de resposta livre conta da última mensagem QUE A PESSOA mandou.
    if (dir === 'recebida' && !c.janelaAberta) {
      c.janelaAberta = agora - new Date(e.ocorrido_em as string).getTime() < JANELA_H * 3600_000
    }
    if (dir === 'recebida') c.naoLidas++
  }

  return [...porNumero.values()]
    .sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm))
    .slice(0, limite)
}

export type MensagemChat = {
  id: string
  direcao: 'recebida' | 'enviada'
  texto: string | null
  em: string
  /** Último status conhecido da enviada: sent, delivered, read, failed. */
  status: string | null
  erro: string | null
}

/** A conversa de um número, em ordem cronológica. */
export async function conversaDe(telefone: string): Promise<MensagemChat[]> {
  const { data } = await supabaseAdmin
    .from('whatsapp_eventos')
    .select('id, direcao, tipo, texto, ocorrido_em, wa_message_id, bruto')
    .eq('telefone', telefone)
    .order('ocorrido_em')
    .limit(500)

  // O status chega em linha separada, ligada pelo wa_message_id. Junta aqui
  // para a bolha da mensagem mostrar "entregue" em vez de virar uma linha
  // solta no meio da conversa.
  const statusPorId = new Map<string, { tipo: string; erro: string | null }>()
  for (const e of data ?? []) {
    if (e.direcao !== 'status' || !e.wa_message_id) continue
    const err = (e.bruto as { errors?: { code?: number; title?: string }[] } | null)?.errors?.[0]
    statusPorId.set(e.wa_message_id as string, {
      tipo: e.tipo as string,
      erro: err ? `${err.code}: ${err.title ?? ''}` : null,
    })
  }

  return (data ?? [])
    .filter(e => e.direcao === 'recebida' || e.direcao === 'enviada')
    .map(e => {
      const st = e.wa_message_id ? statusPorId.get(e.wa_message_id as string) : undefined
      return {
        id: e.id as string,
        direcao: e.direcao as 'recebida' | 'enviada',
        texto: (e.texto as string | null) ?? null,
        em: e.ocorrido_em as string,
        status: st?.tipo ?? null,
        erro: st?.erro ?? null,
      }
    })
}

/** Registra no histórico uma mensagem que SAIU — é o outro lado do chat. */
export async function registrarEnviada(params: {
  telefone: string
  texto: string
  waMessageId?: string | null
  eventoId?: string | null
  funcionarioId?: string | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('whatsapp_eventos').insert({
    direcao: 'enviada',
    wa_message_id: params.waMessageId ?? null,
    telefone: formatarNumeroWhatsApp(params.telefone) ?? params.telefone,
    tipo: 'text',
    texto: params.texto,
    ocorrido_em: new Date().toISOString(),
    evento_id: params.eventoId ?? null,
    funcionario_id: params.funcionarioId ?? null,
  })
  if (error && error.code !== '23505') console.error('[painel] não gravei a enviada:', error.message)
}

// ─── Fluxos automáticos ──────────────────────────────────────────────────────

/**
 * Quais mensagens automáticas estão ligadas.
 *
 * Só o que está aqui como `true` é agendado. Serve para desligar um tipo sem
 * mexer em código — útil quando um template ainda não foi aprovado, ou quando
 * um evento específico não quer certo aviso.
 */
/*
 * `confirmacao_escala` não está aqui: ela dependia de um campo de data na
 * tela de edição do evento, que saiu. Sem esse campo não há quando enviar, e
 * listar um fluxo que nunca dispara seria pior que não listar.
 */
export const FLUXOS: { chave: string; titulo: string; descricao: string; quando: string }[] = [
  { chave: 'boas_vindas_funcionario', titulo: 'Boas-vindas', quando: 'Assim que a pessoa termina o cadastro',
    descricao: 'Manda o link da credencial e explica as três etapas.' },
  { chave: 'aviso_dia_evento', titulo: 'Aviso do dia do evento', quando: 'Na manhã do dia do evento',
    descricao: 'O texto completo, com as três etapas e os horários.' },
  { chave: 'aviso_montagem', titulo: 'Aviso de montagem', quando: '07:00 de cada dia de preparação antes do evento',
    descricao: 'Lembra que hoje tem trabalho e que o horário é livre.' },
  { chave: 'aviso_desmontagem', titulo: 'Aviso de desmontagem', quando: '07:00 de cada dia depois do evento',
    descricao: 'Mesma ideia, com o tom da fase de desmonte.' },
  { chave: 'lembrete', titulo: 'Lembrete de etapa', quando: 'Quando abre o horário de cada etapa',
    descricao: 'Avisa que chegou a hora de registrar entrada, meio ou saída.' },
  { chave: 'reforco', titulo: 'Reforço de etapa', quando: 'Pouco antes do prazo, só para quem não registrou',
    descricao: 'A segunda chamada de quem ainda está pendente.' },
  { chave: 'alerta_supervisor', titulo: 'Alerta ao supervisor', quando: 'Quando o prazo de uma etapa passa',
    descricao: 'Manda ao supervisor a lista de quem ficou pendente.' },
]

export async function fluxosAtivos(): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabaseAdmin
      .from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    const salvo = (data?.valor ?? {}) as Record<string, boolean>
    // Sem configuração salva, tudo ligado: é o comportamento que o sistema
    // sempre teve, e desligar por omissão faria a operação emudecer sozinha.
    return Object.fromEntries(FLUXOS.map(f => [f.chave, salvo[f.chave] !== false]))
  } catch {
    return Object.fromEntries(FLUXOS.map(f => [f.chave, true]))
  }
}
