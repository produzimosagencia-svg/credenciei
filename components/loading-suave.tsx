'use client'
/**
 * O comportamento "suave" do loading — a parte que precisa de estado, então é
 * client. O visual (a marca girando) mora em components/LogoLoading.tsx, que é
 * server-safe. Aqui só as REGRAS de UX:
 *
 *   8. operação rápida não pisca loading nenhum   → `atrasoMs`
 *   9. operação que apareceu fica visível de verdade → `minimoMs`
 *   4. ação crítica não aceita clique duplo        → <BotaoOcupado disabled>
 *  10. erro tira o loading                          → é o `ocupado` do chamador
 *                                                     que volta a false
 *
 * Novo módulo importa daqui e não reinventa. Ver components/LogoLoading.tsx
 * pro visual e o commit da revisão de loading (10/09/2026).
 */
import { useEffect, useRef, useState } from 'react'
import { LogoLoading, LoadingTela } from './LogoLoading'

/**
 * Transforma um booleano "está ocupado" cru num "deve MOSTRAR o loading",
 * aplicando anti-flicker e tempo mínimo visível.
 *
 * - `atrasoMs` (140): só mostra depois de ocupado por esse tempo. Operação de
 *   80ms não chega a piscar nada.
 * - `minimoMs` (360): uma vez mostrado, fica pelo menos esse tempo — evita o
 *   estrobo de "apareceu e sumiu num frame".
 */
export function useLoadingSuave(
  ocupado: boolean,
  { atrasoMs = 140, minimoMs = 360 }: { atrasoMs?: number; minimoMs?: number } = {},
): boolean {
  const [visivel, setVisivel] = useState(false)
  const mostradoEm = useRef<number>(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    if (ocupado) {
      timer = setTimeout(() => {
        mostradoEm.current = Date.now()
        setVisivel(true)
      }, atrasoMs)
    } else if (visivel) {
      const passou = Date.now() - mostradoEm.current
      timer = setTimeout(() => setVisivel(false), Math.max(0, minimoMs - passou))
    }

    return () => clearTimeout(timer)
  }, [ocupado, visivel, atrasoMs, minimoMs])

  return visivel
}

/**
 * O loading de tela cheia, mas SEMPRE montado e controlado por `ativo` — pra
 * o anti-flicker funcionar (um `{pending && <LoadingTela/>}` monta/desmonta e
 * não dá pra medir o tempo). Troque
 *
 *   {isPending && <LoadingTela mensagem="Salvando..." />}
 * por
 *   <LoadingTelaQuando ativo={isPending} mensagem="Salvando..." />
 */
export function LoadingTelaQuando({
  ativo, mensagem, sobreConteudo, atrasoMs, minimoMs,
}: {
  ativo: boolean
  mensagem?: string
  sobreConteudo?: boolean
  atrasoMs?: number
  minimoMs?: number
}) {
  const mostrar = useLoadingSuave(ativo, { atrasoMs, minimoMs })
  if (!mostrar) return null
  return <LoadingTela mensagem={mensagem} sobreConteudo={sobreConteudo} />
}

/**
 * Botão que já cuida do estado ocupado: trava clique duplo (rule 4), troca o
 * `icone` pela marca girando enquanto processa (rule 3), e volta ao normal
 * sozinho quando `ocupado` vira false — sucesso OU erro (rule 10). O
 * anti-flicker vale aqui também: clique que resolve em <140ms não pisca nada.
 *
 *   <BotaoOcupado
 *     ocupado={isPending}
 *     icone={<Save className="w-4 h-4" />}
 *     onClick={salvar}
 *     className="btn btn-primario"
 *   >
 *     Salvar
 *   </BotaoOcupado>
 *
 * Sem `icone`, a marca entra antes do texto quando ocupado.
 */
export function BotaoOcupado({
  ocupado, icone, children, disabled, tamanhoLoading = 'xs', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ocupado: boolean
  /** O ícone normal do botão — trocado pela marca enquanto processa. */
  icone?: React.ReactNode
  tamanhoLoading?: 'xs' | 'sm'
}) {
  const mostrar = useLoadingSuave(ocupado, { minimoMs: 250 })
  return (
    <button {...props} disabled={disabled || ocupado} aria-busy={mostrar || undefined}>
      {mostrar ? <LogoLoading tamanho={tamanhoLoading} /> : icone}
      {children}
    </button>
  )
}
