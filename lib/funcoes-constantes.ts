/**
 * Funções comuns de equipe de evento — texto puro, sem import.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * O campo `cargo` sempre foi texto livre, e a mesma função aparecia escrita de
 * dez jeitos: "cx movel", "cx móvel", "caixa móvel", "caixa movel". No
 * relatório, no filtro e na hora de escalar, cada grafia conta como uma
 * função diferente.
 *
 * Esta lista alimenta um `<datalist>` no cadastro e na edição: a pessoa
 * DIGITA, mas o navegador sugere a grafia certa das mais comuns. Continua
 * aceitando qualquer texto (evento tem função que ninguém previu), só para de
 * multiplicar a mesma coisa por descuido.
 *
 * Ordenada por frequência de uso, não alfabética — as primeiras são as que
 * mais aparecem.
 */
export const FUNCOES_COMUNS = [
  'Garçom',
  'Copeiro',
  'Bartender',
  'Caixa',
  'Caixa móvel',
  'Caixa fixo',
  'Recepcionista',
  'Credenciamento',
  'Hostess',
  'Segurança',
  'Brigadista',
  'Auxiliar de limpeza',
  'Cozinheiro',
  'Auxiliar de cozinha',
  'Chapeiro',
  'Estoquista',
  'Almoxarife',
  'Montagem',
  'Desmontagem',
  'Carregador',
  'Motorista',
  'Manobrista',
  'Produção',
  'Coordenador',
  'Líder de equipe',
  'Apoio geral',
  'Promotor',
  'Fiscal de pista',
  'Iluminação',
  'Sonorização',
  'Palco',
  'Socorrista',
  'Fotógrafo',
  'Filmagem',
] as const

/** Só pra checar rápido se um texto já bate com uma função conhecida (case/acento à parte fica no chamador). */
export const FUNCOES_COMUNS_SET = new Set<string>(FUNCOES_COMUNS)
