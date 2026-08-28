'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Check, AlertCircle, Save, Lock } from 'lucide-react'
import { salvarDiasDeTrabalho, type DiaDoEvento } from '@/lib/actions'

/**
 * "Dias trabalhados para desenvolvimento do evento".
 *
 * O evento não acontece só no dia do evento: antes tem montagem e organização,
 * depois tem desmontagem. Aqui o produtor marca quais desses dias a equipe
 * trabalha — sem quantidade fixa, um evento pode ter dois dias de preparação e
 * outro pode ter oito.
 *
 * Marcar um dia é o que faz o sistema esperar a pessoa lá. É daqui que sai a
 * frase "estava escalado para 5 dias e veio em 4" no fechamento: dia não
 * marcado não é dia de trabalho, e ninguém é cobrado por ele.
 *
 * A regra de cada tipo de dia é diferente e está dita na tela, porque é a
 * dúvida que aparece na hora de marcar:
 *   dia principal → os horários configurados acima;
 *   dia de preparação → entrada e saída livres, meio 4h depois da entrada.
 */

/** Quantos dias antes e depois do evento aparecem para escolha. */
const DIAS_ANTES = 14
const DIAS_DEPOIS = 7

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

function somar(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, d + n, 12))
  const p2 = (v: number) => String(v).padStart(2, '0')
  return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`
}

function rotulo(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const semana = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()
  return { semana: SEMANA[semana], curto: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
}

export default function DiasDeTrabalho({
  eventoId, diaPrincipal, iniciais,
}: {
  eventoId: string
  /** Data do evento, "2026-08-29". Não é escolhível: vem do campo de data acima. */
  diaPrincipal: string
  iniciais: DiaDoEvento[]
}) {
  const travados = useMemo(
    () => new Set(iniciais.filter(d => d.temBatidas && d.tipo !== 'principal').map(d => d.data)),
    [iniciais],
  )
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(iniciais.filter(d => d.tipo !== 'principal').map(d => d.data)),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  // A grade cobre duas semanas antes e uma depois — o suficiente para montagem
  // e desmontagem sem virar uma lista infinita de datas irrelevantes.
  const grade = useMemo(() => {
    if (!diaPrincipal) return []
    const dias: string[] = []
    for (let i = -DIAS_ANTES; i <= DIAS_DEPOIS; i++) dias.push(somar(diaPrincipal, i))
    return dias
  }, [diaPrincipal])

  const alternar = (dia: string) => {
    if (dia === diaPrincipal || travados.has(dia)) return
    setFeito(null)
    setMarcados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(dia)) proximo.delete(dia)
      else proximo.add(dia)
      return proximo
    })
  }

  const salvar = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await salvarDiasDeTrabalho(eventoId, [...marcados])
        setFeito(
          `${r.dias} dia(s) de trabalho salvos.` +
          (r.preservados > 0
            ? ` ${r.preservados} dia(s) desmarcado(s) foram mantidos porque já têm batidas registradas.`
            : ''),
        )
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.')
      }
    })
  }

  if (!diaPrincipal) {
    return (
      <p className="text-slate-500 text-xs">
        Defina a data do evento acima e salve para poder marcar os dias de preparação.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {grade.map(dia => {
          const { semana, curto } = rotulo(dia)
          const ehPrincipal = dia === diaPrincipal
          const marcado = marcados.has(dia)
          const travado = travados.has(dia)

          return (
            <button
              key={dia}
              type="button"
              onClick={() => alternar(dia)}
              disabled={ehPrincipal || travado}
              title={
                ehPrincipal
                  ? 'Dia principal do evento — definido pela data acima'
                  : travado
                    ? 'Já tem batidas registradas neste dia, por isso não pode ser desmarcado'
                    : undefined
              }
              className={`w-[68px] py-2 rounded-xl border text-center transition-colors ${
                ehPrincipal
                  ? 'bg-brand-500 border-brand-500 text-white cursor-default'
                  : marcado
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'
              } ${travado ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <span className="block text-2xs uppercase tracking-wide opacity-70">{semana}</span>
              <span className="block text-sm font-semibold tabular-nums">{curto}</span>
              <span className="block h-3.5 mt-0.5">
                {ehPrincipal ? <Check className="w-3.5 h-3.5 mx-auto" />
                  : travado ? <Lock className="w-3 h-3 mx-auto" />
                  : marcado ? <Check className="w-3.5 h-3.5 mx-auto" /> : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
        <p className="text-slate-600 text-xs">
          <span className="inline-block w-2.5 h-2.5 rounded bg-brand-500 align-middle mr-1.5" />
          <strong>Dia principal</strong> — usa os horários de entrada, meio e saída configurados acima.
        </p>
        <p className="text-slate-600 text-xs">
          <span className="inline-block w-2.5 h-2.5 rounded bg-brand-50 border border-brand-300 align-middle mr-1.5" />
          <strong>Dia de preparação</strong> — entrada e saída livres. O meio é calculado para cada
          pessoa, 4 horas depois da entrada dela.
        </p>
        <p className="text-slate-400 text-2xs pt-0.5">
          Dia não marcado não é dia de trabalho: ninguém consegue bater ponto nele, e ninguém é
          cobrado por não ter aparecido.
        </p>
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {feito && (
        <p className="flex items-start gap-1.5 text-green-700 text-xs">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}
        </p>
      )}

      {/* Botão próprio, e não o "Salvar" do formulário do evento: este bloco
          grava numa tabela diferente e não deve depender de o produtor mexer
          em mais nada da tela. */}
      <button type="button" onClick={salvar} disabled={pendente} className="btn btn-secundario">
        <Save className="w-3.5 h-3.5 shrink-0" />
        {pendente ? 'Salvando…' : `Salvar dias de trabalho (${marcados.size + 1})`}
      </button>
    </div>
  )
}

export { CalendarRange }
