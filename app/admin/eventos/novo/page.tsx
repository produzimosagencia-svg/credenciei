import { criarEvento } from '@/lib/actions'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPerfil, licencasDeEventoRestantes } from '@/lib/supabase-server'

export default async function NovoEventoPage() {
  const perfil = await getPerfil()
  // Sem licença de evento disponível → volta para a lista
  if ((await licencasDeEventoRestantes(perfil)) <= 0) redirect('/admin/eventos')

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/eventos" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Novo Evento</h1>
          <p className="text-slate-400 text-sm">Preencha os dados do evento</p>
        </div>
      </div>
      <EventoForm action={criarEvento} submitLabel="Criar Evento" />
    </div>
  )
}

type EventoDefaults = {
  nome?: string; descricao?: string; data_inicio?: string; data_fim?: string; local?: string
  janela_entrada_inicio?: string; janela_entrada_fim?: string
  janela_meio_inicio?: string; janela_meio_fim?: string
  janela_fim_inicio?: string; janela_fim_fim?: string
}

function EventoForm({ action, submitLabel, defaults }: {
  action: (formData: FormData) => Promise<void>
  submitLabel: string
  defaults?: EventoDefaults
}) {
  return (
    <form action={action} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <Field label="Nome do evento *">
        <input name="nome" required defaultValue={defaults?.nome} placeholder="Ex: Feira do Empreendedor 2025" className="input" />
      </Field>
      <Field label="Descrição">
        <textarea name="descricao" rows={2} defaultValue={defaults?.descricao ?? ''} placeholder="Descrição opcional" className="input resize-none" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Data de início *">
          <input name="data_inicio" required type="datetime-local" defaultValue={defaults?.data_inicio} className="input" />
        </Field>
        <Field label="Data de fim *">
          <input name="data_fim" required type="datetime-local" defaultValue={defaults?.data_fim} className="input" />
        </Field>
      </div>
      <Field label="Local">
        <input name="local" defaultValue={defaults?.local ?? ''} placeholder="Ex: Expo Center Norte, São Paulo" className="input" />
      </Field>

      <JanelasHorario defaults={defaults} />

      <button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-brand-200">
        {submitLabel}
      </button>
    </form>
  )
}

function JanelasHorario({ defaults }: { defaults?: EventoDefaults }) {
  const janelas = [
    { key: 'entrada', label: 'Entrada', cor: 'text-green-600' },
    { key: 'meio', label: 'Meio (durante o evento)', cor: 'text-blue-600' },
    { key: 'fim', label: 'Fim', cor: 'text-brand-600' },
  ] as const
  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Janelas de registro de presença</p>
        <p className="text-xs text-slate-400">Os funcionários tiram a foto dentro destes horários. Deixe em branco pra definir depois.</p>
      </div>
      {janelas.map(j => (
        <div key={j.key} className="grid grid-cols-2 gap-3">
          <Field label={`${j.label} — início`}>
            <input name={`janela_${j.key}_inicio`} type="datetime-local" defaultValue={defaults?.[`janela_${j.key}_inicio` as keyof EventoDefaults]} className="input" />
          </Field>
          <Field label={`${j.label} — fim`}>
            <input name={`janela_${j.key}_fim`} type="datetime-local" defaultValue={defaults?.[`janela_${j.key}_fim` as keyof EventoDefaults]} className="input" />
          </Field>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}

export { EventoForm }
