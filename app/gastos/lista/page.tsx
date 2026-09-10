import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import { eventosParaGastos, listarGastos, fornecedoresDe, type FiltroGastos } from '@/lib/gastos'
import SeletorEvento from '../SeletorEvento'
import ListaGastos from './ListaGastos'

export const revalidate = 0

export default async function ListaGastosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; categoria?: string; fornecedor?: string; de?: string; ate?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeRegistrarGastos(perfil)) redirect('/admin')

  const p = await searchParams
  const eventos = await eventosParaGastos()
  if (!eventos.length) redirect('/gastos')

  const eventoAtual = eventos.find(e => e.id === p.evento) ?? eventos.find(e => e.ativo) ?? eventos[0]

  const filtro: FiltroGastos = {
    eventoId: eventoAtual.id,
    categoria: p.categoria || undefined,
    fornecedor: p.fornecedor || undefined,
    de: p.de || undefined,
    ate: p.ate || undefined,
  }
  const gastos = await listarGastos(filtro)
  // Fornecedores da lista SEM o filtro de fornecedor aplicado — senão a opção
  // some da lista assim que é escolhida.
  const fornecedores = fornecedoresDe(await listarGastos({ eventoId: eventoAtual.id }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/gastos?evento=${eventoAtual.id}`} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm">
          <ArrowLeft className="w-4 h-4" /> Registrar
        </Link>
        <Link href={`/gastos/painel?evento=${eventoAtual.id}`} className="text-brand-600 hover:underline text-sm">Dashboard</Link>
      </div>

      <SeletorEvento eventos={eventos} atual={eventoAtual.id} />

      <ListaGastos gastos={gastos} eventos={eventos} fornecedores={fornecedores} eventoAtualId={eventoAtual.id} />
    </div>
  )
}
