'use server'
/**
 * Os relatórios da central de Relatórios além do de entrada/saída (pedido do Juan, 09/10/2026: "tudo que tenha de
 * relatório no sistema esteja dentro desse campo"). Cada tipo devolve as abas prontas (cabeçalho + linhas de texto);
 * quem monta e baixa o .xlsx é o navegador (lib/planilha-padrao.ts), mesmo padrão dos outros relatórios.
 *
 * Datas saem JÁ em texto no horário de Brasília (`formatarBR`): uma data crua no Excel aparece no fuso de quem abre,
 * e o servidor é UTC.
 *
 * Permissão: a mesma régua dos relatórios de entrada/saída (`exigirAcessoAoEvento`). O supervisor só recebe os
 * tipos que têm setor, e só com as linhas dos setores dele; os que valem para o evento inteiro são só de quem
 * gerencia o evento.
 */
import { supabaseAdmin, buscarTudo, diaDoTurno } from './supabase-server'
import { exigirAcessoAoEvento } from './relatorios-acesso'
import { emLotes } from './lotes'
import { formatarBR } from './tz'
import { formatCpf } from './format'
import { ACAO_LABELS } from './auditoria-rotulos'

export type TipoRelatorioExtra =
  | 'aguardando' | 'cadastros' | 'hoje' | 'pedidos_setor' | 'veiculos' | 'subeventos' | 'bloqueios' | 'auditoria'

export type AbaRelatorio = {
  nome: string
  colunas: { titulo: string; largura: number }[]
  linhas: (string | number | null)[][]
}

export type RelatorioExtra = { titulo: string; arquivo: string; abas: AbaRelatorio[] }

/** Tipos que só quem gerencia o evento inteiro puxa (não têm recorte por setor). */
const SO_GESTOR: TipoRelatorioExtra[] = ['pedidos_setor', 'veiculos', 'subeventos', 'bloqueios', 'auditoria']

const ORIGEM: Record<string, string> = {
  formulario: 'Link do fornecedor', portaria: 'QR da portaria', supervisor: 'Cadastrado pelo supervisor',
}
const SITUACAO: Record<string, string> = { pendente: 'Aguardando aprovação', aprovado: 'Aprovado', negado: 'Negado' }
const SITUACAO_PEDIDO: Record<string, string> = { pendente: 'Aguardando decisão', aprovado: 'Aprovado', negado: 'Negado' }
const dataHora = (iso: unknown) => (typeof iso === 'string' && iso ? formatarBR(iso, 'completo') : '')
const cpf = (v: unknown) => (typeof v === 'string' && v ? formatCpf(v) : '')
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

type Setor = { id: string; nome: string; subevento_id: string | null; quantidade_estimada: number | null }

async function setoresDoEvento(eventoId: string, permitidos: Set<string> | null): Promise<Setor[]> {
  const { data } = await supabaseAdmin
    .from('fornecedores').select('id, nome, subevento_id, quantidade_estimada').eq('evento_id', eventoId).order('nome')
  const todos = (data ?? []) as Setor[]
  return permitidos ? todos.filter(s => permitidos.has(s.id)) : todos
}

type Func = {
  id: string; nome: string; cpf: string | null; telefone: string | null; cargo: string | null; cidade: string | null
  origem: string | null; status_credenciamento: string | null; created_at: string; decidido_em: string | null
  decidido_por: string | null; motivo_negacao: string | null; descredenciado_em: string | null; ativo: boolean | null
  fornecedor_id: string
}

async function funcionariosDosSetores(setorIds: string[]): Promise<Func[]> {
  const todos: Func[] = []
  for (const lote of emLotes(setorIds, 150)) {
    const linhas = await buscarTudo<Func>((de, ate) => supabaseAdmin
      .from('funcionarios')
      .select('id, nome, cpf, telefone, cargo, cidade, origem, status_credenciamento, created_at, decidido_em, decidido_por, motivo_negacao, descredenciado_em, ativo, fornecedor_id')
      .in('fornecedor_id', lote).order('nome').range(de, ate))
    todos.push(...linhas)
  }
  return todos
}

async function nomesDePerfis(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((v): v is string => !!v))]
  const mapa = new Map<string, string>()
  for (const lote of emLotes(unicos, 150)) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', lote)
    for (const p of data ?? []) mapa.set(p.id as string, p.nome as string)
  }
  return mapa
}

async function diasPedidosPorFuncionario(ids: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  for (const lote of emLotes(ids, 150)) {
    const { data } = await supabaseAdmin.from('funcionario_dias').select('funcionario_id, data, selecionado').in('funcionario_id', lote)
    for (const d of data ?? []) {
      if (!d.selecionado) continue
      const lista = mapa.get(d.funcionario_id as string) ?? []
      lista.push(d.data as string)
      mapa.set(d.funcionario_id as string, lista)
    }
  }
  return mapa
}

export async function obterRelatorioExtra(
  eventoId: string, tipo: TipoRelatorioExtra,
): Promise<{ relatorio: RelatorioExtra } | { erro: string }> {
  try {
    const acesso = await exigirAcessoAoEvento(eventoId)
    if ('erro' in acesso) return { erro: acesso.erro }
    const permitidos = acesso.setoresPermitidos
    if (permitidos && SO_GESTOR.includes(tipo)) return { erro: 'Este relatório é só para quem gerencia o evento inteiro.' }
    const ev = acesso.evento.nome

    const setores = await setoresDoEvento(eventoId, permitidos)
    const nomeSetor = new Map(setores.map(s => [s.id, s.nome]))

    if (tipo === 'aguardando' || tipo === 'cadastros') {
      const funcs = (await funcionariosDosSetores(setores.map(s => s.id)))
        .filter(f => tipo === 'cadastros' || (f.status_credenciamento === 'pendente' && !f.descredenciado_em))
      const [dias, decisores] = await Promise.all([
        diasPedidosPorFuncionario(funcs.map(f => f.id)),
        nomesDePerfis(funcs.map(f => f.decidido_por)),
      ])
      const situacao = (f: Func) => (f.descredenciado_em ? 'Tirado da equipe' : SITUACAO[f.status_credenciamento ?? 'aprovado'] ?? 'Aprovado')
      if (tipo === 'aguardando') {
        return { relatorio: { titulo: `Aguardando aprovação — ${ev}`, arquivo: `aguardando-aprovacao-${ev}`, abas: [{
          nome: 'Aguardando aprovação',
          colunas: [
            { titulo: 'Nome', largura: 32 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Telefone', largura: 16 },
            { titulo: 'Setor', largura: 30 }, { titulo: 'Função', largura: 20 }, { titulo: 'Cidade', largura: 18 },
            { titulo: 'Como se cadastrou', largura: 22 }, { titulo: 'Cadastrado em', largura: 17 }, { titulo: 'Dias pedidos', largura: 24 },
          ],
          linhas: funcs.map(f => [
            f.nome, cpf(f.cpf), f.telefone ?? '', nomeSetor.get(f.fornecedor_id) ?? '', f.cargo ?? '', f.cidade ?? '',
            ORIGEM[f.origem ?? ''] ?? 'Painel / planilha', dataHora(f.created_at), (dias.get(f.id) ?? []).sort().map(diaCurto).join(', '),
          ]),
        }] } }
      }
      return { relatorio: { titulo: `Cadastros recebidos — ${ev}`, arquivo: `cadastros-${ev}`, abas: [{
        nome: 'Cadastros',
        colunas: [
          { titulo: 'Nome', largura: 32 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Telefone', largura: 16 },
          { titulo: 'Setor', largura: 30 }, { titulo: 'Função', largura: 20 }, { titulo: 'Como se cadastrou', largura: 22 },
          { titulo: 'Cadastrado em', largura: 17 }, { titulo: 'Situação', largura: 20 }, { titulo: 'Decidido por', largura: 24 },
          { titulo: 'Decidido em', largura: 17 }, { titulo: 'Motivo da negativa', largura: 30 }, { titulo: 'Dias pedidos', largura: 24 },
        ],
        linhas: funcs.map(f => [
          f.nome, cpf(f.cpf), f.telefone ?? '', nomeSetor.get(f.fornecedor_id) ?? '', f.cargo ?? '',
          ORIGEM[f.origem ?? ''] ?? 'Painel / planilha', dataHora(f.created_at), situacao(f),
          f.decidido_por ? decisores.get(f.decidido_por) ?? '' : '', dataHora(f.decidido_em), f.motivo_negacao ?? '',
          (dias.get(f.id) ?? []).sort().map(diaCurto).join(', '),
        ]),
      }] } }
    }

    if (tipo === 'hoje') {
      const dia = await diaDoTurno(eventoId)
      const funcs = await funcionariosDosSetores(setores.map(s => s.id))
      const porId = new Map(funcs.map(f => [f.id, f]))
      const regs: { funcionario_id: string; tipo: string; created_at: string; criado_por_perfil_id: string | null; fora_do_local: boolean | null }[] = []
      for (const lote of emLotes(funcs.map(f => f.id), 150)) {
        const linhas = await buscarTudo<typeof regs[number]>((de, ate) => supabaseAdmin
          .from('registros').select('funcionario_id, tipo, created_at, criado_por_perfil_id, fora_do_local')
          .eq('evento_id', eventoId).eq('data_ref', dia).in('funcionario_id', lote).order('created_at').range(de, ate))
        regs.push(...linhas)
      }
      const operadores = await nomesDePerfis(regs.map(r => r.criado_por_perfil_id))
      const porPessoa = new Map<string, Record<string, typeof regs[number]>>()
      for (const r of regs) porPessoa.set(r.funcionario_id, { ...(porPessoa.get(r.funcionario_id) ?? {}), [r.tipo]: r })
      const linhas = [...porPessoa.entries()]
        .filter(([, b]) => b.entrada)
        .map(([id, b]) => {
          const f = porId.get(id)!
          return [
            f.nome, cpf(f.cpf), nomeSetor.get(f.fornecedor_id) ?? '', f.cargo ?? '',
            b.entrada ? formatarBR(b.entrada.created_at, 'hora') : '', b.meio ? formatarBR(b.meio.created_at, 'hora') : '',
            b.fim ? formatarBR(b.fim.created_at, 'hora') : '', b.fim ? 'Já saiu' : 'Ainda no evento',
            b.entrada?.criado_por_perfil_id ? operadores.get(b.entrada.criado_por_perfil_id) ?? 'Operador' : 'Leitura do QR / celular',
            Object.values(b).some(x => x.fora_do_local) ? 'Sim' : '',
          ] as (string | number | null)[]
        })
        .sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[0]).localeCompare(String(b[0])))
      return { relatorio: { titulo: `Credenciados hoje (${diaCurto(dia)}) — ${ev}`, arquivo: `credenciados-hoje-${dia}-${ev}`, abas: [{
        nome: `Hoje ${diaCurto(dia).replace('/', '-')}`,
        colunas: [
          { titulo: 'Nome', largura: 32 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Setor', largura: 30 }, { titulo: 'Função', largura: 20 },
          { titulo: 'Entrada', largura: 10 }, { titulo: 'Meio', largura: 10 }, { titulo: 'Saída', largura: 10 }, { titulo: 'Situação', largura: 16 },
          { titulo: 'Entrada registrada por', largura: 26 }, { titulo: 'Fora do local', largura: 12 },
        ],
        linhas,
      }] } }
    }

    if (tipo === 'pedidos_setor') {
      const [pedidos, itens, ampliacoes] = await Promise.all([
        supabaseAdmin.from('pedidos_setor').select('id, contato_nome, contato_cpf, contato_telefone, criado_em').eq('evento_id', eventoId),
        supabaseAdmin.from('pedidos_setor_itens')
          .select('pedido_id, nome, quantidade, quantidade_por_dia, supervisor_nome, supervisor_cpf, supervisor_telefone, status, motivo_negacao, decidido_em, criado_em, subeventos(nome)')
          .eq('evento_id', eventoId).order('criado_em'),
        supabaseAdmin.from('pedidos_ampliacao')
          .select('fornecedor_id, solicitante_nome, quantidade_atual, cadastrados, quantidade_desejada, quantidade_aprovada, motivo, status, motivo_negacao, decidido_em, criado_em')
          .eq('evento_id', eventoId).order('criado_em'),
      ])
      const porPedido = new Map((pedidos.data ?? []).map(p => [p.id as string, p]))
      const porDia = (v: unknown) => (v && typeof v === 'object'
        ? Object.entries(v as Record<string, number>).sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => `${diaCurto(d)}: ${n}`).join(', ')
        : '')
      return { relatorio: { titulo: `Pedidos de setor e de mais colaboradores — ${ev}`, arquivo: `pedidos-de-setor-${ev}`, abas: [
        {
          nome: 'Pedidos de setor',
          colunas: [
            { titulo: 'Pedido em', largura: 17 }, { titulo: 'Quem pediu', largura: 26 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Telefone', largura: 16 },
            { titulo: 'Setor pedido', largura: 30 }, { titulo: 'Subevento', largura: 20 }, { titulo: 'Quantidade', largura: 11 }, { titulo: 'Por dia', largura: 30 },
            { titulo: 'Supervisor', largura: 26 }, { titulo: 'CPF do supervisor', largura: 16 }, { titulo: 'Telefone do supervisor', largura: 18 },
            { titulo: 'Situação', largura: 18 }, { titulo: 'Motivo da negativa', largura: 30 }, { titulo: 'Decidido em', largura: 17 },
          ],
          linhas: (itens.data ?? []).map(i => {
            const p = porPedido.get(i.pedido_id as string)
            return [
              dataHora(i.criado_em), (p?.contato_nome as string) ?? '', cpf(p?.contato_cpf), (p?.contato_telefone as string) ?? '',
              i.nome as string, (i.subeventos as unknown as { nome?: string } | null)?.nome ?? '', (i.quantidade as number) ?? null, porDia(i.quantidade_por_dia),
              (i.supervisor_nome as string) ?? '', cpf(i.supervisor_cpf), (i.supervisor_telefone as string) ?? '',
              SITUACAO_PEDIDO[i.status as string] ?? (i.status as string), (i.motivo_negacao as string) ?? '', dataHora(i.decidido_em),
            ]
          }),
        },
        {
          nome: 'Mais colaboradores',
          colunas: [
            { titulo: 'Pedido em', largura: 17 }, { titulo: 'Setor', largura: 30 }, { titulo: 'Quem pediu', largura: 26 },
            { titulo: 'Combinado', largura: 11 }, { titulo: 'Cadastrados', largura: 11 }, { titulo: 'Pediu', largura: 9 }, { titulo: 'Aprovado', largura: 9 },
            { titulo: 'Motivo do pedido', largura: 34 }, { titulo: 'Situação', largura: 18 }, { titulo: 'Motivo da negativa', largura: 30 }, { titulo: 'Decidido em', largura: 17 },
          ],
          linhas: (ampliacoes.data ?? []).map(a => [
            dataHora(a.criado_em), nomeSetor.get(a.fornecedor_id as string) ?? '', (a.solicitante_nome as string) ?? '',
            (a.quantidade_atual as number) ?? null, (a.cadastrados as number) ?? null, (a.quantidade_desejada as number) ?? null, (a.quantidade_aprovada as number) ?? null,
            (a.motivo as string) ?? '', SITUACAO_PEDIDO[a.status as string] ?? (a.status as string), (a.motivo_negacao as string) ?? '', dataHora(a.decidido_em),
          ]),
        },
      ] } }
    }

    if (tipo === 'veiculos') {
      const { data } = await supabaseAdmin.from('veiculos')
        .select('placa, modelo, cor, tipo, ano, empresa, setor, condutor_nome, condutor_cpf, condutor_telefone, status, tipo_cadastro, created_at')
        .eq('evento_id', eventoId).order('created_at')
      return { relatorio: { titulo: `Veículos cadastrados — ${ev}`, arquivo: `veiculos-${ev}`, abas: [{
        nome: 'Veículos',
        colunas: [
          { titulo: 'Placa', largura: 11 }, { titulo: 'Modelo', largura: 20 }, { titulo: 'Cor', largura: 12 }, { titulo: 'Tipo', largura: 12 },
          { titulo: 'Ano', largura: 8 }, { titulo: 'Empresa', largura: 26 }, { titulo: 'Setor', largura: 24 }, { titulo: 'Condutor', largura: 26 },
          { titulo: 'CPF do condutor', largura: 16 }, { titulo: 'Telefone', largura: 16 }, { titulo: 'Situação', largura: 12 },
          { titulo: 'Cadastro', largura: 12 }, { titulo: 'Cadastrado em', largura: 17 },
        ],
        linhas: (data ?? []).map(v => [
          (v.placa as string) ?? '', (v.modelo as string) ?? '', (v.cor as string) ?? '', (v.tipo as string) ?? '', (v.ano as string | number) ?? '',
          (v.empresa as string) ?? '', (v.setor as string) ?? '', (v.condutor_nome as string) ?? '', cpf(v.condutor_cpf), (v.condutor_telefone as string) ?? '',
          (v.status as string) ?? '', (v.tipo_cadastro as string) ?? '', dataHora(v.created_at),
        ]),
      }] } }
    }

    if (tipo === 'subeventos') {
      const [{ data: subs }, funcs, dia] = await Promise.all([
        supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId).order('nome'),
        funcionariosDosSetores(setores.map(s => s.id)),
        diaDoTurno(eventoId),
      ])
      const entraramHoje = new Set<string>()
      for (const lote of emLotes(funcs.map(f => f.id), 150)) {
        const { data } = await supabaseAdmin.from('registros').select('funcionario_id')
          .eq('evento_id', eventoId).eq('data_ref', dia).eq('tipo', 'entrada').in('funcionario_id', lote)
        for (const r of data ?? []) entraramHoje.add(r.funcionario_id as string)
      }
      const nomeSub = new Map((subs ?? []).map(s => [s.id as string, s.nome as string]))
      const contar = (lista: Func[]) => {
        const ativos = lista.filter(f => !f.descredenciado_em)
        return {
          cadastrados: ativos.length,
          aprovados: ativos.filter(f => (f.status_credenciamento ?? 'aprovado') === 'aprovado').length,
          aguardando: ativos.filter(f => f.status_credenciamento === 'pendente').length,
          negados: ativos.filter(f => f.status_credenciamento === 'negado').length,
          hoje: ativos.filter(f => entraramHoje.has(f.id)).length,
        }
      }
      const grupos = new Map<string, Setor[]>()
      for (const s of setores) grupos.set(s.subevento_id ?? '', [...(grupos.get(s.subevento_id ?? '') ?? []), s])
      const resumo = [...grupos.entries()].map(([subId, lista]) => {
        const c = contar(funcs.filter(f => lista.some(s => s.id === f.fornecedor_id)))
        return [nomeSub.get(subId) ?? 'Sem subevento', lista.length, c.cadastrados, c.aprovados, c.aguardando, c.negados, c.hoje]
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      const porSetor = setores.map(s => {
        const c = contar(funcs.filter(f => f.fornecedor_id === s.id))
        return [nomeSub.get(s.subevento_id ?? '') ?? 'Sem subevento', s.nome, s.quantidade_estimada ?? null, c.cadastrados, c.aprovados, c.aguardando, c.negados, c.hoje]
      }).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))
      return { relatorio: { titulo: `Subeventos — ${ev}`, arquivo: `subeventos-${ev}`, abas: [
        {
          nome: 'Resumo por subevento',
          colunas: [
            { titulo: 'Subevento', largura: 28 }, { titulo: 'Fornecedores', largura: 13 }, { titulo: 'Cadastrados', largura: 13 },
            { titulo: 'Aprovados', largura: 12 }, { titulo: 'Aguardando', largura: 12 }, { titulo: 'Negados', largura: 10 }, { titulo: `Entraram hoje (${diaCurto(dia)})`, largura: 18 },
          ],
          linhas: resumo,
        },
        {
          nome: 'Por fornecedor',
          colunas: [
            { titulo: 'Subevento', largura: 26 }, { titulo: 'Fornecedor', largura: 32 }, { titulo: 'Combinado', largura: 11 }, { titulo: 'Cadastrados', largura: 13 },
            { titulo: 'Aprovados', largura: 12 }, { titulo: 'Aguardando', largura: 12 }, { titulo: 'Negados', largura: 10 }, { titulo: `Entraram hoje (${diaCurto(dia)})`, largura: 18 },
          ],
          linhas: porSetor,
        },
      ] } }
    }

    if (tipo === 'bloqueios') {
      const { data } = await supabaseAdmin.from('cpfs_bloqueados').select('cpf, motivo, bloqueado_por, created_at').eq('evento_id', eventoId).order('created_at')
      const lista = data ?? []
      const [quem, pessoas] = await Promise.all([
        nomesDePerfis(lista.map(b => b.bloqueado_por as string | null)),
        lista.length
          ? supabaseAdmin.from('funcionarios').select('nome, cpf, fornecedor_id').in('cpf', lista.map(b => b.cpf as string)).in('fornecedor_id', setores.map(s => s.id))
          : Promise.resolve({ data: [] as { nome: string; cpf: string; fornecedor_id: string }[] }),
      ])
      const pessoaPorCpf = new Map((pessoas.data ?? []).map(p => [p.cpf as string, p]))
      return { relatorio: { titulo: `CPFs bloqueados — ${ev}`, arquivo: `cpfs-bloqueados-${ev}`, abas: [{
        nome: 'CPFs bloqueados',
        colunas: [
          { titulo: 'CPF', largura: 16 }, { titulo: 'Nome (se cadastrado)', largura: 32 }, { titulo: 'Setor', largura: 30 },
          { titulo: 'Motivo', largura: 40 }, { titulo: 'Bloqueado por', largura: 26 }, { titulo: 'Bloqueado em', largura: 17 },
        ],
        linhas: lista.map(b => {
          const p = pessoaPorCpf.get(b.cpf as string)
          return [cpf(b.cpf), (p?.nome as string) ?? '', p ? nomeSetor.get(p.fornecedor_id as string) ?? '' : '', (b.motivo as string) ?? '',
            b.bloqueado_por ? quem.get(b.bloqueado_por as string) ?? '' : '', dataHora(b.created_at)]
        }),
      }] } }
    }

    // auditoria
    const linhasAud = await buscarTudo<Record<string, unknown>>((de, ate) => supabaseAdmin
      .from('alteracoes_cadastro')
      .select('created_at, acao, campo_alterado, valor_anterior, valor_novo, motivo, usuario_responsavel, funcionarios(nome, cpf)')
      .eq('evento_id', eventoId).order('created_at', { ascending: false }).range(de, ate))
    return { relatorio: { titulo: `Auditoria — ${ev}`, arquivo: `auditoria-${ev}`, abas: [{
      nome: 'Auditoria',
      colunas: [
        { titulo: 'Data e hora', largura: 17 }, { titulo: 'Ação', largura: 30 }, { titulo: 'O que mudou', largura: 26 },
        { titulo: 'Pessoa', largura: 28 }, { titulo: 'CPF', largura: 16 }, { titulo: 'Antes', largura: 30 }, { titulo: 'Depois', largura: 30 },
        { titulo: 'Motivo', largura: 30 }, { titulo: 'Quem fez', largura: 26 },
      ],
      linhas: linhasAud.map(a => {
        const f = a.funcionarios as { nome?: string; cpf?: string } | null
        return [dataHora(a.created_at), ACAO_LABELS[a.acao as string] ?? (a.acao as string), (a.campo_alterado as string) ?? '',
          f?.nome ?? '', cpf(f?.cpf), (a.valor_anterior as string) ?? '', (a.valor_novo as string) ?? '', (a.motivo as string) ?? '',
          (a.usuario_responsavel as string) ?? '']
      }),
    }] } }
  } catch (e) {
    console.error('[relatorios-extras]', tipo, e)
    return { erro: 'Não foi possível gerar este relatório agora. Tente de novo em instantes.' }
  }
}
