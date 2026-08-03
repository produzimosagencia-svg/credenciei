'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import TutorialOverlay from './TutorialOverlay'
import type { TutorialConfig } from './types'

type TutorialContextValue = {
  iniciar: () => void
  ativo: boolean
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

/** Usado pelo botão "Ver tutorial" de cada tela pra reabrir o roteiro na hora. */
export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorial precisa estar dentro de um <TutorialProvider>')
  return ctx
}

function chaveStorage(tutorial: TutorialConfig): string {
  return `credenciei:tutorial:${tutorial.tela}:v${tutorial.versao}`
}

/**
 * Motor reutilizável de tutorial guiado. Cada tela envolve seu conteúdo com
 * <TutorialProvider tutorial={{...}}> e ganha: abertura automática na primeira
 * visita (guardada no localStorage do navegador — nunca toca o banco), botão
 * "Ver tutorial" pra reabrir manualmente (useTutorial()), e reabertura
 * automática de novo quando `versao` sobe (a tela mudou desde a última vez
 * que o usuário viu).
 */
export default function TutorialProvider({
  tutorial, ativo = true, children,
}: {
  tutorial: TutorialConfig
  /** Passe false pra desligar o tutorial (o master não vê tutorial em tela nenhuma). */
  ativo?: boolean
  children: React.ReactNode
}) {
  const [passoAtivo, setPassoAtivo] = useState<number | null>(null)

  useEffect(() => {
    if (!ativo) return
    const visto = localStorage.getItem(chaveStorage(tutorial))
    if (visto) return
    // dá tempo da tela terminar de renderizar antes de medir os alvos
    const t = setTimeout(() => setPassoAtivo(0), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.tela, tutorial.versao, ativo])

  const iniciar = useCallback(() => setPassoAtivo(0), [])

  const finalizar = useCallback(() => {
    localStorage.setItem(chaveStorage(tutorial), '1')
    setPassoAtivo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.tela, tutorial.versao])

  return (
    <TutorialContext.Provider value={{ iniciar, ativo }}>
      {children}
      {ativo && passoAtivo !== null && (
        <TutorialOverlay
          passos={tutorial.passos}
          indice={passoAtivo}
          onMudarIndice={setPassoAtivo}
          onFinalizar={finalizar}
        />
      )}
    </TutorialContext.Provider>
  )
}
