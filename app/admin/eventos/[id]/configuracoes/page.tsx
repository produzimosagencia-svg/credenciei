import { notFound, redirect } from 'next/navigation'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { obterFuncionalidadesDoEvento } from '@/lib/internos-servidor'
import { PageHeader } from '@/components/ui/Superficie'
import FuncionalidadesForm from '@/app/admin/configuracoes/FuncionalidadesForm'
import SeguirOrganizacao from './SeguirOrganizacao'

export const revalidate = 0

/**
 * "Configurações" DENTRO do evento (pedido do Juan, 09/10/2026): as mesmas opções de Configurações →
 * Funcionalidades, só que valendo para ESTE evento. Sem nada salvo aqui, o evento segue a organização (a tela
 * mostra os valores dela); salvo, passa a usar os seus. A tela da organização continua existindo. Só o master.
 */
export default async function ConfiguracoesDoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect(`/admin/eventos/${id}`)

  const { data: evento } = await supabase.from('eventos').select('id, nome, organizacao_id, organizacoes(nome)').eq('id', id).maybeSingle()
  if (!evento) notFound()
  const { personalizado, ...funcionalidades } = await obterFuncionalidadesDoEvento(id)
  const nomeOrg = (evento.organizacoes as unknown as { nome?: string } | null)?.nome ?? 'a organização'

  return (
    <div className="space-y-5">
      <PageHeader voltarPara={`/admin/eventos/${id}`} titulo="Configurações do evento" descricao={evento.nome as string} />

      <div className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${personalizado ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200'}`}>
        <p className="text-slate-600 text-sm flex-1">
          {personalizado
            ? <>Este evento usa a <strong className="text-slate-800">configuração própria</strong> abaixo. As mudanças em Configurações de {nomeOrg} não valem aqui.</>
            : <>Este evento segue as Configurações de <strong className="text-slate-800">{nomeOrg}</strong>. Ao salvar aqui, ele passa a ter a configuração própria.</>}
        </p>
        {personalizado && <SeguirOrganizacao eventoId={id} />}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <FuncionalidadesForm
          key={personalizado ? 'proprio' : 'org'}
          organizacaoId={(evento.organizacao_id as string | null) ?? ''}
          funcionalidades={funcionalidades}
          eventoId={id}
        />
      </div>
    </div>
  )
}
