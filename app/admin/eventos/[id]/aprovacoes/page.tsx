import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Ban } from 'lucide-react'
import { getPerfil, meusSetores, buscarTudo, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster, podeGerenciarEventos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { statusCredenciamentoValido } from '@/lib/credenciamento-constantes'
import { PageHeader } from '@/components/ui/Superficie'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento, escalasDosFuncionarios, type EscalaDoFuncionario } from '@/lib/escala'
import PainelAprovacoes, { type CredenciamentoLinha } from './PainelAprovacoes'

export const revalidate = 0

/**
 * Credenciamentos aguardando aprovação — cadastro público (link ou portaria)
 * não libera QR sozinho mais (decisão do Juan, 24/09/2026). Uma tela só,
 * cross-setor, filtrada pelo escopo de quem está vendo: supervisor só os
 * próprios setores, admin/master/suporte-com-escopo o evento inteiro. Mesmo
 * espírito de app/admin/veiculos/page.tsx.
 */
export default async function AprovacoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { data: evento } = await supabase.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()

  /*
   * null = vê o evento inteiro; array = só estes setores (vínculo de
   * supervisor — papel 'supervisor' OU outro papel que GANHOU um vínculo,
   * achado ao vivo, 05/10/2026, caso da Mara Lúcia: o branch antigo, por
   * papel, caía direto no `notFound()` de quem não é suporte).
   */
  let fornecedorIdsPermitidos: string[] | null = null
  const meusSetoresNesteEvento = (await meusSetores(perfil)).filter(s => s.evento_id === eventoId)
  if (meusSetoresNesteEvento.length) {
    fornecedorIdsPermitidos = meusSetoresNesteEvento.map(s => s.id)
  } else if (perfil.role === 'supervisor') {
    notFound()
  } else {
    const podeSempre = podeGerenciarEventos(perfil) && (ehMaster(perfil.role) || evento.organizacao_id === perfil.organizacao_id)
    if (!podeSempre) {
      if (perfil.role !== 'suporte') notFound()
      if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) notFound()
    }
  }

  /*
   * Paginado: o Supabase corta em 1000 linhas sem avisar, e num evento de 4
   * mil pessoas os pendentes mais antigos simplesmente sumiam desta tela (e
   * os contadores das abas ficavam errados). `id` desempata a ordem — sem
   * ordem única, as páginas se sobrepõem.
   */
  const funcionarios = await buscarTudo((de, ate) => {
    let query = supabase
      .from('funcionarios')
      .select('id, nome, cpf, telefone, empresa, cargo, origem, status_credenciamento, motivo_negacao, decidido_em, decidido_por, created_at, fornecedor_id, fornecedores!inner(nome, evento_id)')
      .eq('fornecedores.evento_id', eventoId)
    if (fornecedorIdsPermitidos) query = query.in('fornecedor_id', fornecedorIdsPermitidos)
    return query.order('created_at', { ascending: false }).order('id').range(de, ate)
  })

  // Quem decidiu — consulta à parte, sem depender do nome da constraint.
  const decisores = [...new Set((funcionarios ?? []).map(f => f.decidido_por as string | null).filter((v): v is string => !!v))]
  const { data: perfisDecisores } = decisores.length
    ? await supabase.from('perfis').select('id, nome').in('id', decisores)
    : { data: [] as { id: string; nome: string }[] }
  const nomeDecisor = new Map((perfisDecisores ?? []).map(p => [p.id as string, p.nome as string]))

  // Evento de subeventos: os dias do evento e a escala de cada pessoa (lib/escala.ts).
  const usaEscala = await eventoUsaEscalaPorDia(eventoId)
  const diasDoEvento = usaEscala ? await diasDaEscalaDoEvento(eventoId) : null
  const escalas = usaEscala
    ? await escalasDosFuncionarios((funcionarios ?? []).map(f => f.id as string))
    : new Map<string, EscalaDoFuncionario>()

  const linhas: CredenciamentoLinha[] = (funcionarios ?? []).map(f => ({
    id: f.id as string,
    nome: f.nome as string,
    cpf: f.cpf as string,
    telefone: f.telefone as string,
    empresa: (f.empresa as string | null) ?? null,
    cargo: (f.cargo as string | null) ?? null,
    setorId: f.fornecedor_id as string,
    setorNome: (f.fornecedores as unknown as { nome: string })?.nome ?? '',
    origem: (f.origem as string | null) ?? 'formulario',
    status: statusCredenciamentoValido(f.status_credenciamento as string),
    motivoNegacao: (f.motivo_negacao as string | null) ?? null,
    criadoEm: f.created_at as string,
    decididoEm: (f.decidido_em as string | null) ?? null,
    decididoPor: f.decidido_por ? (nomeDecisor.get(f.decidido_por as string) ?? null) : null,
    escala: (() => {
      const e = escalas.get(f.id as string)
      if (!e?.status) return null
      return {
        status: e.status,
        pedidos: e.dias.filter(d => d.selecionado).map(d => d.data),
        aprovados: e.dias.filter(d => d.aprovado).map(d => d.data),
        decididaEm: e.decididaEm,
        decididaPor: e.decididaPor,
      }
    })(),
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Aprovações"
        descricao={`${evento.nome} — credenciamentos aguardando decisão`}
        /*
         * Quem entrou por VÍNCULO (papel 'supervisor' ou outro papel que
         * ganhou o vínculo) não pode abrir `/admin/eventos/${eventoId}` (vira
         * loop — essa página sempre manda de volta pro próprio fornecedor,
         * ver app/admin/eventos/[id]/page.tsx). Volta pro MESMO fornecedor
         * neste evento, não pro seletor de eventos — é de lá que veio. Mesmo
         * ajuste já feito na tela do fornecedor, 02/10/2026 e 05/10/2026.
         */
        voltarPara={
          fornecedorIdsPermitidos
            ? (fornecedorIdsPermitidos[0] ? `/admin/eventos/${eventoId}/fornecedor/${fornecedorIdsPermitidos[0]}` : '/admin/meus-eventos')
            : `/admin/eventos/${eventoId}`
        }
        acoes={
          <Link href="/admin/aprovacoes?aba=negados" className="btn btn-secundario">
            <Ban className="w-3.5 h-3.5 shrink-0" /> Histórico de negados
          </Link>
        }
      />
      <PainelAprovacoes eventoId={eventoId} linhas={linhas} diasDoEvento={diasDoEvento} />
    </div>
  )
}
