import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, Users, Building2, CalendarDays, IdCard, X } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Aviso } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Teto de cadastros lidos de uma vez. A tela agrupa por CPF no servidor, então
 * precisa dos registros da pessoa juntos pra contar certo — com busca por CPF
 * isso é garantido; sem busca, acima do teto a lista fica parcial e a tela
 * avisa em vez de mentir um número.
 */
const TETO_LEITURA = 3000

type Pessoa = {
  cpf: string
  nome: string
  telefone: string | null
  cargo: string | null
  eventos: Set<string>
  organizacoes: Set<string>
  primeiro: string
  ultimo: string
}

export default async function BaseFuncionariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const perfil = await getPerfil()
  // A base cruza dados de TODAS as organizações — só o dono da plataforma vê.
  if (!ehMaster(perfil?.role)) redirect('/admin')

  const { q } = await searchParams
  const busca = (q ?? '').trim()
  const digitos = busca.replace(/\D/g, '')

  const consulta = supabaseAdmin
    .from('funcionarios')
    .select('nome, cpf, telefone, cargo, created_at, fornecedores!inner(eventos!inner(nome, organizacoes(nome)))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(TETO_LEITURA)

  if (digitos.length >= 3) consulta.like('cpf', `%${digitos}%`)
  else if (busca) consulta.ilike('nome', `%${busca}%`)

  const { data: cadastros, count } = await consulta

  // Uma pessoa = um CPF, mesmo que tenha se cadastrado em dez eventos.
  const porCpf = new Map<string, Pessoa>()
  for (const c of cadastros ?? []) {
    const forn = c.fornecedores as unknown as { eventos: { nome: string; organizacoes: { nome: string } | null } }
    const evento = forn?.eventos
    const atual = porCpf.get(c.cpf)
    if (atual) {
      if (evento?.nome) atual.eventos.add(evento.nome)
      if (evento?.organizacoes?.nome) atual.organizacoes.add(evento.organizacoes.nome)
      if (c.created_at < atual.primeiro) atual.primeiro = c.created_at
      if (c.created_at > atual.ultimo) atual.ultimo = c.created_at
    } else {
      porCpf.set(c.cpf, {
        cpf: c.cpf,
        nome: c.nome,          // o mais recente, porque a consulta vem ordenada
        telefone: c.telefone,
        cargo: c.cargo,
        eventos: new Set(evento?.nome ? [evento.nome] : []),
        organizacoes: new Set(evento?.organizacoes?.nome ? [evento.organizacoes.nome] : []),
        primeiro: c.created_at,
        ultimo: c.created_at,
      })
    }
  }
  const pessoas = [...porCpf.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo))
  const totalCadastros = count ?? 0
  const parcial = !busca && totalCadastros > TETO_LEITURA

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Base de funcionários"
        descricao="Todo mundo que já foi credenciado por qualquer cliente, identificado pelo CPF"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pessoas na base" value={pessoas.length.toLocaleString('pt-BR')} icon={IdCard} tom="acento" />
        <StatCard label="Cadastros feitos" value={totalCadastros.toLocaleString('pt-BR')} icon={Users} tom="info" />
        <StatCard
          label="Organizações"
          value={new Set([...porCpf.values()].flatMap(p => [...p.organizacoes])).size}
          icon={Building2}
          tom="sucesso"
        />
        <StatCard
          label="Já em 2+ eventos"
          value={pessoas.filter(p => p.eventos.size > 1).length}
          icon={CalendarDays}
          tom="aviso"
        />
      </div>

      <Aviso tom="marca">
        Quando um cliente novo enviar a planilha da equipe dele, quem já estiver aqui é reconhecido
        pelo CPF e tem o cadastro preenchido sozinho — a pessoa não digita tudo de novo.
      </Aviso>

      <form className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por CPF ou nome..."
            className="input"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <button type="submit" className="btn btn-primario shrink-0">Buscar</button>
        {busca && (
          <Link href="/admin/base-funcionarios" className="btn btn-secundario btn-icone" aria-label="Limpar busca">
            <X className="w-4 h-4" />
          </Link>
        )}
      </form>

      {parcial && (
        <Aviso tom="atencao">
          A base passou de {TETO_LEITURA.toLocaleString('pt-BR')} cadastros. A lista abaixo mostra os mais
          recentes; use a busca por CPF para encontrar alguém específico — a busca varre a base inteira.
        </Aviso>
      )}

      <Secao
        titulo="Pessoas"
        descricao={
          busca
            ? `${pessoas.length} resultado${pessoas.length === 1 ? '' : 's'} para "${busca}"`
            : 'Uma linha por CPF, mesmo que a pessoa tenha se cadastrado em vários eventos'
        }
      >
        {!pessoas.length ? (
          <EmptyState
            icone={<IdCard className="w-7 h-7" />}
            titulo={busca ? 'Ninguém encontrado com esse CPF ou nome' : 'A base ainda está vazia'}
            descricao={
              busca
                ? 'Confira os números ou tente parte do nome.'
                : 'Ela se preenche sozinha conforme as equipes se cadastram nos eventos.'
            }
          />
        ) : (
          <>
            {/* Celular: cartão. Desktop: tabela. Mesma lista, leituras diferentes. */}
            <div className="md:hidden divide-y divide-slate-100">
              {pessoas.map(p => (
                <Link key={p.cpf} href={`/admin/pessoas/${p.cpf}`} className="block p-4 space-y-2 hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-brand-500 text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-slate-500 text-xs tabular-nums">{formatCpf(p.cpf)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="indicador-selo selo-neutro">{p.eventos.size} evento{p.eventos.size !== 1 ? 's' : ''}</span>
                    <span className="indicador-selo selo-neutro">{p.organizacoes.size} organizaç{p.organizacoes.size !== 1 ? 'ões' : 'ão'}</span>
                    {p.cargo && <span className="indicador-selo selo-neutro">{p.cargo}</span>}
                  </div>
                  <p className="text-slate-400 text-2xs">
                    {p.telefone ? `${p.telefone} · ` : ''}último cadastro em {formatarBR(p.ultimo, 'curto')}
                  </p>
                </Link>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    {['Pessoa', 'CPF', 'Telefone', 'Eventos', 'Organizações', 'Último cadastro'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map(p => (
                    <tr key={p.cpf}>
                      <td>
                        <Link href={`/admin/pessoas/${p.cpf}`} className="text-brand-500 font-medium hover:underline">
                          {p.nome}
                        </Link>
                        {p.cargo && <p className="text-slate-500 text-xs">{p.cargo}</p>}
                      </td>
                      <td className="tabular-nums">{formatCpf(p.cpf)}</td>
                      <td>{p.telefone || '—'}</td>
                      <td className="tabular-nums" title={[...p.eventos].join(', ')}>{p.eventos.size}</td>
                      <td className="tabular-nums" title={[...p.organizacoes].join(', ')}>{p.organizacoes.size}</td>
                      <td className="text-slate-400 text-xs">{formatarBR(p.ultimo, 'curto')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Secao>
    </div>
  )
}
