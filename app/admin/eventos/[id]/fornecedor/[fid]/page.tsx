import { getPerfil, meusSetores, comArea, supabaseAdmin as supabase, buscarTudo } from '@/lib/supabase-server'
import { ampliacoesDoSetor } from '@/lib/pedidos-setor-consulta'
import { tutorialHabilitadoNoEvento } from '@/lib/internos-servidor'
import SolicitarMaisColaboradores from './SolicitarMaisColaboradores'
import { emLotes } from '@/lib/lotes'
import { veTodosEventos, ehMaster, podeExcluirDaEquipe, podeEscanear, podeGerenciarEventos, podeGerenciarUsuarios, podeCorrigirNomeECpf } from '@/lib/permissions'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, Users, AlertTriangle, Wallet, TrendingUp, ClipboardList, FileSpreadsheet } from 'lucide-react'
import FuncionarioTable, { type Presenca, type StatusEtapa } from './FuncionarioTable'
import StatCard from '@/components/StatCard'
import { Secao, PageHeader } from '@/components/ui/Superficie'
import AcoesDaEquipe from './AcoesDaEquipe'
import TrocarSetor from './TrocarSetor'
import ImportarFuncionarios from '../../ImportarFuncionarios'
import CpfsDuplicados, { acharDuplicados } from './CpfsDuplicados'
import AvaliarEquipe from './AvaliarEquipe'
import ExportarEquipe from '../../ExportarEquipe'
import { diaBRT, ehDiaPrincipal, janelaMeio, TETO_TURNO_H, type EventoJanelas } from '@/lib/janelas'
import { statusCredenciamentoValido } from '@/lib/credenciamento-constantes'
import { conferenciaAberta, CONFERENCIA_EQUIPE_ATIVA } from '@/lib/conferencia'
import AutoRefresh from './AutoRefresh'
import { ProgressoEtapas, COR_ETAPA } from '@/components/charts'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { avisosPendentesSupervisor } from '@/lib/avisos'
import AvisoExibicaoModal from '@/components/AvisoExibicaoModal'
import FornecedorModal from '../../FornecedorModal'

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

/**
 * Os supervisores DESTE setor que têm o crachá em OUTRO setor do evento — pedido do Juan, 09/10/2026: "o nome do
 * supervisor precisa aparecer na lista de todas as equipes que ele participa".
 *
 * O cadastro é um por CPF por evento, então quem supervisiona vários setores tem a ficha (QR, batidas, pagamento)
 * em UM só deles. Nos outros, ele entra na lista como linha de referência — nome, CPF, telefone e onde está o
 * crachá —, sem virar uma segunda ficha. Mesmo critério de "supervisor do setor" do card do evento
 * (`supervisor_setores`, com o setor ativo do perfil como rede de segurança).
 */
async function supervisoresComCrachaEmOutroSetor(fid: string, eventoId: string, cpfsDaEquipe: Set<string>) {
  type P = { id: string; nome: string; cpf: string | null; telefone: string | null }
  const pessoas = new Map<string, P>()
  const [vinculos, ativos] = await Promise.all([
    supabase.from('supervisor_setores').select('perfis(id, nome, cpf, telefone)').eq('fornecedor_id', fid)
      .then(r => r.data ?? [], () => []),
    supabase.from('perfis').select('id, nome, cpf, telefone').eq('role', 'supervisor').eq('fornecedor_id', fid)
      .then(r => r.data ?? [], () => []),
  ])
  for (const v of vinculos) {
    const p = (v as unknown as { perfis: P | null }).perfis
    if (p) pessoas.set(p.id, p)
  }
  for (const p of ativos as P[]) pessoas.set(p.id, p)

  const limpo = (c: string | null) => (c ?? '').replace(/\D/g, '')
  const deFora = [...pessoas.values()].filter(p => !cpfsDaEquipe.has(limpo(p.cpf)))
  if (!deFora.length) return []

  // Onde está o crachá de cada um neste evento (pode não ter nenhum).
  const cpfs = deFora.map(p => limpo(p.cpf)).filter(c => c.length === 11)
  /*
   * Com o subevento junto: o mesmo fornecedor costuma ter um setor por subevento, com o MESMO nome (a Lucy cobre
   * "GILMAR - SEGURANÇA" na Arquibancada e no Bloco) — sem ele, "crachá na equipe X" não diz qual. Tolerante:
   * sem a coluna de subevento, cai pra consulta só com o nome.
   */
  const buscar = (campos: string) => supabase.from('funcionarios').select(`cpf, fornecedor_id, fornecedores!inner(${campos})`)
    .in('cpf', cpfs).eq('fornecedores.evento_id', eventoId)
  let fichas: { cpf: string; fornecedor_id: string; fornecedores: unknown }[] = []
  if (cpfs.length) {
    const comArea = await buscar('nome, evento_id, subeventos(nome)')
    fichas = ((comArea.error ? (await buscar('nome, evento_id')).data : comArea.data) ?? []) as unknown as typeof fichas
  }
  const crachaPorCpf = new Map(fichas.map(f => {
    const setor = f.fornecedores as { nome: string; subeventos?: { nome?: string } | null }
    const area = setor.subeventos?.nome
    return [f.cpf, { id: f.fornecedor_id, nome: area ? `${setor.nome} (${area})` : setor.nome }]
  }))

  return deFora
    .map(p => ({
      perfilId: p.id, nome: p.nome, cpf: limpo(p.cpf), telefone: (p.telefone ?? '').replace(/\D/g, ''),
      setorDoCracha: crachaPorCpf.get(limpo(p.cpf)) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export default async function FornecedorPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params

  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  // Um instante só para o render inteiro: duas leituras de relógio na mesma
  // página podiam cair em dias diferentes na virada da meia-noite.
  const agoraDoRender = new Date()

  const [{ data: fornecedor }, { data: funcionarios }, { data: registros }, { data: evento }, { data: outrosSetores }] = await Promise.all([
    supabase.from('fornecedores').select('*, eventos(nome, organizacao_id, data_inicio)').eq('id', fid).single(),
    /*
     * PAGINADO (`buscarTudo`): o Supabase corta em 1000 linhas por resposta
     * sem avisar, e um setor grande do Vital passa disso — o resto da equipe
     * sumiria da tabela. `id` desempata nomes iguais pra as páginas não se
     * sobreporem. Tolerante como antes: falhou, vem vazio.
     */
    buscarTudo((de, ate) =>
      supabase.from('funcionarios').select('id, nome, cpf, telefone, empresa, cargo, qr_token, valor_receber, foto_perfil_path, chave_pix, pago, pago_em, ativo, status_credenciamento, motivo_negacao, descredenciado_em, created_at').eq('fornecedor_id', fid).order('nome').order('id').range(de, ate),
    ).then(data => ({ data }), () => ({ data: null })),
    /*
     * So HOJE e ONTEM.
     *
     * A tabela mostra o ciclo do dia. Trazer o evento inteiro faria, a partir
     * do dia 2, todo mundo aparecer verde por causa das batidas de ontem.
     * Ontem entra junto por causa do turno que vira a madrugada: quem entrou as
     * 22:00 continua no ciclo de ontem quando o supervisor abre a tela as 02:00.
     *
     * PAGINADO: dois dias de batidas de um setor grande (3 por pessoa por
     * dia) passam das 1000 linhas que o Supabase devolve por resposta. `id`
     * desempata a ordem. Tolerante como antes: falhou, vem vazio.
     */
    buscarTudo((de, ate) =>
      supabase
        .from('registros')
        .select('id, funcionario_id, tipo, created_at, data_ref, foto_url, latitude, longitude, endereco_aproximado, criado_por_perfil_id, registro_manual, justificativa, funcionarios!inner(fornecedor_id)')
        .eq('evento_id', id)
        .eq('funcionarios.fornecedor_id', fid)
        .in('data_ref', [diaBRT(agoraDoRender), diaBRT(new Date(agoraDoRender.getTime() - 24 * 60 * 60 * 1000))])
        .in('tipo', ['entrada', 'meio', 'fim'])
        .order('id')
        .range(de, ate),
    ).then(data => ({ data }), () => ({ data: null })),
    supabase
      .from('eventos')
      .select('data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim, metodo_identificacao')
      .eq('id', id)
      .single(),
    /*
     * Os OUTROS setores deste evento, só id e nome.
     *
     * Alimenta o "mover para outro setor" no modal do funcionário. Uma
     * consulta por carga da página, não por funcionário — a lista é a mesma
     * para todo mundo listado aqui.
     */
    supabase.from('fornecedores').select('id, nome, subeventos(nome)').eq('evento_id', id).neq('id', fid).order('nome'),
  ])

  if (!fornecedor) notFound()

  /*
   * Os setores deste perfil (vínculo de supervisor, não papel principal —
   * ver o comentário de `meusSetores`) e os dias do evento.
   */
  const [setoresDoSupervisor, { data: diasDoEvento }] = await Promise.all([
    meusSetores(perfil),
    supabase.from('jornada_dias').select('data, tipo')
      .eq('evento_id', id).eq('cancelado', false).order('data'),
  ])

  /*
   * Isolamento: quem tem vínculo de supervisor aqui só vê os PRÓPRIOS
   * setores — vale pro papel 'supervisor' E pra quem só GANHOU um vínculo
   * mantendo outro papel principal (achado ao vivo, 05/10/2026, caso da
   * Mara Lúcia: operadora de portão de uma organização, supervisora de um
   * fornecedor de OUTRA — o branch antigo, por papel, caía na checagem de
   * organização abaixo e dava 404 nela, mesmo com o vínculo legítimo).
   *
   * Era `perfil.fornecedor_id !== fid` — a coluna do setor ATIVO. Quem
   * supervisiona dois setores só conseguia abrir um deles; o outro dava 404,
   * mesmo estando legitimamente vinculado. Agora a régua é a lista inteira
   * (`meusSetores`), então ele navega entre os seus livremente.
   */
  const organizacaoDoEvento = (fornecedor.eventos as any)?.organizacao_id
  if (setoresDoSupervisor.some(s => s.id === fid)) {
    // Vínculo de supervisor neste setor — liberado, de qualquer organização.
  } else if (perfil.role === 'supervisor') {
    notFound()
  } else if (!veTodosEventos(perfil) && organizacaoDoEvento !== perfil.organizacao_id) {
    notFound()
  }

  const supervisoresDeFora = (await supervisoresComCrachaEmOutroSetor(
    fid, id, new Set((funcionarios ?? []).map(f => ((f.cpf as string | null) ?? '').replace(/\D/g, ''))),
  )).map(s => ({
    ...s,
    // O link pro setor do crachá só pra quem consegue abrir aquele setor (o supervisor, só os dele).
    linkDoCracha: s.setorDoCracha && (perfil.role !== 'supervisor' || setoresDoSupervisor.some(x => x.id === s.setorDoCracha!.id))
      ? `/admin/eventos/${id}/fornecedor/${s.setorDoCracha.id}`
      : null,
  }))

  // Para o "Editar setor" do cabeçalho: os subeventos do evento (vazio = sem seletor). Tolerante, como no evento.
  const subeventosDoEvento: { id: string; nome: string }[] = podeGerenciarEventos(perfil)
    ? await supabase.from('subeventos').select('id, nome').eq('evento_id', id).order('nome')
      .then(r => (r.data ?? []) as { id: string; nome: string }[], () => [])
    : []

  // Nomes dos supervisores que fizeram os registros de QR (entrada/saída)
  const perfilIds = [...new Set((registros ?? []).map(r => r.criado_por_perfil_id).filter((v): v is string => !!v))]
  const nomePorPerfil: Record<string, string> = {}
  if (perfilIds.length) {
    const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of perfis ?? []) nomePorPerfil[p.id] = p.nome
  }

  /*
   * Quem já tem rosto cadastrado NESTE evento — só pesquisa quando o evento
   * usa biometria (a maioria não usa, e a tabela nem entra na consulta à
   * toa). Pedido do Juan (29/09/2026): o supervisor precisa ver de relance
   * quem falta cadastrar, pra correr atrás da pessoa antes do dia do evento.
   */
  const usaBiometria = evento?.metodo_identificacao === 'biometria' || evento?.metodo_identificacao === 'biometria_qr'
  const comBiometria = new Set<string>()
  if (usaBiometria && funcionarios?.length) {
    /*
     * Em lotes de 200 ids e paginado: com a equipe inteira de um setor grande
     * no `.in`, a URL passa de ~16KB e a consulta falha (`data: null` — todo
     * mundo pareceria sem rosto cadastrado); e o resultado pode passar do
     * teto de 1000 linhas do Supabase. Tolerante como antes: um lote que
     * falha só deixa de marcar quem estava nele.
     */
    const lotes = await Promise.all(emLotes(funcionarios.map(f => f.id as string)).map(ids =>
      buscarTudo((de, ate) =>
        supabase
          .from('biometria_templates').select('funcionario_id').eq('evento_id', id).in('funcionario_id', ids)
          .order('id').range(de, ate),
      ).catch(() => [] as { funcionario_id: unknown }[]),
    ))
    for (const t of lotes.flat()) comBiometria.add(t.funcionario_id as string)
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

  /*
   * "Fora do local do evento" — SÓ para admin/master (pedido do Juan, 08/10/2026: a localização é conferência
   * interna; supervisor e colaborador não veem). Consulta à parte e tolerante: sem a migração
   * (upgrade-geolocalizacao-operador.sql), simplesmente não aparece.
   */
  const foraDoLocal = new Map<string, number | null>()
  if (ehMaster(perfil.role) || perfil.role === 'admin') {
    const ids = (registros ?? []).map(r => (r as { id?: string }).id).filter((v): v is string => !!v)
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('registros').select('id, fora_do_local, distancia_m').in('id', ids.slice(i, i + 200))
      if (error) break
      for (const r of data ?? []) if (r.fora_do_local === true) foraDoLocal.set(r.id as string, (r.distancia_m as number | null) ?? null)
    }
  }

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
      // undefined = não está fora (ou quem olha não pode ver); número/null = fora, a tantos metros.
      foraDoLocal: foraDoLocal.has((r as { id?: string }).id ?? '') ? { distanciaM: foraDoLocal.get((r as { id?: string }).id ?? '') ?? null } : undefined,
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
      // Quando esta pessoa entrou NESTE evento. "Desde quando está na base"
      // é outra data e mora na tela da pessoa (/admin/pessoas/[cpf]).
      cadastradoEm: f.created_at as string,
      ativo: f.ativo ?? true,
      statusCredenciamento: statusCredenciamentoValido(f.status_credenciamento as string),
      motivoNegacao: (f.motivo_negacao as string | null) ?? null,
      descredenciadoEm: (f.descredenciado_em as string | null) ?? null,
      fotoUrl: f.foto_perfil_path ? urlPorPath[f.foto_perfil_path] ?? null : null,
      temBiometria: comBiometria.has(f.id as string),
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


  /* Uma cor por cartão, fixa e diferente entre si: azul, laranja e roxo.
     O "A receber (equipe)" NÃO aparece pro supervisor — quanto a equipe dele
     recebe é dado da produção, não do supervisor (pedido do Juan). */
  const stats = [
    { label: 'Total', value: total, icon: Users, tom: 'info' as const },
    { label: 'Com pendências', value: comPendencia, icon: AlertTriangle, tom: 'aviso' as const },
    ...(perfil.role === 'supervisor' ? [] : [{
      label: 'A receber (equipe)',
      value: brl(totalReceber),
      icon: Wallet,
      small: true,
      tom: 'acento' as const,
    }]),
  ]

  /*
   * Aviso só interrompe quem É supervisor — admin/master navegando pra
   * gerenciar a equipe não são o público de "Supervisores", e "Todos"/
   * "Setores" também não fazem sentido interromper quem só está de
   * passagem administrando. Ver decisão em lib/avisos.ts.
   */
  const avisos = perfil.role === 'supervisor'
    ? await avisosPendentesSupervisor({ eventoId: id, perfilId: perfil.id, fornecedorId: fid, cpf: perfil.cpf ?? null })
    : []

  /*
   * Conferência de equipe (D-1). Aparece pro supervisor quando falta 1 dia
   * pro evento e ele ainda não confirmou este setor — banner forte, não
   * trava. Ver supabase/upgrade-conferencia-equipe.sql.
   */
  let conferenciaPendente = false
  // Desligada: a aprovação de credenciamento já é a conferência (lib/conferencia.ts).
  if (CONFERENCIA_EQUIPE_ATIVA && perfil.role === 'supervisor') {
    const dataInicio = (fornecedor.eventos as any)?.data_inicio as string | undefined
    if (dataInicio && conferenciaAberta(dataInicio)) {
      const { data: conf, error: erroConf } = await supabase
        .from('conferencias_equipe').select('status').eq('fornecedor_id', fid).maybeSingle()
      // Sem `error` = tabela existe. Sem linha ainda = precisa conferir.
      // Com `error` (migração pendente) fica false — não mostra banner falso.
      if (!erroConf) conferenciaPendente = conf?.status !== 'confirmada'
    }
  }

  // "Solicitar mais colaboradores" — só o supervisor DESTE setor pede (o admin muda o número direto no setor).
  const supervisorDesteSetor = perfil.role === 'supervisor' && setoresDoSupervisor.some(s => s.id === fid)
  const [pedidosDeMais, cadastradosNaEquipe] = supervisorDesteSetor
    ? await Promise.all([
        ampliacoesDoSetor(fid),
        // Mesma contagem do servidor: o crachá do próprio supervisor não conta como equipe.
        supabase.from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fid)
          .or('origem.is.null,origem.neq.supervisor').then(r => r.count ?? 0, () => 0),
      ])
    : [[], 0]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role) && (await tutorialHabilitadoNoEvento(id))}>
    {avisos.length > 0 && <AvisoExibicaoModal avisos={avisos} contexto="supervisor" eventoId={id} />}
    <div className="space-y-5">
      <AutoRefresh />

      {conferenciaPendente && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3.5">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <ClipboardList className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-brand-800 text-sm font-extrabold">Confira sua equipe para o evento</p>
              <p className="text-brand-700/80 text-xs mt-0.5">
                Falta 1 dia. Veja quem está vinculado a {fornecedor.nome}, tire quem não é da equipe e confirme.
              </p>
            </div>
          </div>
          <Link href={`/admin/conferencia/${fid}`} className="btn btn-primario btn-sm shrink-0">
            Conferir agora
          </Link>
        </div>
      )}
      <PageHeader
        titulo={fornecedor.nome}
        descricao={(fornecedor.eventos as any)?.nome}
        /*
         * Quem entrou aqui por um VÍNCULO de supervisor (papel 'supervisor'
         * OU outro papel que ganhou o vínculo, achado ao vivo, 05/10/2026,
         * caso da Mara Lúcia) nunca pode abrir `/admin/eventos/${id}` (é a
         * tela de quem administra o evento inteiro) — essa página manda de
         * volta pra cá na hora (`redirect` em app/admin/eventos/[id]/page.tsx),
         * ou pior, 404 pra quem nem é da organização do evento. Mandar o
         * "voltar" pra lá virava um beco sem saída: clicava e nada parecia
         * acontecer (ou dava 404), porque voltava direto pro mesmo lugar ou
         * pior. Pedido do Juan, 02/10/2026 ("toda tela precisa ter a
         * setinha de voltar FUNCIONANDO") — `/admin/meus-eventos` é o
         * destino que faz sentido pra quem entrou assim.
         */
        voltarPara={
          perfil.role === 'supervisor' || setoresDoSupervisor.some(s => s.id === fid)
            ? '/admin/meus-eventos'
            : `/admin/eventos/${id}`
        }
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
            {/* O mesmo lápis do card do setor na tela do evento (pedido do Juan, 09/10/2026) — só para quem
                `editarFornecedor` aceita (gestor de eventos da organização). */}
            {podeGerenciarEventos(perfil) && (
              <FornecedorModal
                mode="editar"
                comoBotao
                eventoId={id}
                fornecedorId={fid}
                nome={fornecedor.nome}
                valor_combinado={fornecedor.valor_combinado ?? null}
                quantidade_estimada={fornecedor.quantidade_estimada ?? null}
                exige_meio={fornecedor.exige_meio === true}
                entrada_qualquer_horario={fornecedor.entrada_qualquer_horario === true}
                subeventos={subeventosDoEvento}
                subevento_id={fornecedor.subevento_id ?? null}
              />
            )}
            {/* O supervisor não credencia: quem lê o QR é o posto de
                credenciamento. Mostrar o botão para ele levaria a uma tela que
                o expulsa — pior que não ter botão. */}
            {podeEscanear(perfil) && (
              <Link
                href={perfil?.role === 'operador_portao' ? `/scan?evento=${id}` : `/admin/scanner?evento=${id}`}
                data-tutorial="setor-scan"
                className="btn btn-primario"
              >
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
        <AcoesDaEquipe
          tokenFormulario={(fornecedor.token_formulario as string | null) ?? null}
          setorNome={fornecedor.nome as string}
        />
        <ImportarFuncionarios fornecedorId={fid} />
        {supervisorDesteSetor && (
          <SolicitarMaisColaboradores
            fornecedorId={fid}
            combinado={(fornecedor.quantidade_estimada as number | null) ?? null}
            cadastrados={cadastradosNaEquipe}
            pedidos={pedidosDeMais}
          />
        )}
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

      {/* Só aparece quando há CPF repetido — numa equipe limpa some inteiro. */}
      <CpfsDuplicados grupos={acharDuplicados(funcionariosEnriquecidos)} />

      {/* A avaliação por estrelas abre quando o evento termina (o master avalia a qualquer hora). */}
      {(ehMaster(perfil.role) || (() => {
        const fim = (evento?.data_fim ?? evento?.data_inicio) as string | null
        return !!fim && new Date(fim).getTime() < agoraDoRender.getTime()
      })()) && funcionariosEnriquecidos.length > 0 && (
        <AvaliarEquipe
          fornecedorId={fid}
          eventoId={id}
          equipe={funcionariosEnriquecidos.map(f => ({ id: f.id, nome: f.nome }))}
        />
      )}

      <div data-tutorial="setor-tabela">
        <FuncionarioTable
          funcionarios={funcionariosEnriquecidos}
          supervisoresDeFora={supervisoresDeFora}
          fornecedorId={fid}
          eventoId={id}
          eventoNome={(fornecedor.eventos as any)?.nome ?? ''}
          setorNome={fornecedor.nome}
          usaBiometria={usaBiometria}
          valorCombinado={fornecedor.valor_combinado ?? null}
          podeExcluir={podeExcluirDaEquipe(perfil)}
          /*
           * O cardápio de destino: admin/master vê todos os setores do evento;
           * o supervisor só os OUTROS setores DELE (ele só remaneja entre os
           * que cobre — o servidor recusa qualquer outro).
           */
          outrosSetores={
            perfil.role === 'supervisor'
              /*
               * Só os DESTE evento — `meusSetores` devolve o histórico
               * inteiro (todo evento em que ele já teve setor, pra "Meus
               * eventos" funcionar), mas oferecer aqui um setor de outro
               * evento ofereceria um destino que o servidor sempre vai
               * recusar (`moverFuncionarioDeSetor` já barra isso), e pior:
               * ia contra o isolamento entre eventos que a tela promete.
               */
              ? (await comArea(setoresDoSupervisor.filter(s => s.id !== fid && s.evento_id === id))).map(s => ({ id: s.id, nome: s.nome, area: s.area }))
              : (outrosSetores ?? []).map(s => ({ id: s.id as string, nome: s.nome as string, area: (s.subeventos as unknown as { nome?: string } | null)?.nome ?? null }))
          }
          /*
           * Admin/master move qualquer um. O supervisor também — mas só quando
           * cobre 2+ setores NESTE evento, e só entre os dele (mexe na PRÓPRIA
           * equipe dos dois lados, então não pega outro supervisor de
           * surpresa). O servidor (`moverFuncionarioDeSetor`) reforça isso e
           * exige motivo.
           */
          podeMoverDeSetor={
            podeGerenciarEventos(perfil) ||
            (perfil.role === 'supervisor' && setoresDoSupervisor.filter(s => s.evento_id === id).length >= 2)
          }
          /*
           * A mesma permissão que `criarSupervisor` já exige no servidor —
           * mostrar o botão para quem a action ia recusar de qualquer jeito é
           * pior do que não mostrar: a pessoa clica, preenche, e só descobre
           * que não podia depois de já ter tentado.
           */
          podeCriarSupervisor={podeGerenciarUsuarios(perfil)}
          podeEditarCpf={podeCorrigirNomeECpf(perfil)}
          /* Mesma régua de `lancarPontoManual` no servidor. */
          podeEditarPonto={podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte'}
          role={perfil.role}
        />
      </div>
    </div>
    </TutorialProvider>
  )
}
