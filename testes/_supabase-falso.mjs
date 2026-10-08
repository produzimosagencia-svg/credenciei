// Banco em memória com só o que as consultas de `alcancaSetor` usam: from().select().eq().maybeSingle().
export const tabelas = { fornecedores: [], supervisor_setores: [] }

function consulta(nome) {
  const filtros = []
  const b = {
    select: () => b,
    eq: (coluna, valor) => { filtros.push([coluna, valor]); return b },
    maybeSingle: async () => ({
      data: (tabelas[nome] ?? []).find(l => filtros.every(([c, v]) => l[c] === v)) ?? null,
      error: null,
    }),
  }
  return b
}

export const supabaseAdmin = { from: nome => consulta(nome) }
export const getPerfil = async () => null
