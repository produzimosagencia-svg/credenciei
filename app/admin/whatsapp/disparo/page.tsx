import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase-server'
import { numerosWhatsApp, templatesAprovados } from '@/lib/whatsapp-painel'
import FormDisparo from './FormDisparo'

export const revalidate = 0

/**
 * Disparo em massa.
 *
 * A tela inteira gira em torno de uma coisa: ver quem vai receber ANTES de
 * mandar. Mil mensagens saem em minutos e não voltam, e a diferença entre
 * acertar o setor e acertar o evento inteiro é um clique.
 */
export default async function DisparoPage() {
  const [{ data: eventos }, templates, numeros] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome, ativo, data_inicio').order('data_inicio', { ascending: false }).limit(50),
    templatesAprovados(),
    numerosWhatsApp(),
  ])
  const { data: setores } = await supabaseAdmin.from('fornecedores').select('id, nome, evento_id')

  const aprovados = templates.filter(t => t.status === 'APPROVED' && t.categoria !== 'AUTHENTICATION')
  if (!eventos?.length) redirect('/admin')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Plataforma de Disparos WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-500">Crie um novo disparo usando a API oficial da Meta.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/whatsapp" className="btn btn-secundario"><ArrowLeft className="h-4 w-4" /> Painel</Link>
          <Link href="/admin/whatsapp/disparo" className="btn btn-secundario"><RefreshCw className="h-4 w-4" /> Atualizar</Link>
        </div>
      </div>

      {!aprovados.length || !numeros.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {!numeros.length ? 'Nenhum número conectado foi encontrado na conta da Meta.' : 'Nenhum template comum aprovado foi encontrado na Meta.'}
        </div>
      ) : (
        <FormDisparo
          eventos={(eventos ?? []).map(e => ({ id: e.id, nome: e.nome, ativo: e.ativo !== false }))}
          setores={(setores ?? []).map(s => ({ id: s.id, nome: s.nome, eventoId: s.evento_id as string }))}
          templates={aprovados.map(t => ({ nome: t.nome, variaveis: t.variaveis, corpo: t.corpo, categoria: t.categoria, idioma: t.idioma }))}
          numeros={numeros}
        />
      )}
    </div>
  )
}
