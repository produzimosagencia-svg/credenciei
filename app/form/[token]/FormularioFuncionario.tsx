'use client'
import { useState } from 'react'
import { cadastrarFuncionarioPublico } from '@/lib/actions'

const initialForm = {
  nome: '',
  cpf: '',
  telefone: '',
  empresa: '',
  cargo: '',
}

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export default function FormularioFuncionario({ fornecedorId }: { fornecedorId: string }) {
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)

  const set = (field: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await cadastrarFuncionarioPublico(fornecedorId, {
      nome: form.nome,
      cpf: form.cpf,
      telefone: form.telefone,
      empresa: form.empresa,
      cargo: form.cargo,
    })

    if (res.qrToken) {
      setQrToken(res.qrToken)
    } else {
      alert(res.error ?? 'Erro ao enviar formulário. Tente novamente.')
    }
    setLoading(false)
  }

  if (qrToken) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-2xl mb-2 shadow-lg shadow-green-200">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-slate-800 font-bold text-xl">Cadastro realizado!</h2>
        <p className="text-slate-500 text-sm">
          Salve o link abaixo. Nele está seu QR code (apresente na entrada e na saída) e o registro por foto durante o evento.
        </p>
        <a
          href={`/credential/${qrToken}`}
          className="block w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold transition-all text-sm shadow-md shadow-brand-200"
        >
          Abrir minha credencial →
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <Field label="Nome completo *">
        <input required value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Seu nome completo" className="input" />
      </Field>
      <Field label="CPF *">
        <input required value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} placeholder="000.000.000-00" className="input" inputMode="numeric" />
      </Field>
      <Field label="Telefone *">
        <input required value={form.telefone} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(11) 99999-9999" className="input" inputMode="tel" />
      </Field>
      <Field label="Empresa *">
        <input required value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Nome da sua empresa" className="input" />
      </Field>
      <Field label="Cargo *">
        <input required value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Ex: Segurança, Garçom..." className="input" />
      </Field>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-all text-sm shadow-md shadow-brand-200"
      >
        {loading ? 'Enviando...' : 'Enviar e gerar minha presença →'}
      </button>
    </form>
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
