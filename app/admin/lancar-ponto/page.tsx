import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardPen, CalendarDays } from 'lucide-react'
import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { diaBRT } from '@/lib/janelas'
import { PageHeader, Aviso } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import LancarPonto, { type PessoaDoEvento, type DiaDaOperacao } from './LancarPonto'

export const revalidate = 0

/**
 * Lançamento manual de ponto — a tela do "ele não bateu, e eu preciso
 * registrar por ele, com a hora certa".
 *
 * Existe porque isso só era possível por script no banco: em 01/09/2026
 * foram treze pessoas do Henrique e Juliano regularizadas assim, uma a uma,
 * por fora do sistema. Ver `lancarPontoManual` em lib/actions.ts.
 *
 * Separada do "Registro de ponto" (`/admin/localizar`) de propósito: lá a
 * pessoa está na frente do operador e a foto do rosto é a prova; aqui ela já
 * foi embora, a foto é impossível e a prova é o motivo escrito mais o autor.
 *
 * Master vê todos os eventos, admin os da própria organização, supervisor os
 * do próprio setor.
 */
export default async function LancarPontoPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Mesma régua da action: quem gerencia o evento, o supervisor da equipe, ou suporte.
  if (!(podeGerenciarEventos(perfil.role) || perfil.role === 'supervisor' || perfil.role === 'suporte')) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Lançamento manual" descricao="Registrar uma batida que a pessoa não fez, com a hora certa" />
        <EscolherEvento
          eventos={await eventosQuePossoAbrir()}
          href={id => `/admin/lancar-ponto?evento=${id}`}
          icone={<ClipboardPen className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Entrada, meio ou saída, no dia e na hora que de fato aconteceram"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder lançar ponto nele.' }}
          mostrarOrganizacao={veTodosEventos(perfil.role)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) notFound()
  } else if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    notFound()
  }

  // Supervisor só lança da própria equipe — a lista já sai restrita, e a
  // action confere de novo (a lista esconde, quem barra é ela).
  const setoresDoSupervisor = perfil.role === 'supervisor'
    ? (await meusSetores(perfil)).filter(s => s.evento_id === eventoParam).map(s => s.id as string)
    : null
  if (setoresDoSupervisor && !setoresDoSupervisor.length) notFound()

  let setoresQuery = supabase.from('fornecedores').select('id, nome').eq('evento_id', eventoParam)
  if (setoresDoSupervisor) setoresQuery = setoresQuery.in('id', setoresDoSupervisor)
  const { data: setores } = await setoresQuery
  const idsSetores = (setores ?? []).map(s => s.id as string)
  const nomeSetor = new Map((setores ?? []).map(s => [s.id as string, s.nome as string]))

  const [{ data: funcionarios }, { data: dias }, { data: registros }] = await Promise.all([
    idsSetores.length
      ? supabase.from('funcionarios').select('id, nome, cpf, cargo, ativo, fornecedor_id').in('fornecedor_id', idsSetores).order('nome')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase.from('jornada_dias').select('data, tipo').eq('evento_id', eventoParam).eq('cancelado', false).order('data'),
    /*
     * As batidas de TODOS os dias, não só de hoje: a tela mostra o que já
     * existe no dia escolhido, e o dia escolhido costuma ser no passado —
     * é justamente o caso de uso.
     */
    supabase.from('registros').select('funcionario_id, tipo, created_at, data_ref').eq('evento_id', eventoParam),
  ])

  const batidasPorFunc: Record<string, Record<string, string>> = {}
  for (const r of registros ?? []) {
    const id = r.funcionario_id as string
    const ref = r.data_ref as string | null
    if (!ref) continue
    if (!batidasPorFunc[id]) batidasPorFunc[id] = {}
    batidasPorFunc[id][`${ref}:${r.tipo}`] = r.created_at as string
  }

  const pessoas: PessoaDoEvento[] = (funcionarios ?? []).map(f => ({
    id: f.id as string,
    nome: f.nome as string,
    cpf: f.cpf as string,
    setorNome: nomeSetor.get(f.fornecedor_id as string) ?? '—',
    cargo: (f.cargo as string | null) ?? '',
    ativo: f.ativo !== false,
    batidas: batidasPorFunc[f.id as string] ?? {},
  }))

  const diasDaOperacao: DiaDaOperacao[] = (dias ?? []).map(d => ({
    data: d.data as string,
    tipo: ((d.tipo as string) === 'principal' ? 'principal' : 'preparacao') as 'principal' | 'preparacao',
  }))

  const hoje = diaBRT()
  const diaPadrao =
    diasDaOperacao.find(d => d.data === hoje)?.data
    ?? [...diasDaOperacao].reverse().find(d => d.data <= hoje)?.data
    ?? diasDaOperacao[0]?.data
    ?? hoje

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Lançamento manual"
        descricao={`${evento.nome} — registrar uma batida que a pessoa não fez`}
        acoes={
          <Link href="/admin/lancar-ponto" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />

      {!diasDaOperacao.length ? (
        <Aviso tom="atencao">
          Este evento ainda não tem dias de trabalho marcados. Marque-os em <strong>Editar evento</strong> antes de
          lançar ponto — sem dia, a batida não apareceria em nenhuma lista nem no relatório.
        </Aviso>
      ) : (
        <LancarPonto pessoas={pessoas} dias={diasDaOperacao} diaPadrao={diaPadrao} />
      )}
    </div>
  )
}
