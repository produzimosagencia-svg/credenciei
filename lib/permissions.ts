// Hierarquia de papéis do sistema (SaaS multi-organização):
//   master          → dono da plataforma. Enxerga e gerencia TODAS as
//                      organizações, todos os eventos e cria os admins.
//                      organizacao_id = null.
//   admin           → dono de UMA organização. Enxerga apenas os dados da
//                      própria organização (eventos.organizacao_id =
//                      perfil.organizacao_id). Cria a equipe (supervisores)
//                      e eventos até o limite da org. NÃO pode excluir
//                      eventos (só o master exclui).
//   supervisor      → vinculado a UM setor (fornecedor) específico via
//                      perfis.fornecedor_id. Gerencia a equipe daquele setor
//                      — nunca vê outros setores/eventos/organização.
//   operador_portao → vinculado ao EVENTO inteiro (fornecedor_id nulo), não
//                      a um setor. Só lê QR e registra ponto manual — nunca
//                      gerencia evento, equipe ou usuários. É o papel de
//                      quem opera fisicamente o credenciamento sem precisar
//                      de senha de admin.
//
// Papéis legados ('gerente', 'cliente') continuam válidos no banco, mas não
// são mais oferecidos na UI. Tratamos 'gerente' como equivalente a admin.

export type Role = 'master' | 'admin' | 'supervisor' | 'gerente' | 'cliente' | 'operador_portao'

export const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  cliente: 'Cliente',
  operador_portao: 'Operador de portão',
}

/** Dono da plataforma: acesso irrestrito a todas as organizações. */
export const ehMaster = (role?: string) => role === 'master'

/** Enxerga todos os eventos do sistema (não só os da própria organização). */
export const veTodosEventos = (role?: string) => role === 'master'

/** Pode gerenciar organizações (criar admins, ativar/suspender, definir limites). */
export const podeGerenciarOrganizacoes = (role?: string) => role === 'master'

/** Pode criar/editar/excluir usuários. Master gerencia admins; admin gerencia a própria equipe. */
export const podeGerenciarUsuarios = (role?: string) =>
  role === 'master' || role === 'admin' || role === 'gerente'

/** Pode criar/editar eventos, fornecedores, setores e funcionários. */
export const podeGerenciarEventos = (role?: string) =>
  role === 'master' || role === 'admin' || role === 'gerente' || role === 'cliente'

/**
 * Pode EXCLUIR qualquer coisa do sistema — evento, setor, funcionário,
 * supervisor, organização. Só o master.
 *
 * Exclusão aqui é sempre em cascata (apagar um setor leva a equipe e as
 * presenças junto) e não tem desfazer. O admin continua podendo ENCERRAR
 * evento e DESATIVAR pessoa, que resolvem o mesmo problema do dia a dia sem
 * destruir histórico. Quando ele precisa apagar de verdade, fala com a
 * plataforma — é a fricção que se quer.
 */
export const podeExcluir = (role?: string) => role === 'master'

/** @deprecated Use `podeExcluir`. Mantido porque já é chamado em algumas telas. */
export const podeExcluirEventos = podeExcluir

/**
 * Pode corrigir um dado de identidade já cadastrado (hoje: só o CPF do
 * funcionário) — algo que a própria pessoa não tem como refazer sozinha sem
 * perder o QR, o histórico de batidas e o pagamento já vinculados ao
 * cadastro antigo.
 *
 * Só master, de propósito e por enquanto: decisão do Juan em 02/09/2026,
 * pensando num papel futuro de "suporte" (acesso de apoio no dia do evento,
 * que corrige cadastro e move gente entre setores sem ser dono da conta).
 * Esse papel ainda não existe no sistema — quando existir, esta função é o
 * único lugar que precisa mudar pra incluí-lo.
 */
export const podeEditarIdentidade = (role?: string) => role === 'master'

/**
 * Pode LER o QR e registrar presença pelo scanner.
 *
 * O supervisor ficou de fora a pedido. Quem credencia é o posto de
 * credenciamento — o supervisor cuida da equipe, não do portão. É a mesma
 * separação que as mensagens já dizem à equipe ("vá ao credenciamento", e não
 * "procure seu supervisor"), agora valendo também no sistema.
 *
 * `operador_portao` existe exatamente para ser o posto de credenciamento:
 * escaneia, mas não gerencia nada — ver `podeGerenciarEventos`, que ele NÃO
 * satisfaz.
 */
export const podeEscanear = (role?: string) =>
  role === 'master' || role === 'admin' || role === 'gerente' || role === 'cliente' || role === 'operador_portao'

/**
 * Pode ACOMPANHAR a operação: atividades, pendências, histórico e a tela de
 * localizar funcionário.
 *
 * Separado de `podeEscanear` porque são coisas diferentes: uma é registrar
 * presença, a outra é olhar quem já registrou. Tirar o scanner do supervisor
 * não pode cegá-lo em relação à própria equipe — é justamente disso que ele
 * cuida.
 */
export const podeAcompanhar = (role?: string) =>
  podeEscanear(role) || role === 'supervisor'
