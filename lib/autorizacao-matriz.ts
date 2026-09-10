/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  A MATRIZ — parte PURA da autorização (sem banco, sem `server-only`)      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Só dados e lógica de decisão. Zero import de servidor → dá pra testar direto
 * (ver testes/autorizacao.mjs) e importar de qualquer lugar. A cola com o
 * banco (resolver escopo de evento/setor, carregar o perfil) mora em
 * lib/autorizacao.ts.
 *
 * ⚠️ EM DESENVOLVIMENTO — 10/09/2026. Este módulo AINDA NÃO É USADO por
 * nenhuma tela ou action. É a fundação da revisão de permissões pedida pelo
 * Juan; será ligado fase a fase, numa janela sem evento ao vivo. Ver
 * docs/autorizacao.md.
 */

import type { Role } from './permissions'

// ─── As ações ───────────────────────────────────────────────────────────────

export type Acao =
  // — Plataforma (sem escopo de evento) —
  | 'ver_todos_eventos'
  | 'gerenciar_organizacoes'
  | 'gerenciar_acessos'
  | 'gerenciar_permissoes'
  | 'gerenciar_backlog'
  | 'financeiro'
  | 'whatsapp'
  | 'registrar_gastos'
  | 'base_funcionarios'
  | 'excluir'
  // — Evento (exigem { eventoId } ou { setorId }) —
  | 'ver_painel'
  | 'escanear'
  | 'editar_evento'
  | 'editar_colaborador'
  | 'gestor_credenciamento'
  | 'criar_setor'
  | 'atribuir_supervisor'
  | 'cadastrar_veiculo'
  | 'registro_ponto'
  | 'atividades_evento'
  | 'avisos'
  | 'lancamento_manual'
  | 'bloquear_cpf'
  | 'relatorios'
  | 'auditoria'
  | 'encontro_colaborador'

export type Escopo = 'nenhum' | 'evento' | 'setor'

export type RegraAcao = {
  /** Papéis que têm a ação. `master` está SEMPRE implícito e não se lista. */
  papeis: Role[]
  escopo: Escopo
  /**
   * O supervisor tem a ação mas o EFEITO não fica preso ao setor dele — hoje
   * só `bloquear_cpf` (barra o CPF no evento inteiro). Ele precisa alcançar o
   * evento pra executar, e não um setor específico.
   */
  supervisorAlemDoSetor?: boolean
  /**
   * A chave da capacidade LEGADA (lib/permissions.ts `CAPACIDADES`) que hoje
   * governa esta ação. Serve pra os overrides já gravados
   * (`permissoes_usuario`, `permissoes_organizacao`) continuarem valendo
   * quando a matriz for ligada. `null` = ação nova, sem override legado.
   */
  chaveLegada: string | null
}

/**
 * ═══ A MATRIZ ═══  (revisão 10/09/2026 — decisões do Juan)
 *
 *   • Admin continua por ORGANIZAÇÃO (vê todos os eventos dela).
 *   • Admin PERDE Gastos e o financeiro do WhatsApp.
 *   • "Gestor de Credenciamento" = `operador_portao` ELEVADO: ganha criar
 *     setor + atribuir supervisor, dentro do evento dele.
 *   • Supervisor ganha Auditoria (só do próprio setor).
 *   • Suporte ganha WhatsApp + Auditoria do evento + Encontro de Colaborador
 *     (só consulta — a tela some os botões de ação).
 *
 * `gerente`/`cliente` são legados (ninguém cria mais) e entram nos papéis
 * onde o admin entra, só pra não trancar quem já existe.
 */
export const MATRIZ: Record<Acao, RegraAcao> = {
  // ── Plataforma — só master, salvo onde marcado ──────────────────────────
  ver_todos_eventos:      { papeis: [], escopo: 'nenhum', chaveLegada: 'ver_todos_eventos' },
  gerenciar_organizacoes: { papeis: [], escopo: 'nenhum', chaveLegada: 'gerenciar_organizacoes' },
  gerenciar_permissoes:   { papeis: [], escopo: 'nenhum', chaveLegada: null },
  gerenciar_backlog:      { papeis: [], escopo: 'nenhum', chaveLegada: 'gerenciar_backlog' },
  financeiro:             { papeis: [], escopo: 'nenhum', chaveLegada: null },
  registrar_gastos:       { papeis: [], escopo: 'nenhum', chaveLegada: 'registrar_gastos' }, // mudou: admin saiu
  base_funcionarios:      { papeis: [], escopo: 'nenhum', chaveLegada: null },
  excluir:                { papeis: [], escopo: 'nenhum', chaveLegada: 'excluir' },
  gerenciar_acessos:      { papeis: ['admin', 'gerente'], escopo: 'nenhum', chaveLegada: 'gerenciar_acessos' },
  whatsapp:               { papeis: ['suporte'], escopo: 'nenhum', chaveLegada: null }, // novo: suporte

  // ── Evento ──────────────────────────────────────────────────────────────
  ver_painel:           { papeis: ['admin', 'gerente', 'cliente', 'suporte'], escopo: 'evento', chaveLegada: null },
  escanear:             { papeis: ['admin', 'gerente', 'cliente', 'operador_portao', 'suporte'], escopo: 'evento', chaveLegada: 'escanear' },
  editar_evento:        { papeis: ['admin', 'gerente', 'cliente', 'suporte'], escopo: 'evento', chaveLegada: 'gerenciar_eventos' },
  editar_colaborador:   { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'suporte'], escopo: 'setor', chaveLegada: 'gerenciar_eventos' },
  gestor_credenciamento:{ papeis: ['admin', 'gerente', 'suporte'], escopo: 'evento', chaveLegada: 'gerenciar_acessos' },
  criar_setor:          { papeis: ['admin', 'gerente', 'cliente', 'operador_portao', 'suporte'], escopo: 'evento', chaveLegada: 'gerenciar_eventos' }, // novo: operador
  atribuir_supervisor:  { papeis: ['admin', 'gerente', 'cliente', 'operador_portao', 'suporte'], escopo: 'evento', chaveLegada: 'gerenciar_acessos' }, // novo: operador
  cadastrar_veiculo:    { papeis: ['admin', 'operador_portao', 'suporte'], escopo: 'evento', chaveLegada: 'gerenciar_veiculos' },
  registro_ponto:       { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'operador_portao', 'suporte'], escopo: 'setor', chaveLegada: 'acompanhar' },
  atividades_evento:    { papeis: ['admin', 'gerente', 'cliente', 'suporte'], escopo: 'evento', chaveLegada: 'acompanhar' },
  avisos:               { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'suporte'], escopo: 'setor', chaveLegada: 'gerenciar_eventos' },
  lancamento_manual:    { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'operador_portao', 'suporte'], escopo: 'setor', chaveLegada: 'gerenciar_eventos' },
  bloquear_cpf:         { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'operador_portao', 'suporte'], escopo: 'evento', supervisorAlemDoSetor: true, chaveLegada: null },
  relatorios:           { papeis: ['admin', 'gerente', 'cliente', 'supervisor', 'suporte'], escopo: 'setor', chaveLegada: null },
  auditoria:            { papeis: ['admin', 'gerente', 'supervisor', 'suporte'], escopo: 'setor', chaveLegada: null }, // novo: supervisor + suporte(evento)
  encontro_colaborador: { papeis: ['admin', 'gerente', 'suporte'], escopo: 'evento', chaveLegada: null }, // novo: suporte (só consulta)
}

/** A lista, pra telas e docs iterarem sem depender da ordem do objeto. */
export const ACOES = Object.keys(MATRIZ) as Acao[]

/** Quando true, ter a ação como supervisor significa "só no meu setor". */
export function acaoLimitadaAoSetor(acao: Acao): boolean {
  return MATRIZ[acao].escopo === 'setor' && !MATRIZ[acao].supervisorAlemDoSetor
}

// ─── Decisão só pela dimensão "Perfil" (+ overrides) ────────────────────────

export type PerfilParaMatriz = {
  role: string
  /** Exceções da ORGANIZAÇÃO, chaveadas por `role:chave` (permissoes_organizacao). */
  permissoes?: Record<string, boolean> | null
  /** Overrides do ACESSO, chaveados por `chave` (perfis.permissoes_usuario). */
  permissoes_usuario?: Record<string, boolean> | null
} | null | undefined

/**
 * Este papel tem a ação — considerando os overrides já existentes?
 *
 * Ordem (a primeira que tiver um booleano vence):
 *   1. override do acesso        → permissoes_usuario[chaveLegada]
 *   2. exceção da organização     → permissoes[`role:chaveLegada`]
 *   3. a MATRIZ                   → regra.papeis inclui o papel?
 *
 * `master` sempre passa. Sem `chaveLegada`, pula direto pra MATRIZ (ação nova
 * não tem override antigo pra respeitar).
 */
export function temAcaoPeloPapel(perfil: PerfilParaMatriz, acao: Acao): boolean {
  const role = perfil?.role
  if (!role) return false
  if (role === 'master') return true

  const regra = MATRIZ[acao]
  if (!regra) return false

  if (regra.chaveLegada) {
    const doAcesso = perfil?.permissoes_usuario?.[regra.chaveLegada]
    if (typeof doAcesso === 'boolean') return doAcesso
    const daOrg = perfil?.permissoes?.[`${role}:${regra.chaveLegada}`]
    if (typeof daOrg === 'boolean') return daOrg
  }

  return regra.papeis.includes(role as Role)
}

/**
 * Todas as ações que este papel tem (só dimensão de perfil) — pro resumo/menu.
 */
export function acoesDoPapel(perfil: PerfilParaMatriz): Acao[] {
  return ACOES.filter(a => temAcaoPeloPapel(perfil, a))
}
