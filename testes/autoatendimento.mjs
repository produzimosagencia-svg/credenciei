/*
 * AUTOATENDIMENTO FORA DO HORÁRIO DA PORTARIA (pedido do Juan, 08/10/2026, depois do VITAL): equipe do
 * credenciamento vai embora, mas gente continua trabalhando sem ninguém pra bater o QR na saída. O operador
 * aperta "Estou indo embora" (não escolhe horário nenhum — quem define é o admin, em Editar evento); só libera
 * quando as três coisas valem: ligado no evento, ativado pelo operador, E dentro da janela configurada.
 *
 * Roda com: node testes/autoatendimento.mjs
 */
import { register } from 'node:module'

register('./_hook-ts.mjs', import.meta.url)
const A = await import('../lib/autoatendimento-regras.ts')

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const data = (h, m) => { const d = new Date('2026-10-08T12:00:00-03:00'); d.setHours(h, m, 0, 0); return d }

console.log('Janela que cruza a meia-noite (18:00 às 07:00)')
ok(A.dentroDaJanela('18:00', '07:00', data(20, 0)) === true, '20h está dentro (depois do início)')
ok(A.dentroDaJanela('18:00', '07:00', data(3, 0)) === true, '03h da manhã está dentro (antes do fim, já no dia seguinte)')
ok(A.dentroDaJanela('18:00', '07:00', data(12, 0)) === false, 'meio-dia está fora')
ok(A.dentroDaJanela('18:00', '07:00', data(18, 0)) === true, 'no minuto exato do início, já vale')
ok(A.dentroDaJanela('18:00', '07:00', data(7, 0)) === false, 'no minuto exato do fim, já não vale mais')
ok(A.dentroDaJanela('18:00', '07:00', data(6, 59)) === true, 'um minuto antes do fim, ainda vale')

console.log('\nJanela no mesmo dia (06:00 às 12:00)')
ok(A.dentroDaJanela('06:00', '12:00', data(9, 0)) === true, 'meio da manhã está dentro')
ok(A.dentroDaJanela('06:00', '12:00', data(20, 0)) === false, 'à noite está fora')

console.log('\nCasos sem configuração')
ok(A.dentroDaJanela(null, '07:00', data(20, 0)) === false, 'sem início configurado, nunca libera')
ok(A.dentroDaJanela('18:00', null, data(20, 0)) === false, 'sem fim configurado, nunca libera')
ok(A.dentroDaJanela('08:00', '08:00', data(3, 0)) === true, 'início igual ao fim = janela de 24h (não de zero)')

console.log('\nLiberado AGORA — as três condições')
const base = { habilitado: true, inicio: '18:00', fim: '07:00', ativadoEm: '2026-10-08T21:00:00-03:00', ativadoPor: 'op-1' }
ok(A.liberadoAgora(base, data(22, 0)) === true, 'ligado, ativado e dentro da janela: libera')
ok(A.liberadoAgora({ ...base, habilitado: false }, data(22, 0)) === false, 'evento sem a função ligada: não libera mesmo ativado')
ok(A.liberadoAgora({ ...base, ativadoEm: null }, data(22, 0)) === false, 'ninguém apertou "Estou indo embora": não libera')
ok(A.liberadoAgora(base, data(12, 0)) === false, 'ativado, mas fora da janela (meio-dia): não libera — a trava final mesmo que esqueçam de desativar')

console.log('\nTextos')
ok(A.descreverJanela({ ...base, inicio: '18:00:00', fim: '07:00:00' }) === '18:00 às 07:00', 'a janela aparece "HH:MM às HH:MM", sem segundos')
ok(A.descreverJanela({ ...base, inicio: null }) === null, 'sem janela configurada, sem texto')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
