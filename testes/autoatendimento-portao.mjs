/*
 * "Estou indo embora" / "Cheguei" e a re-liberação condicional de `registrarPresencaLivre` (lib/actions.ts) —
 * texto cru, mesmo padrão de testes/geolocalizacao.mjs e testes/dias-obrigatorios.mjs: lib/actions.ts importa o
 * cliente de serviço do Supabase no topo e não pode ser live-importado sem variáveis de ambiente.
 *
 * Roda com: node testes/autoatendimento-portao.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')

const actions = ler('lib/actions.ts')
const scannerRouter = ler('app/scan/ScannerRouter.tsx')
const botao = ler('components/AutoatendimentoBotao.tsx')
const credencial = ler('app/credential/[token]/page.tsx')
const checkin = ler('app/credential/[token]/CheckinPresenca.tsx')
const editarPage = ler('app/admin/eventos/[id]/editar/page.tsx')

let falhas = 0
function confere(nome, recebido, esperado) {
  const ok = recebido === esperado
  if (!ok) falhas++
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}${ok ? '' : ` — esperado ${esperado}, veio ${recebido}`}`)
}

console.log('1 · ativar/desativar exigem acesso ao evento (podeEscanearEvento)')
confere('ativarAutoatendimentoPortao confere podeEscanearEvento',
  /export async function ativarAutoatendimentoPortao[\s\S]{0,300}?podeEscanearEvento\(perfil, eventoId\)/.test(actions), true)
confere('desativarAutoatendimentoPortao confere podeEscanearEvento',
  /export async function desativarAutoatendimentoPortao[\s\S]{0,300}?podeEscanearEvento\(perfil, eventoId\)/.test(actions), true)
confere('ativar recusa se o evento não tem a função ligada',
  /if \(!cfg\.habilitado\) return \{ erro: 'Este evento não tem essa função ligada/.test(actions), true)

console.log('\n2 · ativar/desativar registram auditoria (régua de cobertura)')
confere("ativar grava 'AUTOATENDIMENTO_ATIVADO'", /auditar\(perfil, 'AUTOATENDIMENTO_ATIVADO'/.test(actions), true)
confere("desativar grava 'AUTOATENDIMENTO_DESATIVADO'", /auditar\(perfil, 'AUTOATENDIMENTO_DESATIVADO'/.test(actions), true)
confere("os dois códigos têm rótulo em auditoria-rotulos.ts",
  /AUTOATENDIMENTO_ATIVADO: /.test(ler('lib/auditoria-rotulos.ts')) && /AUTOATENDIMENTO_DESATIVADO: /.test(ler('lib/auditoria-rotulos.ts')), true)

console.log('\n3 · registrarPresencaLivre: bloqueado por padrão, liberado só na janela')
confere('consulta autoatendimentoLiberadoAgora(eventoId) antes de decidir',
  /const autoatendimentoLiberado = await autoatendimentoLiberadoAgora\(eventoId\)/.test(actions), true)
confere('fora da janela, continua recusando (ENTRADA_E_SAIDA_SO_PELO_OPERADOR)',
  /if \(!autoatendimentoLiberado\) \{\s*if \(ENTRADA_E_SAIDA_SO_PELO_OPERADOR\) \{/.test(actions), true)
confere('dentro da janela, a saída (momento === "fim") deixa de ser recusada incondicionalmente',
  !/if \(momento === 'fim'\) \{\s*return \{ error: 'A saída ainda precisa ser feita mostrando o QR Code no credenciamento\.' \}\s*\}\s*\n\s*\/\/ Mesmo teto/.test(actions), true)

console.log('\n4 · geolocalização obrigatória na janela de autoatendimento')
confere('recusa sem latitude/longitude quando liberado',
  /if \(autoatendimentoLiberado && \(typeof latitude !== 'number' \|\| typeof longitude !== 'number'\)\) \{\s*return \{ error:/.test(actions), true)

console.log('\n5 · auditoria específica do registro feito nessa janela')
confere("registro sob autoatendimento grava 'REGISTRO_AUTOATENDIMENTO'",
  /acao: 'REGISTRO_AUTOATENDIMENTO'/.test(actions), true)
confere('só quando autoatendimentoLiberado (não a cada entrada/saída comum)',
  /if \(autoatendimentoLiberado && registro\) \{/.test(actions), true)

console.log('\n6 · editar evento: config tolerante (habilitado + início/fim), mesmo padrão do tutorial_habilitado')
confere("campo sentinela autoatendimento_presente", editarPage.includes("name=\"autoatendimento_presente\""), true)
confere('editarEvento grava tolerante (try/catch isolado, não derruba o resto do salvar)',
  /if \(formData\.has\('autoatendimento_presente'\)\) \{[\s\S]{0,600}?erroAuto/.test(actions), true)
confere('exige início E fim quando habilitado', /Para ligar o autoatendimento, informe o horário de início e de fim\./.test(actions), true)

console.log('\n7 · tela do operador (/scan): botão só aparece quando o evento tem a função ligada')
confere('ScannerRouter renderiza o botão nos dois modos (qr e rosto)',
  (scannerRouter.match(/<AutoatendimentoBotao eventoId=\{eventoAtivo\} \/>/g) || []).length === 2, true)
confere('o componente não renderiza nada sem status.habilitado (sem recurso = sem botão)',
  /if \(!status\?\.habilitado\) return null/.test(botao), true)
confere('ativar chama o servidor e refaz o status (não assume sucesso sem reconferir)',
  /const s = await statusAutoatendimentoPortao\(eventoId\)/.test(botao), true)

console.log('\n8 · credencial: a saída deixou de ser bloqueada incondicionalmente na tela')
confere('podeAutoRegistrar não é mais fixo em false', !credencial.includes('podeAutoRegistrar={false}'), true)
confere('a tela calcula a partir da janela de autoatendimento',
  /const podeAutoRegistrar = await autoatendimentoLiberadoAgora\(evento\?\.id \?\? null\)/.test(credencial), true)
confere("CheckinPresenca não trava mais 'fim' separado de podeAutoRegistrar",
  !/info\.momento !== 'fim' && podeAutoRegistrar/.test(checkin), true)

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
