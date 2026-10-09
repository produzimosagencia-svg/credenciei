'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, Check, AlertCircle, Save } from 'lucide-react'
import { salvarConfiguracaoDoAutoatendimento, type ConfiguracaoDoAutoatendimento as Config } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'
import DateTimePicker from '@/components/DateTimePicker'
import { cruzaMeiaNoite } from '@/lib/autoatendimento-regras'

/**
 * Autoatendimento fora do horário da portaria — liga/desliga, horário e EM QUAIS DIAS.
 *
 * Mesmo padrão de `ConfiguracaoDoMeio.tsx` (pedido do Juan, 08/10/2026: "precisa seguir o padrão de layout do
 * sistema"): seção própria em Editar evento, com botão de salvar dela mesma — não depende do produtor mexer em
 * mais nada do formulário grande.
 *
 * "Precisa ter como colocar mais de um dia" (mesmo pedido): o horário (início/fim) é um só pro evento inteiro,
 * mas QUAIS dias usam o recurso se marca dia a dia — nem toda montagem/desmontagem precisa. O dia principal do
 * evento nunca aparece pra marcar: nele é sempre só o operador, sem exceção (ver `registrarPresencaLivre`).
 */
export default function ConfiguracaoDoAutoatendimento({ eventoId, config }: { eventoId: string; config: Config }) {
  const [habilitado, setHabilitado] = useState(config.habilitado)
  const [inicio, setInicio] = useState(config.inicio)
  const [fim, setFim] = useState(config.fim)
  const [dias, setDias] = useState<Set<string>>(() => new Set(config.dias.filter(d => d.habilitado).map(d => d.data)))
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const alternarDia = (data: string) => {
    setFeito(null)
    setDias(atual => {
      const proximo = new Set(atual)
      if (proximo.has(data)) proximo.delete(data)
      else proximo.add(data)
      return proximo
    })
  }

  const todosDias = dias.size === config.dias.length && config.dias.length > 0
  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

  const salvar = () => {
    setErro(null)
    setFeito(null)
    if (habilitado && (!inicio || !fim)) {
      setErro('Informe o horário de início e de fim.')
      return
    }
    startTransition(async () => {
      try {
        const r = await salvarConfiguracaoDoAutoatendimento(eventoId, { habilitado, inicio, fim, dias: [...dias] })
        if (!r.ok) { setErro(r.erro); return }
        setFeito(
          !habilitado
            ? 'Autoatendimento desligado neste evento.'
            : dias.size === 0
              ? 'Ligado, mas sem nenhum dia marcado — o botão não aparece pro operador em dia nenhum ainda.'
              : `Ligado, das ${inicio} às ${fim}${cruzaMeiaNoite(inicio, fim) ? ' do dia seguinte' : ''}, em ${dias.size} dia(s).`,
        )
        router.refresh()
      } catch (e: unknown) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
      <label htmlFor="autoatendimento_habilitado" className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          id="autoatendimento_habilitado"
          checked={habilitado}
          onChange={e => { setFeito(null); setHabilitado(e.target.checked) }}
          className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-slate-800 font-semibold text-sm flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-brand-500 shrink-0" /> Autoatendimento fora do horário da portaria
          </p>
          <p className="text-slate-600 text-xs mt-1">
            Permite que o operador de portão libere, ao ir embora, o colaborador bater a própria entrada/saída
            pelo celular (com geolocalização obrigatória) até o horário de fim abaixo — depois disso volta
            automaticamente a exigir o operador. Nunca funciona no dia principal do evento, mesmo marcado abaixo.
          </p>
        </div>
      </label>

      <div className="flex flex-wrap items-center gap-3 ml-7">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 shrink-0">Início</span>
          <DateTimePicker modo="hora" value={inicio} onChange={v => { setFeito(null); setInicio(v) }} className="w-28" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 shrink-0">Fim</span>
          <DateTimePicker modo="hora" value={fim} onChange={v => { setFeito(null); setFim(v) }} className="w-28" />
        </label>
        {inicio && fim && (
          <p className="text-xs text-slate-500 w-full sm:w-auto">
            {cruzaMeiaNoite(inicio, fim)
              ? <>Das <strong>{inicio}</strong> de cada dia marcado até as <strong>{fim} do dia seguinte</strong> (horário de Brasília).</>
              : <>Das <strong>{inicio}</strong> às <strong>{fim}</strong> de cada dia marcado (horário de Brasília).</>}
          </p>
        )}
      </div>

      <div className="ml-7 bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Em quais dias</p>
          {config.dias.length > 0 && (
            <button
              type="button"
              onClick={() => { setFeito(null); setDias(todosDias ? new Set() : new Set(config.dias.map(d => d.data))) }}
              className="text-brand-600 text-2xs font-semibold hover:underline shrink-0"
            >
              {todosDias ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
        </div>
        {!config.diasDisponiveis ? null : !config.dias.length ? (
          <p className="text-slate-400 text-xs">
            Este evento não tem dia de montagem/desmontagem — só o dia principal, onde é sempre só o operador.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {config.dias.map(d => {
              const marcado = dias.has(d.data)
              return (
                <button
                  key={d.data}
                  type="button"
                  onClick={() => alternarDia(d.data)}
                  className={`w-[62px] py-1.5 rounded-lg text-center transition-colors ${
                    marcado ? 'bg-brand-50 text-brand-700 font-medium' : 'bg-white border border-slate-200 text-slate-500 hover:border-brand-300'
                  }`}
                >
                  <span className="block text-2xs uppercase tracking-wide opacity-70">
                    {d.fase === 'montagem' ? 'montagem' : 'desmont.'}
                  </span>
                  <span className="block text-xs font-semibold tabular-nums">{rotuloDia(d.data)}</span>
                  <span className="block h-3">{marcado ? <Check className="w-3 h-3 mx-auto" /> : null}</span>
                </button>
              )
            })}
          </div>
        )}
        {!config.diasDisponiveis && (
          <p className="text-amber-700 text-2xs">
            A escolha por dia só passa a valer depois que a migração{' '}
            <code>supabase/upgrade-autoatendimento-portao.sql</code> for aplicada no banco.
          </p>
        )}
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs ml-7">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {feito && (
        <p className="flex items-start gap-1.5 text-green-700 text-xs ml-7">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}
        </p>
      )}

      {/* Botão próprio, fora do <form> grande do evento — mesmo motivo de `ConfiguracaoDoMeio`. */}
      <div className="ml-7">
        <button type="button" onClick={salvar} disabled={pendente} className="btn btn-secundario">
          <Save className="w-3.5 h-3.5 shrink-0" />
          {pendente ? 'Salvando…' : 'Salvar autoatendimento'}
        </button>
      </div>
    </div>
  )
}
