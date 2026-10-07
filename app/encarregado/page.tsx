import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Eye, Building2 } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { vinculosDoEncarregado } from '@/lib/encarregado-consulta'
import { caminhoDoSetor } from '@/lib/encarregado'
import { EmptyState, PageHeader } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * A porta de entrada do Encarregado: os setores em que ele foi designado.
 * Um só → vai direto pra equipe dele; mais de um → escolhe.
 */
export default async function EncarregadoHome() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const vinculos = await vinculosDoEncarregado(perfil.id as string)
  if (vinculos.length === 1) redirect(`/encarregado/${vinculos[0].fornecedorId}`)

  if (!vinculos.length) {
    return (
      <EmptyState
        icone={<Eye className="w-7 h-7" />}
        titulo="Nenhum setor liberado"
        descricao="Seu acesso de Encarregado não está ligado a nenhum setor no momento. Fale com o seu supervisor."
      />
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader titulo="Seus setores" descricao="Escolha a equipe que você quer consultar" />
      <ul className="space-y-2">
        {vinculos.map(v => (
          <li key={v.vinculoId}>
            <Link
              href={`/encarregado/${v.fornecedorId}`}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:border-brand-300 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-slate-800 text-sm font-bold truncate">{v.setor}</span>
                <span className="block text-slate-400 text-xs truncate">{caminhoDoSetor(v)}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
