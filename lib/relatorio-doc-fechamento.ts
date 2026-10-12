import { plural, type SecaoDoc, type LinhaDoc } from './relatorio-doc'

/**
 * FECHAMENTO DO TURNO — a montagem (sem banco) do relatório do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026):
 * por equipe, quantos ENTRARAM no dia e quantos estão SEM SAÍDA, com a parcela em barra. Duas seções: as equipes com
 * pendência (da maior pra menor) e as zeradas. Só entram equipes com apontamento. Os dados vêm de
 * lib/relatorio-doc-turno.ts.
 */
export type SetorDoFechamento = { id: string; nome: string; area: string; pedeMeio?: boolean }
export type BatidaDoFechamento = { funcionarioId: string; fornecedorId: string; tipo: 'entrada' | 'fim' }

export function montarFechamentoDoTurno(p: {
  eventoNome: string; dia: string; setores: SetorDoFechamento[]; batidas: BatidaDoFechamento[]
  /**
   * 'pagas' = só as equipes que pedem o meio (pagas por pessoa: segurança, limpeza, bar, caixa…) — o recorte do modelo,
   * que deixa de fora imprensa, parceiros e atrações. 'todas' = o evento inteiro.
   */
  escopo?: 'pagas' | 'todas'
}): { rotuloEvento: string; secoes: SecaoDoc[] } {
  const { dia } = p
  const soPagas = p.escopo !== 'todas'
  const setores = p.setores
    .filter(s => !soPagas || s.pedeMeio)
    .map(s => ({ ...s, nome: nomeBonito(s.nome), area: nomeBonito(s.area) }))
  const porSetor = new Map<string, { entraram: Set<string>; sairam: Set<string> }>()
  for (const b of p.batidas) {
    const c = porSetor.get(b.fornecedorId) ?? { entraram: new Set<string>(), sairam: new Set<string>() }
    if (b.tipo === 'entrada') c.entraram.add(b.funcionarioId)
    else c.sairam.add(b.funcionarioId)
    porSetor.set(b.fornecedorId, c)
  }

  const linhas = setores
    .map(s => {
      const c = porSetor.get(s.id)
      const entraram = c?.entraram.size ?? 0
      const semSaida = c ? [...c.entraram].filter(id => !c.sairam.has(id)).length : 0
      return { ...s, entraram, semSaida }
    })
    .filter(s => s.entraram > 0)

  const comPendencia = linhas.filter(s => s.semSaida > 0)
    .sort((a, b) => b.semSaida - a.semSaida || b.entraram - a.entraram || a.nome.localeCompare(b.nome, 'pt-BR'))
  const zeradas = linhas.filter(s => s.semSaida === 0)
    .sort((a, b) => b.entraram - a.entraram || a.nome.localeCompare(b.nome, 'pt-BR'))

  const semana = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
  const semanaCurta = semana.replace('-feira', '')
  const ddmm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
  const fora = setores.length - linhas.length
  const aviso = {
    destaque: 'Somente equipes com apontamento.',
    texto: (fora > 0
      ? `Aparecem ${linhas.length} das ${setores.length}${soPagas ? ' equipes pagas por pessoa' : ''}: ${fora === 1 ? 'a outra não teve' : `as outras ${fora} não tiveram`} entrada ${artigoDoDia(semanaCurta)} ${semanaCurta}.`
      : `Todas as ${setores.length}${soPagas ? ' equipes pagas por pessoa' : ' equipes'} tiveram entrada ${artigoDoDia(semanaCurta)} ${semanaCurta}.`),
  }
  const totalSemSaida = comPendencia.reduce((s, x) => s + x.semSaida, 0)

  const secoes: SecaoDoc[] = [
    {
      rotulo: 'Pendentes por equipe',
      titulo: comPendencia.length ? `${plural(totalSemSaida, 'pessoa')} em ${plural(comPendencia.length, 'equipe')}.` : 'Ninguém sem saída.',
      aviso,
      colunas: [
        { titulo: 'Equipe', tipo: 'nome', largura: '34%' },
        { titulo: 'Área', tipo: 'texto', largura: '22%' },
        { titulo: 'Entraram', tipo: 'numero', largura: '14%' },
        { titulo: 'Sem saída', tipo: 'destaque', largura: '14%' },
        { titulo: 'Parcela', tipo: 'barra', largura: '16%' },
      ],
      linhas: comPendencia.map((s): LinhaDoc => [s.nome, s.area || '—', s.entraram, s.semSaida, s.entraram ? s.semSaida / s.entraram : 0]),
      vazio: 'Todas as equipes com apontamento já estão com saída.',
    },
    {
      rotulo: 'Equipes zeradas',
      titulo: zeradas.length ? `${plural(zeradas.length, 'equipe')} com todo mundo já com saída.` : 'Nenhuma equipe zerada ainda.',
      aviso,
      colunas: [
        { titulo: 'Equipe', tipo: 'nome', largura: '44%' },
        { titulo: 'Área', tipo: 'texto', largura: '28%' },
        { titulo: 'Entraram', tipo: 'numero', largura: '14%' },
        { titulo: 'Sem saída', tipo: 'numero', largura: '14%' },
      ],
      linhas: zeradas.map((s): LinhaDoc => [s.nome, s.area || '—', s.entraram, 0]),
      vazio: 'Nenhuma equipe está com todo mundo com saída ainda.',
    },
  ]

  return {
    rotuloEvento: `${p.eventoNome} · Turno de ${semanaCurta}, ${ddmm}`,
    secoes,
  }
}

/** "no sábado" / "na sexta" / "no domingo". */
function artigoDoDia(semana: string): string {
  return /^(sábado|domingo)/i.test(semana) ? 'no' : 'na'
}

/** Sufixos jurídicos que só alongam o nome na tabela ("Zig Tecnologia Instituição de Pagamento S.A." → "Zig Tecnologia"). */
const SUFIXO_JURIDICO = /\s+(?:-\s*)?(?:institui[çc][ãa]o de pagamento|ltda\.?|s\.?\/?a\.?|eireli|epp|me)(?=\s|$|\.)[\s.]*$/i

/**
 * "EQUIPE CAIXA - LAERTE" → "Equipe Caixa - Laerte"; "MUVUKA / PEGA / FERVÔ" → "Muvuka / Pega / Fervô"; "ALLEX - AF
 * COMBAT" → "Allex - AF Combat" — como no modelo. Sigla de duas letras (AF, DJ, LR, SV) fica em maiúsculas; os
 * sufixos jurídicos saem.
 */
export function nomeBonito(texto: string): string {
  let base = texto.trim()
  for (let i = 0; i < 3 && SUFIXO_JURIDICO.test(base); i++) base = base.replace(SUFIXO_JURIDICO, '').trim()
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'no', 'na', 'ao', 'os', 'as'])
  return base.toLowerCase().split(/(\s+|\/|-)/).map((p, i) => {
    if (!p.trim() || p === '/' || p === '-') return p
    if (i > 0 && minusculas.has(p)) return p
    if (p.length === 2 && !minusculas.has(p) && /^[a-zà-ú]+$/.test(p)) return p.toUpperCase()
    return p.charAt(0).toUpperCase() + p.slice(1)
  }).join('')
}
