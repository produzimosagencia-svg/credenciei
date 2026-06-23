import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import QRCodeDisplay from './QRCodeDisplay'
import { QrCode } from 'lucide-react'

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
          {/* Header colorido */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-6 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-white/20 rounded-xl mb-3">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <p className="text-orange-100 text-xs uppercase tracking-widest font-semibold">Credencial Oficial</p>
            <h1 className="text-white font-bold text-xl mt-1">{evento?.nome ?? 'Evento'}</h1>
            {evento?.local && <p className="text-orange-100 text-sm mt-0.5">{evento.local}</p>}
          </div>

          <div className="px-6 py-6 space-y-5">
            {/* Dados do funcionário */}
            <div className="text-center pb-4 border-b border-slate-100">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-slate-400">{funcionario.nome.charAt(0)}</span>
              </div>
              <p className="text-slate-800 font-bold text-lg leading-tight">{funcionario.nome}</p>
              <p className="text-orange-500 text-sm font-semibold mt-0.5">{funcionario.cargo}</p>
              <p className="text-slate-400 text-xs mt-0.5">{fornecedor?.nome}</p>
            </div>

            {/* QR Codes */}
            <QRCodeDisplay token={token} />

            {/* Infos */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-slate-400 text-[10px] uppercase tracking-wide font-semibold">CPF</p>
                <p className="text-slate-700 text-xs font-semibold mt-0.5">
                  {funcionario.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-slate-400 text-[10px] uppercase tracking-wide font-semibold">Empresa</p>
                <p className="text-slate-700 text-xs font-semibold mt-0.5 truncate">{funcionario.empresa}</p>
              </div>
            </div>

            <p className="text-center text-slate-400 text-xs">Selecione o QR Code de Entrada ou Saída</p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Salve esta página nos favoritos para acesso rápido
        </p>
      </div>
    </div>
  )
}
