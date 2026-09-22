import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Database } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarOrcamentos } from '@/lib/permissions'
import { listarOrcamentos } from '@/lib/orcamentos'
import { PageHeader, Secao } from '@/components/ui/Superficie'
import TabelaOrcamentos from './TabelaOrcamentos'

export const revalidate = 0

/**
 * Orçamentos — o time comercial monta uma proposta profissional (PDF, marca
 * Credenciei) sem sair do sistema. Master-only: valores comerciais da
 * agência, mesmo corte de acesso do Backlog e do Financeiro.
 */
export default async function OrcamentosPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarOrcamentos(perfil)) redirect('/admin')

  let orcamentos
  try {
    orcamentos = await listarOrcamentos()
  } catch (e) {
    return <BancoPendente detalhe={e instanceof Error ? e.message : String(e)} />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Orçamentos"
        descricao="Crie, gerencie e gere orçamentos profissionais para seus clientes diretamente pelo Credenciei."
        acoes={<Link href="/admin/orcamentos/novo" className="btn btn-primario"><Plus className="w-4 h-4" /> Novo orçamento</Link>}
      />
      <TabelaOrcamentos orcamentos={orcamentos} />
    </div>
  )
}

function BancoPendente({ detalhe }: { detalhe: string }) {
  return (
    <div className="space-y-5">
      <PageHeader titulo="Orçamentos" descricao="Falta um passo antes de usar" />
      <Secao tom="aviso" icone={<Database className="w-3.5 h-3.5" />} titulo="O banco ainda não tem as tabelas de Orçamentos" corpoClassName="p-5">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Rode <code className="bg-slate-100 rounded px-1.5 py-0.5 text-slate-800">supabase/upgrade-orcamentos.sql</code>{' '}
            no SQL Editor do Supabase. Ele é aditivo e reversível: cria só as duas tabelas
            novas (<code className="bg-slate-100 rounded px-1 py-0.5">orcamentos</code> e{' '}
            <code className="bg-slate-100 rounded px-1 py-0.5">orcamento_itens</code>) e não
            encosta em nada que já existe.
          </p>
          <p className="text-slate-400 text-xs">Erro do banco: {detalhe}</p>
        </div>
      </Secao>
    </div>
  )
}
