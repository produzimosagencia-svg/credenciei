import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CalendarDays, MapPin, Users, Plus, ChevronLeft, ChevronRight, Search, X,
  TrendingUp, Activity, Radio, UserCheck, Clock, AlertTriangle } from 'lucide-react'
import StatCard from '@/components/StatCard'
import { formatarBR, extensoBR } from '@/lib/tz'
import { estadoWhatsAppSalvo } from '@/lib/saude'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes, meuSetor } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster, podeGerenciarEventos, podeEscanear, podeExcluirEventos } from '@/lib/permissions'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'
import { COR_ETAPA } from '@/components/charts'
import { FluxoDoDia } from '@/components/charts-cliente'
import EventoActions from './eventos/EventoActions'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

/** Encerrados crescem pra sempre; ativos são poucos e ficam todos visíveis. */
const PAGE_SIZE = 8

const TUTORIAL: TutorialConfig = {
  tela: 'dashboard',
  versao: 2,
  passos: [
    { alvo: 'dash-graficos', titulo: 'Fluxo de credenciamento', posicao: 'bottom',
      descricao: 'A curva de registros por hora. É aqui que você vê se o pico de chegada já passou — cada cor é uma etapa: entrada, meio e saída.' },
    { alvo: 'dash-novo-evento', titulo: 'Criar um evento', posicao: 'left',
      descricao: 'Cadastre um evento novo: nome, datas e as janelas de horário em que a equipe pode bater ponto. Você pode criar até o limite de licenças contratadas.' },
    { alvo: 'eventos-card', titulo: 'Seus eventos', posicao: 'top',
      descricao: 'Clique no nome para gerenciar setores, equipe e presenças. A barra à direita mostra quantos da equipe já bateram entrada.' },
    { alvo: 'eventos-acoes', titulo: 'Ações do evento', posicao: 'left',
      descricao: 'Encerre um evento quando ele acabar ou exclua se foi criado por engano. Evento encerrado para de aceitar novas presenças.' },
  ],
}

/** Teto de pontos no gráfico. Acima disso o passo cresce (2h, 3h…). */
const MAX_PONTOS = 96

/**
 * A janela de operação de um evento: da primeira etapa que abre até a última
 * que fecha.
 *
 * Usa o MENOR início e o MAIOR fim entre as janelas definidas, e não
 * `janela_entrada_inicio`/`janela_fim_fim` direto, porque janela em branco é
 * comum — evento com só entrada configurada, por exemplo. As datas do evento
 * entram como último recurso; sem nada disso, não há gráfico a desenhar.
 */
function janelaDoEvento(evento: Record<string, unknown> | null) {
  if (!evento) return null

  const instante = (v: unknown) => {
    const t = v ? new Date(v as string).getTime() : NaN
    return Number.isFinite(t) ? t : null
  }

  const inicios = [
    evento.janela_entrada_inicio, evento.janela_meio_inicio, evento.janela_fim_inicio,
  ].map(instante).filter((v): v is number => v != null)
  const fins = [
    evento.janela_fim_fim, evento.janela_meio_fim, evento.janela_entrada_fim,
  ].map(instante).filter((v): v is number => v != null)

  const inicio = inicios.length ? Math.min(...inicios) : instante(evento.data_inicio)
  const fim = fins.length ? Math.max(...fins) : instante(evento.data_fim)
  if (inicio == null || fim == null || fim <= inicio) return null

  // Arredonda pra hora cheia dos dois lados: o eixo fica em horas inteiras e a
  // última hora aparece inteira, em vez de cortada no minuto do fechamento.
  const HORA = 60 * 60 * 1000
  const de = Math.floor(inicio / HORA) * HORA
  const ate = Math.ceil(fim / HORA) * HORA
  const horas = Math.round((ate - de) / HORA)
  // Evento de vários dias renderiza a cada 2h, 3h… em vez de virar 300 pontos.
  const passo = Math.max(1, Math.ceil(horas / MAX_PONTOS))

  return { de, ate, horas, passo, nome: String(evento.nome ?? ''), multiDia: horas > 24 }
}

type LinhaEvento = {
  id: string
  nome: string
  ativo: boolean
  data_inicio: string
  local: string | null
  setores: number
  equipe: number
  presentes: number
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Supervisor não gerencia nada: vai direto pro painel do próprio setor
  // (ou pro scanner, se por algum motivo não tiver setor vinculado).
  if (podeEscanear(perfil.role) && !podeGerenciarEventos(perfil.role)) {
    const setor = await meuSetor(perfil)
    redirect(setor ? `/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}` : '/scan')
  }

  const db = supabaseAdmin
  const podeExcluir = podeExcluirEventos(perfil.role)
  const licencasRestantes = await licencasDeEventoRestantes(perfil)
  const podeCriarEvento = licencasRestantes > 0

  const { page: pageParam, q } = await searchParams
  const busca = (q ?? '').trim()
  const page = Math.max(1, Number(pageParam) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const ativosQuery = db.from('eventos').select('*, fornecedores(count)').eq('ativo', true).order('data_inicio', { ascending: false })
  const encerradosQuery = db.from('eventos').select('*, fornecedores(count)', { count: 'exact' }).eq('ativo', false).order('data_inicio', { ascending: false }).range(from, to)
  if (!veTodosEventos(perfil.role)) {
    ativosQuery.eq('organizacao_id', perfil.organizacao_id)
    encerradosQuery.eq('organizacao_id', perfil.organizacao_id)
  }
  /*
   * Busca por nome OU local: com muitos eventos, "onde foi aquele da Arena?"
   * é uma pergunta tão comum quanto o nome exato — e o nome quase nunca é
   * lembrado inteiro.
   */
  if (busca) {
    const filtro = `nome.ilike.%${busca}%,local.ilike.%${busca}%`
    ativosQuery.or(filtro)
    encerradosQuery.or(filtro)
  }

  // Uma leitura só do relógio pra toda a página.
  const agora = new Date()

  // A consulta do "último registro que existe" saiu junto com a janela móvel:
  // a janela do gráfico agora vem do evento, não do relógio.
  const [{ data: ativos }, { data: encerrados, count: totalEncerrados }] = await Promise.all([
    ativosQuery,
    encerradosQuery,
  ])

  /**
   * Janela do gráfico: a do EVENTO, não uma janela móvel de 24h.
   *
   * O que interessa a quem organiza é o intervalo em que a operação acontece —
   * da abertura do credenciamento ao fechamento da saída. Um evento que abre
   * às 20h e fecha às 4h da manhã cabe inteiro em 8 horas; espalhar isso em 24
   * deixava a curva espremida num canto e 16 horas de linha reta no resto,
   * mostrando horas em que, por definição, nada podia acontecer.
   *
   * O evento de referência é o ativo mais recente; sem nenhum ativo, o último
   * que existiu — assim a tela continua contando a última operação em vez de
   * esvaziar quando o evento é encerrado.
   */
  const eventoDoGrafico = (ativos ?? [])[0] ?? (encerrados ?? [])[0] ?? null
  const janela = janelaDoEvento(eventoDoGrafico)

  const idsNaTela = [...(ativos ?? []), ...(encerrados ?? [])].map(e => e.id as string)

  /**
   * Tamanho da equipe e quem já bateu entrada, por evento. Duas consultas
   * para a página inteira — não duas por evento, que era o padrão antigo e
   * multiplicava requisição conforme a lista crescia.
   */
  const [{ data: funcionarios }, { data: entradas }, { data: registrosDaJanela }, { data: ultimosRegistros }] =
    await Promise.all([
      idsNaTela.length
        ? db.from('funcionarios').select('id, fornecedores!inner(evento_id)').in('fornecedores.evento_id', idsNaTela)
        : Promise.resolve({ data: [] }),
      idsNaTela.length
        ? db.from('registros').select('funcionario_id, evento_id').in('evento_id', idsNaTela).eq('tipo', 'entrada')
        : Promise.resolve({ data: [] }),
      // Só os registros DO evento do gráfico, dentro da janela dele. Antes isto
      // varria todos os eventos numa faixa de 24h — misturava a curva de um
      // evento com a de outro quando havia mais de um em andamento.
      janela && eventoDoGrafico
        ? db.from('registros').select('created_at, tipo')
            .eq('evento_id', eventoDoGrafico.id as string)
            .gte('created_at', new Date(janela.de).toISOString())
            .lte('created_at', new Date(janela.ate).toISOString())
        : Promise.resolve({ data: [] }),
      idsNaTela.length
        ? db.from('registros').select('id, tipo, created_at, funcionarios(nome, cargo, empresa)').in('evento_id', idsNaTela).order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
    ])

  const equipePorEvento = new Map<string, number>()
  for (const f of funcionarios ?? []) {
    const eid = (f.fornecedores as unknown as { evento_id: string })?.evento_id
    if (eid) equipePorEvento.set(eid, (equipePorEvento.get(eid) ?? 0) + 1)
  }
  // Set por evento: a mesma pessoa pode ter mais de um registro de entrada.
  const presentesPorEvento = new Map<string, Set<string>>()
  for (const r of entradas ?? []) {
    const eid = r.evento_id as string
    if (!presentesPorEvento.has(eid)) presentesPorEvento.set(eid, new Set())
    presentesPorEvento.get(eid)!.add(r.funcionario_id as string)
  }

  const montar = (e: Record<string, unknown>): LinhaEvento => ({
    id: e.id as string,
    nome: e.nome as string,
    ativo: e.ativo as boolean,
    data_inicio: e.data_inicio as string,
    local: (e.local as string | null) ?? null,
    setores: (e.fornecedores as { count: number }[] | null)?.[0]?.count ?? 0,
    equipe: equipePorEvento.get(e.id as string) ?? 0,
    presentes: presentesPorEvento.get(e.id as string)?.size ?? 0,
  })

  const linhasAtivas = (ativos ?? []).map(montar)
  const linhasEncerradas = (encerrados ?? []).map(montar)
  const totalEncerradosCount = totalEncerrados ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEncerradosCount / PAGE_SIZE))

  /** Trocar de página não pode perder a busca, e vice-versa. */
  const urlPagina = (n: number) => {
    const p = new URLSearchParams()
    if (busca) p.set('q', busca)
    if (n > 1) p.set('page', String(n))
    const qs = p.toString()
    return `/admin${qs ? `?${qs}` : ''}`
  }
  const totalEventos = linhasAtivas.length + totalEncerradosCount

  /**
   * Monta as casas do gráfico ao longo da janela do evento e depois preenche.
   * Casa sem movimento vira vale na curva, em vez de sumir e distorcer o
   * desenho como aconteceria agrupando só o que existe.
   */
  const HORA_MS = 60 * 60 * 1000
  const casas = janela
    ? Array.from({ length: Math.ceil(janela.horas / janela.passo) + 1 }, (_, i) => {
        const d = new Date(janela.de + i * janela.passo * HORA_MS)
        return {
          inicio: d.getTime(),
          // Evento que atravessa mais de um dia precisa da data no rótulo:
          // só "03" apareceria duas vezes e ninguém saberia qual é qual.
          /*
            * Rótulo em horário de Brasília.
            *
            * `getHours()` devolve a hora do RELÓGIO DO SERVIDOR, que na Vercel
            * é UTC: a casa das 17h do evento aparecia como "20h" no eixo. Como
            * o resto do sistema, o texto sai por formatarBR.
            */
          hora: janela.multiDia
            ? `${formatarBR(d.toISOString(), 'data').slice(0, 5)} ${formatarBR(d.toISOString(), 'hora').slice(0, 2)}h`
            : `${formatarBR(d.toISOString(), 'hora').slice(0, 2)}h`,
          entrada: 0, meio: 0, fim: 0,
        }
      })
    : []

  for (const r of registrosDaJanela ?? []) {
    const t = new Date(r.created_at as string).getTime()
    const i = Math.floor((t - (janela?.de ?? 0)) / (janela?.passo ?? 1) / HORA_MS)
    const alvo = casas[i]
    if (!alvo) continue
    const tipo = r.tipo as 'entrada' | 'meio' | 'fim'
    if (tipo === 'entrada' || tipo === 'meio' || tipo === 'fim') alvo[tipo]++
  }
  const dadosFluxo = casas.map(({ hora, entrada, meio, fim }) => ({ hora, entrada, meio, fim }))
  const registrosNaTela = ultimosRegistros

  /*
   * Números do topo. Olham só pros eventos ATIVOS: somar evento encerrado
   * misturaria o que já acabou com o que está acontecendo agora. As batidas
   * saem do mesmo array do gráfico, então os dois contam a mesma janela — se
   * viessem de consultas diferentes, um diria 84 e o outro 91 na mesma tela.
   */
  const esperados = linhasAtivas.reduce((a, e) => a + e.equipe, 0)
  const presentes = linhasAtivas.reduce((a, e) => a + e.presentes, 0)
  const batidas = dadosFluxo.reduce((a, p) => a + p.entrada + p.meio + p.fim, 0)

  const stats = [
    {
      label: 'Eventos ativos',
      value: linhasAtivas.length,
      sub: `de ${totalEventos} no total`,
      icon: Radio,
      tom: 'acento' as const,
    },
    {
      label: 'Presentes agora',
      value: presentes,
      sub: esperados ? `de ${esperados} na equipe` : 'equipe não cadastrada',
      icon: UserCheck,
      tom: 'sucesso' as const,
    },
    {
      label: 'Ainda não chegaram',
      value: Math.max(0, esperados - presentes),
      icon: Clock,
      tom: 'aviso' as const,
    },
    {
      label: 'Batidas na janela',
      value: batidas,
      sub: janela ? 'entrada, meio e saída' : 'sem janela definida',
      icon: Activity,
      tom: 'info' as const,
    },
  ]

  /** Subtítulo do gráfico: diz de QUE janela é a curva. */
  const iso = (ms: number) => new Date(ms).toISOString()
  const legendaJanela = janela
    ? `${janela.nome || 'Evento'} · das ${formatarBR(iso(janela.de), 'hora')} de ${formatarBR(iso(janela.de), 'data')} às ${formatarBR(iso(janela.ate), 'hora')} de ${formatarBR(iso(janela.ate), 'data')}`
    : 'As janelas de horário deste evento ainda não foram definidas'

  // Data do topo. Vem do servidor (não do relógio do browser), então não há
  // divergência de fuso pra suprimir na hidratação.
  const dataPorExtenso = extensoBR(agora, { weekday: 'long', day: 'numeric', month: 'long' })

  /*
   * O WhatsApp caiu?
   *
   * Duas falhas diferentes com a mesma consequência prática — ninguém recebe
   * nada — e por isso os dois viram aviso:
   *   1. a instância desconectou (celular desligado, sessão derrubada, banido);
   *   2. o worker parou de reportar, ou seja, a fila não está sendo processada.
   *
   * Lê o último estado GRAVADO, nunca consulta a Evolution aqui: perguntar ao
   * vivo penduraria o Painel por até dez segundos justamente quando a VPS
   * estivesse fora do ar — a hora em que se quer ver o aviso.
   */
  const saude = veTodosEventos(perfil.role) || podeGerenciarEventos(perfil.role)
    ? await estadoWhatsAppSalvo()
    : null
  const alertaWhatsApp = !saude
    ? null
    : saude.semNoticia
      ? {
          titulo: 'A fila de WhatsApp parou de rodar',
          detalhe: `Sem notícia há ${saude.minutosAtras} minutos. Nenhum lembrete está sendo enviado — verifique o worker na VPS.`,
        }
      : !saude.conectada
        ? {
            titulo: 'WhatsApp desconectado',
            detalhe: `A instância respondeu "${saude.estado}" na última verificação, ${formatarBR(saude.em, 'curto')}. As mensagens estão paradas na fila até a conexão voltar — leia o QR da Evolution de novo.`,
          }
        : null

  /**
   * Os eventos abrem a tela.
   *
   * Eles são o objeto do sistema — indicador e gráfico falam SOBRE eles. Com a
   * lista no rodapé era preciso rolar a página inteira pra chegar no que se
   * veio fazer, que é entrar num evento. (Antes isto era uma tela separada,
   * com uma lista encolhida aqui dizendo "ver todos": duas telas pro mesmo
   * conteúdo — agora é só esta.)
   */
  /*
   * Busca de eventos. Fica colada na lista, e não no topo da tela: ela filtra
   * os eventos, não os indicadores — que continuam contando a operação
   * inteira. Form GET, então o filtro vira URL e dá pra mandar o link pronto
   * pra outra pessoa da produção.
   */
  const barraDeBusca = (
    <form className="flex gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          name="q"
          defaultValue={busca}
          placeholder="Buscar evento por nome ou local..."
          className="input"
          style={{ paddingLeft: 36 }}
        />
      </div>
      {busca && (
        <Link href="/admin" className="btn btn-secundario btn-icone shrink-0" aria-label="Limpar busca">
          <X className="w-4 h-4" />
        </Link>
      )}
    </form>
  )

  const blocoEventos = !totalEventos ? (
    /* "Nada encontrado" e "nenhum evento criado" são situações diferentes, e
       oferecer "Criar evento" a quem só errou a busca manda a pessoa pro
       lugar errado. */
    <Secao
      titulo={busca ? 'Busca de eventos' : 'Eventos'}
      descricao={busca ? `Nenhum resultado para "${busca}"` : 'Cada evento reúne os setores, a equipe e as presenças do dia'}
    >
      {busca ? (
        <EmptyState
          icone={<Search className="w-7 h-7" />}
          titulo="Nenhum evento encontrado"
          descricao="Tente outro nome ou o local do evento."
          acao={<Link href="/admin" className="btn btn-secundario">Limpar busca</Link>}
        />
      ) : (
        <EmptyState
          icone={<CalendarDays className="w-7 h-7" />}
          titulo="Nenhum evento criado"
          descricao={
            podeCriarEvento
              ? 'Crie seu primeiro evento para começar'
              : 'Suas licenças de evento acabaram. Fale com o administrador da plataforma para liberar mais.'
          }
          acao={
            podeCriarEvento ? (
              <Link href="/admin/eventos/novo" className="btn btn-primario">
                <Plus className="w-3.5 h-3.5" /> Criar evento
              </Link>
            ) : undefined
          }
        />
      )}
    </Secao>
  ) : (
    <div className="space-y-4">
      {/* O evento ativo não é linha de lista: é o que está acontecendo agora,
          e ganha cartão próprio. A moldura escura com uma tira branca dentro
          espremia tudo à esquerda e deixava um vão no meio — aqui o conteúdo
          ocupa o cartão inteiro. */}
      {!!linhasAtivas.length && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="menu-grupo-titulo">Acontecendo agora</span>
            <span className="indicador-selo selo-sucesso">{linhasAtivas.length}</span>
          </div>
          <div className={`grid gap-3 ${linhasAtivas.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {linhasAtivas.map((e, i) => (
              <EventoAoVivo key={e.id} evento={e} podeExcluir={podeExcluir} destacar={i === 0} />
            ))}
          </div>
        </section>
      )}

      {!!linhasEncerradas.length && (
        <Secao
          icone={<CalendarDays className="w-3.5 h-3.5" />}
          titulo="Eventos encerrados"
          descricao="Já terminaram e não aceitam novas presenças"
          acoes={<span className="indicador-selo selo-neutro">{totalEncerradosCount}</span>}
        >
          <div className="divide-y divide-slate-100">
            {linhasEncerradas.map(e => <EventoLinha key={e.id} evento={e} podeExcluir={podeExcluir} />)}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-slate-500 text-xs">Página {page} de {totalPages}</p>
              <div className="flex items-center gap-1">
                <Link
                  href={urlPagina(page - 1)}
                  aria-disabled={page <= 1}
                  aria-label="Página anterior"
                  className={`btn btn-secundario btn-icone ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
                <Link
                  href={urlPagina(page + 1)}
                  aria-disabled={page >= totalPages}
                  aria-label="Próxima página"
                  className={`btn btn-secundario btn-icone ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </Secao>
      )}
    </div>
  )

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="space-y-5">
      {/* Aviso de canal caído. Fica ACIMA do título de propósito: é a única
          coisa da tela que exige ação imediata, e enterrá-la no meio dos
          indicadores faria o produtor descobrir no dia do evento que a equipe
          não recebeu lembrete nenhum. */}
      {alertaWhatsApp && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-red-700 text-sm font-semibold">{alertaWhatsApp.titulo}</p>
            <p className="text-red-600 text-xs mt-0.5">{alertaWhatsApp.detalhe}</p>
          </div>
        </div>
      )}

      <PageHeader
        titulo="Painel"
        descricao={dataPorExtenso}
        acoes={
          <>
            <TutorialButton/>
            {podeCriarEvento ? (
              <Link href="/admin/eventos/novo" data-tutorial="dash-novo-evento" className="btn btn-primario">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Novo evento</span>
                <span className="sm:hidden">Novo</span>
              </Link>
            ) : (
              /* Sem isto o botão sumia e nada explicava por quê. */
              <span className="flex items-center gap-1.5 text-slate-500 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="sm:hidden">Sem licença</span>
              </span>
            )}
          </>
        }
      />

      <div data-tutorial="dash-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {(!!totalEventos || busca) && barraDeBusca}

      {blocoEventos}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Fluxo do dia: durante um evento a pergunta é "o pico já passou?",
            e isso só se responde com eixo do tempo. */}
        <div data-tutorial="dash-graficos" className="lg:col-span-2">
          <Secao
            tom="acento"
            icone={<TrendingUp className="w-3.5 h-3.5" />}
            titulo="Fluxo de credenciamento"
            /* Diz de QUE janela é a curva: sem isso, o gráfico de um evento da
               semana passada pareceria movimento de agora. */
            descricao={legendaJanela}
            acoes={
              <div className="hidden sm:flex items-center gap-3">
                {([['Entrada', COR_ETAPA.entrada], ['Meio', COR_ETAPA.meio], ['Saída', COR_ETAPA.fim]] as const).map(([rotulo, cor]) => (
                  <span key={rotulo} className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor }} />
                    {rotulo}
                  </span>
                ))}
              </div>
            }
            corpoClassName="p-4 pl-1"
          >
            <FluxoDoDia
              dados={dadosFluxo}
              vazioTexto={
                janela
                  ? 'Nenhum registro nesta janela do evento'
                  : 'Defina as janelas de horário do evento para a curva aparecer'
              }
            />
          </Secao>
        </div>

        {/* Atividade ao vivo — timeline: a linha vertical liga os registros no
            tempo e é o que dá a sensação de "acontecendo agora". */}
        <Secao
          tom="info"
          icone={<Activity className="w-3.5 h-3.5" />}
          titulo="Atividade recente"
          corpoClassName={registrosNaTela?.length ? 'p-4' : ''}
        >
          {!registrosNaTela?.length ? (
            <EmptyState titulo="Sem atividade ainda" />
          ) : (
            <div className="relative overflow-y-auto max-h-60 pl-4">
              <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-slate-200" aria-hidden="true" />
              <div className="space-y-3.5">
                {registrosNaTela.map(r => {
                  const func = r.funcionarios as unknown as { nome?: string; empresa?: string; cargo?: string } | null
                  const cor = r.tipo === 'entrada' ? COR_ETAPA.entrada : r.tipo === 'meio' ? COR_ETAPA.meio : COR_ETAPA.fim
                  return (
                    <div key={r.id as string} className="relative">
                      <span
                        className="absolute -left-4 top-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-white"
                        style={{ background: cor }}
                        aria-hidden="true"
                      />
                      <p className="text-slate-800 text-xs font-medium truncate">{func?.nome}</p>
                      <p className="text-slate-500 text-2xs truncate">
                        {func?.empresa}{func?.cargo ? ` · ${func.cargo}` : ''}
                      </p>
                      <p className="text-slate-400 text-2xs mt-0.5 tabular-nums">
                        {r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Saída'} ·{' '}
                        {formatarBR(r.created_at as string, 'hora')}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Secao>
      </div>

    </div>
    </TutorialProvider>
  )
}

/**
 * Cartão do evento que está acontecendo agora.
 *
 * Escuro e grande de propósito: é a única coisa da tela que exige ação neste
 * momento, e disputa atenção com quatro indicadores coloridos logo acima. O
 * número de presentes vira a métrica do cartão — durante o evento é a pergunta
 * que se repete no rádio a cada dez minutos.
 */
function EventoAoVivo({ evento, podeExcluir, destacar }: { evento: LinhaEvento; podeExcluir: boolean; destacar?: boolean }) {
  const pct = evento.equipe > 0 ? Math.round((evento.presentes / evento.equipe) * 100) : 0

  return (
    <div className="evento-vivo">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="evento-vivo-selo">
            <span className="ponto-vivo" aria-hidden="true" />
            Ao vivo
          </span>
          <Link
            href={`/admin/eventos/${evento.id}`}
            data-tutorial={destacar ? 'eventos-card' : undefined}
            className="block mt-2"
          >
            <h3 className="text-white text-lg font-semibold truncate hover:underline">{evento.nome}</h3>
          </Link>
          <div className="flex items-center gap-3 flex-wrap text-white/60 text-xs mt-1.5">
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3 shrink-0" />
              {extensoBR(evento.data_inicio, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            {evento.local && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{evento.local}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 shrink-0" />
              {evento.setores} setor{evento.setores !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        {/* O menu vem com cores de tema claro; aqui ele herda o branco. */}
        <div className="acoes-no-escuro shrink-0 -mr-1 -mt-1" data-tutorial={destacar ? 'eventos-acoes' : undefined}>
          <EventoActions eventoId={evento.id} ativo={evento.ativo} podeExcluir={podeExcluir} />
        </div>
      </div>

      {evento.equipe === 0 ? (
        <p className="text-white/50 text-xs mt-5">Equipe ainda não cadastrada neste evento</p>
      ) : (
        <div className="mt-5">
          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <p className="text-white/60 text-xs">Presentes agora</p>
              <p className="text-white text-2xl font-semibold tabular-nums leading-tight mt-0.5">
                {evento.presentes}
                <span className="text-white/45 text-base font-normal">/{evento.equipe}</span>
              </p>
            </div>
            <span className="indicador-selo selo-sucesso mb-1">{pct}%</span>
          </div>
          <div className="h-2 bg-white/12 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Uma linha da lista de eventos encerrados — linha de tabela, não cartão
 * solto: dentro de uma seção com título, repetir borda e canto arredondado em
 * cada item cria caixa dentro de caixa e engorda a lista sem informar nada.
 */
function EventoLinha({ evento, podeExcluir, destacar }: { evento: LinhaEvento; podeExcluir: boolean; destacar?: boolean }) {
  const pct = evento.equipe > 0 ? Math.round((evento.presentes / evento.equipe) * 100) : 0

  return (
    <div className={`px-4 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors ${evento.ativo ? '' : 'opacity-70'}`}>
      <Link
        href={`/admin/eventos/${evento.id}`}
        data-tutorial={destacar ? 'eventos-card' : undefined}
        className="flex-1 min-w-0 space-y-1"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Roxo: é o link que leva pra dentro do evento, e a lista inteira
              existe pra ser clicada aqui. */}
          <h3 className="text-brand-500 font-medium text-sm truncate">{evento.nome}</h3>
          {evento.ativo ? (
            <Badge tom="positivo">
              <span className="w-1.5 h-1.5 rounded-full bg-sucesso-600" />
              Ativo
            </Badge>
          ) : (
            <Badge tom="neutro">Encerrado</Badge>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3 shrink-0" />
            {extensoBR(evento.data_inicio, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          {evento.local && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{evento.local}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            {evento.setores} setor{evento.setores !== 1 ? 'es' : ''} · {evento.equipe} na equipe
          </span>
        </div>
      </Link>

      <div className="hidden sm:block w-44 shrink-0">
        {evento.equipe === 0 ? (
          <p className="text-slate-400 text-xs text-right">Equipe ainda não cadastrada</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-slate-500 text-2xs">presentes</span>
              <span className="text-xs tabular-nums">
                <span className="text-slate-800 font-medium">{evento.presentes}</span>
                <span className="text-slate-500">/{evento.equipe}</span>
                <span className="text-slate-400"> · {pct}%</span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-sucesso-600)' }} />
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 -mr-1" data-tutorial={destacar ? 'eventos-acoes' : undefined}>
        <EventoActions eventoId={evento.id} ativo={evento.ativo} podeExcluir={podeExcluir} />
      </div>
    </div>
  )
}
