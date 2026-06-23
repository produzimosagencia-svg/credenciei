import { criarEvento } from '@/lib/actions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NovoEventoPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/eventos" className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Novo Evento</h1>
          <p className="text-slate-400 text-sm">Preencha os dados do evento</p>
        </div>
      </div>
      <EventoForm action={criarEvento} submitLabel="Criar Evento" />
    </div>
  )
}

function EventoForm({ action, submitLabel, defaults }: {
  action: (formData: FormData) => Promise<void>
  submitLabel: string
  defaults?: { nome?: string; descricao?: string; data_inicio?: string; data_fim?: string; local?: string }
}) {
  return (
    <form action={action} className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
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
      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-medium transition-colors text-sm">
        {submitLabel}
      </button>

    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-300">{label}</label>
      {children}
    </div>
  )
}

export { EventoForm }
