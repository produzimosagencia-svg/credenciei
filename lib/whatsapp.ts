// Por onde o WhatsApp sai — a Cloud API da Meta ou a Evolution.
//
// ─── POR QUE OS DOIS CONVIVEM ───────────────────────────────────────────────
//
// A troca acontece no meio de uma operação com equipe já cadastrada e evento
// marcado. Um corte seco deixaria o sistema sem canal se algo desse errado na
// Cloud API (número ainda em verificação, template não aprovado, camada de
// destinatários baixa demais). Com o seletor, voltar é mudar uma variável de
// ambiente — não um deploy às pressas na véspera do evento.
//
// O padrão é a Cloud API assim que o token existe. A Evolution fica como saída
// de emergência, sabendo do preço: ela derrubou o número duas vezes, e a
// segunda foi com 51 mensagens num único dia.
//
// ─── A DIFERENÇA QUE O RESTO DO SISTEMA PRECISA CONHECER ────────────────────
//
// A Evolution manda TEXTO LIVRE. A Cloud API, fora da janela de 24h, só manda
// TEMPLATE APROVADO com os parâmetros separados. Por isso `enviarMensagem`
// recebe as duas formas do mesmo conteúdo — o template com os parâmetros e o
// texto já renderizado — e cada provedor usa a que sabe entregar.

import {
  enviarTemplate, enviarTextoLivre, estadoDaInstancia as estadoMeta,
  formatarNumeroWhatsApp as formatarMeta, ESPACAMENTO_MS as ESPACAMENTO_META,
  type ResultadoEnvio,
} from './whatsapp-meta'
import {
  enviarTextoEvolution, estadoEvolution, ESPACAMENTO_EVOLUTION,
} from './whatsapp-evolution'

export type { ResultadoEnvio }

export type Provedor = 'meta' | 'evolution'

/**
 * Qual canal usar.
 *
 * `WHATSAPP_PROVEDOR` manda quando definido. Sem ela, a presença do token da
 * Meta decide — quem configurou a Cloud API quer usá-la, e exigir uma segunda
 * variável só para dizer isso seria mais um passo para esquecer.
 */
export function provedor(): Provedor {
  const escolhido = (process.env.WHATSAPP_PROVEDOR ?? '').trim().toLowerCase()
  if (escolhido === 'meta' || escolhido === 'evolution') return escolhido
  return process.env.WHATSAPP_TOKEN ? 'meta' : 'evolution'
}

/** Espaçamento entre envios na fila — cada canal tem o seu risco. */
export const ESPACAMENTO_MS = provedor() === 'meta' ? ESPACAMENTO_META : ESPACAMENTO_EVOLUTION

/** Normaliza telefone (10-11 dígitos, sem DDI) pro formato com DDI do Brasil. */
export const formatarNumeroWhatsApp = formatarMeta

/**
 * Manda a mensagem pelo canal ativo.
 *
 * Recebe o conteúdo nas duas formas de propósito: a Cloud API precisa do
 * template com os parâmetros soltos, a Evolution precisa do texto pronto.
 * Quem chama monta as duas uma vez e não precisa saber qual canal está no ar.
 */
export async function enviarMensagem(params: {
  numero: string
  template: string
  parametros: string[]
  texto: string
  phoneNumberId?: string
}): Promise<ResultadoEnvio> {
  return provedor() === 'meta'
    ? enviarTemplate(params.numero, params.template, params.parametros, params.phoneNumberId)
    : enviarTextoEvolution(params.numero, params.texto)
}

/**
 * Resposta em conversa aberta (dentro das 24h). Texto livre nos dois canais —
 * na Cloud API é o único caso em que texto livre é permitido.
 */
export async function responderConversa(numero: string, texto: string): Promise<ResultadoEnvio> {
  return provedor() === 'meta'
    ? enviarTextoLivre(numero, texto)
    : enviarTextoEvolution(numero, texto)
}

/** O canal está saudável? Alimenta a faixa de alerta do Painel. */
export async function estadoDaInstancia(): Promise<{ conectada: boolean; estado: string }> {
  return provedor() === 'meta' ? estadoMeta() : estadoEvolution()
}
