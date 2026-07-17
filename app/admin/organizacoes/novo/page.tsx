import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, User, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarOrganizacoes } from '@/lib/permissions'
import { criarOrganizacao } from '@/lib/actions'
import { NomeInput, CpfCnpjInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'

export default async function NovaOrganizacaoPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) redirect('/admin')

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/organizacoes" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nova Organização</h1>
          <p className="text-slate-400 text-sm">Cria a organização, o admin dono dela e o primeiro evento</p>
        </div>
      </div>

      <form action={criarOrganizacao} className="space-y-5">
        {/* Organização */}
        <Section icon={Building2} title="Organização">
          <Field label="Nome da organização *">
            <NomeInput name="org_nome" required placeholder="Ex: Brilha Shows" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CPF ou CNPJ">
              <CpfCnpjInput name="documento" placeholder="000.000.000-00" className="input" />
            </Field>
            <Field label="Limite de eventos *">
              <input name="limite_eventos" type="number" min={1} defaultValue={1} required className="input" />
            </Field>
          </div>
          <Field label="Responsável">
            <NomeInput name="responsavel_nome" placeholder="Nome do responsável pela empresa" className="input" />
          </Field>
        </Section>

        {/* Admin */}
        <Section icon={User} title="Login do admin">
          <Field label="Nome do admin *">
            <NomeInput name="admin_nome" required placeholder="Nome de quem vai gerenciar" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="E-mail *">
              <input name="email" type="email" required placeholder="email@exemplo.com" className="input" />
            </Field>
            <Field label="Senha *">
              <input name="senha" type="password" required minLength={6} placeholder="Mín. 6 caracteres" className="input" />
            </Field>
          </div>
        </Section>

        {/* Primeiro evento (opcional) */}
        <Section icon={CalendarDays} title="Primeiro evento (opcional)">
          <p className="text-xs text-slate-400 -mt-1">
            Você pode já cadastrar o primeiro evento aqui, ou deixar em branco e o próprio admin cria
            depois — ele poderá criar até o limite de licenças definido acima.
          </p>
          <Field label="Nome do evento">
            <NomeInput name="evento_nome" placeholder="Ex: Show da Virada 2026" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data de início">
              <DateTimePicker name="data_inicio" />
            </Field>
            <Field label="Data de fim">
              <DateTimePicker name="data_fim" />
            </Field>
          </div>
          <Field label="Local">
            <input name="local" placeholder="Ex: Arena, São Paulo" className="input" />
          </Field>
        </Section>

        <button
          type="submit"
          className="w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-brand-200"
        >
          Criar organização
        </button>
        <FormLoadingOverlay mensagem="Criando organização..." />
      </form>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-slate-700">
        <Icon className="w-4 h-4 text-brand-500" />
        <h2 className="font-bold text-sm">{title}</h2>
      </div>
      {children}
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
