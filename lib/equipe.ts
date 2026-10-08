/**
 * Supervisores que contam como PESSOA da equipe de um setor sem terem crachá nele.
 *
 * O supervisor é uma pessoa da equipe do setor que cobre — mas o cadastro é um por CPF por evento,
 * então quem supervisiona vários setores (a Lucy e o Daniel, no VITAL) tem o crachá em UM só deles. Nos
 * outros, a contagem do setor mostrava "0 pessoas de 10" com supervisor ao lado (07/10/2026).
 *
 * Só soma o número: a pessoa não vira linha da equipe nem entra nas batidas daquele setor — por
 * isso os totais do evento (entradas, saídas, "Funcionários do evento") continuam contando crachás.
 */
export function supervisoresSemCrachaPorSetor(
  supervisoresPorSetor: Record<string, { cpf: string | null }[]>,
  funcionarios: { cpf?: string | null; fornecedor_id?: string }[],
): Record<string, number> {
  const crachaNoSetor = new Set(
    funcionarios.filter(f => f.cpf && f.fornecedor_id).map(f => `${f.fornecedor_id}:${f.cpf}`),
  )
  const resultado: Record<string, number> = {}
  for (const [setorId, lista] of Object.entries(supervisoresPorSetor)) {
    // Mesma pessoa listada duas vezes não conta em dobro.
    const cpfs = new Set(lista.map(s => (s.cpf ?? '').replace(/\D/g, '')).filter(Boolean))
    const n = [...cpfs].filter(cpf => !crachaNoSetor.has(`${setorId}:${cpf}`)).length
    if (n > 0) resultado[setorId] = n
  }
  return resultado
}
