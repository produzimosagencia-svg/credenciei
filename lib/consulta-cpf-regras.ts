/*
 * CONSULTA POR CPF — as regras, sem banco (testadas em testes/consulta-cpf.mjs). O caso que motivou (Juan, 23/10/2026,
 * Caio do VITAL): "ele bateu entrada e saída e não consta no sistema" — para responder, foi preciso rodar scripts para
 * achar as fichas, as batidas, quem lançou cada uma e a auditoria. A tela de consulta mostra tudo isso de uma vez.
 */

export type BatidaDaConsulta = {
  id: string
  tipo: 'entrada' | 'meio' | 'fim'
  dataRef: string | null
  quandoISO: string
  /** De onde veio: o leitor/celular da pessoa, o "Registrar ponto" (com foto, na frente do operador) ou lançada à mão. */
  como: 'leitor' | 'registrar_ponto' | 'a_mao'
  porNome: string | null
  porPapel: string | null
  foto: boolean
  foraDoLocal: boolean | null
  alertas: string[]
  semInternet: boolean
  justificativa: string | null
}

export type PausaDaConsulta = { dataRef: string; saiuEm: string; voltouEm: string; origem: string | null; porNome: string | null }
export type ApagadaDaConsulta = { tipo: string; dataRef: string | null; quandoISO: string | null; apagadaEm: string; justificativa: string | null }
export type AlteracaoDaConsulta = { quando: string; quem: string | null; acao: string; campo: string | null; antes: string | null; depois: string | null; motivo: string | null }
export type MensagemDaConsulta = { tipo: string; quando: string; status: string; erro: string | null; telefone: string | null }

export type ResumoDaFicha = {
  total: number
  dias: number
  aMao: number
  /** Dias com entrada e sem saída depois dela. */
  semSaida: number
  /** Dias com a saída ANTES da entrada (a madrugada lançada no dia errado). */
  saidaAntesDaEntrada: number
}

export type FichaDaConsulta = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  telefoneValido: boolean
  cargo: string | null
  situacao: 'aprovado' | 'pendente' | 'negado'
  ativo: boolean
  baixaEm: string | null
  criadaEm: string
  origem: string | null
  evento: { id: string; nome: string; dataInicio: string | null; ativo: boolean }
  fornecedor: { id: string; nome: string; area: string | null }
  batidas: BatidaDaConsulta[]
  pausas: PausaDaConsulta[]
  apagadas: ApagadaDaConsulta[]
  alteracoes: AlteracaoDaConsulta[]
  mensagens: MensagemDaConsulta[]
  resumo: ResumoDaFicha
}

/** Os 11 números do CPF, ou `null`. Aceita com ou sem pontos e traço (a validade dos dígitos não é conferida: há fichas de teste). */
export function cpfDigitado(texto: string | null | undefined): string | null {
  const d = String(texto ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

export function comoFoiBatida(r: { registro_manual?: boolean | null; foto_url?: string | null }): BatidaDaConsulta['como'] {
  if (r.registro_manual) return r.foto_url ? 'registrar_ponto' : 'a_mao'
  return 'leitor'
}

export const ROTULO_COMO: Record<BatidaDaConsulta['como'], string> = {
  leitor: 'Leitor / celular da pessoa',
  registrar_ponto: 'Registrar ponto (com foto)',
  a_mao: 'Lançada à mão',
}

/** O resumo das batidas de uma ficha: quantas, em quantos dias, quantas à mão e onde falta ou sobra. */
export function resumirBatidas(batidas: Pick<BatidaDaConsulta, 'tipo' | 'dataRef' | 'quandoISO' | 'como'>[]): ResumoDaFicha {
  const porDia = new Map<string, { entrada?: number; fim?: number }>()
  for (const b of batidas) {
    if (!b.dataRef || (b.tipo !== 'entrada' && b.tipo !== 'fim')) continue
    const d = porDia.get(b.dataRef) ?? {}
    d[b.tipo] = Date.parse(b.quandoISO)
    porDia.set(b.dataRef, d)
  }
  let semSaida = 0
  let saidaAntesDaEntrada = 0
  for (const d of porDia.values()) {
    if (d.entrada != null && d.fim == null) semSaida++
    else if (d.entrada != null && d.fim != null && d.fim <= d.entrada) saidaAntesDaEntrada++
  }
  return {
    total: batidas.length,
    dias: new Set(batidas.map(b => b.dataRef).filter(Boolean)).size,
    aMao: batidas.filter(b => b.como !== 'leitor').length,
    semSaida,
    saidaAntesDaEntrada,
  }
}
