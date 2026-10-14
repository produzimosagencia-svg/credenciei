import { plural, type SecaoDoc, type LinhaDoc } from './relatorio-doc'
import type { DadosEconomiaFaltas } from './economia-faltas'

/**
 * As páginas internas do PDF de ECONOMIA COM FALTAS (docs/economia-faltas-vital.pdf, Juan, 14/10/2026) — a capa escura
 * fica em components/relatorio-doc/CapaEconomia.tsx. Três partes: faltas e economia por equipe; quem não foi, equipe
 * por equipe, com a área de cada pessoa; e o fechamento "N pessoas × R$ 200".
 */
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function montarEconomiaDoc(d: DadosEconomiaFaltas): SecaoDoc[] {
  const comFalta = d.equipes.filter(e => e.faltaram > 0)
  const verde = (v: string) => ({ valor: v, verde: true })
  const secoes: SecaoDoc[] = [{
    rotulo: 'Faltas e economia por equipe',
    titulo: `${plural(d.faltaram, 'falta')} em ${plural(comFalta.length, 'equipe')}.`,
    aviso: {
      destaque: `Cada pessoa cadastrada que não bateu entrada vale ${brl(d.valorDiaria)} economizados.`,
      texto: `Equipes pagas por pessoa (as que batem o meio). Só pessoas aprovadas; quem saiu da equipe sem nunca bater não conta.`,
    },
    colunas: [
      { titulo: 'Equipe', tipo: 'nome', largura: '40%' },
      { titulo: 'Cadastrados', tipo: 'numero', largura: '14%' },
      { titulo: 'Foram', tipo: 'numero', largura: '12%' },
      { titulo: 'Faltaram', tipo: 'numero', largura: '12%' },
      { titulo: `Economia (${brl(d.valorDiaria)} cada)`, tipo: 'numero', largura: '22%' },
    ],
    linhas: [
      ...d.equipes.map((e): LinhaDoc => [e.nome, e.cadastrados, e.foram, e.faltaram ? { valor: e.faltaram, destaque: true } : 0, e.faltaram ? verde(brl(e.economia)) : null]),
      ['Total', d.cadastrados, d.foram, { valor: d.faltaram, destaque: true }, verde(brl(d.economia))],
    ],
    vazio: 'Nenhuma equipe paga por pessoa (com batida de meio) neste evento.',
    novaFolha: true,
  }]

  if (comFalta.length) {
    secoes.push({
      rotulo: 'Quem não foi · por equipe e área',
      titulo: 'Pessoas cadastradas sem nenhuma entrada no período.',
      colunas: [], linhas: [], semTabela: true, novaFolha: true,
    })
  }
  comFalta.forEach(e => {
    secoes.push({
      rotulo: '',
      titulo: `${e.nome} · ${plural(e.faltaram, 'falta')} · ${brl(e.economia)}`,
      tituloPequeno: true,
      colunas: [
        { titulo: 'Pessoa', tipo: 'nome', largura: '65%' },
        { titulo: 'Área', tipo: 'texto', largura: '35%' },
      ],
      linhas: e.ausentes.map((a): LinhaDoc => [a.nome, a.area || '—']),
    })
  })

  const periodo = d.periodo ? ` de ${d.periodo.de.slice(8, 10)}/${d.periodo.de.slice(5, 7)} a ${d.periodo.ate.slice(8, 10)}/${d.periodo.ate.slice(5, 7)}` : ''
  secoes.push({
    rotulo: 'Economia com o Credenciei',
    titulo: `${plural(d.faltaram, 'pessoa')} × ${brl(d.valorDiaria)}`,
    valorGrande: brl(d.economia),
    aviso: {
      destaque: 'Valor que deixou de ser pago',
      texto: `por pessoas cadastradas que não bateram entrada no ${d.eventoNome}${periodo}, em ${plural(comFalta.length, 'equipe')}.`,
    },
    colunas: [
      { titulo: 'Equipe', tipo: 'nome', largura: '60%' },
      { titulo: 'Faltaram', tipo: 'numero', largura: '18%' },
      { titulo: 'Economia', tipo: 'destaque', largura: '22%' },
    ],
    linhas: [...comFalta.map((e): LinhaDoc => [e.nome, e.faltaram, brl(e.economia)]), ['Total', d.faltaram, brl(d.economia)]],
    vazio: 'Ninguém faltou no período.',
    novaFolha: true,
  })
  return secoes
}
