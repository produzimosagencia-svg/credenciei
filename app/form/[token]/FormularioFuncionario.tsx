'use client'
import { useRef, useState } from 'react'
import { Camera as CameraIcon, X } from 'lucide-react'
import { cadastrarFuncionarioPublico } from '@/lib/actions'
import { formatCpf, formatTelefone, titleCaseNome } from '@/lib/format'

const initialForm = {
  nome: '',
  cpf: '',
  telefone: '',
  empresa: '',
  cargo: '',
  chavePix: '',
}

// Reduz a foto antes de enviar (mesmo padrão de app/credential/[token]/CheckinPresenca.tsx)
function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const max = 640
      let { width, height } = img
      if (width > height && width > max) { height = Math.round((height * max) / width); width = max }
      else if (height >= width && height > max) { width = Math.round((width * max) / height); height = max }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')) }
    img.src = url
  })
}

export default function FormularioFuncionario({ fornecedorId }: { fornecedorId: string }) {
  const [form, setForm] = useState(initialForm)
  const [foto, setFoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setFoto(await comprimir(file))
    } catch {
      // foto é opcional — falha na compressão não impede o cadastro
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await cadastrarFuncionarioPublico(fornecedorId, {
      nome: form.nome,
      cpf: form.cpf,
      telefone: form.telefone,
      empresa: form.empresa,
      cargo: form.cargo,
      chavePix: form.chavePix,
      fotoBase64: foto ?? undefined,
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
      <Field label="Foto (opcional)">
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFoto} />
        {foto ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="Prévia da foto" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
            <button type="button" onClick={() => setFoto(null)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Remover
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-3 text-slate-500 text-sm hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            <CameraIcon className="w-4 h-4" /> Tirar foto
          </button>
        )}
      </Field>
      <Field label="Nome completo *">
        <input required value={form.nome} onChange={e => set('nome', titleCaseNome(e.target.value))} placeholder="Seu nome completo" className="input" />
      </Field>
      <Field label="CPF *">
        <input required value={form.cpf} onChange={e => set('cpf', formatCpf(e.target.value))} placeholder="000.000.000-00" className="input" inputMode="numeric" />
      </Field>
      <Field label="Telefone *">
        <input required value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} placeholder="(11) 99999-9999" className="input" inputMode="tel" />
      </Field>
      <Field label="Empresa *">
        <input required value={form.empresa} onChange={e => set('empresa', titleCaseNome(e.target.value))} placeholder="Nome da sua empresa" className="input" />
      </Field>
      <Field label="Cargo *">
        <input required value={form.cargo} onChange={e => set('cargo', titleCaseNome(e.target.value))} placeholder="Ex: Segurança, Garçom..." className="input" />
      </Field>
      <Field label="Chave PIX (opcional)">
        <input value={form.chavePix} onChange={e => set('chavePix', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" className="input" />
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
