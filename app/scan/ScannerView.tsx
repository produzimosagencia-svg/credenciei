'use client'
import { useState, useEffect, useRef } from 'react'
import { registrarPresencaQR } from '@/lib/actions'
import ConferenciaCpf from './ConferenciaCpf'
import { emNavegadorEmbutido, copiarTexto } from '@/lib/navegador'
import { ScanLine, CameraOff, Copy, CheckCheck } from 'lucide-react'

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null }
  faseErrada?: { doQR: string; deHoje: string }
  momento?: 'entrada' | 'meio' | 'fim'
}

export default function ScannerView({
  eventos,
  initialEventoId,
}: {
  eventos: Evento[]
  initialEventoId?: string
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [show, setShow] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  // A câmera não abriu. Sem isto, quem opera o portão fica olhando um quadrado
  // preto sem saber o motivo — ver o comentário no `catch` do `start`.
  const [erroCamera, setErroCamera] = useState<string | null>(null)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const scanningRef = useRef(false)
  const scannerRef = useRef<any>(null)
  // Ref para o callback do scanner (que captura o estado do primeiro render).
  // Atualizada num efeito, não durante o render — o linter do React passou a
  // recusar escrever em `.current` no corpo do componente.
  const eventoIdRef = useRef(eventoId)
  useEffect(() => { eventoIdRef.current = eventoId }, [eventoId])

  const processQR = async (data: string) => {
    if (scanningRef.current) return
    scanningRef.current = true

    /*
     * Sem escolher "Entrada" ou "Saída" antes: o servidor decide sozinho, pela
     * própria pessoa — primeira leitura do turno é entrada, segunda é saída,
     * terceira é recusada (ver `inferirMomentoQR` em lib/actions.ts). Os dois
     * botões confundiam quem estava no portão, com fila andando — decisão do
     * Juan em 03/09/2026.
     */
    let resultado: ScanResult | null = null
    try {
      resultado = await registrarPresencaQR(eventoIdRef.current, data)
    } catch {
      resultado = { success: false, message: 'Erro ao processar QR Code' }
    }
    setResult(resultado)
    setShow(true)

    /*
     * Crachá de outra etapa NÃO some sozinho.
     *
     * Nos outros resultados o aviso passar em 2,5s é o certo: a fila anda e o
     * próximo já está com o celular na mão. Aqui não — há uma decisão a tomar
     * com a pessoa parada na frente, e apagar a tela no meio dela devolveria o
     * operador ao escuro, sem saber o que fazer com quem está ali.
     */
    if (resultado?.faseErrada) return

    setTimeout(() => {
      setShow(false)
      setTimeout(() => {
        setResult(null)
        scanningRef.current = false
      }, 400)
    }, 2500)
  }

  /** Volta a ler QR. Usado pelos botões da recusa por etapa. */
  const retomar = () => {
    setConferindo(false)
    setShow(false)
    setTimeout(() => { setResult(null); scanningRef.current = false }, 300)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const html5QrCode = new Html5Qrcode('qr-reader')
      scannerRef.current = html5QrCode
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 280 } },
        (decodedText: string) => processQR(decodedText),
        () => {}
      ).catch((e: unknown) => {
        /*
         * A câmera falhando NÃO pode ser silenciosa.
         *
         * Antes isto era `.catch(console.error)`: quando a câmera não abria,
         * quem estava no portão via um quadrado preto e nenhuma explicação —
         * e ficava tentando, com fila na frente, sem saber que o problema era
         * permissão. Aconteceu de verdade no primeiro dia de operação.
         *
         * A causa quase sempre é uma das duas: o link foi aberto dentro do
         * WhatsApp (WebView não repassa a permissão de câmera, mesmo problema
         * que já corrigimos no registro por foto), ou a permissão foi negada
         * ao navegador. As duas têm a mesma saída — abrir num navegador de
         * verdade e permitir —, então o aviso diz isso em vez do erro técnico.
         */
        console.error(e)
        setErroCamera(emNavegadorEmbutido()
          ? 'Você abriu por dentro de outro aplicativo (WhatsApp, Instagram), e por ali a câmera não funciona. Toque em "Copiar link", abra o Chrome ou o Safari e cole lá.'
          : 'Não conseguimos abrir a câmera. Toque no cadeado ao lado do endereço, permita a câmera para este site e recarregue a página.')
      })
    })

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overlayColor = !result?.success
    ? 'bg-red-600'
    : result?.momento === 'entrada'
    ? 'bg-green-600'
    : 'bg-brand-500'

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <div className="w-full max-w-sm space-y-3">
        <div>
          <label className="text-slate-400 text-sm block mb-1.5" data-tutorial="scan-evento">Evento</label>
          <select
            value={eventoId}
            onChange={e => setEventoId(e.target.value)}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
          >
            {eventos.map(e => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>

        {/*
          * Sem botão de Entrada/Saída — de propósito, a pedido do Juan
          * (03/09/2026). O sistema decide sozinho, pela própria pessoa: quem
          * não tem turno aberto está entrando; quem tem, está saindo. Ver
          * `inferirMomentoQR` em lib/actions.ts pra regra inteira.
          */}
        <p className="text-slate-500 text-xs text-center">
          A câmera decide sozinha se é entrada ou saída, pelo que a pessoa já registrou hoje.
          O <strong>meio</strong> continua sendo registrado pelo próprio funcionário, com foto, na credencial dele.
        </p>
      </div>

      {/*
        * A câmera falhou: explica e oferece a saída, em vez do quadrado preto.
        *
        * Fica NO LUGAR do leitor, não abaixo dele — embaixo, com a moldura
        * vazia ainda na tela, quem está no portão continua tentando apontar o
        * celular pro nada.
        */}
      {erroCamera ? (
        <div className="w-full max-w-sm bg-red-950/40 border border-red-800 rounded-xl p-4 text-center">
          <CameraOff className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-200 font-semibold text-sm mt-2">A câmera não abriu</p>
          <p className="text-red-300/90 text-xs mt-1.5 leading-relaxed">{erroCamera}</p>
          <div className="flex flex-col gap-2 mt-3">
            <button
              onClick={async () => {
                if (await copiarTexto(window.location.href)) {
                  setLinkCopiado(true)
                  setTimeout(() => setLinkCopiado(false), 5000)
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              {linkCopiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {linkCopiado ? 'Link copiado!' : 'Copiar link'}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-red-300 text-xs font-semibold hover:text-white transition-colors"
            >
              Já permiti — tentar de novo
            </button>
          </div>
          {/*
            * A saída que funciona mesmo sem câmera nenhuma: conferir pelo CPF.
            * Sem isto, quem está no portão com a câmera quebrada não tem o que
            * fazer além de parar a fila.
            */}
          <button
            onClick={() => setConferindo(true)}
            className="w-full mt-3 pt-3 border-t border-red-800/60 text-red-200 text-xs font-semibold hover:text-white transition-colors"
          >
            Conferir pelo CPF enquanto isso →
          </button>
        </div>
      ) : (
        <div className="relative w-full max-w-sm" data-tutorial="scan-camera">
          <div id="qr-reader" className="rounded-xl overflow-hidden" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Uma cor só: antes ela seguia o botão Entrada/Saída que a
                pessoa escolhia antes de ler — sem o botão, não há mais o
                que a moldura precise antecipar. */}
            <div className="w-64 h-64 border-2 rounded-2xl opacity-60 border-brand-400" />
          </div>
        </div>
      )}

      {!erroCamera && (
        <p className="text-slate-500 text-sm flex items-center gap-2">
          <ScanLine className="w-4 h-4" />
          Aponte a câmera para o QR Code da credencial
        </p>
      )}

      {/* Overlay full-screen de resultado */}
      {result && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${overlayColor} ${show ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="text-white text-center px-8">
            <div className="text-8xl mb-6">
              {result.success ? (result.momento === 'entrada' ? '✓' : '↩') : '✕'}
            </div>
            <p className="text-3xl font-bold mb-2">{result.message}</p>
            {result.funcionario && (
              <>
                <p className="text-xl font-semibold mt-4 opacity-90">{result.funcionario.nome}</p>
                <p className="text-base opacity-70 mt-1">
                  {result.funcionario.cargo ? `${result.funcionario.cargo} • ` : ''}                </p>
              </>
            )}

            {/*
              * Crachá de outra etapa: o operador precisa DECIDIR, não só ler.
              *
              * Os dois caminhos ficam à vista. "Pedir o CPF" é o que resolve
              * de verdade — diz se a pessoa está na lista. "Voltar a ler" cobre
              * o caso inocente e mais comum: ela só precisa recarregar a tela.
              */}
            {result.faseErrada && (
              <div className="mt-8 space-y-3 max-w-xs mx-auto">
                <button
                  onClick={() => setConferindo(true)}
                  className="w-full bg-white text-red-700 font-bold rounded-2xl py-4 text-lg shadow-lg"
                >
                  Pedir o CPF e conferir
                </button>
                <button
                  onClick={retomar}
                  className="w-full border-2 border-white/60 text-white font-semibold rounded-2xl py-3"
                >
                  Voltar a ler QR Code
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        * Duas portas para a mesma conferência: o crachá de outra etapa (o
        * caso original) e a câmera que não abriu. O aviso muda porque o
        * motivo de estar aqui é outro — e quem opera precisa saber qual é.
        */}
      {conferindo && (
        <ConferenciaCpf
          eventoId={eventoId}
          aviso={result?.faseErrada
            ? `O QR apresentado é da ${result.faseErrada.doQR}, e hoje é ${result.faseErrada.deHoje}. Confirme pelo CPF se esta pessoa está credenciada.`
            : 'Sem câmera, dá para conferir quem está credenciado pelo CPF. Para REGISTRAR o ponto, use "Registrar ponto" no topo da tela.'}
          aoFechar={retomar}
        />
      )}
    </div>
  )
}
