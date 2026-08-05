import { notFound, redirect } from 'next/navigation'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarUsuarios } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import Link from 'next/link'
import { ArrowLeft, Users, UserCheck, Clock, Pencil, MapPin, CalendarDays, ScanLine } from 'lucide-react'
import FornecedorModal from './FornecedorModal'
import FornecedorCard from './FornecedorCard'
import StatCard from '@/components/StatCard'
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
      descricao: 'Aqui você ajusta datas, local e principalmente as janelas de horário — os períodos em que a equipe pode bater entrada, meio e saída.' },
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
  if (perfil?.role === 'supervisor') redirect('/scan')

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

  if (!evento) notFound()

  // Isolamento por organização: admin só acessa eventos da própria org
  if (!veTodosEventos(perfil?.role) && evento.organizacao_id !== perfil?.organizacao_id) notFound()

  // Supervisores vinculados a cada setor (fornecedor) deste evento
  const fornecedorIds = fornecedores?.map(f => f.id) ?? []
  const { data: supervisoresRows } = fornecedorIds.length
    ? await supabase.from('perfis').select('id, nome, email, telefone, ativo, fornecedor_id').in('fornecedor_id', fornecedorIds)
    : { data: [] as any[] }
  const supervisoresPorFornecedor: Record<string, { id: string; nome: string; email: string; telefone: string | null; ativo: boolean }[]> = {}
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
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/eventos" className="btn btn-secundario btn-icone shrink-0" aria-label="Voltar para a lista de eventos">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">{evento.nome}</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${evento.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                {evento.ativo ? 'Ativo' : 'Encerrado'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {formatarBR(evento.data_inicio)} → {formatarBR(evento.data_fim)}
              </span>
              {evento.local && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {evento.local}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Encerrar saiu daqui: é ação de fim de ciclo, não de operação do dia,
            e continua no menu "..." da lista de eventos. No celular ela ficava
            lado a lado com Escanear QR, que é o que se usa o tempo todo. */}
        <div className="flex items-center gap-2 flex-wrap">
          <TutorialButton />
          <Link
            href={`/admin/eventos/${id}/editar`}
            data-tutorial="evt-editar"
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl transition-all shadow-sm font-medium whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar evento
          </Link>
          {evento.spreadsheet_id && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${evento.spreadsheet_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm px-3 py-2 bg-white hover:bg-green-50 text-green-600 border border-green-200 rounded-xl transition-all shadow-sm font-medium"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
              Planilha
            </a>
          )}
        </div>
      </div>

      {/* Ação mais usada no dia do evento — grande de propósito, não mais
          um pill igual aos outros. Mesmo formato em toda tela que tem scan. */}
      <Link
        href={`/scan?evento=${id}`}
        data-tutorial="evt-scan"
        className="btn w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-base py-3.5 rounded-2xl shadow-lg shadow-green-500/25 gap-2.5"
      >
        <ScanLine className="w-5 h-5" /> Escanear QR Code
      </Link>

      {/* Stats */}
      <div data-tutorial="evt-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Setores" value={fornecedores?.length ?? 0} icon={Users} color="text-purple-600" bg="bg-purple-100" border="border-purple-200" />
        <StatCard label="Funcionários" value={totalFuncionarios} icon={UserCheck} color="text-blue-600" bg="bg-blue-100" border="border-blue-200" />
        <StatCard label="Presentes agora" value={presentesAgora} icon={Clock} color="text-green-600" bg="bg-green-100" border="border-green-200" />
        <StatCard label="Ainda não chegaram" value={naoChegaram} icon={Clock} color="text-amber-600" bg="bg-amber-100" border="border-amber-200" />
      </div>

      {/* Progresso de presença por etapa */}
      <div data-tutorial="evt-progresso" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-slate-800 font-bold text-base">Progresso de presença</h2>
          <p className="text-slate-400 text-xs mt-0.5">Quantos dos {totalFuncionarios} funcionários já registraram cada etapa</p>
        </div>
        <ProgressoEtapas
          itens={[
            { label: 'Entrada', valor: totEntrada, total: totalFuncionarios, cor: COR_ETAPA.entrada },
            { label: 'Meio', valor: totMeio, total: totalFuncionarios, cor: COR_ETAPA.meio },
            { label: 'Saída', valor: totFim, total: totalFuncionarios, cor: COR_ETAPA.fim },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
        {/* Fornecedores */}
        <div data-tutorial="evt-setores" className="md:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col" style={{ maxHeight: 520 }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
            <h2 className="text-slate-800 font-bold">Fornecedores/Setores</h2>
            <FornecedorModal eventoId={id} mode="criar" />
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {!fornecedores?.length ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Users className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-slate-400 text-sm font-medium">Nenhum fornecedor ainda</p>
              </div>
            ) : (
              fornecedores.map((f) => (
                <FornecedorCard
                  key={f.id}
                  fornecedor={f}
                  eventoId={id}
                  supervisores={supervisoresPorFornecedor[f.id] ?? []}
                  podeGerenciarSupervisores={podeGerenciarSupervisores}
                />
              ))
            )}
          </div>
        </div>

        {/* Feed de atividade */}
        <div data-tutorial="evt-atividade" className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col" style={{ maxHeight: 520 }}>
          <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
            <h2 className="text-slate-800 font-bold">Atividade do evento</h2>
          </div>
          <div className="overflow-y-auto flex-1 p-5">
            {!registros?.length ? (
              <p className="text-slate-400 text-sm text-center py-8">Nenhuma presença registrada</p>
            ) : (
              <div className="space-y-3">
                {registros.map((r) => {
                  const func = r.funcionarios as any
                  const forn = func?.fornecedores as any
                  const etapa = r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Fim'
                  return (
                    <div key={r.created_at + r.funcionario_id} className="flex items-start gap-2.5">
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${r.tipo === 'entrada' ? 'bg-green-500' : r.tipo === 'meio' ? 'bg-blue-500' : 'bg-brand-400'}`} />
                      <div className="min-w-0">
                        <p className="text-slate-700 text-xs font-semibold truncate">{func?.nome}</p>
                        <p className="text-slate-400 text-xs">{forn?.nome}{func?.empresa ? ` • ${func.empresa}` : ''}</p>
                        <p className="text-slate-300 text-xs">
                          {etapa} • {formatarBR(r.created_at, 'curto')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </TutorialProvider>
  )
}
