import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarDays, Building2, Briefcase, MapPin, Phone, MessageCircle, IdCard,
} from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Ficha de uma pessoa da base, identificada pelo CPF.
 *
 * O CPF é a identidade: a mesma pessoa aparece uma vez por evento na tabela
 * `funcionarios`, então a ficha junta todas essas linhas numa história só —
 * onde já trabalhou, em que função e se bateu ponto.
 *
 * É a tela que responde "posso chamar essa pessoa?" antes de convidar alguém
 * da base para um evento novo.
 *
 * NÃO mostra valores. O que outra organização pagou a essa pessoa é preço de
 * concorrente: quem contrata precisa saber se ela aparece e o que ela faz —
 * não a tabela de quem a chamou antes.
 */

const ETAPAS = ['entrada', 'meio', 'fim'] as const
const ROTULO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export default async function PessoaPage({ params }: { params: Promise<{ cpf: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Admin e master: a ficha existe pra montar equipe, que é trabalho de quem
  // gerencia evento. Supervisor não recruta.
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { cpf: cpfParam } = await params
  const cpf = decodeURIComponent(cpfParam).replace(/\D/g, '')
  if (cpf.length !== 11) notFound()

  const { data: cadastros } = await supabaseAdmin
    .from('funcionarios')
    .select(`
      id, nome, cpf, telefone, empresa, cargo, cidade, chave_pix, ativo, created_at,
      fornecedores!inner(id, nome, evento_id, eventos!inner(id, nome, data_inicio, data_fim, organizacao_id, organizacoes(nome)))
    `)
    .eq('cpf', cpf)
    .order('created_at', { ascending: false })

  if (!cadastros?.length) notFound()

  // Todos os registros de presença desta pessoa, de uma vez.
  const { data: registros } = await supabaseAdmin
    .from('registros')
    .select('funcionario_id, tipo, created_at')
    .in('funcionario_id', cadastros.map(c => c.id))

  const porFuncionario = new Map<string, Set<string>>()
  for (const r of registros ?? []) {
    const s = porFuncionario.get(r.funcionario_id) ?? new Set<string>()
    s.add(r.tipo as string)
    porFuncionario.set(r.funcionario_id, s)
  }

  type Rel = { id: string; nome: string; eventos: { id: string; nome: string; data_inicio: string; data_fim: string; organizacao_id: string | null; organizacoes: { nome: string } | null } }

  const trabalhos = cadastros.map(c => {
    const forn = c.fornecedores as unknown as Rel
    const feitas = porFuncionario.get(c.id) ?? new Set<string>()
    return {
      funcionarioId: c.id,
      eventoId: forn.eventos.id,
      evento: forn.eventos.nome,
      organizacaoId: forn.eventos.organizacao_id,
      organizacao: forn.eventos.organizacoes?.nome ?? '—',
      setor: forn.nome,
      setorId: forn.id,
      cargo: c.cargo ?? '',
      data: forn.eventos.data_inicio,
      dataFim: forn.eventos.data_fim,
      ativo: c.ativo !== false,
      etapas: ETAPAS.filter(t => feitas.has(t)),
      compareceu: feitas.has('entrada'),
    }
  })

  // O cadastro mais recente manda nos dados pessoais: é o que a pessoa
  // preencheu por último, então é o telefone que ainda atende.
  const atual = cadastros[0]
  const cidade = cadastros.find(c => c.cidade)?.cidade ?? null
  const telefone = (atual.telefone as string | null) ?? null

  const organizacoes = new Set(trabalhos.map(t => t.organizacao))
  const compareceu = trabalhos.filter(t => t.compareceu).length
  const ultimoTrabalho = trabalhos[0]?.data ? formatarBR(trabalhos[0].data, 'data') : '—'
  // Taxa de presença: chamou e a pessoa apareceu. É o número que decide se
  // vale a pena convidar de novo — mais útil que "quantos eventos".
  const taxa = trabalhos.length ? Math.round((compareceu / trabalhos.length) * 100) : 0

  // Só dígitos e com o 55 na frente: é o formato que o wa.me aceita.
  const zap = telefone ? `55${telefone.replace(/\D/g, '')}` : null

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={atual.nome as string}
        descricao={[cargoMaisComum(trabalhos), cidade].filter(Boolean).join(' · ') || 'Sem função registrada'}
        voltarPara={ehMaster(perfil.role) ? '/admin/base-funcionarios' : '/admin/encontrar'}
        acoes={
          zap ? (
            <a
              href={`https://wa.me/${zap}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primario"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              Chamar no WhatsApp
            </a>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Eventos trabalhados" value={trabalhos.length} icon={CalendarDays} tom="acento" />
        <StatCard label="Organizações" value={organizacoes.size} icon={Building2} tom="info" />
        <StatCard label="Taxa de presença" value={`${taxa}%`} sub={`compareceu em ${compareceu}`} icon={Briefcase} tom="sucesso" />
        <StatCard label="Último trabalho" value={ultimoTrabalho} icon={CalendarDays} small tom="aviso" />
      </div>

      <Secao titulo="Dados de contato" icone={<IdCard className="w-3.5 h-3.5" />} corpoClassName="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Dado rotulo="CPF" valor={formatCpf(cpf)} />
          <Dado rotulo="Telefone" valor={telefone || '—'} icone={<Phone className="w-3 h-3" />} />
          <Dado rotulo="Cidade" valor={cidade || 'não informada'} icone={<MapPin className="w-3 h-3" />} />
          <Dado rotulo="Chave PIX" valor={(atual.chave_pix as string | null) || '—'} />
        </div>
      </Secao>

      <Secao
        titulo="Histórico de trabalho"
        icone={<Briefcase className="w-3.5 h-3.5" />}
        descricao="Do evento mais recente para o mais antigo"
        acoes={<span className="indicador-selo selo-neutro">{trabalhos.length}</span>}
      >
        {!trabalhos.length ? (
          <EmptyState titulo="Nenhum evento no histórico" />
        ) : (
          <div className="divide-y divide-slate-100">
            {trabalhos.map(t => (
              <div key={t.funcionarioId} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Só quem enxerga o evento pode abri-lo: um admin de outra
                        organização vê a linha do histórico, mas não entra. */}
                    {podeAbrir(perfil, t.organizacaoId) ? (
                      <Link href={`/admin/eventos/${t.eventoId}`} className="text-brand-500 text-sm font-medium truncate hover:underline">
                        {t.evento}
                      </Link>
                    ) : (
                      <span className="text-slate-800 text-sm font-medium truncate">{t.evento}</span>
                    )}
                    {t.compareceu
                      ? <Badge tom="positivo">Compareceu</Badge>
                      : <Badge tom="atencao">Não bateu entrada</Badge>}
                    {!t.ativo && <Badge tom="neutro">Inativa</Badge>}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3 shrink-0" />
                      {formatarBR(t.data, 'data')}
                      {t.dataFim && formatarBR(t.dataFim, 'data') !== formatarBR(t.data, 'data')
                        ? ` a ${formatarBR(t.dataFim, 'data')}` : ''}
                    </span>
                    <span className="flex items-center gap-1 min-w-0">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{t.organizacao}</span>
                    </span>
                    <span className="truncate">{t.setor}{t.cargo ? ` · ${t.cargo}` : ''}</span>
                    {!!t.etapas.length && (
                      <span className="truncate">{t.etapas.map(e => ROTULO[e]).join(' · ')}</span>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}

/** Master vê tudo; admin só os eventos da própria organização. */
function podeAbrir(perfil: { role: string; organizacao_id: string | null }, orgDoEvento: string | null) {
  return ehMaster(perfil.role) || (!!orgDoEvento && orgDoEvento === perfil.organizacao_id)
}

/** A função que a pessoa mais exerceu — é como ela se apresenta no mercado. */
function cargoMaisComum(trabalhos: { cargo: string }[]): string {
  const contagem = new Map<string, number>()
  for (const t of trabalhos) {
    const c = t.cargo?.trim()
    if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1)
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function Dado({ rotulo, valor, icone }: { rotulo: string; valor: string; icone?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-500 text-xs">{rotulo}</p>
      <p className="text-slate-800 text-sm font-medium flex items-center gap-1.5 mt-0.5 truncate">
        {icone}
        <span className="truncate">{valor}</span>
      </p>
    </div>
  )
}
