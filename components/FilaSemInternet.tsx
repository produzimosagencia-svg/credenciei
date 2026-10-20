'use client'
import { useCallback, useEffect, useState } from 'react'
import { CloudOff, CloudUpload, AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { formatarBR } from '@/lib/tz'
import {
  EVENTO_DA_FILA, itensDaFila, recusasGuardadas, descartarRecusa, enviarFila, atualizarPacote, atualizarEstado, acertarRelogio, situacaoDoPacote,
  type RecusaGuardada,
} from '@/lib/fila-offline'

/** De quanto em quanto tempo o aparelho tenta mandar a fila (com internet). */
const ENVIO_A_CADA_MS = 20_000
/** De quanto em quanto tempo a lista do evento e o relógio são conferidos (com internet, com a tela à vista). */
const RENOVA_A_CADA_MS = 10 * 60_000
/** A lista guardada mais nova que isto não é baixada de novo — recarregar a tela não gasta a internet do celular. */
const LISTA_NOVA_MS = 20 * 60_000
/** De quanto em quanto tempo o aparelho confere QUEM JÁ TEM ENTRADA (leve, só quem bateu algo nos últimos dias) — é o que a saída sem internet usa. */
const ESTADO_A_CADA_MS = 3 * 60_000

export type EstadoDaFila = {
  semInternet: boolean
  pendentes: number
  recusas: RecusaGuardada[]
  enviando: boolean
  pacote: { geradoEm: string; pessoas: number } | null
}

/**
 * A fila do aparelho (lib/fila-offline.ts) para uma tela do portão: conta o que está guardado, manda sozinha quando
 * a internet volta (e a cada 20 s, com internet), e mantém a lista do evento e o relógio em dia.
 */
export function useFilaSemInternet(eventoId: string): EstadoDaFila {
  const [estado, setEstado] = useState<EstadoDaFila>({ semInternet: false, pendentes: 0, recusas: [], enviando: false, pacote: null })

  const ler = useCallback(async () => {
    try {
      const [fila, recusas, pacote] = await Promise.all([itensDaFila(eventoId), recusasGuardadas(eventoId), situacaoDoPacote(eventoId)])
      setEstado(e => ({ ...e, semInternet: navigator.onLine === false, pendentes: fila.length, recusas, pacote }))
    } catch { /* aparelho sem IndexedDB (aba anônima antiga): a tela segue como antes, sem a fila */ }
  }, [eventoId])

  const enviar = useCallback(async () => {
    if (navigator.onLine === false) return
    const fila = await itensDaFila().catch(() => [])
    if (!fila.length) return
    setEstado(e => ({ ...e, enviando: true }))
    try { await enviarFila() } finally { setEstado(e => ({ ...e, enviando: false })); void ler() }
  }, [ler])

  useEffect(() => {
    // Primeira leitura e primeiro envio fora do corpo do efeito (o linter do React recusa setState síncrono aqui).
    const inicio = setTimeout(() => { void ler(); void enviar() }, 0)
    const aoMudar = () => { void ler() }
    const aoVoltar = () => { void ler(); void enviar(); void acertarRelogio(); void atualizarPacote(eventoId) }
    window.addEventListener(EVENTO_DA_FILA, aoMudar)
    window.addEventListener('online', aoVoltar)
    window.addEventListener('offline', aoMudar)
    const envio = setInterval(() => { void enviar() }, ENVIO_A_CADA_MS)
    return () => {
      clearTimeout(inicio)
      clearInterval(envio)
      window.removeEventListener(EVENTO_DA_FILA, aoMudar)
      window.removeEventListener('online', aoVoltar)
      window.removeEventListener('offline', aoMudar)
    }
  }, [eventoId, ler, enviar])

  // A lista do evento e o relógio: na abertura e a cada 10 min, com internet e com a tela à vista.
  useEffect(() => {
    const renovar = async () => {
      if (navigator.onLine === false || document.hidden) return
      void acertarRelogio()
      const guardada = await situacaoDoPacote(eventoId).catch(() => null)
      if (guardada && Date.now() - new Date(guardada.geradoEm).getTime() < LISTA_NOVA_MS) return
      void atualizarPacote(eventoId)
    }
    const inicio = setTimeout(() => { void renovar() }, 1500)
    const t = setInterval(() => { void renovar() }, RENOVA_A_CADA_MS)
    return () => { clearTimeout(inicio); clearInterval(t) }
  }, [eventoId])

  // Quem já tem entrada: a cada 3 min, com internet e com a tela à vista (a lista nova já traz o estado ao ser baixada).
  useEffect(() => {
    const t = setInterval(() => {
      if (navigator.onLine === false || document.hidden) return
      void atualizarEstado(eventoId)
    }, ESTADO_A_CADA_MS)
    return () => clearInterval(t)
  }, [eventoId])

  return estado
}

/**
 * O aviso do portão: sem internet, quantas batidas estão guardadas no aparelho, e as que o servidor recusou.
 * Some quando está tudo em dia — com internet e fila vazia não há o que dizer.
 */
export default function AvisoFilaSemInternet({ estado, escuro = false }: { estado: EstadoDaFila; escuro?: boolean }) {
  const [abertas, setAbertas] = useState(false)
  const { semInternet, pendentes, recusas, enviando, pacote } = estado
  if (!semInternet && !pendentes && !recusas.length) return null

  const caixa = escuro ? 'bg-amber-500/15 border-amber-500/40 text-amber-100' : 'bg-amber-50 border-amber-200 text-amber-900'
  const fraco = escuro ? 'text-amber-200/80' : 'text-amber-800/80'

  return (
    <div className={`w-full rounded-xl border px-3 py-2.5 text-sm space-y-1.5 ${caixa}`} role="status" aria-live="polite">
      {semInternet && (
        <p className="flex items-start gap-2 font-semibold">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" />
          Sem internet. Pode continuar: as batidas ficam guardadas neste aparelho e sobem sozinhas quando a internet voltar.
        </p>
      )}
      {pendentes > 0 && (
        <p className="flex items-start gap-2">
          <CloudUpload className={`w-4 h-4 shrink-0 mt-0.5 ${enviando ? 'animate-pulse' : ''}`} />
          <span>
            <strong>{pendentes} batida{pendentes === 1 ? '' : 's'} guardada{pendentes === 1 ? '' : 's'}</strong> neste aparelho
            {enviando ? ' — enviando…' : semInternet ? ' — esperando a internet.' : ' — enviando em instantes.'}
            {' '}Não feche o navegador nem limpe os dados dele.
          </span>
        </p>
      )}
      {semInternet && (
        <p className={`text-xs ${fraco}`}>
          {pacote
            ? `Lista do evento guardada às ${formatarBR(pacote.geradoEm, 'curto')} (${pacote.pessoas} pessoas): o nome aparece na leitura.`
            : 'A lista do evento ainda não foi guardada neste aparelho: a leitura é guardada, mas sem mostrar o nome.'}
        </p>
      )}
      {recusas.length > 0 && (
        <div className={`pt-1.5 border-t ${escuro ? 'border-amber-500/30' : 'border-amber-200'}`}>
          <button type="button" onClick={() => setAbertas(a => !a)} className="w-full flex items-center justify-between gap-2 font-semibold text-left">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              {recusas.length} batida{recusas.length === 1 ? '' : 's'} guardada{recusas.length === 1 ? '' : 's'} não entr{recusas.length === 1 ? 'ou' : 'aram'} — ver
            </span>
            {abertas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {abertas && (
            <ul className="mt-2 space-y-1.5">
              {recusas.map(r => (
                <li key={r.id} className={`rounded-lg px-2.5 py-2 text-xs ${escuro ? 'bg-black/30' : 'bg-white border border-amber-100'}`}>
                  <p className="font-semibold">
                    {r.nome ?? 'Pessoa não identificada'} · {r.momento === 'fim' ? 'Saída' : 'Entrada'} às {formatarBR(r.lidoEm, 'curto')}
                  </p>
                  <p className={`mt-0.5 ${fraco}`}>{r.motivo}</p>
                  <button
                    type="button" onClick={() => void descartarRecusa(r.id)}
                    className="mt-1 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                  >
                    <Check className="w-3 h-3" /> Já resolvi — tirar da lista
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
