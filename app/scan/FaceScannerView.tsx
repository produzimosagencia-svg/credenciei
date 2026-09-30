'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { QrCode, Loader2 } from 'lucide-react'
import { registrarPresencaFacial, registrarPresencaQR, cancelarLeituraQR } from '@/lib/actions'
import FaceCapture, { type ResultadoCaptura } from '@/components/FaceCapture'

/*
 * O TOTEM — reescrito em 28/09/2026 pra seguir a MESMA régua do leitor de QR
 * atendido (`ScannerView.tsx`): pedido do Juan depois de usar o totem sem
 * botão num evento de verdade ("coloca o botão de ENTRADA ou SAÍDA pro
 * usuário selecionar, segue as mesmas regras de telas e layout que montamos
 * para o do scanner do QR code"). Isto substitui o desenho anterior
 * (27/09/2026), que era deliberadamente autônomo — sem botão, sem confirmar,
 * porque a ideia era "a pessoa só olha pra câmera e pronto". Essa mesma
 * troca já tinha acontecido com o QR antes (o botão ENTRADA/SAÍDA "voltou"
 * em 26/09/2026, ver `ScannerView.tsx`) — biometria segue o mesmo caminho
 * agora, pelo mesmo motivo: quem opera o portão decide o que está
 * registrando, e confirma antes de gravar.
 *
 * O que é IGUAL ao QR agora:
 *   - Botão ENTRADA/SAÍDA, mesma cor e mesma chave de localStorage
 *     (`credenciei:scanner-modo`) — trocar de QR pra rosto no mesmo
 *     aparelho mantém o modo escolhido.
 *   - PRÉVIA (nada gravado) → SALVAR/CANCELAR → só então grava de verdade.
 *   - O resultado NÃO some sozinho: fica na tela até tocar em "LER O
 *     PRÓXIMO" — igual ao QR, pelo mesmo motivo (quem opera olha pra
 *     pessoa, não pra tela, e não pode perder o resultado).
 *
 * O que continua SÓ da biometria:
 *   - A MESMA câmera também lê QR Code (pedido do Juan, 27/09/2026) — quando
 *     ninguém aparece pro rosto, tenta achar um QR no mesmo quadro
 *     (`onQrDetectado` do `FaceCapture`). Os dois caminhos (rosto e QR lido
 *     aqui) passam pela MESMA prévia/confirmação.
 *   - "Rosto ainda não cadastrado" continua sendo um estado à parte (azul,
 *     não vermelho) — não é uma recusa, é o caminho normal de quem ainda
 *     não tem o rosto salvo neste evento.
 *   - O botão "Validar por QR Code" no rodapé troca a estação inteira pro
 *     leitor de QR (`ScannerView`) — pra quando a câmera não reconhece
 *     ninguém de jeito nenhum.
 */

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null; setor?: string | null }
  momento?: 'entrada' | 'meio' | 'fim'
  jaRegistrado?: boolean
  volta?: boolean
  naoIdentificado?: boolean
  previa?: boolean
  /** O rosto bateu, mas com alguém credenciado em OUTRO evento — ver lib/actions.ts. */
  cadastradoEmOutroEvento?: { nome: string; local: string | null; data: string | null }
}

/*
 * ENTRADA / SAÍDA — mesma chave do QR (`ScannerView.tsx`), de propósito: é o
 * MESMO aparelho, e o operador não deveria ter que escolher de novo só
 * porque trocou pra biometria no meio do turno.
 */
type Modo = 'entrada' | 'fim'
const CHAVE_MODO = 'credenciei:scanner-modo'
const semAssinatura = () => () => {}
const lerModoSalvo = (): string | null => {
  try { return localStorage.getItem(CHAVE_MODO) } catch { return null }
}

/**
 * O mesmo nome, dentro deste tempo depois do resultado, não abre confirmação
 * de novo — é o rosto dela ainda na frente da câmera, não uma segunda visita.
 * Mesma janela do QR (`REPETIDO_MS`); a chave aqui é o NOME porque, ao
 * contrário do QR, a identidade só é conhecida DEPOIS da resposta do
 * servidor (não tem como saber de antemão que "é a mesma pessoa").
 */
const REPETIDO_MS = 15_000

type Categoria = 'liberado' | 'saida' | 'jaValidado' | 'negado' | 'naoIdentificado' | 'outroEvento'

function categoriaDo(r: ScanResult): Categoria {
  if (r.jaRegistrado) return 'jaValidado'
  if (r.success) return r.momento !== 'fim' ? 'liberado' : 'saida'
  if (r.cadastradoEmOutroEvento) return 'outroEvento'
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
  // Âmbar: nem liberado, nem uma recusa por engano — a pessoa é conhecida do
  // sistema, só não pertence a ESTE evento (pedido do Juan, 29/09/2026).
  outroEvento: { fundo: 'bg-amber-600', icone: '📍', titulo: 'CADASTRADA EM OUTRO EVENTO' },
}

/** O que originou a leitura em confirmação — pra SALVAR repetir a chamada certa. */
type Origem = { tipo: 'rosto'; descritor: number[] } | { tipo: 'qr'; texto: string }

export default function FaceScannerView({
  eventos, initialEventoId, aoTrocarParaQr, portaoNome = null, subeventosPorEvento = {},
}: {
  eventos: Evento[]
  initialEventoId?: string
  /** Pra resolver um caso na hora — o pai decide o que mostrar. */
  aoTrocarParaQr: (eventoId: string) => void
  /** Nome do portão deste totem (ex.: "Entrada VIP") — ver `perfis.portao_nome`. */
  portaoNome?: string | null
  /** Subeventos de cada evento (Vital, 30/09/2026) — vazio/ausente = evento sem subeventos. */
  subeventosPorEvento?: Record<string, { id: string; nome: string }[]>
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const subeventosDoEvento = subeventosPorEvento[eventoId] ?? []
  // "Ao entrar, o operador escolhe qual subevento vai ler" (Vital, 30/09/2026).
  const [subeventoId, setSubeventoId] = useState('')

  // O modo salvo vem do aparelho sem piscar a tela (mesmo padrão do QR).
  const modoSalvo = useSyncExternalStore(semAssinatura, lerModoSalvo, () => null)
  const [modoEscolhido, setModoEscolhido] = useState<Modo | null>(null)
  const modo: Modo = modoEscolhido ?? (modoSalvo === 'fim' ? 'fim' : 'entrada')
  const escolherModo = (m: Modo) => {
    setModoEscolhido(m)
    try { localStorage.setItem(CHAVE_MODO, m) } catch { /* aba anônima */ }
  }

  const [capturando, setCapturando] = useState(true)
  const [validando, setValidando] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  // A prévia esperando SALVAR / CANCELAR — igual ao QR.
  const [confirmacao, setConfirmacao] = useState<{ origem: Origem; modo: Modo; r: ScanResult } | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Força o FaceCapture a remontar (câmera + estado do liveness do zero) a
  // cada volta do loop — não pode ser ref: React não deixa ler `.current`
  // durante o render (é ele que decide a `key` abaixo).
  const [chaveCaptura, setChaveCaptura] = useState(0)
  // Aviso discreto: o mesmo nome, com resultado há pouco tempo.
  const [repetido, setRepetido] = useState<string | null>(null)
  const ultimoRef = useRef<{ nome: string; modo: Modo; em: number; resumo: string } | null>(null)
  const repetidoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modoRef = useRef<Modo>(modo)
  useEffect(() => { modoRef.current = modo }, [modo])
  /**
   * Identifica CADA volta do loop — incrementado toda vez que a estação
   * reseta (resultado dispensado, evento trocado, etc). Uma resposta do
   * servidor que chega depois de a estação já ter seguido pra outra
   * tentativa não pode mais sobrescrever a tela.
   */
  const tentativaIdRef = useRef(0)

  useEffect(() => () => { if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current) }, [])

  /** Volta a escanear — reseta a câmera e limpa qualquer tela em cima dela. */
  const voltarAEscanear = () => {
    tentativaIdRef.current += 1
    setChaveCaptura(c => c + 1)
    setResult(null)
    setValidando(false)
    setConfirmacao(null)
    setSalvando(false)
    setCapturando(true)
  }

  const semRede = (): ScanResult => ({
    success: false,
    message: 'Não foi possível validar agora. Confira a internet do aparelho e tente de novo.',
  })

  const chamarServidor = (origem: Origem, m: Modo, apenasConferir: boolean): Promise<ScanResult> =>
    origem.tipo === 'rosto'
      ? registrarPresencaFacial(eventoId, origem.descritor, m, { apenasConferir, subeventoId: subeventoId || undefined }).catch(semRede)
      : registrarPresencaQR(eventoId, origem.texto, m, { apenasConferir, subeventoId: subeventoId || undefined }).catch(semRede)

  /** Resultado final (gravado ou recusado) — fica na tela até "LER O PRÓXIMO". */
  const aplicarResultadoFinal = (r: ScanResult, m: Modo) => {
    const nome = r.funcionario?.nome
    if (nome) {
      ultimoRef.current = { nome, modo: m, em: Date.now(), resumo: VISUAL[categoriaDo(r)].titulo }
    }
    setConfirmacao(null)
    setResult(r)
  }

  /**
   * Resposta da PRÉVIA: abre confirmação quando há o que confirmar; mostra
   * direto quando não há (recusa, já registrado, rosto não identificado) —
   * mesma régua do QR (`ScannerView.processQR`).
   */
  const tratarPrevia = (minhaTentativa: number, origem: Origem, m: Modo, r: ScanResult) => {
    if (tentativaIdRef.current !== minhaTentativa) return
    setValidando(false)

    if (r.previa) {
      // O mesmo nome, resultado há pouco: não abre confirmação de novo —
      // só um aviso discreto, e volta a escanear (é o rosto ainda no quadro).
      const nome = r.funcionario?.nome
      const ultimo = ultimoRef.current
      const agora = Date.now()
      if (nome && ultimo && ultimo.nome === nome && ultimo.modo === m && agora - ultimo.em < REPETIDO_MS) {
        setRepetido(`${nome} acabou de ser lido(a): ${ultimo.resumo}.`)
        if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current)
        repetidoTimerRef.current = setTimeout(() => setRepetido(null), 3000)
        voltarAEscanear()
        return
      }
      setResult(null)
      setConfirmacao({ origem, modo: m, r })
      return
    }

    aplicarResultadoFinal(r, m)
  }

  const aoCapturar = async ({ descritor }: ResultadoCaptura) => {
    const minhaTentativa = tentativaIdRef.current
    const origem: Origem = { tipo: 'rosto', descritor }
    setCapturando(false)
    setValidando(true)
    const r = await chamarServidor(origem, modoRef.current, true)
    tratarPrevia(minhaTentativa, origem, modoRef.current, r)
  }

  /**
   * A câmera achou um QR Code em vez de um rosto (ver `onQrDetectado` em
   * `FaceCapture.tsx`) — mesma prévia/confirmação, só troca a chamada ao
   * servidor.
   */
  const aoLerQr = async (texto: string) => {
    const minhaTentativa = tentativaIdRef.current
    const origem: Origem = { tipo: 'qr', texto }
    setCapturando(false)
    setValidando(true)
    const r = await chamarServidor(origem, modoRef.current, true)
    tratarPrevia(minhaTentativa, origem, modoRef.current, r)
  }

  /** SALVAR: refaz a leitura sem prévia — só agora grava de verdade. */
  const confirmar = async () => {
    const c = confirmacao
    if (!c || salvando) return
    const id = ++tentativaIdRef.current
    setSalvando(true)
    const r = await chamarServidor(c.origem, c.modo, false)
    setSalvando(false)
    if (tentativaIdRef.current !== id) return
    aplicarResultadoFinal(r, c.modo)
  }

  /** CANCELAR: nada é gravado. O QR lido aqui usa o mesmo cancelamento do leitor atendido. */
  const cancelar = () => {
    const c = confirmacao
    if (!c) return
    if (c.origem.tipo === 'qr') void cancelarLeituraQR(eventoId, c.origem.texto, c.modo).catch(() => {})
    voltarAEscanear()
  }

  const categoria = result ? categoriaDo(result) : null
  const visual = categoria ? VISUAL[categoria] : null

  /*
   * ENTRADA / SAÍDA — mesmo layout e mesma cor do leitor de QR. Passado pra
   * DENTRO da tela cheia da câmera (`extraTopo`, abaixo): sem isso, os
   * botões ficavam desenhados aqui embaixo, mas a câmera (`fixed inset-0`)
   * cobre a tela inteira por cima deles o tempo todo que está escaneando —
   * ou seja, na prática nunca apareciam (bug relatado pelo Juan, 28/09/2026,
   * com print mostrando a câmera sem botão nenhum em cima).
   */
  const toggleEntradaSaida = (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Registrar">
      <button
        type="button"
        role="radio"
        aria-checked={modo === 'entrada'}
        onClick={() => escolherModo('entrada')}
        className={`rounded-xl py-3 font-extrabold text-sm tracking-wide transition-all active:scale-95 ${
          modo === 'entrada'
            ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-300'
            : 'border-2 border-white/30 text-white/70'
        }`}
      >
        ENTRADA
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={modo === 'fim'}
        onClick={() => escolherModo('fim')}
        className={`rounded-xl py-3 font-extrabold text-sm tracking-wide transition-all active:scale-95 ${
          modo === 'fim'
            ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
            : 'border-2 border-white/30 text-white/70'
        }`}
      >
        SAÍDA
      </button>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <div className="w-full max-w-sm space-y-3">
        {/*
          * Totem preso a um evento só (`perfis.evento_fixo_id`, pedido do
          * Juan 29/09/2026) — `eventos` já chega com um item só nesse caso
          * (ver `eventosEscaneaveisSemData`), então o seletor não faz mais
          * sentido: só confundiria quem opera achando que dá pra trocar.
          */}
        {eventos.length > 1 ? (
          <div>
            <label className="text-slate-400 text-sm block mb-1.5">Evento</label>
            <select
              value={eventoId}
              onChange={e => { setEventoId(e.target.value); setSubeventoId(''); voltarAEscanear() }}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              {eventos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-white font-bold text-base">{eventos[0]?.nome}</p>
            {portaoNome && <p className="text-slate-400 text-xs mt-0.5">{portaoNome}</p>}
          </div>
        )}

        {/* Subevento — "ao entrar, o operador escolhe qual subevento vai
            ler" (Vital, 30/09/2026). Só aparece em evento com subevento. */}
        {!!subeventosDoEvento.length && (
          <div>
            <label className="text-slate-400 text-sm block mb-1.5">Subevento (este portão)</label>
            <select
              value={subeventoId}
              onChange={e => setSubeventoId(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              <option value="">Selecione...</option>
              {subeventosDoEvento.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        )}

        {toggleEntradaSaida}
        <p className="text-slate-500 text-xs text-center">
          Registrando <strong className={modo === 'entrada' ? 'text-green-500' : 'text-blue-400'}>{modo === 'entrada' ? 'ENTRADAS' : 'SAÍDAS'}</strong>.
          Quem saiu e está voltando: use ENTRADA — a saída fica no histórico como pausa.
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
          onCancelar={voltarAEscanear}
          extraTopo={toggleEntradaSaida}
        />
      )}

      {!capturando && !validando && !confirmacao && !result && repetido && (
        <p className="w-full max-w-sm text-center text-amber-300 text-sm font-semibold bg-amber-500/15 border border-amber-500/40 rounded-lg px-3 py-2">
          {repetido}
        </p>
      )}

      {validando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white text-center px-8">
          <Loader2 className="w-16 h-16 animate-spin mb-6" />
          <p className="text-3xl font-bold">Identificando…</p>
        </div>
      )}

      {/*
        * CONFIRMAÇÃO: quem é e o que vai ser registrado — mesmo layout do
        * leitor de QR (`ScannerView.tsx`). SALVAR grava; CANCELAR desiste
        * sem gravar nada.
        */}
      {confirmacao && (() => {
        const r = confirmacao.r
        const ehEntrada = confirmacao.modo === 'entrada'
        const cor = ehEntrada ? 'bg-green-600' : 'bg-blue-600'
        const acao = ehEntrada ? (r.volta ? 'VOLTA AO TRABALHO' : 'ENTRADA') : 'SAÍDA'
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 px-6" role="dialog" aria-modal="true" aria-label={`Confirmar ${acao}`}>
            <div className="w-full max-w-sm text-center text-white">
              <p className="text-sm font-semibold opacity-70">Confirme o registro</p>
              <span className={`inline-block mt-2 rounded-full px-5 py-2 text-lg font-extrabold tracking-wide ${cor}`}>
                {acao}
              </span>
              {r.funcionario && (
                <>
                  <p className="text-3xl font-extrabold mt-6 leading-tight">{r.funcionario.nome}</p>
                  <p className="text-base opacity-75 mt-1">
                    {[r.funcionario.cargo, r.funcionario.setor].filter(Boolean).join(' · ')}
                  </p>
                </>
              )}
              <p className="text-base mt-4 opacity-90 leading-snug">{r.message}</p>

              <button
                type="button"
                onClick={confirmar}
                disabled={salvando}
                className={`mt-8 w-full rounded-2xl py-5 text-xl font-extrabold text-white shadow-lg active:scale-95 transition-all disabled:opacity-70 ${cor}`}
              >
                {salvando
                  ? <span className="inline-flex items-center gap-2"><Loader2 className="w-6 h-6 animate-spin" /> Salvando...</span>
                  : `SALVAR ${ehEntrada ? 'ENTRADA' : 'SAÍDA'}`}
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={salvando}
                className="mt-3 w-full rounded-2xl py-4 text-base font-bold text-white border-2 border-white/50 active:scale-95 transition-all disabled:opacity-50"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )
      })()}

      {/* RESULTADO — fica na tela até tocar em "LER O PRÓXIMO" (mesma regra
          do QR: quem opera olha pra pessoa, não pra tela). */}
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
              onClick={voltarAEscanear}
              className="mt-8 w-full max-w-xs mx-auto block bg-white text-slate-900 font-extrabold text-lg rounded-2xl px-6 py-4 shadow-lg active:scale-95 transition-all"
            >
              LER O PRÓXIMO
            </button>
            {categoria === 'naoIdentificado' && (
              <button
                onClick={() => aoTrocarParaQr(eventoId)}
                className="mt-3 flex items-center justify-center gap-1.5 mx-auto text-white/80 text-sm font-semibold rounded-2xl px-5 py-2 active:scale-95 transition-all"
              >
                <QrCode className="w-3.5 h-3.5" /> Resolver agora pelo QR Code
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
