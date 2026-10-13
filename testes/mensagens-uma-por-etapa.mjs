/*
 * UMA MENSAGEM POR ETAPA, SÓ PARA QUEM NÃO BATEU (Juan, 13/10/2026, depois do VITAL): "só era pra ter recebido a
 * mensagem quem não bateu o ponto dentro do horário... falta tanto tempo pra isso encerrar". No VITAL saíram 2.357
 * lembretes de entrada (2.356 no mesmo dia do aviso do dia) e 1.319 lembretes do meio na abertura da janela, para todo
 * mundo; e o reforço ia 2 minutos antes de fechar.
 *
 * Roda com: node testes/mensagens-uma-por-etapa.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const msg = readFileSync(raiz + 'lib/mensagens.ts', 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

ok(!/agendarFunc\([^)]*'lembrete_entrada'/.test(msg) && !/agendarFunc\([^)]*'lembrete_fim'/.test(msg), 'entrada e saída: sem o lembrete da abertura (o aviso do dia de manhã já avisa)')
ok(!/tipo: 'lembrete_meio' as TipoMensagem/.test(msg) && /tipo: 'reforco_meio' as TipoMensagem, agendado_para: reforco, condicao: 'sem_registro'/.test(msg), 'meio: uma mensagem só, condicional')
ok(/const ANTECEDENCIA_REFORCO_MINUTOS = 30/.test(msg) && /const ANTECEDENCIA_REFORCO_MEIO_MINUTOS = 60/.test(msg), 'o reforço vai com tempo de agir: 30 min antes (entrada/saída), 1h antes (meio)')
ok(/'reforco_entrada', dia\.data,[\s\S]{0,200}'sem_registro'\)/.test(msg) && /'reforco_fim', dia\.data,[\s\S]{0,200}'sem_registro'\)/.test(msg), 'entrada e saída: só para quem ainda não bateu')
ok(/'lembrete_entrada', 'lembrete_fim', 'reforco_entrada', 'reforco_fim',/.test(msg), 'os lembretes antigos que ainda estão na fila são cancelados na próxima sincronização')
ok(/const ehLembreteOuReforco = msg\.tipo\.startsWith\('lembrete_'\) \|\| msg\.tipo\.startsWith\('reforco_'\)/.test(msg), 'na hora do envio, confere de novo se a pessoa já bateu')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
