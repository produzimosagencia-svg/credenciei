import { plural, type SecaoDoc, type LinhaDoc } from './relatorio-doc'
import type { DadosEntregaValor } from './entrega-valor'

/**
 * O PDF de ENTREGA DE VALOR no padrão do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026) — o mesmo conteúdo
 * do PDF antigo (lib/entrega-valor-pdf.ts): números principais, presença, segurança, operação e o fechamento "O que o
 * Credenciei somou ao seu evento". Vai para o cliente final.
 */
const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (parte: number, todo: number) => (todo > 0 ? parte / todo : 0)
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const colunas = [
  { titulo: 'Indicador', tipo: 'nome' as const, largura: '58%' },
  { titulo: 'Total', tipo: 'destaque' as const, largura: '18%' },
  { titulo: 'Parcela', tipo: 'barra' as const, largura: '24%' },
]

export function montarEntregaValorDoc(d: DadosEntregaValor): SecaoDoc[] {
  const p = d.presenca
  const s = d.seguranca
  const turnos = p.completos + p.soEntrada + p.saidaSemEntrada
  const periodo = d.periodo ? (d.periodo.de === d.periodo.ate ? dia(d.periodo.de) : `${dia(d.periodo.de)} a ${dia(d.periodo.ate)}`) : null

  const e = d.economia
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  // A primeira página: quanto o controle de ponto economizou (Juan, 13/10/2026).
  const economia: SecaoDoc[] = e ? [{
    rotulo: 'Economia com o Credenciei',
    titulo: `Com o Credenciei, você economizou ${brl(e.valor)}.`,
    aviso: {
      destaque: `${brl(e.valorDiaria)} por pessoa, o valor médio da diária.`,
      texto: `Nas equipes pagas por pessoa (as que batem o meio), ${plural(e.faltaram, 'pessoa cadastrada', 'pessoas cadastradas')} não ${e.faltaram === 1 ? 'bateu' : 'bateram'} nenhuma entrada no período. Sem o controle de ponto, ${e.faltaram === 1 ? 'ela seria paga' : 'elas seriam pagas'} pela lista.`,
    },
    colunas,
    linhas: [
      ['Pessoas cadastradas (equipes pagas por pessoa)', e.cadastrados, 1],
      ['Bateram entrada', e.foram, pct(e.foram, e.cadastrados)],
      ['Não compareceram', e.faltaram, pct(e.faltaram, e.cadastrados)],
      ['Valor médio da diária', brl(e.valorDiaria), null],
      ['Economia', brl(e.valor), null],
    ] as LinhaDoc[],
    novaFolha: true,
  }] : []

  return [
    ...economia,
    {
      rotulo: 'Entrega de valor',
      titulo: `${plural(d.cadastros.total, 'pessoa cadastrada', 'pessoas cadastradas')}, ${n(p.pessoasQueTrabalharam)} trabalharam.`,
      aviso: {
        destaque: [periodo, d.diasDeOperacao ? plural(d.diasDeOperacao, 'dia de operação', 'dias de operação') : null].filter(Boolean).join(' · ') + '.',
        texto: `Este relatório mostra o que o Credenciei entregou no ${d.eventoNome}: cada pessoa da equipe cadastrada e aprovada, conferida no portão e registrada na entrada e na saída, com rastro de tudo o que aconteceu.`,
      },
      colunas,
      linhas: [
        ['Pessoas cadastradas', d.cadastros.total, 1],
        ['Pessoas aprovadas para trabalhar', d.cadastros.aprovados, pct(d.cadastros.aprovados, d.cadastros.total)],
        ['Pessoas que trabalharam', p.pessoasQueTrabalharam, pct(p.pessoasQueTrabalharam, d.cadastros.aprovados || d.cadastros.total)],
        ['Turnos com entrada e saída corretas', `${p.percentualCompletos.toLocaleString('pt-BR')}%`, p.percentualCompletos / 100],
        ['Acessos barrados no portão', s.barradasNoPortao, pct(s.barradasNoPortao, s.leiturasNoPortao)],
      ] as LinhaDoc[],
      novaFolha: !e,
    },
    {
      rotulo: 'Presença sob controle',
      titulo: `${p.percentualCompletos.toLocaleString('pt-BR')}% dos turnos com entrada e saída corretas.`,
      aviso: { destaque: 'Cada turno é uma pessoa num dia de trabalho.', texto: `${plural(turnos, 'turno')} no evento, ${n(p.horasRegistradas)} horas de trabalho registradas.` },
      colunas,
      linhas: [
        ['Turnos com entrada e saída registradas corretamente', p.completos, pct(p.completos, turnos)],
        ['Turnos só com a entrada (saída não registrada)', p.soEntrada, pct(p.soEntrada, turnos)],
        ['Registros com problema (saída sem entrada)', p.saidaSemEntrada, pct(p.saidaSemEntrada, turnos)],
        ['Horas de trabalho registradas', p.horasRegistradas, null],
        ['Batidas de ponto registradas', p.batidas, null],
        ['Regularizadas pela equipe de credenciamento', p.regularizadasPelaEquipe, pct(p.regularizadasPelaEquipe, p.batidas)],
        ['Pelo próprio celular, fora do horário da portaria', p.peloCelular, pct(p.peloCelular, p.batidas)],
      ] as LinhaDoc[],
    },
    {
      rotulo: 'Segurança e controle de acesso',
      titulo: `${plural(s.barradasNoPortao, 'acesso barrado', 'acessos barrados')} no portão.`,
      aviso: { destaque: 'O portão confere cada credencial.', texto: 'QR inválido, cadastro não aprovado, dia fora da escala, setor lotado ou fora do local: a entrada não passa.' },
      colunas,
      linhas: [
        ['Leituras de credencial no portão', s.leiturasNoPortao, 1],
        ['Acessos barrados no portão', s.barradasNoPortao, pct(s.barradasNoPortao, s.leiturasNoPortao)],
        ['Por QR inválido ou sem cadastro aprovado', s.qrInvalidoOuSemCadastro, pct(s.qrInvalidoOuSemCadastro, s.barradasNoPortao)],
        ['Fora do dia de trabalho ou com o setor lotado', s.foraDoDiaOuLotado, pct(s.foraDoDiaOuLotado, s.barradasNoPortao)],
        ['Tentativas de bater o ponto fora do local do evento', s.tentativasForaDoLocal, null],
        ['Batidas fora do local separadas para conferência', s.batidasForaDoLocal, null],
        ['CPFs bloqueados no evento', s.cpfsBloqueados, null],
        ['Credenciamentos negados', d.cadastros.negados, pct(d.cadastros.negados, d.cadastros.total)],
      ] as LinhaDoc[],
      novaFolha: true,
    },
    {
      rotulo: 'Operação',
      titulo: `${plural(d.fornecedores, 'fornecedor', 'fornecedores')}, ${plural(d.supervisores, 'supervisor', 'supervisores')}.`,
      colunas,
      linhas: [
        ['Fornecedores', d.fornecedores, null],
        ['Supervisores', d.supervisores, null],
        ['Pessoas aprovadas para trabalhar', d.cadastros.aprovados, pct(d.cadastros.aprovados, d.cadastros.total)],
        ['Alterações registradas na auditoria', d.alteracoesAuditadas, null],
      ] as LinhaDoc[],
    },
    {
      rotulo: 'O que o Credenciei somou ao seu evento',
      titulo: 'Controle total do que acontece no evento.',
      aviso: {
        destaque: `Com o Credenciei, o ${d.eventoNome} teve controle sobre ${plural(d.cadastros.total, 'pessoa cadastrada', 'pessoas cadastradas')} e ${n(p.pessoasQueTrabalharam)} que trabalharam.`,
        texto: `${e ? `O controle de ponto evitou pagar ${plural(e.faltaram, 'pessoa', 'pessoas')} que não ${e.faltaram === 1 ? 'compareceu' : 'compareceram'}, uma economia de ${brl(e.valor)}. ` : ''}${p.percentualCompletos.toLocaleString('pt-BR')}% dos turnos tiveram entrada e saída registradas corretamente. O sistema barrou ${n(s.barradasNoPortao)} acessos no portão e ${n(s.tentativasForaDoLocal)} tentativas de registro fora do local, evitando fraudes e garantindo que quem entrou no evento foi para trabalhar. O foco do Credenciei é dar controle total do que acontece no seu evento: quem entrou, por onde, a que hora e por quanto tempo ficou.`,
      },
      colunas: [],
      linhas: [],
      semTabela: true,
    },
  ]
}
