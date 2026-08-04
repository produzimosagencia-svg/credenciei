import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Search, Users, Building2, CalendarDays, IdCard, X } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'

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
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Base de Funcionários</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Todo mundo que já foi credenciado por qualquer cliente, identificado pelo CPF
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Indicador icone={IdCard} rotulo="Pessoas na base" valor={pessoas.length} />
        <Indicador icone={Users} rotulo="Cadastros feitos" valor={totalCadastros} />
        <Indicador
          icone={Building2}
          rotulo="Organizações"
          valor={new Set([...porCpf.values()].flatMap(p => [...p.organizacoes])).size}
        />
        <Indicador
          icone={CalendarDays}
          rotulo="Já em 2+ eventos"
          valor={pessoas.filter(p => p.eventos.size > 1).length}
        />
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-2xl px-5 py-3.5">
        <p className="text-brand-700 text-sm">
          Quando um cliente novo enviar a planilha da equipe dele, quem já estiver aqui é reconhecido
          pelo CPF e tem o cadastro preenchido sozinho — a pessoa não digita tudo de novo.
        </p>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por CPF ou nome..."
            className="input"
            style={{ paddingLeft: 40 }}
          />
        </div>
        <button
          type="submit"
          className="btn-press shrink-0 bg-brand-500 hover:bg-brand-600 text-white px-5 rounded-xl font-semibold text-sm shadow-md shadow-brand-200"
        >
          Buscar
        </button>
        {busca && (
          <Link
            href="/admin/base-funcionarios"
            className="btn-press shrink-0 flex items-center justify-center w-11 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 shadow-sm"
            title="Limpar busca"
          >
            <X className="w-4 h-4" />
          </Link>
        )}
      </form>

      {parcial && (
        <p className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          A base passou de {TETO_LEITURA.toLocaleString('pt-BR')} cadastros. A lista abaixo mostra os mais
          recentes; use a busca por CPF para encontrar alguém específico — a busca varre a base inteira.
        </p>
      )}

      {!pessoas.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <IdCard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">
            {busca ? 'Ninguém encontrado com esse CPF ou nome' : 'A base ainda está vazia'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {busca
              ? 'Confira os números ou tente parte do nome.'
              : 'Ela se preenche sozinha conforme as equipes se cadastram nos eventos.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Celular: cartão. Desktop: tabela. Mesma lista, leituras diferentes. */}
          <div className="md:hidden divide-y divide-slate-100">
            {pessoas.map(p => (
              <div key={p.cpf} className="p-4 space-y-2">
                <div>
                  <p className="text-slate-800 text-sm font-semibold truncate">{p.nome}</p>
                  <p className="text-slate-400 text-xs tabular-nums">{formatCpf(p.cpf)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Etiqueta>{p.eventos.size} evento{p.eventos.size !== 1 ? 's' : ''}</Etiqueta>
                  <Etiqueta>{p.organizacoes.size} organizaç{p.organizacoes.size !== 1 ? 'ões' : 'ão'}</Etiqueta>
                  {p.cargo && <Etiqueta>{p.cargo}</Etiqueta>}
                </div>
                <p className="text-slate-400 text-[11px]">
                  {p.telefone ? `${p.telefone} • ` : ''}último cadastro em {formatarBR(p.ultimo, 'curto')}
                </p>
              </div>
            ))}
          </div>

          <table className="hidden md:table w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Pessoa', 'CPF', 'Telefone', 'Eventos', 'Organizações', 'Último cadastro'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pessoas.map(p => (
                <tr key={p.cpf} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-slate-800 text-sm font-semibold">{p.nome}</p>
                    {p.cargo && <p className="text-slate-400 text-xs">{p.cargo}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm tabular-nums">{formatCpf(p.cpf)}</td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{p.telefone || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-sm" title={[...p.eventos].join(', ')}>
                    {p.eventos.size}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm" title={[...p.organizacoes].join(', ')}>
                    {p.organizacoes.size}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatarBR(p.ultimo, 'curto')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Indicador({ icone: Icone, rotulo, valor }: { icone: React.ElementType; rotulo: string; valor: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center mb-3">
        <Icone className="w-5 h-5 text-brand-600" />
      </div>
      <p className="text-slate-800 text-2xl font-bold tabular-nums">{valor.toLocaleString('pt-BR')}</p>
      <p className="text-slate-400 text-xs mt-0.5">{rotulo}</p>
    </div>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
      {children}
    </span>
  )
}
