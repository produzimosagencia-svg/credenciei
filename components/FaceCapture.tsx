'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Loader2 } from 'lucide-react'

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
 * Detecção (achou um rosto?) ≠ identificação (é a pessoa X?) ≠ liveness (é
 * uma pessoa de verdade, agora?) — três perguntas diferentes, resolvidas em
 * ordem: 1) `deteccaoUtilizavel`, 2) o piscar (aqui), 3) o match no servidor
 * (`lib/actions.ts`, que nunca confia em nada vindo do cliente sozinho).
 */

/** Onde os pesos do modelo estão publicados (public/models/) — baixados do
 *  repositório oficial do face-api.js (MIT), justadudewhohacks/face-api.js. */
const CAMINHO_MODELOS = '/models'

const TEMPO_LIMITE_MS = 20_000
/** EAR (razão de abertura do olho) abaixo disto conta como olho fechado. */
const LIMIAR_OLHO_FECHADO = 0.22

export type ResultadoCaptura = { descritor: number[]; qualidade: number }

type Fase = 'carregando' | 'procurando' | 'pisque' | 'processando' | 'erro'

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
  onCaptura, onCancelar, instrucao,
}: {
  onCaptura: (r: ResultadoCaptura) => void
  onCancelar: () => void
  /** Ex.: "Cadastre o rosto" ou "Aproxime-se da câmera". */
  instrucao: string
}) {
  const [fase, setFase] = useState<Fase>('carregando')
  const [mensagem, setMensagem] = useState('Carregando reconhecimento facial…')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jaCapturouRef = useRef(false)
  const olhoFechadoAlgumaVezRef = useRef(false)

  useEffect(() => {
    let desmontou = false
    const inicioEm = Date.now()

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

        if (Date.now() - inicioEm > TEMPO_LIMITE_MS) {
          jaCapturouRef.current = true
          parar()
          setFase('erro')
          setMensagem('Não foi possível concluir o reconhecimento a tempo. Use o QR Code.')
          return
        }

        const todos = await faceapi.detectAllFaces(videoRef.current, opcoesDeteccao)
        if (todos.length === 0) { setFase('procurando'); setMensagem(instrucao); return }
        if (todos.length > 1) { setFase('procurando'); setMensagem('Mais de um rosto na câmera — só uma pessoa por vez.'); return }

        const deteccao = await faceapi
          .detectSingleFace(videoRef.current, opcoesDeteccao)
          .withFaceLandmarks()
          .withFaceDescriptor()
        if (!deteccao) return

        /*
         * O piscar de olhos: espera até ver pelo menos UM quadro com o olho
         * fechado. Isso já rejeita a foto parada (nunca pisca) sem exigir
         * hardware — ver a nota de limitação no topo do arquivo.
         */
        const landmarks = deteccao.landmarks
        const ear = (razaoDoOlho(landmarks.getLeftEye()) + razaoDoOlho(landmarks.getRightEye())) / 2
        if (ear < LIMIAR_OLHO_FECHADO) olhoFechadoAlgumaVezRef.current = true

        if (!olhoFechadoAlgumaVezRef.current) {
          setFase('pisque')
          setMensagem('Pisque os olhos para confirmar que é você, ao vivo.')
          return
        }

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
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center p-4 gap-5">
      <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black">
        {fase === 'erro' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <CameraOff className="w-10 h-10 text-red-400" />
            <p className="text-red-200 text-sm">{mensagem}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-56 h-64 border-4 rounded-[50%] opacity-70 transition-colors ${
                fase === 'pisque' ? 'border-amber-400' : fase === 'processando' ? 'border-green-400' : 'border-white/60'
              }`} />
            </div>
            {(fase === 'carregando' || fase === 'processando') && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-white text-center text-base font-semibold flex items-center gap-2 max-w-sm">
        {fase !== 'erro' && <Camera className="w-4 h-4 shrink-0 opacity-70" />}
        {mensagem}
      </p>

      <button
        type="button"
        onClick={onCancelar}
        className="border-2 border-white/50 text-white font-semibold rounded-2xl px-6 py-3 active:scale-95 transition-all"
      >
        Cancelar
      </button>
    </div>
  )
}
