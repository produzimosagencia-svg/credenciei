'use client'
import { useEffect, useRef, useState } from 'react'
import { QrCode } from 'lucide-react'
import { registrarPresencaFacial, registrarPresencaQR } from '@/lib/actions'
import FaceCapture, { type ResultadoCaptura } from '@/components/FaceCapture'

/*
 * O TOTEM — pedido do Juan (27/09/2026): "os funcionários ir só colocando o
 * rosto e já reconhece quem é de qual setor". Um tablet/celular PARADO no
 * portão, sem ninguém tocando na tela pra cada pessoa — bem diferente do
 * leitor de QR (que continua pedindo ENTRADA/SAÍDA e confirmar, porque lá
 * tem sempre um operador segurando o aparelho e apontando pra UMA pessoa
 * de cada vez).
 *
 * Aqui não tem esse operador entre a pessoa e a câmera. Por isso:
 *   - Sem botão ENTRADA/SAÍDA — o servidor decide sozinho, do mesmo jeito
 *     que o QR decidia antes dos botões voltarem (`inferirMomentoQR`).
 *   - Sem SALVAR/CANCELAR — ninguém ali pra tocar. A leitura já registra
 *     direto (a mesma régua de autorização de sempre, no servidor).
 *   - Depois de mostrar o resultado por alguns segundos, volta sozinho a
 *     escanear — é um LOOP, não uma tela que espera alguém mandar continuar.
 *   - A mesma pessoa parada na frente não é registrada de novo enquanto o
 *     nome dela ainda estiver "recente" (mesma ideia do QR: não duplicar
 *     por causa da câmera continuar vendo o rosto por mais alguns segundos).
 *
 * O QR nunca fica escondido — é o botão pequeno no rodapé, pra quem estiver
 * por perto resolver na hora um caso que a câmera não resolveu sozinha.
 *
 * A MESMA câmera também lê QR Code, sozinha (pedido do Juan, 27/09/2026:
 * "caso o rosto não passe, a pessoa vai ter uma segunda opção" — sem
 * precisar de ninguém tocando em nada). Quem faz isso é o `FaceCapture`
 * (prop `onQrDetectado`, ver o componente); aqui só entra o handler
 * `aoLerQr`, irmão de `aoCapturar` — mesma guarda de tentativa, mesmo
 * cooldown, mesmo auto-reset, só troca a chamada ao servidor.
 */

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null; setor?: string | null }
  momento?: 'entrada' | 'meio' | 'fim'
  jaRegistrado?: boolean
  volta?: boolean
  encerra?: boolean
  naoIdentificado?: boolean
}

/** Por quanto tempo o resultado fica na tela antes do totem voltar a escanear sozinho. */
const DURACAO_RESULTADO_MS = 3_200
/**
 * A mesma pessoa não é registrada de novo dentro deste tempo — é o rosto
 * dela ainda na frente da câmera enquanto o totem já voltou a escanear, não
 * uma segunda visita de verdade. Mesma ideia do `REPETIDO_MS` do leitor de
 * QR, só que aqui a chave é o NOME (o totem não sabe o id sem perguntar de
 * novo ao servidor) — suficiente pra um totem sozinho, sem fila dupla.
 */
const COOLDOWN_MESMA_PESSOA_MS = 12_000

type Categoria = 'liberado' | 'saida' | 'jaValidado' | 'negado' | 'naoIdentificado'

function categoriaDo(r: ScanResult): Categoria {
  if (r.jaRegistrado) return 'jaValidado'
  if (r.success) return r.momento !== 'fim' ? 'liberado' : 'saida'
  // Sem match na galeria: NÃO é recusa de acesso, é "ainda não cadastrou o
  // rosto" — cor e título diferentes de `negado`.
  if (r.naoIdentificado) return 'naoIdentificado'
  return 'negado'
}

const VISUAL: Record<Categoria, { fundo: string; icone: string; titulo: string }> = {
  liberado:   { fundo: 'bg-green-600', icone: '✓', titulo: 'ACESSO LIBERADO' },
  saida:      { fundo: 'bg-blue-600', icone: '↩', titulo: 'SAÍDA REGISTRADA' },
  jaValidado: { fundo: 'bg-amber-600', icone: '⚠', titulo: 'JÁ VALIDADO' },
  negado:     { fundo: 'bg-red-600', icone: '✕', titulo: 'ACESSO NEGADO' },
  // Azul, não vermelho: não é um erro nem uma rejeição — é o caminho normal
  // de quem ainda não cadastrou o rosto. A biometria continua a prioridade;
  // o QR (rodapé) é só o plano B, nunca a sugestão principal.
  naoIdentificado: { fundo: 'bg-blue-600', icone: '👤', titulo: 'ROSTO AINDA NÃO CADASTRADO' },
}

export default function FaceScannerView({
  eventos, initialEventoId, aoTrocarParaQr,
}: {
  eventos: Evento[]
  initialEventoId?: string
  /** Pra resolver um caso na hora — o pai decide o que mostrar. */
  aoTrocarParaQr: (eventoId: string) => void
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')

  const [capturando, setCapturando] = useState(true)
  const [validando, setValidando] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  // Força o FaceCapture a remontar (câmera + estado do liveness do zero) a
  // cada volta do loop — não pode ser ref: React não deixa ler `.current`
  // durante o render (é ele que decide a `key` abaixo).
  const [chaveCaptura, setChaveCaptura] = useState(0)
  const ultimoRegistradoRef = useRef<{ nome: string; em: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Identifica CADA volta do loop — incrementado toda vez que a estação
   * reseta (resultado mostrado, evento trocado, etc). Uma resposta do
   * servidor que chega depois de a estação já ter seguido pra outra
   * tentativa não pode mais sobrescrever a tela: `aoCapturar` guarda o
   * valor no início e confere de novo antes de aplicar o resultado.
   */
  const tentativaIdRef = useRef(0)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  /** Volta a escanear sozinho — é o totem, ninguém precisa tocar em nada. */
  const voltarAEscanear = () => {
    tentativaIdRef.current += 1
    setChaveCaptura(c => c + 1)
    setResult(null)
    setValidando(false)
    setCapturando(true)
  }

  /**
   * O que fazer com a resposta do servidor — igual pra rosto e pra QR, só
   * muda QUEM chamou o servidor (`aoCapturar`/`aoLerQr`, abaixo). Recebe a
   * tentativa que originou a chamada pra descartar respostas tardias de
   * uma tentativa que a estação já abandonou (evento trocado no meio do
   * caminho, por exemplo).
   */
  const aplicarResultado = (resultado: ScanResult, minhaTentativa: number) => {
    if (tentativaIdRef.current !== minhaTentativa) return

    setValidando(false)

    // A mesma pessoa ainda na frente da câmera, logo depois de já ter
    // registrado: não conta uma segunda vez — só volta a escanear direto.
    const ultimo = ultimoRegistradoRef.current
    const mesmaPessoaDeNovo = resultado.funcionario?.nome
      && ultimo?.nome === resultado.funcionario.nome
      && Date.now() - ultimo.em < COOLDOWN_MESMA_PESSOA_MS
    if (mesmaPessoaDeNovo) { voltarAEscanear(); return }

    if (resultado.funcionario?.nome && resultado.success) {
      ultimoRegistradoRef.current = { nome: resultado.funcionario.nome, em: Date.now() }
    }

    setResult(resultado)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(voltarAEscanear, DURACAO_RESULTADO_MS)
  }

  const aoCapturar = async ({ descritor }: ResultadoCaptura) => {
    const minhaTentativa = tentativaIdRef.current
    setCapturando(false)
    setValidando(true)

    let resultado: ScanResult
    try {
      // Sem `escolhido`: o servidor decide ENTRADA ou SAÍDA sozinho — não
      // tem operador aqui pra escolher, e a pessoa nem saberia o que
      // significa. Sem prévia: aqui não há ninguém pra confirmar, então a
      // leitura já registra direto (mesma autorização de sempre, no servidor).
      // Sem localização: o totem é um aparelho FIXO, o servidor não exige
      // GPS neste caminho (só no autoatendimento pelo celular da pessoa).
      resultado = await registrarPresencaFacial(eventoId, descritor, undefined, {})
    } catch (e) {
      console.error('[FaceScannerView]', e)
      resultado = { success: false, message: 'Não foi possível validar agora. Tente de novo ou use o QR Code.' }
    }
    aplicarResultado(resultado, minhaTentativa)
  }

  /**
   * A câmera achou um QR Code em vez de um rosto (ver `onQrDetectado` em
   * `FaceCapture.tsx`) — mesma régua de sempre (`registrarPresencaQR`, o
   * MESMO caminho que o leitor de QR atendido usa), sem `escolhido` pelo
   * mesmo motivo do rosto: ninguém aqui pra escolher ENTRADA/SAÍDA.
   */
  const aoLerQr = async (texto: string) => {
    const minhaTentativa = tentativaIdRef.current
    setCapturando(false)
    setValidando(true)

    let resultado: ScanResult
    try {
      resultado = await registrarPresencaQR(eventoId, texto, undefined, {})
    } catch (e) {
      console.error('[FaceScannerView]', e)
      resultado = { success: false, message: 'Não foi possível validar agora. Tente de novo.' }
    }
    aplicarResultado(resultado, minhaTentativa)
  }

  const categoria = result ? categoriaDo(result) : null
  const visual = categoria ? VISUAL[categoria] : null

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <div className="w-full max-w-sm space-y-3">
        <div>
          <label className="text-slate-400 text-sm block mb-1.5">Evento</label>
          <select
            value={eventoId}
            onChange={e => { setEventoId(e.target.value); voltarAEscanear() }}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
          >
            {eventos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>

        <p className="text-slate-400 text-xs text-center">
          Modo totem — a pessoa só olha pra câmera. O sistema reconhece quem é o
          setor e decide sozinho se é entrada ou saída.
        </p>

        {/* O QR nunca fica escondido — pra quem estiver por perto resolver
            na hora um caso que a câmera não resolveu sozinha. */}
        <button
          type="button"
          onClick={() => aoTrocarParaQr(eventoId)}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-300 border border-slate-700 rounded-lg py-2 hover:bg-slate-800 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" /> Validar por QR Code
        </button>
      </div>

      {capturando && (
        <FaceCapture
          key={chaveCaptura}
          instrucao="Aproxime-se da câmera"
          onCaptura={aoCapturar}
          onQrDetectado={aoLerQr}
          /*
           * "Cancelar" só aparece nos 2 casos fatais que o FaceCapture não
           * resolve sozinho (câmera não abriu, modelo não carregou) — aqui
           * NUNCA pode significar "desliga a biometria da estação inteira":
           * isso trocaria o totem pra QR permanentemente sem ninguém ter
           * pedido. Só tenta a câmera de novo; "Validar por QR Code" (abaixo,
           * sempre visível) continua sendo a única saída deliberada pro QR.
           */
          onCancelar={voltarAEscanear}
        />
      )}

      {validando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white text-center px-8">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-6" />
          <p className="text-3xl font-bold">Identificando…</p>
        </div>
      )}

      {/* RESULTADO — sem botão nenhum: some sozinho e o totem volta a
          escanear (`DURACAO_RESULTADO_MS`). O QR embaixo é só pra quem
          estiver por perto e quiser resolver na hora. */}
      {result && visual && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${visual.fundo}`} role="alert" aria-live="assertive">
          <div className="text-white text-center px-8 max-w-lg">
            <div className="text-8xl mb-4 leading-none">{visual.icone}</div>
            <p className="text-4xl font-extrabold tracking-tight">{visual.titulo}</p>
            {result.funcionario && (
              <>
                <p className="text-2xl font-semibold mt-5">{result.funcionario.nome}</p>
                <p className="text-base opacity-75 mt-1">
                  {[result.funcionario.cargo, result.funcionario.setor].filter(Boolean).join(' · ')}
                </p>
              </>
            )}
            <p className="text-lg mt-5 opacity-95 leading-snug">{result.message}</p>

            <button
              onClick={() => aoTrocarParaQr(eventoId)}
              className="mt-8 flex items-center justify-center gap-1.5 mx-auto border-2 border-white/40 text-white/90 text-sm font-semibold rounded-2xl px-5 py-2.5 active:scale-95 transition-all"
            >
              <QrCode className="w-3.5 h-3.5" /> Resolver agora pelo QR Code
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
