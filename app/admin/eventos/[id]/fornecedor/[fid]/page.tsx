import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
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

  const formLink = `http://localhost:3000/form/${fornecedor.token_formulario}`

  const funcionariosEnriquecidos = (funcionarios ?? []).map(f => ({
    ...f,
    status: statusMap[f.id] ?? 'ausente' as const,
    ultimo_registro: lastMap[f.id] ?? null,
  }))

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/admin/eventos/${id}`} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{fornecedor.nome}</h1>
            <p className="text-slate-400 text-sm">{(fornecedor.eventos as any)?.nome}</p>
          </div>
        </div>
        <CopyLinkButton link={formLink} label="Copiar link do formulário" />
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: funcionarios?.length ?? 0, color: 'text-white' },
          { label: 'Dentro agora', value: dentro, color: 'text-green-400' },
          { label: 'Já saíram', value: saiu, color: 'text-yellow-400' },
          { label: 'Não apareceram', value: ausente, color: 'text-slate-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-slate-400 text-xs mt-1">{label}</p>
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
