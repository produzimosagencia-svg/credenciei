import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Eye } from 'lucide-react'
import { getPerfil, meusSetoresDoEventoAtual, comArea } from '@/lib/supabase-server'
import { listarEncarregadosDoSetor } from '@/lib/actions-encarregado'
import { caminhoDoSetor } from '@/lib/encarregado'
import { EmptyState, PageHeader, Aviso } from '@/components/ui/Superficie'
import GerenciarEncarregados from './GerenciarEncarregados'

export const revalidate = 0

/**
 * Criar Encarregado — a tela do supervisor.
 *
 * Só quem supervisiona um setor entra aqui (papel `supervisor`). A função
 * liga e desliga por organização em Configurações → Funcionalidades; desligada,
 * a tela explica em vez de mostrar um botão que não vai funcionar.
 */
export default async function EncarregadosPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'supervisor') redirect('/admin')

  const setores = await meusSetoresDoEventoAtual(perfil).then(comArea)
  if (!setores.length) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Criar Encarregado" descricao="Delegue a consulta do seu setor a alguém da equipe" />
        <EmptyState icone={<Eye className="w-7 h-7" />} titulo="Nenhum setor aberto" descricao="Escolha um evento em Meus eventos para começar." />
      </div>
    )
  }

  const { setor: setorParam } = await searchParams
  const escolhido = setores.find(s => s.id === setorParam) ?? setores.find(s => s.id === perfil.fornecedor_id) ?? setores[0]
  const painel = await listarEncarregadosDoSetor(escolhido.id)

  return (
    <div className="space-y-5">
      <PageHeader titulo="Criar Encarregado" descricao="Delegue a consulta do seu setor a alguém da equipe" />

      {setores.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {setores.map(s => (
            <Link
              key={s.id} href={`/admin/encarregados?setor=${s.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                s.id === escolhido.id ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
              }`}
            >
              {s.area ? `${s.area} › ` : ''}{s.nome.trim()}
            </Link>
          ))}
        </div>
      )}

      {'erro' in painel ? (
        <Aviso tom="atencao">{painel.erro}</Aviso>
      ) : !painel.habilitado ? (
        <EmptyState
          icone={<UserPlus className="w-7 h-7" />}
          titulo="Função não liberada"
          descricao="A criação de Encarregados não está liberada para a sua organização. Peça ao administrador para ativá-la."
        />
      ) : (
        <>
          <Aviso tom="marca" icone={<Eye className="w-4 h-4" />}>
            <strong>Encarregado</strong> é alguém da sua equipe que passa a poder <strong>consultar</strong> o setor{' '}
            <strong>{caminhoDoSetor(painel.setor)}</strong> — só ver a equipe e a presença, sem nenhuma ação.
          </Aviso>
          <GerenciarEncarregados setor={painel.setor} encarregados={painel.encarregados} />
        </>
      )}
    </div>
  )
}
