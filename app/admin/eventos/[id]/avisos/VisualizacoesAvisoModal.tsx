'use client'
import { useEffect, useState } from 'react'
import { X, Loader2, AlertTriangle, Users } from 'lucide-react'
import { obterVisualizacoesDoAviso, type VisualizacaoAviso } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'
import { formatarBR } from '@/lib/tz'
import { EmptyState } from '@/components/ui/Superficie'

/**
 * "Ver quem já visualizou" — busca só quando abre, uma vez, mesmo padrão
 * preguiçoso do histórico em `FuncionarioDetalheModal.tsx`. Controlado pelo
 * pai (`AcoesAviso.tsx`): quem abre é um item de um menu de ações, não o
 * próprio botão deste componente.
 */
export default function VisualizacoesAvisoModal({
  avisoId, eventoId, titulo, open, onClose,
}: {
  avisoId: string
  eventoId: string
  titulo: string
  open: boolean
  onClose: () => void
}) {
  const [visualizacoes, setVisualizacoes] = useState<VisualizacaoAviso[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open || visualizacoes !== null) return
    obterVisualizacoesDoAviso(avisoId, eventoId)
      .then(setVisualizacoes)
      .catch(e => setErro(mensagemAmigavel(e)))
  }, [open, avisoId, eventoId, visualizacoes])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="text-slate-800 font-bold truncate">Quem já visualizou</h2>
            <p className="text-slate-400 text-xs mt-0.5 truncate">{titulo}</p>
          </div>
          <button onClick={onClose} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          {erro ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
            </div>
          ) : visualizacoes === null ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-10">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : !visualizacoes.length ? (
            <EmptyState icone={<Users className="w-7 h-7" />} titulo="Ninguém viu este aviso ainda" />
          ) : (
            <ul className="space-y-1">
              {visualizacoes.map((v, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-sm">
                  <span className="text-slate-700 truncate">{v.nome}</span>
                  <span className="text-slate-400 text-xs shrink-0 flex items-center gap-2">
                    <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-100">{v.via === 'credencial' ? 'credencial' : 'painel'}</span>
                    {formatarBR(v.em, 'curto')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
