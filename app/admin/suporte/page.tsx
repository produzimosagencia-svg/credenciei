import { redirect } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import SuporteModal from './SuporteModal'

export const revalidate = 0

/**
 * Gerenciamento do papel Suporte de Sistema — só master, porque o escopo
 * dele atravessa organizações (quem contrata é a plataforma). Ver
 * `criarSuporte`/`editarSuporte`/`revogarSuporte` em lib/actions.ts e
 * `lib/suporte.ts` pra como o escopo é checado nas ações de verdade.
 */
export default async function SuportePage() {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) redirect('/admin')

  const [{ data: suportes }, { data: organizacoes }, { data: eventos }] = await Promise.all([
    supabase.from('perfis').select('id, nome, telefone, ativo, acesso_expira_em, created_at').eq('role', 'suporte').order('created_at', { ascending: false }),
    supabase.from('organizacoes').select('id, nome').order('nome'),
    supabase.from('eventos').select('id, nome, organizacoes(nome)').order('data_inicio', { ascending: false }).limit(100),
  ])

  const eventosParaEscopo = (eventos ?? []).map(e => ({
    id: e.id as string, nome: e.nome as string,
    organizacaoNome: (e.organizacoes as unknown as { nome: string } | null)?.nome ?? '—',
  }))
  const organizacoesParaEscopo = (organizacoes ?? []).map(o => ({ id: o.id as string, nome: o.nome as string }))

  const ids = (suportes ?? []).map(s => s.id as string)
  const { data: escopos } = ids.length
    ? await supabase.from('suporte_escopo').select('perfil_id, organizacao_id, evento_id').in('perfil_id', ids)
    : { data: [] as { perfil_id: string; organizacao_id: string | null; evento_id: string | null }[] }

  const nomeOrg = new Map(organizacoesParaEscopo.map(o => [o.id, o.nome]))
  const nomeEvento = new Map(eventosParaEscopo.map(e => [e.id, e.nome]))
  const escopoPorSuporte = new Map<string, { orgs: string[]; eventos: string[]; orgIds: string[]; eventoIds: string[] }>()
  for (const e of escopos ?? []) {
    const atual = escopoPorSuporte.get(e.perfil_id) ?? { orgs: [], eventos: [], orgIds: [], eventoIds: [] }
    if (e.organizacao_id) { atual.orgs.push(nomeOrg.get(e.organizacao_id) ?? '—'); atual.orgIds.push(e.organizacao_id) }
    if (e.evento_id) { atual.eventos.push(nomeEvento.get(e.evento_id) ?? '—'); atual.eventoIds.push(e.evento_id) }
    escopoPorSuporte.set(e.perfil_id, atual)
  }

  const agora = new Date()

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Suporte de Sistema"
        descricao="Acesso de apoio contratado pro dia do evento — corrige a operação, nunca administra"
        acoes={<SuporteModal mode="criar" organizacoes={organizacoesParaEscopo} eventos={eventosParaEscopo} />}
      />

      <Secao tom="acento" icone={<UserCog className="w-3.5 h-3.5" />} titulo="Acessos" corpoClassName={suportes?.length ? '' : 'p-4'}>
        {!suportes?.length ? (
          <EmptyState icone={<UserCog className="w-7 h-7" />} titulo="Nenhum suporte criado ainda" descricao="Crie um acesso pra ajudar na operação de um ou mais eventos." />
        ) : (
          <div className="divide-y divide-slate-100">
            {suportes.map(s => {
              const escopo = escopoPorSuporte.get(s.id as string) ?? { orgs: [], eventos: [], orgIds: [], eventoIds: [] }
              const expirado = !!s.acesso_expira_em && new Date(s.acesso_expira_em as string) < agora
              return (
                <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-slate-800 text-sm font-medium">
                      {s.nome}
                      {(!s.ativo || expirado) && <Badge tom="neutro">{expirado ? 'Expirado' : 'Inativo'}</Badge>}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {[...escopo.orgs, ...escopo.eventos].join(', ') || 'Sem escopo definido'}
                    </p>
                    <p className="text-slate-400 text-2xs mt-0.5">
                      {s.acesso_expira_em ? `Válido até ${formatarBR(s.acesso_expira_em as string, 'data')}` : 'Sem expiração'}
                    </p>
                  </div>
                  <SuporteModal
                    mode="editar"
                    organizacoes={organizacoesParaEscopo}
                    eventos={eventosParaEscopo}
                    suporte={{
                      id: s.id as string, nome: s.nome as string, telefone: s.telefone as string | null,
                      ativo: s.ativo !== false, acessoExpiraEm: s.acesso_expira_em as string | null,
                      escopoOrganizacoes: escopo.orgIds, escopoEventos: escopo.eventoIds,
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </Secao>
    </div>
  )
}
