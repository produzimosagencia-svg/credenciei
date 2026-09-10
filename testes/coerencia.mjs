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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ler = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

const C = {
  proxy: ler('proxy.ts'),
  janelas: ler('lib/janelas.ts'),
  actions: ler('lib/actions.ts'),
  qr: ler('lib/credencial-qr.ts'),
  mensagens: ler('lib/mensagens.ts'),
  modelos: ler('lib/mensagens-modelos.ts'),
  credencial: ler('app/credential/[token]/page.tsx'),
  qrTela: ler('app/credential/[token]/QrProtegido.tsx'),
  checkin: ler('app/credential/[token]/CheckinPresenca.tsx'),
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

grupo('4 · A saída NÃO exige mais o meio')
confere('o servidor não bloqueia', /Registre o meio antes de sair/.test(C.actions), false)
confere('e a mensagem não afirma isso', /saída não libera|saída só libera/.test(C.modelos), false)

grupo('5 · Batida livre solta o HORÁRIO, não o CALENDÁRIO')
confere('dia não marcado é checado antes', /if \(!dia\) \{[\s\S]{0,200}não está marcado/.test(C.janelas), true)
confere('dia cancelado é checado antes', /if \(dia\.cancelado\)[\s\S]{0,120}cancelado/.test(C.janelas), true)
confere('batida_livre vem depois dos dois',
  C.janelas.indexOf('batida_livre === true') > C.janelas.indexOf('dia.cancelado'), true)
confere('e cala lembrete e reforço, que afirmariam prazo', /diaComTrava/.test(C.mensagens), true)

grupo('6 · Toda tela sem login está liberada no proxy')
/*
 * Esquecer uma rota pública não dá erro no desenvolvimento — dá
 * redirecionamento para o login em produção, e quem está do outro lado conclui
 * que o sistema quebrou. Aconteceu com /portaria: a tela pronta, o QR gerado, e
 * o cartaz mandando todo mundo para uma tela de senha.
 */
for (const rota of ['/form/', '/credential/', '/portaria/', '/supervisor/criar-senha/']) {
  confere(`${rota} é pública`, C.proxy.includes(`pathname.startsWith('${rota}')`), true)
}

grupo('7 · Montagem tem entrada e saída livres')
confere('o servidor libera', /if \(dia\.tipo !== 'principal'\) return \{ ok: true \}/.test(C.janelas), true)
confere('nada é cobrado sem horário esperado', /esperado\.entrada && !desligado/.test(C.mensagens), true)

grupo('8 · No dia principal, o registro livre exige checkin_autonomo ligado')
confere('a tela só oferece o botão fora do dia principal ou com o auto-atendimento ligado',
  /!diaPrincipal \|\| evento\?\.checkin_autonomo === true/.test(C.credencial), true)
confere('e o servidor recusa mesmo chamado direto, sem a coluna ligada',
  /resolucao\.diaPrincipal && evento\.checkin_autonomo !== true/.test(C.actions), true)

grupo("9 · Nenhum arquivo 'use server' re-exporta tipo")
/*
 * O bug que custou dois dias, em 09/09/2026.
 *
 * `export type { X }` — re-export puro de um tipo — num arquivo `use server`
 * NÃO é apagado pelo Turbopack deste fork. Ele emite uma referência a um
 * binding que não existe em runtime, e o módulo INTEIRO morre ao carregar com
 * "ReferenceError: X is not defined at module evaluation". Todas as actions
 * daquele arquivo param de funcionar de uma vez — e, como o Next mascara erro
 * de Server Action em produção, o navegador mostra só "ocorreu um erro".
 *
 * Foi assim que o relatório de custo de WhatsApp e o cadastro do Backlog
 * quebraram, cada um por dias, sem nenhuma pista na tela. O sintoma não
 * aponta pra causa: o arquivo compila, o `tsc` passa, o build passa, o banco
 * responde certo — e nada funciona.
 *
 * `export type X = ...` (declaração) é seguro e continua liberado; o que
 * quebra é só o re-export. Quando precisar reexportar um tipo, faça num
 * arquivo que NÃO tenha `use server`.
 */
{
  const varrer = (dir, achados = []) => {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === '.next' || nome.startsWith('.')) continue
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) varrer(caminho, achados)
      else if (/\.(ts|tsx)$/.test(nome)) achados.push(caminho)
    }
    return achados
  }
  const culpados = ['lib', 'app', 'components']
    .flatMap(raiz => varrer(raiz))
    .filter(caminho => {
      const texto = ler(caminho)
      return /^\s*['"]use server['"]/.test(texto) && /^export type \{/m.test(texto)
    })
  confere(
    culpados.length
      ? `re-export de tipo em: ${culpados.join(', ')}`
      : "nenhum arquivo 'use server' re-exporta tipo",
    culpados.length > 0,
    false,
  )
}

console.log(
  falhas
    ? `\n\x1b[31m✗ ${falhas} incoerência(s) — o sistema diz algo que não faz.\x1b[0m\n`
    : '\n\x1b[32m✓ Nenhuma incoerência.\x1b[0m\n',
)
process.exitCode = falhas ? 1 : 0
