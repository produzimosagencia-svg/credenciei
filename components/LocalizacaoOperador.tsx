'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

/**
 * A localização do APARELHO DO OPERADOR enquanto o leitor está aberto (pedido do Juan, 08/10/2026).
 *
 * Toda leitura do scanner (QR e rosto) e todo Registro de ponto mandam junto onde o aparelho estava — é o que
 * prova, depois, que a leitura aconteceu no local do evento. O operador é OBRIGADO a ter a localização ligada:
 * negada ou desligada, o leitor não abre (`BloqueioSemLocalizacao`). O colaborador não vê nada disto — esta tela é
 * só a de quem opera.
 *
 * Usa `watchPosition`: o GPS fica aquecido e cada leitura pega a posição mais recente na hora, sem esperar.
 */
export type PosicaoOperador = { latitude: number; longitude: number; precisao: number | null }
type Estado = 'carregando' | 'ok' | 'negada' | 'indisponivel'

const VALIDADE_MS = 2 * 60 * 1000

export function useLocalizacaoOperador() {
  const [estado, setEstado] = useState<Estado>('carregando')
  const [jaTeveSinal, setJaTeveSinal] = useState(false)
  const ultima = useRef<{ pos: PosicaoOperador; em: number } | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const t = setTimeout(() => setEstado('indisponivel'), 0)
      return () => clearTimeout(t)
    }
    const id = navigator.geolocation.watchPosition(
      p => {
        ultima.current = { pos: { latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy ?? null }, em: Date.now() }
        setEstado('ok')
        setJaTeveSinal(true)
      },
      erro => setEstado(erro.code === erro.PERMISSION_DENIED ? 'negada' : 'indisponivel'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [tentativa])

  /** A posição mais recente (até 2 min), ou `null`. Leitura com GPS momentaneamente sem sinal segue — o servidor marca "sem localização". */
  const atual = useCallback((): PosicaoOperador | null => {
    const u = ultima.current
    return u && Date.now() - u.em < VALIDADE_MS ? u.pos : null
  }, [])

  const tentarDeNovo = useCallback(() => { setEstado('carregando'); setTentativa(t => t + 1) }, [])

  /*
   * Bloqueia só quando a localização foi NEGADA ou o aparelho não tem GPS. Sinal fraco por um instante
   * ('indisponivel' depois de já ter funcionado) não trava o portão: a leitura vai sem posição e fica marcada.
   */
  const bloqueado = estado === 'negada' || (estado === 'indisponivel' && !jaTeveSinal)
  return { estado, atual, bloqueado, tentarDeNovo }
}

/** Tela que cobre o leitor enquanto a localização do aparelho do operador não está ligada. */
export function BloqueioSemLocalizacao({ estado, onTentar }: { estado: Estado; onTentar: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/95 flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center text-white space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
          <MapPin className="w-7 h-7" />
        </div>
        <p className="text-lg font-bold">Ligue a localização do aparelho</p>
        <p className="text-white/70 text-sm leading-relaxed">
          {estado === 'negada'
            ? 'O leitor precisa da localização para funcionar. Permita a localização para este site nas configurações do navegador e toque em Tentar de novo.'
            : 'Não foi possível obter a localização. Ligue o GPS do aparelho e toque em Tentar de novo.'}
        </p>
        <button type="button" onClick={onTentar} className="btn btn-primario w-full">Tentar de novo</button>
      </div>
    </div>
  )
}
