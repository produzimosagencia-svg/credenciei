'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Check, ArrowLeft, ClipboardPen, AlertCircle, LogIn, Camera, LogOut } from 'lucide-react'
import { lancarPontoManual } from '@/lib/actions'
import { chaveBusca, formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState } from '@/components/ui/Superficie'
import DateTimePicker from '@/components/DateTimePicker'

export type PessoaDoEvento = {
  id: string
  nome: string
  cpf: string
  setorNome: string
  cargo: string
  ativo: boolean
  /** O que ela já tem registrado, por dia da operação: `${dataRef}:${etapa}` → hora ISO. */
  batidas: Record<string, string>
}

export type DiaDaOperacao = { data: string; tipo: 'principal' | 'preparacao' }

type Etapa = 'entrada' | 'meio' | 'fim'

const ETAPAS: { momento: Etapa; rotulo: string; icone: React.ElementType }[] = [
  { momento: 'entrada', rotulo: 'Entrada', icone: LogIn },
  { momento: 'meio', rotulo: 'Meio', icone: Camera },
  { momento: 'fim', rotulo: 'Saída', icone: LogOut },
]

const MINIMO = 2
const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

/**
 * Lançar ponto na mão: acha a pessoa, escolhe o dia, a etapa, a hora e
 * escreve o motivo.
 *
 * Diferente do "Registro de ponto" (que exige a foto da pessoa e grava na
 * hora atual), este existe para o depois: a pessoa já foi embora e alguém
 * precisa regularizar. Ver `lancarPontoManual` em lib/actions.ts.
 *
 * O DIA e a HORA são campos separados de propósito — numa saída de
 * madrugada a pessoa trabalhou no dia 05 e bateu às 02:00 do dia 06.
 */
export default function LancarPonto({
  pessoas, dias, diaPadrao,
}: {
  pessoas: PessoaDoEvento[]
  dias: DiaDaOperacao[]
  diaPadrao: string
}) {
  const [busca, setBusca] = useState('')
  const [pessoa, setPessoa] = useState<PessoaDoEvento | null>(null)
  const [dia, setDia] = useState(diaPadrao)
  const [etapa, setEtapa] = useState<Etapa>('entrada')
  const [quando, setQuando] = useState(`${diaPadrao}T08:00`)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const digitos = busca.replace(/\D/g, '')
  const encontrados = useMemo(() => {
    const t = chaveBusca(busca)
    if (t.length < MINIMO) return []
    return pessoas
      .filter(p => chaveBusca(p.nome).includes(t) || (digitos.length >= 3 && p.cpf.includes(digitos)) || chaveBusca(p.setorNome).includes(t))
      .slice(0, 30)
  }, [pessoas, busca, digitos])

  const escolher = (p: PessoaDoEvento) => {
    setPessoa(p)
    setErro(null)
    setFeito(null)
  }

  /** Ao trocar o dia, a hora acompanha — senão fica apontando pro dia anterior. */
  const trocarDia = (novo: string) => {
    setDia(novo)
    setQuando(atual => `${novo}T${(atual.split('T')[1] ?? '08:00')}`)
    setFeito(null)
  }

  const jaTem = pessoa?.batidas[`${dia}:${etapa}`] ?? null

  const salvar = () => {
    if (!pessoa) return
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      const r = await lancarPontoManual(pessoa.id, etapa, dia, quando, motivo)
      if (r.error) { setErro(r.error); return }
      setFeito(`${r.etapa} de ${r.nome} lançada em ${rotuloDia(dia)}, às ${quando.split('T')[1]}.`)
      setMotivo('')
      router.refresh()
    })
  }

  // ── Passo 1: achar a pessoa ────────────────────────────────────────────
  if (!pessoa) {
    return (
      <Secao
        tom="acento"
        icone={<ClipboardPen className="w-3.5 h-3.5" />}
        titulo="Quem perdeu a batida?"
        descricao={`${pessoas.length.toLocaleString('pt-BR')} pessoas neste evento — busque por nome, CPF ou setor`}
        corpoClassName={encontrados.length ? '' : 'p-4'}
      >
        <div className="relative px-4 pt-4 pb-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Nome, CPF ou setor…" aria-label="Buscar pessoa" autoFocus
            className="input pl-9 pr-9"
          />
          {busca && (
            <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-6 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {busca.trim().length < MINIMO ? (
          <EmptyState icone={<Search className="w-7 h-7" />} titulo="Digite para procurar" descricao="Pelo menos duas letras do nome, ou o começo do CPF." />
        ) : !encontrados.length ? (
          <EmptyState icone={<Search className="w-7 h-7" />} titulo={`Ninguém com "${busca}"`} />
        ) : (
          <div className="divide-y divide-slate-50">
            {encontrados.map(p => (
              <button key={p.id} onClick={() => escolher(p)} className="w-full text-left px-4 py-3 hover:bg-slate-50/60 transition-colors">
                <p className={`text-sm font-medium truncate ${p.ativo ? 'text-slate-800' : 'text-slate-400'}`}>
                  {p.nome}
                  {!p.ativo && <span className="ml-2 text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">NÃO ATIVADO</span>}
                </p>
                <p className="text-slate-400 text-xs truncate">
                  {p.setorNome}{p.cargo ? ` · ${p.cargo}` : ''} · <span className="font-mono tabular-nums">{formatCpf(p.cpf)}</span>
                </p>
              </button>
            ))}
          </div>
        )}
      </Secao>
    )
  }

  // ── Passo 2: o lançamento ──────────────────────────────────────────────
  return (
    <Secao
      tom="acento"
      icone={<ClipboardPen className="w-3.5 h-3.5" />}
      titulo={pessoa.nome}
      descricao={`${pessoa.setorNome}${pessoa.cargo ? ` · ${pessoa.cargo}` : ''}`}
      acoes={
        <button onClick={() => { setPessoa(null); setFeito(null); setErro(null) }} className="btn btn-secundario btn-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Outra pessoa
        </button>
      }
      corpoClassName="p-5 space-y-4"
    >
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">Dia de trabalho</label>
        <div className="flex flex-wrap gap-1.5">
          {dias.map(d => (
            <button
              key={d.data} type="button" onClick={() => trocarDia(d.data)}
              className={`w-[68px] py-1.5 rounded-lg border text-center transition-colors ${
                d.data === dia ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'
              }`}
            >
              <span className="block text-2xs uppercase tracking-wide opacity-70">{d.tipo === 'principal' ? 'evento' : 'prep.'}</span>
              <span className="block text-xs font-semibold tabular-nums">{rotuloDia(d.data)}</span>
            </button>
          ))}
        </div>
        <p className="text-slate-400 text-xs mt-1.5">
          É o dia a que a batida pertence — o que conta no fechamento, mesmo que a hora caia na madrugada seguinte.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">Etapa</label>
        <div className="grid grid-cols-3 gap-2">
          {ETAPAS.map(e => {
            const marcada = etapa === e.momento
            const existente = pessoa.batidas[`${dia}:${e.momento}`]
            return (
              <button
                key={e.momento} type="button" onClick={() => { setEtapa(e.momento); setFeito(null) }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  marcada ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <e.icone className="w-4 h-4" />
                {e.rotulo}
                {existente && <span className="text-2xs text-slate-400 tabular-nums">{formatarBR(existente, 'hora')}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Etapa que já tem batida: o lançamento SOBRESCREVE. Dito antes de
          salvar, não depois — o banco só guarda uma por pessoa/etapa/dia. */}
      {jaTem && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-amber-800 text-xs">
          Já existe {ETAPAS.find(e => e.momento === etapa)?.rotulo.toLowerCase()} em {rotuloDia(dia)}, às{' '}
          <strong className="tabular-nums">{formatarBR(jaTem, 'hora')}</strong>. Salvar aqui <strong>substitui</strong> esse
          horário — o anterior não fica guardado.
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">Data e hora da batida</label>
        <DateTimePicker modo="datahora" value={quando} onChange={v => { setQuando(v); setFeito(null) }} />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">Motivo do lançamento manual *</label>
        <textarea
          value={motivo} onChange={e => { setMotivo(e.target.value); setFeito(null) }}
          rows={2} placeholder="Ex.: saiu depois do fechamento da portaria, sem ninguém para ler o QR"
          className="input resize-none"
        />
        <p className="text-slate-400 text-xs mt-1.5">
          Fica gravado junto com o seu nome e aparece no histórico da pessoa. É o que sustenta a batida numa conferência —
          aqui não há foto nem QR.
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

      <button
        onClick={salvar}
        disabled={pendente || motivo.trim().length < 5}
        className="btn btn-primario btn-lg w-full disabled:opacity-50"
      >
        {pendente ? 'Lançando…' : 'Lançar ponto'}
      </button>
    </Secao>
  )
}
