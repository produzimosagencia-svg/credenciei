import { notFound, redirect } from 'next/navigation'
import { getPerfil, meuSetor, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarUsuarios, podeGerenciarEventos, podeExcluir } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { diaBRT } from '@/lib/janelas'
import Link from 'next/link'
import { Users, UserCheck, Clock, MapPin, CalendarDays, TrendingUp, CalendarCheck } from 'lucide-react'
import FornecedorModal from './FornecedorModal'
import ListaDeSetores from './ListaDeSetores'
import PortariaCard from './PortariaCard'
import OperadorPortariaCard from './OperadorPortariaCard'
import SeletorDeDia from '@/components/SeletorDeDia'
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

export default async function EventoPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  /* `?dia=YYYY-MM-DD` — qual dia da operação os números abaixo descrevem. */
  searchParams: Promise<{ dia?: string }>
}) {
  const { id } = await params
  const { dia: diaParam } = await searchParams

  // Supervisor não gerencia o evento inteiro — só o próprio setor (via /scan → Minha equipe)
  const perfil = await getPerfil()
  // O supervisor não vê a tela do evento inteiro — ele cuida de um setor.
  // Ia para /scan, que agora o expulsa; o Painel já lista o setor dele.
  if (perfil?.role === 'supervisor') {
    // Direto para o setor dele. Mandar para /admin funcionaria (de lá ele é
    // reenviado), mas seria um salto a mais e um piscar de tela no meio.
    const setor = await meuSetor(perfil)
    redirect(setor ? `/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}` : '/admin')
  }

  /*
   * DUAS IDAS AO BANCO, NÃO SETE.
   *
   * Esta tela fazia sete consultas, seis delas em fila: cada uma só começava
   * quando a anterior voltava. Somadas, davam segundos de espera em cada
   * navegação — e o efeito colateral era pior que a lentidão em si. Depois de
   * criar ou excluir um supervisor, o `router.refresh()` dispara, mas a tela
   * só se redesenha quando essa fila inteira termina; nesse intervalo a lista
   * continua igual, e a conclusão natural é "não atualizou, vou recarregar".
   *
   * Só existem duas dependências reais: o resto precisa dos ids dos setores
   * (que vêm de `fornecedores`) e do dia escolhido (que vem de
   * `jornada_dias`). Então são duas ondas — e dentro de cada uma, tudo em
   * paralelo.
   *
   * `registros` passou a ser filtrado por dia no BANCO. Antes vinha o evento
   * inteiro para o servidor descartar quase tudo em memória; num evento de
   * onze dias isso cresce sem teto a cada dia que passa.
   */
  const [{ data: evento }, { data: fornecedores }, { data: diasTrabalho }, { count: viaPortaria }] =
    await Promise.all([
      supabase.from('eventos').select('*').eq('id', id).single(),
      supabase
        .from('fornecedores')
        .select('id, nome, token_formulario, quantidade_estimada, valor_combinado, cpfs_autorizados, funcionarios(count)')
        .eq('evento_id', id)
        .order('created_at'),
      // Fonte única dos dias de operação — a tabela de regra recorrente saiu
      // de cena junto com a tela que a alimentava.
      supabase.from('jornada_dias').select('data, tipo, cancelado')
        .eq('evento_id', id).eq('cancelado', false).order('data'),
      // Só o número: `head` evita trazer a equipe inteira para contar.
      supabase.from('funcionarios')
        .select('id, fornecedores!inner(evento_id)', { count: 'exact', head: true })
        .eq('origem', 'portaria').eq('fornecedores.evento_id', id),
    ])
  const diasPreparacao = (diasTrabalho ?? []).filter(d => d.tipo !== 'principal')

  if (!evento) notFound()

  // Isolamento por organização: admin só acessa eventos da própria org
  if (!veTodosEventos(perfil?.role) && evento.organizacao_id !== perfil?.organizacao_id) notFound()

  const fornecedorIds = fornecedores?.map(f => f.id) ?? []
  const vazio = { data: [] as never[] }

  /*
   * O DIA que os números descrevem — precisa vir antes da segunda onda,
   * porque é ele que filtra os registros no banco.
   *
   * Hoje quando hoje é dia de operação; senão o último que já passou (o mais
   * provável de se querer conferir) ou, antes de o evento começar, o primeiro.
   */
  const diasDaOperacao = (diasTrabalho ?? []).map(d => d.data as string)
  const hojeBRT = diaBRT()
  const diaEscolhido =
    (diaParam && diasDaOperacao.includes(diaParam) ? diaParam : null)
    ?? (diasDaOperacao.includes(hojeBRT) ? hojeBRT : null)
    ?? [...diasDaOperacao].reverse().find(d => d <= hojeBRT)
    ?? diasDaOperacao[0]
    ?? hojeBRT

  /*
   * SEGUNDA ONDA — tudo que dependia dos ids dos setores ou do dia, junto.
   *
   * Duas notas que valem a leitura:
   *
   * • `exige_meio` vem em consulta SEPARADA de propósito, nunca no select dos
   *   fornecedores. É coluna nova, e no Supabase pedir uma coluna que ainda
   *   não existe derruba a consulta INTEIRA. Foi exatamente isso que fez a
   *   tela mostrar "nenhum fornecedor ainda" em produção, com 33 setores e
   *   387 pessoas intactos no banco, só porque a migração não tinha rodado.
   *   Isolada, a falha custa o recurso novo — nunca a lista de setores.
   *
   * • Operadores de portão são da ORGANIZAÇÃO, não deste evento: ao contrário
   *   do supervisor (preso a um setor), o operador cobre o evento inteiro, e
   *   não há como prender um perfil a um evento sem prendê-lo a um setor.
   */
  const [
    { data: registrosDoDia },
    { data: operadoresRows },
    { data: setoresComMeioRows },
    { data: funcionariosDoEventoRows },
    { data: supervisoresRows },
  ] = await Promise.all([
    supabase.from('registros').select('funcionario_id, tipo')
      .eq('evento_id', id).eq('data_ref', diaEscolhido),
    evento.organizacao_id
      ? supabase.from('perfis').select('id, nome, email, cpf, telefone, ativo')
          .eq('role', 'operador_portao').eq('organizacao_id', evento.organizacao_id)
      : Promise.resolve(vazio),
    fornecedorIds.length
      ? supabase.from('fornecedores').select('id, exige_meio').in('id', fornecedorIds)
      : Promise.resolve(vazio),
    // Serve aos dois botões (Criar operador e Criar Supervisor): lista do
    // evento inteiro, porque setor recém-criado nasce vazio e a lista por
    // setor viria em branco justo quando mais se precisa dela.
    fornecedorIds.length
      ? supabase.from('funcionarios').select('id, nome, cpf, telefone, cargo, fornecedor_id').in('fornecedor_id', fornecedorIds).order('nome')
      : Promise.resolve(vazio),
    fornecedorIds.length
      ? supabase.from('perfis').select('id, nome, email, cpf, telefone, ativo, fornecedor_id').in('fornecedor_id', fornecedorIds)
      : Promise.resolve(vazio),
  ])

  const setoresComMeio = new Set(
    (setoresComMeioRows ?? []).filter(f => f.exige_meio === true).map(f => f.id as string)
  )

  const supervisoresPorFornecedor: Record<string, { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }[]> = {}
  for (const s of supervisoresRows ?? []) {
    (supervisoresPorFornecedor[s.fornecedor_id] ??= []).push(s)
  }
  const podeGerenciarSupervisores = podeGerenciarUsuarios(perfil?.role)


  const totalFuncionarios = fornecedores?.reduce((acc, f) => acc + (f.funcionarios?.[0]?.count ?? 0), 0) ?? 0

  /*
   * OS NÚMEROS SÃO DE UM DIA, não do evento inteiro.
   *
   * Antes somavam tudo: quem trabalhou três dias entrava uma vez (o Set
   * deduplica por pessoa), mas "Presentes agora" contava como presente quem
   * tinha entrada em QUALQUER dia sem saída em QUALQUER dia — ou seja, uma
   * entrada esquecida na montagem fazia a pessoa aparecer presente para
   * sempre. Numa operação de 11 dias, os quatro cartões viravam ruído.
   *
   * O dia escolhido (`diaEscolhido`) é calculado antes da segunda onda de
   * consultas, porque é ele que filtra os registros no banco.
   */
  // Quantos funcionários já registraram cada etapa NO DIA ESCOLHIDO.
  const quemFez = (t: string) =>
    new Set((registrosDoDia ?? []).filter(r => r.tipo === t).map(r => r.funcionario_id))
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
        {/*
          * Cabeçalho sem botões de ação, a pedido (02/09/2026).
          *
          * Editar evento, Pendências, Relatórios e Scanner viraram itens do
          * menu lateral, e cada um pergunta o evento quando precisa — um
          * caminho só por função, em vez de dois. Os cartões de indicador
          * logo abaixo continuam levando às listas de presença, que é como se
          * chega em "quem" a partir de "quantos".
          *
          * A planilha do Google fica: ela é deste evento e não tem equivalente
          * no menu — tirá-la daqui seria perder o acesso, não movê-lo.
          */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <TutorialButton />
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

      {/*
        * O DIA que os números abaixo descrevem.
        *
        * Fica acima dos cartões, não ao lado do título: ele governa tudo o
        * que vem depois, e um seletor no cabeçalho pareceria filtro da tela
        * inteira — incluindo a lista de setores, que não muda com o dia.
        */}
      {diasDaOperacao.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Dia</span>
          <SeletorDeDia dias={diasDaOperacao} diaEscolhido={diaEscolhido} hoje={hojeBRT} hrefBase={`/admin/eventos/${id}`} />
        </div>
      )}

      {/* Cada número tem uma lista por trás — ver /presenca. "Setores" e
          "Funcionários" não linkam: a lista deles já está logo abaixo. */}
      <div data-tutorial="evt-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Setores" value={fornecedores?.length ?? 0} icon={Users} tom="acento" />
        <StatCard label="Funcionários" value={totalFuncionarios} icon={UserCheck} tom="info" />
        <StatCard
          label="Presentes agora" value={presentesAgora} icon={Clock} tom="sucesso"
          href={`/admin/eventos/${id}/presenca?ver=presentes&dia=${diaEscolhido}`}
        />
        <StatCard
          label="Ainda não chegaram" value={naoChegaram} icon={Clock} tom="aviso"
          href={`/admin/eventos/${id}/presenca?ver=faltam&dia=${diaEscolhido}`}
        />
      </div>

      {/* Progresso de presença por etapa */}
      <div data-tutorial="evt-progresso">
        <Secao
          tom="sucesso"
          icone={<TrendingUp className="w-3.5 h-3.5" />}
          titulo="Progresso de presença"
          descricao={`Quantos dos ${totalFuncionarios} funcionários registraram cada etapa em ${diaEscolhido.split('-').reverse().slice(0, 2).join('/')}`}
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

      {/*
        * Os setores ocupam a largura inteira.
        *
        * Antes dividiam a tela com o feed de atividade, em três quintos — e
        * com sete setores isso virava uma coluna estreita de cartões
        * empilhados, cada um alto demais para o pouco que dizia. Com a largura
        * toda, eles cabem lado a lado.
        *
        * O feed foi para as PENDÊNCIAS, que é onde ele responde à pergunta
        * certa: quem abre esta tela está organizando o evento; quem abre as
        * pendências está acompanhando a operação acontecer.
        */}
      <div data-tutorial="evt-setores">
        <Secao
          tom="acento"
          icone={<Users className="w-3.5 h-3.5" />}
          titulo="Fornecedores e setores"
          descricao="Cada setor gera um link próprio de cadastro para a equipe"
          acoes={<FornecedorModal eventoId={id} mode="criar" />}
          corpoClassName={fornecedores?.length ? 'p-4' : ''}
        >
          {/*
            * O cartaz vive junto dos setores porque é deles que ele se
            * alimenta: a página pública lista os setores DESTE evento, e um
            * setor criado depois aparece lá sozinho. Numa tela separada, seria
            * fácil imprimir o cartaz antes de cadastrar os setores e não
            * entender por que a página abre vazia.
            */}
          {podeGerenciarEventos(perfil?.role) && (
            <div className="mb-4">
              <PortariaCard
                eventoId={id}
                ativa={evento.portaria_ativa === true}
                token={(evento.token_portaria as string | null) ?? null}
                cadastrados={viaPortaria ?? 0}
              />
            </div>
          )}

          {podeGerenciarUsuarios(perfil?.role) && (
            <div className="mb-4">
              <OperadorPortariaCard
                eventoId={id}
                operadores={operadoresRows ?? []}
                funcionariosDoEvento={funcionariosDoEventoRows ?? []}
                podeExcluir={podeExcluir(perfil?.role)}
              />
            </div>
          )}

          {!fornecedores?.length ? (
            <EmptyState icone={<Users className="w-7 h-7" />} titulo="Nenhum fornecedor ainda" />
          ) : (
            <ListaDeSetores
              fornecedores={fornecedores}
              eventoId={id}
              supervisoresPorFornecedor={supervisoresPorFornecedor}
              funcionariosDoEvento={funcionariosDoEventoRows ?? []}
              diasDoEvento={diasTrabalho ?? []}
              setoresComMeio={setoresComMeio}
              podeGerenciarSupervisores={podeGerenciarSupervisores}
              podeExcluir={podeExcluir(perfil?.role)}
            />
          )}
        </Secao>
      </div>
    </div>
    </TutorialProvider>
  )
}
