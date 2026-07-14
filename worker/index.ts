// Worker standalone: drena a fila de lembretes de WhatsApp 24/7, fora do
// Vercel. Reaproveita a mesma lógica de lib/mensagens.ts usada pela rota
// /api/cron do Next (fallback) — sem duplicar código de agendamento/envio.
import { processarFilaMensagens } from '../lib/mensagens'

const INTERVALO_MS = 20_000

async function tick() {
  try {
    const { processadas } = await processarFilaMensagens()
    if (processadas > 0) {
      console.log(`[worker] ${new Date().toISOString()} — ${processadas} mensagem(ns) processada(s)`)
    }
  } catch (e) {
    console.error('[worker] erro ao processar fila:', e)
  }
}

console.log('[worker] iniciado — checando a fila de lembretes a cada 20s')
tick()
setInterval(tick, INTERVALO_MS)
