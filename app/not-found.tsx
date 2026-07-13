import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-100 rounded-2xl">
          <Compass className="w-7 h-7 text-brand-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-slate-800 font-bold text-lg">Página não encontrada</h2>
          <p className="text-slate-500 text-sm">O endereço não existe ou você não tem acesso a ele.</p>
        </div>
        <Link
          href="/admin"
          className="block w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-semibold transition-all text-sm shadow-md shadow-brand-200"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
