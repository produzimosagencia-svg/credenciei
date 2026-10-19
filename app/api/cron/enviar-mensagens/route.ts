import { NextRequest, NextResponse } from 'next/server'
import { processarFilaMensagens, agendarAlertasSupervisorCredenciamento } from '@/lib/mensagens'
import { processarLembretesDeConvite, enviarResumosDoDia } from '@/lib/convites'

// Lote da Meta (100 por rodada, ver lib/mensagens.ts) leva segundos, mas com
// folga explícita: sem isto vale o padrão do plano da Vercel.
export const maxDuration = 60

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
  // Convite por WhatsApp (lembrete em 24h) e resumo diário do supervisor (18/10/2026) — mesma ideia: varredura,
  // isolada, que entra na fila antes do envio desta mesma volta. Ver lib/convites.ts.
  try {
    await processarLembretesDeConvite()
  } catch (e) {
    console.error('[cron] processarLembretesDeConvite falhou:', e)
  }
  try {
    await enviarResumosDoDia()
  } catch (e) {
    console.error('[cron] enviarResumosDoDia falhou:', e)
  }

  /*
   * Um lote de 100 na Meta sai em poucos segundos, mas o cron só bate 1x por
   * minuto: a fila ficava presa em ~100 mensagens/minuto num disparo grande.
   * Enquanto houver fila e sobrar tempo, puxa o próximo lote na mesma
   * chamada. Para com folga antes do maxDuration.
   */
  const inicio = Date.now()
  let processadas = 0
  for (;;) {
    const { processadas: n } = await processarFilaMensagens()
    processadas += n
    if (n === 0 || Date.now() - inicio > 40_000) break
  }
  return NextResponse.json({ processadas })
}
