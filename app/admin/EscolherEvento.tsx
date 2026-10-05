import Link from 'next/link'
import { ChevronRight, CalendarDays, MapPin, Building2 } from 'lucide-react'
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
  } else if (!veTodosEventos(perfil)) {
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
 * Eventos a partir dos VÍNCULOS de `supervisor_setores` do perfil, não do
 * papel dele — "Meus eventos" precisa valer tanto pra quem É supervisor
 * quanto pra quem só GANHOU um vínculo de setor mantendo outro papel
 * principal (ex.: operador de portão que também supervisiona um fornecedor
 * — caso da Mara Lúcia, 04/10/2026, que fez login e viu "nenhum evento").
 * Diferente de `eventosQuePossoAbrir`, não tem branch por papel — por isso
 * não é usada por Avisos/Relatórios, que precisam do escopo largo de
 * master/admin/suporte mesmo que a pessoa também carregue um vínculo.
 */
export async function eventosDosMeusSetores(setoresPreCalculados?: Awaited<ReturnType<typeof meusSetores>>): Promise<EventoEscolhivel[]> {
  const perfil = await getPerfil()
  if (!perfil) return []
  const meus = setoresPreCalculados ?? await meusSetores(perfil)
  const ids = [...new Set(meus.map(s => s.evento_id as string))]
  if (!ids.length) return []
  const { data } = await supabase
    .from('eventos')
    .select('id, nome, local, data_inicio, ativo, organizacao_id, organizacoes(nome)')
    .in('id', ids)
    .order('data_inicio', { ascending: false })
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
 * TODOS os eventos (ativos e encerrados) da organização — histórico amplo,
 * não vínculo. Serve só a "Meus eventos" de quem NÃO É supervisor (ex.:
 * operador de portão): esse papel nunca teve vínculo fino por evento — o
 * escopo dele sempre foi a organização inteira (ver `eventosEscaneaveisSemData`,
 * que já lista assim pra decidir o que ele pode ESCANEAR agora). Sem vínculo
 * nenhum pra apontar "trabalhou aqui", a única história possível é "todo
 * evento que já rodou nesta organização".
 *
 * Achado ao vivo, 05/10/2026, caso da Mara Lúcia: "Meus eventos" mostrava só
 * a Stoked (vínculo de supervisor) — o Henrique e Juliano, onde ela
 * trabalhou como operadora de portão, tinha sumido, porque nunca existiu
 * vínculo nenhum pra esse papel.
 *
 * NUNCA usada pra quem É supervisor — reaproveitar aqui furaria o escopo
 * fino que `eventosDosMeusSetores`/`eventosQuePossoAbrir` documentam pra
 * esse papel (só os eventos do próprio setor, não a organização inteira).
 */
export async function eventosDaOrganizacao(organizacaoId: string | null): Promise<EventoEscolhivel[]> {
  if (!organizacaoId) return []
  const { data } = await supabase
    .from('eventos')
    .select('id, nome, local, data_inicio, ativo, organizacao_id, organizacoes(nome)')
    .eq('organizacao_id', organizacaoId)
    .order('data_inicio', { ascending: false })
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
        /*
         * Cada evento vira um cartão de verdade, não uma linha fina de texto
         * — esta lista costuma ter uma ou duas entradas, e uma linha rasa
         * fazia o passo inteiro de "escolher o evento" parecer um detalhe
         * qualquer da tela, quando às vezes é a única coisa nela (relato do
         * Juan, 09/09/2026).
         */
        <div className="p-2 space-y-1.5">
          {eventos.map(e => (
            <Link
              key={e.id}
              href={href(e.id)}
              className={`btn-press group flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
                e.ativo
                  ? 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
                  : 'border-slate-100 opacity-70 hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                e.ativo ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'
              }`}>
                <CalendarDays className="w-4 h-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-slate-800 font-semibold text-sm truncate flex items-center gap-2">
                  {e.nome}
                  {!e.ativo && <Badge tom="neutro">Encerrado</Badge>}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 text-xs mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 shrink-0 text-slate-300" />
                    {e.data_inicio ? formatarBR(e.data_inicio, 'data') : 'Sem data'}
                  </span>
                  {e.local && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <MapPin className="w-3 h-3 shrink-0 text-slate-300" />
                      <span className="truncate">{e.local}</span>
                    </span>
                  )}
                  {mostrarOrganizacao && e.organizacaoNome && (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <Building2 className="w-3 h-3 shrink-0 text-slate-300" />
                      <span className="truncate">{e.organizacaoNome}</span>
                    </span>
                  )}
                </p>
              </div>

              <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Secao>
  )
}
