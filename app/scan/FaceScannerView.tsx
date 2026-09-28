'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Loader2, ScanFace, QrCode, MapPin, MapPinOff } from 'lucide-react'
import { registrarPresencaFacial } from '@/lib/actions'
import FaceCapture, { type ResultadoCaptura } from '@/components/FaceCapture'

/**
 * A localização do APARELHO (o tablet/celular fixo no portão) — pedido do
 * Juan (27/09/2026): toda leitura de rosto no dia do evento precisa vir com
 * localização. Pede uma vez só, ao abrir a tela: é um aparelho fixo, não
 * anda durante o turno. Sem ela, o scanner continua funcionando — é o
 * SERVIDOR quem decide se aquele dia exige (`validarLeituraFacial`); aqui só
 * se avisa o operador com antecedência, pra ele resolver antes da fila
 * formar, não no meio dela.
 */
function useLocalizacaoDoAparelho() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [negada, setNegada] = useState(false)
  useEffect(() => {
    if (!navigator.geolocation) { setNegada(true); return }
    navigator.geolocation.getCurrentPosition(
      pos => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setNegada(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
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
  previa?: boolean
  volta?: boolean
  encerra?: boolean
  /** Sem match na galeria — a pessoa ainda não cadastrou o rosto. NÃO é uma recusa de acesso. */
  naoIdentificado?: boolean
}

/*
 * O scanner facial — MESMA regra de acesso do QR (`registrarPresencaFacial`
 * chama a mesma `autorizarPresenca` de `lib/actions.ts`), só muda COMO a
 * pessoa é identificada. O botão "Validar por QR Code" nunca some: troca
 * pra `ScannerView` de verdade, o mesmo leitor que já existe — nada
 * duplicado (pedido do Juan, 27/09/2026).
 */

type Modo = 'entrada' | 'fim'
// Mesma chave do ScannerView: trocar de rosto pra QR (ou vice-versa) mantém
// o que o operador estava registrando.
const CHAVE_MODO = 'credenciei:scanner-modo'
const semAssinatura = () => () => {}
const lerModoSalvo = (): string | null => {
  try { return localStorage.getItem(CHAVE_MODO) } catch { return null }
}

type Categoria = 'liberado' | 'saida' | 'jaValidado' | 'negado' | 'naoIdentificado'

function categoriaDo(r: ScanResult): Categoria {
  if (r.jaRegistrado) return 'jaValidado'
  if (r.success) return r.momento !== 'fim' ? 'liberado' : 'saida'
  // Sem match na galeria: NÃO é recusa de acesso, é "ainda não cadastrou o
  // rosto" — cor e título diferentes de `negado` (pedido do Juan, 27/09/2026).
  if (r.naoIdentificado) return 'naoIdentificado'
  return 'negado'
}

const VISUAL: Record<Categoria, { fundo: string; icone: string; titulo: string }> = {
  liberado:   { fundo: 'bg-green-600', icone: '✓', titulo: 'ACESSO LIBERADO' },
  saida:      { fundo: 'bg-blue-600', icone: '↩', titulo: 'SAÍDA REGISTRADA' },
  jaValidado: { fundo: 'bg-amber-600', icone: '⚠', titulo: 'JÁ VALIDADO' },
  negado:     { fundo: 'bg-red-600', icone: '✕', titulo: 'ACESSO NEGADO' },
  // Azul, não vermelho: não é um erro nem uma rejeição — é o caminho normal
  // de quem ainda não cadastrou o rosto. O QR aqui é a AÇÃO a tomar, não um
  // "desista e tente outra coisa".
  naoIdentificado: { fundo: 'bg-blue-600', icone: '👤', titulo: 'ROSTO AINDA NÃO CADASTRADO' },
}

export default function FaceScannerView({
  eventos, initialEventoId, aoTrocarParaQr,
}: {
  eventos: Evento[]
  initialEventoId?: string
  /** O operador pediu pra trocar pro leitor de QR — o pai decide o que mostrar. */
  aoTrocarParaQr: (eventoId: string) => void
}) {
  const [eventoId, setEventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const { coords: localizacao, negada: localizacaoNegada } = useLocalizacaoDoAparelho()
  const modoSalvo = useSyncExternalStore(semAssinatura, lerModoSalvo, () => null)
  const [modoEscolhido, setModoEscolhido] = useState<Modo | null>(null)
  const modo: Modo = modoEscolhido ?? (modoSalvo === 'fim' ? 'fim' : 'entrada')
  const escolherModo = (m: Modo) => {
    setModoEscolhido(m)
    try { localStorage.setItem(CHAVE_MODO, m) } catch { /* aba anônima */ }
  }

  const [capturando, setCapturando] = useState(true)
  const [validando, setValidando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<{ descritor: number[]; r: ScanResult } | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Força o FaceCapture a remontar (câmera + estado do liveness do zero) a
  // cada nova tentativa — não pode ser ref: React não deixa ler `.current`
  // durante o render (é ele que decide a `key` abaixo).
  const [chaveCaptura, setChaveCaptura] = useState(0)

  const reiniciar = () => {
    setChaveCaptura(c => c + 1)
    setResult(null)
    setConfirmacao(null)
    setValidando(false)
    setCapturando(true)
  }

  const aoCapturar = async ({ descritor }: ResultadoCaptura) => {
    setCapturando(false)
    setValidando(true)
    let previa: ScanResult
    try {
      previa = await registrarPresencaFacial(eventoId, descritor, modo, {
        apenasConferir: true, latitude: localizacao?.latitude, longitude: localizacao?.longitude,
      })
    } catch (e) {
      console.error('[FaceScannerView]', e)
      previa = { success: false, message: 'Não foi possível validar agora. Tente de novo ou use o QR Code.' }
    }
    setValidando(false)
    if (previa.previa) {
      setConfirmacao({ descritor, r: previa })
    } else {
      setResult(previa)
    }
  }

  const confirmar = async () => {
    if (!confirmacao || salvando) return
    setSalvando(true)
    let resultado: ScanResult
    try {
      resultado = await registrarPresencaFacial(eventoId, confirmacao.descritor, modo, {
        latitude: localizacao?.latitude, longitude: localizacao?.longitude,
      })
    } catch (e) {
      console.error('[FaceScannerView]', e)
      resultado = { success: false, message: 'Não foi possível validar agora. Tente de novo ou use o QR Code.' }
    }
    setSalvando(false)
    setConfirmacao(null)
    setResult(resultado)
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
            onChange={e => { setEventoId(e.target.value); reiniciar() }}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none"
          >
            {eventos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => escolherModo('entrada')}
            className={`rounded-xl py-3.5 font-extrabold text-base tracking-wide transition-all active:scale-95 ${
              modo === 'entrada' ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-300' : 'border-2 border-slate-600 text-slate-400'
            }`}
          >
            ENTRADA
          </button>
          <button
            type="button"
            onClick={() => escolherModo('fim')}
            className={`rounded-xl py-3.5 font-extrabold text-base tracking-wide transition-all active:scale-95 ${
              modo === 'fim' ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300' : 'border-2 border-slate-600 text-slate-400'
            }`}
          >
            SAÍDA
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
          <ScanFace className="w-3.5 h-3.5" /> Reconhecimento facial
        </div>

        {/* Aviso ANTES de dar problema na fila: no dia do evento, a
            biometria exige localização — melhor o operador resolver a
            permissão agora do que descobrir só quando alguém for recusado. */}
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

        {/* O QR nunca fica escondido — o operador troca a qualquer momento,
            não só quando o rosto falha. */}
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
          onCancelar={() => aoTrocarParaQr(eventoId)}
        />
      )}

      {validando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white text-center px-8">
          <Loader2 className="w-16 h-16 animate-spin mb-6" />
          <p className="text-3xl font-bold">Identificando…</p>
        </div>
      )}

      {/* CONFIRMAÇÃO — mesmo desenho do scanner de QR: mostra quem é e o
          que vai ser gravado, exige SALVAR (ou CANCELAR). */}
      {confirmacao && (() => {
        const r = confirmacao.r
        const ehEntrada = modo === 'entrada'
        const cor = ehEntrada ? 'bg-green-600' : 'bg-blue-600'
        const acao = ehEntrada ? (r.volta ? 'VOLTA AO TRABALHO' : 'ENTRADA') : 'SAÍDA'
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 px-6">
            <div className="w-full max-w-sm text-center text-white">
              <p className="text-sm font-semibold opacity-70">Confirme o registro</p>
              <span className={`inline-block mt-2 rounded-full px-5 py-2 text-lg font-extrabold tracking-wide ${cor}`}>{acao}</span>
              {r.funcionario && (
                <>
                  <p className="text-3xl font-extrabold mt-6 leading-tight">{r.funcionario.nome}</p>
                  <p className="text-base opacity-75 mt-1">{[r.funcionario.cargo, r.funcionario.setor].filter(Boolean).join(' · ')}</p>
                </>
              )}
              <p className="text-base mt-4 opacity-90 leading-snug">{r.message}</p>
              <button
                type="button"
                onClick={confirmar}
                disabled={salvando}
                className={`mt-8 w-full rounded-2xl py-5 text-xl font-extrabold text-white shadow-lg active:scale-95 transition-all disabled:opacity-70 ${cor}`}
              >
                {salvando ? <span className="inline-flex items-center gap-2"><Loader2 className="w-6 h-6 animate-spin" /> Salvando...</span> : `SALVAR ${ehEntrada ? 'ENTRADA' : 'SAÍDA'}`}
              </button>
              <button
                type="button"
                onClick={reiniciar}
                disabled={salvando}
                className="mt-3 w-full rounded-2xl py-4 text-base font-bold text-white border-2 border-white/50 active:scale-95 transition-all disabled:opacity-50"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )
      })()}

      {/* RESULTADO — sucesso, negado, ou não identificado (com os dois
          botões pedidos: tentar de novo e usar QR Code). */}
      {result && visual && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${visual.fundo}`} role="alert" aria-live="assertive">
          <div className="text-white text-center px-8 max-w-lg">
            <div className="text-8xl mb-4 leading-none">{visual.icone}</div>
            <p className="text-4xl font-extrabold tracking-tight">{visual.titulo}</p>
            {result.funcionario && (
              <>
                <p className="text-2xl font-semibold mt-5">{result.funcionario.nome}</p>
                {result.funcionario.cargo && <p className="text-base opacity-75 mt-1">{result.funcionario.cargo}</p>}
              </>
            )}
            <p className="text-lg mt-5 opacity-95 leading-snug">{result.message}</p>

            {/*
              * A biometria continua sendo a PRIORIDADE mesmo aqui — "tentar
              * de novo" pelo rosto vem primeiro e cheio. O QR é sempre o
              * plano B, nunca a sugestão principal (pedido explícito do
              * Juan, 27/09/2026: "a prioridade é a pessoa se cadastrar com
              * a biometria, qr code é apenas um plano B no dia do evento") —
              * inclusive quando o rosto ainda não foi reconhecido: o botão
              * de QR aqui é só pra não deixar ninguém travado, não é o
              * caminho que o sistema empurra.
              */}
            <div className="mt-8 space-y-3 max-w-xs mx-auto">
              <button onClick={reiniciar} className="w-full bg-white text-slate-900 font-extrabold rounded-2xl py-4 text-lg shadow-lg active:scale-95 transition-all">
                TENTAR NOVAMENTE
              </button>
              <button
                onClick={() => aoTrocarParaQr(eventoId)}
                className="w-full flex items-center justify-center gap-1.5 border-2 border-white/60 text-white font-semibold rounded-2xl py-3 active:scale-95 transition-all"
              >
                <QrCode className="w-4 h-4" /> VALIDAR POR QR CODE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
