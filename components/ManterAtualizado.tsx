'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * A credencial se atualiza sozinha. A pessoa nunca precisa recarregar.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Quem usa esta tela é a equipe de operação de evento — e "recarregue a
 * página" não é instrução que se possa dar a essas quinhentas pessoas. Muita
 * gente não sabe o que isso significa, e no meio de um turno ninguém vai
 * parar para explicar. A tela tem que estar certa quando a pessoa olhar.
 *
 * Sem isto, dois casos quebravam calados, e os dois são o caminho normal:
 *
 *   1. O operador escaneia o QR dela na portaria. A entrada é gravada no
 *      servidor, mas o celular dela continua mostrando "Registrar entrada" —
 *      ela acha que não funcionou e vai tentar de novo, ou reclamar.
 *
 *   2. O cartão do meio abre 4h depois da entrada. Quem deixou a tela aberta
 *      desde a chegada nunca vê ele aparecer, porque a página é a mesma do
 *      começo do turno.
 *
 * ─── POR QUE NÃO É SÓ UM setInterval CURTO ──────────────────────────────────
 *
 * São centenas de celulares com esta tela aberta ao mesmo tempo. Atualizar a
 * cada poucos segundos viraria carga constante no servidor no pior momento
 * possível — o dia do evento.
 *
 * O gatilho que mais importa é de graça: `visibilitychange`. Quando a pessoa
 * tira o celular do bolso e olha a tela, atualiza ali. É exatamente o instante
 * em que a informação precisa estar certa, e nenhum dos outros custa nada.
 *
 * O intervalo existe só para quem fica com a tela aberta na mão, e é longo de
 * propósito. Ele só roda enquanto a aba está VISÍVEL: celular no bolso não
 * consome nada.
 */
const INTERVALO_MS = 60_000

export default function ManterAtualizado() {
  const router = useRouter()

  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | null = null

    const atualizar = () => router.refresh()

    const parar = () => {
      if (intervalo) { clearInterval(intervalo); intervalo = null }
    }

    const acompanharVisibilidade = () => {
      if (document.visibilityState === 'visible') {
        atualizar()                       // olhou agora: precisa estar certo agora
        if (!intervalo) intervalo = setInterval(atualizar, INTERVALO_MS)
      } else {
        parar()                           // no bolso: não gasta bateria nem servidor
      }
    }

    acompanharVisibilidade()
    document.addEventListener('visibilitychange', acompanharVisibilidade)
    // Voltar de uma queda de sinal também merece: a batida pode ter subido no
    // meio da queda, e a tela ficaria mostrando o estado de antes.
    window.addEventListener('online', atualizar)
    window.addEventListener('focus', atualizar)

    return () => {
      parar()
      document.removeEventListener('visibilitychange', acompanharVisibilidade)
      window.removeEventListener('online', atualizar)
      window.removeEventListener('focus', atualizar)
    }
  }, [router])

  return null
}
