'use client'
import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertCircle, Pencil, X } from 'lucide-react'
import { editarDadosDaPessoaNaBase } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'

/**
 * "Editar dados" na ficha da pessoa (Base de funcionários) — só o master vê
 * este botão, e o servidor recusa qualquer outro (`editarDadosDaPessoaNaBase`).
 *
 * A pessoa existe uma vez por evento, então a edição vale pra todos os
 * cadastros dela — a janela diz quantos, antes de salvar. A função (cargo)
 * não está aqui: ela muda de evento pra evento.
 */
export default function EditarDadosPessoa({
  cpf, nome, telefone, cidade, chavePix, cadastros, eventos,
}: {
  cpf: string
  nome: string
  telefone: string
  cidade: string
  chavePix: string
  /** Quantos cadastros (linhas por evento) esta pessoa tem — o que a edição atinge. */
  cadastros: number
  eventos: number
}) {
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState({ nome, cpf, telefone, cidade, chavePix })
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const set = (campo: keyof typeof form) => (valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  const abrir = () => { setForm({ nome, cpf, telefone, cidade, chavePix }); setErro(null); setAberto(true) }

  const salvar = () => {
    setErro(null)
    startTransition(async () => {
      try {
        const r = await editarDadosDaPessoaNaBase(cpf, form)
        if ('erro' in r) { setErro(r.erro); return }
        setAberto(false)
        // O CPF faz parte do endereço da ficha: se mudou, vai pra ficha nova.
        if (r.cpf !== cpf) router.replace(`/admin/pessoas/${r.cpf}`)
        else router.refresh()
      } catch {
        setErro('Não consegui salvar — confira a internet e tente de novo.')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={abrir} className="btn btn-secundario btn-sm">
        <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar dados
      </button>

      {aberto && createPortal(
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => !isPending && setAberto(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-xl space-y-4 text-left" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-slate-800 font-bold text-base">Editar dados da pessoa</h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Vale para <strong>{cadastros} cadastro{cadastros === 1 ? '' : 's'}</strong> desta pessoa em{' '}
                  <strong>{eventos} evento{eventos === 1 ? '' : 's'}</strong>.
                </p>
              </div>
              <button type="button" onClick={() => setAberto(false)} disabled={isPending} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome completo *</label>
              <NomeInput defaultValue={form.nome} onValueChange={set('nome')} className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">CPF *</label>
              <CpfInput defaultValue={form.cpf} onValueChange={set('cpf')} placeholder="000.000.000-00" className="input" />
              {form.cpf.replace(/\D/g, '') !== cpf && (
                <p className="text-amber-700 text-xs mt-1">
                  O CPF é a identidade da pessoa. Mudar aqui corrige em todos os cadastros dela — use só para corrigir erro de digitação.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Telefone (WhatsApp) *</label>
              <TelefoneInput defaultValue={form.telefone} onValueChange={set('telefone')} placeholder="(00) 00000-0000" className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Cidade onde mora</label>
              <input value={form.cidade} onChange={e => set('cidade')(e.target.value)} placeholder="Ex: Vitória" className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Chave PIX</label>
              <input value={form.chavePix} onChange={e => set('chavePix')(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" className="input" />
            </div>

            {erro && (
              <p className="flex items-start gap-1.5 text-erro-600 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={salvar} disabled={isPending} className="flex-1 btn btn-primario">
                {isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setAberto(false)} disabled={isPending} className="btn btn-secundario">Cancelar</button>
            </div>
            <p className="text-slate-400 text-2xs">Cada campo alterado fica registrado na auditoria, com o seu nome.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
