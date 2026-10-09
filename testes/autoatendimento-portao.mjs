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
const config = ler('app/admin/eventos/[id]/editar/ConfiguracaoDoAutoatendimento.tsx')
const autoatendimentoLib = ler('lib/autoatendimento.ts')
const sql = ler('supabase/upgrade-autoatendimento-portao.sql')

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

console.log('\n3 · registrarPresencaLivre: bloqueado por padrão, liberado só na janela E no dia certo')
confere('consulta autoatendimentoLiberadoAgora(eventoId, diaDoTurno) antes de decidir',
  /const autoatendimentoLiberado = await autoatendimentoLiberadoAgora\(eventoId, await diaDoTurno\(eventoId\)\)/.test(actions), true)
confere('fora da janela, continua recusando (ENTRADA_E_SAIDA_SO_PELO_OPERADOR)',
  /if \(!autoatendimentoLiberado\) \{\s*if \(ENTRADA_E_SAIDA_SO_PELO_OPERADOR\) \{/.test(actions), true)
confere('dentro da janela, a saída (momento === "fim") deixa de ser recusada incondicionalmente',
  !/if \(momento === 'fim'\) \{\s*return \{ error: 'A saída ainda precisa ser feita mostrando o QR Code no credenciamento\.' \}\s*\}\s*\n\s*\/\/ Mesmo teto/.test(actions), true)

console.log('\n4 · geolocalização obrigatória na janela de autoatendimento')
confere('recusa sem latitude/longitude quando liberado',
  /if \(autoatendimentoLiberado && \(typeof latitude !== 'number' \|\| typeof longitude !== 'number'\)\) \{\s*return \{ error:/.test(actions), true)

console.log('\n4b · NO DIA PRINCIPAL, autoatendimento nunca funciona — só o operador (correção do Juan, 08/10/2026)')
confere('a checagem de dia principal não tem mais a exceção "!autoatendimentoLiberado &&" na frente',
  !/if \(!autoatendimentoLiberado && resolucao\.diaPrincipal/.test(actions), true)
confere('dia principal bloqueia incondicionalmente (exceto o checkin_autonomo antigo)',
  /if \(resolucao\.diaPrincipal && evento\.checkin_autonomo !== true\) \{\s*return \{ error: 'No dia do evento/.test(actions), true)
confere('a credencial some com o botão no dia principal, mesmo com a janela ligada',
  /const podeAutoRegistrar = !ehPrincipalHoje && await autoatendimentoLiberadoAgora\(evento\?\.id \?\? null, dataRef\)/.test(credencial), true)

console.log('\n5 · auditoria específica do registro feito nessa janela')
confere("registro sob autoatendimento grava 'REGISTRO_AUTOATENDIMENTO'",
  /acao: 'REGISTRO_AUTOATENDIMENTO'/.test(actions), true)
confere('só quando autoatendimentoLiberado (não a cada entrada/saída comum)',
  /if \(autoatendimentoLiberado && registro\) \{/.test(actions), true)

console.log('\n6 · configuração própria (igual ConfiguracaoDoMeio), não mais dentro do <form> grande do evento')
confere('editarEvento NÃO tem mais o campo sentinela autoatendimento_presente (saiu pra ação própria)',
  !actions.includes("formData.has('autoatendimento_presente')"), true)
confere('editar/page.tsx usa o componente ConfiguracaoDoAutoatendimento', editarPage.includes('<ConfiguracaoDoAutoatendimento'), true)
confere('salvarConfiguracaoDoAutoatendimento grava habilitado/início/fim',
  /export async function salvarConfiguracaoDoAutoatendimento[\s\S]{0,700}?autoatendimento_habilitado: dados\.habilitado/.test(actions), true)
confere('exige início E fim quando habilitado', /Para ligar o autoatendimento, informe o horário de início e de fim\./.test(actions), true)
confere('grava auditoria própria da configuração', /auditar\(perfil, 'AUTOATENDIMENTO_CONFIGURADO'/.test(actions), true)

console.log('\n6b · "mais de um dia" — jornada_dias.autoatendimento_dia, nunca no dia principal')
confere('migração tem a coluna por dia', /autoatendimento_dia boolean not null default false/.test(sql), true)
confere('diasAutoatendimentoDoEvento nunca marca o dia principal como habilitado',
  /habilitado: tipo !== 'principal' && d\.autoatendimento_dia === true/.test(autoatendimentoLib), true)
confere('diaPermiteAutoatendimento também recusa o dia principal',
  /return data\.tipo !== 'principal' && data\.autoatendimento_dia === true/.test(autoatendimentoLib), true)
confere('ativarAutoatendimentoPortao recusa fora do dia marcado',
  /if \(!\(await diaPermiteAutoatendimento\(eventoId, dia\)\)\) \{/.test(actions), true)
confere('a tela de configuração usa o DateTimePicker do sistema (não <input type="time">)',
  config.includes('<DateTimePicker') && !config.includes('type="time"'), true)
confere('a tela de configuração deixa marcar vários dias (grade de chips, mesmo padrão de ConfiguracaoDoMeio)',
  config.includes('config.dias.map(d =>') && config.includes('alternarDia'), true)

console.log('\n7 · tela do operador: botão só aparece quando o evento tem a função ligada')
confere('ScannerRouter renderiza o botão nos dois modos (qr e rosto)',
  (scannerRouter.match(/<AutoatendimentoBotao eventoId=\{eventoAtivo\} \/>/g) || []).length === 2, true)
confere("tela 'Bem-vindo' do operador também mostra o botão, com a descrição embaixo (pedido do Juan, 08/10/2026)",
  ler('app/admin/bem-vindo/page.tsx').includes('<AutoatendimentoBotao eventoId={e.id} tema="claro" />'), true)
confere('o componente não renderiza nada sem status.habilitado (sem recurso = sem botão)',
  /if \(!status\?\.habilitado\) return null/.test(botao), true)
confere('a descrição do que o botão faz fica sempre visível, não só depois de ativar',
  /Ative só quando for embora/.test(botao), true)
confere('ativar chama o servidor e refaz o status (não assume sucesso sem reconferir)',
  /const s = await statusAutoatendimentoPortao\(eventoId\)/.test(botao), true)

console.log('\n8 · credencial: a saída deixou de ser bloqueada incondicionalmente na tela')
confere('podeAutoRegistrar não é mais fixo em false', !credencial.includes('podeAutoRegistrar={false}'), true)
confere('a tela calcula a partir da janela de autoatendimento (e nunca no dia principal)',
  /const podeAutoRegistrar = !ehPrincipalHoje && await autoatendimentoLiberadoAgora\(evento\?\.id \?\? null, dataRef\)/.test(credencial), true)
confere("CheckinPresenca não trava mais 'fim' separado de podeAutoRegistrar",
  !/info\.momento !== 'fim' && podeAutoRegistrar/.test(checkin), true)

console.log('\n9 · botão único no lugar do QR quando o autoatendimento está liberado (pedido do Juan, 08/10/2026)')
confere('a credencial troca o QR pelo BotaoRegistroAutomatico', /modoBotaoUnico \? \(\s*<BotaoRegistroAutomatico token=\{token\} proximo=\{proximoRegistro\} entradaEm=/.test(credencial), true)
confere('trava de 5 minutos entre entrada e saída no servidor', actions.includes('const INTERVALO_MINIMO_SAIDA_MS = 5 * 60 * 1000') && /Date\.now\(\) < liberaEm\.getTime\(\)/.test(actions), true)
confere('o botão de saída fica travado com contagem regressiva', /disabled=\{!!enviando \|\| travado\}/.test(checkin) && checkin.includes('A saída libera em'), true)
confere('o sistema decide sozinho: entrada sem saída → saída; senão entrada',
  credencial.includes("const proximoRegistro: 'entrada' | 'fim' | null = !entradaFeita ? 'entrada' : !saidaFeita ? 'fim' : null"), true)
confere('os cartões de entrada/saída ainda não feitos somem (um caminho só na tela)', credencial.includes('ocultarEntradaSaida={modoBotaoUnico}'), true)
confere('no botão único, o cartão do MEIO continua (mesma regra: só se o setor e o dia pedem o meio)',
  checkin.includes("momentos.filter(m => !ocultarEntradaSaida || m.momento === 'meio' || m.status === 'feito')")
  && /\.filter\(\(\{ momento \}\) => momento !== 'meio' \|\| exigeMeio \|\| feitoMap\.meio\)/.test(credencial), true)
confere('entrada pelo próprio celular também agenda o lembrete do meio',
  /if \(momento === 'entrada' && func\.telefone\) \{\s*after\(\(\) =>\s*agendarMeioAposEntrada/.test(actions), true)
confere('recusa aparece num aviso em modal, com X e o motivo (fora do local / localização / espera)',
  /function AvisoRecusa/.test(checkin) && checkin.includes('aria-label="Fechar"') && checkin.includes("'Você está fora do local do evento'")
  && checkin.includes('<AvisoRecusa'), true)
confere('o botão exige localização antes de enviar', /if \(!posicao\) \{[\s\S]{0,300}?return/.test(checkin), true)

console.log('\n10 · batida pelo celular fora do raio do evento é recusada (e a tentativa fica registrada)')
confere('compara com o local do evento (avaliarLocal)', /const \{ distanciaM, foraDoLocal \} = avaliarLocal\(posicaoPropria, localEvento\)/.test(actions), true)
confere("tentativa recusada vai para leituras_qr com resultado 'fora_do_local'",
  /resultado: 'fora_do_local',\s*mensagem: `Autoatendimento pelo celular/.test(actions), true)
confere('batida aceita também é marcada com a distância', actions.includes('after(() => marcarLocalDaBatida(registro.id as string, eventoId, posicaoPropria))'), true)

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
