import { plural, type SecaoDoc, type LinhaDoc } from './relatorio-doc'

/**
 * FECHAMENTO DO TURNO — a montagem (sem banco) do relatório do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026):
 * por equipe, quantos ENTRARAM no dia e quantos estão SEM SAÍDA, com a parcela em barra. Duas seções: as equipes com
 * pendência (da maior pra menor) e as zeradas. Só entram equipes com apontamento. Os dados vêm de
 * lib/relatorio-doc-turno.ts.
 *
 * VÁRIOS DIAS (Juan, 13/10/2026: "preciso poder filtrar mais dias, por exemplo dia 10/10 a 12/10"): a conta passa a ser
 * por pessoa POR DIA — quem trabalhou três dias conta três entradas, e cada dia sem saída é uma pendência (é o que se
 * paga e o que se cobra). Entra uma seção a mais, "Sem saída por dia", que diz em qual dia ficou cada pendência. Com um
 * dia só, o relatório é exatamente o de antes.
 */
export type SetorDoFechamento = { id: string; nome: string; area: string; pedeMeio?: boolean }
export type BatidaDoFechamento = { funcionarioId: string; fornecedorId: string; tipo: 'entrada' | 'fim'; dataRef: string }

export function montarFechamentoDoTurno(p: {
  eventoNome: string
  /** O primeiro e o último dia (AAAA-MM-DD); iguais = o turno de um dia. */
  de: string; ate: string
  setores: SetorDoFechamento[]; batidas: BatidaDoFechamento[]
  /**
   * 'pagas' = só as equipes que pedem o meio (pagas por pessoa: segurança, limpeza, bar, caixa…) — o recorte do modelo,
   * que deixa de fora imprensa, parceiros e atrações. 'todas' = o evento inteiro.
   */
  escopo?: 'pagas' | 'todas'
}): { rotuloEvento: string; secoes: SecaoDoc[] } {
  const { de, ate } = p
  const umDia = de === ate
  const soPagas = p.escopo !== 'todas'
  const setores = p.setores
    .filter(s => !soPagas || s.pedeMeio)
    .map(s => ({ ...s, nome: nomeBonito(s.nome), area: nomeBonito(s.area) }))
  // Por equipe e por dia: quem entrou e quem saiu (cada pessoa conta uma vez por dia).
  const porSetorDia = new Map<string, Map<string, { entraram: Set<string>; sairam: Set<string> }>>()
  for (const b of p.batidas) {
    if (b.dataRef < de || b.dataRef > ate) continue
    const dias = porSetorDia.get(b.fornecedorId) ?? new Map<string, { entraram: Set<string>; sairam: Set<string> }>()
    const c = dias.get(b.dataRef) ?? { entraram: new Set<string>(), sairam: new Set<string>() }
    if (b.tipo === 'entrada') c.entraram.add(b.funcionarioId)
    else c.sairam.add(b.funcionarioId)
    dias.set(b.dataRef, c)
    porSetorDia.set(b.fornecedorId, dias)
  }
  const contaDoDia = (c: { entraram: Set<string>; sairam: Set<string> }) => ({
    entraram: c.entraram.size,
    semSaida: [...c.entraram].filter(id => !c.sairam.has(id)).length,
  })

  const linhas = setores
    .map(s => {
      let entraram = 0, semSaida = 0
      for (const c of porSetorDia.get(s.id)?.values() ?? []) { const d = contaDoDia(c); entraram += d.entraram; semSaida += d.semSaida }
      return { ...s, entraram, semSaida }
    })
    .filter(s => s.entraram > 0)

  const comPendencia = linhas.filter(s => s.semSaida > 0)
    .sort((a, b) => b.semSaida - a.semSaida || b.entraram - a.entraram || a.nome.localeCompare(b.nome, 'pt-BR'))
  const zeradas = linhas.filter(s => s.semSaida === 0)
    .sort((a, b) => b.entraram - a.entraram || a.nome.localeCompare(b.nome, 'pt-BR'))

  const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const semanaDe = (d: string) => new Date(`${d}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).replace('-feira', '')
  const semanaCurta = semanaDe(de)
  const quando = umDia ? `${artigoDoDia(semanaCurta)} ${semanaCurta}` : `de ${ddmm(de)} a ${ddmm(ate)}`
  const fora = setores.length - linhas.length
  const aviso = {
    destaque: 'Somente equipes com apontamento.',
    texto: (fora > 0
      ? `Aparecem ${linhas.length} das ${setores.length}${soPagas ? ' equipes pagas por pessoa' : ''}: ${fora === 1 ? 'a outra não teve' : `as outras ${fora} não tiveram`} entrada ${quando}.`
      : `Todas as ${setores.length}${soPagas ? ' equipes pagas por pessoa' : ' equipes'} tiveram entrada ${quando}.`)
      + (umDia ? '' : ' Cada dia de cada pessoa é uma entrada.'),
  }
  const totalSemSaida = comPendencia.reduce((s, x) => s + x.semSaida, 0)
  const colEntraram = umDia ? 'Entraram' : 'Entradas'

  const secoes: SecaoDoc[] = [
    {
      rotulo: 'Pendentes por equipe',
      titulo: comPendencia.length
        ? `${umDia ? plural(totalSemSaida, 'pessoa') : plural(totalSemSaida, 'entrada sem saída', 'entradas sem saída')} em ${plural(comPendencia.length, 'equipe')}.`
        : 'Ninguém sem saída.',
      aviso,
      colunas: [
        { titulo: 'Equipe', tipo: 'nome', largura: '34%' },
        { titulo: 'Área', tipo: 'texto', largura: '22%' },
        { titulo: colEntraram, tipo: 'numero', largura: '14%' },
        { titulo: 'Sem saída', tipo: 'destaque', largura: '14%' },
        { titulo: 'Parcela', tipo: 'barra', largura: '16%' },
      ],
      linhas: comPendencia.map((s): LinhaDoc => [s.nome, s.area || '—', s.entraram, s.semSaida, s.entraram ? s.semSaida / s.entraram : 0]),
      vazio: 'Todas as equipes com apontamento já estão com saída.',
      novaFolha: true,
    },
  ]

  // Vários dias: em qual dia ficou cada pendência (só as equipes e os dias com alguém sem saída).
  if (!umDia) {
    const porDia: { dia: string; nome: string; area: string; entraram: number; semSaida: number }[] = []
    for (const s of linhas) {
      for (const [dia, c] of porSetorDia.get(s.id) ?? []) {
        const d = contaDoDia(c)
        if (d.semSaida > 0) porDia.push({ dia, nome: s.nome, area: s.area, ...d })
      }
    }
    porDia.sort((a, b) => a.dia.localeCompare(b.dia) || b.semSaida - a.semSaida || a.nome.localeCompare(b.nome, 'pt-BR'))
    const diasComPendencia = new Set(porDia.map(x => x.dia)).size
    const rotuloDia = (d: string) => `${semanaDe(d).slice(0, 3).replace(/^./, c => c.toUpperCase())} ${ddmm(d)}`
    secoes.push({
      rotulo: 'Sem saída por dia',
      titulo: porDia.length ? `Em qual dia ficou cada pendência: ${plural(diasComPendencia, 'dia')}.` : 'Nenhum dia com pendência.',
      colunas: [
        { titulo: 'Dia', tipo: 'texto', largura: '13%' },
        { titulo: 'Equipe', tipo: 'nome', largura: '33%' },
        { titulo: 'Área', tipo: 'texto', largura: '22%' },
        { titulo: 'Entraram', tipo: 'numero', largura: '14%' },
        { titulo: 'Sem saída', tipo: 'destaque', largura: '18%' },
      ],
      linhas: porDia.map((x): LinhaDoc => [rotuloDia(x.dia), x.nome, x.area || '—', x.entraram, x.semSaida]),
      vazio: 'Todo mundo que entrou no período já está com saída.',
      novaFolha: true,
    })
  }

  secoes.push({
    rotulo: 'Equipes zeradas',
    titulo: zeradas.length ? `${plural(zeradas.length, 'equipe')} com todo mundo já com saída.` : 'Nenhuma equipe zerada ainda.',
    aviso,
    colunas: [
      { titulo: 'Equipe', tipo: 'nome', largura: '44%' },
      { titulo: 'Área', tipo: 'texto', largura: '28%' },
      { titulo: colEntraram, tipo: 'numero', largura: '14%' },
      { titulo: 'Sem saída', tipo: 'numero', largura: '14%' },
    ],
    linhas: zeradas.map((s): LinhaDoc => [s.nome, s.area || '—', s.entraram, 0]),
    vazio: 'Nenhuma equipe está com todo mundo com saída ainda.',
    novaFolha: true,
  })

  return {
    rotuloEvento: umDia ? `${p.eventoNome} · Turno de ${semanaCurta}, ${ddmm(de)}` : `${p.eventoNome} · Turnos de ${ddmm(de)} a ${ddmm(ate)}`,
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
