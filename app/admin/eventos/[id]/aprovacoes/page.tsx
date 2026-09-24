import { notFound, redirect } from 'next/navigation'
import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster, podeGerenciarEventos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { statusCredenciamentoValido } from '@/lib/credenciamento-constantes'
import { PageHeader } from '@/components/ui/Superficie'
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

  // null = vê o evento inteiro; array = só estes setores (supervisor).
  let fornecedorIdsPermitidos: string[] | null = null
  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    fornecedorIdsPermitidos = meus.filter(s => s.evento_id === eventoId).map(s => s.id)
    if (!fornecedorIdsPermitidos.length) notFound()
  } else {
    const podeSempre = podeGerenciarEventos(perfil) && (ehMaster(perfil.role) || evento.organizacao_id === perfil.organizacao_id)
    if (!podeSempre) {
      if (perfil.role !== 'suporte') notFound()
      if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: evento.organizacao_id ?? undefined }))) notFound()
    }
  }

  let query = supabase
    .from('funcionarios')
    .select('id, nome, cpf, telefone, empresa, cargo, origem, status_credenciamento, motivo_negacao, decidido_em, created_at, fornecedor_id, fornecedores!inner(nome, evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .order('created_at', { ascending: false })
  if (fornecedorIdsPermitidos) query = query.in('fornecedor_id', fornecedorIdsPermitidos)
  const { data: funcionarios } = await query

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
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Aprovações"
        descricao={`${evento.nome} — credenciamentos aguardando decisão`}
      />
      <PainelAprovacoes eventoId={eventoId} linhas={linhas} />
    </div>
  )
}
