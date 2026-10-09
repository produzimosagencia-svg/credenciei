import type { FaseDoDia } from './janelas'

/**
 * Escala por dia (eventos de subeventos) — as REGRAS, sem banco.
 *
 * Mora à parte de lib/escala.ts (que consulta o banco) pelo mesmo motivo de
 * lib/autorizacao-matriz.ts: é a parte que decide "pode ou não pode", e
 * precisa ser testável sozinha (testes/escala.mjs) e importável pela tela.
 * Por isso não importa nada em tempo de execução — só tipo.
 *
 * O fluxo:
 *   1. a pessoa escolhe os dias no formulário  → escala 'pendente'
 *   2. o supervisor confirma quais valem        → escala 'aprovada'
 *   3. o QR Code só vale nos dias aprovados
 *
 * Escala `null` é quem está FORA do fluxo (evento normal, cadastro feito pelo
 * painel, ou anterior a este recurso) — para essa pessoa nada muda.
 */

/**
 * A TRAVA POR DIA (limite de pessoas por fornecedor em cada dia) está LIGADA.
 *
 * Religada em 08/10/2026 (mesmo dia em que foi desligada): Juan pediu um relatório dos setores sem trava
 * configurada pra sábado/domingo e, ao ver que "livre" significava nenhum limite em lugar nenhum, decidiu
 * religar — "seja sábado ou domingo a trava tem que existir". Antes de religar, os 9 pares fornecedor/dia que já
 * tinham MAIS gente aprovada do que o limite configurado (ex.: EQUIPE BAR - ANDRE, 76 aprovados / limite 71)
 * tiveram o limite subido pra bater com quem já está aprovado — religar não tira ninguém que já tinha vaga.
 *
 * Com ela ligada: o formulário e a aprovação recusam passar do limite (`diasLotados`/`diasAcimaDaTrava`), e o
 * portão recusa a ENTRADA de quem ainda não entrou quando o dia já bateu o máximo (`vagaNoSetorNoDia` — quem já
 * entrou nunca é barrado de novo).
 */
export const TRAVA_POR_DIA_ATIVA = true

export type StatusEscala = 'pendente' | 'aprovada'

export function statusEscalaValido(v: unknown): StatusEscala | null {
  return v === 'pendente' || v === 'aprovada' ? v : null
}

export type DiaDaEscala = { data: string; fase: FaseDoDia }

/** Um dia da escala de UMA pessoa — o que ela pediu e o que o supervisor confirmou. */
export type DiaEscolhido = { data: string; selecionado: boolean; aprovado: boolean }

export const ROTULO_FASE: Record<FaseDoDia, string> = {
  montagem: 'Montagem',
  evento: 'Evento',
  desmontagem: 'Desmontagem',
}

export const ORDEM_FASES: FaseDoDia[] = ['montagem', 'evento', 'desmontagem']

/*
 * Os textos da recusa — os mesmos no portão (para o operador) e na credencial
 * (para a pessoa). A responsabilidade fica explícita: quem escolheu os dias
 * foi ela, e quem muda é o supervisor.
 */
export const RECUSA_DIA_NAO_AUTORIZADO = {
  titulo: 'Acesso não autorizado para hoje.',
  mensagem: 'Seu QR Code não está válido para esta data. Entre em contato com seu supervisor para verificar sua escala.',
} as const

export const RECUSA_ESCALA_PENDENTE = {
  titulo: 'Escala aguardando aprovação.',
  mensagem: 'Seus dias de trabalho ainda não foram confirmados pelo supervisor. Entre em contato com ele para liberar o acesso.',
} as const

export type VereditoEscala = { ok: true } | { ok: false; titulo: string; mensagem: string }

/**
 * O dia `dia` ("YYYY-MM-DD") está liberado para esta escala?
 *
 * `null` (ou status `null`) = pessoa fora do fluxo de escala por dia → sempre
 * liberado AQUI; as regras de sempre (janela, credenciamento, área) continuam
 * valendo à parte.
 */
export function vereditoDaEscala(
  escala: { status: StatusEscala | null; diasAprovados: string[] } | null,
  dia: string,
): VereditoEscala {
  if (!escala || !escala.status) return { ok: true }
  if (escala.status === 'pendente') return { ok: false, ...RECUSA_ESCALA_PENDENTE }
  if (!escala.diasAprovados.includes(dia)) return { ok: false, ...RECUSA_DIA_NAO_AUTORIZADO }
  return { ok: true }
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

/** Lista vinda de fora (formulário, action): só datas "YYYY-MM-DD", sem repetição, em ordem. */
export function normalizarDias(dias: unknown): string[] {
  if (!Array.isArray(dias)) return []
  return [...new Set(dias.filter((d): d is string => typeof d === 'string' && DIA_ISO.test(d)))].sort()
}

/**
 * Confere uma escolha contra os dias que o evento oferece. Recusa (em vez de
 * filtrar em silêncio) porque um dia fora do período só chega aqui por uma
 * chamada adulterada ou por uma tela desatualizada — nos dois casos a pessoa
 * precisa saber que a escolha dela não foi aceita como estava.
 */
export function conferirDiasPermitidos(
  escolhidos: unknown, disponiveis: string[],
): { ok: true; dias: string[] } | { ok: false; erro: string } {
  const dias = normalizarDias(escolhidos)
  if (!dias.length) return { ok: false, erro: 'Selecione pelo menos um dia de trabalho.' }
  const permitidos = new Set(disponiveis)
  const fora = dias.filter(d => !permitidos.has(d))
  if (fora.length) {
    return { ok: false, erro: `${fora.map(d => rotuloDoDia(d).curto).join(', ')} não faz parte do período deste evento. Atualize a página e escolha de novo.` }
  }
  return { ok: true, dias }
}

/**
 * Como ficam as linhas de `funcionario_dias` depois de o supervisor aprovar
 * `aprovados`: o que a pessoa pediu (`selecionado`) é preservado sempre; o
 * `aprovado` passa a ser exatamente a lista nova. Linha que não foi pedida nem
 * aprovada some.
 */
export function planejarAprovacao(
  existentes: DiaEscolhido[], aprovados: string[],
): { manter: DiaEscolhido[]; remover: string[] } {
  const aprovadosSet = new Set(aprovados)
  const porData = new Map(existentes.map(d => [d.data, d]))
  for (const d of aprovados) if (!porData.has(d)) porData.set(d, { data: d, selecionado: false, aprovado: true })

  const manter: DiaEscolhido[] = []
  const remover: string[] = []
  for (const d of [...porData.values()].sort((a, b) => a.data.localeCompare(b.data))) {
    const aprovado = aprovadosSet.has(d.data)
    if (d.selecionado || aprovado) manter.push({ data: d.data, selecionado: d.selecionado, aprovado })
    else remover.push(d.data)
  }
  return { manter, remover }
}

const SEMANA_LONGA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const
const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** "2026-10-08" → { semana: 'Quinta-feira', semanaCurta: 'qui', curto: '08/10' } */
export function rotuloDoDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const semana = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()
  return {
    semana: SEMANA_LONGA[semana],
    semanaCurta: SEMANA_CURTA[semana],
    curto: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
  }
}

/** "08/10, 09/10 e 10/10" — para auditoria e mensagens. */
export function listarDias(dias: string[]): string {
  const r = [...dias].sort().map(d => rotuloDoDia(d).curto)
  if (r.length <= 1) return r[0] ?? 'nenhum dia'
  return `${r.slice(0, -1).join(', ')} e ${r[r.length - 1]}`
}
