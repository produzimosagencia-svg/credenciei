import { getPerfil, eventosEscaneaveis } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { podeEscanear } from '@/lib/permissions'
import ScannerView from './ScannerView'
import { QrCode } from 'lucide-react'
import Link from 'next/link'

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const [{ evento }, perfil] = await Promise.all([searchParams, getPerfil()])
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil.role)) redirect('/admin')

  // Eventos que ESTE usuário pode escanear:
  // master → todos ativos | admin → da própria org | supervisor → só vinculados
  const eventos = await eventosEscaneaveis(perfil)

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Credenciei</span>
        </div>
        <Link href="/admin" className="text-slate-400 text-sm hover:text-white font-medium transition-colors">
          Voltar ao painel
        </Link>
      </div>
      {!eventos?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
          <QrCode className="w-10 h-10 text-slate-700" />
          <p className="text-slate-400 font-medium">Nenhum evento ativo disponível</p>
        </div>
      ) : (
        <ScannerView eventos={eventos} initialEventoId={evento} />
      )}
    </div>
  )
}
