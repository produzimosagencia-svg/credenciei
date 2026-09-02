import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster, podeExcluir, podeEscanear, podeGerenciarEventos, podeGerenciarUsuarios } from '@/lib/permissions'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, Users, AlertTriangle, Wallet, TrendingUp, ClipboardList, FileSpreadsheet } from 'lucide-react'
import FuncionarioTable, { type Presenca, type StatusEtapa } from './FuncionarioTable'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader } from '@/components/ui/Superficie'
import AcoesDaEquipe from './AcoesDaEquipe'
import TrocarSetor from './TrocarSetor'
import ImportarFuncionarios from '../../ImportarFuncionarios'
import ExportarEquipe from '../../ExportarEquipe'
import { diaBRT, ehDiaPrincipal, janelaMeio, TETO_TURNO_H, type EventoJanelas } from '@/lib/janelas'
import AutoRefresh from './AutoRefresh'
import { ProgressoEtapas, COR_ETAPA } from '@/components/charts'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'setor-equipe',
  versao: 1,
  passos: [
    { alvo: 'setor-stats', titulo: 'Situação da equipe', posicao: 'bottom',
      descricao: 'Veja de relance quantos estão presentes, quantos ainda não chegaram e quem está com alguma etapa pendente.' },
    { alvo: 'setor-tabela', titulo: 'Sua equipe', posicao: 'top',
      descricao: 'A lista completa com o status de cada etapa. Verde já registrou, amarelo está na hora e vermelho passou do horário esperado. Clique numa pessoa para ver os detalhes.' },
  ],
}

type MomentoTipo = 'entrada' | 'meio' | 'fim'

/**
 * Status de uma etapa, no dia que a pessoa esta cumprindo.
 *
 * `inicio`/`fim` sao os horarios daquela etapa PARA AQUELA PESSOA. Entrada e
 * saida costumam vir sem horario (sao livres fora do dia principal) e caem em
 * 'aberto'; o meio vem da entrada real dela + 4h.
 */
function statusEtapa(presenca: Presenca, inicio: string | null, fim: string | null): StatusEtapa {
  if (presenca) return 'feito'
  // Sem horario definido a etapa esta LIVRE, nao indefinida: e o caso mais
  // comum agora, e marcar como indefinida pintaria a equipe inteira de cinza.
  if (!inicio || !fim) return 'aberto'
  const agora = Date.now()
  if (agora < new Date(inicio).getTime()) return 'indefinido'
  if (agora > new Date(fim).getTime()) return 'fechado'
  return 'aberto'
}

export default async function FornecedorPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params

  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  // Um instante só para o render inteiro: duas leituras de relógio na mesma
  // página podiam cair em dias diferentes na virada da meia-noite.
  const agoraDoRender = new Date()

  const [{ data: fornecedor }, { data: funcionarios }, { data: registros }, { data: evento }, { data: outrosSetores }] = await Promise.all([
    supabase.from('fornecedores').select('*, eventos(nome, organizacao_id)').eq('id', fid).single(),
    supabase.from('funcionarios').select('id, nome, cpf, telefone, empresa, cargo, qr_token, valor_receber, foto_perfil_path, chave_pix, pago, pago_em, ativo').eq('fornecedor_id', fid).order('nome'),
    /*
     * So HOJE e ONTEM.
     *
     * A tabela mostra o ciclo do dia. Trazer o evento inteiro faria, a partir
     * do dia 2, todo mundo aparecer verde por causa das batidas de ontem.
     * Ontem entra junto por causa do turno que vira a madrugada: quem entrou as
     * 22:00 continua no ciclo de ontem quando o supervisor abre a tela as 02:00.
     */
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, data_ref, foto_url, latitude, longitude, endereco_aproximado, criado_por_perfil_id, registro_manual, justificativa, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', id)
      .eq('funcionarios.fornecedor_id', fid)
      .in('data_ref', [diaBRT(agoraDoRender), diaBRT(new Date(agoraDoRender.getTime() - 24 * 60 * 60 * 1000))])
      .in('tipo', ['entrada', 'meio', 'fim']),
    supabase
      .from('eventos')
      .select('data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
      .eq('id', id)
      .single(),
    /*
     * Os OUTROS setores deste evento, só id e nome.
     *
     * Alimenta o "mover para outro setor" no modal do funcionário. Uma
     * consulta por carga da página, não por funcionário — a lista é a mesma
     * para todo mundo listado aqui.
     */
    supabase.from('fornecedores').select('id, nome').eq('evento_id', id).neq('id', fid).order('nome'),
  ])

  if (!fornecedor) notFound()

  /*
   * Os setores deste supervisor e os dias do evento.
   *
   * `meusSetores` devolve vazio para quem não é supervisor — admin e master
   * navegam pelos setores pela tela do evento, e um seletor aqui seria um
   * segundo caminho para a mesma coisa.
   */
  const [setoresDoSupervisor, { data: diasDoEvento }] = await Promise.all([
    meusSetores(perfil),
    supabase.from('jornada_dias').select('data, tipo')
      .eq('evento_id', id).eq('cancelado', false).order('data'),
  ])

  /*
   * Isolamento: supervisor só vê os PRÓPRIOS setores.
   *
   * Era `perfil.fornecedor_id !== fid` — a coluna do setor ATIVO. Quem
   * supervisiona dois setores só conseguia abrir um deles; o outro dava 404,
   * mesmo estando legitimamente vinculado. Agora a régua é a lista inteira
   * (`meusSetores`), então ele navega entre os seus livremente.
   */
  const organizacaoDoEvento = (fornecedor.eventos as any)?.organizacao_id
  if (perfil.role === 'supervisor') {
    if (!setoresDoSupervisor.some(s => s.id === fid)) notFound()
  } else if (!veTodosEventos(perfil.role) && organizacaoDoEvento !== perfil.organizacao_id) {
    notFound()
  }

  // Nomes dos supervisores que fizeram os registros de QR (entrada/saída)
  const perfilIds = [...new Set((registros ?? []).map(r => r.criado_por_perfil_id).filter((v): v is string => !!v))]
  const nomePorPerfil: Record<string, string> = {}
  if (perfilIds.length) {
    const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of perfis ?? []) nomePorPerfil[p.id] = p.nome
  }

  // Assina as URLs das fotos em lote (bucket privado) — presença + avatares
  const fotosPresenca = (registros ?? []).map(r => r.foto_url).filter((p): p is string => !!p)
  const fotosAvatar = (funcionarios ?? []).map(f => f.foto_perfil_path).filter((p): p is string => !!p)
  const urlPorPath: Record<string, string> = {}
  const todosPaths = [...fotosPresenca, ...fotosAvatar]
  if (todosPaths.length) {
    const { data: signed } = await supabase.storage.from('presencas').createSignedUrls(todosPaths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl
  }

  /*
   * Qual dia cada pessoa esta cumprindo.
   *
   * Quase sempre e hoje. A excecao e quem entrou ontem a noite e ainda esta no
   * turno: para essa pessoa o ciclo aberto e o de ontem, e e ele que a tabela
   * precisa mostrar. Mesma regra do scanner (ver TETO_TURNO_H).
   */
  const agora = agoraDoRender.getTime()
  const hoje = diaBRT(agoraDoRender)
  const diaPorFunc = new Map<string, string>()
  for (const r of registros ?? []) {
    if (r.tipo !== 'entrada') continue
    if (agora - new Date(r.created_at).getTime() > TETO_TURNO_H * 60 * 60 * 1000) continue
    const dia = (r.data_ref as string | null) ?? diaBRT(r.created_at)
    const atual = diaPorFunc.get(r.funcionario_id)
    if (!atual || dia > atual) diaPorFunc.set(r.funcionario_id, dia)
  }
  const diaDe = (funcId: string) => diaPorFunc.get(funcId) ?? hoje

  // Mapa funcionario → { entrada, meio, fim }
  const presencaPorFunc: Record<string, Record<MomentoTipo, Presenca>> = {}
  for (const r of registros ?? []) {
    const tipo = r.tipo as MomentoTipo
    if (((r.data_ref as string | null) ?? hoje) !== diaDe(r.funcionario_id)) continue
    if (!presencaPorFunc[r.funcionario_id]) presencaPorFunc[r.funcionario_id] = { entrada: null, meio: null, fim: null }
    presencaPorFunc[r.funcionario_id][tipo] = {
      feitoEm: r.created_at,
      fotoUrl: r.foto_url ? urlPorPath[r.foto_url] ?? null : null,
      lat: r.latitude ?? null,
      lng: r.longitude ?? null,
      enderecoAproximado: r.endereco_aproximado ?? null,
      registradoPor: r.criado_por_perfil_id ? nomePorPerfil[r.criado_por_perfil_id] ?? null : null,
      assistido: r.registro_manual === true,
      justificativa: r.justificativa ?? null,
    }
  }

  const funcionariosEnriquecidos = (funcionarios ?? []).map(f => {
    const entrada = presencaPorFunc[f.id]?.entrada ?? null
    const meio = presencaPorFunc[f.id]?.meio ?? null
    const fim = presencaPorFunc[f.id]?.fim ?? null
    return {
      id: f.id,
      nome: f.nome,
      cpf: f.cpf,
      telefone: f.telefone,
      empresa: f.empresa ?? '',
      cargo: f.cargo ?? '',
      qr_token: f.qr_token,
      valorReceber: f.valor_receber ?? 0,
      chavePix: f.chave_pix ?? null,
      pago: f.pago ?? false,
      pagoEm: f.pago_em ?? null,
      ativo: f.ativo ?? true,
      fotoUrl: f.foto_perfil_path ? urlPorPath[f.foto_perfil_path] ?? null : null,
      entrada,
      meio,
      fim,
      // Entrada e saida so tem horario no dia principal; o meio vem da
      // entrada real desta pessoa + 4h. Ver lib/janelas.ts.
      ...(() => {
        const principal = evento ? ehDiaPrincipal(evento as EventoJanelas, diaDe(f.id)) : false
        const meioJanela = entrada ? janelaMeio(entrada.feitoEm) : null
        return {
          statusEntrada: statusEtapa(
            entrada,
            principal ? evento?.janela_entrada_inicio ?? null : null,
            principal ? evento?.janela_entrada_fim ?? null : null,
          ),
          statusMeio: statusEtapa(meio, meioJanela?.inicio ?? null, meioJanela?.fim ?? null),
          statusFim: statusEtapa(
            fim,
            principal ? evento?.janela_fim_inicio ?? null : null,
            principal ? evento?.janela_fim_fim ?? null : null,
          ),
        }
      })(),
    }
  })

  const total = funcionariosEnriquecidos.length
  const contar = (t: MomentoTipo) => funcionariosEnriquecidos.filter(f => f[t]).length
  const comPendencia = funcionariosEnriquecidos.filter(f => f.statusEntrada === 'fechado' || f.statusMeio === 'fechado' || f.statusFim === 'fechado').length
  const totalReceber = funcionariosEnriquecidos.reduce((acc, f) => acc + f.valorReceber, 0)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })


  /* Uma cor por cartão, fixa e diferente entre si: azul, laranja e roxo. */
  const stats = [
    { label: 'Total', value: total, icon: Users, tom: 'info' as const },
    { label: 'Com pendências', value: comPendencia, icon: AlertTriangle, tom: 'aviso' as const },
    {
      label: 'A receber (equipe)',
      value: brl(totalReceber),
      icon: Wallet,
      small: true,
      tom: 'acento' as const,
    },
  ]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        titulo={fornecedor.nome}
        descricao={(fornecedor.eventos as any)?.nome}
        voltarPara={`/admin/eventos/${id}`}
        /* Só o que se usa no dia do evento. Localizar funcionário, cadastro
           manual e cópia do link saíram daqui a pedido: cinco botões na mesma
           fileira quebravam a linha e escondiam o Escanear QR, que é a ação
           do momento. */
        acoes={
          <>
            <TutorialButton />
            {/* Quem ficou faltando em cada etapa. É a mesma lista que chega no
                WhatsApp do supervisor quando o horário passa — ter o atalho
                aqui evita ele ter que caçar a mensagem no meio da operação. */}
            <Link href={`/admin/eventos/${id}/presenca?ver=faltam`} className="btn btn-secundario">
              <ClipboardList className="w-3.5 h-3.5 shrink-0" /> Pendências
            </Link>
            {/* O supervisor não credencia: quem lê o QR é o posto de
                credenciamento. Mostrar o botão para ele levaria a uma tela que
                o expulsa — pior que não ter botão. */}
            {podeEscanear(perfil.role) && (
              <Link href={`/scan?evento=${id}`} data-tutorial="setor-scan" className="btn btn-primario">
                <ScanLine className="w-3.5 h-3.5 shrink-0" /> Escanear QR
              </Link>
            )}
          </>
        }
      />

      {/*
        * As ações da equipe — antes só existiam no cartão do setor, na tela do
        * evento, que o supervisor não enxerga. Ficam abaixo do cabeçalho e não
        * dentro dele porque são cinco: na mesma fileira do "Escanear QR" elas
        * quebrariam a linha e empurrariam a ação do momento para baixo.
        */}
      <div className="flex flex-wrap items-center gap-2">
        <TrocarSetor setores={setoresDoSupervisor} atualId={fid} />
        <AcoesDaEquipe tokenFormulario={(fornecedor.token_formulario as string | null) ?? null} />
        <ImportarFuncionarios fornecedorId={fid} />
        <ExportarEquipe fornecedorId={fid} eventoId={id} dias={diasDoEvento ?? []} />
        {/* Relatório pós-evento (planilha completa, com histórico e métodos
            de registro) — a página já filtra pra só este setor quando quem
            está olhando é supervisor. Ver lib/relatorios.ts. */}
        <Link href={`/admin/eventos/${id}/relatorios`} className="btn btn-secundario btn-sm">
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> Relatório
        </Link>
      </div>

      {/* Três colunas porque são três indicadores. Numa grade de quatro, a
          quarta coluna ficava vazia e sobrava um vão à direita do último
          cartão — parecia que faltava alguma coisa ali. */}
      <div data-tutorial="setor-stats" className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Progresso da equipe por etapa */}
      <Secao
        tom="sucesso"
        icone={<TrendingUp className="w-3.5 h-3.5" />}
        titulo="Progresso da equipe"
        descricao={`Quantos dos ${total} funcionários já registraram cada etapa`}
        corpoClassName="p-5"
      >
        <ProgressoEtapas
          itens={[
            { label: 'Entrada', valor: contar('entrada'), total, cor: COR_ETAPA.entrada },
            { label: 'Meio', valor: contar('meio'), total, cor: COR_ETAPA.meio },
            { label: 'Saída', valor: contar('fim'), total, cor: COR_ETAPA.fim },
          ]}
        />
      </Secao>

      <div data-tutorial="setor-tabela">
        <FuncionarioTable
          funcionarios={funcionariosEnriquecidos}
          fornecedorId={fid}
          eventoId={id}
          eventoNome={(fornecedor.eventos as any)?.nome ?? ''}
          setorNome={fornecedor.nome}
          valorCombinado={fornecedor.valor_combinado ?? null}
          podeExcluir={podeExcluir(perfil.role)}
          outrosSetores={outrosSetores ?? []}
          /*
           * Mover é decisão de quem enxerga o evento inteiro, não de um
           * supervisor — mover gente de setor mexe na equipe de OUTRO
           * supervisor sem ele estar envolvido na decisão.
           */
          podeMoverDeSetor={podeGerenciarEventos(perfil.role)}
          /*
           * A mesma permissão que `criarSupervisor` já exige no servidor —
           * mostrar o botão para quem a action ia recusar de qualquer jeito é
           * pior do que não mostrar: a pessoa clica, preenche, e só descobre
           * que não podia depois de já ter tentado.
           */
          podeCriarSupervisor={podeGerenciarUsuarios(perfil.role)}
        />
      </div>
    </div>
    </TutorialProvider>
  )
}
