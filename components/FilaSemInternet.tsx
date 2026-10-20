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
 *
 * CORES FIXAS (Juan, 19/10/2026: "não ficou legal essa mensagem, o modal amarelo não ficou claro"): as cores do Tailwind
 * (amber-100, amber-200…) mudam com o tema e, no tema escuro, viram âmbar quase transparente — texto escuro sobre fundo
 * escuro. Aqui é uma caixa âmbar SÓLIDA com texto quase preto (contraste acima de 8:1), igual em qualquer tema e tela.
 */
export default function AvisoFilaSemInternet({ estado }: { estado: EstadoDaFila }) {
  const [abertas, setAbertas] = useState(false)
  const { semInternet, pendentes, recusas, enviando, pacote } = estado
  if (!semInternet && !pendentes && !recusas.length) return null

  return (
    <div className="w-full space-y-3 rounded-2xl bg-[#fbbf24] p-4 text-left text-[#111827]" role="status" aria-live="polite">
      {semInternet && (
        <div className="flex items-start gap-2.5">
          <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-base font-extrabold leading-snug">SEM INTERNET</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug">
              Pode continuar: as batidas ficam guardadas neste aparelho e sobem sozinhas quando a internet voltar.
            </p>
          </div>
        </div>
      )}
      {pendentes > 0 && (
        <div className="flex items-start gap-2.5">
          <CloudUpload className={`mt-0.5 h-5 w-5 shrink-0 ${enviando ? 'animate-pulse' : ''}`} />
          <p className="text-sm font-semibold leading-snug">
            <strong className="font-extrabold">{pendentes} batida{pendentes === 1 ? '' : 's'} guardada{pendentes === 1 ? '' : 's'}</strong> neste aparelho
            {enviando ? ' — enviando…' : semInternet ? ' — esperando a internet.' : ' — enviando em instantes.'}
            {' '}Não feche o navegador nem limpe os dados dele.
          </p>
        </div>
      )}
      {semInternet && (
        <p className="text-sm font-medium leading-snug text-[#374151]">
          {pacote
            ? `Lista do evento guardada às ${formatarBR(pacote.geradoEm, 'curto')} (${pacote.pessoas} pessoas): o nome aparece na leitura.`
            : 'A lista do evento ainda não foi guardada neste aparelho: a leitura é guardada, mas sem mostrar o nome.'}
        </p>
      )}
      {recusas.length > 0 && (
        <div className="border-t-2 border-[#111827]/20 pt-3">
          <button type="button" onClick={() => setAbertas(a => !a)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-extrabold">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#b91c1c]" />
              {recusas.length} batida{recusas.length === 1 ? '' : 's'} guardada{recusas.length === 1 ? '' : 's'} não entr{recusas.length === 1 ? 'ou' : 'aram'} — ver
            </span>
            {abertas ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {abertas && (
            <ul className="mt-2 space-y-2">
              {recusas.map(r => (
                <li key={r.id} className="rounded-xl bg-white px-3 py-2.5 text-[#111827]">
                  <p className="text-sm font-extrabold">
                    {r.nome ?? 'Pessoa não identificada'} · {r.momento === 'fim' ? 'Saída' : 'Entrada'} às {formatarBR(r.lidoEm, 'curto')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium leading-snug text-[#374151]">{r.motivo}</p>
                  <button
                    type="button" onClick={() => void descartarRecusa(r.id)}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm font-bold text-[#1d4ed8] underline underline-offset-4"
                  >
                    <Check className="h-4 w-4" /> Já resolvi — tirar da lista
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
