'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Camera as CameraIcon, X, CheckCircle2 } from 'lucide-react'
import { registrarPresencaManual } from '@/lib/actions'
import { formatCpf } from '@/lib/format'

type Momento = 'entrada' | 'meio' | 'fim'

const MOMENTOS: { value: Momento; label: string }[] = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'meio', label: 'Meio do evento' },
  { value: 'fim', label: 'Saída' },
]

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

/**
 * Plano B de campo: funcionário sem celular/bateria não consegue registrar o
 * ponto — o supervisor registra por ele, digitando o CPF e tirando uma foto
 * DA PESSOA na hora (obrigatória, é ela que impede burla). O registro fica
 * marcado como manual, com o autor, para auditoria.
 */
export default function RegistroManualModal({ fornecedorId, eventoId }: { fornecedorId: string; eventoId: string }) {
  const [open, setOpen] = useState(false)
  const [cpf, setCpf] = useState('')
  const [momento, setMomento] = useState<Momento>('entrada')
  const [foto, setFoto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const fechar = () => {
    if (isPending) return
    setOpen(false)
    setCpf('')
    setMomento('entrada')
    setFoto(null)
    setErro(null)
    setSucesso(null)
  }

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setFoto(await comprimir(file))
      setErro(null)
    } catch {
      setErro('Não foi possível processar essa foto. Tente outra.')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!foto) {
      setErro('A foto da pessoa é obrigatória no registro manual.')
      return
    }
    startTransition(async () => {
      const res = await registrarPresencaManual(fornecedorId, eventoId, { cpf, momento, fotoBase64: foto })
      if (res.error) {
        setErro(res.error)
        return
      }
      setSucesso(res.nome ?? 'Funcionário')
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm px-3 py-2 bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-600 text-slate-600 rounded-xl transition-all shadow-sm font-semibold"
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        Registro manual
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={fechar}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-slate-800 font-bold">Registro manual de presença</h2>
              <button onClick={fechar} disabled={isPending} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {sucesso ? (
              <div className="p-6 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <p className="text-slate-800 font-semibold">Presença registrada!</p>
                <p className="text-slate-500 text-sm">
                  {sucesso} — {MOMENTOS.find(m => m.value === momento)?.label.toLowerCase()}
                </p>
                <button
                  onClick={fechar}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-all"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <p className="text-slate-500 text-xs">
                  Para quando o funcionário está sem celular ou sem bateria: digite o CPF dele e tire uma foto da pessoa na hora. O registro fica marcado como manual, com você como responsável.
                </p>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">CPF do funcionário *</label>
                  <input
                    required
                    value={cpf}
                    onChange={e => setCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="input"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Etapa *</label>
                  <select value={momento} onChange={e => setMomento(e.target.value as Momento)} className="input">
                    {MOMENTOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Foto da pessoa (na hora) *</label>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} />
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
                      className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
                    >
                      <CameraIcon className="w-4 h-4" /> Tirar foto
                    </button>
                  )}
                </div>
                {erro && <p className="text-red-500 text-xs">{erro}</p>}
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-brand-200"
                >
                  {isPending ? 'Registrando...' : 'Registrar presença'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
