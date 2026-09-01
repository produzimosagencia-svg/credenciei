'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, X, Loader2 } from 'lucide-react'
import { trocarSetorAtivo } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

export type SetorDoSupervisor = { id: string; nome: string; evento_id: string }

/**
 * "Meus setores" — o item de menu de quem supervisiona mais de um.
 *
 * Fica no menu lateral, e não escondido dentro da tela do setor, porque é
 * navegação: a pessoa troca de setor de qualquer lugar do sistema, não só de
 * dentro de um deles.
 *
 * Trocar aqui muda o setor ATIVO do perfil (ver `trocarSetorAtivo`) — é isso
 * que faz pendências, atividades e "minha equipe" no scanner seguirem junto,
 * sem que nenhuma dessas telas precise saber que existe mais de um setor.
 */
export default function MeusSetores({
  setores, atualId, onNavigate,
}: {
  setores: SetorDoSupervisor[]
  /** O setor que está ativo agora. Marcado com o visto na lista. */
  atualId: string | null
  /** Fecha o menu lateral no celular, onde ele cobre a tela inteira. */
  onNavigate?: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Com um setor só isto seria um menu de uma opção — ruído, não escolha.
  if (setores.length < 2) return null

  const escolher = (setor: SetorDoSupervisor) => {
    setErro(null)
    startTransition(async () => {
      /*
       * Navega primeiro: a tela do setor já aceita qualquer setor vinculado,
       * então a ida não depende da escrita — e é ela que a pessoa espera ver.
       * A marcação do setor ativo vem logo atrás, para as outras telas
       * seguirem junto.
       */
      router.push(`/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}`)
      setAberto(false)
      onNavigate?.()
      try {
        await trocarSetorAtivo(setor.id)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      <button onClick={() => setAberto(true)} className="menu-item w-full text-left">
        <Building2 className="w-4 h-4 shrink-0" />
        Meus setores
        <span className="ml-auto text-2xs opacity-60 tabular-nums">{setores.length}</span>
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => !isPending && setAberto(false)}
        >
          <div className="overlay-fade-in absolute inset-0 bg-black/50" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-slate-800 font-bold">Meus setores</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Você supervisiona {setores.length} setores. Escolha qual quer ver.
                </p>
              </div>
              <button
                onClick={() => setAberto(false)}
                disabled={isPending}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2">
              {setores.map(s => {
                const ativo = s.id === atualId
                return (
                  <button
                    key={s.id}
                    onClick={() => escolher(s)}
                    disabled={isPending}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-3 rounded-xl transition-colors disabled:opacity-50 ${
                      ativo ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className={`w-4 h-4 shrink-0 ${ativo ? 'text-brand-500' : 'text-slate-300'}`} />
                    <span className={`flex-1 truncate text-sm ${ativo ? 'text-brand-700 font-semibold' : 'text-slate-700'}`}>
                      {s.nome.trim()}
                    </span>
                    {isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300 shrink-0" />
                      : ativo && <Check className="w-4 h-4 text-brand-500 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {erro && <p className="text-red-500 text-xs px-5 pb-4">{erro}</p>}
          </div>
        </div>
      )}
    </>
  )
}
