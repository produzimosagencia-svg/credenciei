/**
 * A FUNÇÃO de uma pessoa dentro da equipe de um setor (pedido do Juan, 09/10/2026) — é o que decide o acesso dela:
 *
 *   * Colaborador — só o QR Code, nenhum acesso ao sistema; dias escolhidos pelo supervisor.
 *   * Encarregado — consulta a equipe do setor (`encarregados_setor`, ver lib/encarregado.ts); dias escolhidos.
 *   * Supervisor  — o acesso de supervisor daquele setor (`supervisor_setores`); liberado em todos os dias.
 *
 * Não é o `cargo` (texto livre: "Caixa móvel", "Bartender"), que continua existindo e aparece no crachá.
 * Trocar a função NUNCA tira a pessoa da equipe. A ação é `definirFuncaoNaEquipe` (lib/actions.ts).
 */
export type FuncaoNaEquipe = 'colaborador' | 'encarregado' | 'supervisor'

export const FUNCOES_NA_EQUIPE: { valor: FuncaoNaEquipe; rotulo: string; ajuda: string }[] = [
  { valor: 'colaborador', rotulo: 'Colaborador', ajuda: 'Só o QR Code. Sem acesso ao sistema.' },
  { valor: 'encarregado', rotulo: 'Encarregado', ajuda: 'Consulta a equipe deste setor.' },
  { valor: 'supervisor', rotulo: 'Supervisor', ajuda: 'Acesso de supervisor deste setor. Liberado todos os dias.' },
]

export const rotuloDaFuncao = (f: FuncaoNaEquipe) => FUNCOES_NA_EQUIPE.find(x => x.valor === f)?.rotulo ?? 'Colaborador'

export const ehFuncaoNaEquipe = (v: unknown): v is FuncaoNaEquipe =>
  v === 'colaborador' || v === 'encarregado' || v === 'supervisor'

/**
 * O `cargo` acompanha a função só quando ele ESTÁ VAZIO ou é o próprio nome de uma função ("Supervisor") — é o que
 * pinta a linha de dourado (`ehSupervisorDaEquipe`). Um cargo de verdade ("Bartender") nunca é sobrescrito.
 */
export function cargoAcompanhaFuncao(cargo: string | null | undefined): boolean {
  const c = (cargo ?? '').trim().toLowerCase()
  return !c || c === 'supervisor' || c === 'supervisora' || c === 'encarregado' || c === 'encarregada' || c === 'colaborador' || c === 'colaboradora'
}
