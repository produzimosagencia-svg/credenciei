'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moverFuncionarioDeSetor } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * "Trazer o crachá para esta equipe" (pedido do Juan, 10/10/2026: "quando eu mudar a pessoa de lugar, o QR code
 * precisa ir junto"). O supervisor tem UM crachá por evento, numa das equipes que ele cobre; aqui ele vem para a
 * equipe aberta — o QR é o mesmo, e a área dele passa a ser a desta equipe. É o mesmo "Mover para outro setor".
 */
export default function TrazerCrachaSupervisor({ fichaId, eventoId, fornecedorId, nome }: {
  fichaId: string; eventoId: string; fornecedorId: string; nome: string
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()
  if (!confirmando) {
    return (
      <button type="button" onClick={() => { setErro(null); setConfirmando(true) }} className="text-brand-600 hover:underline text-xs font-semibold">
        Trazer o crachá para esta equipe
      </button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-600">O QR de {nome.split(' ')[0]} passa a ser desta equipe (e desta área).</span>
      <button
        type="button" disabled={pendente} className="btn btn-primario btn-sm"
        onClick={() => iniciar(async () => {
          try {
            await moverFuncionarioDeSetor(fichaId, eventoId, fornecedorId, 'Crachá do supervisor trazido para esta equipe')
            setConfirmando(false)
            router.refresh()
          } catch (e) {
            setErro(mensagemAmigavel(e))
          }
        })}
      >
        {pendente ? 'Trazendo…' : 'Confirmar'}
      </button>
      <button type="button" disabled={pendente} className="btn btn-secundario btn-sm" onClick={() => setConfirmando(false)}>Cancelar</button>
      {erro && <span className="text-red-500">{erro}</span>}
    </span>
  )
}
