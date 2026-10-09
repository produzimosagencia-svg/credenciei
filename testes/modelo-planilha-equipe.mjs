/*
 * MODELO DA PLANILHA DE EQUIPE = FORMULÁRIO DO EVENTO (pedido do Juan, 09/10/2026): "o modelo de planilha que a
 * gente importa os funcionários ainda tá errado... precisa ter um padrão de acordo com o modelo do evento, das
 * perguntas que tem no formulário que o funcionário preenche".
 *
 * Roda com: node testes/modelo-planilha-equipe.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const rota = ler('app/api/import/modelo/route.ts')
const planilha = ler('lib/planilha.ts')
const importacao = ler('lib/importacao.ts')
const tela = ler('app/admin/eventos/[id]/ImportarFuncionarios.tsx')
const form = ler('app/form/[token]/FormularioFuncionario.tsx')

console.log('1 · o modelo tem as colunas que o Juan pediu (09/10/2026, 2ª volta)')
ok(/\['Nome', 'CPF', 'Telefone', 'Cargo', 'Cidade', 'Chave PIX', \.\.\.colunasDeDia\]/.test(rota), 'Nome, CPF, Telefone, Cargo, Cidade, Chave PIX + uma coluna por dia')
for (const p of ['CPF \\*', 'Nome completo \\*', 'Telefone \\*', 'Cidade onde você mora \\*', 'Chave PIX \\(opcional\\)', 'Dias de trabalho \\*']) {
  ok(new RegExp(`label="${p}"`).test(form), `o formulário pergunta "${p.replace(/\\\\/g, '')}"`)
}
ok(!/'Valor'/.test(rota), 'sem Valor')
ok(/diasDaEscalaDoEvento\(eventoId\)/.test(rota) && /const dias = todosOsDias\n/.test(rota), 'uma coluna para CADA dia do evento ("10 dias, 10 colunas")')
ok(/X ou SIM na coluna do dia/.test(rota) && /Todas as colunas marcadas = trabalha todos os dias/.test(rota), 'a aba "Como preencher" explica X/SIM, vazio e tudo marcado')
const XLSX = createRequire(import.meta.url)('xlsx')
const fixo = XLSX.utils.sheet_to_json(XLSX.readFile(raiz + 'public/modelo-importacao.xlsx').Sheets[XLSX.readFile(raiz + 'public/modelo-importacao.xlsx').SheetNames[0]], { header: 1 })
ok(JSON.stringify(fixo[0]) === JSON.stringify(['Nome', 'CPF', 'Telefone', 'Cargo', 'Cidade', 'Chave PIX', 'Dias de trabalho']) && fixo.length === 1,
  'o arquivo fixo antigo (com linha de exemplo e Valor) virou o formato novo, sem linha de exemplo')
ok(/podeGerenciarEventos\(perfil\) && perfil\.role !== 'supervisor'/.test(rota) && /supervisor_setores/.test(rota), 'só quem pode importar naquele setor baixa o modelo')
ok(/urlDoModelo = `\/api\/import\/modelo\?fornecedor=/.test(tela) && !/modelo-importacao\.xlsx/.test(tela), '"Baixar modelo" usa o modelo gerado (não mais o arquivo fixo)')

console.log('\n2 · a leitura entende os dias')
ok(/export function diasMarcadosNaLinha/.test(planilha), 'colunas de dia ("10/10 sáb · Evento") marcadas com X')
ok(/\/\^dias\( de trabalho\)\?\$\/i/.test(planilha) && /\\btodos\\b/.test(planilha), 'ou uma coluna única "Dias de trabalho" (datas ou "todos")')
ok(/dias: diasMarcadosNaLinha\(linha\)/.test(planilha), 'entra em cada linha')

console.log('\n3 · a importação respeita a escala')
ok(/motivo: 'sem_dias'/.test(importacao), 'linha sem dia não entra (antes entrava aprovada e valia TODO dia no portão)')
ok(/vagasAprovadasPorDia\(fornecedorId\)/.test(importacao) && /motivo: 'dia_lotado'/.test(importacao), 'respeita o limite por dia, descontando linha a linha')
ok(/gravarEscalaAprovada\(\{ funcionarioId: ins\.id as string, eventoId, aprovados: dias/.test(importacao), 'os dias entram aprovados')
ok(/update\(\{ status_credenciamento: 'pendente' \}\)/.test(importacao), 'dia que não gravou: pessoa fica aguardando aprovação (nunca "todo dia")')
ok(/'sem_dias'/.test(tela) && /'dia_lotado'/.test(tela), 'a tela explica por que a linha ficou de fora')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
