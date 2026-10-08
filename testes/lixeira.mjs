/*
 * LIXEIRA DE FUNCIONÁRIOS + AUDITORIA QUE ACHA QUEM FOI EXCLUÍDO (08/10/2026, VITAL).
 *   - toda exclusão guarda antes uma cópia completa; o master restaura com o MESMO QR;
 *   - a busca da auditoria por nome/CPF acha o excluído (o nome dele só fica no texto da linha);
 *   - a auditoria grava a organização a partir do evento (o admin passa a ver as exclusões).
 *
 * Roda com: node testes/lixeira.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const excluir = acoes.slice(acoes.indexOf('export async function deletarFuncionario'), acoes.indexOf('Valor que este funcionário deve receber'))
const lixeira = ler('lib/lixeira.ts')
const restaurar = ler('lib/actions-lixeira.ts')
const ia = ler('lib/ia/ferramentas/funcionarios.ts')
const sql = ler('supabase/upgrade-lixeira-funcionarios.sql')

console.log('Antes de excluir, a cópia')
ok(excluir.indexOf('guardarNaLixeira(') > 0 && excluir.indexOf('guardarNaLixeira(') < excluir.indexOf(".from('funcionarios').delete()"), 'a tela guarda a cópia ANTES de apagar')
ok(ia.indexOf('guardarNaLixeira(') > 0 && ia.indexOf('guardarNaLixeira(') < ia.indexOf(".from('funcionarios').delete()"), 'o assistente de IA também')
for (const t of ['registros', 'funcionario_dias', 'biometria_templates', 'veiculos']) ok(lixeira.includes(`'${t}'`), `a cópia leva ${t}`)
ok(/dados: linha/.test(lixeira), 'a linha inteira do funcionário é guardada (mesmo id e mesmo token do QR)')

console.log('\nRestaurar')
ok(/if \(!perfil \|\| !ehMaster\(perfil\.role\)\) return \{ erro/.test(restaurar), 'só o master restaura')
ok(/from\('funcionarios'\)\.insert\(dados\)/.test(restaurar), 'a pessoa volta com os mesmos dados (mesmo QR)')
ok(restaurar.indexOf('jaTem?.length') < restaurar.indexOf(".insert(dados)"), 'se o CPF já foi recadastrado no evento, não restaura por cima')
ok(/if \(copia\.restaurado_em\)/.test(restaurar), 'não restaura duas vezes')
ok(!/throw new Error/.test(restaurar), 'não lança erro (a tela recebe a mensagem)')
ok(/enable row level security/.test(sql) && /update alteracoes_cadastro a\s+set organizacao_id = e\.organizacao_id/.test(sql), 'migração: tabela fechada (RLS) e auditoria antiga ganha a organização')

console.log('\nAuditoria')
const obter = acoes.slice(acoes.indexOf('export async function obterAuditoria'), acoes.indexOf('export async function obterAuditoria') + 6000)
ok(/valor_anterior\.ilike\.\$\{valor\},valor_novo\.ilike\.\$\{valor\}/.test(obter), 'a busca por nome/CPF também procura no texto da linha (onde fica o excluído)')
ok(/formatCpf\(digitosNome\)/.test(obter) && /`"%\$\{alvo/.test(obter), 'CPF digitado com 11 dígitos é procurado formatado, entre aspas (tem ponto)')
ok(/organizacaoId = \(ev\?\.organizacao_id/.test(ler('lib/auditoria.ts')), 'a auditoria grava a organização do evento quando ela não vem')
ok(/Restaurar esta pessoa/.test(ler('app/admin/auditoria/page.tsx')), 'a linha de exclusão tem o atalho para restaurar (master)')
ok(/\/admin\/excluidos/.test(ler('components/AppShell.tsx')), 'menu "Excluídos" para o master')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
