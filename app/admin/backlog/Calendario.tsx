'use client'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, PhoneCall, Flag, Sparkles, PartyPopper, CalendarDays } from 'lucide-react'
import type { Compromisso, CompromissoTipo } from '@/lib/backlog'
import { PRIORIDADES } from '@/lib/backlog-constantes'

export type Escala = 'mes' | 'semana' | 'dia'

/**
 * O Calendário do Backlog.
 *
 * ─── NÃO EXISTE TAREFA DE CALENDÁRIO ─────────────────────────────────────────
 *
 * Nada aqui é cadastrado no calendário: cada card é a projeção de um item que
 * vive no Backlog. Mudou a data lá, o card anda; tirou a data, o card some;
 * mudou a prioridade, a cor muda. Isso não é sincronização — é a consequência
 * de LER a mesma linha, e é por isso que não existe caminho pros dois
 * discordarem. Ver `agendaDoBacklog` em lib/backlog.ts.
 *
 * ─── A COR É A PRIORIDADE ────────────────────────────────────────────────────
 *
 * Vermelho/laranja/verde saem direto da prioridade cadastrada (pedido do Juan,
 * 10/09/2026). O TIPO do compromisso — retorno de contato, prazo de tarefa,
 * evento previsto, evento cadastrado — passou a ser dito pelo ÍCONE, porque
 * duas informações não cabem no mesmo canal de cor sem uma delas mentir.
 *
 * Evento já cadastrado não tem prioridade (nem responsável): fica em cinza
 * neutro. Pintá-lo de "média" seria inventar um dado que ninguém preencheu.
 */

const ICONE: Record<CompromissoTipo, { Icone: React.ElementType; rotulo: string }> = {
  contato: { Icone: PhoneCall, rotulo: 'Retorno de contato' },
  prazo: { Icone: Flag, rotulo: 'Prazo de tarefa' },
  evento_previsto: { Icone: Sparkles, rotulo: 'Evento previsto' },
  evento: { Icone: PartyPopper, rotulo: 'Evento cadastrado' },
}

type Paleta = { caixa: string; texto: string; ponto: string; barra: string }

const POR_PRIORIDADE: Record<string, Paleta> = {
  alta: { caixa: 'bg-red-50 border-red-200 hover:bg-red-100', texto: 'text-red-800', ponto: 'bg-red-500', barra: 'bg-red-500' },
  media: { caixa: 'bg-orange-50 border-orange-200 hover:bg-orange-100', texto: 'text-orange-800', ponto: 'bg-orange-500', barra: 'bg-orange-500' },
  baixa: { caixa: 'bg-green-50 border-green-200 hover:bg-green-100', texto: 'text-green-800', ponto: 'bg-green-500', barra: 'bg-green-500' },
}
const NEUTRA: Paleta = { caixa: 'bg-slate-50 border-slate-200 hover:bg-slate-100', texto: 'text-slate-700', ponto: 'bg-slate-400', barra: 'bg-slate-400' }

const paletaDe = (prioridade: string | null): Paleta => (prioridade && POR_PRIORIDADE[prioridade]) || NEUTRA

const NOME_DO_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIA_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/*
 * Toda conta de data é feita em UTC a partir de `YYYY-MM-DD`. Usar o fuso do
 * navegador faria a grade escorregar um dia pra quem estiver fora de Brasília
 * — e o dia de hoje já vem calculado em Brasília pelo servidor (`hojeBRT`).
 */
const emUTC = (iso: string) => new Date(`${iso}T12:00:00Z`)
const paraISO = (d: Date) => d.toISOString().slice(0, 10)
function somarDias(iso: string, dias: number): string {
  const d = emUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}
function somarMeses(iso: string, meses: number): string {
  const d = emUTC(iso)
  const diaOriginal = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  // 31 de janeiro + 1 mês não pode virar 3 de março: prende no último dia.
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(diaOriginal, ultimo))
  return paraISO(d)
}
const domingoDaSemana = (iso: string) => somarDias(iso, -emUTC(iso).getUTCDay())
const diaDoMes = (iso: string) => Number(iso.slice(8))
const porExtenso = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function Calendario({
  compromissos, escala, ancora, hoje, href, onAbrirItem,
}: {
  compromissos: Compromisso[]
  escala: Escala
  /** O dia que ancora o período mostrado. */
  ancora: string
  hoje: string
  href: (mudancas: { escala?: Escala; dia?: string }) => string
  onAbrirItem: (itemId: string) => void
}) {
  const porDia = new Map<string, Compromisso[]>()
  for (const c of compromissos) porDia.set(c.data, [...(porDia.get(c.data) ?? []), c])

  const passo = escala === 'mes' ? somarMeses : escala === 'semana'
    ? (iso: string, n: number) => somarDias(iso, n * 7)
    : somarDias

  const titulo = escala === 'mes'
    ? `${NOME_DO_MES[Number(ancora.slice(5, 7)) - 1]} de ${ancora.slice(0, 4)}`
    : escala === 'semana'
      ? (() => {
        const inicio = domingoDaSemana(ancora)
        const fim = somarDias(inicio, 6)
        return `${inicio.slice(8)}/${inicio.slice(5, 7)} a ${fim.slice(8)}/${fim.slice(5, 7)} de ${fim.slice(0, 4)}`
      })()
      : `${DIA_LONGO[emUTC(ancora).getUTCDay()]}, ${porExtenso(ancora)}`

  return (
    <div className="space-y-4">
      {/* ── Navegação ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={href({ dia: passo(ancora, -1) })} aria-label="Período anterior" className="btn btn-secundario btn-icone">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <Link href={href({ dia: passo(ancora, 1) })} aria-label="Próximo período" className="btn btn-secundario btn-icone">
            <ChevronRight className="w-4 h-4" />
          </Link>
          <h3 className="text-slate-800 font-bold px-2 capitalize">{titulo}</h3>
          <Link href={href({ dia: hoje })} className="btn btn-secundario btn-sm">Hoje</Link>
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm p-1">
          {(['mes', 'semana', 'dia'] as Escala[]).map(e => (
            <Link
              key={e}
              href={href({ escala: e })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                escala === e ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {e === 'mes' ? 'Mês' : e === 'semana' ? 'Semana' : 'Dia'}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Legenda: a cor é prioridade, o ícone é o tipo ─────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {PRIORIDADES.map(p => (
          <span key={p.valor} className="flex items-center gap-1.5 text-slate-500 text-2xs">
            <span className={`w-2 h-2 rounded-full ${paletaDe(p.valor).ponto}`} /> {p.rotulo}
          </span>
        ))}
        <span className="w-px h-3 bg-slate-200" />
        {(Object.keys(ICONE) as CompromissoTipo[]).map(t => {
          const { Icone, rotulo } = ICONE[t]
          return (
            <span key={t} className="flex items-center gap-1.5 text-slate-400 text-2xs">
              <Icone className="w-3 h-3" /> {rotulo}
            </span>
          )
        })}
      </div>

      {escala === 'mes' && <VisaoMes ancora={ancora} hoje={hoje} porDia={porDia} href={href} onAbrirItem={onAbrirItem} />}
      {escala === 'semana' && <VisaoSemana ancora={ancora} hoje={hoje} porDia={porDia} href={href} onAbrirItem={onAbrirItem} />}
      {escala === 'dia' && <VisaoDia ancora={ancora} hoje={hoje} porDia={porDia} onAbrirItem={onAbrirItem} />}
    </div>
  )
}

// ─── Mês ─────────────────────────────────────────────────────────────────────

function VisaoMes({
  ancora, hoje, porDia, href, onAbrirItem,
}: {
  ancora: string
  hoje: string
  porDia: Map<string, Compromisso[]>
  href: (m: { escala?: Escala; dia?: string }) => string
  onAbrirItem: (id: string) => void
}) {
  const mes = ancora.slice(0, 7)
  const [ano, numeroDoMes] = mes.split('-').map(Number)
  const primeiroDiaSemana = new Date(Date.UTC(ano, numeroDoMes - 1, 1)).getUTCDay()
  const diasNoMes = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate()

  const celulas: (string | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (celulas.length % 7) celulas.push(null)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[46rem]">
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {DIA_CURTO.map(d => (
            <div key={d} className="text-slate-400 text-2xs font-bold uppercase tracking-wide text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {celulas.map((dia, i) => {
            if (!dia) return <div key={`vazio-${i}`} className="min-h-[7rem] rounded-xl bg-slate-50/40" />
            const doDia = porDia.get(dia) ?? []
            const eHoje = dia === hoje
            return (
              <div
                key={dia}
                className={`min-h-[7rem] rounded-xl border p-1.5 space-y-1 ${
                  eHoje ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                {/* O número leva pra visão do dia — é o atalho natural quando a
                    célula tem mais compromissos do que cabe. */}
                <Link
                  href={href({ escala: 'dia', dia })}
                  className={`block text-2xs font-bold tabular-nums hover:underline ${eHoje ? 'text-brand-600' : 'text-slate-400'}`}
                >
                  {diaDoMes(dia)}
                </Link>
                {doDia.slice(0, 3).map((c, j) => (
                  <CardCompacto key={j} c={c} onAbrirItem={onAbrirItem} />
                ))}
                {doDia.length > 3 && (
                  <Link href={href({ escala: 'dia', dia })} className="block text-slate-400 hover:text-brand-600 text-2xs px-1">
                    + {doDia.length - 3} {doDia.length - 3 === 1 ? 'item' : 'itens'}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Semana ──────────────────────────────────────────────────────────────────

function VisaoSemana({
  ancora, hoje, porDia, href, onAbrirItem,
}: {
  ancora: string
  hoje: string
  porDia: Map<string, Compromisso[]>
  href: (m: { escala?: Escala; dia?: string }) => string
  onAbrirItem: (id: string) => void
}) {
  const inicio = domingoDaSemana(ancora)
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i))

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-1.5 min-w-[52rem]">
        {dias.map(dia => {
          const doDia = porDia.get(dia) ?? []
          const eHoje = dia === hoje
          return (
            <div
              key={dia}
              className={`rounded-xl border min-h-[18rem] ${eHoje ? 'border-brand-400 bg-brand-50/30' : 'border-slate-200 bg-white'}`}
            >
              <Link
                href={href({ escala: 'dia', dia })}
                className={`block px-2 py-2 border-b text-center hover:bg-slate-50 transition-colors ${
                  eHoje ? 'border-brand-200' : 'border-slate-100'
                }`}
              >
                <span className="block text-2xs font-bold uppercase tracking-wide text-slate-400">
                  {DIA_CURTO[emUTC(dia).getUTCDay()]}
                </span>
                <span className={`block text-lg font-bold tabular-nums ${eHoje ? 'text-brand-600' : 'text-slate-700'}`}>
                  {diaDoMes(dia)}
                </span>
              </Link>
              <div className="p-1.5 space-y-1.5">
                {!doDia.length && <p className="text-slate-300 text-2xs text-center py-4 select-none">—</p>}
                {doDia.map((c, j) => <CardCompleto key={j} c={c} onAbrirItem={onAbrirItem} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dia ─────────────────────────────────────────────────────────────────────

function VisaoDia({
  ancora, hoje, porDia, onAbrirItem,
}: {
  ancora: string
  hoje: string
  porDia: Map<string, Compromisso[]>
  onAbrirItem: (id: string) => void
}) {
  const doDia = porDia.get(ancora) ?? []
  return (
    <div className={`rounded-2xl border p-4 ${ancora === hoje ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200 bg-white'}`}>
      {!doDia.length ? (
        <div className="py-14 text-center">
          <CalendarDays className="w-7 h-7 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nada marcado para {porExtenso(ancora)}</p>
          <p className="text-slate-400 text-xs mt-1">
            Itens do Backlog com prazo ou próximo contato nesta data apareceriam aqui.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {doDia.map((c, j) => <CardCompleto key={j} c={c} onAbrirItem={onAbrirItem} />)}
        </div>
      )}
    </div>
  )
}

// ─── Cards ───────────────────────────────────────────────────────────────────

/** Uma linha só — o que cabe numa célula de mês sem virar parede de texto. */
function CardCompacto({ c, onAbrirItem }: { c: Compromisso; onAbrirItem: (id: string) => void }) {
  const p = paletaDe(c.prioridade)
  const { Icone, rotulo } = ICONE[c.tipo]
  const conteudo = (
    <span className="flex items-start gap-1 min-w-0">
      <Icone className="w-2.5 h-2.5 shrink-0 mt-[3px]" />
      <span className="truncate">{c.titulo}</span>
    </span>
  )
  const classe = `block w-full text-left rounded-md border px-1.5 py-1 text-2xs leading-tight transition-colors ${p.caixa} ${p.texto}`
  const dica = [rotulo, c.responsavelNome, c.status].filter(Boolean).join(' · ')

  return c.eventoId
    ? <Link href={`/admin/eventos/${c.eventoId}`} className={classe} title={dica}>{conteudo}</Link>
    : <button onClick={() => c.itemId && onAbrirItem(c.itemId)} className={classe} title={dica}>{conteudo}</button>
}

/** O card do pedido: título, prioridade, responsável, status e data. */
function CardCompleto({ c, onAbrirItem }: { c: Compromisso; onAbrirItem: (id: string) => void }) {
  const p = paletaDe(c.prioridade)
  const { Icone, rotulo } = ICONE[c.tipo]
  const prioridadeRotulo = PRIORIDADES.find(x => x.valor === c.prioridade)?.rotulo

  const corpo = (
    <>
      {/* A barra da esquerda repete a prioridade em forma, não só em cor —
          quem não distingue vermelho de verde ainda lê a diferença no ícone. */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${p.barra}`} />
      <span className="block pl-2 space-y-1">
        <span className="flex items-start gap-1.5">
          <Icone className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
          <span className={`text-xs font-semibold leading-snug line-clamp-2 ${p.texto}`}>{c.titulo}</span>
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-slate-500">
          <span className="tabular-nums">{porExtenso(c.data)}</span>
          {prioridadeRotulo && (
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${p.ponto}`} /> {prioridadeRotulo}
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-slate-400">
          <span className="truncate">{c.status ?? rotulo}</span>
          {c.responsavelNome && <span className="truncate">· {c.responsavelNome}</span>}
        </span>
      </span>
    </>
  )

  const classe = `relative block w-full text-left rounded-lg border pl-1 pr-2 py-1.5 transition-colors ${p.caixa}`

  return c.eventoId
    ? <Link href={`/admin/eventos/${c.eventoId}`} className={classe} title={c.detalhe ?? c.titulo}>{corpo}</Link>
    : <button onClick={() => c.itemId && onAbrirItem(c.itemId)} className={classe} title={c.detalhe ?? c.titulo}>{corpo}</button>
}
