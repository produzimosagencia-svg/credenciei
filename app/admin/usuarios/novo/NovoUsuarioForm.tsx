'use client'
import { criarUsuario } from '@/lib/actions'
import { NomeInput } from '@/components/inputs'

type Evento = { id: string; nome: string }

export default function NovoUsuarioForm({ eventos }: { eventos: Evento[] }) {
  return (
    <form action={criarUsuario} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium">
          Este acesso é da sua <strong>equipe de credenciamento</strong>: pode escanear e conferir
          QR codes nos eventos selecionados. Não gerencia eventos nem outros usuários.
        </p>
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
        <label className="text-sm font-medium text-slate-700">Senha *</label>
        <input name="senha" type="password" required placeholder="Mínimo 6 caracteres" minLength={6} className="input" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Eventos que pode escanear *</label>
        {!eventos.length ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
            Nenhum evento ativo. Crie um evento antes de cadastrar a equipe.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-3">
            {eventos.map(e => (
              <label key={e.id} className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
                <input type="checkbox" name="evento_ids" value={e.id} className="accent-[#4940df] w-4 h-4" />
                {e.nome}
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-brand-200"
      >
        Criar acesso
      </button>
    </form>
  )
}
