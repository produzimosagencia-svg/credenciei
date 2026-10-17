/*
 * IMPORTAÇÃO: todo erro diz o que fazer (Juan, 16/10/2026: "caso aconteça algum erro na importação, preciso que você
 * retorne uma mensagem para o usuário, para ele saber o que fazer") — e o supervisor da equipe importa nela mesmo
 * com a conta em outra organização (Naiara Abdalla, LUAN, ESG E HIDRATAÇÃO).
 *
 * Roda com: node testes/importacao-mensagens.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

// A leitura de verdade: lib/planilha.ts num diretório à parte, com o xlsx do projeto.
const dir = mkdtempSync(join(tmpdir(), 'planilha-'))
symlinkSync(raiz + 'node_modules', join(dir, 'node_modules'))
writeFileSync(join(dir, 'format.ts'), ler('lib/format.ts'))
writeFileSync(join(dir, 'estrutura-regras.ts'), 'export type LinhaEstrutura = Record<string, unknown>\n')
writeFileSync(join(dir, 'planilha.ts'), ler('lib/planilha.ts').replace("from './format'", "from './format.ts'").replace("from './estrutura-regras'", "from './estrutura-regras.ts'"))
const P = await import(join(dir, 'planilha.ts'))
const XLSX = (await import(join(raiz, 'node_modules/xlsx/xlsx.mjs')))
const arquivo = linhas => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Equipe')
  return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'equipe.xlsx')
}
const erroDe = async f => { try { await P.lerPlanilhaDeEquipe(f); return null } catch (e) { return e } }

console.log('1 · a leitura da planilha explica o problema')
const semTel = await erroDe(arquivo([['Nome', 'CPF'], ['Ana Silva', '09047385748']]))
ok(semTel instanceof P.ErroNaPlanilha && /não tem a coluna Telefone/.test(semTel.message) && /Baixar modelo/.test(semTel.message), `falta uma coluna → diz qual e manda usar o modelo ("${semTel?.message?.slice(0, 60)}…")`)
const semDuas = await erroDe(arquivo([['Nome'], ['Ana Silva']]))
ok(semDuas instanceof P.ErroNaPlanilha && /as colunas CPF e Telefone/.test(semDuas.message), 'faltam duas → "as colunas CPF e Telefone"')
const vazia = await erroDe(arquivo([['Nome', 'CPF', 'Telefone']]))
ok(vazia instanceof P.ErroNaPlanilha && /vazia/.test(vazia.message), 'só os títulos → "a planilha está vazia"')
const lixo = await erroDe(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'quebrado.xlsx'))
ok(lixo instanceof P.ErroNaPlanilha && /Não consegui abrir este arquivo/.test(lixo.message), 'arquivo que não abre → salvar como .xlsx/CSV, tirar senha')
const linhas = await P.lerPlanilhaDeEquipe(arquivo([['Nome', 'CPF', 'Telefone'], ['Ana Silva', '09047385748', '27999999999'], ['', '17893653760', '27988888888'], ['', '', '']]))
ok(linhas.length === 2 && linhas[1].cpf === '17893653760' && !linhas[1].nome, 'linha com CPF e sem nome segue (o servidor diz "sem nome"); linha toda em branco sai')

console.log('\n2 · a tela: cada etapa com a sua mensagem')
const tela = ler('app/admin/eventos/[id]/ImportarFuncionarios.tsx')
ok(/e instanceof ErroNaPlanilha \? e\.message :/.test(tela), 'a leitura mostra a mensagem da planilha')
ok(/A conexão caiu no envio\. Confira a internet e importe a mesma planilha de novo/.test(tela), 'internet caiu no envio → o que fazer (não é mais "Erro ao ler o arquivo")')
ok(/O sistema demorou para responder\. Espere 1 minuto, abra a equipe/.test(tela), 'servidor sem resposta → esperar, conferir a equipe, importar de novo')
ok(/O que fazer: corrija essas linhas na planilha e importe a mesma planilha de novo/.test(tela), 'linhas que ficaram de fora → o que fazer')
ok(!/Erro ao ler o arquivo\.'/.test(tela), 'a mensagem genérica de antes saiu')
ok(/Nada desta planilha foi cadastrado/.test(ler('lib/importacao.ts')) && /quem já entrou não é cadastrado duas vezes/.test(ler('app/api/import/funcionarios/route.ts')), 'erro no servidor também diz o que fazer')

console.log('\n3 · supervisor da equipe com a conta em outra organização importa nela')
const imp = ler('lib/importacao.ts')
ok(/from\('supervisor_setores'\)\.select\('fornecedor_id'\)\s*\.eq\('perfil_id', perfil\.id\)\.eq\('fornecedor_id', fornecedorId\)/.test(imp), 'vale o vínculo com ESTE fornecedor (outra equipe continua recusada)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
