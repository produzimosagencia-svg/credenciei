import { plural, type SecaoDoc, type ColunaDoc, type LinhaDoc } from './relatorio-doc'
import type { RelatorioExtra, AbaRelatorio } from './relatorios-extras'

/**
 * Os "Outros relatórios" (Credenciados hoje, Aguardando aprovação, Cadastros, Pedidos de setor, Veículos, Subeventos,
 * CPFs bloqueados, Auditoria) em PDF no padrão do modelo (docs/modelo de relatorio .pdf, Juan, 12/10/2026). Cada aba
 * da planilha vira uma seção: rótulo, frase-resumo com a contagem e a tabela. Tabela larga (mais de 7 colunas) vai em
 * A4 deitada. As planilhas continuam — o PDF é a forma de ler e mandar.
 */
const FRASE: { teste: RegExp; frase: (n: number) => string }[] = [
  { teste: /^aguardando/i, frase: n => `${plural(n, 'cadastro')} aguardando aprovação.` },
  { teste: /^cadastros/i, frase: n => `${plural(n, 'cadastro recebido', 'cadastros recebidos')}.` },
  { teste: /^hoje/i, frase: n => `${plural(n, 'pessoa credenciada', 'pessoas credenciadas')} hoje.` },
  { teste: /^pedidos de setor/i, frase: n => `${plural(n, 'pedido')} de setor.` },
  { teste: /^mais colaboradores/i, frase: n => `${plural(n, 'pedido')} de mais colaboradores.` },
  { teste: /^ve[íi]culos/i, frase: n => `${plural(n, 'veículo cadastrado', 'veículos cadastrados')}.` },
  { teste: /^resumo por subevento/i, frase: n => `${plural(n, 'subevento')}.` },
  { teste: /^por fornecedor/i, frase: n => `${plural(n, 'fornecedor', 'fornecedores')}.` },
  { teste: /^cpfs bloqueados/i, frase: n => `${plural(n, 'CPF bloqueado', 'CPFs bloqueados')}.` },
  { teste: /^auditoria/i, frase: n => `${plural(n, 'alteração', 'alterações')} registradas.` },
]

function fraseDaAba(aba: AbaRelatorio): string {
  return (FRASE.find(f => f.teste.test(aba.nome))?.frase ?? (n => `${plural(n, 'linha')}.`))(aba.linhas.length)
}

/**
 * O PDF é a forma RESUMIDA (as planilhas continuam com tudo): tabela de mais de 9 colunas perde as secundárias, nesta
 * ordem, até caber.
 */
const MAX_COLUNAS = 9
const SECUNDARIAS = [/^telefone$/i, /^cidade$/i, /^motivo/i, /^decidido em$/i, /^ano$/i, /^cor$/i, /condutor$/i, /^tipo$/i, /^cadastro$/i, /^origem$/i, /^cpf do/i]

function enxugar(aba: AbaRelatorio): AbaRelatorio {
  let indices = aba.colunas.map((_, i) => i)
  for (const padrao of SECUNDARIAS) {
    if (indices.length <= MAX_COLUNAS) break
    indices = indices.filter(i => i === 0 || !padrao.test(aba.colunas[i].titulo))
  }
  if (indices.length === aba.colunas.length) return aba
  return { ...aba, colunas: indices.map(i => aba.colunas[i]), linhas: aba.linhas.map(l => indices.map(i => l[i] ?? null)) }
}

/** Coluna de números quando todos os valores preenchidos são números; a primeira é o nome (negrito). */
function colunasDaAba(aba: AbaRelatorio): ColunaDoc[] {
  const soma = aba.colunas.reduce((t, c) => t + (c.largura || 10), 0) || 1
  return aba.colunas.map((c, i) => {
    const valores = aba.linhas.map(l => l[i]).filter(v => v != null && v !== '')
    const numerica = valores.length > 0 && valores.every(v => typeof v === 'number')
    return {
      titulo: c.titulo,
      tipo: i === 0 ? 'nome' : numerica ? 'numero' : 'texto',
      largura: `${((c.largura || 10) / soma * 100).toFixed(1)}%`,
    }
  })
}

export function montarExtra(r: RelatorioExtra): { secoes: SecaoDoc[]; paisagem: boolean } {
  const abas = r.abas.map(enxugar)
  const paisagem = abas.some(a => a.colunas.length > 7)
  const secoes = abas.map((aba, i): SecaoDoc => ({
    rotulo: aba.nome,
    titulo: fraseDaAba(aba),
    aviso: i === 0 ? { destaque: r.titulo.split(' — ')[0] + '.', texto: 'Os dados de agora, do sistema. A planilha, com todas as colunas, continua no botão "Planilha".' } : undefined,
    colunas: colunasDaAba(aba),
    linhas: aba.linhas.map((l): LinhaDoc => l.map(v => (typeof v === 'number' || v == null ? v : String(v)))),
    vazio: 'Nada para mostrar agora.',
    novaFolha: true,
  }))
  return { secoes, paisagem }
}
