'use client'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { LogOut } from 'lucide-react'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/** Sair do sistema a partir do shell enxuto de /gastos — mesma ação do AppShell. */
export default function BotaoSair() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }}
      className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium"
    >
      <LogOut className="w-3.5 h-3.5" /> Sair
    </button>
  )
}
