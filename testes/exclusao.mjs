/*
 * EXCLUIR DA EQUIPE NÃO APAGA QUEM JÁ BATEU PONTO (08/10/2026, VITAL). Um supervisor excluiu da equipe
 * alguém que tinha registrado a ENTRADA de manhã: excluir leva as batidas junto e mata o QR — a pessoa seguiu
 * trabalhando com um QR "inválido" e sumiu do sistema. Agora só o master apaga quem já tem batida; os demais
 * usam "Tirar da equipe", que preserva o histórico.
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
ok(/if \(!ehMaster\(perfil\.role\)\) \{\s*const \{ data: batidas, error: erroBatidas \} = await db\.from\('registros'\)/.test(corpo), 'antes de apagar, confere se a pessoa tem batida (menos para o master)')
ok(corpo.indexOf("from('registros')") < corpo.indexOf(".delete().eq('id', id)"), 'a conferência vem ANTES do delete')
ok(/if \(erroBatidas\) throw/.test(corpo), 'se a conferência falhar, não apaga (na dúvida, preserva)')
ok(/Tirar da equipe/.test(corpo.slice(corpo.indexOf('batidas?.length'))), 'a recusa aponta o caminho certo: "Tirar da equipe"')
ok(/Promise<\{ error\?: string \}>/.test(corpo) && /return \{ error: mensagemAmigavel\(e\) \}/.test(corpo), 'a ação devolve o erro em vez de lançar (o Next esconderia a mensagem em produção)')
ok(/const r = await deletarFuncionario\(f\.id, fornecedorId, eventoId\)/.test(tabela) && /if \(r\?\.error\) \{ setErroAtivacao\(r\.error\); return \}/.test(tabela), 'a tela mostra a recusa no aviso do topo da tabela')

console.log('\nNo assistente de IA')
ok(/\(registros \?\? 0\) > 0 && perfil\.role !== 'master'/.test(ia), 'o assistente também recusa apagar quem tem batida (menos para o master)')
ok(ia.indexOf("perfil.role !== 'master'") < ia.indexOf(".from('funcionarios').delete()"), '… antes de apagar')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
