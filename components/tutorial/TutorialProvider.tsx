'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import TutorialOverlay from './TutorialOverlay'
import type { TutorialConfig } from './types'

type TutorialContextValue = {
  iniciar: () => void
  ativo: boolean
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

/**
 * Quem é o usuário logado, pro histórico de "já vi este tutorial" ser dele e
 * não do navegador. O AppShell publica o id aqui uma vez e todas as telas do
 * painel herdam — sem precisar passar o id página por página.
 */
const TutorialUsuarioContext = createContext<string | null>(null)

export function TutorialUsuarioProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return <TutorialUsuarioContext.Provider value={id}>{children}</TutorialUsuarioContext.Provider>
}

/** Usado pelo botão "Ver tutorial" de cada tela pra reabrir o roteiro na hora. */
export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorial precisa estar dentro de um <TutorialProvider>')
  return ctx
}

function chaveStorage(tutorial: TutorialConfig, usuarioId: string): string {
  return `credenciei:tutorial:${usuarioId}:${tutorial.tela}:v${tutorial.versao}`
}

/**
 * Motor reutilizável de tutorial guiado. Cada tela envolve seu conteúdo com
 * <TutorialProvider tutorial={{...}}> e ganha: abertura automática na primeira
 * visita, botão "Ver tutorial" pra reabrir manualmente (useTutorial()), e
 * reabertura automática quando `versao` sobe (a tela mudou desde a última vez
 * que o usuário viu).
 *
 * O histórico fica no localStorage, separado por usuário: quem já viu é a
 * pessoa, não o navegador — dois usuários no mesmo computador não herdam o
 * tutorial um do outro.
 */
export default function TutorialProvider({
  tutorial, ativo = true, usuarioId, children,
}: {
  tutorial: TutorialConfig
  /** Passe false pra desligar o tutorial (o master não vê tutorial em tela nenhuma). */
  ativo?: boolean
  /** Só nas telas públicas, que não têm login: identifica a pessoa pelo token. */
  usuarioId?: string
  children: React.ReactNode
}) {
  const [passoAtivo, setPassoAtivo] = useState<number | null>(null)
  const usuarioDoContexto = useContext(TutorialUsuarioContext)
  const dono = usuarioId ?? usuarioDoContexto ?? 'anon'

  useEffect(() => {
    if (!ativo) return
    const visto = localStorage.getItem(chaveStorage(tutorial, dono))
    if (visto) return
    // dá tempo da tela terminar de renderizar antes de medir os alvos
    const t = setTimeout(() => setPassoAtivo(0), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.tela, tutorial.versao, ativo, dono])

  const iniciar = useCallback(() => setPassoAtivo(0), [])

  const finalizar = useCallback(() => {
    localStorage.setItem(chaveStorage(tutorial, dono), '1')
    setPassoAtivo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.tela, tutorial.versao, dono])

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
