import { redirect } from 'next/navigation'
import Link from 'next/link'
import { DoorClosed, LogOut, CameraOff } from 'lucide-react'
import { getPerfil, diaDoTurno, meusSetores, eventosAindaVigentes, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import SeletorDeDia from '@/components/SeletorDeDia'
import EscolherEvento, { eventosQuePossoAbrir, eventosDosMeusSetores } from '../EscolherEvento'
import FecharDiaBotao from '@/components/FecharDiaBotao'
import { listarSemSaida } from '@/lib/actions-fechar-dia'
import { pendenciasDoDia } from '@/lib/pendencias'

export const revalidate = 0

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/**
 * PENDÊNCIAS DO TURNO (Juan, 14/10/2026: "acho válido ter um campo chamado pendências do turno dentro do perfil do
 * supervisor"). Do turno de agora (`diaDoTurno` — de madrugada ainda é a noite de ontem): quem da equipe está SEM
 * SAÍDA e SEM MEIO, com o "Fechar o dia" ali mesmo. O supervisor vê só os setores dele; quem gerencia o evento vê
 * todos (o "sem meio" fica na tela de Presença, que já faz essa conta para o evento inteiro).
 */
export default async function PendenciasDoTurnoPage({ searchParams }: { searchParams: Promise<{ evento?: string; dia?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  const gestor = podeGerenciarEventos(perfil) || perfil.role === 'suporte'
  const meus = await meusSetores(perfil)
  if (!gestor && !meus.length) redirect('/admin')

  const candidatos = gestor ? await eventosQuePossoAbrir() : await eventosDosMeusSetores(meus)
  const vigentes = await eventosAindaVigentes(candidatos.map(e => e.id))
  const eventos = candidatos.filter(e => vigentes.has(e.id))
  const { evento: eventoParam, dia: diaParam } = await searchParams
  const eventoId = eventoParam && eventos.some(e => e.id === eventoParam) ? eventoParam : eventos.length === 1 ? eventos[0].id : null

  if (!eventoId) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Pendências do turno" descricao="Quem está sem saída e sem meio no turno de agora — e o botão para fechar o dia." />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/pendencias-turno?evento=${id}`}
          titulo="Qual evento?"
          descricao="Só aparecem os eventos que ainda estão acontecendo."
          icone={<DoorClosed className="w-3.5 h-3.5" />}
          vazio={{ titulo: 'Nenhum evento acontecendo', descricao: 'Quando um evento seu estiver na operação, as pendências do turno aparecem aqui.' }}
          mostrarOrganizacao={false}
        />
      </div>
    )
  }

  const evento = eventos.find(e => e.id === eventoId)!
  const { data: dias } = await supabaseAdmin.from('jornada_dias').select('data').eq('evento_id', eventoId).eq('cancelado', false).order('data')
  const diasDaOperacao = (dias ?? []).map(d => d.data as string)
  const hoje = await diaDoTurno(eventoId)
  const dia = diaParam && diasDaOperacao.includes(diaParam) ? diaParam : hoje

  const semSaida = await listarSemSaida(eventoId, dia)
  const setoresDoSupervisor = gestor ? null : meus.filter(s => s.evento_id === eventoId).map(s => s.id as string)
  const semMeio = setoresDoSupervisor
    ? (await Promise.all(setoresDoSupervisor.map(fornecedorId => pendenciasDoDia({ eventoId, data: dia, fornecedorId, etapas: ['meio'], meioJaAberto: true })))).flat()
        .sort((a, b) => a.setorNome.localeCompare(b.setorNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
    : null
  const pessoas = 'erro' in semSaida ? [] : semSaida.pessoas

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Pendências do turno"
        descricao={`${evento.nome} · ${ddmm(dia)}${dia === hoje ? ' (turno de agora)' : ''}`}
        acoes={eventos.length > 1 ? <Link href="/admin/pendencias-turno" className="btn btn-secundario btn-sm">Trocar de evento</Link> : undefined}
      />
      {diasDaOperacao.length > 1 && (
        <SeletorDeDia dias={diasDaOperacao.filter(d => d <= hoje)} diaEscolhido={dia} hoje={hoje} hrefBase={`/admin/pendencias-turno?evento=${eventoId}`} />
      )}

      <Secao
        icone={<LogOut className="w-3.5 h-3.5" />}
        titulo={`Sem saída · ${pessoas.length}`}
        descricao="Entraram neste dia e ainda não têm saída."
        acoes={pessoas.length ? <FecharDiaBotao eventoId={eventoId} dataRef={dia} rotuloDia={ddmm(dia)} compacto /> : undefined}
        corpoClassName={pessoas.length ? '' : 'p-4'}
      >
        {'erro' in semSaida ? (
          <p className="text-red-600 text-sm">{semSaida.erro}</p>
        ) : !pessoas.length ? (
          <EmptyState icone={<LogOut className="w-8 h-8" />} titulo="Todo mundo com saída" descricao="Ninguém que entrou neste dia está sem saída." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pessoas.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 truncate">{p.nome}</span>
                  <span className="block text-xs text-slate-400 truncate">{p.setor}</span>
                </span>
                <span className="text-xs text-slate-500 shrink-0">entrou {hora(p.entradaISO)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        icone={<CameraOff className="w-3.5 h-3.5" />}
        titulo={semMeio ? `Sem meio · ${semMeio.length}` : 'Sem meio'}
        descricao="A janela do meio já abriu e a pessoa ainda não bateu."
        corpoClassName={semMeio?.length ? '' : 'p-4'}
      >
        {!semMeio ? (
          <Link href={`/admin/eventos/${eventoId}/presenca?ver=sem_meio&dia=${dia}&abertos=1`} className="btn btn-secundario btn-sm">Ver quem está sem meio no evento</Link>
        ) : !semMeio.length ? (
          <EmptyState icone={<CameraOff className="w-8 h-8" />} titulo="Nenhum meio pendente" descricao="Quem já devia ter batido o meio, bateu." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {semMeio.map(p => (
              <li key={`${p.funcionarioId}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 truncate">{p.nome}</span>
                  <span className="block text-xs text-slate-400 truncate">{p.setorNome}</span>
                </span>
                {p.esperadoEm && <span className="text-xs text-slate-500 shrink-0">esperado {hora(p.esperadoEm)}</span>}
              </li>
            ))}
          </ul>
        )}
        {semMeio && !!semMeio.length && (
          <p className="text-slate-400 text-xs px-4 py-3 border-t border-slate-100">O meio se lança em Lançamento manual (o supervisor pode).</p>
        )}
      </Secao>
    </div>
  )
}
