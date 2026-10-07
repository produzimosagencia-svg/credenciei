/**
 * Encarregado — tipos, rótulos e regras puras (sem banco, sem 'use server').
 *
 * Um Encarregado é uma pessoa da equipe de um setor a quem o SUPERVISOR delega
 * a CONSULTA daquele setor: um login (CPF + senha) que só enxerga a equipe
 * dele, sem nenhuma ação operacional. Não é "mais um papel": é uma permissão
 * adicional presa a uma pessoa da equipe e a um setor.
 *
 * ─── COMO A SEGURANÇA FUNCIONA ──────────────────────────────────────────────
 *
 * 1. Nunca entra em `supervisor_setores` — essa tabela vale PODER, e a régua
 *    de permissão do sistema inteiro pergunta por ela. Os vínculos de
 *    Encarregado moram à parte (`encarregados_setor`) e só as telas de
 *    consulta (`/encarregado`) os leem.
 * 2. O papel `encarregado` não está em nenhuma lista de permissão do sistema
 *    (lib/permissions.ts): por padrão ele não pode nada, em lugar nenhum.
 * 3. O acesso nasce de alguém DA EQUIPE e some com ela (on delete cascade).
 * 4. A conta do Encarregado não tem organização nem setor ativo no perfil
 *    (`organizacao_id` e `fornecedor_id` nulos): o "mesmo da organização" e o
 *    "setor aberto agora" — que são os atalhos de quase toda checagem — não
 *    casam com nada.
 *
 * Banco: supabase/upgrade-encarregado.sql. Ações: lib/actions-encarregado.ts.
 */

/**
 * O que um Encarregado pode CONSULTAR. Hoje todos têm o mesmo conjunto,
 * guardado em `encarregados_setor.permissoes`; a lista existe pra dar a
 * outras pessoas mais (ou menos) no futuro sem refazer a arquitetura.
 *
 * Nenhuma delas é de escrita — e nenhuma nunca deve ser: quem precisa agir
 * vira supervisor.
 */
export const PERMISSOES_ENCARREGADO = {
  /** A equipe do setor: nome, função, situação e quem está escalado. */
  ver_equipe: 'Ver a equipe do setor',
  /** Quem já fez entrada, meio e saída hoje. */
  ver_presenca: 'Ver a presença do dia',
  /** Telefone e CPF completos de cada pessoa. Desligado por padrão (dado pessoal). */
  ver_contato: 'Ver telefone e CPF da equipe',
} as const

export type PermissaoEncarregado = keyof typeof PERMISSOES_ENCARREGADO

/** O que todo Encarregado novo recebe. `ver_contato` fica de fora de propósito. */
export const PERMISSOES_PADRAO: PermissaoEncarregado[] = ['ver_equipe', 'ver_presenca']

export function temPermissaoEncarregado(permissoes: readonly string[] | null | undefined, chave: PermissaoEncarregado): boolean {
  return (permissoes ?? []).includes(chave)
}

/** O papel de login. Só este papel tem a casca "/encarregado". */
export const ehEncarregado = (role?: string | null) => role === 'encarregado'

/** O CPF mascarado pra tela de consulta: ***.456.789-** (quem precisa do inteiro tem `ver_contato`). */
export function cpfMascarado(cpf: string | null | undefined): string {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return '—'
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** Um vínculo já pronto pra tela (quem é, de qual setor). */
export type EncarregadoDoSetor = {
  id: string
  nome: string
  cargo: string | null
  concedidoPorNome: string | null
  concedidoEm: string
}

/** Uma pessoa da equipe que pode ser promovida. */
export type CandidatoEncarregado = {
  funcionarioId: string
  nome: string
  cargo: string | null
  /** Sem telefone não dá pra mandar o acesso pelo WhatsApp. */
  temTelefone: boolean
}

/** Onde o Encarregado atua: evento › subevento (quando houver) › setor. */
export type ContextoDoSetor = {
  fornecedorId: string
  setor: string
  evento: string
  eventoId: string
  subevento: string | null
}

/** "EVENTO › SUBEVENTO › SETOR" — o que o supervisor confirma e o Encarregado vê. */
export function caminhoDoSetor(c: Pick<ContextoDoSetor, 'evento' | 'subevento' | 'setor'>): string {
  return [c.evento, c.subevento, c.setor].filter(Boolean).join(' › ')
}

export const MSG_FUNCIONALIDADE_DESLIGADA =
  'A criação de Encarregados não está liberada para a sua organização. Peça ao administrador para ativá-la.'
