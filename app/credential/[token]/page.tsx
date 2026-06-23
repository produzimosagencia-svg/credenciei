import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import QRCodeDisplay from './QRCodeDisplay'

export default async function CredentialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: funcionario } = await supabase
    .from('funcionarios')
    .select('*, fornecedores(nome, eventos(nome, local, data_inicio))')
    .eq('qr_token', token)
    .single()

  if (!funcionario) notFound()

  const fornecedor = funcionario.fornecedores as any
  const evento = fornecedor?.eventos

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
          <div className="bg-blue-600 p-6 text-center">
            <p className="text-blue-200 text-xs uppercase tracking-widest font-medium">Credencial Oficial</p>
            <h1 className="text-white font-bold text-xl mt-1">{evento?.nome ?? 'Evento'}</h1>
            {evento?.local && <p className="text-blue-200 text-sm mt-0.5">{evento.local}</p>}
          </div>

          <div className="p-6 space-y-6">
            <div className="text-center">
              <p className="text-white font-bold text-lg">{funcionario.nome}</p>
              <p className="text-slate-400 text-sm">{funcionario.cargo}</p>
              <p className="text-slate-500 text-xs">{fornecedor?.nome}</p>
            </div>

            <QRCodeDisplay token={token} />

            <div className="grid grid-cols-2 gap-3 text-center text-xs">
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-slate-500">CPF</p>
                <p className="text-slate-300 mt-0.5">
                  {funcionario.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                </p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-3">
                <p className="text-slate-500">Empresa</p>
                <p className="text-slate-300 mt-0.5 truncate">{funcionario.empresa}</p>
              </div>
            </div>

            <p className="text-center text-slate-600 text-xs">Apresente este QR Code na entrada e saída do evento</p>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          Salve esta página nos seus favoritos para acesso rápido
        </p>
      </div>
    </div>
  )
}
