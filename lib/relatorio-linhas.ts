/**
 * As LINHAS do relatório de presença, montadas a partir das batidas cruas — sem banco, pra poder ser testado no Node
 * (testes/relatorio-planilha.mjs). Quem busca os dados é `lib/relatorios.ts`.
 */
import { avaliarLocal, posicaoValida, provaDeLocal, type LocalDoEvento } from './geo-local'
import type { LinhaRelatorio } from './relatorios'

export type RegistroBruto = {
  id?: string; funcionario_id: string; tipo: string; data_ref: string | null; created_at: string
  registro_manual?: boolean | null; justificativa?: string | null; criado_por_perfil_id?: string | null; foto_url?: string | null
  latitude?: number | null; longitude?: number | null; precisao_m?: number | null; distancia_m?: number | null; fora_do_local?: boolean | null
}
export type PausaBruta = {
  funcionario_id: string; data_ref: string; saiu_em: string; voltou_em: string
  origem?: string | null; registrado_por?: string | null; meio_em?: string | null
}
export type FuncionarioBruto = {
  id: string; nome: string; cargo: string | null; cpf?: string | null; chave_pix?: string | null
  valor_receber?: number | string | null; pago?: boolean | null; pago_em?: string | null; descredenciado_em?: string | null
}

/** O que vale para todos os setores de um relatório — buscado uma vez só, não uma vez por setor. */
export type ContextoDoRelatorio = {
  local: LocalDoEvento | null
  comMeio: Set<string>
  diasMeio: { ok: boolean; dias: Set<string> }
}

/** O lançamento ainda com o id de quem lançou — o nome entra no fim, numa consulta só para o relatório inteiro. */
export type LancamentoBruto = { etapa: string; como: 'registrar' | 'manual'; perfilId: string | null; motivo: string | null }
export type LinhaEmMontagem = { linha: LinhaRelatorio; lancamentos: LancamentoBruto[] }

const ETAPA: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }
/** O texto que o "Registrar ponto" grava quando ninguém escreve um motivo — não é motivo, é o padrão. */
const MOTIVO_PADRAO_ASSISTIDO = /^Batida registrada por supervisor devido à ausência de registro/i

function comoFoiBatido(r: RegistroBruto): 'normal' | 'registrar' | 'manual' {
  if (r.registro_manual) return r.foto_url ? 'registrar' : 'manual'
  return 'normal'
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A distância da batida ao local, SÓ quando há prova de que foi fora (a mesma regra do "Fora do local" e do PDF). */
function distanciaForaDoLocal(r: RegistroBruto, local: LocalDoEvento | null): number | null {
  if (!local) return null
  const pos = posicaoValida({ latitude: numero(r.latitude), longitude: numero(r.longitude), precisao: numero(r.precisao_m) })
  const calculado = avaliarLocal(pos, local)
  const fora = provaDeLocal(pos?.precisao) && (r.fora_do_local === true || calculado.foraDoLocal === true)
  if (!fora) return null
  // Com prova há posição, então a distância calculada sempre existe.
  return numero(r.distancia_m) ?? calculado.distanciaM ?? 0
}

export const textoDistancia = (m: number) =>
  m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`

/**
 * Monta as linhas de um setor, já dentro do período: uma por (funcionário,
 * dia) em que houve batida — ou MAIS de uma, se houve pausa (ver abaixo).
 * Quem não registrou nada no período não aparece aqui (vai para `ausentes`).
 *
 * ─── PAUSA VIRA LINHA A MAIS (29/09/2026) ────────────────────────────────
 *
 * Sair e voltar no mesmo dia (ex.: duas diárias, tarde e noite) REABRE o
 * turno em vez de criar uma segunda entrada — o banco não aceita duas
 * entradas no mesmo `data_ref` (ver `inferirMomentoQR`). A saída do meio é
 * APAGADA de `registros` e sobrevive só em `pausas_turno`. Achado real do
 * Juan: o relatório de credenciamento só lia `registros`, então mostrava
 * uma pessoa "entrando" de tarde e "saindo" de madrugada, sem rastro
 * nenhum da volta pro trabalho à noite — como se tivesse sido um turno
 * único de 20h, quando na verdade foram duas diárias separadas.
 *
 * A correção: cada pausa do dia parte a linha em duas — a entrada original
 * até o horário em que saiu, e de quando voltou até a saída final (ou até
 * a pausa seguinte, se houve mais de uma). `historico.ts` já faz o mesmo
 * cálculo pro modal de uma pessoa; aqui é a versão pro relatório de todos.
 *
 * O MEIO vai no bloco em que caiu (o de um bloco que terminou numa pausa fica na pausa — meio por bloco). "Sem meio"
 * é do DIA: só quando o setor e o dia pedem e a pessoa não bateu meio nenhum no dia (a mesma régua do PDF).
 */
export function linhasDoSetor(
  funcionarios: FuncionarioBruto[],
  registrosPorFuncionario: Map<string, RegistroBruto[]>,
  pausasPorFuncionario: Map<string, PausaBruta[]>,
  setor: { id: string; nome: string },
  ctx: ContextoDoRelatorio,
): LinhaEmMontagem[] {
  const saida: LinhaEmMontagem[] = []
  const pedeMeio = (dia: string) => ctx.comMeio.has(setor.id) && (!ctx.diasMeio.ok || ctx.diasMeio.dias.has(dia))
  type Bloco = { entradaISO: string | null; saidaISO: string | null; meios: string[]; como: Set<string>; lancamentos: LancamentoBruto[]; fora: string[] }
  const novoBloco = (entradaISO: string | null): Bloco => ({ entradaISO, saidaISO: null, meios: [], como: new Set(), lancamentos: [], fora: [] })
  const anotar = (b: Bloco, r: RegistroBruto) => {
    const como = comoFoiBatido(r)
    b.como.add(como)
    if (como !== 'normal') {
      const motivo = (r.justificativa ?? '').trim()
      b.lancamentos.push({ etapa: ETAPA[r.tipo] ?? r.tipo, como, perfilId: r.criado_por_perfil_id ?? null, motivo: motivo && !MOTIVO_PADRAO_ASSISTIDO.test(motivo) ? motivo : null })
    }
    const fora = distanciaForaDoLocal(r, ctx.local)
    if (fora !== null) b.fora.push(`${ETAPA[r.tipo] ?? r.tipo} a ${textoDistancia(fora)}`)
  }

  for (const f of funcionarios) {
    const registros = registrosPorFuncionario.get(f.id) ?? []
    if (!registros.length) continue

    const porDia = new Map<string, RegistroBruto[]>()
    for (const r of registros) {
      if (!r.data_ref) continue
      const grupo = porDia.get(r.data_ref) ?? []
      grupo.push(r)
      porDia.set(r.data_ref, grupo)
    }

    const pausas = pausasPorFuncionario.get(f.id) ?? []

    for (const [dia, doDia] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const entrada = doDia.find(r => r.tipo === 'entrada') ?? null
      const fim = doDia.find(r => r.tipo === 'fim') ?? null
      const meios = doDia.filter(r => r.tipo === 'meio').sort((a, b) => a.created_at.localeCompare(b.created_at))
      const pausasDoDia = pausas.filter(p => p.data_ref === dia).sort((a, b) => a.saiu_em.localeCompare(b.saiu_em))

      const blocos: Bloco[] = []
      let atual = novoBloco(entrada?.created_at ?? null)
      if (entrada) anotar(atual, entrada)
      for (const p of pausasDoDia) {
        atual.saidaISO = p.saiu_em
        if (p.meio_em) atual.meios.push(p.meio_em)
        blocos.push(atual)
        atual = novoBloco(p.voltou_em)
        // A volta ao trabalho: pelo leitor (scanner), pelo "Registrar ponto" (assistido) ou recuperada pelo suporte.
        const como = p.origem === 'assistido' ? 'registrar' : p.origem === 'recuperado' ? 'manual' : 'normal'
        atual.como.add(como)
        if (como !== 'normal') atual.lancamentos.push({ etapa: 'Volta ao trabalho', como, perfilId: p.registrado_por ?? null, motivo: null })
      }
      atual.saidaISO = fim?.created_at ?? null
      if (fim) anotar(atual, fim)
      blocos.push(atual)

      // O meio de `registros` vai no bloco em que caiu; fora de todos, no último (é o do bloco atual).
      for (const m of meios) {
        const alvo = blocos.find(b => (!b.entradaISO || b.entradaISO <= m.created_at) && (!b.saidaISO || m.created_at <= b.saidaISO)) ?? blocos[blocos.length - 1]
        alvo.meios.push(m.created_at)
        anotar(alvo, m)
      }
      const algumMeio = blocos.some(b => b.meios.length)
      const primeiroComEntrada = blocos.find(b => b.entradaISO)

      for (const b of blocos) {
        saida.push({
          linha: {
            funcionarioId: f.id, nome: f.nome, setor: setor.nome, funcao: f.cargo ?? '', cpf: f.cpf ?? null,
            dataRef: dia, entradaISO: b.entradaISO, saidaISO: b.saidaISO,
            meiosISO: [...b.meios].sort(),
            semMeio: !algumMeio && b === primeiroComEntrada && pedeMeio(dia),
            origem: b.como.has('manual') ? 'manual' : b.como.has('registrar') ? 'registrar' : 'normal',
            foraDoLocal: b.fora,
            baixaEm: f.descredenciado_em ?? null,
          },
          lancamentos: b.lancamentos,
        })
      }
    }
  }

  return saida
}

/** "Saída: lançada à mão por Juan Muzy — esqueceu de bater" (o nome de quem lançou vem de fora, numa consulta só). */
export function textoDoLancamento(l: LancamentoBruto, nomes: Map<string, string>): string {
  const quem = l.perfilId ? nomes.get(l.perfilId) : null
  return `${l.etapa}: ${l.como === 'manual' ? 'lançada à mão' : 'Registrar ponto (com foto)'}${quem ? ` por ${quem}` : ''}${l.motivo ? ` — ${l.motivo}` : ''}`
}
