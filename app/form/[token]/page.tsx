import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import FormularioFuncionario from './FormularioFuncionario'

export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: fornecedor } = await supabase
    .from('fornecedores')
    .select('*, eventos(nome, local, data_inicio)')
    .eq('token_formulario', token)
    .single()

  if (!fornecedor) notFound()

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Credenciamento</h1>
          <p className="text-slate-400 text-sm mt-1">{(fornecedor.eventos as any)?.nome}</p>
          <p className="text-slate-500 text-xs mt-0.5">Empresa: {fornecedor.nome}</p>
        </div>
        <FormularioFuncionario fornecedorId={fornecedor.id} />
      </div>
    </div>
  )
}
