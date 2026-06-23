import { supabase } from '@/lib/supabase'
import ScannerView from './ScannerView'
import { QrCode } from 'lucide-react'
import Link from 'next/link'

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const { evento } = await searchParams

  const { data: eventos } = await supabase
    .from('eventos')
    .select('id, nome')
    .eq('ativo', true)
    .order('data_inicio', { ascending: false })

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="px-4 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Credenciei</span>
        </div>
        <Link href="/admin" className="text-slate-400 text-sm hover:text-white font-medium transition-colors">
          Painel admin
        </Link>
      </div>
      <ScannerView eventos={eventos ?? []} initialEventoId={evento} />
    </div>
  )
}
