import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Search, X, MapPin, Briefcase, MessageCircle, UserSearch, Users, CalendarPlus,
  IdCard, Building2, CalendarDays,
} from 'lucide-react'
import { getPerfil, supabaseAdmin, buscarTudo } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { chaveBusca, formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Aviso, Badge } from '@/components/ui/Superficie'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { normalizarCidade, chaveCidade } from '@/lib/cidades'

export const revalidate = 0

/**
 * Encontre colaborador — a base regional da plataforma, numa tela só.
 *
 * EXCLUSIVA DO MASTER. Quem já foi credenciado por qualquer cliente aparece
 * aqui, e é isso que torna a tela um produto e não uma listagem: a organização
 * que não consegue fechar a própria equipe contrata o serviço, e o master
 * atribui gente da base ao evento dela. Aberta ao admin, ela entregaria a
 * equipe de um cliente para o concorrente dele.
 *
 * ─── SEM TOGGLE — TODA A BASE, SEMPRE ────────────────────────────────────
 *
 * Até 28/09/2026 existia um alternador "Prontas para recrutar" (só quem
 * marcou `consentimento_base`) / "Toda a base" (todo mundo). Pedido do
 * Juan: uma tela só, com TODOS os cadastros — inclusive quem não marcou o
 * aceite. Quem não autorizou continua identificável (etiqueta "Sem
 * autorização" em cada linha), só não fica mais escondido atrás de um
 * filtro por padrão. Ordenada por cadastro mais recente — é o registro
 * completo, cresce sozinho conforme a equipe se cadastra nos eventos.
 */

/*
 * O tutorial existe porque esta tela inverte a lógica do resto do sistema: em
 * todas as outras o organizador olha a PRÓPRIA equipe; aqui ele olha gente de
 * fora, que já trabalhou para outros clientes. Sem explicação, a primeira
 * reação é achar que são cadastros duplicados da equipe dele.
 */
const TUTORIAL: TutorialConfig = {
  tela: 'encontrar-colaborador',
  // Versão 3: o alternador "Prontas para recrutar / Toda a base" saiu —
  // agora é uma lista só, com todo mundo (28/09/2026).
  versao: 3,
  passos: [
    { alvo: 'enc-resumo', titulo: 'A base regional da plataforma', posicao: 'bottom', icone: 'Users',
      descricao: 'Todo mundo que já foi credenciado no Credenciei, por qualquer cliente. Esta tela é exclusiva do master: é o serviço de montagem de equipe que a organização contrata quando não consegue fechar a própria equipe. Nenhum admin enxerga isto.' },
    { alvo: 'enc-busca', titulo: 'Busque por nome, CPF ou cidade', posicao: 'bottom', icone: 'Search',
      descricao: 'A cidade é o filtro que mais importa: ela diz quem consegue chegar ao local do evento do cliente. É a cidade onde a pessoa MORA, escrita por ela no cadastro — então "Vila Velha" e "vila velha" encontram as mesmas pessoas, mas abreviação não.' },
    { alvo: 'enc-lista', titulo: 'Quem aparece primeiro', posicao: 'top', icone: 'ShieldCheck',
      descricao: 'Do cadastro mais recente para o mais antigo. Quem não autorizou aparecer aqui (a caixa de aceite do formulário) mostra a etiqueta "Sem autorização" — a ficha dela continua acessível do mesmo jeito, é só um aviso.' },
    { alvo: 'enc-chamar', titulo: 'Chamar e atribuir', posicao: 'left', icone: 'MessageCircle',
      descricao: '"Chamar" abre o SEU WhatsApp com o número da pessoa — o Credenciei não manda convite automático, então combine função, valor e horário direto com ela. Fechado o combinado, "Atribuir" abre o perfil, onde você escolhe o evento e o fornecedor do cliente. A pessoa entra na equipe dele e recebe o link da credencial.' },
  ],
}

/*
 * Teto de leitura — folga grande o bastante pra nunca esconder gente sem
 * avisar (já aconteceu com um teto de 300, depois 2000 — ver histórico do
 * arquivo). A base de hoje (2198) fica bem abaixo disto.
 */
const TETO_BASE = 10000

/** 100 por página (pedido do Juan, 28/09/2026) — renderizar os 2000+
 *  resultados de uma vez era o que deixava a tela pesada no navegador. */
const POR_PAGINA = 100

type Pessoa = {
  cpf: string
  nome: string
  telefone: string | null
  cidade: string | null
  cargos: Map<string, number>
  eventos: Set<string>
  organizacoes: Set<string>
  compareceu: number
  autorizou: boolean
  ultimo: string
  /** O cadastro mais ANTIGO deste CPF — desde quando a pessoa existe na base. */
  desde: string
}

export default async function EncontrarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cidade?: string; pagina?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  /*
   * SÓ O MASTER. A base cruza gente de todas as organizações da plataforma, e
   * abri-la ao admin significaria entregar a equipe de um cliente para o
   * concorrente dele. É o master quem consulta e, quando a organização
   * contrata o serviço, atribui a pessoa ao evento dela.
   */
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { q, cidade: cidadeParam, pagina: paginaParam } = await searchParams
  const busca = (q ?? '').trim()
  const cidade = (cidadeParam ?? '').trim()
  const filtrando = !!(busca || cidade)
  const pagina = Math.max(1, parseInt(paginaParam ?? '1', 10) || 1)

  /*
   * Só IDs no join, não nomes. A tela mostra "3 organizações", nunca QUAIS —
   * então trazer o nome do evento e o da organização de cada uma das linhas
   * era transportar texto que nada renderiza. Contar id distinto dá o mesmo
   * número com uma fração do payload.
   *
   * A pessoa aparece de qualquer forma, autorizada ou não (é o registro
   * completo) — cada linha mostra se ela autorizou, pra nunca fingir que
   * autorizou quando não.
   *
   * A cidade NÃO entra na consulta do banco.
   *
   * `ilike` compara acento com acento: procurar "Julia" perderia os cadastros
   * gravados como "Júlia". Por isso nome não é filtrado no PostgREST: trazemos
   * o conjunto permitido e comparamos em memória pela chave sem acentos.
   */
  const digitos = busca.replace(/\D/g, '')
  const buscaPorNome = !!busca && digitos.length < 3
  const termoNome = chaveBusca(busca)

  let consultaContagem = supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
  if (digitos.length >= 3) consultaContagem = consultaContagem.like('cpf', `%${digitos}%`)
  const { count: totalSemFiltroDeNome } = await consultaContagem

  type Cadastro = {
    id: string; nome: string; cpf: string; telefone: string | null; cargo: string | null
    cidade: string | null; created_at: string; consentimento_base: boolean
    fornecedores: { evento_id: string; eventos: { organizacao_id: string | null }[] }[]
  }

  /*
   * `buscarTudo`, não `.limit(teto)` puro: o Supabase corta em 1000 linhas
   * por resposta não importa o que `.limit()` peça (ver o comentário da
   * função em lib/supabase-server.ts) — um `.limit(2000)` aqui devolvia 1000
   * do mesmo jeito, e a tela continuava escondendo gente mesmo depois do
   * teto ter subido. `TETO_BASE` vale como TETO DE VERDADE (`tetoTotal`),
   * paginando de 1000 em 1000 até chegar nele.
   */
  const cadastrosBrutos = await buscarTudo<Cadastro>((de, ate) => {
    let consulta = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, cidade, created_at, consentimento_base, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
      .order('created_at', { ascending: false })
      .range(de, ate)
    if (digitos.length >= 3) consulta = consulta.like('cpf', `%${digitos}%`)
    return consulta
  }, { tetoTotal: TETO_BASE })

  const cadastros = buscaPorNome
    ? cadastrosBrutos.filter(c => chaveBusca(c.nome).includes(termoNome))
    : cadastrosBrutos
  const totalCadastros = buscaPorNome ? cadastros.length : (totalSemFiltroDeNome ?? 0)

  /*
   * Quem de fato apareceu nos eventos: é o dado que separa "já foi chamado"
   * de "já trabalhou". Sem isso a tela recomendaria quem nunca compareceu.
   *
   * EM LOTES — bug real encontrado em 28/09/2026: com a base passando de
   * ~2000 pessoas, um único `.in()` com todos os IDs de uma vez gera uma URL
   * de mais de 80 mil caracteres e a consulta quebra com `414 URI Too Long`
   * (silencioso, porque nada aqui conferia `error`) — era isso que fazia a
   * tela não abrir. 200 IDs por lote fica bem abaixo de qualquer limite de
   * URL; os lotes saem em paralelo (`Promise.all`), não em fila.
   */
  const ids = (cadastros ?? []).map(c => c.id)
  const TAMANHO_LOTE_PRESENCA = 200
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE_PRESENCA) lotes.push(ids.slice(i, i + TAMANHO_LOTE_PRESENCA))
  const resultadosPresenca = await Promise.all(
    lotes.map(lote => supabaseAdmin.from('registros').select('funcionario_id').eq('tipo', 'entrada').in('funcionario_id', lote))
  )
  const compareceu = new Set(resultadosPresenca.flatMap(r => (r.data ?? []).map(x => x.funcionario_id)))

  const porCpf = new Map<string, Pessoa>()
  for (const c of cadastros ?? []) {
    const rel = c.fornecedores as unknown as { evento_id: string; eventos: { organizacao_id: string | null } }
    const p = porCpf.get(c.cpf) ?? {
      cpf: c.cpf,
      nome: c.nome,                 // o mais recente: a consulta vem ordenada
      telefone: c.telefone,
      cidade: normalizarCidade(c.cidade) || null,
      cargos: new Map<string, number>(),
      eventos: new Set<string>(),
      organizacoes: new Set<string>(),
      compareceu: 0,
      autorizou: false,
      ultimo: c.created_at,
      desde: c.created_at,
    }
    if (!p.cidade && c.cidade) p.cidade = normalizarCidade(c.cidade) || null
    if (c.cargo?.trim()) p.cargos.set(c.cargo.trim(), (p.cargos.get(c.cargo.trim()) ?? 0) + 1)
    if (rel?.evento_id) p.eventos.add(rel.evento_id)
    if (rel?.eventos?.organizacao_id) p.organizacoes.add(rel.eventos.organizacao_id)
    if (compareceu.has(c.id)) p.compareceu++
    if (c.consentimento_base) p.autorizou = true
    if (c.created_at > p.ultimo) p.ultimo = c.created_at
    if (c.created_at < p.desde) p.desde = c.created_at
    porCpf.set(c.cpf, p)
  }

  const semFiltroDeCidade = [...porCpf.values()]
    .filter(p => !cidade || chaveCidade(p.cidade).includes(chaveCidade(cidade)))

  // Cadastro mais recente primeiro — é o registro completo, a pergunta é
  // "quem entrou na base por último".
  const pessoas = semFiltroDeCidade.sort((a, b) => b.ultimo.localeCompare(a.ultimo))

  /*
   * Corta em 100 SÓ pra exibir — os cartões de resumo abaixo continuam
   * contando `pessoas` inteiro (a base toda), não a página atual. Fatiar em
   * vez de reconsultar: a agregação por CPF já rodou rápido pra base
   * inteira (a parte pesada era jogar 2000+ linhas no HTML de uma vez, não
   * a consulta em si — ver o comentário lá em cima, no `.in()` em lotes).
   */
  const totalPaginas = Math.max(1, Math.ceil(pessoas.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const pessoasDaPagina = pessoas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  // Cidades da base, pra sugerir no filtro sem a pessoa ter que adivinhar.
  const cidades = [...new Set(
    (cadastros ?? []).map(c => normalizarCidade(c.cidade)).filter(v => !!v)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, 40)

  const urlFiltro = () => {
    const params = new URLSearchParams()
    if (busca) params.set('q', busca)
    if (cidade) params.set('cidade', cidade)
    const qs = params.toString()
    return `/admin/encontrar${qs ? `?${qs}` : ''}`
  }

  /** Troca só a página, preservando busca/cidade atuais. */
  const urlPagina = (novaPagina: number) => {
    const params = new URLSearchParams()
    if (busca) params.set('q', busca)
    if (cidade) params.set('cidade', cidade)
    if (novaPagina > 1) params.set('pagina', String(novaPagina))
    const qs = params.toString()
    return `/admin/encontrar${qs ? `?${qs}` : ''}`
  }

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo>
    <div className="space-y-5">
      <PageHeader
        titulo="Encontre colaborador"
        descricao="Base regional da plataforma — para montar equipe para o evento de um cliente que contratou o serviço"
        acoes={<TutorialButton />}
      />

      <div data-tutorial="enc-resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pessoas na base" value={pessoas.length.toLocaleString('pt-BR')} icon={IdCard} tom="acento" />
        <StatCard label="Cadastros feitos" value={(totalCadastros ?? 0).toLocaleString('pt-BR')} icon={Users} tom="info" />
        <StatCard
          label="Organizações"
          value={new Set(pessoas.flatMap(p => [...p.organizacoes])).size}
          icon={Building2}
          tom="sucesso"
        />
        <StatCard label="Já em 2+ eventos" value={pessoas.filter(p => p.eventos.size > 1).length} icon={CalendarDays} tom="aviso" />
      </div>

      <Aviso tom="marca">
        Quando um cliente novo enviar a planilha da equipe dele, quem já estiver aqui é reconhecido
        pelo CPF e tem o cadastro preenchido sozinho — a pessoa não digita tudo de novo.
      </Aviso>

      {/* Filtros num form GET: a busca vira URL, então dá pra mandar o link
          "garçons em Vila Velha" pra outra pessoa da produção. */}
      <form data-tutorial="enc-busca" className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input name="q" defaultValue={busca} placeholder="Nome ou CPF..." className="input" style={{ paddingLeft: 36 }} />
        </div>
        <div className="relative sm:w-60">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            name="cidade"
            defaultValue={cidade}
            placeholder="Cidade"
            className="input"
            style={{ paddingLeft: 36 }}
            list="cidades-da-base"
          />
        </div>
        <datalist id="cidades-da-base">
          {cidades.map(c => <option key={c} value={c} />)}
        </datalist>
        <button type="submit" className="btn btn-primario shrink-0">Buscar</button>
        {filtrando && (
          <Link href={urlFiltro()} className="btn btn-secundario btn-icone shrink-0" aria-label="Limpar filtros">
            <X className="w-4 h-4" />
          </Link>
        )}
      </form>

      <Secao
        className="scroll-mt-4"
        titulo="Resultados"
        icone={<UserSearch className="w-3.5 h-3.5" />}
        descricao={
          pessoas.length > POR_PAGINA
            ? `${(paginaAtual - 1) * POR_PAGINA + 1}–${Math.min(paginaAtual * POR_PAGINA, pessoas.length)} de ${pessoas.length}${filtrando ? ' para esta busca' : ''}`
            : filtrando
              ? `${pessoas.length} pessoa${pessoas.length === 1 ? '' : 's'} para esta busca`
              : 'Do cadastro mais recente para o mais antigo'
        }
      >
        {!pessoas.length ? (
          <EmptyState
            icone={<UserSearch className="w-7 h-7" />}
            titulo="Ninguém encontrado"
            descricao={
              filtrando
                ? 'Tente outro nome ou outra cidade — a grafia da cidade é a que a pessoa digitou no cadastro.'
                : 'A base se preenche sozinha conforme as equipes se cadastram nos eventos.'
            }
          />
        ) : (
          <div data-tutorial="enc-lista" className="divide-y divide-slate-100">
            {pessoasDaPagina.map((p, i) => {
              const funcao = [...p.cargos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
              const zap = p.telefone ? `55${p.telefone.replace(/\D/g, '')}` : null
              return (
                <div key={p.cpf} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors">
                  <Link href={`/admin/pessoas/${p.cpf}`} className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-brand-500 text-sm font-medium truncate">{p.nome}</p>
                      {p.compareceu > 0
                        ? <Badge tom="positivo">{p.compareceu} evento{p.compareceu !== 1 ? 's' : ''} trabalhado{p.compareceu !== 1 ? 's' : ''}</Badge>
                        : <Badge tom="neutro">Sem presença registrada</Badge>}
                      {/* Aqui aparece gente que não autorizou (a caixa de
                          aceite do formulário) — a etiqueta evita fingir que
                          autorizou quando não. */}
                      {!p.autorizou && <Badge tom="atencao">Sem autorização</Badge>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                      {funcao && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3 shrink-0" />{funcao}
                        </span>
                      )}
                      <span className="flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.cidade || 'cidade não informada'}</span>
                      </span>
                      <span className="tabular-nums">{formatCpf(p.cpf)}</span>
                      <span>{p.organizacoes.size} organizaç{p.organizacoes.size !== 1 ? 'ões' : 'ão'}</span>
                      <span>na base desde {formatarBR(p.desde, 'data')}</span>
                      <span>último em {formatarBR(p.ultimo, 'data')}</span>
                    </div>
                  </Link>

                  <div className="shrink-0 flex items-center gap-2" data-tutorial={i === 0 ? 'enc-chamar' : undefined}>
                    {zap ? (
                      <a
                        href={`https://wa.me/${zap}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secundario btn-sm"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">Chamar</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs hidden sm:inline">sem telefone</span>
                    )}
                    <Link href={`/admin/pessoas/${p.cpf}`} className="btn btn-primario btn-sm">
                      <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Atribuir</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Secao>

      {/* 100 por página (pedido do Juan, 28/09/2026) — só aparece quando há
          mais de uma página, pra não ocupar espaço à toa numa busca estreita. */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          {paginaAtual > 1 ? (
            <Link href={urlPagina(paginaAtual - 1)} className="btn btn-secundario btn-sm">Anterior</Link>
          ) : (
            <span className="btn btn-secundario btn-sm opacity-40 pointer-events-none">Anterior</span>
          )}
          <span className="text-slate-500 text-xs font-medium">Página {paginaAtual} de {totalPaginas}</span>
          {paginaAtual < totalPaginas ? (
            <Link href={urlPagina(paginaAtual + 1)} className="btn btn-secundario btn-sm">Próxima</Link>
          ) : (
            <span className="btn btn-secundario btn-sm opacity-40 pointer-events-none">Próxima</span>
          )}
        </div>
      )}
    </div>
    </TutorialProvider>
  )
}
