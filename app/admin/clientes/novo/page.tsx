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
        <Link href="/admin/clientes" className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Novo Cliente</h1>
          <p className="text-slate-400 text-sm">Crie o acesso para o cliente</p>
        </div>
      </div>

      <form action={criarCliente} className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-slate-300">Nome *</label>
          <input name="nome" required placeholder="Nome do cliente ou empresa" className="input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-slate-300">E-mail *</label>
          <input name="email" type="email" required placeholder="email@cliente.com" className="input" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-slate-300">Senha *</label>
          <input name="senha" type="password" required placeholder="Mínimo 6 caracteres" minLength={6} className="input" />
        </div>
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-medium transition-colors text-sm">
          Criar Cliente
        </button>
      </form>
    </div>
  )
}
