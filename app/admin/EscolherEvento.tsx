import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState, Badge } from '@/components/ui/Superficie'

export type EventoEscolhivel = {
  id: string
  nome: string
  local: string | null
  data_inicio: string | null
  ativo: boolean
  organizacaoNome: string | null
}

/**
 * Os eventos que ESTE perfil pode abrir — a régua de escopo, num lugar só.
 *
 * Master vê todos; admin vê os da própria organização; supervisor vê só
 * aqueles onde ele tem setor (é o que `lib/relatorios.ts` já permite a ele,
 * e esconder aqui o que lá é permitido seria uma inconsistência); suporte vê
 * os do próprio escopo (`suporte_escopo` — organização inteira, ou eventos
 * avulsos).
 *
 * Isto ESCONDE, não protege: quem barra de verdade é a checagem que cada
 * tela faz ao abrir um evento pelo `?evento=` da URL. As duas precisam
 * existir — a lista, pra não oferecer o que não dá; a checagem, porque a URL
 * é digitável.
 */
export async function eventosQuePossoAbrir(): Promise<EventoEscolhivel[]> {
  const perfil = await getPerfil()
  if (!perfil) return []

  let consulta = supabase
    .from('eventos')
    .select('id, nome, local, data_inicio, ativo, organizacao_id, organizacoes(nome)')
    .order('data_inicio', { ascending: false })

  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    const ids = [...new Set(meus.map(s => s.evento_id as string))]
    if (!ids.length) return []
    consulta = consulta.in('id', ids)
  } else if (perfil.role === 'suporte') {
    const { data: escopos } = await supabase.from('suporte_escopo').select('organizacao_id, evento_id').eq('perfil_id', perfil.id)
    const eventoIds = (escopos ?? []).map(e => e.evento_id).filter((v): v is string => !!v)
    const orgIds = (escopos ?? []).map(e => e.organizacao_id).filter((v): v is string => !!v)
    if (!eventoIds.length && !orgIds.length) return []
    // "id in (eventos avulsos) OU organizacao_id in (organizações inteiras)"
    const filtros = [eventoIds.length ? `id.in.(${eventoIds.join(',')})` : null, orgIds.length ? `organizacao_id.in.(${orgIds.join(',')})` : null].filter(Boolean)
    consulta = consulta.or(filtros.join(','))
  } else if (!veTodosEventos(perfil.role)) {
    consulta = consulta.eq('organizacao_id', perfil.organizacao_id)
  }

  const { data } = await consulta
  return (data ?? []).map(e => ({
    id: e.id as string,
    nome: e.nome as string,
    local: (e.local as string | null) ?? null,
    data_inicio: (e.data_inicio as string | null) ?? null,
    ativo: e.ativo !== false,
    organizacaoNome: (e.organizacoes as unknown as { nome: string } | null)?.nome ?? null,
  }))
}

/**
 * A lista de eventos pra escolher — o primeiro passo das telas que vêm pelo
 * menu (Avisos, Relatórios) e por isso não sabem de qual evento se trata.
 */
export default function EscolherEvento({
  eventos, href, titulo, descricao, icone, vazio, mostrarOrganizacao,
}: {
  eventos: EventoEscolhivel[]
  /** Monta o link de cada evento — cada tela usa o seu parâmetro. */
  href: (eventoId: string) => string
  titulo: string
  descricao: string
  icone: React.ReactNode
  vazio: { titulo: string; descricao: string }
  /** Só o master vê de quem é o evento — pro admin é sempre a própria org. */
  mostrarOrganizacao: boolean
}) {
  return (
    <Secao tom="acento" icone={icone} titulo={titulo} descricao={descricao} corpoClassName={eventos.length ? '' : 'p-4'}>
      {!eventos.length ? (
        <EmptyState icone={icone} titulo={vazio.titulo} descricao={vazio.descricao} />
      ) : (
        <div className="divide-y divide-slate-50">
          {eventos.map(e => (
            <Link
              key={e.id}
              href={href(e.id)}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-slate-800 font-medium truncate flex items-center gap-2">
                  {e.nome}
                  {!e.ativo && <Badge tom="neutro">Encerrado</Badge>}
                </p>
                <p className="text-slate-400 text-xs truncate">
                  {e.data_inicio ? formatarBR(e.data_inicio, 'data') : 'Sem data'}
                  {e.local ? ` · ${e.local}` : ''}
                  {mostrarOrganizacao && e.organizacaoNome ? ` · ${e.organizacaoNome}` : ''}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </Secao>
  )
}
