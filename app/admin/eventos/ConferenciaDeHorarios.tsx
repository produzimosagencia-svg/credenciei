'use client'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import { conferirHorariosDoEvento, type ProblemaDeJanela } from '@/lib/janelas'

/**
 * Confere os horários do evento ENQUANTO a pessoa preenche.
 *
 * Nasceu de um erro real: a saída do evento no Kleber Andrade ficou marcada
 * para 01:30–08:00 do dia 5, quando o show começava às 18:30 daquele dia e a
 * equipe só ia embora na madrugada do dia 6. Os horários estavam certos — o
 * dia é que não. Nada na tela denunciava isso, e o erro só apareceria na
 * madrugada do evento, com mil pessoas tentando bater a saída ao mesmo tempo.
 *
 * Avisar aqui, e não no envio, é a diferença entre corrigir com o seletor
 * aberto na frente e descobrir depois de salvar. Por isso o componente lê o
 * formulário inteiro a cada tecla em vez de validar campo por campo: o erro
 * não está em nenhum campo isolado, está na RELAÇÃO entre eles.
 *
 * Escuta o formulário por evento em vez de receber os valores por props para
 * não precisar transformar a página inteira em client component — ela é um
 * server component e deve continuar sendo.
 */
export default function ConferenciaDeHorarios() {
  const ancora = useRef<HTMLDivElement>(null)
  const [problemas, setProblemas] = useState<ProblemaDeJanela[]>([])
  // Lido pelo `submit` sem passar por estado: o listener é criado uma vez e
  // enxergaria para sempre o valor do primeiro render.
  const bloqueiaRef = useRef(false)

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
      bloqueiaRef.current = achados.some(x => x.bloqueia)
      setProblemas(achados)
    }

    /*
     * Impedir o envio é a parte que evita o prejuízo. O aviso sozinho seria
     * ignorado por quem está com pressa — e quem configura evento está sempre
     * com pressa.
     */
    const barrar = (e: Event) => {
      if (!bloqueiaRef.current) return
      e.preventDefault()
      e.stopPropagation()
      ancora.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    form.addEventListener('input', revisar)
    form.addEventListener('change', revisar)
    form.addEventListener('submit', barrar, true) // captura: antes da action
    // Fora do render, para o estado inicial não cascatear em cima da montagem.
    const t = setTimeout(revisar, 0)

    return () => {
      clearTimeout(t)
      form.removeEventListener('input', revisar)
      form.removeEventListener('change', revisar)
      form.removeEventListener('submit', barrar, true)
    }
  }, [])

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
    </div>
  )
}
