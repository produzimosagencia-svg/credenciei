import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { editarEvento } from '@/lib/actions'
import { isoParaInput } from '@/lib/tz'
import { NomeInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, MapPin, LogIn, Camera, LogOut, Save, MessageCircle } from 'lucide-react'

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: evento } = await supabase.from('eventos').select('*').eq('id', id).single()
  if (!evento) notFound()

  const action = editarEvento.bind(null, id)
  const fmt = (d: string | null | undefined) => isoParaInput(d)

  const janelas = [
    { key: 'entrada', label: 'Entrada', icon: LogIn, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { key: 'meio', label: 'Meio do evento', icon: Camera, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { key: 'fim', label: 'Saída', icon: LogOut, color: 'text-brand-600', bg: 'bg-brand-50', border: 'border-brand-100' },
  ] as const

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/eventos/${id}`} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Editar evento</h1>
          <p className="text-slate-400 text-sm">{evento.nome}</p>
        </div>
      </div>

      <form action={action} className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden">
        {/* Informações gerais */}
        <div className="p-6 sm:p-8 space-y-5">
          <SectionTitle title="Informações gerais" subtitle="Nome, descrição e local do evento" />
          <Field label="Nome do evento *">
            <NomeInput name="nome" required defaultValue={evento.nome} className="input" />
          </Field>
          <Field label="Descrição">
            <textarea name="descricao" rows={2} defaultValue={evento.descricao ?? ''} className="input resize-none" />
          </Field>
          <Field label="Local" icon={MapPin}>
            <NomeInput name="local" defaultValue={evento.local ?? ''} className="input" />
          </Field>
        </div>

        {/* Datas do evento */}
        <div className="p-6 sm:p-8 pt-0 space-y-4">
          <SectionTitle title="Duração" subtitle="Quando o evento começa e termina" icon={CalendarDays} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Data de início *">
              <DateTimePicker name="data_inicio" required defaultValue={fmt(evento.data_inicio)} />
            </Field>
            <Field label="Data de fim *">
              <DateTimePicker name="data_fim" required defaultValue={fmt(evento.data_fim)} />
            </Field>
          </div>
        </div>

        {/* Janelas de presença */}
        <div className="bg-slate-50 border-t border-slate-100 p-6 sm:p-8 space-y-4">
          <SectionTitle
            title="Janelas de registro de presença"
            subtitle="Os funcionários tiram a foto de entrada, meio e fim dentro destes horários"
          />
          <div className="space-y-3">
            {janelas.map(j => (
              <div key={j.key} className={`bg-white rounded-2xl border ${j.border} p-4 space-y-3`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${j.bg} flex items-center justify-center shrink-0`}>
                    <j.icon className={`w-3.5 h-3.5 ${j.color}`} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{j.label}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Início" compact>
                    <DateTimePicker name={`janela_${j.key}_inicio`} defaultValue={fmt(evento[`janela_${j.key}_inicio`])} />
                  </Field>
                  <Field label="Fim" compact>
                    <DateTimePicker name={`janela_${j.key}_fim`} defaultValue={fmt(evento[`janela_${j.key}_fim`])} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mensagem pré-evento */}
        <div className="p-6 sm:p-8 space-y-4 border-t border-slate-100">
          <SectionTitle
            title="Mensagem pré-evento (WhatsApp)"
            subtitle="Confirmação de escala enviada aos funcionários antes do evento, com instruções personalizadas"
            icon={MessageCircle}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Enviar em">
              <DateTimePicker name="msg_pre_evento_envio" defaultValue={fmt(evento.msg_pre_evento_envio)} />
            </Field>
          </div>
          <Field label="Instruções do evento (opcional)">
            <textarea
              name="msg_pre_evento_instrucoes"
              rows={3}
              defaultValue={evento.msg_pre_evento_instrucoes ?? ''}
              placeholder="Ex: Leve seu documento com foto e esteja com o uniforme da sua empresa."
              className="input resize-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Este texto entra na mensagem de confirmação de escala, junto com função, setor, data e local. Deixe o horário em branco para não enviar.
            </p>
          </Field>
        </div>

        {/* Ação */}
        <div className="p-6 sm:p-8 pt-6 border-t border-slate-100">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white py-3.5 rounded-2xl font-semibold transition-all shadow-lg shadow-brand-500/25 hover:shadow-brand-500/35 hover:-translate-y-0.5"
          >
            <Save className="w-4 h-4" />
            Salvar alterações
          </button>
        </div>
        <FormLoadingOverlay mensagem="Salvando evento..." />
      </form>
    </div>
  )
}

function SectionTitle({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, children, icon: Icon, compact }: { label: string; children: React.ReactNode; icon?: React.ElementType; compact?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className={`flex items-center gap-1.5 font-medium text-slate-700 ${compact ? 'text-xs' : 'text-sm'}`}>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        {label}
      </label>
      {children}
    </div>
  )
}
