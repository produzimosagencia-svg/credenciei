import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { diaBRT } from '@/lib/janelas'
import { PageHeader } from '@/components/ui/Superficie'
import AvisoFormModal from './AvisoFormModal'
import TabelaAvisos, { type LinhaAviso } from './TabelaAvisos'

export const revalidate = 0

/**
 * Avisos do evento — o mural de comunicados que o admin manda pro
 * funcionário (credencial pública) e/ou pro supervisor (painel do setor).
 *
 * Vive por EVENTO, mesmo padrão de Presença e Relatórios — "Setores" e
 * "Pessoa específica" só fazem sentido escolhendo dentre a equipe DESTE
 * evento. Ver `lib/avisos.ts` para quem recebe o quê, e
 * `supabase/upgrade-avisos.sql` para o desenho da tabela.
 */
export default async function AvisosPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { id: eventoId } = await params

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const [{ data: avisos }, { data: fornecedores }, { data: funcionarios }, { data: todosOsSetores }] = await Promise.all([
    supabase.from('avisos')
      .select('id, titulo, mensagem, ativo, data_inicio, data_fim, publico, cpf_pessoa, recorrente, created_at')
      .eq('evento_id', eventoId).order('created_at', { ascending: false }),
    supabase.from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome'),
    supabase.from('funcionarios')
      .select('id, nome, cpf, fornecedor_id, fornecedores!inner(evento_id)')
      .eq('fornecedores.evento_id', eventoId).order('nome'),
    // Pra rotular "Setores" na coluna Destinatário sem N+1 — um select só,
    // filtrado em memória por aviso.
    supabase.from('aviso_setores').select('aviso_id, fornecedor_id'),
  ])

  const nomeDoSetor = new Map((fornecedores ?? []).map(f => [f.id, f.nome]))
  const nomeDaPessoa = new Map((funcionarios ?? []).map(f => [f.cpf, f.nome]))
  const setoresPorAviso = new Map<string, string[]>()
  for (const linha of todosOsSetores ?? []) {
    const lista = setoresPorAviso.get(linha.aviso_id) ?? []
    const nome = nomeDoSetor.get(linha.fornecedor_id)
    if (nome) lista.push(nome)
    setoresPorAviso.set(linha.aviso_id, lista)
  }

  const { data: visualizacoes } = await supabase
    .from('aviso_visualizacoes').select('aviso_id')
    .in('aviso_id', (avisos ?? []).map(a => a.id).length ? (avisos ?? []).map(a => a.id) : ['00000000-0000-0000-0000-000000000000'])
  const contagemVisualizacoes = new Map<string, number>()
  for (const v of visualizacoes ?? []) {
    contagemVisualizacoes.set(v.aviso_id, (contagemVisualizacoes.get(v.aviso_id) ?? 0) + 1)
  }

  const destinatario = (a: { publico: string; cpf_pessoa: string | null }, id: string) => {
    if (a.publico === 'todos') return 'Todos'
    if (a.publico === 'supervisores') return 'Supervisores'
    if (a.publico === 'pessoa') return a.cpf_pessoa ? (nomeDaPessoa.get(a.cpf_pessoa) ?? 'Pessoa não encontrada') : '—'
    const setores = setoresPorAviso.get(id) ?? []
    return setores.length ? setores.join(', ') : 'Nenhum setor'
  }

  const linhas: LinhaAviso[] = (avisos ?? []).map(a => ({
    id: a.id,
    titulo: a.titulo,
    mensagem: a.mensagem,
    ativo: a.ativo,
    dataInicio: a.data_inicio,
    dataFim: a.data_fim,
    publico: a.publico as LinhaAviso['publico'],
    cpfPessoa: a.cpf_pessoa,
    recorrente: a.recorrente,
    destinatario: destinatario(a, a.id),
    visualizacoes: contagemVisualizacoes.get(a.id) ?? 0,
    fornecedorIds: (todosOsSetores ?? []).filter(s => s.aviso_id === a.id).map(s => s.fornecedor_id),
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Avisos"
        descricao={`${evento.nome} — comunicados na credencial e no painel do supervisor`}
        acoes={
          <>
            <Link href={`/admin/eventos/${eventoId}`} className="btn btn-secundario">
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" /> Voltar ao evento
            </Link>
            <AvisoFormModal
              mode="criar"
              eventoId={eventoId}
              fornecedores={fornecedores ?? []}
              funcionarios={funcionarios ?? []}
            />
          </>
        }
      />

      <TabelaAvisos
        linhas={linhas}
        eventoId={eventoId}
        fornecedores={fornecedores ?? []}
        funcionarios={funcionarios ?? []}
        hoje={diaBRT()}
      />
    </div>
  )
}
