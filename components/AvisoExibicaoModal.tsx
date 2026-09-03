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

  /*
   * Três camadas empilhadas, com o BOTÃO FIXO no rodapé.
   *
   * Antes o modal não tinha teto de altura nem rolagem: com aviso longo
   * (e os avisos do evento são longos — passo a passo de credenciamento,
   * o que acontece se não bater o meio) ele crescia além da tela e
   * empurrava o "Entendi" pra fora. Quem estava na recepção preenchendo
   * o cadastro de quem acabou de chegar ficava com a tela tampada e sem
   * como fechar (relato do Juan, 03/09/2026).
   *
   * Agora quem rola é só o TEXTO (`flex-1 overflow-y-auto`); cabeçalho e
   * botão ficam presos. O botão nunca sai de alcance, não importa o
   * tamanho do aviso — e no celular ele fica na altura do polegar.
   */
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden">
        {/* Cabeçalho compacto: era um bloco alto com ícone grande, e num
            aviso longo ele custava espaço que o texto precisava. */}
        <div className="bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-3 flex items-center gap-2.5 shrink-0">
          <Megaphone className="w-4 h-4 text-white shrink-0" />
          <p className="text-white text-xs uppercase tracking-widest font-semibold">Aviso importante</p>
          {avisos.length > 1 && (
            <span className="ml-auto text-brand-100/90 text-2xs shrink-0">{indice + 1} de {avisos.length}</span>
          )}
        </div>

        {/* O único pedaço que rola. */}
        <div className="px-4 py-4 overflow-y-auto flex-1">
          <h2 className="text-slate-800 font-bold text-base leading-snug">{aviso.titulo}</h2>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed whitespace-pre-wrap">{aviso.mensagem}</p>
        </div>

        {/* Rodapé preso: o botão está sempre à vista e à mão. */}
        <div className="px-4 py-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={confirmar}
            disabled={isPending}
            className="btn btn-primario w-full justify-center py-3 text-base disabled:opacity-60"
          >
            {isPending ? 'Um instante…' : 'Entendi'}
          </button>
        </div>
      </div>
    </div>
  )
}
