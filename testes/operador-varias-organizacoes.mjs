/*
 * A MESMA PESSOA OPERANDO O PORTÃO EM MAIS DE UMA ORGANIZAÇÃO (Juan, 09/10/2026 — caso da Livia, Fatto + Navista:
 * "pode aceitar SIM... precisa ser resolvido pra não acontecer com casos futuros").
 *
 * Roda com: node testes/operador-varias-organizacoes.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
const servidor = ler('lib/supabase-server.ts'), actions = ler('lib/actions.ts'), internos = ler('lib/internos-servidor.ts'), contexto = ler('lib/contexto-eventos.ts')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · criar operador para quem já é operador de outra organização')
ok(!/throw new Error\('Este CPF já está cadastrado em outra organização\.'\)/.test(actions), 'não recusa mais com "já está cadastrado em outra organização"')
ok(/existente\.organizacao_id && existente\.organizacao_id !== organizacaoId\) \{[\s\S]{0,900}garantirFuncaoExtra\(existente\.id, 'operador_portao', organizacaoId\)/.test(actions),
  'ganha o operador desta organização como função extra — a conta (e a primeira organização) não é tocada')
ok(/role !== 'operador_portao' \|\| \(\(perfil\.organizacao_id as string \| null\) \?\? null\) === organizacaoId/.test(internos), 'a função extra não responde "já tinha" só por ser operador de base em outra organização')

console.log('\n2 · usar o portão nas duas, sem trocar de perfil')
ok(/export function organizacoesDoOperador/.test(servidor) && /f\.role === 'operador_portao' && f\.organizacaoId/.test(servidor), 'as organizações do operador: a de base + as extras')
ok(/if \(\(organizacaoId \?\? null\) === \(perfil\?\.organizacao_id \?\? null\)\) return true/.test(servidor) && /perfil\?\.role === 'operador_portao' && organizacoesDoOperador\(perfil\)\.has/.test(servidor),
  'pros outros papéis a régua é exatamente a de sempre; só o operador ganha as outras')
ok(/return !!evento && !!evento\.organizacao_id && ehDaOrganizacaoDoPerfil\(perfil/.test(servidor), 'o leitor (QR e rosto) aceita evento de qualquer organização em que ele opera')
ok(/const orgs = \[\.\.\.organizacoesDoOperador\(perfil\)\][\s\S]{0,200}\.in\('organizacao_id', orgs\)/.test(servidor), 'a lista de eventos do leitor traz os eventos de todas')
ok((actions.match(/!ehMaster\(perfil\.role\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\??\.organizacao_id\)/g) ?? []).length >= 5,
  'Registrar ponto, lançamento manual, lista de pessoas, veículos e equipe usam a mesma régua')
ok(/Gestor de credenciamento em mais de uma organização: os eventos de TODAS entram na mesma lista/.test(contexto), 'o seletor de eventos do topo já mostrava as duas')

console.log('\n3 · Registrar ponto (achado ao vivo, Livia no VITAL, 11/10/2026: só aparecia o evento da Fatto)')
const escolher = ler('app/admin/EscolherEvento.tsx'), localizar = ler('app/admin/localizar/page.tsx'), veiculos = ler('app/admin/veiculos/page.tsx')
ok(/perfil\.role === 'operador_portao'[\s\S]{0,600}const orgs = \[\.\.\.organizacoesDoOperador\(perfil\)\][\s\S]{0,120}\.in\('organizacao_id', orgs\)/.test(escolher),
  'a lista "Em qual evento?" traz os eventos de todas as organizações do operador')
ok(/!veTodosEventos\(perfil\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\.organizacao_id\)/.test(localizar), 'a tela do evento em Registrar ponto abre')
ok(/!veTodosEventos\(perfil\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\.organizacao_id\)/.test(veiculos), 'a tela de veículos do evento abre')
ok(/return org === perfil\.organizacao_id \|\| \(!!org && ehDaOrganizacaoDoPerfil\(perfil, org\)\)/.test(actions), 'a busca por CPF/nome acha as pessoas do evento')
ok(/eventoDoFunc\?\.organizacao_id === perfil\.organizacao_id\s*\|\| \(!!eventoDoFunc\?\.organizacao_id && ehDaOrganizacaoDoPerfil\(perfil, eventoDoFunc\.organizacao_id\)\)/.test(actions),
  'abrir a pessoa achada não responde "fora do seu acesso"')

console.log('\n4 · "Ver todos e gerenciar" mostra TODOS os operadores (Juan, 11/10/2026: "não consigo ver quem são")')
const card = ler('app/admin/eventos/[id]/OperadorPortariaCard.tsx'), criarPorteiro = ler('app/admin/criar-porteiro/page.tsx')
ok(/const visiveis = !completo\s*\? operadores\.slice\(0, LIMITE\)/.test(card), 'o card do evento continua com 6; a tela cheia mostra todos, com busca')
ok(/const sobrando = completo \? 0/.test(card) && /operadores\.length > 0 && !completo &&/.test(card), 'a tela cheia não tem mais os links que voltavam pra ela mesma')
ok(/metodoIdentificacao=\{metodoIdentificacao\}\s*completo\s*\/>/.test(criarPorteiro), '/admin/criar-porteiro abre a lista completa')
ok(/role === 'operador_portao'\s*\? `operador da \$\{organizacoes\?\.nome/.test(internos), 'operador de outra organização aparece com o nome dela no selo')

console.log('\n5 · Registrar ponto mostra a ÁREA da pessoa (Juan, 11/10/2026: "se é bloco, geral...")')
const telaLocalizar = ler('app/admin/localizar/LocalizarFuncionario.tsx')
ok(/subeventos\(nome\), fornecedores!inner\(id, nome, evento_id, subeventos\(nome\), eventos!inner/.test(actions), 'a busca traz a área do setor e a do crachá')
ok(/function areaDaLinha/.test(actions) && (actions.match(/areaNome: areaDaLinha\(/g) ?? []).length === 3, 'ficha, lista de candidatos e lista do evento levam a área')
ok(/rotulo=\{func\.areas!\.length > 1 \? 'Áreas' : 'Área'\} valor=\{func\.areas!\.join\(' · '\)\}/.test(telaLocalizar), 'a ficha mostra "Área" antes do fornecedor — "Áreas", com todas, pro supervisor de mais de um lugar')
ok(/\.\.\.\(await areasDaPessoa\(func\.cpf, evento\.id\)\)\.map\(a => a\.nome\)/.test(actions), '… com a mesma régua do portão (`areasDaPessoa`)')

console.log('\n6 · Saída de madrugada (VITAL, 11/10/2026: "no app constava a entrada, no sistema nem entrada")')
ok(/Saída já registrada às \$\{formatarBR\(saidaRecente\[0\]\.created_at as string, 'curto'\)\}\. Não precisa bater de novo\.`, recente: true/.test(actions),
  'a 2ª SAÍDA da mesma pessoa (outro portão) diz que a saída já foi registrada, e quando — em amarelo, não em vermelho')
ok(/turnoFechado = \{\s*dataRef: u\.data_ref as string,/.test(actions) && /if \(!feitos\.size\) \{/.test(actions), 'Registrar ponto: com o dia de agora vazio, a ficha traz o turno que acabou de fechar e a última batida de verdade')
ok(/\{func\.turnoFechado && \(/.test(telaLocalizar) && /já registrado/.test(telaLocalizar), 'e a tela mostra esse turno em cima, em verde')

console.log('\n7 · Relatório por subgrupo na tela de relatórios (Juan, 11/10/2026)')
const exportar = ler('app/admin/eventos/[id]/relatorios/ExportarRelatorio.tsx'), relat = ler('lib/relatorios.ts')
ok(/titulo="Relatório por subgrupo"/.test(exportar) && /obterDadosRelatorioSubevento\(eventoId, subgrupoId, periodo\)/.test(exportar) && /gerarRelatorioSubevento\(r\.dados\)/.test(exportar), 'o cartão exporta o relatório do subgrupo, com o período escolhido')
ok(/subgrupos: \{ id: string; nome: string; fornecedores: number \}\[\]/.test(relat) && /if \(eventoInteiro\) \{/.test(relat), 'os subgrupos só vêm pra quem gerencia o evento inteiro')
ok(['app/admin/relatorios/page.tsx', 'app/admin/eventos/[id]/relatorios/page.tsx'].every(f => /subgrupos=\{resumo\.subgrupos\}/.test(ler(f))), 'as duas telas de relatório passam os subgrupos')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
