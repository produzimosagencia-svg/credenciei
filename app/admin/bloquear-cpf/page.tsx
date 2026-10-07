import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldBan, CalendarDays, Info } from 'lucide-react'
import { getPerfil, meusSetores, supabaseAdmin as supabase, buscarTudo } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { Secao, PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir, eventosDosMeusSetores } from '../EscolherEvento'
import PainelBloqueio from './PainelBloqueio'
import type { CpfBloqueado } from '@/lib/actions'

export const revalidate = 0

/**
 * Bloquear CPF — a lista de quem não pode se cadastrar NESTE evento.
 *
 * O caso real (Juan, 04/09/2026): aparece alguém tentando entrar no evento
 * sem trabalhar. Tirar da equipe resolve o vínculo de hoje, mas a pessoa se
 * cadastra de novo pelo mesmo link cinco minutos depois. O bloqueio é o que
 * fecha essa porta — e some assim que alguém clica em "Liberar".
 *
 * ─── O ESCOPO É O EVENTO, E SÓ ELE ──────────────────────────────────────────
 *
 * Bloqueio DO EVENTO, não do setor: barrar só num setor deixaria a pessoa se
 * cadastrar no setor ao lado, e o furo continuaria aberto.
 *
 * E é só DESTE evento — `evento_id` faz parte da chave, então a pessoa segue
 * livre pra trabalhar em qualquer outro evento da plataforma. Isto aqui é uma
 * decisão operacional de um evento, tomada com pressa no meio da correria;
 * transformá-la em veto permanente ao trabalho de alguém seria outra coisa,
 * de outro peso, e não é esta tela que a toma.
 *
 * Por isso é uma tela de menu, e não um botão dentro do setor: o que ela faz
 * vale pro evento inteiro, e precisa de espaço pra explicar o que é antes de
 * alguém usar.
 */
export default async function BloquearCpfPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  /*
   * Supervisor entra: é ele quem vê a pessoa no portão. Vale também pra
   * quem tem outro papel principal mas GANHOU um vínculo de supervisor
   * (achado ao vivo, 05/10/2026, caso da Mara Lúcia). Quem barra de
   * verdade é `exigirAcessoABloqueio` na action — aqui só evita abrir a tela.
   */
  const meusVinculos = await meusSetores(perfil)
  if (!podeGerenciarEventos(perfil) && perfil.role !== 'supervisor' && perfil.role !== 'suporte' && !meusVinculos.length) {
    redirect('/admin')
  }

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    const eventos = (podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte')
      ? await eventosQuePossoAbrir()
      : await eventosDosMeusSetores(meusVinculos)
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Bloquear CPF"
          descricao="Escolha o evento — o bloqueio vale só dentro dele"
        />
        <Explicacao />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/bloquear-cpf?evento=${id}`}
          icone={<ShieldBan className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Cada evento tem a sua própria lista de bloqueios"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Você precisa de um evento para bloquear alguém nele.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()

  // A mesma régua da action, repetida aqui porque a URL é digitável.
  if (meusVinculos.some(s => s.evento_id === evento.id)) {
    // Vínculo de supervisor neste evento — liberado.
  } else if (perfil.role === 'supervisor') {
    notFound()
  } else if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) {
      notFound()
    }
  } else if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) {
    notFound()
  }

  /*
   * Tolerante à migração pendente: sem a tabela, a lista vem vazia e a tela
   * abre. O erro real aparece ao tentar bloquear, com a mensagem certa.
   */
  let linhas: { id: unknown; cpf: unknown; motivo: unknown; created_at: unknown; perfis: unknown }[] = []
  try {
    // Paginado: a lista é tratada como COMPLETA (é o que o supervisor vê como "quem está bloqueado").
    linhas = await buscarTudo((de, ate) =>
      supabase
        .from('cpfs_bloqueados')
        .select('id, cpf, motivo, created_at, perfis(nome)')
        .eq('evento_id', eventoParam)
        .order('created_at', { ascending: false }).order('id').range(de, ate))
  } catch (e) {
    console.error('[bloquear-cpf] lista falhou (migração pendente?):', (e as Error).message)
  }

  const bloqueados: CpfBloqueado[] = (linhas ?? []).map(b => ({
    id: b.id as string,
    cpf: b.cpf as string,
    motivo: (b.motivo as string | null) ?? null,
    criadoEm: b.created_at as string,
    bloqueadoPor: (b.perfis as unknown as { nome: string } | null)?.nome ?? null,
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Bloquear CPF"
        descricao={`${evento.nome} — quem não pode se cadastrar neste evento`}
        acoes={
          <Link href="/admin/bloquear-cpf" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />
      <Explicacao />
      <PainelBloqueio eventoId={eventoParam} bloqueados={bloqueados} />
    </div>
  )
}

/** O que a tela faz — antes de alguém usá-la, não depois. */
function Explicacao() {
  return (
    <Secao
      tom="info"
      icone={<Info className="w-3.5 h-3.5" />}
      titulo="Para que serve"
      descricao="Leia antes de bloquear alguém"
      corpoClassName="p-5 space-y-3 text-sm text-slate-600 leading-relaxed"
    >
      <p>
        Use quando você identificar alguém tentando entrar no evento{' '}
        <strong className="text-slate-800">sem estar escalado para trabalhar</strong>. Ao
        bloquear o CPF, essa pessoa não consegue mais se cadastrar por nenhum link deste
        evento, nem em outro fornecedor — e a leitura do QR Code dela é recusada no portão.
      </p>
      <p>
        <strong className="text-slate-800">Vale só para este evento.</strong> O bloqueio
        não impede a pessoa de se cadastrar em outro evento da plataforma, hoje ou no
        futuro. Cada evento tem a sua própria lista.
      </p>
      <p>
        <strong className="text-slate-800">Dá para desfazer a qualquer momento</strong> —
        é só clicar em &ldquo;Liberar&rdquo; na lista abaixo, e ela volta a poder se
        cadastrar na hora. Quem bloqueou, quando e por quê fica registrado na Auditoria.
      </p>
      <p className="text-slate-500">
        Bloquear não apaga quem já está cadastrado. Se a pessoa já está na equipe, tire
        ela do fornecedor primeiro — os pontos que ela bateu continuam no histórico.
      </p>
    </Secao>
  )
}
