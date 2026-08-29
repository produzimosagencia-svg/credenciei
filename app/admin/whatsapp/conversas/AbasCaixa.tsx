import Link from 'next/link'
import { MessagesSquare, Megaphone } from 'lucide-react'

export default function AbasCaixa({ ativa }: { ativa: 'conversas' | 'disparos' }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
      <Link
        href="/admin/whatsapp/conversas"
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${ativa === 'conversas' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
      >
        <MessagesSquare className="w-4 h-4" /> Conversas
      </Link>
      <Link
        href="/admin/whatsapp/conversas?aba=disparos"
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${ativa === 'disparos' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
      >
        <Megaphone className="w-4 h-4" /> Disparos
      </Link>
    </div>
  )
}
