'use client'
import { useState } from 'react'
import ScannerView from './ScannerView'
import FaceScannerView from './FaceScannerView'

type Evento = { id: string; nome: string }

/**
 * Decide qual leitor mostrar — QR ou rosto — e deixa o operador trocar a
 * qualquer momento. Nenhum dos dois componentes é tocado por dentro: o
 * roteador só escolhe qual montar, exatamente como pedido (reutilizar o
 * scanner de QR que já existe, nunca duplicar).
 *
 * `metodosPorEvento[id]` ausente = 'qr' (evento sem o campo migrado ainda,
 * ou evento comum) — o padrão de sempre, sem biometria nenhuma na tela.
 */
export default function ScannerRouter({
  eventos, initialEventoId, metodosPorEvento, noPainel = false,
}: {
  eventos: Evento[]
  initialEventoId?: string
  metodosPorEvento: Record<string, string>
  /** Dentro do painel (/admin/scanner) — só afeta o leitor de QR; o leitor de
   *  rosto continua em tela cheia escura (é assim que a câmera precisa ser mostrada). */
  noPainel?: boolean
}) {
  const eventoInicial = initialEventoId ?? eventos[0]?.id ?? ''
  const metodoInicial = metodosPorEvento[eventoInicial] ?? 'qr'
  const biometriaLigada = metodoInicial === 'biometria' || metodoInicial === 'biometria_qr'

  // Começa no rosto quando o evento usa biometria; o operador troca à
  // vontade — o toque em "Validar por QR Code" (ou o inverso) é sempre
  // uma escolha da pessoa que está operando, nunca automático depois disso.
  const [usarRosto, setUsarRosto] = useState(biometriaLigada)
  const [eventoAtivo, setEventoAtivo] = useState(eventoInicial)

  if (usarRosto) {
    return (
      <FaceScannerView
        eventos={eventos}
        initialEventoId={eventoAtivo}
        aoTrocarParaQr={id => { setEventoAtivo(id); setUsarRosto(false) }}
      />
    )
  }

  /*
   * `ScannerView` guarda o evento escolhido DENTRO dele (não avisa o pai
   * quando o operador troca no `<select>` dele) — então este botão não sabe
   * com certeza qual evento está ativo agora ali dentro. Em vez de confiar
   * num `eventoAtivo` que pode estar desatualizado, mostra o botão sempre
   * que QUALQUER evento da lista usar biometria: se a pessoa clicar e o
   * evento escolhido no leitor de rosto for outro (QR-only), o servidor
   * mesmo recusa de forma clara ("Este evento não usa biometria facial") —
   * sem risco de segurança, só uma UX menos fina nesse caso raro (uma
   * sessão de portão que mistura eventos de métodos diferentes).
   */
  const algumEventoTemBiometria = eventos.some(e => {
    const m = metodosPorEvento[e.id]
    return m === 'biometria' || m === 'biometria_qr'
  })

  return (
    <div className="flex-1 flex flex-col">
      <ScannerView eventos={eventos} initialEventoId={eventoAtivo} noPainel={noPainel} />
      {algumEventoTemBiometria && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setUsarRosto(true)}
            className="w-full text-xs font-semibold text-slate-400 border border-slate-700 rounded-lg py-2 hover:bg-slate-800 transition-colors"
          >
            Usar reconhecimento facial
          </button>
        </div>
      )}
    </div>
  )
}
