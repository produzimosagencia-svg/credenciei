import { notFound } from 'next/navigation'
import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { diaBRT } from '@/lib/janelas'
import AvisoFormModal from './AvisoFormModal'
import TabelaAvisos, { type LinhaAviso } from './TabelaAvisos'

/**
 * O conteúdo da tela de Avisos de UM evento — a tabela, o botão de criar e
 * tudo que eles precisam do banco.
 *
 * Componente compartilhado porque a mesma tela é alcançada por dois
 * caminhos: de dentro do evento (`/admin/eventos/[id]/avisos`) e pelo item
 * "Avisos" do menu, que pede o evento antes (`/admin/avisos?evento=…`).
 * Duas cópias divergiriam no primeiro ajuste de coluna.
 *
 * A CHECAGEM DE PERMISSÃO NÃO MORA AQUI, de propósito: cada rota faz a sua
 * antes de renderizar isto, porque as duas têm réguas diferentes de "qual
 * evento você pode abrir". Passar `eventoId` para cá já é o resultado dessa
 * decisão, nunca o começo dela.
 */
export default async function PainelDeAvisos({ eventoId }: { eventoId: string }) {
  const [{ data: avisos }, { data: fornecedores }, { data: funcionarios }, { data: todosOsSetores }] = await Promise.all([
    supabase.from('avisos')
      .select('id, titulo, mensagem, ativo, data_inicio, data_fim, publico, cpf_pessoa, recorrente, created_at')
      .eq('evento_id', eventoId).order('created_at', { ascending: false }),
    supabase.from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome'),
    supabase.from('funcionarios')
      .select('id, nome, cpf, fornecedor_id, fornecedores!inner(evento_id)')
      .eq('fornecedores.evento_id', eventoId).order('nome'),
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

  const ids = (avisos ?? []).map(a => a.id as string)
  const contagemVisualizacoes = new Map<string, number>()
  if (ids.length) {
    const { data: visualizacoes } = await supabase
      .from('aviso_visualizacoes').select('aviso_id').in('aviso_id', ids)
    for (const v of visualizacoes ?? []) {
      contagemVisualizacoes.set(v.aviso_id, (contagemVisualizacoes.get(v.aviso_id) ?? 0) + 1)
    }
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
    <>
      <div className="flex justify-end">
        <AvisoFormModal
          mode="criar" eventoId={eventoId}
          fornecedores={fornecedores ?? []} funcionarios={funcionarios ?? []}
        />
      </div>
      <TabelaAvisos
        linhas={linhas}
        eventoId={eventoId}
        fornecedores={fornecedores ?? []}
        funcionarios={funcionarios ?? []}
        hoje={diaBRT()}
      />
    </>
  )
}

/** O evento existe e está dentro do escopo deste perfil? Usado pelas duas rotas. */
export async function eventoVisivel(eventoId: string, perfil: { role?: string; organizacao_id?: string | null }, veTodos: boolean) {
  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()
  if (!veTodos && evento.organizacao_id !== perfil.organizacao_id) notFound()
  return evento
}
