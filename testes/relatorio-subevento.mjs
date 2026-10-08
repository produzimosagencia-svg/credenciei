/*
 * RELATÓRIO COMPLETO DO SUBEVENTO (pedido do Juan, 08/10/2026) — monta a planilha de verdade (exceljs,
 * no Node) a partir de dados de exemplo e confere as abas, os números e quem aparece em "Faltam aprovar".
 *
 * Roda com: node testes/relatorio-subevento.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const aqui = dirname(fileURLToPath(import.meta.url))
const lib = f => readFileSync(join(aqui, '..', 'lib', f), 'utf8')

// O arquivo do Excel importa './tz' e './marca-relatorio' sem extensão (ok pro Next, não pro Node):
// copia pra uma pasta de trabalho dentro do projeto (pra achar o exceljs) e ajusta só os caminhos.
const pasta = join(aqui, '..', '.tmp-teste-relatorio-subevento')   // fora de node_modules: o Node não tira tipos de lá
rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true })
for (const f of ['tz.ts', 'marca-relatorio.ts']) writeFileSync(join(pasta, f), lib(f))
writeFileSync(join(pasta, 'relatorio-excel.ts'), lib('relatorio-excel.ts').replace("from './tz'", "from './tz.ts'").replace("from './marca-relatorio'", "from './marca-relatorio.ts'").replace("await import('exceljs')", "(await import('exceljs')).default"))   // exceljs é CommonJS: no Node o construtor vem em .default
const { montarPlanilhaSubevento } = await import(join(pasta, 'relatorio-excel.ts'))
const ExcelJS = (await import('exceljs')).default

const pessoa = (id, nome, situacao, extra = {}) => ({ id, nome, cpf: '000.000.000-00', telefone: '(27) 90000-0000', funcao: 'Segurança', situacao, ativo: true, diasSolicitados: ['2026-10-10', '2026-10-11'], diasAprovados: situacao === 'autorizado' ? ['2026-10-10'] : [], batidas: [], ...extra })
const dados = {
  eventoId: 'e1', eventoNome: 'VITAL', organizacaoNome: 'Org', subeventoNome: 'BLOCO',
  periodo: { de: '2026-10-10', ate: '2026-10-11' },
  setores: [
    { id: 's1', nome: 'GILMAR - SEGURANÇA', previsto: 10, supervisores: [{ nome: 'Lucy Santos', telefone: '(27) 98888-0000' }],
      pessoas: [
        pessoa('p1', 'Ana Lima', 'autorizado', { batidas: [{ dia: '2026-10-10', entradaISO: '2026-10-10T20:05:00-03:00', meioISO: null, saidaISO: '2026-10-11T04:10:00-03:00' }] }),
        pessoa('p2', 'Bruno Costa', 'pre_autorizado'),
        pessoa('p3', 'Carla Dias', 'negado'),
      ] },
    { id: 's2', nome: 'GOTE - LIMPEZA', previsto: null, supervisores: [],
      pessoas: [pessoa('p4', 'Diego Reis', 'pre_autorizado'), pessoa('p5', 'Eva Nunes', 'autorizado')] },
  ],
}

const wb = await montarPlanilhaSubevento(dados, null)
const buffer = await wb.xlsx.writeBuffer()
const lido = new ExcelJS.Workbook(); await lido.xlsx.load(buffer)
const nomes = lido.worksheets.map(w => w.name)
ok(JSON.stringify(nomes.slice(0, 5)) === JSON.stringify(['Resumo Geral', 'Faltam aprovar', 'Equipe', 'Batidas', 'Supervisores']), 'as cinco abas gerais vêm primeiro: ' + nomes.slice(0, 5).join(' | '))
ok(nomes.includes('GILMAR - SEGURANÇA') && nomes.includes('GOTE - LIMPEZA'), 'e depois uma aba por fornecedor do subevento')

const texto = ws => { const t = []; ws.eachRow(r => t.push(r.values.filter(v => v != null).join(' | '))); return t.join('\n') }
const resumo = texto(lido.getWorksheet('Resumo Geral'))
ok(/Pessoas cadastradas: \| 5/.test(resumo), 'o resumo conta 5 pessoas cadastradas')
ok(/Autorizadas: \| 2/.test(resumo), 'o resumo conta 2 autorizadas')
ok(/Pré-autorizadas \(falta aprovar\): \| 2/.test(resumo), 'o resumo conta 2 pré-autorizadas (faltam aprovar)')
ok(/GILMAR - SEGURANÇA \| Lucy Santos \| 10 \| 3 \| 1 \| 1 \| 1/.test(resumo), 'a linha do fornecedor traz supervisor, previsto, cadastrados, autorizados, pré-autorizados e negados')
ok(/TOTAL/.test(resumo), 'tem a linha de total')

const faltam = texto(lido.getWorksheet('Faltam aprovar'))
ok(/Bruno Costa/.test(faltam) && /Diego Reis/.test(faltam) && !/Ana Lima|Eva Nunes|Carla Dias/.test(faltam), '"Faltam aprovar" lista só quem está pré-autorizado')
ok(/10\/10, 11\/10/.test(faltam), 'mostra os dias que a pessoa pediu')

const batidas = texto(lido.getWorksheet('Batidas'))
ok(/Ana Lima/.test(batidas) && /20:05/.test(batidas) && /04:10/.test(batidas), 'a aba de batidas traz os horários de entrada e saída')

const equipe = texto(lido.getWorksheet('Equipe'))
ok(/Autorizado/.test(equipe) && /Pré-autorizado/.test(equipe) && /Negado/.test(equipe), 'a equipe mostra a situação de cada um')
ok(/Lucy Santos/.test(texto(lido.getWorksheet('Supervisores'))), 'a aba de supervisores lista a Lucy')
ok(/Fornecedores sem supervisor: \| GOTE - LIMPEZA/.test(texto(lido.getWorksheet('Supervisores'))), 'avisa quais fornecedores estão sem supervisor')

// Acesso: só quem gerencia o evento inteiro, e o botão só aparece pra eles.
const srv = lib('relatorios.ts'), pagina = readFileSync(join(aqui, '..', 'app/admin/eventos/[id]/subevento/[sid]/page.tsx'), 'utf8')
ok(/if \(acesso\.setoresPermitidos\) return \{ erro: 'O relatório do subevento é só para quem gerencia o evento inteiro\.' \}/.test(srv), 'o servidor recusa supervisor (que só tem o relatório do próprio setor)')
ok(/podeGerenciarEventos\(perfil\) \? <ExportarSubevento/.test(pagina), 'o botão "Extrair relatório do subevento" só aparece para quem gerencia o evento')

rmSync(pasta, { recursive: true, force: true })
console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
