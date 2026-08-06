import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, X, MapPin, Briefcase, MessageCircle, UserSearch, Users } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Aviso, Badge } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Encontrar funcionários — a base do Credenciei usada como banco de gente
 * disponível na região.
 *
 * Quem já foi credenciado por QUALQUER cliente da plataforma aparece aqui: é o
 * que permite montar equipe sem depender de indicação. O organizador filtra
 * por cidade e função, olha o histórico da pessoa e chama pelo WhatsApp dele
 * mesmo — o sistema não manda a mensagem, porque convite não é template
 * aprovado pela Meta.
 *
 * Uma pessoa = um CPF, mesmo que ela tenha 20 cadastros em 20 eventos.
 */

/** Teto de leitura. Acima disso a busca fica lenta e a tela, inútil de tão longa. */
const TETO = 2000

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
  // Montar equipe é trabalho de quem gerencia evento. Supervisor não recruta.
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { q, cidade: cidadeParam } = await searchParams
  const busca = (q ?? '').trim()
  const cidade = (cidadeParam ?? '').trim()

  const consulta = supabaseAdmin
    .from('funcionarios')
    .select('nome, cpf, telefone, cargo, cidade, created_at, id, fornecedores!inner(eventos!inner(nome, organizacoes(nome)))')
    .order('created_at', { ascending: false })
    .limit(TETO)

  const digitos = busca.replace(/\D/g, '')
  if (digitos.length >= 3) consulta.like('cpf', `%${digitos}%`)
  else if (busca) consulta.ilike('nome', `%${busca}%`)
  if (cidade) consulta.ilike('cidade', `%${cidade}%`)

  const { data: cadastros } = await consulta

  // Quem de fato apareceu nos eventos: é o dado que separa "já foi chamado"
  // de "já trabalhou". Sem isso a tela recomendaria quem nunca compareceu.
  const ids = (cadastros ?? []).map(c => c.id)
  const { data: entradas } = ids.length
    ? await supabaseAdmin.from('registros').select('funcionario_id').eq('tipo', 'entrada').in('funcionario_id', ids)
    : { data: [] as { funcionario_id: string }[] }
  const compareceu = new Set((entradas ?? []).map(r => r.funcionario_id))

  const porCpf = new Map<string, Pessoa>()
  for (const c of cadastros ?? []) {
    const rel = c.fornecedores as unknown as { eventos: { nome: string; organizacoes: { nome: string } | null } }
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
    if (rel?.eventos?.nome) p.eventos.add(rel.eventos.nome)
    if (rel?.eventos?.organizacoes?.nome) p.organizacoes.add(rel.eventos.organizacoes.nome)
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

  const filtrando = !!(busca || cidade)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Encontre colaborador"
        descricao="Gente que já foi credenciada na plataforma, para você montar a equipe do seu evento"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pessoas encontradas" value={pessoas.length} icon={UserSearch} tom="acento" />
        <StatCard label="Com histórico de presença" value={pessoas.filter(p => p.compareceu > 0).length} icon={Users} tom="sucesso" />
        <StatCard label="Cidades" value={cidades.length} icon={MapPin} tom="info" />
        <StatCard label="Com telefone" value={pessoas.filter(p => p.telefone).length} icon={MessageCircle} tom="aviso" />
      </div>

      <Aviso tom="marca">
        O contato é feito por você, do seu próprio WhatsApp — o sistema não manda convite automático.
        Combine função, valor e horário direto com a pessoa e depois cadastre ela no setor do evento.
      </Aviso>

      {/* Filtros num form GET: a busca vira URL, então dá pra mandar o link
          "garçons em Vila Velha" pra outra pessoa da produção. */}
      <form className="flex flex-col sm:flex-row gap-2">
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
          <div className="divide-y divide-slate-100">
            {pessoas.map(p => {
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

                  <div className="shrink-0">
                    {zap ? (
                      <a
                        href={`https://wa.me/${zap}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primario btn-sm"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">Chamar</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs">sem telefone</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Secao>
    </div>
  )
}
