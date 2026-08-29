'use client'
import { useState, useTransition } from 'react'
import { UserPlus, X } from 'lucide-react'
import { criarFuncionario } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { mensagemAmigavel } from '@/lib/erros'

export default function NovoFuncionarioModal({
  fornecedorId,
  eventoId,
}: {
  fornecedorId: string
  eventoId: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      try {
        await criarFuncionario(fornecedorId, eventoId, formData)
        setOpen(false)
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 btn btn-primario btn-sm"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Cadastrar funcionário
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-slate-800 font-bold">Cadastrar funcionário</h2>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <Field label="Nome completo *">
                <NomeInput name="nome" required placeholder="Nome do funcionário" className="input" />
              </Field>
              <Field label="CPF *">
                <CpfInput name="cpf" required placeholder="000.000.000-00" className="input" />
              </Field>
              <Field label="Telefone *">
                <TelefoneInput name="telefone" required placeholder="(11) 99999-9999" className="input" />
              </Field>
              <Field label="Cargo *">
                <NomeInput name="cargo" required placeholder="Ex: Segurança, Garçom..." className="input" />
              </Field>

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <button
                type="submit"
                disabled={isPending}
                className="btn btn-primario btn-lg w-full"
              >
                {isPending ? 'Cadastrando...' : 'Cadastrar funcionário'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
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
