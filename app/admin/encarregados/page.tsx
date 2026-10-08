import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserPlus, Eye, CalendarDays } from 'lucide-react'
import { getPerfil, meusSetoresDoEventoAtual, meusSetores, supabaseAdmin } from '@/lib/supabase-server'
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

  // Os eventos em que o supervisor tem setor — o filtro "Em qual evento?" desta tela (pedido do Juan, 08/10/2026).
  let eventosDoSupervisor: { id: string; nome: string }[] = []

  if (ehSupervisor) {
    const meus = await meusSetores(perfil)
    const idsEventos = [...new Set(meus.map(s => s.evento_id))]
    if (idsEventos.length) {
      const { data } = await supabaseAdmin.from('eventos').select('id, nome, ativo, data_inicio').in('id', idsEventos)
      eventosDoSupervisor = (data ?? [])
        .sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false) || String(b.data_inicio ?? '').localeCompare(String(a.data_inicio ?? '')))
        .map(e => ({ id: e.id as string, nome: e.nome as string }))
    }
    // O escolhido na tela; senão o evento em que ele está agora; senão o primeiro.
    const atual = (await meusSetoresDoEventoAtual(perfil))[0]?.evento_id
    eventoId = [eventoParam, atual, eventosDoSupervisor[0]?.id].find(id => !!id && eventosDoSupervisor.some(e => e.id === id))
    // De volta ao painel do setor dele (o mesmo destino do resto das telas do supervisor).
    const setorDeVolta = meus.find(s => s.id === perfil.fornecedor_id && s.evento_id === eventoId) ?? meus.find(s => s.evento_id === eventoId)
    voltarPara = eventoId && setorDeVolta ? `/admin/eventos/${eventoId}/fornecedor/${setorDeVolta.id}` : '/admin/meus-eventos'
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

      {/* Supervisor com setor em mais de um evento: escolhe aqui em qual evento está criando o Encarregado. */}
      {ehSupervisor && eventosDoSupervisor.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3">
          <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold px-1 pb-2">Em qual evento?</p>
          <div className="flex flex-wrap gap-2">
            {eventosDoSupervisor.map(e => (
              <Link
                key={e.id}
                href={`/admin/encarregados?evento=${e.id}`}
                aria-current={e.id === eventoId ? 'true' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  e.id === eventoId ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5 shrink-0" /> {e.nome}
              </Link>
            ))}
          </div>
        </div>
      )}

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
