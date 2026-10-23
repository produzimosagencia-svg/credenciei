/*
 * CONSULTA POR CPF (Juan, 23/10/2026): "no caso do Caio eu precisei de scripts para mostrar fichas, batidas, quem lançou
 * cada uma e a auditoria — uma tela única responderia esse tipo de reclamação em segundos". Só leitura; master e suporte.
 *
 * Roda com: node testes/consulta-cpf.mjs
 */
import { readFileSync } from 'node:fs'
import { cpfDigitado, comoFoiBatida, resumirBatidas, ROTULO_COMO } from '../lib/consulta-cpf-regras.ts'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · As regras')
ok(cpfDigitado('157.697.487-10') === '15769748710' && cpfDigitado('15769748710') === '15769748710' && cpfDigitado(' 157 697 487 10 ') === '15769748710', 'o CPF com ou sem pontos e traço')
ok(cpfDigitado('123') === null && cpfDigitado('') === null && cpfDigitado(null) === null && cpfDigitado('157697487101') === null, 'curto, vazio ou comprido demais: não consulta')
ok(comoFoiBatida({ registro_manual: false, foto_url: null }) === 'leitor' && comoFoiBatida({ registro_manual: true, foto_url: 'x.jpg' }) === 'registrar_ponto' && comoFoiBatida({ registro_manual: true, foto_url: null }) === 'a_mao', 'de onde veio a batida: leitor, Registrar ponto (com foto) ou à mão')
ok(ROTULO_COMO.leitor === 'Leitor / celular da pessoa' && ROTULO_COMO.a_mao === 'Lançada à mão', 'os rótulos')
const b = (tipo, dataRef, quandoISO, como = 'leitor') => ({ tipo, dataRef, quandoISO, como })
{
  const r = resumirBatidas([
    b('entrada', '2026-10-10', '2026-10-10T17:33:00Z', 'registrar_ponto'), b('meio', '2026-10-10', '2026-10-10T22:06:00Z', 'registrar_ponto'), b('fim', '2026-10-10', '2026-10-11T06:05:00Z', 'a_mao'),
    b('entrada', '2026-10-11', '2026-10-11T17:19:00Z'), b('fim', '2026-10-11', '2026-10-11T04:05:00Z'),
    b('entrada', '2026-10-12', '2026-10-12T17:00:00Z'),
  ])
  ok(r.total === 6 && r.dias === 3 && r.aMao === 3, 'total, dias e as lançadas por operador ou à mão')
  ok(r.saidaAntesDaEntrada === 1 && r.semSaida === 1, 'dia com a saída ANTES da entrada e dia sem saída aparecem separados')
  const caio = resumirBatidas([b('entrada', '2026-10-10', '2026-10-10T17:33:00Z'), b('fim', '2026-10-10', '2026-10-11T06:05:00Z'), b('entrada', '2026-10-11', '2026-10-11T17:19:00Z'), b('fim', '2026-10-11', '2026-10-12T06:05:00Z')])
  ok(caio.semSaida === 0 && caio.saidaAntesDaEntrada === 0 && caio.dias === 2, 'dois turnos que viram a madrugada fecham certinho (o caso do Caio)')
  ok(resumirBatidas([]).total === 0, 'sem batidas: zero')
}

console.log('\n2 · A ação do servidor')
const acao = ler('lib/actions-consulta-cpf.ts')
ok(/^'use server'/.test(acao), 'é uma ação de servidor')
ok(/podeEditarIdentidade\(perfil\)\)\s*return \{ error: 'Só o master e o suporte consultam por CPF\.' \}/.test(acao), 'só master e suporte (a mesma régua de corrigir CPF)')
ok(/perfil\.role === 'suporte' && !\(await suporteTemEscopo\(perfil\.id, \{ eventoId: ev\.id, organizacaoId: ev\.organizacao_id \?\? undefined \}\)\)\) continue/.test(acao) && /if \(!doEscopo\.length\) return \{ fichas: \[\], cpf \}/.test(acao), 'o suporte só vê o escopo dele — e fora dele a resposta é a mesma de "não achei"')
ok(!/\.(insert|update|delete|upsert)\(/.test(acao), 'só leitura: nenhuma gravação')
ok(/from\('registros_apagados'\)/.test(acao) && /from\('alteracoes_cadastro'\)/.test(acao) && /from\('pausas_turno'\)/.test(acao) && /from\('mensagens_agendadas'\)/.test(acao) && /criado_por_perfil_id/.test(acao), 'traz batidas (e quem lançou), pausas, apagadas, auditoria e mensagens')
ok(/estadosNaMeta/.test(acao) && /statusDaMensagem/.test(acao), 'as mensagens mostram o que a Meta devolveu (entregue, lida, não entregue)')

console.log('\n3 · A tela e o menu')
const pagina = ler('app/admin/consulta-cpf/page.tsx'), tela = ler('app/admin/consulta-cpf/ConsultaCpf.tsx'), menu = ler('components/AppShell.tsx')
ok(/if \(!podeEditarIdentidade\(perfil\)\) redirect\('\/admin'\)/.test(pagina) && /if \(!perfil\) redirect\('\/login'\)/.test(pagina), 'a página barra quem não é master nem suporte')
ok(/podeEditarIdentidade\(perfil\)\) \{\s*administrativo\.push\(\{ href: '\/admin\/consulta-cpf', label: 'Consulta por CPF'/.test(menu), 'item "Consulta por CPF" no menu Administrativo, só para quem pode')
ok(/Como e quem lançou/.test(tela) && /Histórico de alterações \(auditoria\)/.test(tela) && /Batidas apagadas \(guardadas\)/.test(tela) && /Mensagens de WhatsApp/.test(tela) && /Abrir equipe/.test(tela), 'a ficha mostra batidas com quem lançou, apagadas, auditoria, mensagens e o caminho para a equipe')
ok(/semSaida > 0/.test(tela) && /saidaAntesDaEntrada > 0/.test(tela) && /Sem telefone válido/.test(tela), 'e já destaca o que está estranho: dia sem saída, saída antes da entrada, telefone sem validade')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
