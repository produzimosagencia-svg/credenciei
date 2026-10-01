import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarUsuarios, podeGerenciarEventos, podeExcluir, podeEditarIdentidade } from '@/lib/permissions'
import { Users, ChevronLeft } from 'lucide-react'
import FornecedorModal from '../../FornecedorModal'
import ListaDeSetores from '../../ListaDeSetores'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * A equipe de UM subevento (correção 30/09/2026: Evento → Subevento →
 * Fornecedor). Mesma estrutura que a página do evento já tinha pra
 * fornecedores direto nele — só que filtrada a este subevento. Portaria,
 * operadores, cadastro por link e avisos continuam só na página do evento
 * (são do evento inteiro, não duplicam por subevento).
 */
export default async function SubeventoPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>
}) {
  const { id: eventoId, sid } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const [{ data: evento }, { data: subevento }, { data: diasTrabalho }] = await Promise.all([
    supabase.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single(),
    supabase.from('subeventos').select('id, nome, evento_id').eq('id', sid).single(),
    supabase.from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
  ])
  if (!evento || !subevento || subevento.evento_id !== eventoId) notFound()
  if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const { data: fornecedores } = await supabase
    .from('fornecedores')
    .select('id, nome, token_formulario, quantidade_estimada, valor_combinado, cpfs_autorizados, funcionarios(count)')
    .eq('subevento_id', sid)
    .order('created_at')

  const fornecedorIds = fornecedores?.map(f => f.id) ?? []
  const vazio = { data: [] as never[] }

  const buscarTodosOsFuncionarios = async () => {
    if (!fornecedorIds.length) return vazio
    const consultar = (inicio: number) => supabase.from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, empresa, fornecedor_id, valor_receber, chave_pix, pago, pago_em, foto_perfil_path, ativo')
      .in('fornecedor_id', fornecedorIds)
      .order('nome').order('id')
      .range(inicio, inicio + 999)
    let resposta = await consultar(0)
    if (resposta.error || !resposta.data) return resposta
    const todos = [...resposta.data]
    while (resposta.data.length === 1000) {
      resposta = await consultar(todos.length)
      if (resposta.error || !resposta.data) return resposta
      todos.push(...resposta.data)
    }
    return { ...resposta, data: todos }
  }

  const [
    { data: setoresComMeioRows },
    { data: entradaQualquerHorarioRows },
    { data: linkDosSetoresRows },
    { data: funcionariosDoEventoRows },
    { data: supervisoresRows },
  ] = await Promise.all([
    fornecedorIds.length ? supabase.from('fornecedores').select('id, exige_meio').in('id', fornecedorIds) : Promise.resolve(vazio),
    fornecedorIds.length ? supabase.from('fornecedores').select('id, entrada_qualquer_horario').in('id', fornecedorIds) : Promise.resolve(vazio),
    fornecedorIds.length ? supabase.from('fornecedores').select('id, link_ativo').in('id', fornecedorIds) : Promise.resolve(vazio),
    buscarTodosOsFuncionarios(),
    fornecedorIds.length
      ? supabase.from('supervisor_setores').select('fornecedor_id, perfis!inner(id, nome, email, cpf, telefone, ativo, role)').in('fornecedor_id', fornecedorIds)
      : Promise.resolve(vazio),
  ])

  const setoresComMeio = new Set((setoresComMeioRows ?? []).filter(f => f.exige_meio === true).map(f => f.id as string))
  const setoresComEntradaQualquerHorario = new Set(
    (entradaQualquerHorarioRows ?? []).filter(f => f.entrada_qualquer_horario === true).map(f => f.id as string),
  )
  const setoresComLinkDesligado = new Set((linkDosSetoresRows ?? []).filter(f => f.link_ativo === false).map(f => f.id as string))

  type SupervisorDoCard = { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }
  const supervisoresPorFornecedor: Record<string, SupervisorDoCard[]> = {}
  for (const linha of supervisoresRows ?? []) {
    const p = (linha as unknown as { fornecedor_id: string; perfis: SupervisorDoCard }).perfis
    if (!p) continue
    const lista = (supervisoresPorFornecedor[linha.fornecedor_id as string] ??= [])
    if (!lista.some(s => s.id === p.id)) lista.push(p)
  }
  for (const lista of Object.values(supervisoresPorFornecedor)) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const podeGerenciarSupervisores = podeGerenciarUsuarios(perfil)

  return (
    <div className="space-y-5">
      <Link
        href={`/admin/eventos/${eventoId}`}
        className="inline-flex items-center gap-1 text-slate-500 text-sm hover:text-slate-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> {evento.nome}
      </Link>

      <PageHeader titulo={subevento.nome} descricao="Fornecedores escalados neste subevento" />

      <Secao
        tom="acento"
        icone={<Users className="w-3.5 h-3.5" />}
        titulo="Fornecedores"
        descricao="Cada fornecedor gera um link próprio de cadastro para a equipe"
        acoes={
          <FornecedorModal
            eventoId={eventoId}
            mode="criar"
            subeventoId={sid}
            podeCriarSupervisor={podeGerenciarUsuarios(perfil) || perfil.role === 'suporte'}
          />
        }
        corpoClassName={fornecedores?.length ? 'p-4' : ''}
      >
        {!fornecedores?.length ? (
          <EmptyState icone={<Users className="w-7 h-7" />} titulo="Nenhum fornecedor neste subevento ainda" />
        ) : (
          <ListaDeSetores
            fornecedores={fornecedores}
            eventoId={eventoId}
            supervisoresPorFornecedor={supervisoresPorFornecedor}
            funcionariosDoEvento={funcionariosDoEventoRows ?? []}
            diasDoEvento={diasTrabalho ?? []}
            setoresComMeio={setoresComMeio}
            setoresComEntradaQualquerHorario={setoresComEntradaQualquerHorario}
            setoresComLinkDesligado={setoresComLinkDesligado}
            podeGerenciarSupervisores={podeGerenciarSupervisores}
            podeExcluir={podeExcluir(perfil)}
            eventoNome={evento.nome}
            podeMoverDeSetor={podeGerenciarEventos(perfil)}
            podeEditarCpf={podeEditarIdentidade(perfil)}
            podeEditarPonto={podeGerenciarEventos(perfil) || perfil?.role === 'suporte'}
            role={perfil?.role}
            subeventos={[]}
          />
        )}
      </Secao>
    </div>
  )
}
