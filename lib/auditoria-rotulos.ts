/**
 * Os rótulos da auditoria — num arquivo só deles, sem nenhum import.
 *
 * Moravam em lib/suporte.ts, que importa o cliente de serviço do Supabase.
 * São texto puro e a tela de auditoria precisa deles no NAVEGADOR (o select
 * de ação, o nome do arquivo exportado) — e aí o bundle do cliente puxava
 * junto a chave de serviço. Separados, cada lado importa só o que é.
 */

/** Rótulos das ações gravadas em `alteracoes_cadastro` — usados na tela de auditoria. */
export const ACAO_LABELS: Record<string, string> = {
  ALTERACAO_CPF: 'Correção de CPF',
  ALTERACAO_NOME: 'Correção de nome',
  ALTERACAO_TELEFONE: 'Correção de telefone',
  ALTERACAO_SETOR: 'Mudança de setor',
  ATIVACAO_FUNCIONARIO: 'Ativação',
  DESATIVACAO_FUNCIONARIO: 'Desativação',
  CADASTRO_EMERGENCIAL: 'Cadastro emergencial',
  REGISTRO_ENTRADA_ASSISTIDA: 'Entrada assistida',
  REGISTRO_SAIDA_ASSISTIDA: 'Saída assistida',
  CORRECAO_PONTO: 'Correção de ponto',
  DESCREDENCIAMENTO: 'Descredenciamento',
  EXCLUSAO_FUNCIONARIO: 'Funcionário excluído',
  BLOQUEIO_CPF: 'CPF bloqueado',
  DESBLOQUEIO_CPF: 'CPF liberado',
  EXCLUSAO_PONTO: 'Batida apagada',
  RESET_SENHA: 'Redefinição de senha',
  ALTERACAO_SUPERVISOR: 'Alteração de supervisor',
}

/** Motivos padrão pra alteração sensível — a UI oferece estes + "Outro" com texto livre. */
export const MOTIVOS_PADRAO = [
  'CPF incorreto',
  'Nome incorreto',
  'Telefone incorreto',
  'Setor incorreto',
  'Função incorreta',
  'Cadastro emergencial',
  'Correção solicitada pelo responsável',
  'Problema operacional',
] as const
