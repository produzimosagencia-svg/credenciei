// Hierarquia de papéis do sistema (SaaS multi-organização):
//   master     → dono da plataforma. Enxerga e gerencia TODAS as organizações,
//                todos os eventos e cria os admins. organizacao_id = null.
//   admin      → dono de UMA organização. Enxerga apenas os dados da própria
//                organização (eventos.organizacao_id = perfil.organizacao_id).
//                Cria a equipe (supervisores) e eventos até o limite da org.
//                NÃO pode excluir eventos (só o master exclui).
//   supervisor → vinculado a UM setor (fornecedor) específico via
//                perfis.fornecedor_id. Só escaneia QR e gerencia a equipe
//                daquele setor — nunca vê outros setores/eventos/organização.
//
// Papéis legados ('gerente', 'cliente') continuam válidos no banco, mas não
// são mais oferecidos na UI. Tratamos 'gerente' como equivalente a admin.

export type Role = 'master' | 'admin' | 'supervisor' | 'gerente' | 'cliente'

export const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  cliente: 'Cliente',
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

/** Pode EXCLUIR eventos. Apenas o master (admin não apaga eventos). */
export const podeExcluirEventos = (role?: string) => role === 'master'

/** Pode usar o scanner (todos os papéis autenticados podem). */
export const podeEscanear = (role?: string) =>
  role === 'master' || role === 'admin' || role === 'gerente' || role === 'cliente' || role === 'supervisor'
