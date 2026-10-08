/**
 * Mais de uma função por pessoa — o que não depende de banco nem de servidor.
 *
 * Uma pessoa tem UM login e UMA função BASE (`perfis.role`); as extras moram em
 * `perfil_funcoes` (supabase/upgrade-funcoes-multiplas.sql). Na tela ela clica
 * na foto e troca de perfil: o sistema trata a pessoa, a cada momento, como UMA
 * função só — a escolhida. Quem lê a escolha e a valida é `getPerfil`.
 */

/** O cookie com a função que a pessoa escolheu. Só vale se ela de fato tiver essa função. */
export const COOKIE_FUNCAO = 'credenciei-funcao'

/** As únicas funções que podem ser EXTRAS. Administrador, master, suporte e produtor são identidades próprias. */
export const FUNCOES_EXTRAS = ['supervisor', 'operador_portao', 'encarregado'] as const
export type FuncaoExtra = (typeof FUNCOES_EXTRAS)[number]

/** Quem pode RECEBER uma função extra (qualquer base, menos as identidades que não se misturam). */
const BASES_QUE_NAO_RECEBEM = ['master', 'suporte', 'produtor']
export function podeReceberFuncaoExtra(roleBase: string | null | undefined): boolean {
  return !!roleBase && !BASES_QUE_NAO_RECEBEM.includes(roleBase)
}

export type FuncaoDoPerfil = {
  role: string
  /** `true` na função de base (a de `perfis.role`). */
  base: boolean
  organizacaoId: string | null
  /**
   * Quem identifica a função na troca de perfil. Quase sempre é o próprio `role`; o Gestor de
   * credenciamento EXTRA leva a organização junto (`operador_portao@<org>`), porque a mesma pessoa
   * pode ser Gestor em mais de uma organização (supabase/upgrade-funcoes-varias-organizacoes.sql).
   */
  chave: string
  /** Só no Gestor de credenciamento extra: o nome da organização, pra distinguir na lista. */
  organizacaoNome?: string | null
}

/** A chave de uma função (ver `FuncaoDoPerfil.chave`). */
export function chaveDaFuncao(f: { role: string; base?: boolean; organizacaoId?: string | null }): string {
  return !f.base && f.role === 'operador_portao' && f.organizacaoId ? `operador_portao@${f.organizacaoId}` : f.role
}

/** Pra onde a pessoa vai quando troca pra esta função. */
export function destinoDaFuncao(role: string): string {
  if (role === 'encarregado') return '/encarregado'
  if (role === 'produtor') return '/gastos'
  return '/admin'
}

export const MSG_FUNCAO_NAO_COMBINA =
  'Este acesso é uma identidade própria (master, suporte ou produtor) e não pode receber outra função.'
