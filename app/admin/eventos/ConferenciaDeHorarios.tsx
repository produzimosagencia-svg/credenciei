'use client'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AlertCircle, X } from 'lucide-react'
import { conferirHorariosDoEvento, type ProblemaDeJanela } from '@/lib/janelas'

/**
 * Confere os horários do evento ENQUANTO a pessoa preenche, e explica quando
 * não dá para salvar.
 *
 * Nasceu de um erro real: a saída do evento no Kleber Andrade ficou marcada
 * para 01:30–08:00 do dia 5, quando o show começava às 18:30 daquele dia e a
 * equipe só ia embora na madrugada do dia 6. Os horários estavam certos — o
 * dia é que não. Nada na tela denunciava isso, e o erro só apareceria na
 * madrugada do evento, com mil pessoas tentando bater a saída ao mesmo tempo.
 *
 * ─── A LIÇÃO DA PRIMEIRA VERSÃO ─────────────────────────────────────────────
 *
 * A primeira tentativa barrava o envio calada: `preventDefault` e um scroll
 * discreto até o aviso. Foi pior do que não ter feito nada. O produtor clicava
 * em salvar, a tela não dizia nada, e ele seguia acreditando que tinha salvo —
 * só descobria a verdade se voltasse à tela por acaso. Uma configuração que a
 * pessoa PENSA que salvou é mais perigosa que uma que ela sabe estar errada.
 *
 * Duas coisas mudaram por causa disso:
 *
 *   1. O bloqueio agora ABRE UM MODAL. Não há como confundir com sucesso, e o
 *      texto diz explicitamente que nada foi salvo.
 *
 *   2. A barragem acontece no CLIQUE do botão, não no `submit` do formulário.
 *      Interceptar o submit de uma server action depende de a ordem de
 *      listeners do React continuar a mesma; interceptar o clique não depende
 *      de nada. O `submit` continua barrado como reserva, para a tecla Enter.
 */
export default function ConferenciaDeHorarios() {
  const ancora = useRef<HTMLDivElement>(null)
  const [problemas, setProblemas] = useState<ProblemaDeJanela[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  /*
   * Os listeners são criados uma vez e enxergariam para sempre o valor do
   * primeiro render. Por isso o veredito vive numa ref, não no estado.
   */
  const bloqueadoresRef = useRef<ProblemaDeJanela[]>([])

  useEffect(() => {
    const form = ancora.current?.closest('form')
    if (!form) return

    const revisar = () => {
      const d = new FormData(form)
      const v = (k: string) => (d.get(k) as string | null) || null
      const achados = conferirHorariosDoEvento({
        data_inicio: v('data_inicio'),
        data_fim: v('data_fim'),
        janela_entrada_inicio: v('janela_entrada_inicio'),
        janela_entrada_fim: v('janela_entrada_fim'),
        janela_fim_inicio: v('janela_fim_inicio'),
        janela_fim_fim: v('janela_fim_fim'),
      })
      bloqueadoresRef.current = achados.filter(x => x.bloqueia)
      setProblemas(achados)

      /*
       * O botão já avisa antes do clique.
       *
       * `aria-disabled` e não `disabled`: um botão desabilitado de verdade não
       * emite clique, e sem clique não há como abrir o modal que explica o
       * motivo. A pessoa ficaria diante de um botão morto, sem saber por quê —
       * exatamente o problema que esta tela existe para resolver.
       */
      const botao = form.querySelector<HTMLElement>('button[type="submit"]')
      if (botao) {
        const trava = bloqueadoresRef.current.length > 0
        botao.setAttribute('aria-disabled', String(trava))
        botao.style.opacity = trava ? '0.55' : ''
      }
    }

    const barrar = (e: Event) => {
      if (!bloqueadoresRef.current.length) return
      e.preventDefault()
      e.stopPropagation()
      // Impede também os outros listeners já registrados no mesmo elemento.
      if ('stopImmediatePropagation' in e) (e as Event).stopImmediatePropagation()
      setModalAberto(true)
    }

    // Clique no botão: o caminho normal, e o que não depende do React.
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest('button[type="submit"]')
      if (alvo && form.contains(alvo)) barrar(e)
    }

    form.addEventListener('click', aoClicar, true)
    form.addEventListener('submit', barrar, true) // reserva: tecla Enter
    form.addEventListener('input', revisar)
    form.addEventListener('change', revisar)
    // Fora do render, para o estado inicial não cascatear em cima da montagem.
    const t = setTimeout(revisar, 0)

    return () => {
      clearTimeout(t)
      form.removeEventListener('click', aoClicar, true)
      form.removeEventListener('submit', barrar, true)
      form.removeEventListener('input', revisar)
      form.removeEventListener('change', revisar)
    }
  }, [])

  const bloqueios = problemas.filter(p => p.bloqueia)
  const alertas = problemas.filter(p => !p.bloqueia)

  const fechar = () => {
    setModalAberto(false)
    // Leva de volta ao ponto em que se corrige, não só fecha. O campo da saída
    // é o alvo preferido; se ele não estiver na tela, o bloco de avisos serve.
    const form = ancora.current?.closest('form')
    const alvo = form?.querySelector('[name="janela_fim_inicio"]') ?? ancora.current
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div ref={ancora}>
      {problemas.length > 0 && (
        <div className="space-y-2">
          {problemas.map((p, i) => (
            <div
              key={i}
              className={`rounded-xl p-3 flex items-start gap-2 border ${
                p.bloqueia ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              {p.bloqueia
                ? <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${p.bloqueia ? 'text-red-800' : 'text-amber-800'}`}>
                  {p.bloqueia ? 'Não dá para salvar assim' : 'Confira este ponto'}
                </p>
                <p className={`text-xs mt-0.5 ${p.bloqueia ? 'text-red-700' : 'text-amber-700'}`}>
                  {p.mensagem}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">

            <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-red-900">Nada foi salvo</h2>
                {/*
                  * A primeira linha diz o ESTADO, não o problema. Era isso que
                  * faltava: a pessoa saía achando que tinha salvo.
                  */}
                <p className="text-red-700 text-xs mt-0.5">
                  As alterações continuam aqui na tela. Corrija os horários abaixo e salve de novo.
                </p>
              </div>
              <button onClick={fechar} aria-label="Fechar" className="p-1 -mr-1 text-red-400 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {bloqueios.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold
                                   flex items-center justify-center shrink-0 mt-px tabular-nums">
                    {i + 1}
                  </span>
                  <p className="text-slate-700 text-sm">{p.mensagem}</p>
                </div>
              ))}

              {/* Os alertas entram como recado, sem peso de erro: eles não
                  impedem nada, e misturá-los faria a pessoa procurar problema
                  onde talvez não haja. */}
              {alertas.length > 0 && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">
                    Não impede salvar, mas vale conferir
                  </p>
                  {alertas.map((p, i) => (
                    <p key={i} className="text-slate-500 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      {p.mensagem}
                    </p>
                  ))}
                </div>
              )}

              <button onClick={fechar} className="btn btn-primario btn-lg w-full mt-1">
                Corrigir os horários
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
