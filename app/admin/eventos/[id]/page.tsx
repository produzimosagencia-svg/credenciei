import { notFound, redirect } from 'next/navigation'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarUsuarios, podeExcluir } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import Link from 'next/link'
import { Users, UserCheck, Clock, Pencil, MapPin, CalendarDays, ScanLine, TrendingUp, Activity, CalendarCheck, ClipboardList } from 'lucide-react'
import FornecedorModal from './FornecedorModal'
import FornecedorCard from './FornecedorCard'
import StatCard from '@/components/StatCard'
import { Secao, EmptyState, Badge, Aviso } from '@/components/ui/Superficie'
import { ProgressoEtapas, COR_ETAPA } from '@/components/charts'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { ehMaster } from '@/lib/permissions'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'evento-detalhe',
  versao: 1,
  passos: [
    { alvo: 'evt-editar', titulo: 'Configurar o evento', posicao: 'bottom',
      descricao: 'Aqui você ajusta datas, local e os horários do dia principal — o único dia em que entrada e saída ficam presas a um horário.' },
    { alvo: 'evt-scan', titulo: 'Escanear QR', posicao: 'bottom',
      descricao: 'Abre o leitor de QR Code. É por aqui que você (ou o supervisor) registra a entrada e a saída de cada pessoa no portão.' },
    { alvo: 'evt-stats', titulo: 'Números do evento', posicao: 'bottom',
      descricao: 'A situação agora: quantos setores e pessoas o evento tem, quantas estão presentes neste momento e quantas ainda não chegaram. O detalhe por etapa fica logo abaixo.' },
    { alvo: 'evt-progresso', titulo: 'Progresso por etapa', posicao: 'top',
      descricao: 'Mostra a porcentagem da equipe que já passou por cada etapa. Ideal para saber, durante o evento, quem ainda falta.' },
    { alvo: 'evt-setores', titulo: 'Fornecedores e setores', posicao: 'right',
      descricao: 'Cadastre aqui cada setor ou fornecedor do evento. Cada um gera um link próprio de cadastro para a equipe se inscrever sozinha.' },
    { alvo: 'evt-atividade', titulo: 'Atividade ao vivo', posicao: 'left',
      descricao: 'Cada leitura de QR ou check-in por foto aparece aqui na hora, com nome, setor e horário.' },
  ],
}

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Supervisor não gerencia o evento inteiro — só o próprio setor (via /scan → Minha equipe)
  const perfil = await getPerfil()
  // O supervisor não vê a tela do evento inteiro — ele cuida de um setor.
  // Ia para /scan, que agora o expulsa; o Painel já lista o setor dele.
  if (perfil?.role === 'supervisor') redirect('/admin')

  // Todas dependem apenas do id → uma única wave em paralelo
  const [{ data: evento }, { data: fornecedores }, { data: registros }, todosRegistros] = await Promise.all([
    supabase.from('eventos').select('*').eq('id', id).single(),
    supabase
      .from('fornecedores')
      .select('id, nome, token_formulario, quantidade_estimada, valor_combinado, cpfs_autorizados, funcionarios(count)')
      .eq('evento_id', id)
      .order('created_at'),
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, funcionarios(nome, empresa, fornecedor_id, fornecedores(nome))')
      .eq('evento_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('registros')
      .select('funcionario_id, tipo')
      .eq('evento_id', id),
  ])

  /*
   * Os dias de trabalho deste evento.
   *
   * Vem direto de `jornada_dias`, que é a fonte única — a tabela de regra
   * recorrente (`evento_jornadas`) saiu de cena junto com a tela que a
   * alimentava. Ter duas formas de dizer "quais dias este evento tem" fazia
   * uma apagar o que a outra gravava, sem avisar ninguém.
   */
  const { data: diasTrabalho } = await supabase
    .from('jornada_dias').select('data, tipo, cancelado')
    .eq('evento_id', id).eq('cancelado', false).order('data')
  const diasPreparacao = (diasTrabalho ?? []).filter(d => d.tipo !== 'principal')

  if (!evento) notFound()

  // Isolamento por organização: admin só acessa eventos da própria org
  if (!veTodosEventos(perfil?.role) && evento.organizacao_id !== perfil?.organizacao_id) notFound()

  // Supervisores vinculados a cada setor (fornecedor) deste evento
  const fornecedorIds = fornecedores?.map(f => f.id) ?? []
  const { data: supervisoresRows } = fornecedorIds.length
    ? await supabase.from('perfis').select('id, nome, email, cpf, telefone, ativo, fornecedor_id').in('fornecedor_id', fornecedorIds)
    : { data: [] as any[] }
  const supervisoresPorFornecedor: Record<string, { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }[]> = {}
  for (const s of supervisoresRows ?? []) {
    (supervisoresPorFornecedor[s.fornecedor_id] ??= []).push(s)
  }
  const podeGerenciarSupervisores = podeGerenciarUsuarios(perfil?.role)

  const totalFuncionarios = fornecedores?.reduce((acc, f) => acc + (f.funcionarios?.[0]?.count ?? 0), 0) ?? 0

  // Presença por foto: quantos funcionários já registraram cada etapa
  const regs = todosRegistros.data ?? []
  const quemFez = (t: string) => new Set(regs.filter(r => r.tipo === t).map(r => r.funcionario_id))
  const entraram = quemFez('entrada')
  const sairam = quemFez('fim')
  const totEntrada = entraram.size
  const totMeio = quemFez('meio').size
  const totFim = sairam.size

  // Os indicadores do topo respondem "como está agora"; o detalhe por etapa
  // fica no Progresso de presença, logo abaixo — repetir os dois seria dizer
  // a mesma coisa duas vezes na mesma tela.
  const presentesAgora = [...entraram].filter(fid => !sairam.has(fid)).length
  const naoChegaram = Math.max(0, totalFuncionarios - totEntrada)

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-5">
      {/* Cabeçalho da tela. Encerrar não está aqui: é ação de fim de ciclo,
          não de operação do dia, e continua no menu "..." da lista de eventos.
          No celular ela ficava lado a lado com Escanear QR, que é o que se usa
          o tempo todo. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="pagina-titulo truncate">{evento.nome}</h1>
            <Badge tom={evento.ativo ? 'positivo' : 'neutro'}>{evento.ativo ? 'Ativo' : 'Encerrado'}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-slate-500 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              {formatarBR(evento.data_inicio)} → {formatarBR(evento.data_fim)}
            </span>
            {evento.local && (
              <span className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{evento.local}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <TutorialButton />
          <Link href={`/admin/eventos/${id}/editar`} data-tutorial="evt-editar" className="btn btn-secundario">
            <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar evento
          </Link>
          {/* Mesma lista que o supervisor recebe no WhatsApp quando o horário
              de cada etapa passa — aqui dá pra abrir qualquer dia. */}
          <Link href={`/admin/eventos/${id}/pendencias`} className="btn btn-secundario">
            <ClipboardList className="w-3.5 h-3.5 shrink-0" /> Pendências
          </Link>
          {evento.spreadsheet_id && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${evento.spreadsheet_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secundario"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
              Planilha
            </a>
          )}
          <Link href={`/scan?evento=${id}`} data-tutorial="evt-scan" className="btn btn-primario">
            <ScanLine className="w-3.5 h-3.5 shrink-0" /> Escanear QR
          </Link>
        </div>
      </div>

      {/* Stats */}
      {/* Diz em uma linha as duas regras que convivem no evento, porque é a
          dúvida que mais aparece: por que fulano bateu ponto às 3 da manhã num
          dia e no outro não conseguiu às 10. */}
      {!!diasPreparacao.length && (
        <Aviso tom="marca" icone={<CalendarCheck className="w-3.5 h-3.5" />}>
          <strong>{diasPreparacao.length} dia(s) de preparação</strong> além do dia do evento.
          Neles a entrada e a saída são livres e o meio abre 4h depois da entrada de cada pessoa;
          no dia do evento valem os horários configurados.{' '}
          <Link href={`/admin/eventos/${id}/editar`} className="underline font-medium">Ver os dias</Link>
        </Aviso>
      )}

      <div data-tutorial="evt-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Setores" value={fornecedores?.length ?? 0} icon={Users} tom="acento" />
        <StatCard label="Funcionários" value={totalFuncionarios} icon={UserCheck} tom="info" />
        <StatCard label="Presentes agora" value={presentesAgora} icon={Clock} tom="sucesso" />
        <StatCard label="Ainda não chegaram" value={naoChegaram} icon={Clock} tom="aviso" />
      </div>

      {/* Progresso de presença por etapa */}
      <div data-tutorial="evt-progresso">
        <Secao
          tom="sucesso"
          icone={<TrendingUp className="w-3.5 h-3.5" />}
          titulo="Progresso de presença"
          descricao={`Quantos dos ${totalFuncionarios} funcionários já registraram cada etapa`}
          corpoClassName="p-5"
        >
          <ProgressoEtapas
            itens={[
              { label: 'Entrada', valor: totEntrada, total: totalFuncionarios, cor: COR_ETAPA.entrada },
              { label: 'Meio', valor: totMeio, total: totalFuncionarios, cor: COR_ETAPA.meio },
              { label: 'Saída', valor: totFim, total: totalFuncionarios, cor: COR_ETAPA.fim },
            ]}
          />
        </Secao>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        {/* Fornecedores */}
        <div data-tutorial="evt-setores" className="md:col-span-3">
          <Secao
            tom="acento"
            icone={<Users className="w-3.5 h-3.5" />}
            titulo="Fornecedores e setores"
            descricao="Cada setor gera um link próprio de cadastro para a equipe"
            acoes={<FornecedorModal eventoId={id} mode="criar" />}
            corpoClassName={fornecedores?.length ? 'p-3 space-y-3 overflow-y-auto max-h-[26rem]' : ''}
          >
            {!fornecedores?.length ? (
              <EmptyState icone={<Users className="w-7 h-7" />} titulo="Nenhum fornecedor ainda" />
            ) : (
              fornecedores.map((f) => (
                <FornecedorCard
                  key={f.id}
                  fornecedor={f}
                  eventoId={id}
                  supervisores={supervisoresPorFornecedor[f.id] ?? []}
                  podeGerenciarSupervisores={podeGerenciarSupervisores}
                  podeExcluir={podeExcluir(perfil?.role)}
                />
              ))
            )}
          </Secao>
        </div>

        {/* Feed de atividade */}
        <div data-tutorial="evt-atividade" className="md:col-span-2">
          <Secao
            tom="info"
            icone={<Activity className="w-3.5 h-3.5" />}
            titulo="Atividade do evento"
            descricao="Cada leitura de QR ou check-in por foto aparece aqui"
            corpoClassName={registros?.length ? 'p-4 overflow-y-auto max-h-[26rem]' : ''}
          >
            {!registros?.length ? (
              <EmptyState titulo="Nenhuma presença registrada" />
            ) : (
              <div className="space-y-3">
                {registros.map((r) => {
                  const func = r.funcionarios as any
                  const forn = func?.fornecedores as any
                  const etapa = r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Fim'
                  const cor = r.tipo === 'entrada' ? COR_ETAPA.entrada : r.tipo === 'meio' ? COR_ETAPA.meio : COR_ETAPA.fim
                  return (
                    <div key={r.created_at + r.funcionario_id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-slate-800 text-xs font-medium truncate">{func?.nome}</p>
                        <p className="text-slate-500 text-2xs truncate">{forn?.nome}{func?.empresa ? ` · ${func.empresa}` : ''}</p>
                        <p className="text-slate-400 text-2xs mt-0.5 tabular-nums">
                          {etapa} · {formatarBR(r.created_at, 'curto')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Secao>
        </div>
      </div>
    </div>
    </TutorialProvider>
  )
}
