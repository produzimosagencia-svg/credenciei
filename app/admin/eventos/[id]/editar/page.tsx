import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { editarEvento } from '@/lib/actions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: evento } = await supabase.from('eventos').select('*').eq('id', id).single()
  if (!evento) notFound()

  const action = editarEvento.bind(null, id)
  const fmt = (d: string) => new Date(d).toISOString().slice(0, 16)

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/eventos/${id}`} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Editar Evento</h1>
          <p className="text-slate-400 text-sm">{evento.nome}</p>
        </div>
      </div>

      <form action={action} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <Field label="Nome do evento *">
          <input name="nome" required defaultValue={evento.nome} className="input" />
        </Field>
        <Field label="Descrição">
          <textarea name="descricao" rows={2} defaultValue={evento.descricao ?? ''} className="input resize-none" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Data de início *">
            <input name="data_inicio" required type="datetime-local" defaultValue={fmt(evento.data_inicio)} className="input" />
          </Field>
          <Field label="Data de fim *">
            <input name="data_fim" required type="datetime-local" defaultValue={fmt(evento.data_fim)} className="input" />
          </Field>
        </div>
        <Field label="Local">
          <input name="local" defaultValue={evento.local ?? ''} className="input" />
        </Field>
        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-orange-200">
          Salvar alterações
        </button>
      </form>
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
