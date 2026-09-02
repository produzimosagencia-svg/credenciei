import { supabaseAdmin as supabase } from './supabase-server'
import { pendenciasDoDia } from './pendencias'

/**
 * As visões de "quem fez / quem não fez", de UM dia — a lógica por trás da
 * tela de Presença e da de Atividades.
 *
 * Compartilhada porque as duas telas respondem a mesma pergunta por caminhos
 * diferentes: Presença entra pelo evento, Atividades entra pelo menu e
 * escolhe o evento. Duas implementações divergiriam no primeiro ajuste — que
 * é exatamente como o sistema chegou a ter uma tela "Pendências" e outra
 * "Presença" dizendo coisas diferentes sobre a mesma pessoa.
 *
 * As três visões de pendência usam `pendenciasDoDia`, a MESMA função que
 * monta a mensagem de cobrança no WhatsApp — para nunca existir uma pendência
 * na tela e outra na mensagem.
 */

export type Etapa = 'entrada' | 'meio' | 'fim'

export type LinhaPresenca = {
  id: string
  nome: string
  cpf: string
  setor: string
  em: string | null
  manual: boolean
}

export type Visao = 'entrada' | 'meio' | 'fim' | 'presentes' | 'faltam' | 'sem_meio' | 'sem_saida'

type ConfigVisao =
  | { titulo: string; tipo: 'feito'; etapa: Etapa }
  | { titulo: string; tipo: 'presentes' }
  | { titulo: string; tipo: 'pendencia'; etapa: Etapa }

export const VISOES: Record<Visao, ConfigVisao> = {
  entrada: { titulo: 'Registraram a entrada', tipo: 'feito', etapa: 'entrada' },
  meio: { titulo: 'Registraram o meio', tipo: 'feito', etapa: 'meio' },
  fim: { titulo: 'Registraram a saída', tipo: 'feito', etapa: 'fim' },
  presentes: { titulo: 'Presentes agora', tipo: 'presentes' },
  faltam: { titulo: 'Ainda não chegaram', tipo: 'pendencia', etapa: 'entrada' },
  sem_meio: { titulo: 'Não fizeram o meio', tipo: 'pendencia', etapa: 'meio' },
  sem_saida: { titulo: 'Não fizeram a saída', tipo: 'pendencia', etapa: 'fim' },
}

export const ehVisao = (v: string | undefined): v is Visao => !!v && v in VISOES

/**
 * As linhas de uma visão, num dia.
 *
 * `fornecedorId` restringe ao setor do supervisor — mesma régua do resto do
 * sistema. `null`/ausente = o evento inteiro.
 */
export async function linhasDaVisao({
  eventoId, visao, dia, fornecedorId,
}: {
  eventoId: string
  visao: Visao
  dia: string
  fornecedorId?: string | null
}): Promise<{ linhas: LinhaPresenca[]; colunaHora: string }> {
  const config = VISOES[visao]

  if (config.tipo === 'pendencia') {
    const pendencias = await pendenciasDoDia({
      eventoId, data: dia, fornecedorId: fornecedorId ?? undefined, etapas: [config.etapa],
    })
    return {
      linhas: pendencias
        .map(p => ({ id: p.funcionarioId, nome: p.nome, cpf: p.cpf, setor: p.setorNome, em: p.realizadoEm, manual: false }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      // Sem pendência de entrada não há "entrou às" pra mostrar — só nas outras duas.
      colunaHora: config.etapa === 'entrada' ? '' : 'Entrou às',
    }
  }

  /*
   * A equipe inteira, e não só quem bateu: "presentes" se define por AUSÊNCIA
   * de saída depois da entrada, então precisa da lista completa pra cruzar.
   */
  let equipeQuery = supabase
    .from('funcionarios')
    .select('id, nome, cpf, ativo, fornecedor_id, fornecedores!inner(nome, evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .order('nome')
  if (fornecedorId) equipeQuery = equipeQuery.eq('fornecedor_id', fornecedorId)

  const [{ data: equipe }, { data: registros }] = await Promise.all([
    equipeQuery,
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, registro_manual')
      .eq('evento_id', eventoId)
      .eq('data_ref', dia),
  ])

  const porPessoa = new Map<string, Partial<Record<Etapa, { em: string; manual: boolean }>>>()
  for (const r of registros ?? []) {
    const atual = porPessoa.get(r.funcionario_id) ?? {}
    atual[r.tipo as Etapa] = { em: r.created_at as string, manual: r.registro_manual === true }
    porPessoa.set(r.funcionario_id, atual)
  }

  const linhas = (equipe ?? [])
    .map((f): LinhaPresenca | null => {
      const feito = porPessoa.get(f.id) ?? {}
      const setor = (f.fornecedores as unknown as { nome: string } | null)?.nome ?? '—'
      const base = { id: f.id as string, nome: f.nome as string, cpf: f.cpf as string, setor }

      if (config.tipo === 'feito') {
        const r = feito[config.etapa]
        return r ? { ...base, em: r.em, manual: r.manual } : null
      }
      // presentes: entrou e ainda não saiu — a hora mostrada é a da ENTRADA,
      // que é o que responde "desde quando essa pessoa está aqui".
      return feito.entrada && !feito.fim ? { ...base, em: feito.entrada.em, manual: feito.entrada.manual } : null
    })
    .filter((l): l is LinhaPresenca => l !== null)
    .sort((a, b) => (a.em && b.em ? a.em.localeCompare(b.em) : a.nome.localeCompare(b.nome, 'pt-BR')))

  return { linhas, colunaHora: visao === 'presentes' ? 'Entrou às' : 'Registrou às' }
}

/**
 * Os números do dia — os quatro que a operação de fato pergunta.
 *
 * "Pendências" vem de `pendenciasDoDia`, e não de "equipe menos quem bateu":
 * essa conta contava como faltante todo mundo cuja hora ainda nem chegou —
 * num dia de montagem dava "587 não chegaram" de uma equipe de 679 que não
 * estava escalada pra aquele dia. Pendência é só o que JÁ passou da hora, que
 * é o que dá pra cobrar.
 */
export async function numerosDoDia({
  eventoId, dia, fornecedorId,
}: {
  eventoId: string
  dia: string
  fornecedorId?: string | null
}): Promise<{ presentes: number; entradas: number; saidas: number; pendencias: number }> {
  const [presentes, entradas, saidas, pendencias] = await Promise.all([
    linhasDaVisao({ eventoId, visao: 'presentes', dia, fornecedorId }),
    linhasDaVisao({ eventoId, visao: 'entrada', dia, fornecedorId }),
    linhasDaVisao({ eventoId, visao: 'fim', dia, fornecedorId }),
    pendenciasDoDia({ eventoId, data: dia, fornecedorId: fornecedorId ?? undefined }),
  ])
  return {
    presentes: presentes.linhas.length,
    entradas: entradas.linhas.length,
    saidas: saidas.linhas.length,
    pendencias: pendencias.length,
  }
}
