'use server'
/**
 * Dados para o relatório pós-evento — a fonte que alimenta a planilha Excel.
 *
 * `'use server'`: cada função exportada vira um endpoint próprio (o mesmo
 * detalhe que causou o achado de segurança 01 da auditoria — ver histórico
 * do projeto). Por isso as três funções exportadas aqui SEMPRE começam
 * checando permissão via `exigirAcessoAoEvento`, nunca confiando em quem as
 * chamou pela tela.
 *
 * Fica separado de `lib/actions.ts` (que já passa de 3000 linhas) porque é um
 * bloco fechado com um único consumidor: a exportação. Roda no servidor
 * (`supabaseAdmin`), porque cruza `funcionarios` + `registros` + `perfis` de
 * um evento inteiro — não é dado que o browser deveria buscar direto.
 *
 * NADA aqui inventa informação. Cada campo vem de uma coluna real; quando o
 * dado não existe (justificativa vazia, supervisor não atribuído), o campo
 * fica vazio — nunca um valor calculado que pareça um registro.
 */
import { getPerfil, supabaseAdmin, meusSetores } from './supabase-server'
import { podeGerenciarEventos, ehMaster } from './permissions'

export type MomentoRelatorio = 'entrada' | 'meio' | 'fim'

/** Como esta batida específica foi feita — só o que dá pra provar com dado real. */
export type MetodoRegistro = 'QR Code' | 'Assistido' | 'Selfie' | 'Autoatendimento'

export type BatidaRelatorio = {
  horaISO: string
  metodo: MetodoRegistro
  justificativa: string | null
}

/** Uma linha da planilha: uma pessoa, num dia — com as três etapas daquele dia. */
export type LinhaRelatorio = {
  funcionarioId: string
  nome: string
  cpf: string
  cargo: string
  supervisorNome: string | null
  ativo: boolean
  /** `null` = a pessoa nunca registrou nada em nenhum dia (linha "não compareceu"). */
  dataRef: string | null
  entrada: BatidaRelatorio | null
  meio: BatidaRelatorio | null
  fim: BatidaRelatorio | null
}

export type SetorRelatorio = {
  id: string
  nome: string
  supervisorNome: string | null
  exigeMeio: boolean
  linhas: LinhaRelatorio[]
}

export type DadosRelatorioEvento = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string | null
  local: string | null
  dataInicioISO: string
  dataFimISO: string
  setores: SetorRelatorio[]
}

/**
 * Como esta batida foi feita, a partir das colunas reais de `registros`.
 *
 * A ordem importa: `registro_manual` é o sinal mais forte (marcado
 * explicitamente pela tela de registro assistido) e vence qualquer outro.
 * Sem ele, `criado_por_perfil_id` presente é o scanner de QR — só um
 * operador logado gera essa coluna. Sem nenhum dos dois, `foto_url` é a
 * selfie do meio. O que sobra é autoatendimento livre (entrada/saída pela
 * credencial ou pelo cartaz da portaria, sem foto e sem operador).
 */
function metodoDaBatida(r: {
  registro_manual: boolean | null
  criado_por_perfil_id: string | null
  foto_url: string | null
}): MetodoRegistro {
  if (r.registro_manual) return 'Assistido'
  if (r.criado_por_perfil_id) return 'QR Code'
  if (r.foto_url) return 'Selfie'
  return 'Autoatendimento'
}

/**
 * Monta as linhas de um setor: uma por (funcionário, dia com pelo menos uma
 * batida), mais uma linha "não compareceu" para quem não tem NENHUM registro
 * em nenhum dia.
 *
 * Multi-dia é o normal, não a exceção — um evento de dez dias de montagem
 * tem a mesma pessoa em dez linhas, cada uma com seu próprio entrada/meio/fim
 * (ver o pedido do Juan: "não sobrescrever registros de dias diferentes").
 */
function linhasDoSetor(
  funcionarios: { id: string; nome: string; cpf: string; cargo: string | null; ativo: boolean | null }[],
  registrosPorFuncionario: Map<string, RegistroBruto[]>,
  supervisorNome: string | null,
): LinhaRelatorio[] {
  const linhas: LinhaRelatorio[] = []

  for (const f of funcionarios) {
    const registros = registrosPorFuncionario.get(f.id) ?? []
    const base = {
      funcionarioId: f.id,
      nome: f.nome,
      cpf: f.cpf,
      cargo: f.cargo ?? '',
      supervisorNome,
      ativo: f.ativo !== false,
    }

    if (!registros.length) {
      linhas.push({ ...base, dataRef: null, entrada: null, meio: null, fim: null })
      continue
    }

    // Agrupa por dia — cada data_ref vira uma linha própria.
    const porDia = new Map<string, typeof registros>()
    for (const r of registros) {
      const dia = r.data_ref ?? '—'
      const grupo = porDia.get(dia) ?? []
      grupo.push(r)
      porDia.set(dia, grupo)
    }

    for (const [dia, doDia] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const acha = (tipo: MomentoRelatorio) => doDia.find(r => r.tipo === tipo)
      const paraBatida = (r: typeof doDia[number] | undefined): BatidaRelatorio | null =>
        r ? { horaISO: r.created_at, metodo: metodoDaBatida(r), justificativa: r.justificativa } : null

      linhas.push({
        ...base,
        dataRef: dia,
        entrada: paraBatida(acha('entrada')),
        meio: paraBatida(acha('meio')),
        fim: paraBatida(acha('fim')),
      })
    }
  }

  return linhas
}

/**
 * Confere se este perfil pode gerar relatório deste evento.
 *
 * Master: qualquer evento. Admin/gerente/cliente: só da própria organização.
 * Supervisor: só os setores dele mesmo (nunca o relatório completo do
 * evento) — a mesma régua de isolamento que o resto do sistema já aplica.
 */
type EventoParaRelatorio = {
  id: string
  nome: string
  local: string | null
  data_inicio: string
  data_fim: string
  organizacao_id: string | null
  organizacoes: { nome: string } | null
}

type AcessoRelatorio =
  | { erro: string }
  | { perfil: { role: string; organizacao_id: string | null }; evento: EventoParaRelatorio; setoresPermitidos: Set<string> | null }

async function exigirAcessoAoEvento(eventoId: string): Promise<AcessoRelatorio> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Não autenticado.' }

  const { data } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, local, data_inicio, data_fim, organizacao_id, organizacoes(nome)')
    .eq('id', eventoId)
    .single()
  if (!data) return { erro: 'Evento não encontrado.' }
  const evento = data as unknown as EventoParaRelatorio

  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    if (!meus.some(s => s.evento_id === eventoId)) return { erro: 'Sem permissão sobre este evento.' }
    return { perfil, evento, setoresPermitidos: new Set(meus.map(s => s.id)) }
  }

  if (!podeGerenciarEventos(perfil.role)) return { erro: 'Sem permissão para gerar relatórios.' }
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { erro: 'Sem permissão sobre este evento.' }
  }
  return { perfil, evento, setoresPermitidos: null }
}

/**
 * Carrega os dados de UM setor específico — usado tanto no "relatório do
 * setor" quanto, aba por aba, no "relatório completo do evento".
 */
type RegistroBruto = {
  funcionario_id: string
  tipo: string
  data_ref: string | null
  created_at: string
  registro_manual: boolean | null
  criado_por_perfil_id: string | null
  foto_url: string | null
  justificativa: string | null
}

async function carregarSetor(fornecedorId: string): Promise<SetorRelatorio | null> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores').select('id, nome, exige_meio').eq('id', fornecedorId).single()
  if (!fornecedor) return null

  const [{ data: funcionarios }, { data: supervisores }] = await Promise.all([
    supabaseAdmin.from('funcionarios')
      .select('id, nome, cpf, cargo, ativo').eq('fornecedor_id', fornecedorId).order('nome'),
    supabaseAdmin.from('perfis')
      .select('nome').eq('fornecedor_id', fornecedorId).eq('role', 'supervisor').limit(1),
  ])

  const supervisorNome = (supervisores?.[0]?.nome as string | undefined) ?? null
  const ids = (funcionarios ?? []).map(f => f.id)

  const { data: registros } = ids.length
    ? await supabaseAdmin.from('registros')
        .select('funcionario_id, tipo, data_ref, created_at, registro_manual, criado_por_perfil_id, foto_url, justificativa')
        .in('funcionario_id', ids)
    : { data: [] as RegistroBruto[] }

  const porFuncionario = new Map<string, RegistroBruto[]>()
  for (const r of (registros ?? []) as RegistroBruto[]) {
    const arr = porFuncionario.get(r.funcionario_id) ?? []
    arr.push(r)
    porFuncionario.set(r.funcionario_id, arr)
  }

  return {
    id: fornecedor.id,
    nome: fornecedor.nome,
    supervisorNome,
    exigeMeio: fornecedor.exige_meio === true,
    linhas: linhasDoSetor(funcionarios ?? [], porFuncionario, supervisorNome),
  }
}

/** Dados do relatório de UM setor — o "Relatório individual" (seção 2 do pedido). */
export async function obterDadosRelatorioSetor(
  eventoId: string, fornecedorId: string,
): Promise<{ dados: DadosRelatorioEvento } | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  if (acesso.setoresPermitidos && !acesso.setoresPermitidos.has(fornecedorId)) {
    return { erro: 'Sem permissão sobre este setor.' }
  }

  const setor = await carregarSetor(fornecedorId)
  if (!setor) return { erro: 'Setor não encontrado.' }
  // O setor precisa pertencer a ESTE evento — o id vem do cliente.
  const { data: confere } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).single()
  if (confere?.evento_id !== eventoId) return { erro: 'Este setor não pertence a este evento.' }

  return {
    dados: {
      eventoId,
      eventoNome: acesso.evento.nome,
      organizacaoNome: acesso.evento.organizacoes?.nome ?? null,
      local: acesso.evento.local,
      dataInicioISO: acesso.evento.data_inicio,
      dataFimISO: acesso.evento.data_fim,
      setores: [setor],
    },
  }
}

/**
 * Dados do relatório COMPLETO do evento — todos os setores, cada um vira uma
 * aba (seção 3/4 do pedido). Supervisor nunca chega aqui: `exigirAcessoAoEvento`
 * só libera `setoresPermitidos: null` para quem gerencia o evento inteiro.
 */
export async function obterDadosRelatorioEvento(
  eventoId: string,
): Promise<{ dados: DadosRelatorioEvento } | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  if (acesso.setoresPermitidos) return { erro: 'O relatório completo é só para quem gerencia o evento inteiro.' }

  const { data: fornecedores } = await supabaseAdmin
    .from('fornecedores').select('id').eq('evento_id', eventoId).order('created_at')
  const setores = (
    await Promise.all((fornecedores ?? []).map(f => carregarSetor(f.id)))
  ).filter((s): s is SetorRelatorio => s !== null)

  return {
    dados: {
      eventoId,
      eventoNome: acesso.evento.nome,
      organizacaoNome: acesso.evento.organizacoes?.nome ?? null,
      local: acesso.evento.local,
      dataInicioISO: acesso.evento.data_inicio,
      dataFimISO: acesso.evento.data_fim,
      setores,
    },
  }
}

/**
 * O resumo (contagens só) que alimenta a TELA de relatórios — não a
 * planilha. Existe pra tela mostrar "34 setores, 611 funcionários" sem
 * carregar o histórico de presença inteiro, que só a exportação precisa.
 */
export async function obterResumoParaTelaDeRelatorios(eventoId: string): Promise<{
  eventoNome: string
  dataInicioISO: string
  dataFimISO: string
  setores: { id: string; nome: string }[]
  totalFuncionarios: number
} | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }

  let query = supabaseAdmin.from('fornecedores').select('id, nome, funcionarios(count)').eq('evento_id', eventoId)
  if (acesso.setoresPermitidos) query = query.in('id', [...acesso.setoresPermitidos])
  const { data: fornecedores } = await query.order('nome')

  const setores = (fornecedores ?? []).map(f => ({ id: f.id as string, nome: f.nome as string }))
  const totalFuncionarios = (fornecedores ?? []).reduce((acc, f) => acc + (f.funcionarios?.[0]?.count ?? 0), 0)

  return {
    eventoNome: acesso.evento.nome,
    dataInicioISO: acesso.evento.data_inicio,
    dataFimISO: acesso.evento.data_fim,
    setores,
    totalFuncionarios,
  }
}
