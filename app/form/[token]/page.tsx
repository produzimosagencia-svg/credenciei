import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import FormularioFuncionario from './FormularioFuncionario'
import { QrCode } from 'lucide-react'

export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: fornecedor } = await supabase
    .from('fornecedores')
    .select('*, eventos(nome, local, data_inicio)')
    .eq('token_formulario', token)
    .single()

  if (!fornecedor) notFound()

  const evento = (fornecedor.eventos as any)

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-500 rounded-2xl mb-4 shadow-lg shadow-orange-200">
            <QrCode className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Credenciamento</h1>
          <p className="text-slate-600 text-sm font-medium mt-1">{evento?.nome}</p>
          <p className="text-slate-400 text-xs mt-0.5">Empresa: {fornecedor.nome}</p>
        </div>
        <FormularioFuncionario fornecedorId={fornecedor.id} />
      </div>
    </div>
  )
}
