'use client'
import { useEffect, useRef, useState } from 'react'
import { QrCode, MapPin, MapPinOff } from 'lucide-react'
import { registrarPresencaFacial } from '@/lib/actions'
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
 */

/**
 * A localização do APARELHO (o tablet/celular fixo no portão) — toda leitura
 * de rosto no dia do evento precisa vir com localização. Pede uma vez só, ao
 * abrir a tela: é um aparelho fixo, não anda durante o turno. Sem ela, o
 * totem continua funcionando — é o SERVIDOR quem decide se aquele dia exige
 * (`validarLeituraFacial`); aqui só se avisa com antecedência.
 */
function useLocalizacaoDoAparelho() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [negada, setNegada] = useState(false)
  useEffect(() => {
    // Adiado num tique: chamar setState direto no corpo do efeito (mesmo
    // condicional) é o que o linter reclama — mesmo padrão já usado em
    // CheckinPresenca.tsx para leituras de API do navegador após montar.
    const id = setTimeout(() => {
      if (!navigator.geolocation) { setNegada(true); return }
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => setNegada(true),
        { enableHighAccuracy: true, timeout: 10_000 },
      )
    }, 0)
    return () => clearTimeout(id)
  }, [])
  return { coords, negada }
}

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
  const { coords: localizacao, negada: localizacaoNegada } = useLocalizacaoDoAparelho()

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
      resultado = await registrarPresencaFacial(eventoId, descritor, undefined, {
        latitude: localizacao?.latitude, longitude: localizacao?.longitude,
      })
    } catch (e) {
      console.error('[FaceScannerView]', e)
      resultado = { success: false, message: 'Não foi possível validar agora. Tente de novo ou use o QR Code.' }
    }

    // A estação já seguiu pra outra tentativa enquanto isto estava em voo
    // (evento trocado, ou já resetou por outro motivo) — essa resposta
    // chegou tarde demais pra valer.
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

        {/* Aviso ANTES de dar problema na fila: no dia do evento, a
            biometria exige localização — melhor resolver a permissão do
            aparelho agora do que descobrir só quando alguém for recusado. */}
        {localizacaoNegada && (
          <p className="flex items-center justify-center gap-1.5 text-amber-400 text-2xs bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <MapPinOff className="w-3.5 h-3.5 shrink-0" />
            Localização não disponível — no dia do evento, a biometria exige. Permita o acesso à localização e recarregue a página.
          </p>
        )}
        {localizacao && (
          <p className="flex items-center justify-center gap-1 text-slate-500 text-2xs">
            <MapPin className="w-3 h-3 shrink-0" /> Localização ativa
          </p>
        )}

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
