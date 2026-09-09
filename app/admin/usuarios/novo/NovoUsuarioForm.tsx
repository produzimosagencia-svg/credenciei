'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarSupervisor } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'

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
        setErro(mensagemAmigavel(e))
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

      <div className="space-y-1.5" data-tutorial="novo-usr-evento">
        <label className="text-sm font-medium text-slate-700">Evento *</label>
        <SeletorLista
          valor={eventoId}
          onChange={setEventoId}
          titulo="Escolha o evento"
          busca
          opcoes={eventos.map(e => ({ valor: e.id, rotulo: e.nome }))}
        />
      </div>

      <div className="space-y-1.5" data-tutorial="novo-usr-setor">
        <label className="text-sm font-medium text-slate-700">Setor *</label>
        {/* `key={eventoId}`: remonta ao trocar de evento, pra não herdar um
            setor escolhido que não existe mais na lista nova. */}
        {!setores.length ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
            Este evento ainda não tem setores (fornecedores) cadastrados.
          </p>
        ) : (
          <SeletorLista
            key={eventoId}
            name="fornecedor_id"
            required
            defaultValor=""
            titulo="Escolha o setor"
            busca
            opcoes={setores.map(s => ({ valor: s.id, rotulo: s.nome }))}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Nome *</label>
        <NomeInput name="nome" required placeholder="Nome da pessoa" className="input" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">CPF *</label>
        <CpfInput name="cpf" required placeholder="000.000.000-00" className="input" />
        <p className="text-xs text-slate-500">O supervisor usará o CPF para entrar no sistema.</p>
      </div>
      <div className="space-y-1.5" data-tutorial="novo-usr-telefone">
        <label className="text-sm font-medium text-slate-700">WhatsApp *</label>
        <TelefoneInput name="telefone" required placeholder="(11) 99999-9999" className="input" />
        <p className="text-xs text-slate-500">Supervisor novo recebe o link para criar a senha. Quem já tem cadastro recebe a nova escala.</p>
      </div>
      <div className="space-y-1.5" data-tutorial="novo-usr-status">
        <label className="text-sm font-medium text-slate-700">Status</label>
        <SeletorLista name="ativo" defaultValor="true" titulo="Status" opcoes={[
          { valor: 'true', rotulo: 'Ativo' },
          { valor: 'false', rotulo: 'Inativo' },
        ]} />
      </div>

      {erro && <p className="text-red-500 text-xs">{erro}</p>}

      <button
        type="submit"
        disabled={isPending || !setores.length}
        className="w-full btn btn-primario btn-lg"
      >
        {isPending ? 'Criando...' : 'Criar acesso'}
      </button>
      {isPending && <LoadingOverlay mensagem="Criando acesso..." />}
    </form>
  )
}
