'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { seguirOrganizacaoNoEvento } from '@/lib/actions'

/** Apaga a configuração própria do evento — ele volta a seguir a organização. */
export default function SeguirOrganizacao({ eventoId }: { eventoId: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()
  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={pendente}
        className="btn btn-secundario btn-sm"
        onClick={() => iniciar(async () => {
          setErro(null)
          const r = await seguirOrganizacaoNoEvento(eventoId)
          if ('erro' in r) { setErro(r.erro); return }
          router.refresh()
        })}
      >
        {pendente ? 'Aguarde…' : 'Voltar a seguir a organização'}
      </button>
      {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
    </div>
  )
}
