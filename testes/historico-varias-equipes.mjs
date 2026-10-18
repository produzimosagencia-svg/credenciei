/*
 * QUEM TRABALHOU EM MAIS DE UMA EQUIPE NO MESMO EVENTO (Juan, 18/10/2026: "quando eu tiver uma pessoa que trabalhou
 * numa equipe um dia e em outra equipe em outro, preciso que isso tenha no relatório dela que a gente exporta e tenha
 * isso no histórico dele dentro do sistema"). Caso real: Maicon e Breno, LUAN — LIMPEZA no dia 17, LEO SAMORA a
 * partir do dia 18 (baixa numa, cadastro na outra).
 *
 * Roda com: node testes/historico-varias-equipes.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · o histórico junta os cadastros do mesmo CPF no evento')
const hist = ler('lib/historico.ts')
ok(/\.eq\('cpf', func\.cpf as string\)\s*\.eq\('fornecedores\.evento_id', evento\.id\)\s*\.neq\('id', funcionarioId\)/.test(hist), 'busca as outras fichas do mesmo CPF, só deste evento')
ok((hist.match(/\.in\('funcionario_id', ids\)/g) ?? []).length === 2, 'batidas e pausas de todas as fichas')
ok(/fichaId: ficha,\s*equipe: fichas\.get\(ficha\) \?\? setor\.nome,\s*outraEquipe: ficha !== funcionarioId,/.test(hist), 'cada dia diz a ficha e a equipe de onde vêm as batidas')
ok(/diasEscalados: datasEscaladas\.size,\s*diasTrabalhados: datasTrabalhadas\.size,/.test(hist), 'dia com batida em duas equipes conta como UM dia trabalhado')
ok(/historicoDoFuncionario\(funcionarioId, \{ outrasEquipes: false \}\)/.test(ler('lib/encarregado-consulta.ts')), 'encarregado continua vendo só o setor dele')

console.log('\n2 · a tela do histórico')
const tela = ler('components/HistoricoBatidas.tsx')
ok(/\{variasEquipes && <th>Equipe<\/th>\}/.test(tela) && /h\.dias\.some\(d => d\.outraEquipe\)/.test(tela), 'coluna "Equipe" quando há dia de outra equipe')
ok(/Trabalhou em mais de uma equipe neste evento/.test(tela), 'aviso com os dias de cada equipe')
ok(/apagarBatida\(editando\.fichaId,/.test(tela) && /lancarPontoManual\(editando\.fichaId,/.test(tela) && !/h\.funcionarioId, editando/.test(tela), 'corrigir/apagar vai para a ficha DAQUELE dia, não para a aberta')
ok(/podeEditar=\{podeEditar && !\(role === 'supervisor' && d\.outraEquipe\)\}/.test(tela), 'supervisor não ganha lápis no dia da outra equipe')
ok(/key=\{`\$\{d\.data\}-\$\{d\.fichaId\}`\}/.test(tela), 'duas linhas no mesmo dia (duas equipes) não colidem')

console.log('\n3 · o relatório (aba Pagamento) — conferido de verdade em testes/relatorio-planilha.mjs')
const rel = ler('lib/relatorio-excel.ts')
ok(/diasPorFornecedor: \{ fornecedor: string; dias: string\[\] \}\[\]/.test(rel) && /\{ v: textoDosDias\(p\) \}/.test(rel), '"Quais dias" com a equipe de cada dia')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
