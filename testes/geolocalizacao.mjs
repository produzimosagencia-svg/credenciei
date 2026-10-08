/*
 * LOCALIZAÇÃO DO OPERADOR EM TODA LEITURA (pedido do Juan, 08/10/2026). Scanner (QR e rosto) e Registro de ponto
 * gravam onde o aparelho do operador estava; fora do raio do local do evento a batida vale, mas fica marcada para a
 * conferência interna (só admin/master veem). O operador é obrigado a ter a localização ligada; o colaborador não
 * vê nada disso.
 *
 * Roda com: node testes/geolocalizacao.mjs
 */
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

register('./_hook-ts.mjs', import.meta.url)
const G = await import('../lib/geo-local.ts')

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const sambao = { latitude: -20.3157, longitude: -40.3584, raioM: 800 }
console.log('Regra')
ok(G.distanciaMetros(sambao, sambao) === 0, 'mesmo ponto = 0 m')
const aribiri = { latitude: -20.3530, longitude: -40.3200 } // Grande Aribiri (Vila Velha)
ok(G.distanciaMetros(sambao, aribiri) > 5000, 'Sambão → Aribiri dá mais de 5 km')
ok(G.avaliarLocal({ latitude: -20.3160, longitude: -40.3586, precisao: 20 }, sambao).foraDoLocal === false, 'no estádio: dentro do local')
ok(G.avaliarLocal({ ...aribiri, precisao: 15 }, sambao).foraDoLocal === true, 'em Aribiri: fora do local')
const naBorda = { latitude: -20.3157 + 0.0081, longitude: -40.3584, precisao: 250 } // ~900 m, com 250 m de erro
ok(G.avaliarLocal(naBorda, sambao).foraDoLocal === false, 'a imprecisão do GPS conta a favor (não marca fora por erro do aparelho)')
ok(G.avaliarLocal(null, sambao).foraDoLocal === null && G.avaliarLocal({ latitude: -20, longitude: -40 }, null).foraDoLocal === null, 'sem posição ou sem local configurado: não afirma nada')
ok(G.posicaoValida({ latitude: 0, longitude: 0 }) === null && G.posicaoValida({ latitude: 'x' }) === null && G.posicaoValida({ latitude: -20.3, longitude: -40.3, precisao: 12.7 })?.precisao === 13, 'posição inválida é descartada; precisão arredondada')
ok(G.descreverDistancia(3200) === 'a 3,2 km do local' && G.descreverDistancia(450) === 'a 450 m do local', 'texto da distância')

console.log('\nLigação')
const acoes = ler('lib/actions.ts')
ok(/local\?: Posicao \| null/.test(acoes) && /gravarLeituraQR\(\{ eventoId, perfilId, tipo: 'credencial', qrData, resultado: final, local \}\)/.test(acoes), 'toda leitura do scanner grava a localização no histórico de leituras')
ok(/criado_por_perfil_id: perfil\.id,\s*\n\s*origem,/.test(acoes), 'a batida do scanner grava QUEM leu (qualquer papel)')
ok((acoes.match(/marcarLocalDaBatida\(/g) ?? []).length >= 3, 'scanner/rosto e Registro de ponto marcam a batida com distância e "fora do local"')
ok(/latitude\|longitude\|precisao_m\|distancia_m\|fora_do_local/.test(acoes), 'sem a migração, a leitura grava como antes')
for (const [arq, nome] of [['app/scan/ScannerView.tsx', 'leitor de QR'], ['app/scan/FaceScannerView.tsx', 'leitor de rosto'], ['app/admin/localizar/LocalizarFuncionario.tsx', 'Registro de ponto']]) {
  const t = ler(arq)
  ok(/useLocalizacaoOperador\(\)/.test(t) && /<BloqueioSemLocalizacao/.test(t), `${nome}: localização obrigatória (sem ela, aviso e leitor bloqueado)`)
}
ok(!/useLocalizacaoOperador|BloqueioSemLocalizacao/.test(ler('app/credential/[token]/page.tsx') + ler('app/credential/[token]/CheckinPresenca.tsx')), 'a credencial do colaborador não mostra nenhum aviso de localização')
ok(/ehMaster\(perfil\.role\) \|\| perfil\.role === 'admin'/.test(ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')), '"fora do local" só aparece para admin/master')
ok(/local_raio_m integer not null default 800/.test(ler('supabase/upgrade-geolocalizacao-operador.sql')), 'migração: local do evento com raio padrão de 800 m')


console.log('\nO mapa (Editar evento): pino, raio por evento e endereço')
const mapa = ler("app/admin/eventos/[id]/editar/LocalNoMapa.tsx")
ok(/import\('leaflet'\)/.test(mapa), 'usa um mapa de verdade (Leaflet), não só um texto de lat/lng')
ok(/L\.circle\(\[lat, lng\], \{/.test(mapa) && /radius: raioM/.test(mapa), 'desenha o círculo do raio em volta do pino')
ok(/draggable: true/.test(mapa) && /mapa\.on\('click'/.test(mapa), 'o pino se move arrastando ou tocando no mapa')
ok(/value={raioM}/.test(mapa) && !/const raioM = 800\b/.test(mapa), 'o raio é um campo editável por evento, não um número fixo')
ok(/obterEnderecoAproximado\(lat, lng\)/.test(mapa), 'busca o endereço do ponto (mostrado acima do mapa)')
ok(/obterEnderecoAproximado/.test(ler('lib/actions.ts')) && /podeGerenciarEventos\(perfil\)/.test(ler('lib/actions.ts').slice(ler('lib/actions.ts').indexOf('export async function obterEnderecoAproximado'))), 'o endereço só é buscado por quem gerencia eventos')


console.log('\nMeio assistido também espera as 4 horas desde a entrada (VITAL, 08/10/2026: era registrado minutos depois)')
const iniAssistida = acoes.indexOf('export async function registrarPresencaAssistida')
const fimAssistida = acoes.indexOf('\nexport ', iniAssistida + 10)
const assistida = acoes.slice(iniAssistida, fimAssistida)
ok(/if \(momento === 'meio'\) \{\s*\n\s*const entradaDoMeio = await entradaDoTurno/.test(assistida), 'o registro assistido confere a janela do meio antes de salvar a foto')
ok(assistida.indexOf("momento === 'meio'") < assistida.indexOf('.upload('), 'a checagem vem ANTES do upload da foto (não desperdiça a foto numa tentativa recusada)')
ok(/O meio só abre 4 horas depois da entrada/.test(assistida), 'o operador vê o horário exato em que pode registrar')

console.log('\nAlerta de "fora do local" para quem administra')
const alerta = ler('lib/alertas-local.ts')
ok(/fora_do_local', true\)/.test(alerta) && /\.eq\('data_ref', diaBRT\(\)\)/.test(alerta), 'busca as batidas de HOJE marcadas fora do local')
const pagina = ler('app/admin/eventos/[id]/page.tsx')
ok(/ehMaster\(perfil\?\.role\) \|\| perfil\?\.role === 'admin'/.test(pagina) && /batidasForaDoLocalHoje\(id\)/.test(pagina), 'o alerta só é buscado para quem administra o evento')
ok(/<AlertaForaDoLocal/.test(pagina), 'o alerta aparece na tela do evento')

console.log('\nO campo "Local" do evento passa a ser o endereço (preenchido pelo mapa)')
ok(/name="local" required value={local}/.test(mapa), 'o campo Local vira o endereço, preenchido pelo mapa')
ok(/if \(e && !localTocadoPeloUsuario\) setLocal\(e\)/.test(mapa), 'o endereço achado no mapa preenche o campo, a não ser que o admin já tenha editado à mão')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
