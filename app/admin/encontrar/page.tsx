import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, X, MapPin, Briefcase, MessageCircle, UserSearch, Users, CalendarPlus } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Aviso, Badge } from '@/components/ui/Superficie'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

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
 * O contato sai pelo WhatsApp do próprio master — convite não é template
 * aprovado pela Meta, então o sistema não envia. Depois de combinado, a
 * atribuição acontece no perfil da pessoa.
 *
 * Uma pessoa = um CPF, mesmo que ela tenha 20 cadastros em 20 eventos.
 */

/*
 * O tutorial existe porque esta tela inverte a lógica do resto do sistema: em
 * todas as outras o organizador olha a PRÓPRIA equipe; aqui ele olha gente de
 * fora, que já trabalhou para outros clientes. Sem explicação, a primeira
 * reação é achar que são cadastros duplicados da equipe dele.
 */
const TUTORIAL: TutorialConfig = {
  tela: 'encontrar-colaborador',
  versao: 1,
  passos: [
    { alvo: 'enc-resumo', titulo: 'A base regional da plataforma', posicao: 'bottom', icone: 'Users',
      descricao: 'Todo mundo que já foi credenciado no Credenciei, por qualquer cliente. Esta tela é exclusiva do master: é o serviço de montagem de equipe que a organização contrata quando não consegue fechar a própria equipe. Nenhum admin enxerga isto.' },
    { alvo: 'enc-busca', titulo: 'Busque por nome, CPF ou cidade', posicao: 'bottom', icone: 'Search',
      descricao: 'A cidade é o filtro que mais importa: ela diz quem consegue chegar ao local do evento do cliente. É a cidade onde a pessoa MORA, escrita por ela no cadastro — então "Vila Velha" e "vila velha" encontram as mesmas pessoas, mas abreviação não.' },
    { alvo: 'enc-lista', titulo: 'Quem aparece primeiro', posicao: 'top', icone: 'ShieldCheck',
      descricao: 'A ordem não é alfabética: quem tem mais presença registrada sobe. "3 eventos trabalhados" quer dizer que a pessoa foi chamada e bateu entrada — é diferente de só ter se cadastrado. Clique no nome pra ver o histórico completo dela.' },
    { alvo: 'enc-chamar', titulo: 'Chamar e atribuir', posicao: 'left', icone: 'MessageCircle',
      descricao: '"Chamar" abre o SEU WhatsApp com o número da pessoa — o Credenciei não manda convite automático, então combine função, valor e horário direto com ela. Fechado o combinado, "Atribuir" abre o perfil, onde você escolhe o evento e o setor do cliente. A pessoa entra na equipe dele e recebe o link da credencial.' },
  ],
}

/*
 * Teto de leitura. Sem filtro a tela é uma vitrine — 300 linhas já enchem a
 * lista e ninguém rola até o fim; com filtro o banco corta antes, então dá pra
 * varrer bem mais fundo sem custo. Ler 2000 linhas nos dois casos era pagar o
 * pior cenário até pra quem só abriu a tela.
 */
const TETO_SEM_FILTRO = 300
const TETO_COM_FILTRO = 2000

type Pessoa = {
  cpf: string
  nome: string
  telefone: string | null
  cidade: string | null
  cargos: Map<string, number>
  eventos: Set<string>
  organizacoes: Set<string>
  compareceu: number
  ultimo: string
}

export default async function EncontrarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cidade?: string }>
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

  const { q, cidade: cidadeParam } = await searchParams
  const busca = (q ?? '').trim()
  const cidade = (cidadeParam ?? '').trim()
  const filtrando = !!(busca || cidade)

  /*
   * Só IDs no join, não nomes. A tela mostra "3 organizações", nunca QUAIS —
   * então trazer o nome do evento e o da organização de cada uma das linhas
   * era transportar texto que nada renderiza. Contar id distinto dá o mesmo
   * número com uma fração do payload.
   */
  const consulta = supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, telefone, cargo, cidade, created_at, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
    /*
     * Só quem autorizou. É isto que dá sentido à caixa de aceite no formulário:
     * sem o filtro, o consentimento seria enfeite e a base continuaria expondo
     * quem nunca foi perguntado. Cadastro antigo (anterior à caixa) tem
     * `consentimento_base = false` e fica de fora até a pessoa se cadastrar de
     * novo em algum evento e aceitar.
     */
    .eq('consentimento_base', true)
    .order('created_at', { ascending: false })
    .limit(filtrando ? TETO_COM_FILTRO : TETO_SEM_FILTRO)

  const digitos = busca.replace(/\D/g, '')
  if (digitos.length >= 3) consulta.like('cpf', `%${digitos}%`)
  else if (busca) consulta.ilike('nome', `%${busca}%`)
  if (cidade) consulta.ilike('cidade', `%${cidade}%`)

  const [{ data: cadastros }, { count: semAceite }] = await Promise.all([
    consulta,
    supabaseAdmin
      .from('funcionarios')
      .select('id', { count: 'exact', head: true })
      .eq('consentimento_base', false),
  ])

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
      cidade: c.cidade,
      cargos: new Map<string, number>(),
      eventos: new Set<string>(),
      organizacoes: new Set<string>(),
      compareceu: 0,
      ultimo: c.created_at,
    }
    if (!p.cidade && c.cidade) p.cidade = c.cidade
    if (c.cargo?.trim()) p.cargos.set(c.cargo.trim(), (p.cargos.get(c.cargo.trim()) ?? 0) + 1)
    if (rel?.evento_id) p.eventos.add(rel.evento_id)
    if (rel?.eventos?.organizacao_id) p.organizacoes.add(rel.eventos.organizacao_id)
    if (compareceu.has(c.id)) p.compareceu++
    if (c.created_at > p.ultimo) p.ultimo = c.created_at
    porCpf.set(c.cpf, p)
  }

  /*
   * Ordem: quem tem mais bagagem primeiro, e entre iguais quem trabalhou mais
   * recentemente. Ordenar por nome deixaria a lista alfabética e inútil — a
   * pergunta aqui é "em quem eu confio pra chamar", não "onde está o fulano".
   */
  const pessoas = [...porCpf.values()].sort((a, b) =>
    b.compareceu - a.compareceu ||
    b.eventos.size - a.eventos.size ||
    b.ultimo.localeCompare(a.ultimo)
  )

  // Cidades da base, pra sugerir no filtro sem a pessoa ter que adivinhar.
  const cidades = [...new Set((cadastros ?? []).map(c => c.cidade).filter((v): v is string => !!v?.trim()))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .slice(0, 40)

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo>
    <div className="space-y-5">
      <PageHeader
        titulo="Encontre colaborador"
        descricao="Base regional da plataforma — para montar equipe para o evento de um cliente que contratou o serviço"
        acoes={<TutorialButton />}
      />

      <div data-tutorial="enc-resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pessoas encontradas" value={pessoas.length} icon={UserSearch} tom="acento" />
        <StatCard label="Com histórico de presença" value={pessoas.filter(p => p.compareceu > 0).length} icon={Users} tom="sucesso" />
        <StatCard label="Cidades" value={cidades.length} icon={MapPin} tom="info" />
        <StatCard label="Com telefone" value={pessoas.filter(p => p.telefone).length} icon={MessageCircle} tom="aviso" />
      </div>

      <Aviso tom="marca">
        Fale com a pessoa pelo seu WhatsApp para combinar função, valor e horário — o sistema não manda
        convite automático. Fechado o combinado, abra o perfil dela e atribua ao evento do cliente.
      </Aviso>

      {/* Transparência do tamanho real: sem isto, o master acha que a base é
          pequena quando na verdade a maior parte só não foi perguntada. */}
      {!!semAceite && (
        <Aviso tom="atencao">
          {semAceite.toLocaleString('pt-BR')} cadastro{semAceite !== 1 ? 's' : ''} da base não
          {semAceite !== 1 ? ' aparecem' : ' aparece'} aqui: {semAceite !== 1 ? 'são' : 'é'} de antes da
          autorização existir no formulário. {semAceite !== 1 ? 'Elas voltam' : 'Ela volta'} assim que a
          pessoa se cadastrar em outro evento e marcar o aceite.
        </Aviso>
      )}

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
          <Link href="/admin/encontrar" className="btn btn-secundario btn-icone shrink-0" aria-label="Limpar filtros">
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
            : 'Quem tem mais eventos e mais presença aparece primeiro'
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
