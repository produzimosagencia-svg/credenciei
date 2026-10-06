'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { detalheDoCredenciamento } from '@/lib/actions'
import type { DetalheCredenciamento } from '@/lib/escala'
import AprovacaoComDias from '@/components/AprovacaoComDias'

/**
 * "Dias de trabalho" no modal do funcionário (clique no nome, na equipe do
 * fornecedor) — o mesmo bloco do modal de "Aguardando aprovação"
 * (`AprovacaoComDias`): pendente aprova/nega ali mesmo, aprovado ajusta os
 * dias.
 *
 * Carrega sozinho ao abrir e só desenha alguma coisa em evento com escala por
 * dia — o modal serve todos os eventos, e na imensa maioria isto não aparece.
 * Quem não tem a régua de aprovar também não vê nada (o servidor recusa).
 */
export default function SecaoEscala({
  funcionarioId, fornecedorId, eventoId,
}: {
  funcionarioId: string
  fornecedorId: string
  eventoId: string
}) {
  const router = useRouter()
  const [detalhe, setDetalhe] = useState<DetalheCredenciamento | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vivo = true
    detalheDoCredenciamento(funcionarioId, fornecedorId, eventoId)
      .then(r => { if (vivo && r.ok && r.detalhe.usaEscala) setDetalhe(r.detalhe) })
      .catch(() => { /* sem a seção — o resto do modal segue */ })
    return () => { vivo = false }
  }, [funcionarioId, fornecedorId, eventoId, recarga])

  if (!detalhe) return null

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <AprovacaoComDias
        // Remonta quando chega a escala nova (a grade nasce do que vale agora).
        key={`${detalhe.status}-${detalhe.escala?.decididaEm ?? ''}`}
        funcionarioId={funcionarioId} fornecedorId={fornecedorId} eventoId={eventoId}
        detalhe={detalhe}
        onConcluido={() => { setRecarga(n => n + 1); router.refresh() }}
      />
    </div>
  )
}
