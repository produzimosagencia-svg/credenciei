// O último estado conhecido do canal de WhatsApp — e como avisar que ele caiu.
//
// A instância da Evolution desconecta sozinha (celular desligado, sessão
// derrubada, número banido) e a fila para em silêncio: ninguém recebe lembrete
// e o produtor só descobre no dia do evento, com a equipe faltando.
//
// O processamento da fila já pergunta o estado a cada lote. Aqui esse resultado
// é GRAVADO, para a tela poder mostrar sem perguntar. Consultar ao vivo no
// Painel penduraria a página por até dez segundos justamente quando a VPS
// estivesse fora do ar — que é a hora em que se quer ver o aviso.
//
// Nada aqui lança: monitoramento que derruba a página que ele deveria
// monitorar é pior que monitoramento nenhum.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CHAVE = 'whatsapp'

/**
 * Depois de quanto tempo sem notícia o silêncio já é sintoma.
 *
 * A fila roda a cada ~20s no worker da VPS. Vinte minutos sem nenhum registro
 * significa que o worker morreu — e worker morto é a mesma coisa, na prática,
 * que WhatsApp desconectado: ninguém está recebendo nada.
 */
const SILENCIO_SUSPEITO_MIN = 20

export type EstadoWhatsApp = {
  conectada: boolean
  /** Texto cru da Evolution ('open', 'close', 'connecting') ou o erro. */
  estado: string
  /** Quando foi a última verificação. */
  em: string
  /** O worker parou de reportar — ninguém está processando a fila. */
  semNoticia: boolean
  /** Minutos desde a última verificação. */
  minutosAtras: number
}

/** Grava o resultado da checagem. Chamado pelo processamento da fila. */
export async function registrarEstadoWhatsApp(conectada: boolean, estado: string): Promise<void> {
  try {
    await supabase.from('sistema_estado').upsert(
      { chave: CHAVE, valor: { conectada, estado }, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' },
    )
  } catch (e) {
    console.error('[saude] não consegui gravar o estado do WhatsApp:', e)
  }
}

/**
 * O que mostrar na tela. `null` quando não há o que dizer — inclusive se a
 * tabela ainda não existir, porque o aviso é acessório e não pode quebrar o
 * Painel de quem ainda não rodou a migração.
 */
export async function estadoWhatsAppSalvo(): Promise<EstadoWhatsApp | null> {
  try {
    const { data, error } = await supabase
      .from('sistema_estado').select('valor, atualizado_em').eq('chave', CHAVE).maybeSingle()
    if (error || !data) return null

    const valor = (data.valor ?? {}) as { conectada?: boolean; estado?: string }
    const em = data.atualizado_em as string
    const minutosAtras = Math.floor((Date.now() - new Date(em).getTime()) / 60_000)

    return {
      conectada: valor.conectada === true,
      estado: valor.estado ?? 'desconhecido',
      em,
      semNoticia: minutosAtras > SILENCIO_SUSPEITO_MIN,
      minutosAtras,
    }
  } catch {
    return null
  }
}
