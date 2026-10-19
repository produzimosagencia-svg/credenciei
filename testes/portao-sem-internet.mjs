/*
 * PORTÃO SEM INTERNET (Juan, 18/10/2026: "a internet caiu lá no Luan Santana, muita gente ficou muito tempo sem
 * bater… quando pegar a internet com o servidor esses registros subirem") — e o portão que não barra mais por escala
 * nem por limite do dia ("o sistema é simples, não pode estar acontecendo esses entraves").
 *
 * 1. A fila do aparelho (lib/fila-offline.ts) DE VERDADE, no Node, com um IndexedDB de mentira e o servidor de mentira.
 * 2. O servidor: regras da batida guardada (hora da leitura, 24h, reenvio, ordem) — pelo código-fonte.
 * 3. As telas e o service worker — pelo código-fonte.
 *
 * Roda com: node testes/portao-sem-internet.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

// ─── IndexedDB de mentira (só o que a fila usa) ──────────────────────────────
function idbDeMentira() {
  const lojas = new Map()
  const pedido = (fazer) => {
    const req = { result: undefined, onsuccess: null, onerror: null }
    queueMicrotask(() => { req.result = fazer(); req.onsuccess?.() })
    return req
  }
  const banco = {
    objectStoreNames: { contains: n => lojas.has(n) },
    createObjectStore: (n, { keyPath }) => { lojas.set(n, { keyPath, dados: new Map() }) },
    transaction: (n) => {
      const loja = lojas.get(n)
      const t = { oncomplete: null, onerror: null, onabort: null }
      const pendentes = []
      const reg = r => { pendentes.push(r); return r }
      t.objectStore = () => ({
        put: v => reg(pedido(() => { loja.dados.set(v[loja.keyPath], structuredClone(v)) })),
        get: k => reg(pedido(() => structuredClone(loja.dados.get(k)))),
        getAll: () => reg(pedido(() => [...loja.dados.values()].map(v => structuredClone(v)))),
        delete: k => reg(pedido(() => { loja.dados.delete(k) })),
      })
      setTimeout(() => t.oncomplete?.(), 0)
      return t
    },
  }
  return {
    open: () => {
      const req = { result: banco, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => { req.onupgradeneeded?.(); req.onsuccess?.() })
      return req
    },
  }
}

globalThis.indexedDB = idbDeMentira()
globalThis.window = { dispatchEvent: () => true }
const guardado = new Map()
globalThis.localStorage = { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// ─── O servidor de mentira ───────────────────────────────────────────────────
const EVENTO = 'ev-1'
const resumo = t => createHash('sha256').update(t).digest('hex').slice(0, 32)
const servidor = { respostas: [], recebidos: [], pacote: null, cair: false }
const pasta = join(raiz, '.tmp-teste-sem-internet')
rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true })
writeFileSync(join(pasta, 'actions.ts'), `
export async function enviarBatidasGuardadas(eventoId: string, itens: any[]) {
  const s = (globalThis as any).__servidor
  if (s.cair) throw new TypeError('Failed to fetch')
  s.recebidos.push(...itens.map((i: any) => ({ ...i, eventoId })))
  return { respostas: itens.map((i: any) => s.respostas.shift()?.(i) ?? { id: i.id, ok: true, definitivo: false, mensagem: 'ok' }) }
}
export type BatidaGuardada = any
export type RespostaDaGuardada = any
`)
writeFileSync(join(pasta, 'actions-offline.ts'), `
export async function pacoteParaSemInternet(eventoId: string) { return (globalThis as any).__servidor.pacote }
export async function relogioDoServidor() { return Date.now() + 90_000 }
export type PessoaParaSemInternet = any
export type SituacaoGuardada = any
`)
writeFileSync(join(pasta, 'format.ts'), ler('lib/format.ts'))
writeFileSync(join(pasta, 'fila-offline.ts'), ler('lib/fila-offline.ts')
  .replace("from './actions'", "from './actions.ts'").replace("from './actions-offline'", "from './actions-offline.ts'").replace("from './format'", "from './format.ts'"))
globalThis.__servidor = servidor
const F = await import(join(pasta, 'fila-offline.ts'))

console.log('1 · A fila do aparelho')
const token = 'TOKEN_DA_ANA_1234567890'
const codigo = `c3.${token}.d.assinatura123456`
ok(F.tokenDoQR(codigo) === token && F.tokenDoQR(`${codigo}|entrada`) === token && F.tokenDoQR('https://x/veiculo/abc') === null, 'o token sai de dentro do QR (c3), sem conferir a assinatura')

servidor.pacote = {
  geradoEm: new Date().toISOString(),
  pessoas: [
    { id: 'ana', t: resumo(token), c: resumo(`${EVENTO}:52998224725`), nome: 'Ana Lima', busca: 'ana lima', equipe: 'BAR', cargo: null, situacao: 'liberado' },
    { id: 'bia', t: resumo('TOKEN_DA_BIA'), c: resumo(`${EVENTO}:11144477735`), nome: 'Bia Souza', busca: 'bia souza', equipe: 'BAR', cargo: null, situacao: 'baixa' },
  ],
}
ok(await F.atualizarPacote(EVENTO), 'baixa a lista do evento (com internet)')
ok((await F.pessoaPeloQR(EVENTO, codigo))?.nome === 'Ana Lima', 'sem internet, o QR lido acha a pessoa pelo resumo do token (mesma conta do servidor)')
ok((await F.pessoaPeloCpf(EVENTO, '529.982.247-25'))?.nome === 'Ana Lima' && !(await F.pessoaPeloCpf(EVENTO, '52998224724')), 'o CPF completo acha a pessoa; um dígito diferente, não')
ok((await F.pessoasPeloNome(EVENTO, 'souza')).map(p => p.id).join() === 'bia', 'busca pelo nome (sem acento, parte do nome)')
ok(/BAIXA/.test(F.motivoDaSituacao('baixa')) && F.motivoDaSituacao('liberado') === null, 'quem a lista sabe que tem baixa é recusado no próprio aparelho')

await F.acertarRelogio()
const dif = F.agoraCerto().getTime() - Date.now()
ok(dif > 80_000 && dif < 100_000, `a hora da batida é a do servidor (relógio do aparelho 90 s atrasado → corrigido: ${Math.round(dif / 1000)} s)`)

const t0 = Date.now()
const item = (id, momento, minutos, extra = {}) => ({ id, eventoId: EVENTO, tipo: 'qr', codigo, momento, lidoEm: new Date(t0 + minutos * 60_000).toISOString(), local: null, nome: 'Ana Lima', equipe: 'BAR', ...extra })
await F.guardarNaFila(item('s1', 'fim', 600))
await F.guardarNaFila(item('e1', 'entrada', 0))
ok((await F.itensDaFila(EVENTO)).map(i => i.id).join() === 'e1,s1', 'a fila fica em ordem de horário (entrada das 08h antes da saída das 18h)')

navigator.onLine = false
let r = await F.enviarFila()
ok(r.enviadas === 0 && (await F.itensDaFila()).length === 2 && !servidor.recebidos.length, 'sem internet, nada é enviado e nada sai da fila')

navigator.onLine = true
servidor.cair = true
r = await F.enviarFila()
ok((await F.itensDaFila()).length === 2 && r.erro, 'a internet "voltou" mas o pedido não chega: a fila continua inteira')

servidor.cair = false
servidor.respostas = [
  i => ({ id: i.id, ok: true, definitivo: false, mensagem: 'Entrada registrada!' }),
  i => ({ id: i.id, ok: false, definitivo: false, mensagem: 'Erro ao registrar. Tente de novo.' }),
]
r = await F.enviarFila()
const restou = await F.itensDaFila()
ok(servidor.recebidos.map(i => i.id).join() === 'e1,s1' && !('nome' in servidor.recebidos[0]) && !('tentativas' in servidor.recebidos[0]), 'manda em ordem, só o que o servidor precisa')
ok(r.enviadas === 1 && restou.length === 1 && restou[0].id === 's1' && restou[0].tentativas === 1, 'gravada sai da fila; falha de gravação fica para a próxima (tentativa 1)')

servidor.respostas = [i => ({ id: i.id, ok: false, definitivo: true, nome: 'Ana Lima', mensagem: 'Já descredenciado deste evento.' })]
r = await F.enviarFila()
const recusas = await F.recusasGuardadas(EVENTO)
ok(r.recusadas === 1 && !(await F.itensDaFila()).length && recusas.length === 1 && /descredenciado/.test(recusas[0].motivo), 'recusada pelas regras: sai da fila e vai para "não entraram", com o motivo')
await F.descartarRecusa(recusas[0].id)
ok(!(await F.recusasGuardadas()).length, '"Já resolvi" tira da lista')

await F.guardarNaFila(item('x1', 'entrada', 1))
for (let n = 0; n < 6; n++) {
  servidor.respostas = [i => ({ id: i.id, ok: false, definitivo: false, mensagem: 'Erro ao registrar. Tente de novo.' })]
  await F.enviarFila()
}
ok(!(await F.itensDaFila()).length && (await F.recusasGuardadas()).some(x => x.id === 'x1' && /várias tentativas/.test(x.motivo)), 'depois de 6 falhas de gravação seguidas, para de insistir e mostra como "não entrou"')

for (let n = 0; n < 12; n++) await F.guardarNaFila(item(`q${n}`, 'entrada', 10 + n))
await F.guardarNaFila({ ...item('foto1', 'entrada', 30), tipo: 'assistido', funcionarioId: 'ana', foto: 'data:image/jpeg;base64,AAA', dispositivo: 'x' })
servidor.recebidos = []
servidor.respostas = []
r = await F.enviarFila()
ok(r.enviadas === 13 && servidor.recebidos.length === 13, 'QR vão de 10 em 10; o Registrar ponto (com foto) vai sozinho — 13 enviadas')

// ENTRADA INFORMADA na saída (Juan, 19/10/2026): quem chega para sair sem ter batido a entrada.
const saidaEm = new Date(t0 + 900 * 60_000).toISOString()
const entradaInf = F.entradaInformadaParaSaida({ eventoId: EVENTO, pessoaId: 'ana', nome: 'Ana Lima', equipe: 'BAR', hora: '14:00', saidaLidaEm: saidaEm })
ok(Date.parse(saidaEm) - Date.parse(entradaInf.lidoEm) === 1000 && entradaInf.tipo === 'entrada_informada' && entradaInf.momento === 'entrada' && entradaInf.funcionarioId === 'ana',
  'a entrada informada fica 1 segundo ANTES da saída na ordem de horário')
ok(F.horaDeEntradaValida('14:00') && F.horaDeEntradaValida('00:05') && F.horaDeEntradaValida('23:59') && !F.horaDeEntradaValida('24:00') && !F.horaDeEntradaValida('') && !F.horaDeEntradaValida('9:00') && !F.horaDeEntradaValida('14:60'),
  'a hora da entrada é HH:MM (o que o campo de hora devolve)')
await F.guardarNaFilaJuntos([entradaInf, item('sj', 'fim', 900, { lidoEm: saidaEm, pessoaId: 'ana' })])
ok((await F.itensDaFila(EVENTO)).map(i => `${i.tipo}:${i.momento}`).join() === 'entrada_informada:entrada,qr:fim', 'entrada informada e saída entram juntas na fila, em ordem')
ok(!(await F.entradaJaNaFila(EVENTO, 'ana')), 'quem já tem a saída depois da entrada guardada: pergunta a hora de novo (é outra volta)')
await F.guardarNaFila(item('eb', 'entrada', 5, { pessoaId: 'bia' }))
ok(await F.entradaJaNaFila(EVENTO, 'bia') && !(await F.entradaJaNaFila(EVENTO, 'zzz')), 'este aparelho já guardou a entrada da Bia: não pergunta a hora; de quem não tem nada na fila, pergunta')
servidor.recebidos = []; servidor.respostas = []
r = await F.enviarFila()
const iEntrada = servidor.recebidos.findIndex(i => i.tipo === 'entrada_informada'), iSaida = servidor.recebidos.findIndex(i => i.id === 'sj')
ok(r.enviadas === 3 && iEntrada >= 0 && iSaida > iEntrada, 'no envio, a entrada informada chega ao servidor ANTES da saída')
const enviadaInf = servidor.recebidos[iEntrada]
ok(enviadaInf.hora === '14:00' && enviadaInf.funcionarioId === 'ana' && enviadaInf.momento === 'entrada' && !('nome' in enviadaInf) && !('tentativas' in enviadaInf) && !('pessoaId' in enviadaInf),
  'e vai só com o que o servidor precisa (pessoa e hora)')
rmSync(pasta, { recursive: true, force: true })

console.log('\n2 · O servidor confere tudo de novo, na hora da leitura')
const acoes = ler('lib/actions.ts')
const offline = ler('lib/actions-offline.ts')
const filaSrc = ler('lib/fila-offline.ts')
ok(/const resumoDoToken = \(token: string\) => resumo\(token\)/.test(offline) && /resumo\(`\$\{eventoId\}:\$\{cpf\.replace\(\/\\D\/g, ''\)\}`\)/.test(offline)
  && /resumo\(`\$\{eventoId\}:\$\{digitos\}`\)/.test(filaSrc) && /\.slice\(0, 32\)/.test(offline) && /\.slice\(0, 32\)/.test(filaSrc),
  'o resumo do QR e do CPF é a mesma conta no servidor e no aparelho (nada vai em texto)')
ok(/eventosEscaneaveis\(perfil\)\)\.some\(e => e\.id === eventoId\)/.test(offline) && /if \(perfil\.role === 'supervisor'\)/.test(offline), 'a lista guardada segue a régua do portão: só o evento que a conta opera hoje; supervisor, só a equipe dele')
const envio = acoes.slice(acoes.indexOf('export async function enviarBatidasGuardadas'), acoes.indexOf('/** O operador leu, viu a prévia e CANCELOU'))
ok(/\.sort\(\(a, b\) => String\(a\?\.lidoEm/.test(envio), 'aplica em ordem de horário')
ok(/Date\.now\(\) - lidoMs > GUARDADA_VALE_POR_MS/.test(envio) && /GUARDADA_VALE_POR_MS = 24 \* 60 \* 60 \* 1000/.test(acoes) && /lidoMs > Date\.now\(\) \+ 5 \* 60_000/.test(envio), 'recusa leitura de mais de 24h e leitura "no futuro" (relógio errado)')
ok(/validarLeituraQR\(eventoId, codigo, momento, false, [^)]*, \{ lidoEm \}\)/.test(envio) && /registroAssistido\([\s\S]{0,400}\{ lidoEm \}\)/.test(envio), 'QR e Registrar ponto passam pelas MESMAS regras de sempre, no instante da leitura')
ok(/r\.success \|\| r\.jaRegistrado === true/.test(envio), '"já registrada" conta como enviada (a resposta tinha se perdido)')
const autorizar = acoes.slice(acoes.indexOf('async function autorizarPresenca('), acoes.indexOf('function avisoDoAlerta('))
ok(/if \(guardado && escolhido && await leituraGuardadaJaGravada\(/.test(autorizar) && /\.eq\('created_at', lidoEmISO\)/.test(acoes), 'reenvio da mesma leitura não grava duas vezes (a batida tem a hora exata da leitura)')
ok(/if \(guardado\) \{\s*const maisNova = 'reabrir' in decidido/.test(autorizar), 'leitura guardada que chega depois de uma batida mais nova não reabre nem fecha turno fora de ordem')
ok(/\.\.\.\(guardado \? \{ created_at: agora\.toISOString\(\), recebido_em: new Date\(\)\.toISOString\(\) \} : \{\}\)/.test(autorizar), 'a batida grava a hora da LEITURA; recebido_em marca a chegada (é o "feita sem internet")')
ok(/!guardado \|\| Date\.now\(\) - agora\.getTime\(\) < 30 \* 60_000/.test(autorizar), 'lembrete do meio de leitura que chegou muito depois não é agendado (nada sai atrasado)')
const assistido = acoes.slice(acoes.indexOf('async function registroAssistido('), acoes.indexOf('export async function lancarPontoManual'))
ok(/if \(mesma && !ehVolta\) \{/.test(assistido) && /já estava registrada às/.test(assistido), 'Registrar ponto guardado não substitui o que outro portão já registrou')
ok(/diaDeReferencia\(evento, func\.id, momento, agora\)/.test(assistido) && /entradaDoTurno\(func\.id, evento\.id, agora\)/.test(assistido), 'o dia do turno é o da hora em que foi feito, não o do envio')
const upsert = acoes.slice(acoes.indexOf('async function upsertRegistro('), acoes.indexOf('async function upsertRegistro(') + 1800)
ok(/if \(r\.error && 'alerta' in linha && \/alerta\/\.test/.test(upsert) && /textoDoAlerta\(alerta/.test(upsert), 'sem a coluna nova (SQL não rodado), a batida é gravada assim mesmo, com a marca na justificativa')

// A entrada informada na saída: lançada ANTES da saída, marcada como manual, e quem já tem entrada não é erro.
ok(/if \(item\.tipo === 'entrada_informada'\) \{[\s\S]{0,700}lancarEntradaInformada\(String\(item\.funcionarioId \?\? ''\), hora, \{ agora: lidoEm, semInternet: true \}\)/.test(envio), 'servidor: o item "entrada informada" lança a entrada na hora da leitura da saída')
const entradaInf2 = acoes.slice(acoes.indexOf('async function lancarEntradaInformada('), acoes.indexOf('export async function registrarPresencaAssistida('))
ok(/if \(jaTem\?\.length\) return \{ ok: true, nome: func\.nome as string, jaTinha: true \}/.test(entradaInf2) && /nada a lançar/.test(envio), 'servidor: quem já tem a entrada do turno não é erro (outro portão registrou, ou a internet voltou no meio)')
ok(/diaDeReferencia\(evento, func\.id, 'fim', contexto\.agora\)/.test(entradaInf2) && /contexto\.agora\.getTime\(\) \+ \(contexto\.semInternet \? 0 : 60_000\)/.test(entradaInf2) && /ficaria depois da saída/.test(entradaInf2),
  'servidor: o dia do turno e o "tem que ser antes da saída" valem para a hora em que a saída foi lida')
ok(/registro_manual: true/.test(entradaInf2) && /informada no portão SEM INTERNET por \$\{perfil\.nome\}/.test(entradaInf2) && /'CORRECAO_PONTO'/.test(entradaInf2), 'servidor: a entrada fica marcada como lançada à mão, com o nome de quem informou, e na auditoria')
ok(/const r = await lancarEntradaInformada\(funcionarioId, horaEntrada\)[\s\S]{0,200}Esta pessoa já tem entrada neste turno/.test(acoes), 'a tela de sempre (com internet) continua recusando quem já tem entrada')

console.log('\n3 · As telas e o service worker')
const leitor = ler('app/scan/ScannerView.tsx')
ok(/if \(navigator\.onLine === false\) \{\s*await abrirSemInternet\(id, codigo, modoDaLeitura\)/.test(leitor) && /if \(previa\.semRede\) \{\s*await abrirSemInternet/.test(leitor), 'leitor: sem internet (ou pedido que não chega), abre a confirmação sem internet')
ok(/if \(c\.r\.offline\) \{[\s\S]{0,300}await mostrarGuardada\(/.test(leitor) && /if \(r\.semRede\) \{\s*await mostrarGuardada/.test(leitor), 'leitor: GUARDAR, e a internet que cai no SALVAR, guardam no aparelho')
ok(/Seguir sem internet/.test(leitor) && /if \(impedimento\) \{/.test(leitor), 'leitor: "Seguir sem internet" na demora; baixa/pendente recusados pela lista guardada')
const reg = ler('app/admin/localizar/LocalizarFuncionario.tsx')
ok(/if \(navigator\.onLine === false\) \{ void buscarSemInternet\(termo\); return \}/.test(reg) && /Guardar \{etapa === 'entrada' \? 'entrada' : comEntrada \? 'entrada e saída' : 'saída'\} neste aparelho/.test(reg), 'Registrar ponto: busca pelo CPF/nome na lista guardada e guarda a batida com a foto')
ok(/A pessoa não bateu a entrada\? Toque aqui para informar a hora/.test(leitor) && /c\.r\.offline && informandoEntrada && !horaDeEntradaValida\(horaEntrada\)\) return/.test(leitor) && /guardarNaFilaJuntos\(\[\s*entradaInformadaParaSaida\(/.test(leitor) && /r\.offline && !ehEntrada && r\.pessoaId && !r\.entradaNaFila/.test(leitor),
  'leitor: na SAÍDA sem internet, "A pessoa não bateu a entrada?" pede a hora e guarda entrada + saída juntas (só de quem está na lista guardada)')
ok(/etapa === 'fim' && !entradaJaGuardada/.test(reg) && /A pessoa não bateu a entrada\? Informar a hora/.test(reg) && /guardarNaFilaJuntos\(\[\s*entradaInformadaParaSaida\(/.test(reg) && /comEntrada && !horaDeEntradaValida\(horaEntrada\)/.test(reg),
  'Registrar ponto sem internet: na Saída, pede a hora da entrada (com a foto da saída) e guarda as duas juntas')
const sw = ler('public/sw.js')
ok(/if \(req\.method !== 'GET'\) return/.test(sw) && /url\.origin !== self\.location\.origin/.test(sw) && /PAGINAS = \['\/scan', '\/admin\/scanner', '\/admin\/localizar'\]/.test(sw),
  'service worker: só GET, só do próprio site, só as 3 telas do portão e /_next/static (ações e dados passam direto)')
ok(/!resp\.redirected/.test(sw) && /resp\.type === 'basic'/.test(sw), 'service worker: não guarda redirecionamento para o login nem resposta de outro site')
ok(/const ehPedidoDeDados = req => req\.headers\.get\('RSC'\) === '1'/.test(sw) && /if \(semInternetAgora\(\)\) return Response\.error\(\)/.test(sw) && /ESPERA_RSC_MS/.test(sw), 'service worker: a troca de tela falha rápido sem internet (o Next abre a tela pela navegação normal)')
ok(/if \(semInternetAgora\(\)\) \{\s*const guardada = await copiaDaTela\(url\)/.test(sw) && /aquecerTela/.test(sw) && /dados\.irmas/.test(sw), 'service worker: sem internet a cópia abre na hora, e as telas irmãs são guardadas com os arquivos delas')
const modo = ler('components/ModoSemInternet.tsx')
ok(/document\.addEventListener\('click', aoClicar, true\)/.test(modo) && /if \(!semRedeAgora\(\)\) return/.test(modo) && /location\.assign\(/.test(modo) && /'\/admin\/localizar': \['\/scan', '\/admin\/scanner'\]/.test(modo), 'sem internet, o clique numa tela do portão abre a cópia direto (com internet, nada muda)')
ok(/<ModoSemInternet eventoId=\{eventoId\} \/>/.test(leitor) && (reg.match(/<ModoSemInternet eventoId=\{eventoId\} \/>/g) ?? []).length === 2, 'o leitor e o Registrar ponto (inclusive na tela de "guardada") sabem em que evento estão')
ok(/pathname === '\/sw\.js'/.test(ler('proxy.ts')) && /source: '\/sw\.js'/.test(ler('next.config.ts')), 'o worker não passa pelo login e nunca vem de cache')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
