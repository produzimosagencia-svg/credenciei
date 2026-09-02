'use client'
import { useState, useTransition } from 'react'
import { Megaphone } from 'lucide-react'
import { visualizarAvisoPorToken, visualizarAvisoSupervisor } from '@/lib/actions'
import type { AvisoPendente } from '@/lib/avisos'

/**
 * O modal que o FUNCIONÁRIO (credencial pública) ou o SUPERVISOR (painel do
 * setor) vê ao entrar no sistema, quando há aviso pendente pra ele.
 *
 * Cara de comunicado — não de erro: ícone e cor de marca, não vermelho, e
 * um único botão "Entendi". Se houver mais de um aviso elegível, mostra um
 * de cada vez ("1 de 2"), confirmando e avançando — nunca todos empilhados.
 */
export default function AvisoExibicaoModal(
  props:
    | { avisos: AvisoPendente[]; contexto: 'funcionario'; token: string }
    | { avisos: AvisoPendente[]; contexto: 'supervisor'; eventoId: string },
) {
  const [indice, setIndice] = useState(0)
  const [fechado, setFechado] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { avisos } = props
  if (fechado || indice >= avisos.length) return null
  const aviso = avisos[indice]

  const confirmar = () => {
    startTransition(async () => {
      try {
        if (props.contexto === 'funcionario') {
          await visualizarAvisoPorToken(aviso.id, props.token)
        } else {
          await visualizarAvisoSupervisor(aviso.id, props.eventoId)
        }
      } catch {
        // Falhou o registro de "visualizado" — não trava a pessoa aqui: ela
        // já leu o aviso, é isso que importa. Na pior das hipóteses ele
        // aparece de novo no próximo acesso.
      } finally {
        if (indice + 1 >= avisos.length) setFechado(true)
        else setIndice(i => i + 1)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-r from-brand-500 to-brand-600 px-6 pt-6 pb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-2xl mb-3">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <p className="text-brand-100 text-xs uppercase tracking-widest font-semibold">Aviso importante</p>
          {avisos.length > 1 && (
            <p className="text-brand-100/80 text-2xs mt-1">{indice + 1} de {avisos.length}</p>
          )}
        </div>

        <div className="px-6 py-6 -mt-4">
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 px-5 py-5 text-center">
            <h2 className="text-slate-800 font-bold text-lg leading-snug">{aviso.titulo}</h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{aviso.mensagem}</p>
          </div>

          <button
            type="button"
            onClick={confirmar}
            disabled={isPending}
            className="btn btn-primario w-full justify-center mt-5 disabled:opacity-60"
          >
            {isPending ? 'Um instante…' : 'Entendi'}
          </button>
        </div>
      </div>
    </div>
  )
}
