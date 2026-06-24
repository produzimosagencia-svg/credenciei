import { getPerfil } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { criarCliente } from '@/lib/actions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function NovoClientePage() {
  const perfil = await getPerfil()
  if (perfil?.role !== 'admin') redirect('/admin')

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/clientes" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Novo Cliente</h1>
          <p className="text-slate-400 text-sm">Crie o acesso para o cliente</p>
        </div>
      </div>

      <form action={criarCliente} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Nome *</label>
          <input name="nome" required placeholder="Nome do cliente ou empresa" className="input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">E-mail *</label>
          <input name="email" type="email" required placeholder="email@cliente.com" className="input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Senha *</label>
          <input name="senha" type="password" required placeholder="Mínimo 6 caracteres" minLength={6} className="input" />
        </div>
        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-semibold transition-all shadow-md shadow-orange-200">
          Criar Cliente
        </button>
      </form>
    </div>
  )
}
