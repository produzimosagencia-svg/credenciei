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
// Instantes SEMPRE com o fuso de Brasília explícito: o teste não pode depender do fuso da máquina (o servidor é UTC).
const brt = s => new Date(`${s}:00-03:00`)
const data = (h, m) => brt(`2026-10-08T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)

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
ok(A.descreverJanela({ ...base, inicio: '18:00:00', fim: '07:00:00' }) === '18:00 às 07:00 do dia seguinte', 'a janela aparece "HH:MM às HH:MM", sem segundos, e avisa quando termina no dia seguinte')
ok(A.descreverJanela({ ...base, inicio: '06:00', fim: '12:00' }) === '06:00 às 12:00', 'janela no mesmo dia, sem "do dia seguinte"')
ok(A.descreverJanela({ ...base, inicio: null }) === null, 'sem janela configurada, sem texto')

console.log('\nHorário de Brasília, não o do servidor (UTC) — achado do Juan, 09/10/2026')
const utc = new Date('2026-10-09T03:15:00Z') // 00:15 em Brasília
ok(A.partesBRT(utc).dia === '2026-10-09' && A.partesBRT(utc).minutos === 15, '03:15 UTC é 00:15 do dia 09 em Brasília')
ok(A.dentroDaJanela('18:00', '00:25', utc) === true, 'janela 18:00–00:25: às 00:15 de Brasília ainda está dentro (antes, o servidor via 03:15 e recusava)')
ok(A.dentroDaJanela('18:00', '00:25', brt('2026-10-09T00:30')) === false, 'às 00:30 já acabou')

console.log('\nJanela que passa da meia-noite é a NOITE do dia em que começou')
ok(A.janelaAtual('18:00', '00:25', brt('2026-10-09T00:10'))?.diaInicio === '2026-10-08', 'às 00:10 do dia 09, o dia da janela é 08 (começou às 18:00 do dia 08)')
ok(A.janelaAtual('18:00', '00:25', brt('2026-10-08T19:00'))?.diaInicio === '2026-10-08', 'às 19:00 do dia 08, o dia é 08')
ok(A.janelaAtual('06:00', '12:00', brt('2026-10-08T09:00'))?.diaInicio === '2026-10-08', 'janela no mesmo dia: o próprio dia')
const j = A.janelaAtual('18:00', '00:25', brt('2026-10-09T00:10'))
ok(j?.comecouEm.toISOString() === brt('2026-10-08T18:00').toISOString() && j?.terminaEm.toISOString() === brt('2026-10-09T00:25').toISOString(),
  'começa às 18:00 do dia 08 e termina às 00:25 do dia 09')
ok(A.cruzaMeiaNoite('18:00', '00:25') === true && A.cruzaMeiaNoite('06:00', '12:00') === false, 'sabe quando cruza a meia-noite')

console.log('\nA ativação vale uma noite (a de ontem não libera hoje sozinha)')
const cfg = { habilitado: true, inicio: '18:00', fim: '00:25', ativadoEm: null, ativadoPor: 'op' }
ok(A.liberadoAgora({ ...cfg, ativadoEm: brt('2026-10-08T19:00').toISOString() }, brt('2026-10-09T00:10')) === true, 'ativou às 19:00 do dia 08: vale até 00:25 do dia 09')
ok(A.liberadoAgora({ ...cfg, ativadoEm: brt('2026-10-08T17:30').toISOString() }, brt('2026-10-08T18:30')) === true, 'ativou às 17:30, antes da janela começar: vale para a janela das 18:00')
ok(A.liberadoAgora({ ...cfg, ativadoEm: brt('2026-10-08T19:00').toISOString() }, brt('2026-10-09T19:00')) === false, 'ativação da noite de 08 NÃO libera a noite de 09 sozinha')
ok(A.diaDaAtivacao(cfg, brt('2026-10-09T00:10')) === '2026-10-08', 'apertar "Estou indo embora" às 00:10 vale para o dia 08 (a noite em andamento)')
ok(A.diaDaAtivacao(cfg, brt('2026-10-09T17:30')) === '2026-10-09', 'apertar às 17:30, fora da janela, vale para a janela de hoje (dia 09)')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
