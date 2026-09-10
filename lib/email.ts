import 'server-only'
import { Resend } from 'resend'

/**
 * Envio de email do Credenciei — via Resend.
 *
 * O canal principal do sistema é WhatsApp; email entrou pra UM caso (o
 * lembrete de conferência de equipe, com a planilha anexa). Fica isolado aqui
 * pra o dia em que virar mais coisa.
 *
 * ─── TOLERANTE A NÃO ESTAR CONFIGURADO ──────────────────────────────────────
 *
 * Sem `RESEND_API_KEY` no ambiente, `enviarEmail` não lança — loga e devolve
 * `{ ok: false, motivo: 'sem-config' }`. Um lembrete que não sai não pode
 * derrubar o cron nem a tela. Configurar: criar conta no resend.com, gerar a
 * chave, e (pra mandar pra qualquer endereço) verificar um domínio de envio.
 * `EMAIL_REMETENTE` é o "De:" — default no domínio de teste do Resend, que só
 * entrega pro dono da conta.
 */

const REMETENTE = process.env.EMAIL_REMETENTE || 'Credenciei <onboarding@resend.dev>'

let cliente: Resend | null = null
function getCliente(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!cliente) cliente = new Resend(process.env.RESEND_API_KEY)
  return cliente
}

export type Anexo = { nome: string; conteudo: Buffer | string }

export async function enviarEmail(opcoes: {
  para: string | string[]
  assunto: string
  html: string
  /** Texto puro pra quem não renderiza HTML. Gerado do HTML se não vier. */
  texto?: string
  anexos?: Anexo[]
  responderPara?: string
}): Promise<{ ok: true; id: string | null } | { ok: false; motivo: string }> {
  const c = getCliente()
  if (!c) {
    console.warn('[email] RESEND_API_KEY ausente — email não enviado', { assunto: opcoes.assunto })
    return { ok: false, motivo: 'sem-config' }
  }

  try {
    const { data, error } = await c.emails.send({
      from: REMETENTE,
      to: Array.isArray(opcoes.para) ? opcoes.para : [opcoes.para],
      subject: opcoes.assunto,
      html: opcoes.html,
      text: opcoes.texto ?? opcoes.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      replyTo: opcoes.responderPara,
      attachments: opcoes.anexos?.map(a => ({
        filename: a.nome,
        content: typeof a.conteudo === 'string' ? Buffer.from(a.conteudo, 'utf8') : a.conteudo,
      })),
    })
    if (error) {
      console.error('[email] Resend recusou', { assunto: opcoes.assunto, erro: error.message })
      return { ok: false, motivo: error.message }
    }
    return { ok: true, id: data?.id ?? null }
  } catch (e) {
    console.error('[email] falhou', { assunto: opcoes.assunto, erro: e instanceof Error ? e.message : e })
    return { ok: false, motivo: e instanceof Error ? e.message : 'erro' }
  }
}

/** Casca HTML mínima e sóbria — sem imagem, sem CSS externo (cliente de email é hostil). */
export function molduraEmail(titulo: string, corpoHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f3f1;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1917">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#FF4A0F;font-weight:700;margin:0 0 4px">Credenciei</p>
    <h1 style="font-size:20px;margin:0 0 16px;color:#1c1917">${titulo}</h1>
    <div style="background:#fff;border:1px solid #e7e2df;border-radius:14px;padding:20px;font-size:14px;line-height:1.6">${corpoHtml}</div>
    <p style="font-size:12px;color:#78716c;margin:16px 0 0">Este email é automático. Fale com a produção do evento se tiver dúvida.</p>
  </div></body></html>`
}
