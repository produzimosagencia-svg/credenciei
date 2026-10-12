import { plural, type SecaoDoc, type LinhaDoc, type CelulaDoc } from './relatorio-doc'
import { nomeBonito } from './relatorio-doc-fechamento'
import type { DadosRelatorioEvento } from './relatorios'
import type { LinhaForaDoLocal } from './alertas-local'

/**
 * PRESENÇA em PDF, no padrão do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026) — a versão RESUMIDA, mas
 * completa, do relatório (as planilhas continuam): "contendo as horas, de entrada, meio e fim, dias trabalhados por
 * equipe, quem bateu fora da localização". Quatro partes:
 *   1. resumo por equipe (pessoas, diárias, horas, saídas faltando);
 *   2. dias trabalhados por equipe (quantas pessoas entraram em cada dia);
 *   3. batidas fora do local — só as que têm prova (GPS de até 100 m);
 *   4. cada equipe: cada pessoa e cada dia, com entrada, meio, saída e horas (o que falta em laranja).
 * E o avesso, à parte: quem NÃO bateu ponto no período.
 */
const fuso = { timeZone: 'America/Sao_Paulo' } as const
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' })
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const diaEHora = (iso: string) => `${new Date(iso).toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' })} ${hora(iso)}`
const duracao = (ms: number) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60).toLocaleString('pt-BR')}h${String(m % 60).padStart(2, '0')}` }
const ETAPA: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export function periodoTexto(de: string, ate: string): string {
  return de === ate ? `Dia ${diaCurto(de)}.` : `Período de ${diaCurto(de)} a ${diaCurto(ate)}.`
}

export type ExtrasDaPresenca = {
  areaDoSetor: Map<string, string>
  /** "funcionarioId|AAAA-MM-DD" → os meios do dia (do bloco anterior e do atual), em ordem. */
  meiosDoDia: Map<string, string[]>
  /** O setor pede o meio naquele dia? (setor marcado E dia marcado — lib/meio.ts). */
  pedeMeio: (setorId: string, dia: string) => boolean
  /** As batidas fora do local com prova, já no período e nos setores do relatório. `null` = evento sem local no mapa. */
  foraDoLocal: LinhaForaDoLocal[] | null
  raioM: number | null
}

export function montarPresenca(dados: DadosRelatorioEvento, x: ExtrasDaPresenca): SecaoDoc[] {
  const setores = dados.setores
    .map(s => {
      const pessoas = new Set(s.linhas.map(l => l.funcionarioId)).size
      const diarias = new Set(s.linhas.map(l => `${l.funcionarioId}|${l.dataRef}`)).size
      const semSaida = s.linhas.filter(l => l.entradaISO && !l.saidaISO).length
      const horasMs = s.linhas.reduce((t, l) => t + (l.entradaISO && l.saidaISO ? Math.max(0, new Date(l.saidaISO).getTime() - new Date(l.entradaISO).getTime()) : 0), 0)
      return { ...s, nomeBonito: nomeBonito(s.nome), area: nomeBonito(x.areaDoSetor.get(s.id) ?? ''), pessoas, diarias, semSaida, horasMs }
    })
    .filter(s => s.linhas.length)
    .sort((a, b) => b.pessoas - a.pessoas || a.nomeBonito.localeCompare(b.nomeBonito, 'pt-BR'))

  const totalPessoas = new Set(setores.flatMap(s => s.linhas.map(l => l.funcionarioId))).size
  const totalDiarias = setores.reduce((t, s) => t + s.diarias, 0)
  const totalSemSaida = setores.reduce((t, s) => t + s.semSaida, 0)
  const totalHorasMs = setores.reduce((t, s) => t + s.horasMs, 0)
  const fora = x.foraDoLocal ?? []
  const secoes: SecaoDoc[] = []

  // ── 1. Resumo ────────────────────────────────────────────────────────────────────────────────────────────────
  secoes.push({
    rotulo: 'Presença no período',
    titulo: setores.length ? `${plural(totalPessoas, 'pessoa')} em ${plural(setores.length, 'equipe')}.` : 'Ninguém bateu ponto no período.',
    aviso: {
      destaque: periodoTexto(dados.periodo.de, dados.periodo.ate),
      texto: `${plural(totalDiarias, 'diária')}, ${duracao(totalHorasMs)} trabalhadas`
        + `${totalSemSaida ? `, ${plural(totalSemSaida, 'saída')} faltando` : ', todas com saída'}`
        + `${fora.length ? `, ${plural(fora.length, 'batida')} fora do local` : ''}.`,
    },
    colunas: [
      { titulo: 'Equipe', tipo: 'nome', largura: '33%' },
      { titulo: 'Área', tipo: 'texto', largura: '21%' },
      { titulo: 'Pessoas', tipo: 'numero', largura: '11%' },
      { titulo: 'Diárias', tipo: 'numero', largura: '11%' },
      { titulo: 'Horas', tipo: 'numero', largura: '12%' },
      { titulo: 'Sem saída', tipo: 'destaque', largura: '12%' },
    ],
    linhas: setores.map((s): LinhaDoc => [s.nomeBonito, s.area || '—', s.pessoas, s.diarias, duracao(s.horasMs), s.semSaida || null]),
    vazio: 'Ninguém bateu ponto no período escolhido.',
    novaFolha: true,
  })

  // ── 2. Dias trabalhados por equipe ────────────────────────────────────────────────────────────────────────────
  const dias = [...new Set(setores.flatMap(s => s.linhas.map(l => l.dataRef)))].sort()
  if (setores.length && dias.length) {
    const visiveis = dias.slice(-8)   // até 8 dias cabem lado a lado numa A4 em pé
    const largDia = `${Math.floor(44 / visiveis.length)}%`
    secoes.push({
      rotulo: 'Dias trabalhados por equipe',
      titulo: `${plural(totalDiarias, 'diária')} em ${plural(dias.length, 'dia')}.`,
      aviso: dias.length > visiveis.length
        ? { destaque: `Os ${visiveis.length} últimos dias.`, texto: `O período tem ${dias.length}; o total soma todos.` }
        : { destaque: 'Pessoas que entraram em cada dia.', texto: 'O total é a soma das diárias da equipe.' },
      colunas: [
        { titulo: 'Equipe', tipo: 'nome', largura: '40%' },
        ...visiveis.map(d => ({ titulo: diaCurto(d), tipo: 'numero' as const, largura: largDia })),
        { titulo: 'Total', tipo: 'destaque', largura: '12%' },
      ],
      linhas: setores.map((s): LinhaDoc => {
        const porDia = new Map<string, Set<string>>()
        for (const l of s.linhas) porDia.set(l.dataRef, (porDia.get(l.dataRef) ?? new Set()).add(l.funcionarioId))
        return [s.nomeBonito, ...visiveis.map(d => porDia.get(d)?.size || null), s.diarias]
      }),
      novaFolha: true,
    })
  }

  // ── 3. Fora do local ──────────────────────────────────────────────────────────────────────────────────────────
  secoes.push({
    rotulo: 'Batidas fora do local',
    titulo: x.foraDoLocal == null ? 'O evento não tem local marcado no mapa.'
      : fora.length ? `${plural(fora.length, 'batida')} fora do local.` : 'Nenhuma batida fora do local.',
    aviso: {
      destaque: 'Só entra o que tem prova.',
      texto: `Posição do aparelho com precisão de até 100 m, fora do raio${x.raioM ? ` de ${x.raioM.toLocaleString('pt-BR')} m` : ''} do evento. Localização aproximada não conta.`,
    },
    colunas: [
      { titulo: 'Quando', tipo: 'texto', largura: '13%' },
      { titulo: 'Pessoa', tipo: 'nome', largura: '23%' },
      { titulo: 'Equipe', tipo: 'texto', largura: '18%' },
      { titulo: 'Etapa', tipo: 'texto', largura: '9%' },
      { titulo: 'Distância', tipo: 'numero', largura: '12%' },
      { titulo: 'Batida', tipo: 'destaque', largura: '11%' },
      { titulo: 'Registrou', tipo: 'texto', largura: '14%' },
    ],
    linhas: [...fora].sort((a, b) => a.quando.localeCompare(b.quando)).map((l): LinhaDoc => [
      diaEHora(l.quando), l.funcionarioNome, nomeBonito(l.setorNome ?? ''), l.tipo ? ETAPA[l.tipo] : '—',
      l.distanciaM != null ? (l.distanciaM >= 1000 ? `${(l.distanciaM / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${l.distanciaM} m`) : '—',
      l.situacao === 'registrada' ? 'valeu' : 'recusada', l.quemRegistrou,
    ]),
    vazio: x.foraDoLocal == null ? 'Marque o local do evento no mapa (Editar evento) para conferir.' : 'Nenhuma batida com GPS fora do raio no período.',
    novaFolha: true,
  })

  // ── 4. Cada equipe: cada pessoa, cada dia ─────────────────────────────────────────────────────────────────────
  let primeiraEquipe = true
  for (const s of setores) {
    const linhas = [...s.linhas].sort((a, b) => a.dataRef.localeCompare(b.dataRef) || a.nome.localeCompare(b.nome, 'pt-BR') || (a.entradaISO ?? '').localeCompare(b.entradaISO ?? ''))
    // O meio vai na linha (bloco) em que caiu; quem saiu e voltou no dia tem uma linha por bloco.
    const meioDaLinha = new Map<number, string[]>()
    const porPessoaDia = new Map<string, number[]>()
    linhas.forEach((l, i) => { const k = `${l.funcionarioId}|${l.dataRef}`; porPessoaDia.set(k, [...(porPessoaDia.get(k) ?? []), i]) })
    for (const [k, idx] of porPessoaDia) {
      for (const m of x.meiosDoDia.get(k) ?? []) {
        const alvo = idx.find(i => { const l = linhas[i]; return (!l.entradaISO || l.entradaISO <= m) && (!l.saidaISO || m <= l.saidaISO) }) ?? idx[0]
        meioDaLinha.set(alvo, [...(meioDaLinha.get(alvo) ?? []), m])
      }
    }
    const semMeio = linhas.filter((l, i) => !meioDaLinha.has(i) && l.entradaISO && x.pedeMeio(s.id, l.dataRef)
      && (porPessoaDia.get(`${l.funcionarioId}|${l.dataRef}`) ?? []).every(j => !meioDaLinha.has(j))).length
    const faltas = [s.semSaida ? plural(s.semSaida, 'saída') : null, semMeio ? plural(semMeio, 'meio') : null].filter(Boolean).join(' e ')
    secoes.push({
      rotulo: s.area ? `Equipe · ${s.area}` : 'Equipe',
      titulo: `${s.nomeBonito}: ${plural(s.pessoas, 'pessoa')}, ${plural(s.diarias, 'diária')}, ${duracao(s.horasMs)}.`,
      aviso: faltas ? { destaque: `Faltando: ${faltas}.`, texto: 'Em laranja na tabela — corrija em Lançar ponto antes de fechar o pagamento.' } : undefined,
      colunas: [
        { titulo: 'Dia', tipo: 'texto', largura: '8%' },
        { titulo: 'Pessoa', tipo: 'nome', largura: '31%' },
        { titulo: 'Função', tipo: 'texto', largura: '15%' },
        { titulo: 'Entrada', tipo: 'numero', largura: '11%' },
        { titulo: 'Meio', tipo: 'numero', largura: '12%' },
        { titulo: 'Saída', tipo: 'numero', largura: '12%' },
        { titulo: 'Horas', tipo: 'numero', largura: '11%' },
      ],
      linhas: linhas.map((l, i): LinhaDoc => {
        const meios = meioDaLinha.get(i)
        const irmas = porPessoaDia.get(`${l.funcionarioId}|${l.dataRef}`) ?? []
        const meio: CelulaDoc = meios?.length ? meios.sort().map(hora).join(' · ')
          : (l.entradaISO && x.pedeMeio(s.id, l.dataRef) && irmas.every(j => !meioDaLinha.has(j)) && irmas[0] === i) ? { valor: 'sem meio', destaque: true } : null
        return [
          diaCurto(l.dataRef),
          l.nome,
          l.funcao || '—',
          l.entradaISO ? hora(l.entradaISO) : { valor: 'sem entrada', destaque: true },
          meio,
          l.saidaISO ? hora(l.saidaISO) : { valor: 'sem saída', destaque: true },
          l.entradaISO && l.saidaISO ? duracao(new Date(l.saidaISO).getTime() - new Date(l.entradaISO).getTime()) : null,
        ]
      }),
      novaFolha: primeiraEquipe,
    })
    primeiraEquipe = false
  }
  return secoes
}

/** O avesso: quem está na equipe e NÃO bateu nada no período ("Quem NÃO credenciou"). */
export function montarAusentes(dados: DadosRelatorioEvento, areaDoSetor: Map<string, string>): SecaoDoc[] {
  const setores = dados.setores
    .map(s => ({ ...s, nomeBonito: nomeBonito(s.nome), area: nomeBonito(areaDoSetor.get(s.id) ?? '') }))
    .filter(s => s.ausentes.length)
    .sort((a, b) => b.ausentes.length - a.ausentes.length || a.nomeBonito.localeCompare(b.nomeBonito, 'pt-BR'))
  const total = setores.reduce((t, s) => t + s.ausentes.length, 0)
  const secoes: SecaoDoc[] = [{
    rotulo: 'Quem não credenciou',
    titulo: total ? `${plural(total, 'pessoa')} sem nenhuma batida em ${plural(setores.length, 'equipe')}.` : 'Todo mundo bateu ponto.',
    aviso: { destaque: periodoTexto(dados.periodo.de, dados.periodo.ate), texto: 'Estão na equipe e não registraram entrada, meio nem saída no período.' },
    colunas: [
      { titulo: 'Equipe', tipo: 'nome', largura: '44%' },
      { titulo: 'Área', tipo: 'texto', largura: '28%' },
      { titulo: 'Sem batida', tipo: 'destaque', largura: '14%' },
      { titulo: 'Parcela', tipo: 'barra', largura: '14%' },
    ],
    linhas: setores.map((s): LinhaDoc => {
      const equipe = new Set([...s.linhas.map(l => l.funcionarioId), ...s.ausentes.map(a => a.funcionarioId)]).size
      return [s.nomeBonito, s.area || '—', s.ausentes.length, equipe ? s.ausentes.length / equipe : 0]
    }),
    vazio: 'Ninguém da equipe ficou sem bater ponto no período.',
    novaFolha: true,
  }]
  for (const s of setores) {
    secoes.push({
      rotulo: s.area ? `Equipe · ${s.area}` : 'Equipe',
      titulo: `${s.nomeBonito}: ${plural(s.ausentes.length, 'pessoa')} sem batida.`,
      colunas: [
        { titulo: 'Pessoa', tipo: 'nome', largura: '60%' },
        { titulo: 'Função', tipo: 'texto', largura: '40%' },
      ],
      linhas: [...s.ausentes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((a): LinhaDoc => [a.nome, a.funcao || '—']),
    })
  }
  return secoes
}
