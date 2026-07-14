import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { podeGerenciarUsuarios, ehMaster } from '@/lib/permissions'
import NovoUsuarioForm from './NovoUsuarioForm'

export default async function NovoUsuarioPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) redirect('/admin')
  // Master não cria equipe aqui — cria admins/organizações
  if (ehMaster(perfil?.role)) redirect('/admin/organizacoes/novo')

  // Eventos ativos da própria organização, com os setores (fornecedores) de cada um —
  // todo supervisor tem que ser criado vinculado a um setor específico.
  const { data: eventos } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, fornecedores(id, nome)')
    .eq('ativo', true)
    .eq('organizacao_id', perfil!.organizacao_id)
    .order('data_inicio', { ascending: false })

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/usuarios" className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Novo Usuário</h1>
          <p className="text-slate-400 text-sm">Crie o acesso e defina o papel no sistema</p>
        </div>
      </div>

      <NovoUsuarioForm eventos={eventos ?? []} />
    </div>
  )
}
