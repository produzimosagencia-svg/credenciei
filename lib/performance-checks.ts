import 'server-only'

import { connect as tlsConnect } from 'tls'
import { GoogleGenAI } from '@google/genai'
import { google } from 'googleapis'
import { Resend } from 'resend'
import { supabaseAdmin } from './supabase-server'
import { estadoDaInstancia } from './whatsapp'
import { estadoWhatsAppSalvo } from './saude'
import { getAuth as getAuthGoogle } from './google-sheets'

/**
 * Os health-checks do Painel de Performance — um por serviço, todos reaproveitando
 * o cliente/credencial que o sistema já usa em produção. Nenhum aqui é
 * inventado: ver o inventário no plano (FASE 1) pra origem de cada um.
 *
 * Contrato comum: NUNCA lança. Sempre mede o tempo. Sempre devolve algo —
 * inclusive quando a credencial nem existe (`naoConfigurado: true`), porque
 * "não sei checar isso" é uma resposta válida (pedido explícito do Juan:
 * nunca fingir que está online só porque tem URL cadastrada).
 */

export type ResultadoCheck = {
  ok: boolean
  latenciaMs: number
  statusCode?: number | null
  erro?: string | null
  /** Mesmo com ok:true, sinaliza atenção (ex.: SSL expira em breve). Não é falha. */
  aviso?: string | null
  /** A credencial/config nem existe — não é "caiu", é "nunca foi configurado". */
  naoConfigurado?: boolean
}

/**
 * Tira qualquer coisa que pareça segredo de uma mensagem de erro antes dela
 * ir pro banco. Log de monitoramento não pode ser um vazamento de credencial.
 */
export function mascarar(texto: string): string {
  return texto
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [oculto]')
    .replace(/(apikey|api[_-]?key|token|secret|authorization|password|senha)\s*[:=]\s*["']?[\w.-]{6,}["']?/gi, '$1=[oculto]')
    .slice(0, 300)
}

async function medir<T>(fn: () => Promise<T>): Promise<{ valor?: T; erro?: unknown; ms: number }> {
  const inicio = Date.now()
  try {
    const valor = await fn()
    return { valor, ms: Date.now() - inicio }
  } catch (erro) {
    return { erro, ms: Date.now() - inicio }
  }
}

function mensagemDeErro(e: unknown): string {
  return mascarar(e instanceof Error ? e.message : String(e))
}

// ─── API (self-ping) ──────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

export async function checarApi(): Promise<ResultadoCheck> {
  const r = await medir(() => fetch(`${SITE_URL}/api/health`, { signal: AbortSignal.timeout(8000) }))
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  const res = r.valor as Response
  return { ok: res.ok, latenciaMs: r.ms, statusCode: res.status, erro: res.ok ? null : `HTTP ${res.status}` }
}

// ─── Banco (Supabase Postgres) ────────────────────────────────────────────────

export async function checarBanco(): Promise<ResultadoCheck> {
  const r = await medir(async () => await supabaseAdmin.from('sistema_estado').select('chave', { count: 'exact', head: true }))
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  if (r.valor?.error) return { ok: false, latenciaMs: r.ms, erro: mascarar(r.valor.error.message) }
  return { ok: true, latenciaMs: r.ms }
}

// ─── Storage (Supabase Storage) ───────────────────────────────────────────────

export async function checarStorage(): Promise<ResultadoCheck> {
  const r = await medir(async () => await supabaseAdmin.storage.from('presencas').list('', { limit: 1 }))
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  if (r.valor?.error) return { ok: false, latenciaMs: r.ms, erro: mascarar(r.valor.error.message) }
  return { ok: true, latenciaMs: r.ms }
}

// ─── Domínio & SSL ────────────────────────────────────────────────────────────

const DOMINIO = 'credenciei.com.br'
const SSL_AVISO_DIAS = 30
const SSL_CRITICO_DIAS = 7

export async function checarDominioSsl(): Promise<ResultadoCheck> {
  const inicio = Date.now()
  try {
    const validoAte = await new Promise<Date>((resolve, reject) => {
      const socket = tlsConnect({ host: DOMINIO, port: 443, servername: DOMINIO, timeout: 8000 }, () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        if (!cert || !cert.valid_to) { reject(new Error('Certificado não encontrado')); return }
        resolve(new Date(cert.valid_to))
      })
      socket.on('error', reject)
      socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout na conexão TLS')) })
    })
    const latenciaMs = Date.now() - inicio
    const diasParaExpirar = Math.floor((validoAte.getTime() - Date.now()) / (24 * 60 * 60 * 1000))

    if (diasParaExpirar < 0) return { ok: false, latenciaMs, erro: 'Certificado SSL expirado' }
    if (diasParaExpirar <= SSL_CRITICO_DIAS) return { ok: false, latenciaMs, erro: `SSL expira em ${diasParaExpirar} dia(s)` }
    if (diasParaExpirar <= SSL_AVISO_DIAS) return { ok: true, latenciaMs, aviso: `SSL expira em ${diasParaExpirar} dias` }
    return { ok: true, latenciaMs }
  } catch (e) {
    return { ok: false, latenciaMs: Date.now() - inicio, erro: mensagemDeErro(e) }
  }
}

// ─── WhatsApp (canal ativo, Meta ou Evolution) ────────────────────────────────

export async function checarWhatsApp(): Promise<ResultadoCheck> {
  const r = await medir(() => estadoDaInstancia())
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  const { conectada, estado } = r.valor!
  return { ok: conectada, latenciaMs: r.ms, erro: conectada ? null : mascarar(estado) }
}

// ─── Fila de mensagens (worker VPS + cron Vercel) ─────────────────────────────

export async function checarFilaMensagens(): Promise<ResultadoCheck> {
  const r = await medir(() => estadoWhatsAppSalvo())
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  const estado = r.valor
  if (!estado) return { ok: false, latenciaMs: r.ms, naoConfigurado: true, erro: 'Ainda sem nenhum registro' }
  if (estado.semNoticia) {
    return { ok: false, latenciaMs: r.ms, erro: `Sem notícia há ${estado.minutosAtras} min (worker/cron parado?)` }
  }
  return { ok: true, latenciaMs: r.ms }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

export async function checarGemini(): Promise<ResultadoCheck> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, latenciaMs: 0, naoConfigurado: true, erro: 'Não configurado' }
  const r = await medir(async () => {
    const ia = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    // Lista modelos — metadado, não gera conteúdo, sem custo (confirmado no SDK).
    await ia.models.list()
  })
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  return { ok: true, latenciaMs: r.ms }
}

// ─── Google Sheets/Drive ──────────────────────────────────────────────────────

export async function checarGoogle(): Promise<ResultadoCheck> {
  const temOAuth = !!process.env.GOOGLE_REFRESH_TOKEN
  const temServiceAccount = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  if (!temOAuth && !temServiceAccount) return { ok: false, latenciaMs: 0, naoConfigurado: true, erro: 'Não configurado' }

  const r = await medir(async () => {
    const auth = getAuthGoogle()
    const drive = google.drive({ version: 'v3', auth: auth as never })
    await drive.about.get({ fields: 'user' })
  })
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  return { ok: true, latenciaMs: r.ms }
}

// ─── E-mail (Resend) ───────────────────────────────────────────────────────────

export async function checarEmail(): Promise<ResultadoCheck> {
  if (!process.env.RESEND_API_KEY) return { ok: false, latenciaMs: 0, naoConfigurado: true, erro: 'Não configurado' }
  const r = await medir(async () => {
    const cliente = new Resend(process.env.RESEND_API_KEY)
    const { error } = await cliente.domains.list()
    if (error) throw new Error(error.message)
  })
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  return { ok: true, latenciaMs: r.ms }
}

// ─── Cron: conferência de equipe ───────────────────────────────────────────────

const CONFERENCIA_SILENCIO_HORAS = 26

export async function checarConferenciaEquipe(): Promise<ResultadoCheck> {
  const r = await medir(async () => await supabaseAdmin.from('sistema_estado').select('atualizado_em').eq('chave', 'conferencia_equipe').maybeSingle())
  if (r.erro) return { ok: false, latenciaMs: r.ms, erro: mensagemDeErro(r.erro) }
  const data = r.valor?.data
  if (!data) return { ok: false, latenciaMs: r.ms, naoConfigurado: true, erro: 'Ainda não rodou' }
  const horasAtras = (Date.now() - new Date(data.atualizado_em).getTime()) / (60 * 60 * 1000)
  if (horasAtras > CONFERENCIA_SILENCIO_HORAS) {
    return { ok: false, latenciaMs: r.ms, erro: `Sem execução há ${Math.floor(horasAtras)}h` }
  }
  return { ok: true, latenciaMs: r.ms }
}

/** Registro do cron de conferência de equipe — chamado pela própria rota a cada execução. */
export async function registrarExecucaoConferenciaEquipe(): Promise<void> {
  try {
    await supabaseAdmin.from('sistema_estado').upsert(
      { chave: 'conferencia_equipe', valor: {}, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' },
    )
  } catch (e) {
    console.error('[performance] não consegui registrar a execução da conferência de equipe:', e)
  }
}

/** Despacha pela `chave` do serviço — usado pelo orquestrador do cron. */
export const CHECKS_POR_CHAVE: Record<string, () => Promise<ResultadoCheck>> = {
  api: checarApi,
  banco: checarBanco,
  storage: checarStorage,
  dominio_ssl: checarDominioSsl,
  whatsapp: checarWhatsApp,
  fila_mensagens: checarFilaMensagens,
  gemini: checarGemini,
  google: checarGoogle,
  email: checarEmail,
  conferencia_equipe: checarConferenciaEquipe,
}
