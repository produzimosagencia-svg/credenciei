'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarSupervisor } from '@/lib/actions'
import { NomeInput, TelefoneInput } from '@/components/inputs'

type Fornecedor = { id: string; nome: string }
type Evento = { id: string; nome: string; fornecedores: Fornecedor[] }

export default function NovoUsuarioForm({ eventos }: { eventos: Evento[] }) {
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const evento = eventos.find(e => e.id === eventoId)
  const setores = evento?.fornecedores ?? []

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    const fornecedorId = formData.get('fornecedor_id') as string
    if (!fornecedorId) {
      setErro('Selecione o setor do supervisor')
      return
    }
    startTransition(async () => {
      try {
        await criarSupervisor(fornecedorId, eventoId, formData)
        router.push('/admin/usuarios')
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao cadastrar supervisor')
      }
    })
  }

  if (!eventos.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <p className="text-slate-500 text-sm">
          Cadastre um evento e ao menos um setor (fornecedor) antes de criar supervisores.
        </p>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium">
          O supervisor é vinculado a <strong>um único setor</strong>: só escaneia e gerencia a
          equipe daquele setor específico.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Evento *</label>
        <select
          value={eventoId}
          onChange={e => setEventoId(e.target.value)}
          className="input"
        >
          {eventos.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Setor *</label>
        {!setores.length ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
            Este evento ainda não tem setores (fornecedores) cadastrados.
          </p>
        ) : (
          <select name="fornecedor_id" required className="input">
            {setores.map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Nome *</label>
        <NomeInput name="nome" required placeholder="Nome da pessoa" className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">E-mail *</label>
        <input name="email" type="email" required placeholder="email@exemplo.com" className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Telefone</label>
        <TelefoneInput name="telefone" placeholder="(11) 99999-9999" className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Senha *</label>
        <input name="senha" type="password" required placeholder="Mínimo 6 caracteres" minLength={6} className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Status</label>
        <select name="ativo" defaultValue="true" className="input">
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </div>

      {erro && <p className="text-red-500 text-xs">{erro}</p>}

      <button
        type="submit"
        disabled={isPending || !setores.length}
        className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-brand-200"
      >
        {isPending ? 'Criando...' : 'Criar acesso'}
      </button>
    </form>
  )
}
