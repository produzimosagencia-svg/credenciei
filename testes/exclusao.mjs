/*
 * EXCLUIR DA EQUIPE NÃO APAGA QUEM JÁ BATEU PONTO (08/10/2026, VITAL). Um supervisor excluiu da equipe
 * alguém que tinha registrado a ENTRADA de manhã: excluir leva as batidas junto e mata o QR — a pessoa seguiu
 * trabalhando com um QR "inválido" e sumiu do sistema.
 *
 * 11/10/2026 (Juan): "quando excluir uma pessoa da equipe, ela ainda precisa estar no relatório, o histórico de batida
 * dela... dar baixa na equipe e liberar uma nova vaga". Agora NINGUÉM apaga quem já tem batida, nem o master: excluir
 * vira BAIXA (o "Tirar da equipe") — a ficha e as batidas ficam no relatório, o QR para de valer e a vaga volta.
 * E o "Funcionários do evento" nunca diminui: quem foi apagado (sem batida) vem da lixeira.
 *
 * Roda com: node testes/exclusao.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const corpo = acoes.slice(acoes.indexOf('export async function deletarFuncionario'), acoes.indexOf('Valor que este funcionário deve receber'))
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
const ia = ler('lib/ia/ferramentas/funcionarios.ts')

console.log('Na tela do fornecedor')
ok(/const \{ data: batidas, error: erroBatidas \} = await db\.from\('registros'\)/.test(corpo) && !/if \(!ehMaster\(perfil\.role\)\) \{\s*const \{ data: batidas/.test(corpo),
  'antes de apagar, confere se a pessoa tem batida — pra TODO mundo, master inclusive')
ok(corpo.indexOf("from('registros')") < corpo.indexOf(".delete().eq('id', id)"), 'a conferência vem ANTES do delete')
ok(/if \(erroBatidas\) throw/.test(corpo), 'se a conferência falhar, não apaga (na dúvida, preserva)')
ok(/if \(batidas\?\.length\) \{\s*await descredenciarFuncionario\(id, fornecedorId, eventoId,[\s\S]{0,140}\)\s*return \{ baixa: true, nome: alvo\.nome as string \}/.test(corpo),
  'quem já bateu ponto recebe BAIXA (o "Tirar da equipe") em vez de ser apagado')
ok(/Promise<\{ error\?: string; baixa\?: boolean; nome\?: string \}>/.test(corpo) && /return \{ error: mensagemAmigavel\(e\) \}/.test(corpo), 'a ação devolve o erro em vez de lançar (o Next esconderia a mensagem em produção)')
ok(/const r = await deletarFuncionario\(f\.id, fornecedorId, eventoId\)/.test(tabela) && /if \(r\?\.error\) \{ setErroAtivacao\(r\.error\); return \}/.test(tabela), 'a tela mostra a recusa no aviso do topo da tabela')
ok(/if \(r\?\.baixa\) setErroAtivacao\(/.test(tabela) && /as batidas continuam no relatório/.test(tabela), 'e avisa quando virou baixa')
ok(/titulo="Excluir da equipe"/.test(tabela) && !/nem aparece mais em relatório nenhum/.test(tabela), 'o aviso de confirmação não promete mais apagar as batidas')

console.log('\nNo assistente de IA')
ok(!/perfil\.role !== 'master'/.test(ia) && /const temBatidas = \(registros \?\? 0\) > 0/.test(ia), 'o assistente também não apaga quem tem batida, nem pro master')
ok(ia.indexOf('if (temBatidas) {') < ia.indexOf(".from('funcionarios').delete()") && /update\(\{ descredenciado_em: new Date\(\)\.toISOString\(\), descredenciado_por: perfil\.id \}\)/.test(ia),
  '… dá baixa antes de chegar no delete')

console.log('\nA baixa libera a vaga')
const escala = ler('lib/escala.ts'), importacao = ler('lib/importacao.ts'), pedidos = ler('lib/actions-pedidos-setor.ts')
ok(/\.or\('origem\.is\.null,origem\.neq\.supervisor'\)\s*\.is\('descredenciado_em', null\)\s*if \(\(count \?\? 0\) >= cota\)/.test(acoes), 'cadastro pelo link: a quantidade do setor não conta quem recebeu baixa')
ok(/\.is\('descredenciado_em', null\)\s*let restante/.test(importacao), 'planilha: idem')
ok(/\.is\('descredenciado_em', null\)\s*const combinado/.test(pedidos), 'pedido de mais colaboradores: idem')
ok((escala.match(/f\.status_credenciamento === 'negado' \|\| f\.descredenciado_em\) continue/g) ?? []).length === 2, 'limite por dia (aprovação e planilha): quem recebeu baixa devolve o dia')
ok(/\.is\('funcionarios\.descredenciado_em', null\)/.test(escala), 'limite por dia no portão: idem')

console.log('\n"Funcionários do evento" nunca diminui')
const lixeira = ler('lib/lixeira.ts'), paginaEvento = ler('app/admin/eventos/[id]/page.tsx')
ok(/export async function cadastrosSoNaLixeira/.test(lixeira) && /\.is\('restaurado_em', null\)/.test(lixeira) && /!aindaNoEvento\.has\(c\)/.test(lixeira),
  'quem foi apagado e não voltou (CPF distinto, fora de quem ainda tem ficha) vem da lixeira')
ok(/const cadastradosNoEvento = totalFuncionarios \+ await cadastrosSoNaLixeira\(id\)/.test(paginaEvento) && /label="Funcionários do evento" value=\{cadastradosNoEvento\}/.test(paginaEvento),
  'o cartão soma os dois')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
