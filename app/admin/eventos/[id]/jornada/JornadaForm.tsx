'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save, AlertCircle, Check, Bell, CalendarRange, Clock } from 'lucide-react'
import { salvarJornada, type ModoAplicacao } from '@/lib/actions'
import {
  gerarDias, resumoBloco, resumoPeriodo, INICIAIS_DIAS, NOMES_DIAS,
  type BlocoJornada, type DiaSemana, type Jornada,
} from '@/lib/jornada'
import { Secao } from '@/components/ui/Superficie'

/**
 * Configuração de registros diários — a tela do "despertador".
 *
 * O responsável define período, dias da semana e horários UMA vez; a prévia
 * abaixo mostra exatamente quantos dias serão gerados antes de salvar. Essa
 * prévia usa a MESMA função que o servidor (`gerarDias`), então o que ela
 * mostra é o que vai ser gravado — não uma estimativa que pode divergir.
 */

const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6]

/** Um bloco novo já vem com o horário comercial, que é o caso mais comum. */
const blocoNovo = (dias: DiaSemana[] = []): BlocoJornada => ({
  dias,
  turnos: [{ entrada: '08:00', saida: '18:00' }],
})

export default function JornadaForm({
  eventoId, inicial, jaExiste,
}: {
  eventoId: string
  inicial: Jornada
  jaExiste: boolean
}) {
  const [dataInicio, setDataInicio] = useState(inicial.dataInicio)
  const [dataFim, setDataFim] = useState(inicial.dataFim)
  const [tolerancia, setTolerancia] = useState(inicial.toleranciaMin)
  const [blocos, setBlocos] = useState<BlocoJornada[]>(
    inicial.blocos.length ? inicial.blocos : [blocoNovo([1, 2, 3, 4, 5])]
  )
  const [modo, setModo] = useState<ModoAplicacao>('proximos')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const jornada: Jornada = { dataInicio, dataFim, toleranciaMin: tolerancia, blocos }

  // Mesma função do servidor: a prévia não é estimativa, é o resultado.
  const previa = useMemo(
    () => gerarDias({ dataInicio, dataFim, toleranciaMin: tolerancia, blocos }),
    [dataInicio, dataFim, tolerancia, blocos]
  )

  const alternarDia = (i: number, dia: DiaSemana) => {
    setFeito(null)
    setBlocos(bs => bs.map((b, idx) => {
      if (idx !== i) return b
      const tem = b.dias.includes(dia)
      return { ...b, dias: tem ? b.dias.filter(d => d !== dia) : [...b.dias, dia].sort((a, c) => a - c) }
    }))
  }

  const mudarTurno = (i: number, t: number, campo: 'entrada' | 'saida', valor: string) => {
    setFeito(null)
    setBlocos(bs => bs.map((b, idx) => idx !== i ? b : {
      ...b,
      turnos: b.turnos.map((turno, ti) => ti !== t ? turno : { ...turno, [campo]: valor }),
    }))
  }

  const salvar = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await salvarJornada(eventoId, jornada, modo)
        setFeito(
          `${r.dias} dia${r.dias !== 1 ? 's' : ''} de registro configurado${r.dias !== 1 ? 's' : ''}.` +
          (r.preservados > 0 ? ` ${r.preservados} dia(s) já passado(s) foram preservados.` : '')
        )
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Período ─────────────────────────────────────────────────────── */}
      <Secao
        tom="acento"
        icone={<CalendarRange className="w-3.5 h-3.5" />}
        titulo="Período da operação"
        descricao="De quando até quando o evento acontece"
        corpoClassName="p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-slate-500 text-xs">Data inicial</span>
            <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setFeito(null) }} className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">Data final</span>
            <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setFeito(null) }} className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-slate-500 text-xs">Tolerância</span>
            <select
              value={tolerancia}
              onChange={e => { setTolerancia(Number(e.target.value)); setFeito(null) }}
              className="input mt-1"
            >
              {[0, 5, 10, 15, 30, 60].map(m => (
                <option key={m} value={m}>{m === 0 ? 'No horário exato' : `${m} minutos`}</option>
              ))}
            </select>
          </label>
        </div>
        {/* Sem tolerância a janela é um instante, e ninguém consegue bater. */}
        <p className="text-slate-500 text-xs mt-2.5">
          A tolerância é a folga antes e depois do horário. Com 15 minutos, quem tem entrada às 08:00
          consegue registrar das 07:45 às 08:15.
        </p>
      </Secao>

      {/* ── Blocos de horário ───────────────────────────────────────────── */}
      <Secao
        tom="info"
        icone={<Bell className="w-3.5 h-3.5" />}
        titulo="Dias e horários"
        descricao="Marque os dias e defina o horário. Dias com jornada diferente pedem um bloco próprio."
        corpoClassName="p-4 space-y-3"
        acoes={
          <button
            type="button"
            onClick={() => { setBlocos(bs => [...bs, blocoNovo()]); setFeito(null) }}
            className="btn btn-secundario btn-sm"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" /> Outro horário
          </button>
        }
      >
        {blocos.map((bloco, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-slate-500 text-2xs font-semibold uppercase tracking-wide">
                {blocos.length > 1 ? `Bloco ${i + 1}` : 'Dias da semana'}
              </p>
              {blocos.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setBlocos(bs => bs.filter((_, idx) => idx !== i)); setFeito(null) }}
                  aria-label={`Remover bloco ${i + 1}`}
                  className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sete botões redondos: o padrão de despertador que todo mundo
                já conhece do celular. */}
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(d => {
                const ativo = bloco.dias.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => alternarDia(i, d)}
                    aria-pressed={ativo}
                    aria-label={NOMES_DIAS[d]}
                    title={NOMES_DIAS[d]}
                    className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${
                      ativo
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {INICIAIS_DIAS[d]}
                  </button>
                )
              })}
            </div>

            <div className="space-y-2">
              {bloco.turnos.map((t, ti) => (
                <div key={ti} className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="text-slate-500 text-xs">Entrada</span>
                    <input type="time" value={t.entrada} onChange={e => mudarTurno(i, ti, 'entrada', e.target.value)} className="input mt-1 w-32" />
                  </label>
                  <label className="block">
                    <span className="text-slate-500 text-xs">Saída</span>
                    <input type="time" value={t.saida} onChange={e => mudarTurno(i, ti, 'saida', e.target.value)} className="input mt-1 w-32" />
                  </label>
                  {bloco.turnos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBlocos(bs => bs.map((b, idx) => idx !== i ? b : { ...b, turnos: b.turnos.filter((_, x) => x !== ti) }))}
                      aria-label="Remover turno"
                      className="btn-press w-9 h-9 mb-px flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Saída menor que a entrada = vira a madrugada. Dizer isso
                      evita o susto de achar que o horário está errado. */}
                  {t.saida <= t.entrada && t.entrada && t.saida && (
                    <p className="w-full text-aviso-700 text-2xs">
                      Vira a madrugada: a saída fica no dia seguinte, mas o dia continua contando como o da entrada.
                    </p>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setBlocos(bs => bs.map((b, idx) => idx !== i ? b : { ...b, turnos: [...b.turnos, { entrada: '14:00', saida: '18:00' }] }))}
                className="btn btn-secundario btn-sm"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" /> Adicionar turno neste dia
              </button>
            </div>
          </div>
        ))}
      </Secao>

      {/* ── Prévia ──────────────────────────────────────────────────────── */}
      <Secao
        tom="sucesso"
        icone={<Clock className="w-3.5 h-3.5" />}
        titulo="Resumo da configuração"
        descricao="É exatamente isto que será gravado"
        corpoClassName="p-4 space-y-3"
      >
        <div className="space-y-1 text-sm">
          <p className="text-slate-800">
            <span className="text-slate-500">Período: </span>
            {resumoPeriodo(jornada) || '—'}
          </p>
          {blocos.map((b, i) => (
            <p key={i} className="flex items-start gap-2 text-slate-800">
              <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sucesso-600" />
              {resumoBloco(b)}
            </p>
          ))}
          <p className="text-slate-500 text-xs pt-1">
            Tolerância de {tolerancia} minuto{tolerancia !== 1 ? 's' : ''} antes e depois.
          </p>
        </div>

        <div className="border-t border-slate-100 pt-3">
          {previa.length ? (
            <p className="text-sucesso-700 text-sm font-medium">
              {previa.length} dia{previa.length !== 1 ? 's' : ''} de registro
              {previa.length !== 1 ? ' serão gerados' : ' será gerado'}, do dia{' '}
              {previa[0].data.split('-').reverse().join('/')} ao {previa[previa.length - 1].data.split('-').reverse().join('/')}.
            </p>
          ) : (
            <p className="text-aviso-700 text-sm">
              Nenhum dia gerado. Confira o período e marque ao menos um dia da semana.
            </p>
          )}
          <p className="text-slate-500 text-xs mt-1">
            A configuração vale automaticamente para toda a equipe do evento — não precisa configurar pessoa por pessoa.
          </p>
        </div>
      </Secao>

      {/* ── Salvar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        {jaExiste && (
          <fieldset className="space-y-2">
            {/* Item 5 do pedido: a alteração precisa dizer o que faz com o que
                já foi gerado, em vez de decidir em silêncio. */}
            <legend className="text-slate-500 text-xs mb-1.5">Esta alteração vale para:</legend>
            {([
              ['proximos', 'Somente de hoje em diante', 'Os dias que já passaram ficam como estão. É o seguro quando a operação já começou.'],
              ['todos', 'Todo o período, inclusive o que já passou', 'Regera tudo. As batidas já registradas não somem — elas guardam o próprio dia.'],
            ] as const).map(([valor, titulo, ajuda]) => (
              <label key={valor} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="modo"
                  checked={modo === valor}
                  onChange={() => setModo(valor)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-brand-500"
                />
                <span className="min-w-0">
                  <span className="block text-slate-800 text-sm">{titulo}</span>
                  <span className="block text-slate-500 text-xs">{ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {erro && (
          <p className="flex items-start gap-1.5 text-erro-600 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {erro}
          </p>
        )}
        {feito && (
          <p className="flex items-start gap-1.5 text-sucesso-700 text-sm">
            <Check className="w-4 h-4 shrink-0 mt-px" /> {feito}
          </p>
        )}

        <button onClick={salvar} disabled={pendente || !previa.length} className="btn btn-primario btn-lg w-full">
          <Save className="w-4 h-4 shrink-0" />
          {pendente ? 'Salvando…' : jaExiste ? 'Salvar alterações' : 'Ativar registros diários'}
        </button>
      </div>
    </div>
  )
}
