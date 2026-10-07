import { redirect } from 'next/navigation'
import { UserPlus, Eye } from 'lucide-react'
import { getPerfil, meusSetoresDoEventoAtual } from '@/lib/supabase-server'
import { listarEncarregadosDoEvento } from '@/lib/actions-encarregado'
import { EmptyState, PageHeader, Aviso } from '@/components/ui/Superficie'
import GerenciarEncarregados from './GerenciarEncarregados'

export const revalidate = 0

/**
 * Criar Encarregado — a tela do supervisor.
 *
 * Só quem supervisiona um setor entra aqui (papel `supervisor`). É UM cadastro
 * por pessoa: ela é escolhida na equipe e o supervisor marca em quais dos
 * setores dele ela fica como Encarregada — nada de um acesso por setor. A
 * função liga e desliga por organização em Configurações → Funcionalidades;
 * desligada, a tela explica em vez de mostrar um botão que não vai funcionar.
 */
export default async function EncarregadosPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'supervisor') redirect('/admin')

  const setoresDoEvento = await meusSetoresDoEventoAtual(perfil)
  const eventoId = setoresDoEvento[0]?.evento_id
  if (!eventoId) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Criar Encarregado" descricao="Delegue a consulta dos seus setores a alguém da equipe" />
        <EmptyState icone={<Eye className="w-7 h-7" />} titulo="Nenhum evento aberto" descricao="Escolha um evento em Meus eventos para começar." />
      </div>
    )
  }

  const painel = await listarEncarregadosDoEvento(eventoId)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Criar Encarregado"
        descricao={'erro' in painel ? 'Delegue a consulta dos seus setores a alguém da equipe' : painel.evento.nome}
      />

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
            <strong>Encarregado</strong> é alguém da sua equipe que passa a poder <strong>consultar</strong> os setores
            que você escolher — só ver a equipe e a presença, sem nenhuma ação. É um cadastro só: a pessoa recebe
            <strong> uma mensagem</strong> e, dentro do acesso, escolhe qual setor quer olhar.
          </Aviso>
          <GerenciarEncarregados eventoId={painel.evento.id} eventoNome={painel.evento.nome} setores={painel.setores} encarregados={painel.encarregados} />
        </>
      )}
    </div>
  )
}
