'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, X, Save, AlertCircle, Check, Lock, LogIn, LogOut } from 'lucide-react'
import DateTimePicker from '@/components/DateTimePicker'
import { salvarDiasPrincipaisExtras } from '@/lib/actions'
import { isoParaInput } from '@/lib/tz'

/**
 * Dias principais EXTRAS — a segunda (ou terceira) noite de um festival,
 * cada uma com sua PRÓPRIA janela de entrada/saída. Pedido do Juan,
 * 25/09/2026, no meio do Pontal Weekend (evento real de duas noites).
 *
 * Separado do bloco "Horários do dia principal" acima (que é sempre a data
 * de início do evento, gravada em `eventos.janela_*`): estes dias extras
 * vivem em `jornada_dias` (mesma tabela dos dias de montagem/desmontagem,
 * só que com `tipo: 'principal'` e horário próprio). Mesmo padrão de mini-
 * formulário independente de `DiasDeTrabalho.tsx` — botão próprio, não
 * depende do "Salvar alterações" geral da tela.
 */

type DiaExtraExistente = {
  data: string
  entradaInicio: string | null
  entradaFim: string | null
  saidaInicio: string | null
  saidaFim: string | null
  temBatidas: boolean
}

type Bloco = {
  id: string
  entradaInicio: string
  entradaFim: string
  saidaInicio: string
  saidaFim: string
  temBatidas: boolean
}

export default function DiasPrincipaisExtras({
  eventoId, iniciais,
}: {
  eventoId: string
  iniciais: DiaExtraExistente[]
}) {
  const router = useRouter()
  const [blocos, setBlocos] = useState<Bloco[]>(() =>
    iniciais.map(d => ({
      id: d.data,
      entradaInicio: isoParaInput(d.entradaInicio),
      entradaFim: isoParaInput(d.entradaFim),
      saidaInicio: isoParaInput(d.saidaInicio),
      saidaFim: isoParaInput(d.saidaFim),
      temBatidas: d.temBatidas,
    })),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const adicionar = () => {
    setFeito(null)
    setBlocos(b => [...b, {
      id: crypto.randomUUID(), entradaInicio: '', entradaFim: '', saidaInicio: '', saidaFim: '', temBatidas: false,
    }])
  }
  const remover = (id: string) => { setFeito(null); setBlocos(b => b.filter(x => x.id !== id)) }
  const set = (id: string, campo: 'entradaInicio' | 'entradaFim' | 'saidaInicio' | 'saidaFim', valor: string) =>
    setBlocos(b => b.map(x => (x.id === id ? { ...x, [campo]: valor } : x)))

  const salvar = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await salvarDiasPrincipaisExtras(eventoId, blocos.map(b => ({
          entradaInicio: b.entradaInicio,
          entradaFim: b.entradaFim || undefined,
          saidaInicio: b.saidaInicio,
          saidaFim: b.saidaFim || undefined,
        })))
        setFeito(r.dias ? `${r.dias} dia(s) principal(is) extra(s) salvos.` : 'Nenhum dia principal extra configurado.')
        router.refresh()
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-slate-500 text-xs">
        Pra um evento de mais de uma noite (ex.: festival de sexta e sábado) — cada dia extra tem
        a sua própria janela de entrada e saída, independente da configurada acima.
      </p>

      {blocos.map((bloco, i) => (
        <div key={bloco.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Dia principal extra {i + 1}</p>
            <button
              type="button"
              onClick={() => remover(bloco.id)}
              disabled={bloco.temBatidas}
              title={bloco.temBatidas ? 'Já tem batidas registradas neste dia — não pode ser removido' : 'Remover este dia'}
              className="text-slate-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {bloco.temBatidas ? <Lock className="w-3.5 h-3.5" /> : <X className="w-4 h-4" />}
            </button>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-green-100 bg-green-50/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <LogIn className="w-3.5 h-3.5 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Entrada</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Início *">
                  <DateTimePicker value={bloco.entradaInicio} onChange={v => set(bloco.id, 'entradaInicio', v)} />
                </Field>
                <Field label="Fim">
                  <DateTimePicker value={bloco.entradaFim} onChange={v => set(bloco.id, 'entradaFim', v)} />
                </Field>
              </div>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <LogOut className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Saída</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Início *">
                  <DateTimePicker value={bloco.saidaInicio} onChange={v => set(bloco.id, 'saidaInicio', v)} />
                </Field>
                <Field label="Fim">
                  <DateTimePicker value={bloco.saidaFim} onChange={v => set(bloco.id, 'saidaFim', v)} />
                </Field>
              </div>
            </div>
          </div>
          <p className="text-slate-400 text-2xs">
            Deixe &ldquo;fim&rdquo; em branco se não houver horário de fechamento, igual ao dia principal automático.
          </p>
        </div>
      ))}

      <button type="button" onClick={adicionar} className="btn btn-secundario btn-sm">
        <CalendarPlus className="w-3.5 h-3.5" /> Adicionar mais um dia principal
      </button>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {feito && (
        <p className="flex items-start gap-1.5 text-green-700 text-xs">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}
        </p>
      )}

      {blocos.length > 0 && (
        <button type="button" onClick={salvar} disabled={pendente} className="btn btn-secundario">
          <Save className="w-3.5 h-3.5" />
          {pendente ? 'Salvando…' : 'Salvar dias principais extras'}
        </button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}
