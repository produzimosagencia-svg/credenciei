import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import FuncionarioTable from './FuncionarioTable'
import CopyLinkButton from '../../CopyLinkButton'

export const revalidate = 0

export default async function FornecedorPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params

  const [{ data: fornecedor }, { data: funcionarios }] = await Promise.all([
    supabase.from('fornecedores').select('*, eventos(nome)').eq('id', fid).single(),
    supabase.from('funcionarios').select('*').eq('fornecedor_id', fid).order('nome'),
  ])

  if (!fornecedor) notFound()

  const funcionarioIds = funcionarios?.map(f => f.id) ?? []
  const { data: registros } = funcionarioIds.length
    ? await supabase
        .from('registros')
        .select('*')
        .in('funcionario_id', funcionarioIds)
        .eq('evento_id', id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const statusMap: Record<string, 'dentro' | 'saiu' | 'ausente'> = {}
  const lastMap: Record<string, string> = {}
  for (const r of registros ?? []) {
    if (!statusMap[r.funcionario_id]) {
      statusMap[r.funcionario_id] = r.tipo === 'entrada' ? 'dentro' : 'saiu'
      lastMap[r.funcionario_id] = r.created_at
    }
  }

  const dentro = Object.values(statusMap).filter(s => s === 'dentro').length
  const saiu = Object.values(statusMap).filter(s => s === 'saiu').length
  const ausente = (funcionarios?.length ?? 0) - dentro - saiu

  const formLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/form/${fornecedor.token_formulario}`

  const funcionariosEnriquecidos = (funcionarios ?? []).map(f => ({
    ...f,
    status: statusMap[f.id] ?? 'ausente' as const,
    ultimo_registro: lastMap[f.id] ?? null,
  }))

  const stats = [
    { label: 'Total', value: funcionarios?.length ?? 0, color: 'text-slate-800', bg: 'bg-slate-100', border: 'border-slate-200' },
    { label: 'Dentro agora', value: dentro, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'Já saíram', value: saiu, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { label: 'Não apareceram', value: ausente, color: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-100' },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/admin/eventos/${id}`} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 transition-all shadow-sm">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{fornecedor.nome}</h1>
            <p className="text-slate-400 text-sm">{(fornecedor.eventos as any)?.nome}</p>
          </div>
        </div>
        <CopyLinkButton link={formLink} label="Copiar link do formulário" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, color, bg, border }) => (
          <div key={label} className={`bg-white border ${border} rounded-2xl p-4 text-center shadow-sm`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-slate-400 text-xs mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <FuncionarioTable
        funcionarios={funcionariosEnriquecidos}
        fornecedorId={fid}
        eventoId={id}
      />
    </div>
  )
}
