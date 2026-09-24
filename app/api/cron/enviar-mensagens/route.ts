import { NextRequest, NextResponse } from 'next/server'
import { processarFilaMensagens, agendarAlertasSupervisorCredenciamento } from '@/lib/mensagens'

// Fallback do worker da VPS: Vercel Cron bate aqui 1x/minuto (ver vercel.json).
// Também serve pra disparo manual (ex: futuro botão "reenviar agora" no admin).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  /*
   * Varredura periódica, não reação a um evento — diferente do resto da
   * fila, que é sempre agendada no momento de algo acontecer (cadastro,
   * aprovação...). Roda antes de processar a fila pra já entrar na mesma
   * leva. Isolado num try/catch: enquanto a migração
   * upgrade-alerta-supervisor-credenciamento.sql não rodar, isto falharia
   * (coluna/constraint ausente) e não pode derrubar o envio normal da fila.
   */
  try {
    await agendarAlertasSupervisorCredenciamento()
  } catch (e) {
    console.error('[cron] agendarAlertasSupervisorCredenciamento falhou:', e)
  }

  const resultado = await processarFilaMensagens()
  return NextResponse.json(resultado)
}
