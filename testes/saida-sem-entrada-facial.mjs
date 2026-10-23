/*
 * "REGISTRAR A ENTRADA DELE" no leitor por RECONHECIMENTO FACIAL (Juan, 23/10/2026): igual ao do leitor de QR — a saída é
 * recusada por falta de entrada, o operador informa a hora num modal e o sistema lança a entrada e registra a saída.
 *
 * Roda com: node testes/saida-sem-entrada-facial.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · O servidor')
const acoes = ler('lib/actions.ts')
const facial = acoes.slice(acoes.indexOf('export async function registrarSaidaFacialComEntradaInformada('), acoes.indexOf('/** O operador leu, viu a prévia e CANCELOU'))
ok(/validarLeituraFacial\(\s*eventoId, descritor, 'fim', true,/.test(facial) && /if \(!previa\.semEntrada \|\| !previa\.funcionarioId\) return previa/.test(facial), 'a entrada só é lançada se a saída passou por todas as outras conferências (prévia primeiro; só a recusa "sem entrada" libera)')
ok(/if \(previa\.success && previa\.previa\) return await registrarPresencaFacial\(eventoId, descritor, 'fim', base\)/.test(facial), 'se outro portão registrou a entrada nesse meio tempo: só a saída')
ok(/pelo: 'scanner'/.test(facial) && /await registrarPresencaFacial\(eventoId, descritor, 'fim', base\)/.test(facial) && /foi lançada, mas a saída não/.test(facial), 'lança a entrada (como scanner) e registra a saída com o mesmo rosto; se a saída falhar, diz que a entrada já foi')
ok(/\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/.test(facial), 'a hora precisa ser HH:MM')
const validar = acoes.slice(acoes.indexOf('async function validarLeituraFacial('), acoes.indexOf('/** Entrada e saída só no portão, pelo operador'))
ok(/const resultado = await autorizarPresenca\(\{/.test(validar) && /return \{ resultado, funcionarioId: match\.funcionarioId/.test(validar), 'a recusa do leitor facial vem do mesmo núcleo do QR (já marcada como "sem entrada", com a pessoa)')

console.log('\n2 · A tela do leitor facial')
const tela = ler('app/scan/FaceScannerView.tsx')
ok(/semEntrada: \{ fundo: 'bg-orange-600', icone: '⏱', titulo: 'SEM ENTRADA REGISTRADA' \}/.test(tela) && /if \(r\.semEntrada && r\.funcionarioId\) return 'semEntrada'/.test(tela), 'a saída sem entrada vira a tela laranja "SEM ENTRADA REGISTRADA" (não "acesso negado")')
ok(/REGISTRAR A ENTRADA DELE/.test(tela) && /categoria === 'semEntrada' && result\.funcionarioId && origemDoResultado/.test(tela), 'a tela oferece o botão "REGISTRAR A ENTRADA DELE"')
ok(/m\.origem\.tipo === 'rosto'\s*\?\s*registrarSaidaFacialComEntradaInformada\(eventoId, m\.origem\.descritor, horaDoModal,/.test(tela) && /registrarSaidaComEntradaInformada\(eventoId, m\.origem\.texto, horaDoModal,/.test(tela), 'repete a MESMA leitura: o rosto usa a ação facial e o QR lido pela mesma câmera usa a do leitor de QR')
ok(/aplicarResultadoFinal\(r, m, origem\)/.test(tela) && /aplicarResultadoFinal\(r, c\.modo, c\.origem\)/.test(tela) && /if \(origem\) setOrigemDoResultado\(origem\)/.test(tela), 'guarda de onde veio o resultado (prévia recusada e confirmação)')
ok(/<CampoHoraDeEntrada id="hora-do-modal-rosto"/.test(tela) && /REGISTRAR ENTRADA E SAÍDA/.test(tela) && /disabled=\{gravandoModal \|\| !horaDeEntradaValida\(horaDoModal\)\}/.test(tela), 'o modal pede a hora com o campo que não entorta, e só registra com uma hora válida')
ok(!/text-(red|green|amber)-\d/.test(tela.slice(tela.indexOf('O MODAL DA HORA DA ENTRADA'))), 'o modal usa cores fixas (a tela é escura nos dois temas)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
