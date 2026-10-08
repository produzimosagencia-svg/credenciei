/*
 * MAIS DE UMA FUNÇÃO POR PESSOA (regra de 07/10/2026) — o CPF pode ter várias
 * funções e a pessoa troca de perfil clicando na foto do usuário.
 *
 * Roda com: node testes/funcoes.mjs   (Node 24 lê .ts direto)
 */
import { readFileSync } from 'node:fs'
import { podeReceberFuncaoExtra, destinoDaFuncao, FUNCOES_EXTRAS, COOKIE_FUNCAO } from '../lib/funcoes.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const grupo = t => console.log(`\n\x1b[1m${t}\x1b[0m`)
const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

grupo('1 · Quem pode combinar')
ok(['supervisor', 'operador_portao', 'encarregado'].every(r => FUNCOES_EXTRAS.includes(r)) && FUNCOES_EXTRAS.length === 3, 'só supervisor, Gestor de credenciamento e Encarregado podem ser função EXTRA')
ok(['supervisor', 'operador_portao', 'encarregado', 'admin', 'gerente', 'cliente'].every(podeReceberFuncaoExtra), 'quem tem uma dessas funções (ou é administrador) pode receber uma extra')
ok(!podeReceberFuncaoExtra('master') && !podeReceberFuncaoExtra('suporte') && !podeReceberFuncaoExtra('produtor') && !podeReceberFuncaoExtra(null), 'master, suporte e produtor são identidades próprias: não recebem nem se misturam')
ok(destinoDaFuncao('encarregado') === '/encarregado' && destinoDaFuncao('supervisor') === '/admin' && destinoDaFuncao('operador_portao') === '/admin', 'trocar leva pra casca certa de cada função')

grupo('2 · O servidor vale UMA função por vez, e só a que a pessoa tem')
const sb = ler('lib/supabase-server.ts')
ok(sb.includes('funcoes.find(f => f.role === escolhida) ?? funcoes[0]'), 'a escolha (cookie) só vale se for uma função que a pessoa TEM; senão cai na base')
ok(sb.includes('data.role = ativa.role') && sb.includes('data.organizacao_id = ativa.organizacaoId'), 'o resto do sistema lê perfil.role já como a função ATIVA — cada checagem vale pra uma função só')
ok(/if \(ativa\.role !== 'supervisor'\) data\.fornecedor_id = null/.test(sb), 'fora do supervisor não existe "setor aberto agora"')
ok(sb.indexOf('data.role = ativa.role') < sb.indexOf('excecoesDePermissao(data.organizacao_id'), 'as permissões da organização são lidas da organização da função ATIVA')
const troca = ler('lib/actions-funcoes.ts')
ok(troca.includes("funcoes.find(f => f.role === chave)") && troca.includes("if (!escolhida) return { erro: 'Você não tem este perfil.' }"), 'trocar de perfil recusa função que a pessoa não tem')
ok(troca.includes("acao: 'TROCA_DE_PERFIL'") && !/throw new Error/.test(troca), 'a troca fica na auditoria e a ação devolve { erro } (nada lança)')
ok(ler('lib/funcoes.ts').includes(`'${COOKIE_FUNCAO}'`), 'cookie próprio da função escolhida')

grupo('3 · Encarregado continua só-leitura quando é função extra')
ok(sb.includes('data.organizacao_id = ativa.organizacaoId') && ler('lib/actions-encarregado.ts').includes("garantirFuncaoExtra(perfilId, 'encarregado', null)"), 'a função Encarregado nasce SEM organização — ao trocar, a organização da outra função não vaza')

grupo('4 · Os cadastros aceitam a combinação')
const a = ler('lib/actions.ts')
ok(a.includes("garantirFuncaoExtra(perfilId, 'supervisor', orgDoSetor)"), 'virar supervisor: quem já tem outra função ganha a de supervisor como extra')
ok(a.includes("garantirFuncaoExtra(existente.id, 'operador_portao', organizacaoId)"), 'virar Gestor de credenciamento: idem')
ok(!a.includes('SUPERVISOR_NAO_E_GESTOR'), 'a regra antiga "supervisor não pode ser Gestor" saiu')
const interno = ler('lib/internos-servidor.ts')
ok(/export async function garantirFuncaoExtra/.test(interno) && interno.includes('MSG_FUNCAO_NAO_COMBINA'), 'dar a função extra recusa master/suporte/produtor com a frase pronta')
ok(!/^\s*['"]use server['"]/.test(interno), 'o ajudante que grava a função não é endpoint público')

grupo('5 · A tela')
ok(ler('components/AppShell.tsx').includes('ListaDePerfis') && ler('components/AppShell.tsx').includes('Trocar de perfil'), 'o menu da foto do usuário tem "Trocar de perfil" (só aparece com mais de uma função)')
ok(ler('app/encarregado/layout.tsx').includes('MenuTrocarPerfil'), 'a área do Encarregado também (senão quem entra como Encarregado não volta pra outra função)')
const ui = ler('components/TrocarPerfil.tsx')
ok(ui.includes('window.location.assign(r.destino)'), 'depois de trocar, recarrega inteiro (menu, telas e casca mudam com a função)')
const sql = ler('supabase/upgrade-funcoes-multiplas.sql')
ok(/check \(role in \('supervisor', 'operador_portao', 'encarregado'\)\)/.test(sql) && sql.includes('unique (perfil_id, role)') && sql.includes('enable row level security'), 'banco: só as três funções, uma vez por pessoa, com RLS')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
