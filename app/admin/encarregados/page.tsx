import { redirect } from 'next/navigation'
import { UserPlus, Eye } from 'lucide-react'
import { getPerfil, meusSetoresDoEventoAtual } from '@/lib/supabase-server'
import { podeGerenciarUsuarios, ehMaster } from '@/lib/permissions'
import { listarEncarregadosDoEvento } from '@/lib/actions-encarregado'
import { EmptyState, PageHeader, Aviso } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import GerenciarEncarregados from './GerenciarEncarregados'

export const revalidate = 0

/**
 * Encarregados — a tela de quem designa e cuida do acesso.
 *
 * É UM cadastro por pessoa: ela é escolhida na equipe e marca-se em quais
 * setores fica como Encarregada — nada de um acesso por setor. Quem entra:
 *
 *   - o SUPERVISOR: no evento que ele tem aberto, só os setores dele;
 *   - o ADMINISTRADOR (e o master): escolhe o evento primeiro e enxerga todos os
 *     setores dele (o administrador, só os da própria organização).
 *
 * Os três também geram um link de nova senha. A função liga e desliga por
 * organização em Configurações → Funcionalidades; desligada, a tela explica em
 * vez de mostrar um botão que não vai funcionar.
 */
export default async function EncarregadosPage({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  const ehSupervisor = perfil.role === 'supervisor'
  if (!ehSupervisor && !podeGerenciarUsuarios(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams
  let eventoId: string | undefined
  let voltarPara = '/admin'

  if (ehSupervisor) {
    const setoresDoEvento = await meusSetoresDoEventoAtual(perfil)
    eventoId = setoresDoEvento[0]?.evento_id
    // De volta ao painel do setor dele (o mesmo destino do resto das telas do supervisor).
    voltarPara = eventoId ? `/admin/eventos/${eventoId}/fornecedor/${(perfil.fornecedor_id as string | null) ?? setoresDoEvento[0].id}` : '/admin/meus-eventos'
    if (!eventoId) {
      return (
        <div className="space-y-5">
          <PageHeader titulo="Criar Encarregado" descricao="Delegue a consulta dos seus setores a alguém da equipe" voltarPara={voltarPara} />
          <EmptyState icone={<Eye className="w-7 h-7" />} titulo="Nenhum evento aberto" descricao="Escolha um evento em Meus eventos para começar." />
        </div>
      )
    }
  } else if (!eventoParam) {
    // Administrador / master: primeiro o evento.
    const eventos = await eventosQuePossoAbrir()
    return (
      <div className="space-y-5">
        <PageHeader titulo="Encarregados" descricao="Designar, ajustar e dar nova senha a quem consulta os setores" voltarPara="/admin" />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/encarregados?evento=${id}`}
          icone={<UserPlus className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Os Encarregados são designados por evento"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder designar Encarregados.' }}
          mostrarOrganizacao={ehMaster(perfil.role)}
        />
      </div>
    )
  } else {
    eventoId = eventoParam
    voltarPara = '/admin/encarregados'
  }

  const painel = await listarEncarregadosDoEvento(eventoId!)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={ehSupervisor ? 'Criar Encarregado' : 'Encarregados'}
        descricao={'erro' in painel ? 'Delegue a consulta dos setores a alguém da equipe' : painel.evento.nome}
        voltarPara={voltarPara}
      />

      {'erro' in painel ? (
        <Aviso tom="atencao">{painel.erro}</Aviso>
      ) : !painel.habilitado ? (
        <EmptyState
          icone={<UserPlus className="w-7 h-7" />}
          titulo="Função não liberada"
          descricao={ehMaster(perfil.role)
            ? 'A criação de Encarregados está desligada para a organização deste evento. Ligue em Configurações → Funcionalidades.'
            : 'A criação de Encarregados não está liberada para a sua organização. Peça ao administrador para ativá-la.'}
        />
      ) : (
        <>
          <Aviso tom="marca" icone={<Eye className="w-4 h-4" />}>
            <strong>Encarregado</strong> é alguém da equipe que passa a poder <strong>consultar</strong> os setores
            escolhidos — só ver a equipe e a presença, sem nenhuma ação. É um cadastro só: a pessoa recebe
            <strong> uma mensagem</strong> e, dentro do acesso, escolhe qual setor quer olhar.
          </Aviso>
          <GerenciarEncarregados eventoId={painel.evento.id} eventoNome={painel.evento.nome} setores={painel.setores} encarregados={painel.encarregados} />
        </>
      )}
    </div>
  )
}
