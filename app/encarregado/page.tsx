import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Eye, Building2, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { vinculosDoEncarregado, type VinculoDoEncarregado } from '@/lib/encarregado-consulta'
import { EmptyState, PageHeader } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * A porta de entrada do Encarregado — a mesma lógica do supervisor ("Meus
 * eventos" → "Meus fornecedores"): primeiro o evento, depois o setor. Um só
 * setor → vai direto pra equipe; um só evento → já mostra os setores.
 */
export default async function EncarregadoHome({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const vinculos = await vinculosDoEncarregado(perfil.id as string)
  if (vinculos.length === 1) redirect(`/encarregado/${vinculos[0].fornecedorId}`)

  if (!vinculos.length) {
    return (
      <EmptyState
        icone={<Eye className="w-7 h-7" />}
        titulo="Nenhum setor liberado"
        descricao="Seu acesso de Encarregado não está ligado a nenhum setor no momento. Fale com o seu supervisor."
      />
    )
  }

  const porEvento = new Map<string, VinculoDoEncarregado[]>()
  for (const v of vinculos) porEvento.set(v.eventoId, [...(porEvento.get(v.eventoId) ?? []), v])

  const { evento: eventoParam } = await searchParams
  const eventoEscolhido = eventoParam && porEvento.has(eventoParam)
    ? eventoParam
    : porEvento.size === 1 ? [...porEvento.keys()][0] : null

  // Passo 1 — qual evento (só quando há mais de um).
  if (!eventoEscolhido) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Seus eventos" descricao="Escolha o evento que você quer consultar" />
        <ul className="space-y-2">
          {[...porEvento.entries()].map(([id, lista]) => (
            <li key={id}>
              <Link
                href={`/encarregado?evento=${id}`}
                className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:border-brand-300 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><CalendarDays className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800 text-sm font-bold truncate">{lista[0].evento}</span>
                  <span className="block text-slate-400 text-xs">{lista.length} setor{lista.length === 1 ? '' : 'es'}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Passo 2 — qual setor desse evento.
  const doEvento = porEvento.get(eventoEscolhido)!
  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Seus setores"
        descricao={doEvento[0].evento}
        voltarPara={porEvento.size > 1 ? '/encarregado' : undefined}
      />
      <ul className="space-y-2">
        {doEvento.map(v => (
          <li key={v.vinculoId}>
            <Link
              href={`/encarregado/${v.fornecedorId}`}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:border-brand-300 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-slate-800 text-sm font-bold truncate">{v.setor}</span>
                {v.subevento && <span className="block text-slate-400 text-xs truncate">{v.subevento}</span>}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
