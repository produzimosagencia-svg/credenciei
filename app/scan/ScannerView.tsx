'use client'
import { useState, useEffect, useRef } from 'react'
import { registrarPresencaQR, conferirVeiculoPorQR } from '@/lib/actions'
import ConferenciaCpf from './ConferenciaCpf'
import { emNavegadorEmbutido, copiarTexto } from '@/lib/navegador'
import { formatarBR } from '@/lib/tz'
import { ScanLine, CameraOff, Copy, CheckCheck, Loader2 } from 'lucide-react'

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null }
  /** QR de veículo, não de funcionário — mesmo scanner, os dois tipos (24/09/2026). */
  veiculo?: { placa: string; modelo: string; condutorNome: string; entradaLiberadaEm?: string }
  faseErrada?: { doQR: string; deHoje: string }
  momento?: 'entrada' | 'meio' | 'fim'
  /** Leitura repetida: já estava registrado, nada foi gravado agora. */
  jaRegistrado?: boolean
  qrInvalido?: boolean
  /** Só da tela: a resposta não chegou no tempo — ver `TEMPO_SEM_RESPOSTA_MS`. */
  semResposta?: boolean
}

/** O QR do veículo é um link (`/veiculo/{token}`), não o crachá assinado do funcionário. */
const ehQrDeVeiculo = (texto: string) => /\/veiculo\/[A-Za-z0-9_-]{10,}/.test(texto)

/*
 * ─── O QUE ACONTECIA NO PORTÃO (Pontal Weekend, 25-26/09/2026) ─────────────
 *
 * 1. Entre ler o QR e a resposta chegar passavam segundos (a validação ia e
 *    voltava ~20 vezes entre a função e o banco) e a tela não mostrava NADA
 *    nesse meio-tempo. O operador achava que não tinha lido.
 * 2. Quando o resultado sumia (2,5 s), o scanner voltava a ler — e o mesmo QR
 *    continuava na frente da câmera. Segunda validação, 6 a 12 s depois da
 *    primeira, com outro resultado ("acabou de registrar", ou pior: uma
 *    entrada nova logo depois da saída). Está nos registros daquela noite.
 * 3. A câmera seguia decodificando quadros enquanto esperava o servidor e
 *    enquanto o resultado estava na tela — a noite toda.
 *
 * Agora: a leitura PAUSA a câmera e mostra "Validando acesso..." na hora; a
 * resposta vira uma tela clara (liberado / já validado / negado / inválido);
 * sem resposta em `TEMPO_SEM_RESPOSTA_MS`, a tela DIZ isso; e o mesmo QR lido
 * de novo logo em seguida não vai mais ao servidor — só um aviso discreto.
 */

/** Sem resposta até aqui, a tela avisa — em vez de ficar parada. */
const TEMPO_SEM_RESPOSTA_MS = 10_000

/**
 * O mesmo QR, dentro deste tempo depois do resultado, não é validado de novo:
 * é o QR que continuou na frente da câmera. O servidor já recusa a saída nos
 * 5 min seguintes à entrada (`CARENCIA_SAIDA_MIN`), então 15 s aqui não tira
 * nenhuma leitura legítima.
 */
const REPETIDO_MS = 15_000

/** Quanto tempo cada tipo de resultado fica na tela (ou até tocar). */
const DURACAO_MS = { sucesso: 3000, jaValidado: 4000, erro: 5000 } as const

// O html5-qrcode rejeita às vezes com Error, às vezes com string
// ("Error getting userMedia, error = NotReadableError: ...") — lê os dois.
const textoDoErro = (e: unknown): string => {
  const x = e as { name?: string; message?: string } | null
  return `${x?.name ?? ''} ${x?.message ?? ''} ${typeof e === 'string' ? e : ''}`.trim()
}
const ehPermissaoNegada = (e: unknown) => /NotAllowed|Permission ?denied|PermissionDenied|SecurityError/i.test(textoDoErro(e))
const ehTraseira = (rotulo: string) => /back|rear|traseira|environment|trás/i.test(rotulo ?? '')
const codigoDoErro = (e: unknown): string =>
  textoDoErro(e).match(/(NotAllowed|NotReadable|NotFound|Overconstrained|Abort|Security|TrackStart)\w*/)?.[0]
  ?? (textoDoErro(e).slice(0, 60) || 'desconhecido')

/** O que fazer, pela CAUSA do erro — antes era sempre "permita a câmera". */
function mensagemDoErroDeCamera(e: unknown): string {
  const t = textoDoErro(e)
  if (ehPermissaoNegada(e)) {
    return 'A câmera está bloqueada. Toque no cadeado ao lado do endereço e permita a câmera. Se já estiver permitida, confira no Android: Configurações → Apps → Chrome → Permissões → Câmera → Permitir. Depois recarregue a página.'
  }
  if (/NotReadable|Could not start|TrackStart|Abort|in use|Concurrent/i.test(t)) {
    return 'A câmera está sendo usada por outro aplicativo ou outra aba. Feche as outras abas do navegador (principalmente outras do Credenciei) e apps de câmera, vídeo ou chamada, e toque em "Tentar de novo".'
  }
  if (/NotFound|DevicesNotFound|Overconstrained|no camera/i.test(t)) {
    return 'Não encontramos uma câmera disponível neste aparelho. Feche outros apps que usem a câmera e toque em "Tentar de novo" — ou use outro celular.'
  }
  return 'Não conseguimos abrir a câmera. Feche as outras abas e apps que usem câmera, confira se a câmera está permitida para este site e toque em "Tentar de novo".'
}

type Categoria = 'liberado' | 'saida' | 'jaValidado' | 'negado' | 'invalido' | 'semResposta'

function categoriaDo(r: ScanResult): Categoria {
  if (r.semResposta) return 'semResposta'
  if (r.jaRegistrado) return 'jaValidado'
  if (r.success) return r.veiculo || r.momento !== 'fim' ? 'liberado' : 'saida'
  return r.qrInvalido ? 'invalido' : 'negado'
}

const VISUAL: Record<Categoria, { fundo: string; icone: string; titulo: string }> = {
  liberado:    { fundo: 'bg-green-600', icone: '✓', titulo: 'ACESSO LIBERADO' },
  saida:       { fundo: 'bg-brand-500', icone: '↩', titulo: 'SAÍDA REGISTRADA' },
  jaValidado:  { fundo: 'bg-amber-600', icone: '⚠', titulo: 'JÁ VALIDADO' },
  negado:      { fundo: 'bg-red-600',   icone: '✕', titulo: 'ACESSO NEGADO' },
  invalido:    { fundo: 'bg-red-600',   icone: '✕', titulo: 'QR CODE INVÁLIDO' },
  semResposta: { fundo: 'bg-amber-600', icone: '⏳', titulo: 'SEM RESPOSTA AINDA' },
}

/*
 * Retorno que o operador SENTE, não só vê: vibração e um bipe curto. Quem está
 * no portão olha para a pessoa, não para a tela. O navegador só libera som e
 * vibração depois do primeiro toque na página — até lá, fica só o visual.
 */
let audio: AudioContext | null = null
function prepararSom() {
  if (typeof window === 'undefined' || audio) return
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) audio = new Ctx()
  } catch { /* sem áudio neste aparelho */ }
}
function bipe(frequencias: number[], duracaoS = 0.12) {
  try {
    if (!audio) return
    if (audio.state === 'suspended') void audio.resume()
    frequencias.forEach((f, i) => {
      const osc = audio!.createOscillator()
      const vol = audio!.createGain()
      osc.frequency.value = f
      vol.gain.value = 0.15
      osc.connect(vol).connect(audio!.destination)
      const t = audio!.currentTime + i * (duracaoS + 0.04)
      osc.start(t)
      osc.stop(t + duracaoS)
    })
  } catch { /* som é bônus */ }
}
function vibrar(padrao: number | number[]) {
  try { navigator.vibrate?.(padrao) } catch { /* nem todo aparelho vibra */ }
}
function sinalizar(c: Categoria) {
  if (c === 'liberado' || c === 'saida') { vibrar(80); bipe([880]) }
  else if (c === 'jaValidado' || c === 'semResposta') { vibrar([60, 60, 60]); bipe([660, 660]) }
  else { vibrar([200, 80, 200]); bipe([220], 0.35) }
}

export default function ScannerView({
  eventos,
  initialEventoId,
  noPainel = false,
}: {
  eventos: Evento[]
  initialEventoId?: string
  /** Dentro do painel (/admin/scanner), que tem tema claro e escuro — o
   *  seletor usa o estilo do painel em vez do fixo da tela preta do portão. */
  noPainel?: boolean
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [validando, setValidando] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  // Aviso discreto abaixo da câmera: o mesmo QR lido de novo logo em seguida.
  const [repetido, setRepetido] = useState<string | null>(null)
  // A câmera não abriu. Sem isto, quem opera o portão fica olhando um quadrado
  // preto sem saber o motivo — ver o comentário no `catch` do `start`.
  const [erroCamera, setErroCamera] = useState<string | null>(null)
  // O nome técnico do erro, pequeno na tela — é o que permite diagnosticar
  // por um print do celular do portão.
  const [codigoErroCamera, setCodigoErroCamera] = useState<string | null>(null)
  const [linkCopiado, setLinkCopiado] = useState(false)

  /** Uma validação por vez: enquanto houver uma em curso ou um resultado na tela, nada novo entra. */
  const ocupadoRef = useRef(false)
  /** Identifica a leitura da vez — uma resposta atrasada de uma leitura antiga não sobrescreve a atual. */
  const leituraRef = useRef(0)
  /** O último QR com resultado, pra não validar de novo o mesmo QR parado na frente da câmera. */
  const ultimoRef = useRef<{ codigo: string; em: number; resumo: string } | null>(null)
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repetidoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  // Ref para o callback do scanner (que captura o estado do primeiro render).
  // Atualizada num efeito, não durante o render — o linter do React passou a
  // recusar escrever em `.current` no corpo do componente.
  const eventoIdRef = useRef(eventoId)
  useEffect(() => {
    eventoIdRef.current = eventoId
    ultimoRef.current = null // outro evento: o mesmo QR pode ter outro resultado
  }, [eventoId])

  // Som e vibração só depois de um toque (regra do navegador).
  useEffect(() => {
    const liberar = () => prepararSom()
    window.addEventListener('pointerdown', liberar, { once: true })
    return () => window.removeEventListener('pointerdown', liberar)
  }, [])

  /** Para de decodificar quadros (a imagem continua ao vivo). */
  const pausarLeitura = () => {
    try { scannerRef.current?.pause(false) } catch { /* já pausado ou ainda não começou */ }
  }
  const retomarLeitura = () => {
    try { scannerRef.current?.resume() } catch { /* não estava pausado */ }
  }

  /** Tira o resultado da tela e deixa o scanner pronto pro próximo QR. */
  const liberar = () => {
    if (temporizadorRef.current) { clearTimeout(temporizadorRef.current); temporizadorRef.current = null }
    leituraRef.current++ // qualquer resposta atrasada ainda pendente deixa de valer
    setResult(null)
    setValidando(false)
    setConferindo(false)
    ocupadoRef.current = false
    retomarLeitura()
  }

  const mostrarResultado = (id: number, codigo: string, r: ScanResult) => {
    if (id !== leituraRef.current) return // o operador já seguiu em frente
    const categoria = categoriaDo(r)
    setValidando(false)
    setResult(r)
    sinalizar(categoria)

    // "Sem resposta" não é resultado: não trava o mesmo QR de ser lido de novo.
    if (categoria !== 'semResposta') {
      const quem = r.funcionario?.nome ?? r.veiculo?.placa ?? ''
      ultimoRef.current = {
        codigo, em: Date.now(),
        resumo: `${VISUAL[categoria].titulo}${quem ? ` — ${quem}` : ''}`,
      }
    }

    /*
     * Crachá de outra etapa NÃO some sozinho: há uma decisão a tomar com a
     * pessoa parada na frente. "Sem resposta" também não: some quando a
     * resposta chegar ou quando o operador tocar.
     */
    if (r.faseErrada || categoria === 'semResposta') return

    if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
    const duracao = categoria === 'liberado' || categoria === 'saida'
      ? DURACAO_MS.sucesso
      : categoria === 'jaValidado' ? DURACAO_MS.jaValidado : DURACAO_MS.erro
    temporizadorRef.current = setTimeout(liberar, duracao)
  }

  const processQR = async (bruto: string) => {
    const codigo = (bruto ?? '').trim()
    if (!codigo || ocupadoRef.current) return

    /*
     * O mesmo QR logo depois do resultado dele: é o celular da pessoa que
     * continuou na frente da câmera. Não valida de novo (era a segunda
     * validação que confundia o portão) — só avisa, sem cobrir a câmera.
     */
    const ultimo = ultimoRef.current
    if (ultimo && ultimo.codigo === codigo && Date.now() - ultimo.em < REPETIDO_MS) {
      setRepetido(`Este QR acabou de ser lido: ${ultimo.resumo}. Aponte para o próximo.`)
      if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current)
      repetidoTimerRef.current = setTimeout(() => setRepetido(null), 3000)
      return
    }

    ocupadoRef.current = true
    pausarLeitura()
    const id = ++leituraRef.current
    setRepetido(null)
    setResult(null)
    setValidando(true) // "Validando acesso..." aparece NA HORA
    vibrar(30)

    /*
     * Sem escolher "Entrada" ou "Saída" antes: o servidor decide sozinho, pela
     * própria pessoa — primeira leitura do turno é entrada, segunda é saída
     * (ver `inferirMomentoQR` em lib/actions.ts). Decisão do Juan, 03/09/2026.
     */
    const pedido: Promise<ScanResult> = (ehQrDeVeiculo(codigo)
      ? conferirVeiculoPorQR(eventoIdRef.current, codigo)
      : registrarPresencaQR(eventoIdRef.current, codigo)
    ).catch((): ScanResult => ({
      success: false,
      message: 'Não foi possível validar agora. Confira a internet do aparelho e leia o QR de novo.',
    }))

    /*
     * A resposta pode demorar (rede do evento). Passado o tempo, a tela DIZ que
     * ainda não chegou — e troca pelo resultado real assim que ele chegar,
     * porque a validação pode ter sido gravada. Nunca fica parada em silêncio.
     */
    const tempo = setTimeout(() => {
      mostrarResultado(id, codigo, {
        success: false,
        semResposta: true,
        message: 'A internet está lenta e a resposta ainda não chegou. NÃO leia de novo: o resultado aparece aqui assim que chegar. Se demorar muito, confira a pessoa em "Registrar ponto".',
      })
    }, TEMPO_SEM_RESPOSTA_MS)

    const resposta = await pedido
    clearTimeout(tempo)
    mostrarResultado(id, codigo, resposta)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    let desmontou = false

    import('html5-qrcode').then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (desmontou) return
      /*
       * Só QR, sem espelhar (26/09/2026). Sem `formatsToSupport` a biblioteca
       * procurava TODOS os formatos (códigos de barras de produto inclusive)
       * em cada quadro; e sem `disableFlip`, todo quadro sem código — quase
       * todos, enquanto se mira — era decodificado DE NOVO espelhado. A câmera
       * traseira não espelha o QR: era trabalho dobrado a troco de nada, e
       * pesa em celular simples esquentado depois de horas de portão.
       */
      const config = {
        fps: 15,
        // Até 300 px, mas nunca maior que 85% da imagem (tela pequena).
        qrbox: (largura: number, altura: number) => {
          const lado = Math.max(120, Math.min(300, Math.floor(Math.min(largura, altura) * 0.85)))
          return { width: lado, height: lado }
        },
        disableFlip: true,
      }

      // Uma instância nova por tentativa: depois de um `start` que falhou, a
      // mesma instância nem sempre aceita começar de novo.
      const tentar = async (camera: string | MediaTrackConstraints) => {
        const leitor = new Html5Qrcode('qr-reader', {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          // Leitor nativo do aparelho (Android/Chrome) quando existir — bem
          // mais rápido que o de JavaScript. Onde não existe, cai no outro.
          useBarCodeDetectorIfSupported: true,
        })
        scannerRef.current = leitor
        try {
          await leitor.start(camera, config, (texto: string) => { void processQR(texto) }, () => {})
        } catch (e) {
          try { leitor.clear() } catch { /* nada pra limpar */ }
          throw e
        }
        // Foco contínuo quando o aparelho deixa escolher — sem isso, alguns
        // Android travam o foco longe e o QR na mão fica borrado.
        try {
          await leitor.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        } catch { /* nem todo aparelho aceita — segue com o padrão */ }
      }

      /*
       * Primeiro a câmera traseira; se não abrir, CADA câmera do aparelho.
       *
       * Portão do Pontal Weekend (25/09/2026): câmera permitida e mesmo assim
       * "a câmera não abriu" — e a tela só sabia dizer "permita a câmera",
       * então ninguém sabia o que fazer e a entrada virou lançamento manual.
       * O pedido genérico de câmera traseira falha em alguns Android (outra
       * lente, câmera ocupada por outra aba); pedir pelo id de cada câmera
       * costuma resolver sozinho. Permissão negada não adianta insistir.
       */
      let ultimoErro: unknown = null
      try { await tentar({ facingMode: 'environment' }); return } catch (e) { ultimoErro = e }

      if (!ehPermissaoNegada(ultimoErro)) {
        try {
          const cameras = await Html5Qrcode.getCameras()
          const traseiraPrimeiro = [...cameras].sort((a, b) => Number(ehTraseira(b.label)) - Number(ehTraseira(a.label)))
          for (const c of traseiraPrimeiro) {
            if (desmontou) return
            try { await tentar(c.id); return } catch (e) { ultimoErro = e }
          }
        } catch (e) { ultimoErro = e }
      }

      if (desmontou) return
      console.error(ultimoErro)
      setErroCamera(emNavegadorEmbutido()
        ? 'Você abriu por dentro de outro aplicativo (WhatsApp, Instagram), e por ali a câmera não funciona. Toque em "Copiar link", abra o Chrome ou o Safari e cole lá.'
        : mensagemDoErroDeCamera(ultimoErro))
      setCodigoErroCamera(codigoDoErro(ultimoErro))
    })

    return () => {
      desmontou = true
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
      if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current)
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
    // O scanner nasce uma vez; o resto do estado chega por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoria = result ? categoriaDo(result) : null
  const visual = categoria ? VISUAL[categoria] : null

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <div className="w-full max-w-sm space-y-3">
        <div>
          <label className="text-slate-400 text-sm block mb-1.5" data-tutorial="scan-evento">Evento</label>
          <select
            value={eventoId}
            onChange={e => setEventoId(e.target.value)}
            className={noPainel
              ? 'input w-full'
              : 'w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none'}
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
          {codigoErroCamera && <p className="text-red-400/60 text-2xs mt-1.5 font-mono">Código: {codigoErroCamera}</p>}
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
              Tentar de novo
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
        repetido ? (
          <p className="w-full max-w-sm text-center text-amber-300 text-sm font-semibold bg-amber-500/15 border border-amber-500/40 rounded-lg px-3 py-2">
            {repetido}
          </p>
        ) : (
          <p className="text-slate-500 text-sm flex items-center gap-2">
            <ScanLine className="w-4 h-4" />
            Aponte a câmera para o QR da credencial ou do veículo
          </p>
        )
      )}

      {/* Validando: aparece no mesmo instante da leitura — a tela nunca fica parada. */}
      {validando && !result && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white text-center px-8" role="status" aria-live="assertive">
          <Loader2 className="w-16 h-16 animate-spin mb-6" />
          <p className="text-3xl font-bold">Validando acesso...</p>
          <p className="text-base opacity-70 mt-3">QR lido. Aguarde a resposta — não precisa ler de novo.</p>
        </div>
      )}

      {/* Resultado: tela inteira, cor e título pelo tipo, e o detalhe do servidor embaixo. */}
      {result && visual && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${visual.fundo}`}
          role="alert"
          aria-live="assertive"
          onClick={() => { if (!result.faseErrada) liberar() }}
        >
          <div className="text-white text-center px-8 max-w-lg">
            <div className="text-8xl mb-4 leading-none">{visual.icone}</div>
            <p className="text-4xl font-extrabold tracking-tight">{visual.titulo}</p>
            {result.funcionario && (
              <>
                <p className="text-2xl font-semibold mt-5">{result.funcionario.nome}</p>
                {result.funcionario.cargo && <p className="text-base opacity-75 mt-1">{result.funcionario.cargo}</p>}
              </>
            )}
            {result.veiculo && (
              <>
                <p className="text-2xl font-semibold mt-5 font-mono">{result.veiculo.placa}</p>
                <p className="text-base opacity-75 mt-1">
                  {result.veiculo.modelo} • {result.veiculo.condutorNome}
                </p>
                {result.veiculo.entradaLiberadaEm && (
                  <p className="text-sm opacity-60 mt-1">
                    Entrada liberada às {formatarBR(result.veiculo.entradaLiberadaEm, 'hora')}
                  </p>
                )}
              </>
            )}
            <p className="text-lg mt-5 opacity-95 leading-snug">{result.message}</p>

            {categoria === 'semResposta' && (
              <Loader2 className="w-8 h-8 animate-spin mx-auto mt-5 opacity-80" />
            )}

            {/*
              * Crachá de outra etapa: o operador precisa DECIDIR, não só ler.
              *
              * Os dois caminhos ficam à vista. "Pedir o CPF" é o que resolve
              * de verdade — diz se a pessoa está na lista. "Voltar a ler" cobre
              * o caso inocente e mais comum: ela só precisa recarregar a tela.
              */}
            {result.faseErrada ? (
              <div className="mt-8 space-y-3 max-w-xs mx-auto">
                <button
                  onClick={e => { e.stopPropagation(); setConferindo(true) }}
                  className="w-full bg-white text-red-700 font-bold rounded-2xl py-4 text-lg shadow-lg"
                >
                  Pedir o CPF e conferir
                </button>
                <button
                  onClick={e => { e.stopPropagation(); liberar() }}
                  className="w-full border-2 border-white/60 text-white font-semibold rounded-2xl py-3"
                >
                  Voltar a ler QR Code
                </button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); liberar() }}
                className="mt-8 border-2 border-white/60 text-white font-semibold rounded-2xl px-6 py-3"
              >
                {categoria === 'semResposta' ? 'Fechar e ler o próximo' : 'Ler o próximo'}
              </button>
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
          aoFechar={liberar}
        />
      )}
    </div>
  )
}
