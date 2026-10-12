import { plural, type SecaoDoc, type LinhaDoc, type CelulaDoc } from './relatorio-doc'
import { nomeBonito } from './relatorio-doc-fechamento'
import { periodoTexto } from './relatorio-doc-presenca'
import type { RelatorioTravas } from './escala'
import type { DadosRelatorioSubevento } from './relatorios'

/**
 * Limite por dia e Relatório do subgrupo em PDF, no padrão do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026).
 * As planilhas continuam; o PDF é a forma resumida (e completa) de ler e mandar.
 */
const fuso = { timeZone: 'America/Sao_Paulo' } as const
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' })
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const duracao = (ms: number) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60).toLocaleString('pt-BR')}h${String(m % 60).padStart(2, '0')}` }
const SITUACAO: Record<string, string> = { autorizado: 'Autorizado', pre_autorizado: 'Aguardando', negado: 'Negado', descredenciado: 'Baixa' }

// ── Limite por dia ───────────────────────────────────────────────────────────────────────────────────────────────
export function montarLimitesDoc(r: RelatorioTravas): { secoes: SecaoDoc[]; paisagem: boolean } {
  const dias = r.dias.map(d => d.data)
  const paisagem = dias.length > 5
  const semTrava = r.linhas.filter(l => l.situacao === 'sem_trava').length
  const acima = r.linhas.filter(l => l.porDia.some(p => p.maximo != null && p.aprovados > p.maximo)).length
  const largDia = `${Math.floor((paisagem ? 58 : 46) / Math.max(dias.length, 1))}%`
  return {
    paisagem,
    secoes: [{
      rotulo: 'Limite por dia',
      titulo: `${plural(r.linhas.length, 'fornecedor', 'fornecedores')}${semTrava ? `, ${semTrava} sem limite` : ''}.`,
      aviso: { destaque: 'Aprovados / limite em cada dia.', texto: acima ? `${plural(acima, 'fornecedor', 'fornecedores')} com mais aprovados que o limite em algum dia (em laranja).` : 'Nenhum fornecedor passou do limite.' },
      colunas: [
        { titulo: 'Fornecedor', tipo: 'nome', largura: paisagem ? '24%' : '32%' },
        { titulo: 'Supervisor', tipo: 'texto', largura: paisagem ? '18%' : '22%' },
        ...dias.map(d => ({ titulo: diaCurto(d), tipo: 'numero' as const, largura: largDia })),
      ],
      linhas: r.linhas.map((l): LinhaDoc => [
        nomeBonito(l.nome),
        l.supervisores.join(', ') || '—',
        ...dias.map((d): CelulaDoc => {
          const p = l.porDia.find(x => x.data === d)
          if (!p) return null
          const texto = p.maximo != null ? `${p.aprovados}/${p.maximo}` : `${p.aprovados}`
          return p.maximo != null && p.aprovados > p.maximo ? { valor: texto, destaque: true } : texto
        }),
      ]),
      vazio: 'Nenhum fornecedor neste evento.',
      novaFolha: true,
    }],
  }
}

// ── Relatório do subgrupo ────────────────────────────────────────────────────────────────────────────────────────
export function montarSubgrupoDoc(d: DadosRelatorioSubevento): SecaoDoc[] {
  const setores = [...d.setores].sort((a, b) => b.pessoas.length - a.pessoas.length || a.nome.localeCompare(b.nome, 'pt-BR'))
  const todas = setores.flatMap(s => s.pessoas)
  const conta = (sit: string, lista = todas) => lista.filter(p => p.situacao === sit).length
  const entrou = (p: (typeof todas)[number]) => p.batidas.some(b => b.entradaISO)
  const secoes: SecaoDoc[] = []

  secoes.push({
    rotulo: `Subgrupo ${nomeBonito(d.subeventoNome)}`,
    titulo: `${plural(todas.length, 'pessoa')} em ${plural(setores.length, 'fornecedor', 'fornecedores')}.`,
    aviso: {
      destaque: periodoTexto(d.periodo.de, d.periodo.ate),
      texto: `${conta('autorizado')} autorizadas, ${conta('pre_autorizado')} aguardando aprovação, ${conta('negado') + conta('descredenciado')} negadas ou com baixa; ${todas.filter(entrou).length} bateram ponto.`,
    },
    colunas: [
      { titulo: 'Fornecedor', tipo: 'nome', largura: '30%' },
      { titulo: 'Previsto', tipo: 'numero', largura: '11%' },
      { titulo: 'Cadastr.', tipo: 'numero', largura: '11%' },
      { titulo: 'Autoriz.', tipo: 'numero', largura: '11%' },
      { titulo: 'Aguard.', tipo: 'destaque', largura: '11%' },
      { titulo: 'Neg./baixa', tipo: 'numero', largura: '13%' },
      { titulo: 'Entraram', tipo: 'numero', largura: '13%' },
    ],
    linhas: setores.map((s): LinhaDoc => [
      nomeBonito(s.nome), s.previsto, s.pessoas.length, conta('autorizado', s.pessoas), conta('pre_autorizado', s.pessoas) || null,
      conta('negado', s.pessoas) + conta('descredenciado', s.pessoas), s.pessoas.filter(entrou).length,
    ]),
    vazio: 'Este subgrupo ainda não tem fornecedores.',
    novaFolha: true,
  })

  const pendentes = setores.flatMap(s => s.pessoas.filter(p => p.situacao === 'pre_autorizado').map(p => ({ s, p })))
  secoes.push({
    rotulo: 'Quem falta aprovar',
    titulo: pendentes.length ? `${plural(pendentes.length, 'pessoa')} aguardando aprovação.` : 'Ninguém aguardando aprovação.',
    colunas: [
      { titulo: 'Fornecedor', tipo: 'texto', largura: '30%' },
      { titulo: 'Pessoa', tipo: 'nome', largura: '40%' },
      { titulo: 'Dias pedidos', tipo: 'texto', largura: '30%' },
    ],
    linhas: pendentes.map(({ s, p }): LinhaDoc => [nomeBonito(s.nome), p.nome, p.diasSolicitados.map(diaCurto).join(', ') || '—']),
    vazio: 'Todo o subgrupo já foi decidido.',
  })

  const porSupervisor = new Map<string, { telefone: string | null; setores: string[] }>()
  for (const s of setores) for (const sp of s.supervisores) {
    const atual = porSupervisor.get(sp.nome) ?? { telefone: sp.telefone, setores: [] }
    atual.setores.push(nomeBonito(s.nome))
    porSupervisor.set(sp.nome, atual)
  }
  secoes.push({
    rotulo: 'Supervisores',
    titulo: `${plural(porSupervisor.size, 'supervisor', 'supervisores')}.`,
    colunas: [
      { titulo: 'Supervisor', tipo: 'nome', largura: '34%' },
      { titulo: 'Telefone', tipo: 'texto', largura: '18%' },
      { titulo: 'Fornecedores', tipo: 'texto', largura: '48%' },
    ],
    linhas: [...porSupervisor].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([nome, v]): LinhaDoc => [nome, v.telefone ?? '—', v.setores.join(', ')]),
    vazio: 'Nenhum supervisor ligado aos fornecedores deste subgrupo.',
  })

  let primeiro = true
  for (const s of setores) {
    const linhas = s.pessoas.flatMap(p => p.batidas.map(b => ({ p, b })))
      .sort((a, b) => a.b.dia.localeCompare(b.b.dia) || a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
    if (!linhas.length) continue
    const horasMs = linhas.reduce((t, { b }) => t + (b.entradaISO && b.saidaISO ? Math.max(0, new Date(b.saidaISO).getTime() - new Date(b.entradaISO).getTime()) : 0), 0)
    const semSaida = linhas.filter(({ b }) => b.entradaISO && !b.saidaISO).length
    secoes.push({
      rotulo: 'Batidas do fornecedor',
      titulo: `${nomeBonito(s.nome)}: ${plural(linhas.length, 'diária')}, ${duracao(horasMs)}.`,
      aviso: semSaida ? { destaque: `${plural(semSaida, 'saída')} faltando.`, texto: 'Em laranja na tabela.' } : undefined,
      colunas: [
        { titulo: 'Dia', tipo: 'texto', largura: '8%' },
        { titulo: 'Pessoa', tipo: 'nome', largura: '30%' },
        { titulo: 'Situação', tipo: 'texto', largura: '13%' },
        { titulo: 'Entrada', tipo: 'numero', largura: '11%' },
        { titulo: 'Meio', tipo: 'numero', largura: '14%' },
        { titulo: 'Saída', tipo: 'numero', largura: '12%' },
        { titulo: 'Horas', tipo: 'numero', largura: '12%' },
      ],
      linhas: linhas.map(({ p, b }): LinhaDoc => [
        diaCurto(b.dia), p.nome, SITUACAO[p.situacao] ?? p.situacao,
        b.entradaISO ? hora(b.entradaISO) : { valor: 'sem entrada', destaque: true },
        [...(b.meiosAnterioresISO ?? []), ...(b.meioISO ? [b.meioISO] : [])].map(hora).join(' · ') || null,
        b.saidaISO ? hora(b.saidaISO) : (b.entradaISO ? { valor: 'sem saída', destaque: true } : null),
        b.entradaISO && b.saidaISO ? duracao(new Date(b.saidaISO).getTime() - new Date(b.entradaISO).getTime()) : null,
      ]),
      novaFolha: primeiro,
    })
    primeiro = false
  }
  return secoes
}
