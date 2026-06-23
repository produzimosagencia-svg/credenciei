import { supabase } from '@/lib/supabase'
import ScannerView from './ScannerView'

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
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
        <h1 className="text-white font-bold">Credenciamento</h1>
        <a href="/admin" className="text-slate-400 text-sm hover:text-white">Painel admin</a>
      </div>
      <ScannerView eventos={eventos ?? []} initialEventoId={evento} />
    </div>
  )
}
