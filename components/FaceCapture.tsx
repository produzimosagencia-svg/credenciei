'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2 } from 'lucide-react'
import jsQR from 'jsqr'

/*
 * A câmera do rosto — reconhecimento no NAVEGADOR, sem servidor de visão
 * computacional (face-api.js, TensorFlow.js, MIT). O que sai daqui é só um
 * VETOR de 128 números (o "embedding") — nunca a foto, nunca o vídeo. É o
 * mesmo princípio do QR: o segredo nunca sai de onde pode ser conferido, só
 * que aqui o "segredo" é o rosto, e o navegador (não o servidor) é quem o
 * transforma em número antes de mandar qualquer coisa.
 *
 * ─── LIVENESS AQUI É BÁSICO, DE PROPÓSITO DECLARADO ─────────────────────────
 *
 * Pedir um piscar de olhos (via pontos do rosto) distingue uma pessoa viva
 * de uma FOTO PARADA impressa ou na tela. Não é o mesmo nível de um SDK
 * certificado (iBeta/ISO 30107-3) nem de hardware com infravermelho — um
 * vídeo bem feito ou uma foto animada poderiam passar. É o nível possível
 * sem hardware dedicado, e está documentado assim propositalmente: nunca
 * ofereça biometria como o ÚNICO método numa área de alta segurança sem
 * revisar isso primeiro (ver docs/estudo-viabilidade.md em
 * c:\Dev\credenciei-biometria, seção 5).
 *
 * O piscar tem um TETO de espera (`ESPERA_MAXIMA_PISCAR_MS`): passado esse
 * tempo com um rosto bom na tela, captura mesmo sem ter visto o piscar —
 * ele vira reforço quando acontece rápido, não uma trava que faz a pessoa
 * esperar por algo que às vezes ela nem entende que precisa fazer.
 *
 * Detecção (achou um rosto?) ≠ identificação (é a pessoa X?) ≠ liveness (é
 * uma pessoa de verdade, agora?) — três perguntas diferentes, resolvidas em
 * ordem: 1) `deteccaoUtilizavel`, 2) o piscar (aqui), 3) o match no servidor
 * (`lib/actions.ts`, que nunca confia em nada vindo do cliente sozinho).
 */

/** Onde os pesos do modelo estão publicados (public/models/) — baixados do
 *  repositório oficial do face-api.js (MIT), justadudewhohacks/face-api.js. */
const CAMINHO_MODELOS = '/models'

/**
 * Prazo pro pipeline FECHAR a captura depois que um rosto bom já apareceu —
 * não é um relógio geral do componente. Conta a partir de `rostoBomDesdeRef`,
 * nunca do `mount`: um totem sem operador passa a maior parte do tempo sem
 * ninguém na câmera, e isso não pode contar como demora (era o bug: a tela
 * travava sozinha a cada ~20s parada, mesmo sem ninguém passando — 27/09/2026).
 */
const TEMPO_LIMITE_MS = 20_000
/** EAR (razão de abertura do olho) abaixo disto conta como olho fechado. */
const LIMIAR_OLHO_FECHADO = 0.22
/**
 * Passado isto com um rosto bom na tela e ainda sem piscar, captura assim
 * mesmo — o piscar vira bônus, não trava mais o reconhecimento (pedido do
 * Juan, 27/09/2026: "demorando muito"). Continua rejeitando a foto/print
 * óbvios: sem rosto nenhum, ou mais de um, o tempo nem começa a contar.
 */
const ESPERA_MAXIMA_PISCAR_MS = 3_500

export type ResultadoCaptura = { descritor: number[]; qualidade: number }

type Fase = 'carregando' | 'procurando' | 'pisque' | 'processando' | 'erro'

/**
 * Largura máxima do frame desenhado no canvas pra procurar QR Code — não
 * precisa da resolução cheia da câmera pra achar um código mostrado a uma
 * distância razoável, e decodificar em resolução menor é mais rápido.
 */
const MAX_LARGURA_QR = 480

/**
 * Acha um QR Code no frame ATUAL do vídeo, sem abrir outra câmera.
 *
 * Só existe pro TOTEM (`onQrDetectado`, mais abaixo) — não abre uma segunda
 * captura de vídeo (o navegador só entrega uma sessão de câmera ativa por
 * vez pro mesmo aparelho na prática; duas em paralelo é receita de travar
 * ou uma delas nunca receber frame). Em vez disso, reaproveita os MESMOS
 * quadros que o reconhecimento facial já está lendo: desenha o frame num
 * canvas fora da tela e decodifica com `jsQR` (só pixels, nunca pede
 * câmera própria) — o mesmo princípio de sempre, um jeito a mais de
 * responder "quem é essa pessoa?", nunca uma câmera a mais.
 */
function tentarLerQr(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (!video.videoWidth || !video.videoHeight) return null
  const escala = video.videoWidth > MAX_LARGURA_QR ? MAX_LARGURA_QR / video.videoWidth : 1
  const largura = Math.round(video.videoWidth * escala)
  const altura = Math.round(video.videoHeight * escala)
  if (canvas.width !== largura) canvas.width = largura
  if (canvas.height !== altura) canvas.height = altura
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, largura, altura)
  const imageData = ctx.getImageData(0, 0, largura, altura)
  return jsQR(imageData.data, largura, altura)?.data ?? null
}

/** Distância euclidiana entre dois pontos {x,y} — usada só na razão do olho. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Eye Aspect Ratio clássico (Soukupová & Čech): baixo = olho fechado. */
function razaoDoOlho(pontos: { x: number; y: number }[]): number {
  const vertical = dist(pontos[1], pontos[5]) + dist(pontos[2], pontos[4])
  const horizontal = dist(pontos[0], pontos[3]) * 2
  return horizontal ? vertical / horizontal : 1
}

export default function FaceCapture({
  onCaptura, onCancelar, instrucao, onQrDetectado,
}: {
  onCaptura: (r: ResultadoCaptura) => void
  onCancelar: () => void
  /** Ex.: "Cadastre o rosto" ou "Aproxime-se da câmera". */
  instrucao: string
  /**
   * Só o TOTEM passa isto (`app/scan/FaceScannerView.tsx`) — quando ninguém
   * aparece pra biometria, a câmera também tenta achar um QR Code no mesmo
   * frame (ver `tentarLerQr`). Sem esta prop, o componente funciona byte a
   * byte como sempre: cadastro no formulário e autoatendimento na
   * credencial não fazem sentido físico pra isto (ver o comentário em
   * `tentarLerQr`) e não a passam.
   */
  onQrDetectado?: (texto: string) => void
}) {
  const [fase, setFase] = useState<Fase>('carregando')
  const [mensagem, setMensagem] = useState('Carregando reconhecimento facial…')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jaCapturouRef = useRef(false)
  const olhoFechadoAlgumaVezRef = useRef(false)
  /** Desde quando há um rosto ÚNICO e bom na tela — zera se a pessoa sair do quadro. */
  const rostoBomDesdeRef = useRef<number | null>(null)
  /** Canvas fora da tela, só pra `tentarLerQr` — nunca entra no DOM renderizado. */
  const canvasQrRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let desmontou = false

    const parar = () => {
      if (intervaloRef.current) { clearInterval(intervaloRef.current); intervaloRef.current = null }
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    import('face-api.js').then(async faceapi => {
      if (desmontou) return
      try {
        // Cada rede só carrega uma vez por sessão do navegador — os pesos
        // já vieram do cache HTTP na 2ª vez, mas re-analisar os pesos (a
        // etapa que `loadFromUri` faz) ainda custa; pular quando já feito.
        if (!faceapi.nets.tinyFaceDetector.isLoaded) await faceapi.nets.tinyFaceDetector.loadFromUri(CAMINHO_MODELOS)
        if (!faceapi.nets.faceLandmark68Net.isLoaded) await faceapi.nets.faceLandmark68Net.loadFromUri(CAMINHO_MODELOS)
        if (!faceapi.nets.faceRecognitionNet.isLoaded) await faceapi.nets.faceRecognitionNet.loadFromUri(CAMINHO_MODELOS)
      } catch (e) {
        console.error('[FaceCapture] modelos não carregaram', e)
        if (!desmontou) { setFase('erro'); setMensagem('Não foi possível carregar o reconhecimento facial. Use o QR Code.') }
        return
      }
      if (desmontou) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (desmontou) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        console.error('[FaceCapture] câmera não abriu', e)
        if (!desmontou) { setFase('erro'); setMensagem('Não conseguimos abrir a câmera. Confira a permissão, ou use o QR Code.') }
        return
      }
      if (desmontou) return

      setFase('procurando')
      setMensagem(instrucao)

      const opcoesDeteccao = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })

      intervaloRef.current = setInterval(async () => {
        if (jaCapturouRef.current || !videoRef.current || videoRef.current.readyState < 2) return

        const todos = await faceapi.detectAllFaces(videoRef.current, opcoesDeteccao)
        if (todos.length === 0) {
          rostoBomDesdeRef.current = null
          olhoFechadoAlgumaVezRef.current = false
          /*
           * Ninguém pro reconhecimento facial agora é exatamente o momento
           * de checar QR também — é o estado de quem está mostrando a
           * credencial pra câmera em vez do rosto (o celular geralmente
           * cobre o próprio rosto). Sem custo extra no caminho mais comum
           * (tem alguém, tenta reconhecer): só entra aqui quando a detecção
           * de rosto, mais barata, já não achou nada.
           */
          if (onQrDetectado && videoRef.current) {
            if (!canvasQrRef.current) canvasQrRef.current = document.createElement('canvas')
            const texto = tentarLerQr(videoRef.current, canvasQrRef.current)
            if (texto) {
              jaCapturouRef.current = true
              setFase('processando')
              setMensagem('Identificando…')
              parar()
              onQrDetectado(texto)
              return
            }
          }
          setFase('procurando')
          setMensagem(instrucao)
          return
        }
        if (todos.length > 1) { rostoBomDesdeRef.current = null; olhoFechadoAlgumaVezRef.current = false; setFase('procurando'); setMensagem('Mais de um rosto na câmera — só uma pessoa por vez.'); return }

        /*
         * SÓ pontos do rosto por enquanto — SEM extrair o vetor de
         * reconhecimento ainda. É a parte mais pesada de calcular, e não
         * serve pra nada enquanto só se está checando o piscar; extrair a
         * cada 350ms, à toa, era o maior peso desnecessário no celular.
         */
        const comPontos = await faceapi.detectSingleFace(videoRef.current, opcoesDeteccao).withFaceLandmarks()
        if (!comPontos) return
        if (rostoBomDesdeRef.current === null) rostoBomDesdeRef.current = Date.now()
        const desde = rostoBomDesdeRef.current

        /*
         * Prazo pra quando TEM alguém na câmera mas o pipeline não fecha a
         * captura — nunca pra "ninguém apareceu ainda" (os dois `return`
         * acima resetam o relógio antes de chegar aqui). No totem sem
         * operador, ficar parado sem ninguém na frente é o descanso normal
         * entre uma pessoa e outra, não uma falha — contar esse tempo era o
         * bug que travava a tela a cada ~20s mesmo sem ninguém passando
         * (27/09/2026). Por isso recupera SOZINHO, sem virar `'erro'`: a
         * causa mais comum é a pessoa ter saído do quadro no meio do
         * processo, não um defeito — o certo é tentar de novo do zero.
         */
        if (Date.now() - desde > TEMPO_LIMITE_MS) {
          rostoBomDesdeRef.current = null
          olhoFechadoAlgumaVezRef.current = false
          setFase('procurando')
          setMensagem(instrucao)
          return
        }

        /*
         * O piscar de olhos é a prova de vida — mas não pode travar o
         * reconhecimento pra sempre: passado `ESPERA_MAXIMA_PISCAR_MS` com um
         * rosto bom na tela, captura mesmo sem ter visto o piscar (pedido do
         * Juan, 27/09/2026: "demorando muito"). Continua rejeitando foto/print
         * óbvios — sem rosto nenhum ou mais de um, o relógio nem começa.
         */
        const ear = (razaoDoOlho(comPontos.landmarks.getLeftEye()) + razaoDoOlho(comPontos.landmarks.getRightEye())) / 2
        if (ear < LIMIAR_OLHO_FECHADO) olhoFechadoAlgumaVezRef.current = true
        const esperandoHaMuitoTempo = Date.now() - desde > ESPERA_MAXIMA_PISCAR_MS

        if (!olhoFechadoAlgumaVezRef.current && !esperandoHaMuitoTempo) {
          setFase('pisque')
          setMensagem('Pisque os olhos para confirmar que é você, ao vivo.')
          return
        }

        // Só AGORA extrai o vetor — uma vez, na leitura que de fato captura.
        const deteccao = await faceapi
          .detectSingleFace(videoRef.current, opcoesDeteccao)
          .withFaceLandmarks()
          .withFaceDescriptor()
        if (!deteccao) return

        jaCapturouRef.current = true
        setFase('processando')
        setMensagem('Identificando…')
        parar()
        onCaptura({ descritor: Array.from(deteccao.descriptor), qualidade: deteccao.detection.score })
      }, 350)
    })

    return () => { desmontou = true; parar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Cabeçalho — sem ele, o topo da tela ficava um vazio preto sem
          explicar o que está acontecendo (pedido do Juan, 27/09/2026: "esse
          template tá muito feio"). `env(safe-area-inset-top)` afasta do
          notch/relógio do celular. */}
      <div
        className="flex items-center justify-center gap-2 text-white/70 text-sm font-semibold shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)', paddingBottom: '14px' }}
      >
        <Camera className="w-4 h-4" /> Reconhecimento facial
      </div>

      {fase === 'erro' ? (
        // Mesmo cartão do erro de câmera do leitor de QR (ScannerView) — cor,
        // borda e espaçamento iguais, pra biometria não parecer uma tela à parte.
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-red-950/40 border border-red-800 rounded-xl p-5 text-center">
            <CameraOff className="w-9 h-9 text-red-400 mx-auto" />
            <p className="text-red-200 font-semibold text-sm mt-3">A câmera não concluiu</p>
            <p className="text-red-300/90 text-sm mt-1.5 leading-relaxed">{mensagem}</p>
          </div>
        </div>
      ) : (
        /*
         * Proporção e largura máxima travadas — sem isso, numa tela larga
         * (desktop, tablet deitado) o vídeo esticava pra ocupar o espaço
         * inteiro e virava um retângulo bem largo e raso, com o rosto
         * espremido (reclamação real do Juan, 28/09/2026: "muito feio pelo
         * computador"). Com o aspecto travado, o MESMO layout funciona bem
         * num celular estreito (ocupa a largura toda) e numa tela grande
         * (centraliza, sem esticar) — não são dois desenhos, é um só que
         * se adapta.
         */
        <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-2">
          <div className="relative w-full max-w-md aspect-[3/4] rounded-3xl overflow-hidden bg-slate-900">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-[68%] max-w-[280px] aspect-[3/4] border-4 rounded-[50%] transition-colors duration-300 ${
                fase === 'pisque' ? 'border-amber-400 animate-pulse' : fase === 'processando' ? 'border-green-400' : 'border-white/70'
              }`} />
            </div>
            {(fase === 'carregando' || fase === 'processando') && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rodapé — instrução e o botão, com respiro do fundo da tela
          (barra de gestos do celular). */}
      <div
        className="shrink-0 flex flex-col items-center gap-4 px-6"
        style={{ paddingTop: '18px', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
      >
        <p className="text-white text-center text-base font-semibold leading-snug max-w-sm">
          {mensagem}
        </p>
        <button
          type="button"
          onClick={onCancelar}
          className="border-2 border-white/50 text-white font-semibold rounded-2xl px-8 py-3 active:scale-95 transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
