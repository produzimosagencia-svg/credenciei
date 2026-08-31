/*
 * AUDITORIA DE COERÊNCIA — o que o sistema AFIRMA × o que o código FAZ.
 *
 * ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Quase todo erro grave deste sistema em produção foi da mesma família: uma
 * regra mudou no código e o texto que fala dela ficou para trás.
 *
 *   o QR passou a mudar por ETAPA        → a mensagem continuou dizendo "muda
 *                                          todo dia"
 *   o meio virou informação de admin     → a mensagem continuou contando a
 *                                          conta das 4 horas
 *   a batida livre soltou o horário      → o lembrete continuou dizendo
 *                                          "depois desse horário não aceita"
 *
 * Nenhum desses aparece em teste de unidade: o código está certo, o texto está
 * certo, e a INCOERÊNCIA entre os dois é que machuca. Quem paga é a pessoa que
 * recebe instrução errada num evento.
 *
 * Este arquivo amarra os dois lados. Mudou a regra e esqueceu o texto? Cai
 * aqui, antes de subir.
 *
 * Rode com:  node testes/coerencia.mjs
 */
import { readFileSync } from 'node:fs'

const ler = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

const C = {
  janelas: ler('lib/janelas.ts'),
  actions: ler('lib/actions.ts'),
  qr: ler('lib/credencial-qr.ts'),
  mensagens: ler('lib/mensagens.ts'),
  modelos: ler('lib/mensagens-modelos.ts'),
  credencial: ler('app/credential/[token]/page.tsx'),
  qrTela: ler('app/credential/[token]/QrProtegido.tsx'),
}

let falhas = 0
const grupo = t => console.log(`\n\x1b[1m${t}\x1b[0m`)
const ok = m => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const nok = m => { falhas++; console.log(`  \x1b[31m✗\x1b[0m ${m}`) }
const confere = (rotulo, achou, deveAchar) =>
  (deveAchar ? achou : !achou) ? ok(rotulo) : nok(rotulo)

console.log('\n═══ COERÊNCIA ENTRE A REGRA E O QUE O SISTEMA DIZ ═══')

grupo('1 · O QR muda por ETAPA, não por dia')
confere('o gerador assina a etapa', /gerarCodigoQR.*fase: FaseDoDia/s.test(C.qr), true)
confere('a prévia da mensagem não diz "muda todo dia"', /muda todo dia/.test(C.modelos), false)
confere('a tela do QR fala em etapa', /QR da \{faseLabel\}/.test(C.qrTela), true)
confere('o tutorial não diz "muda todo dia"', /muda todo dia/.test(C.credencial), false)

grupo('2 · A regra das 4h é informação de ADMIN, não do funcionário')
confere('a prévia da mensagem não conta a conta', /4 HORAS DEPOIS|4 horas depois/.test(C.modelos), false)
confere('a recusa do meio não conta a conta', /meio ainda não abriu\. Você será avisado/.test(C.actions), true)
confere('a credencial não conta a conta', /4 horas|quatro horas/i.test(C.credencial), false)

grupo('3 · O meio ABRE e nunca FECHA')
confere('o servidor só barra antes de abrir', /agora\.getTime\(\) < new Date\(janela\.inicio\)/.test(C.actions), true)
confere('a credencial mantém o cartão aberto', /aberto \? \('disponivel'/.test(C.credencial), true)
confere('e avisa quem está em atraso', /avisoAtraso/.test(C.credencial), true)

grupo('4 · A saída exige o meio')
confere('o servidor exige', /Registre o meio antes de sair/.test(C.actions), true)
confere('e a mensagem avisa disso', /saída não libera|saída só libera/.test(C.modelos), true)

grupo('5 · Batida livre solta o HORÁRIO, não o CALENDÁRIO')
confere('dia não marcado é checado antes', /if \(!dia\) \{[\s\S]{0,200}não está marcado/.test(C.janelas), true)
confere('dia cancelado é checado antes', /if \(dia\.cancelado\)[\s\S]{0,120}cancelado/.test(C.janelas), true)
confere('batida_livre vem depois dos dois',
  C.janelas.indexOf('batida_livre === true') > C.janelas.indexOf('dia.cancelado'), true)
confere('e cala lembrete e reforço, que afirmariam prazo', /diaComTrava/.test(C.mensagens), true)

grupo('6 · Montagem tem entrada e saída livres')
confere('o servidor libera', /if \(dia\.tipo !== 'principal'\) return \{ ok: true \}/.test(C.janelas), true)
confere('nada é cobrado sem horário esperado', /esperado\.entrada && !desligado/.test(C.mensagens), true)

console.log(
  falhas
    ? `\n\x1b[31m✗ ${falhas} incoerência(s) — o sistema diz algo que não faz.\x1b[0m\n`
    : '\n\x1b[32m✓ Nenhuma incoerência.\x1b[0m\n',
)
process.exitCode = falhas ? 1 : 0
