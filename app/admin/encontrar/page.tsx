import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Search, X, MapPin, Briefcase, MessageCircle, UserSearch, Users, CalendarPlus,
  IdCard, Building2, CalendarDays, ShieldCheck,
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
 * Encontre colaborador — a base regional da plataforma.
 *
 * EXCLUSIVA DO MASTER. Quem já foi credenciado por qualquer cliente aparece
 * aqui, e é isso que torna a tela um produto e não uma listagem: a organização
 * que não consegue fechar a própria equipe contrata o serviço, e o master
 * atribui gente da base ao evento dela. Aberta ao admin, ela entregaria a
 * equipe de um cliente para o concorrente dele.
 *
 * ─── FUNDIU "BASE DE FUNCIONÁRIOS" ───────────────────────────────────────
 *
 * Eram duas telas na mesma consulta: `funcionarios` inteira, agrupada por
 * CPF, master-only, linkando para a mesma ficha (`/admin/pessoas/[cpf]`).
 * A diferença real entre elas era uma coluna — `consentimento_base` —
 * disfarçada de duas rotas inteiras.
 *
 * Agora é um TOGGLE (`?ver=recrutar|todos`), não duas telas:
 *
 *   • recrutar (padrão) — só quem autorizou aparecer (`consentimento_base`).
 *     Ordenada por relevância (quem já trabalhou mais, mais recentemente).
 *     É a lista de quem vale ligar.
 *   • todos — a base inteira, sem o filtro de autorização. Ordenada por
 *     cadastro mais recente. É o registro completo, usado quando um cliente
 *     novo manda planilha e o sistema reconhece quem já passou por aqui.
 *
 * O filtro de autorização NUNCA muda o que a ficha da pessoa mostra (ela já
 * oferece "Atribuir" com ou sem consentimento — ver `/admin/pessoas/[cpf]`).
 * Ele só decide se a pessoa aparece nesta VITRINE de busca. Por isso vira um
 * toggle e não duas permissões: a mesma pessoa, a mesma ficha, duas formas de
 * chegar até ela.
 */

/*
 * O tutorial existe porque esta tela inverte a lógica do resto do sistema: em
 * todas as outras o organizador olha a PRÓPRIA equipe; aqui ele olha gente de
 * fora, que já trabalhou para outros clientes. Sem explicação, a primeira
 * reação é achar que são cadastros duplicados da equipe dele.
 */
const TUTORIAL: TutorialConfig = {
  tela: 'encontrar-colaborador',
  versao: 2,
  passos: [
    { alvo: 'enc-resumo', titulo: 'A base regional da plataforma', posicao: 'bottom', icone: 'Users',
      descricao: 'Todo mundo que já foi credenciado no Credenciei, por qualquer cliente. Esta tela é exclusiva do master: é o serviço de montagem de equipe que a organização contrata quando não consegue fechar a própria equipe. Nenhum admin enxerga isto.' },
    { alvo: 'enc-escopo', titulo: 'Quem entra na lista', posicao: 'bottom', icone: 'ShieldCheck',
      descricao: '"Prontas para recrutar" mostra só quem autorizou aparecer aqui. "Toda a base" mostra todo mundo já credenciado, sem esse filtro — use quando um cliente novo mandar a planilha da equipe e você quiser conferir quem o sistema já reconhece pelo CPF.' },
    { alvo: 'enc-busca', titulo: 'Busque por nome, CPF ou cidade', posicao: 'bottom', icone: 'Search',
      descricao: 'A cidade é o filtro que mais importa: ela diz quem consegue chegar ao local do evento do cliente. É a cidade onde a pessoa MORA, escrita por ela no cadastro — então "Vila Velha" e "vila velha" encontram as mesmas pessoas, mas abreviação não.' },
    { alvo: 'enc-lista', titulo: 'Quem aparece primeiro', posicao: 'top', icone: 'ShieldCheck',
      descricao: 'Na lista de recrutamento, quem tem mais presença registrada sobe primeiro. "3 eventos trabalhados" quer dizer que a pessoa foi chamada e bateu entrada — é diferente de só ter se cadastrado. Clique no nome pra ver o histórico completo dela.' },
    { alvo: 'enc-chamar', titulo: 'Chamar e atribuir', posicao: 'left', icone: 'MessageCircle',
      descricao: '"Chamar" abre o SEU WhatsApp com o número da pessoa — o Credenciei não manda convite automático, então combine função, valor e horário direto com ela. Fechado o combinado, "Atribuir" abre o perfil, onde você escolhe o evento e o setor do cliente. A pessoa entra na equipe dele e recebe o link da credencial.' },
  ],
}

/*
 * Teto de leitura, por escopo.
 *
 * Era 300 (recrutar sem filtro) / 2000 (recrutar com filtro) / 3000
 * (todos) — a base passou de 300 já em 03/09/2026 (1001 pessoas
 * autorizadas confirmadas no banco) e a tela escondia gente real sem
 * avisar. Corrigido primeiro pra 2000, e o Juan pediu pra ir direto pra
 * 10000 nos três — folga grande o bastante pra não voltar a esconder
 * ninguém tão cedo, sem precisar lembrar de subir de novo a cada evento.
 */
const TETO_RECRUTAR_SEM_FILTRO = 10000
const TETO_RECRUTAR_COM_FILTRO = 10000
const TETO_TODOS = 10000

type Escopo = 'recrutar' | 'todos'

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
  searchParams: Promise<{ q?: string; cidade?: string; ver?: string }>
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

  const { q, cidade: cidadeParam, ver } = await searchParams
  const busca = (q ?? '').trim()
  const cidade = (cidadeParam ?? '').trim()
  const filtrando = !!(busca || cidade)
  const escopo: Escopo = ver === 'todos' ? 'todos' : 'recrutar'

  const teto = escopo === 'todos' ? TETO_TODOS : (filtrando ? TETO_RECRUTAR_COM_FILTRO : TETO_RECRUTAR_SEM_FILTRO)

  /*
   * Só IDs no join, não nomes. A tela mostra "3 organizações", nunca QUAIS —
   * então trazer o nome do evento e o da organização de cada uma das linhas
   * era transportar texto que nada renderiza. Contar id distinto dá o mesmo
   * número com uma fração do payload.
   *
   * O filtro de autorização só existe no escopo "recrutar" — é isto que dá
   * sentido à caixa de aceite no formulário. No escopo "todos" a pessoa
   * aparece de qualquer forma (é o registro completo), mas cada linha
   * mostra se ela autorizou ou não, pra nunca fingir que autorizou quando
   * não.
   *
   * A cidade NÃO entra na consulta do banco.
   *
   * `ilike` compara acento com acento: procurar "Julia" perderia os cadastros
   * gravados como "Júlia". Por isso nome não é filtrado no PostgREST: trazemos
   * o conjunto permitido e comparamos em memória pela chave sem acentos.
   *
   * Os dois `if` de filtro se repetem na contagem e na consulta paginada
   * abaixo — o construtor do Supabase muda de tipo a cada `.eq`/`.like`
   * encadeado, então uma função genérica pra "aplicar filtro nos dois" luta
   * contra o tipo em vez de ajudar. Duas consultas pequenas e diretas.
   */
  const digitos = busca.replace(/\D/g, '')
  const buscaPorNome = !!busca && digitos.length < 3
  const termoNome = chaveBusca(busca)

  let consultaContagem = supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
  if (escopo === 'recrutar') consultaContagem = consultaContagem.eq('consentimento_base', true)
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
   * teto ter subido. `teto` continua valendo, só que agora como TETO DE
   * VERDADE (`tetoTotal`), paginando de 1000 em 1000 até chegar nele.
   */
  const cadastrosBrutos = await buscarTudo<Cadastro>((de, ate) => {
    let consulta = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, cidade, created_at, consentimento_base, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
      .order('created_at', { ascending: false })
      .range(de, ate)
    if (escopo === 'recrutar') consulta = consulta.eq('consentimento_base', true)
    if (digitos.length >= 3) consulta = consulta.like('cpf', `%${digitos}%`)
    return consulta
  }, { tetoTotal: teto })

  const cadastros = buscaPorNome
    ? cadastrosBrutos.filter(c => chaveBusca(c.nome).includes(termoNome))
    : cadastrosBrutos
  const totalCadastros = buscaPorNome ? cadastros.length : (totalSemFiltroDeNome ?? 0)

  // Quem de fato apareceu nos eventos: é o dado que separa "já foi chamado"
  // de "já trabalhou". Sem isso a tela recomendaria quem nunca compareceu.
  const ids = (cadastros ?? []).map(c => c.id)
  const { data: entradas } = ids.length
    ? await supabaseAdmin.from('registros').select('funcionario_id').eq('tipo', 'entrada').in('funcionario_id', ids)
    : { data: [] as { funcionario_id: string }[] }
  const compareceu = new Set((entradas ?? []).map(r => r.funcionario_id))

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

  /*
   * Ordem por escopo. "Recrutar": quem tem mais bagagem primeiro — a pergunta
   * é "em quem eu confio pra chamar", não "onde está o fulano". "Todos": o
   * cadastro mais recente primeiro — é o registro, a pergunta é "quem entrou
   * na base por último".
   */
  const pessoas = escopo === 'recrutar'
    ? semFiltroDeCidade.sort((a, b) =>
        b.compareceu - a.compareceu || b.eventos.size - a.eventos.size || b.ultimo.localeCompare(a.ultimo))
    : semFiltroDeCidade.sort((a, b) => b.ultimo.localeCompare(a.ultimo))

  // Cidades da base, pra sugerir no filtro sem a pessoa ter que adivinhar.
  const cidades = [...new Set(
    (cadastros ?? []).map(c => normalizarCidade(c.cidade)).filter(v => !!v)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, 40)

  const urlEscopo = (novoEscopo: Escopo) => {
    const params = new URLSearchParams()
    if (busca) params.set('q', busca)
    if (cidade) params.set('cidade', cidade)
    if (novoEscopo === 'todos') params.set('ver', 'todos')
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

      {/* O toggle que fundiu as duas telas. Vive junto do cabeçalho porque
          governa TUDO abaixo: números, ordem, lista inteira. */}
      <div data-tutorial="enc-escopo" className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
        <Link
          href={urlEscopo('recrutar')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            escopo === 'recrutar' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          Prontas para recrutar
        </Link>
        <Link
          href={urlEscopo('todos')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            escopo === 'todos' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <IdCard className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          Toda a base
        </Link>
      </div>

      {escopo === 'recrutar' ? (
        <div data-tutorial="enc-resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Pessoas encontradas" value={pessoas.length} icon={UserSearch} tom="acento" />
          <StatCard label="Com histórico de presença" value={pessoas.filter(p => p.compareceu > 0).length} icon={Users} tom="sucesso" />
          <StatCard label="Cidades" value={cidades.length} icon={MapPin} tom="info" />
          <StatCard label="Com telefone" value={pessoas.filter(p => p.telefone).length} icon={MessageCircle} tom="aviso" />
        </div>
      ) : (
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
      )}

      {escopo === 'todos' && (
        <Aviso tom="marca">
          Quando um cliente novo enviar a planilha da equipe dele, quem já estiver aqui é reconhecido
          pelo CPF e tem o cadastro preenchido sozinho — a pessoa não digita tudo de novo.
        </Aviso>
      )}

      {/*
        * Dois avisos saíram daqui a pedido (02/09/2026):
        *
        *  • "Fale com a pessoa pelo seu WhatsApp…" — instrução de como
        *    recrutar, que quem usa a tela já sabe de cor;
        *  • "N cadastros da base não aparecem aqui…" — contagem de quem não
        *    tem `consentimento_base`. O alternador "Toda a base" logo acima
        *    já leva a eles, então o aviso era um segundo caminho pro mesmo
        *    lugar, ocupando espaço em toda visita.
        *
        * A REGRA NÃO MUDOU: "Prontas para recrutar" continua mostrando só
        * quem autorizou (`consentimento_base`) — o que saiu foi o letreiro,
        * não o filtro.
        */}

      {/* Filtros num form GET: a busca vira URL, então dá pra mandar o link
          "garçons em Vila Velha" pra outra pessoa da produção. */}
      <form data-tutorial="enc-busca" className="flex flex-col sm:flex-row gap-2">
        {escopo === 'todos' && <input type="hidden" name="ver" value="todos" />}
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
          <Link href={urlEscopo(escopo)} className="btn btn-secundario btn-icone shrink-0" aria-label="Limpar filtros">
            <X className="w-4 h-4" />
          </Link>
        )}
      </form>

      <Secao
        className="scroll-mt-4"
        titulo="Resultados"
        icone={<UserSearch className="w-3.5 h-3.5" />}
        descricao={
          filtrando
            ? `${pessoas.length} pessoa${pessoas.length === 1 ? '' : 's'} para esta busca`
            : escopo === 'recrutar'
              ? 'Quem tem mais eventos e mais presença aparece primeiro'
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
            {pessoas.map((p, i) => {
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
                      {/* Só no escopo "todos": aqui aparece gente que não
                          autorizou, e a etiqueta evita fingir que autorizou. */}
                      {escopo === 'todos' && !p.autorizou && (
                        <Badge tom="atencao">Sem autorização</Badge>
                      )}
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
    </div>
    </TutorialProvider>
  )
}
