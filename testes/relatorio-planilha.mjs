/*
 * A PLANILHA QUE FECHA O PAGAMENTO (Juan, 12–13/10/2026): os sete itens aprovados ("pode fazer") — meio e horas,
 * aba Pagamento, o que foi lançado à mão, CPF e área, fora do local com prova, faltas em laranja, baixa marcada — mais
 * "senti falta do registro dos horários da batida do meio" e "preciso que tenha junto na linha o dia da semana".
 *
 * Monta as linhas (lib/relatorio-linhas.ts) e as planilhas (lib/relatorio-excel.ts) de verdade, no Node, com dados de
 * exemplo, e confere célula por célula.
 *
 * Roda com: node testes/relatorio-planilha.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const aqui = dirname(fileURLToPath(import.meta.url))
const lib = f => readFileSync(join(aqui, '..', 'lib', f), 'utf8')

// Os arquivos importam sem extensão (ok pro Next, não pro Node): copia pra uma pasta dentro do projeto e ajusta os caminhos.
const pasta = join(aqui, '..', '.tmp-teste-relatorio-planilha')
rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true })
for (const f of ['tz.ts', 'marca-relatorio.ts', 'geo-local.ts', 'alerta-batida.ts']) writeFileSync(join(pasta, f), lib(f))
writeFileSync(join(pasta, 'relatorio-linhas.ts'), lib('relatorio-linhas.ts').replace("from './geo-local'", "from './geo-local.ts'").replace("from './alerta-batida'", "from './alerta-batida.ts'"))
writeFileSync(join(pasta, 'relatorio-excel.ts'), lib('relatorio-excel.ts').replace("from './tz'", "from './tz.ts'").replace("from './marca-relatorio'", "from './marca-relatorio.ts'").replace("await import('exceljs')", "(await import('exceljs')).default"))
const { linhasDoSetor, textoDoLancamento } = await import(join(pasta, 'relatorio-linhas.ts'))
const { montarPlanilhaCompleta, montarPlanilhaSetor, montarPlanilhaSubevento, montarLinhasPagamento, diaDaSemana } = await import(join(pasta, 'relatorio-excel.ts'))
const ExcelJS = (await import('exceljs')).default

// ── O cenário ───────────────────────────────────────────────────────────────────────────────────────────────────
// Local do evento e um ponto a ~2,2 km dele (0,02° de latitude).
const local = { latitude: -20.3, longitude: -40.3, raioM: 800 }
const ctx = { local, comMeio: new Set(['s1']), diasMeio: { ok: true, dias: new Set(['2026-10-10', '2026-10-11']) } }
const t = (dia, hhmm) => `${dia}T${hhmm}:00-03:00`
const iso = (dia, hhmm) => new Date(t(dia, hhmm)).toISOString()
let n = 0
const reg = (f, tipo, dia, hhmm, extra = {}) => ({ id: `r${++n}`, funcionario_id: f, tipo, data_ref: dia, created_at: iso(dia, hhmm), ...extra })
const funcionarios = [
  { id: 'ana', nome: 'Ana Lima', cargo: 'Supervisor', cpf: '52998224725', descredenciado_em: null },
  { id: 'bia', nome: 'Bia Souza', cargo: '', cpf: '11144477735', descredenciado_em: '2026-10-11T15:00:00Z' },
  { id: 'caio', nome: 'Caio Reis', cargo: 'Segurança', cpf: '39053344705', descredenciado_em: null },
  { id: 'davi', nome: 'Davi Prado', cargo: 'Segurança', cpf: '12345678909', descredenciado_em: null },
]
const registros = [
  // Ana: leitor na entrada (operador), meio pelo celular, saída lançada à mão; 12/10 (montagem, não pede meio).
  reg('ana', 'entrada', '2026-10-10', '15:00', { criado_por_perfil_id: 'op1' }),
  reg('ana', 'meio', '2026-10-10', '19:00', { foto_url: 'x.jpg' }),
  { ...reg('ana', 'fim', '2026-10-10', '03:00', { registro_manual: true, criado_por_perfil_id: 'juan', justificativa: 'esqueceu de bater' }), created_at: iso('2026-10-11', '03:00') },
  reg('ana', 'entrada', '2026-10-12', '08:00', { criado_por_perfil_id: 'op1' }),
  reg('ana', 'fim', '2026-10-12', '17:30', { criado_por_perfil_id: 'op1' }),
  // Bia: entrada pelo "Registrar ponto" (com foto, motivo padrão), sem meio, sem saída — e com baixa.
  reg('bia', 'entrada', '2026-10-10', '14:00', { registro_manual: true, foto_url: 'f.jpg', criado_por_perfil_id: 'sup1', justificativa: 'Batida registrada por supervisor devido à ausência de registro pelo colaborador.' }),
  // Caio: saiu e voltou no mesmo dia (dois blocos); o meio das 10h é do primeiro bloco; a volta foi pelo Registrar ponto.
  reg('caio', 'entrada', '2026-10-10', '08:00', { criado_por_perfil_id: 'op1' }),
  reg('caio', 'meio', '2026-10-10', '10:00', { foto_url: 'y.jpg' }),
  reg('caio', 'fim', '2026-10-10', '23:00', { criado_por_perfil_id: 'op1' }),
  // Davi: entrada a ~2,2 km com GPS de 20 m (prova) e saída longe mas com localização aproximada (±500 m, não prova).
  reg('davi', 'entrada', '2026-10-10', '16:00', { criado_por_perfil_id: 'op1', latitude: -20.28, longitude: -40.3, precisao_m: 20 }),
  reg('davi', 'meio', '2026-10-10', '20:00', { foto_url: 'z.jpg' }),
  reg('davi', 'fim', '2026-10-10', '23:30', { latitude: -20.0, longitude: -40.3, precisao_m: 500 }),
]
const porFuncionario = new Map()
for (const r of registros) porFuncionario.set(r.funcionario_id, [...(porFuncionario.get(r.funcionario_id) ?? []), r])
const pausas = new Map([['caio', [{ funcionario_id: 'caio', data_ref: '2026-10-10', saiu_em: iso('2026-10-10', '12:00'), voltou_em: iso('2026-10-10', '18:00'), origem: 'assistido', registrado_por: 'sup1' }]]])

const montadas = linhasDoSetor(funcionarios, porFuncionario, pausas, { id: 's1', nome: 'GILMAR - SEGURANÇA' }, ctx)
const nomes = new Map([['juan', 'Juan Muzy'], ['sup1', 'Lucy Santos']])
for (const x of montadas) x.linha.lancamentos = x.lancamentos.map(l => textoDoLancamento(l, nomes))
const linhas = montadas.map(x => x.linha)
const de = (f, dia) => linhas.filter(l => l.funcionarioId === f && l.dataRef === dia)

console.log('As linhas (lib/relatorio-linhas.ts)')
const ana10 = de('ana', '2026-10-10')[0]
ok(ana10.meiosISO.length === 1 && ana10.entradaISO && ana10.saidaISO && !ana10.semMeio, 'o MEIO entra na linha (Ana, 19h)')
ok(ana10.origem === 'manual' && ana10.lancamentos[0] === 'Saída: lançada à mão por Juan Muzy — esqueceu de bater', 'saída lançada à mão: quem e o motivo — ' + ana10.lancamentos[0])
ok(de('ana', '2026-10-12')[0].semMeio === false, 'dia de montagem (12/10) não pede o meio: não marca "sem meio"')
const bia = de('bia', '2026-10-10')[0]
ok(bia.semMeio === true && !bia.saidaISO && bia.origem === 'registrar', 'Bia: sem meio, sem saída, entrada pelo Registrar ponto')
ok(bia.lancamentos[0] === 'Entrada: Registrar ponto (com foto) por Lucy Santos', 'o texto padrão do Registrar ponto não vira "motivo" — ' + bia.lancamentos[0])
ok(bia.baixaEm === '2026-10-11T15:00:00Z', 'a baixa vem na linha (as batidas continuam no relatório)')
const caio = de('caio', '2026-10-10')
ok(caio.length === 2 && caio[0].meiosISO.length === 1 && caio[1].meiosISO.length === 0, 'saiu e voltou: duas linhas, o meio das 10h fica no primeiro bloco')
ok(!caio[0].semMeio && !caio[1].semMeio, 'com um meio no dia, o segundo bloco não vira "sem meio" (a régua do PDF)')
ok(caio[1].origem === 'registrar' && caio[1].lancamentos[0] === 'Volta ao trabalho: Registrar ponto (com foto) por Lucy Santos', 'a volta ao trabalho pelo Registrar ponto também aparece')
const davi = de('davi', '2026-10-10')[0]
ok(davi.foraDoLocal.length === 1 && /^Entrada a 2,2 km$/.test(davi.foraDoLocal[0]), 'fora do local só com prova: a entrada a 2,2 km (GPS de 20 m) — ' + davi.foraDoLocal.join(' · '))
ok(!davi.foraDoLocal.some(x => x.startsWith('Saída')), 'a saída longe mas com localização aproximada (±500 m) não conta')
ok(ana10.cpf === '52998224725', 'o CPF vem na linha')

// ── As planilhas ────────────────────────────────────────────────────────────────────────────────────────────────
const pessoa = (f, extra = {}) => ({ funcionarioId: f.id, nome: f.nome, cpf: f.cpf, funcao: f.cargo ?? '', chavePix: null, valorReceber: null, pago: false, pagoEm: null, baixaEm: f.descredenciado_em, ...extra })
const s1 = {
  id: 's1', nome: 'GILMAR - SEGURANÇA', area: 'MUVUKA / PEGA / FERVÔ', linhas, ausentes: [],
  pessoas: funcionarios.map(f => pessoa(f, f.id === 'ana' ? { chavePix: 'ana@pix', valorReceber: 300, pago: true, pagoEm: '2026-10-13T12:00:00Z' } : {})),
}
// A Ana (mesmo CPF) também é supervisora de outro fornecedor: no pagamento, aparece UMA vez.
const anaS2 = { ...ana10, funcionarioId: 'ana2', setor: 'GOTE - LIMPEZA', dataRef: '2026-10-11', entradaISO: iso('2026-10-11', '09:00'), saidaISO: iso('2026-10-11', '18:00'), meiosISO: [iso('2026-10-11', '13:00')], lancamentos: [], origem: 'normal', semMeio: false }
const s2 = { id: 's2', nome: 'GOTE - LIMPEZA', area: 'GERAL', linhas: [anaS2], ausentes: [{ funcionarioId: 'eva', nome: 'Eva Nunes', setor: 'GOTE - LIMPEZA', funcao: '', cpf: '98765432100', baixaEm: null }], pessoas: [{ ...pessoa(funcionarios[0]), funcionarioId: 'ana2', valorReceber: 200 }] }
const dados = { eventoId: 'e1', eventoNome: 'VITAL', organizacaoNome: 'Navista', periodo: { de: '2026-10-08', ate: '2026-10-13' }, setores: [s1, s2] }

const ler = async wb => { const l = new ExcelJS.Workbook(); await l.xlsx.load(await wb.xlsx.writeBuffer()); return l }
const completo = await ler(await montarPlanilhaCompleta(dados, null))
const abas = completo.worksheets.map(w => w.name)
console.log('\nO relatório completo')
ok(JSON.stringify(abas.slice(0, 3)) === '["Resumo Geral","Pagamento","Todas as batidas"]' && abas.includes('GILMAR - SEGURANÇA') && abas.includes('GOTE - LIMPEZA'), 'abas: Resumo Geral, Pagamento, Todas as batidas e uma por fornecedor — ' + abas.join(' | '))

let vazias = 0
for (const w of completo.worksheets) w.eachRow(r => r.eachCell(c => { if (c.value === '') vazias++ }))
ok(vazias === 0, 'nenhuma célula com texto vazio (o "16"/"128" do visualizador do ChatGPT)')

const acharLinha = (ws, teste) => { let achada = null; ws.eachRow((r, i) => { if (!achada && teste(r.values)) achada = { r, i } }); return achada }
const cabecalho = ws => acharLinha(ws, v => v.includes('Dia da semana'))
const aba = completo.getWorksheet('GILMAR - SEGURANÇA')
const cab = cabecalho(aba)
const col = titulo => cab.r.values.indexOf(titulo)
ok(['Data', 'Dia da semana', 'Área', 'Função', 'Nome', 'CPF', 'Entrada', 'Meio', 'Saída', 'Horas', 'Situação', 'Origem', 'Quem lançou e motivo', 'Fora do local (com prova de GPS)'].every(t => col(t) > 0),
  'colunas: data, DIA DA SEMANA, área, função, nome, CPF, entrada, MEIO, saída, HORAS, situação, origem, quem lançou e motivo, fora do local')
const linhaDe = (ws, nome, dia) => acharLinha(ws, v => v.includes(nome) && v.some(x => x instanceof Date && x.toISOString().startsWith(dia)))
const lAna = linhaDe(aba, 'Ana Lima', '2026-10-10').r
ok(lAna.getCell(col('Dia da semana')).value === 'Sábado' && lAna.getCell(col('Meio')).value === '19:00' && lAna.getCell(col('Saída')).value === '03:00', 'Ana, sábado: entrada 15:00, meio 19:00, saída 03:00')
const horas = lAna.getCell(col('Horas'))
// O arquivo guarda o NÚMERO (0,5 = 12h); o exceljs, ao ler de volta uma célula com formato de hora, devolve um Date.
const emDias = v => (v instanceof Date ? (v.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000 : v)
ok(Math.abs(emDias(horas.value) * 24 - 12) < 1e-9 && horas.numFmt === '[h]:mm', 'horas como NÚMERO do Excel (12h = 0,5 dia, formato [h]:mm)')
ok(lAna.getCell(col('CPF')).value === '529.982.247-25' && lAna.getCell(col('Área')).value === 'MUVUKA / PEGA / FERVÔ', 'CPF formatado e a área (subgrupo) na linha')
ok(lAna.getCell(col('Origem')).value === 'Lançada à mão' && /Juan Muzy — esqueceu de bater/.test(lAna.getCell(col('Quem lançou e motivo')).value), 'origem e quem lançou, com o motivo')
const lBia = linhaDe(aba, 'Bia Souza', '2026-10-10').r
const laranja = c => c.fill?.fgColor?.argb === 'FFFDE3D7'
ok(lBia.getCell(col('Saída')).value === 'sem saída' && laranja(lBia.getCell(col('Saída'))), '"sem saída" em laranja')
ok(lBia.getCell(col('Meio')).value === 'sem meio' && laranja(lBia.getCell(col('Meio'))), '"sem meio" em laranja')
ok(/Sem saída · Sem meio · Baixa em 11\/10\/2026/.test(lBia.getCell(col('Situação')).value) && laranja(lBia.getCell(col('Situação'))), 'a situação junta as faltas e a baixa — ' + lBia.getCell(col('Situação')).value)
ok(lBia.getCell(col('Nome')).font?.color?.argb === 'FF9CA3AF', 'quem está com baixa fica em cinza (e continua no relatório)')
ok(linhaDe(aba, 'Davi Prado', '2026-10-10').r.getCell(col('Fora do local (com prova de GPS)')).value === 'Entrada a 2,2 km', 'fora do local na linha, só com prova')
const resumoSetor = acharLinha(aba, v => v.includes('Sem meio') && v.includes('Pessoas'))
ok(!!resumoSetor && resumoSetor.r.values.includes('Horas (decimal)'), 'o resumo por função tem pessoas, entradas, saídas, sem saída, sem meio e horas')
const totalSetor = acharLinha(aba, v => v[1] === 'TOTAL')
ok(!!totalSetor && /^\d+h\d{2}$/.test(totalSetor.r.values[7]) && typeof totalSetor.r.values[8] === 'number', 'total de horas em texto ("686h05", igual em qualquer leitor) e em número decimal — ' + totalSetor?.r.values[7])

const pag = completo.getWorksheet('Pagamento')
const cabPag = acharLinha(pag, v => v.includes('Chave PIX'))
const colP = titulo => cabPag.r.values.indexOf(titulo)
console.log('\nA aba Pagamento')
let linhasAna = 0; pag.eachRow(r => { if (r.values.includes('Ana Lima')) linhasAna++ })
ok(linhasAna === 1, 'a Ana (mesmo CPF em dois fornecedores) aparece UMA vez')
const pAna = acharLinha(pag, v => v.includes('Ana Lima')).r
ok(pAna.getCell(colP('Fornecedor')).value === 'GILMAR - SEGURANÇA, GOTE - LIMPEZA' && pAna.getCell(colP('Dias trabalhados')).value === 3, 'com os dois fornecedores e os 3 dias (10, 11 e 12/10)')
// Trabalhou em duas equipes (Juan, 18/10/2026: "preciso que isso tenha no relatório dela"): a equipe de cada dia.
ok(pAna.getCell(colP('Quais dias')).value === 'GILMAR - SEGURANÇA: 10/10 sáb, 12/10 seg · GOTE - LIMPEZA: 11/10 dom', 'duas equipes: os dias de cada uma, com o dia da semana — ' + pAna.getCell(colP('Quais dias')).value)
const pCaio = acharLinha(pag, v => v.includes('Caio Reis')).r
ok(!/:/.test(String(pCaio.getCell(colP('Quais dias')).value)) && /sáb/.test(String(pCaio.getCell(colP('Quais dias')).value)), 'uma equipe só: a lista simples de dias, sem o nome da equipe — ' + pCaio.getCell(colP('Quais dias')).value)
const pAnaLinha = montarLinhasPagamento([s1, s2]).find(p => p.nome === 'Ana Lima')
ok(JSON.stringify(pAnaLinha.diasPorFornecedor) === JSON.stringify([{ fornecedor: 'GILMAR - SEGURANÇA', dias: ['2026-10-10', '2026-10-12'] }, { fornecedor: 'GOTE - LIMPEZA', dias: ['2026-10-11'] }]), 'diasPorFornecedor: a equipe do primeiro dia vem primeiro')
ok(pAna.getCell(colP('Valor a receber')).value === 500 && pAna.getCell(colP('Pago')).value === 'Parcial', 'valor somado (300 + 200) e "Parcial" (pago num cadastro só)')
ok(pAna.getCell(colP('Chave PIX')).value === 'ana@pix', 'chave PIX do cadastro')
const pBia = acharLinha(pag, v => v.includes('Bia Souza')).r
ok(pBia.getCell(colP('Pendências')).value === '1 sem saída · 1 sem meio' && laranja(pBia.getCell(colP('Pendências'))), 'pendências em laranja: resolver antes de pagar')
ok(pBia.getCell(colP('Baixa')).value instanceof Date, 'a baixa também no pagamento')
let evaNoPagamento = false; pag.eachRow(r => { if (r.values.includes('Eva Nunes')) evaNoPagamento = true })
ok(!evaNoPagamento, 'quem não bateu nada no período não entra no pagamento')
ok(montarLinhasPagamento([s1, s2]).length === 4, 'quatro pessoas trabalharam (Ana, Bia, Caio, Davi)')

const todas = completo.getWorksheet('Todas as batidas')
ok(cabecalho(todas).r.values.includes('Fornecedor') && !!linhaDe(todas, 'Ana Lima', '2026-10-11'), '"Todas as batidas": todos os fornecedores numa tabela só, com a coluna do fornecedor')

const geral = completo.getWorksheet('Resumo Geral')
ok(!!acharLinha(geral, v => v.includes('GILMAR - SEGURANÇA') && v.includes('MUVUKA / PEGA / FERVÔ')), 'o Resumo Geral traz a área de cada fornecedor')

console.log('\nO relatório de um fornecedor e o do subgrupo')
const umSetor = await ler(await montarPlanilhaSetor({ ...dados, setores: [s1] }, s1, null))
ok(JSON.stringify(umSetor.worksheets.map(w => w.name)) === '["GILMAR - SEGURANÇA","Pagamento"]', 'fornecedor: a aba dele e a de Pagamento')
ok(/RELATÓRIO — GILMAR - SEGURANÇA · MUVUKA \/ PEGA \/ FERVÔ/.test(umSetor.worksheets[0].getCell(2, 1).value), 'o título leva o subgrupo (há fornecedores com o mesmo nome em subgrupos diferentes)')
const sub = {
  eventoId: 'e1', eventoNome: 'VITAL', organizacaoNome: 'Navista', subeventoNome: 'MUVUKA', periodo: dados.periodo,
  setores: [{ id: 's1', nome: 'GILMAR - SEGURANÇA', previsto: 10, supervisores: [], pessoas: [] }],
  setoresRelatorio: [s1],
}
const subWb = await ler(await montarPlanilhaSubevento(sub, null))
const batidasSub = subWb.getWorksheet('Batidas')
ok(cabecalho(batidasSub)?.r.values.includes('Meio') && cabecalho(batidasSub).r.values.includes('Horas') && !!linhaDe(batidasSub, 'Bia Souza', '2026-10-10'), 'subgrupo: a aba Batidas é a mesma do completo (dia da semana, meio, horas, situação, origem)')
ok(!!subWb.getWorksheet('Pagamento'), 'subgrupo: com a aba Pagamento')
ok(diaDaSemana('2026-10-13') === 'Terça', 'o dia da semana sai da data, sem fuso (13/10/2026 = terça)')

// Telas e servidor
const srv = lib('relatorios.ts')
ok(/\.in\('tipo', \['entrada', 'meio', 'fim'\]\)/.test(srv) && /carregarSetores\(eventoId, idsSetores, periodo\)/.test(srv), 'o servidor busca o meio e monta o subgrupo com as mesmas linhas')
ok(/comColunasTolerantes\(COLUNAS_PAUSA/.test(srv) && /meio_em/.test(srv), 'tolerante: sem a coluna nova (meio por bloco), a pausa é lida sem ela')

const tela = readFileSync(join(aqui, '..', 'app/admin/eventos/[id]/relatorios/ExportarRelatorio.tsx'), 'utf8')
ok(/obterDadosRelatorioEvento\(eventoId, periodo, \{ soComMeio: true \}\)/.test(tela) && /Exportar só equipes com batida de meio/.test(tela) && /if \(opcoes\.soComMeio\) consulta = consulta\.eq\('exige_meio', true\)/.test(srv),
  'botão "Exportar só equipes com batida de meio": o completo recortado nos fornecedores que pedem o meio (Juan, 13/10/2026)')

// O portão não barra mais por escala nem por limite do dia (Juan, 18/10/2026): a batida entra MARCADA — e a feita sem
// internet chega depois, com a hora em que foi lida. As duas vão na Situação, em laranja.
console.log('\nBatida com aviso e batida feita sem internet')
{
  const { situacaoDaLinha } = await import(join(pasta, 'relatorio-excel.ts'))
  const regs = new Map([['eva', [
    reg('eva', 'entrada', '2026-10-10', '09:00', { alerta: 'fora_da_escala,acima_do_limite' }),
    reg('eva', 'fim', '2026-10-10', '17:00', { recebido_em: iso('2026-10-10', '18:30') }),
  ]]])
  const [m] = linhasDoSetor([{ id: 'eva', nome: 'Eva Nunes', cargo: null }], regs, new Map(), { id: 's9', nome: 'BAR' }, ctx)
  ok(JSON.stringify(m.linha.avisos) === JSON.stringify(['Entrada fora da escala', 'Entrada acima do limite do dia', 'Saída feita sem internet']), 'os avisos da linha: ' + JSON.stringify(m.linha.avisos))
  const sit = situacaoDaLinha(m.linha)
  ok(/fora da escala/.test(sit.texto) && sit.faltas.length === 3, 'na Situação, para pintar de laranja — ' + sit.texto)
  const [semAviso] = linhasDoSetor([{ id: 'eva', nome: 'Eva Nunes', cargo: null }], new Map([['eva', [reg('eva', 'entrada', '2026-10-10', '09:00', { recebido_em: iso('2026-10-10', '09:00') })]]]), new Map(), { id: 's9', nome: 'BAR' }, ctx)
  ok(!semAviso.linha.avisos, 'batida normal (recebida na hora): sem aviso nenhum')
}

// LUAN, 19/10/2026: saída lançada à mão às 01:10 do MESMO dia (horas zeradas, "OK") e a saída do dia anterior batida
// na manhã seguinte (23h). As duas vão em laranja, na linha e no Pagamento.
console.log('\nSaída que não fecha a conta')
{
  const { situacaoDaLinha } = await import(join(pasta, 'relatorio-excel.ts'))
  const base = { funcionarioId: 'x', nome: 'X', setor: 'S', funcao: '', dataRef: '2026-10-17', cpf: '11122233344' }
  const invertida = { ...base, entradaISO: iso('2026-10-17', '11:38'), saidaISO: iso('2026-10-17', '01:10') }
  const longa = { ...base, dataRef: '2026-10-15', entradaISO: iso('2026-10-15', '09:05'), saidaISO: iso('2026-10-16', '08:22') }
  const normal = { ...base, entradaISO: iso('2026-10-17', '08:00'), saidaISO: iso('2026-10-18', '00:30') }
  ok(situacaoDaLinha(invertida).faltas.includes('Saída antes da entrada'), 'saída antes da entrada: em laranja')
  ok(situacaoDaLinha(longa).faltas.some(f => /^Turno de 23h — conferir a saída$/.test(f)), 'turno de 23h: em laranja — ' + situacaoDaLinha(longa).texto)
  ok(situacaoDaLinha(normal).texto === 'OK', 'turno de 16h30 até a madrugada (o dia do show): OK')
  const [pag] = montarLinhasPagamento([{ id: 's', nome: 'S', linhas: [invertida, longa, normal], ausentes: [] }])
  ok(pag.conferir === 2, 'no Pagamento: 2 saídas para conferir')
  const pdf = lib('relatorio-doc-presenca.ts')
  ok(/if \(ms < 0\) return \{ valor: 'saída antes da entrada', destaque: true \}/.test(pdf) && /horasDaLinha\(l\),/.test(pdf), 'no PDF: nada de horas negativas ("-11h-28")')
}

rmSync(pasta, { recursive: true, force: true })
console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
