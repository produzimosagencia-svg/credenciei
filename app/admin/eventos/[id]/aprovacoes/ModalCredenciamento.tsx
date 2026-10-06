'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { User, X } from 'lucide-react'
import { detalheDoCredenciamento } from '@/lib/actions'
import type { DetalheCredenciamento } from '@/lib/escala'
import { formatCpf, formatTelefone } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { ROTULO_STATUS_CREDENCIAMENTO, TOM_STATUS_CREDENCIAMENTO } from '@/lib/credenciamento-constantes'
import { Badge } from '@/components/ui/Superficie'
import { LoadingConteudo } from '@/components/LogoLoading'
import AprovacaoComDias from '@/components/AprovacaoComDias'

const ROTULO_ORIGEM: Record<string, string> = {
  formulario: 'Link (formulário)',
  portaria: 'Portaria (cartaz)',
  planilha: 'Planilha',
}

/**
 * O que abre ao clicar no NOME em "Aguardando aprovação" (pedido do Juan,
 * 06/10/2026): os dados da pessoa, claros, e os dias que ela pediu — com a
 * decisão ali mesmo (`AprovacaoComDias`). Carrega na hora de abrir: a tabela
 * só tem o resumo, e a escala pode ter mudado desde que a página carregou.
 *
 * Portal pelo mesmo motivo de components/ConfirmModal.tsx (a tabela tem
 * `overflow`). No celular sobe de baixo, como folha.
 */
export default function ModalCredenciamento({
  funcionarioId, fornecedorId, eventoId, nome, onFechar,
}: {
  funcionarioId: string
  fornecedorId: string
  eventoId: string
  nome: string
  onFechar: () => void
}) {
  const router = useRouter()
  const [detalhe, setDetalhe] = useState<DetalheCredenciamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    detalheDoCredenciamento(funcionarioId, fornecedorId, eventoId)
      .then(r => {
        if (!vivo) return
        if (r.ok) setDetalhe(r.detalhe)
        else setErro(r.error)
      })
      .catch(() => { if (vivo) setErro('Não consegui carregar — confira a internet e tente de novo.') })
    return () => { vivo = false }
  }, [funcionarioId, fornecedorId, eventoId])

  const concluido = () => {
    onFechar()
    router.refresh()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          {detalhe?.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detalhe.fotoUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-brand-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 leading-tight">{detalhe?.nome ?? nome}</h3>
            {detalhe && (
              <div className="mt-1">
                <Badge tom={TOM_STATUS_CREDENCIAMENTO[detalhe.status]}>{ROTULO_STATUS_CREDENCIAMENTO[detalhe.status]}</Badge>
              </div>
            )}
          </div>
          <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {erro ? (
          <p className="text-erro-600 text-sm">{erro}</p>
        ) : !detalhe ? (
          <LoadingConteudo />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border-b border-slate-100 pb-4">
              <Dado rotulo="CPF" valor={formatCpf(detalhe.cpf)} />
              <Dado rotulo="Telefone" valor={detalhe.telefone ? formatTelefone(detalhe.telefone) : '—'} />
              <Dado rotulo="Cidade" valor={detalhe.cidade ?? '—'} />
              <Dado rotulo="Função" valor={detalhe.cargo ?? '—'} />
              <Dado rotulo="Fornecedor" valor={detalhe.setorNome} />
              {detalhe.subeventoNome && <Dado rotulo="Subgrupo" valor={detalhe.subeventoNome} />}
              <Dado rotulo="Origem" valor={ROTULO_ORIGEM[detalhe.origem] ?? detalhe.origem} />
              <Dado rotulo="Recebido em" valor={formatarBR(detalhe.criadoEm, 'curto')} />
            </dl>

            <AprovacaoComDias
              funcionarioId={funcionarioId} fornecedorId={fornecedorId} eventoId={eventoId}
              detalhe={detalhe} onConcluido={concluido}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</dt>
      <dd className="text-slate-700 font-medium tabular-nums truncate">{valor}</dd>
    </div>
  )
}
