/*
 * FUNÇÃO NA EQUIPE (pedido do Juan, 09/10/2026): na ficha da pessoa, "Função" é Colaborador, Encarregado ou
 * Supervisor, e mudar a função muda o ACESSO na hora, sem tirar ninguém da equipe. O link vai uma vez por evento.
 * Quem muda: supervisor do setor, administrador e master.
 *
 * Texto cru (lib/actions.ts não pode ser live-importado) + import direto das regras puras.
 *
 * Roda com: node testes/funcao-na-equipe.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')
const { FUNCOES_NA_EQUIPE, cargoAcompanhaFuncao, ehFuncaoNaEquipe, rotuloDaFuncao } = await import(raiz + 'lib/funcao-na-equipe.ts')

let falhas = 0
function ok(cond, nome) {
  if (!cond) falhas++
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}`)
}

const actions = ler('lib/actions.ts')
const enc = ler('lib/actions-encarregado.ts')
const internos = ler('lib/internos-servidor.ts')
const modal = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal.tsx')
const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
const corpo = actions.slice(actions.indexOf('export async function definirFuncaoNaEquipe'))
const fim = corpo.indexOf('\n}\n')
const acao = corpo.slice(0, fim)

console.log('1 · as três funções')
ok(FUNCOES_NA_EQUIPE.map(f => f.valor).join(',') === 'colaborador,encarregado,supervisor', 'Colaborador, Encarregado e Supervisor, nessa ordem')
ok(ehFuncaoNaEquipe('supervisor') && !ehFuncaoNaEquipe('admin'), 'só aceita as três')
ok(rotuloDaFuncao('encarregado') === 'Encarregado', 'rótulo')
ok(cargoAcompanhaFuncao('') && cargoAcompanhaFuncao('Supervisor') && !cargoAcompanhaFuncao('Bartender'),
  'o cargo acompanha só quando vazio ou nome de função — "Bartender" não é sobrescrito')

console.log('\n2 · quem pode')
ok(/ehMaster\(perfil\.role\)\s*\|\|\s*\(podeGerenciarUsuarios\(perfil\) && !!organizacaoId && organizacaoId === perfil\.organizacao_id\)/.test(acao),
  'master e administrador da organização')
ok(/\(await meusSetores\(perfil\)\)\.some\(s => s\.id === fornecedorId\)/.test(acao), 'supervisor DESTE setor')
ok(/Você não pode mudar a sua própria função/.test(acao), 'ninguém muda a própria função')
ok(/const podeMudarFuncao = ehMaster\(perfil\.role\)/.test(pagina) && /podeMudarFuncao=\{podeMudarFuncao\}/.test(pagina),
  'a tela usa a mesma régua')
ok(/\{podeMudarFuncao && \(/.test(modal), 'o lápis da função só aparece pra quem pode')

console.log('\n3 · conferências antes de mexer em qualquer acesso')
const conf = acao.indexOf('── Conferências')
const sai = acao.indexOf('── 1. Sai da função')
ok(conf > 0 && sai > conf, 'conferências vêm antes de tirar a função de hoje')
ok(/status_credenciamento !== 'aprovado'/.test(acao.slice(conf, sai)), 'Encarregado exige credenciamento aprovado (salvarEncarregado recusaria depois)')
ok(/encarregadosHabilitado/.test(acao.slice(conf, sai)), 'Encarregado exige a funcionalidade ligada')

console.log('\n4 · continua na equipe')
ok(/if \(func\.origem === 'supervisor'\) await supabaseAdmin\.from\('funcionarios'\)\.update\(\{ origem: 'equipe' \}\)/.test(acao),
  'crachá de supervisor vira da equipe antes de tirar o vínculo (senão iria embora junto)')
ok(!/\.delete\(\)[\s\S]{0,40}from\('funcionarios'\)|from\('funcionarios'\)\.delete/.test(acao), 'nunca apaga a ficha')

console.log('\n5 · o acesso acompanha')
ok(/tirarSupervisorDoSetor\(conta\.id, fornecedorId, perfil\)/.test(acao), 'deixa de ser supervisor: perde o vínculo do setor')
ok(/update\(\{ ativo: false \}\)\.eq\('id', conta\.id\)/.test(acao), 'sem setor nenhum (e sem outra função): conta desativada')
ok(/criarSupervisorOuLanca\(fornecedorId, eventoId, dados, perfil\)/.test(acao), 'vira supervisor: mesmo caminho do "criar supervisor"')
ok(/alterarEncarregadoNoSetor\(funcionarioId, eventoId, fornecedorId, true\)/.test(acao)
  && /alterarEncarregadoNoSetor\(funcionarioId, eventoId, fornecedorId, false\)/.test(acao), 'Encarregado liga e desliga só neste setor')
ok(/gravarEscalaAprovada\(\{ funcionarioId, eventoId, aprovados: disponiveis/.test(acao), 'supervisor sai liberado em todos os dias')

console.log('\n6 · o link vai uma vez por evento')
ok(/export async function jaRecebeuMensagemNoEvento/.test(internos), 'checagem compartilhada pela fila de mensagens')
ok(/jaRecebeuMensagemNoEvento\(telefone, eventoId, \['supervisor_escalado_evento', 'cadastro_supervisor_cpf_link'\]\)/.test(actions),
  'supervisor: qualquer um dos dois avisos conta')
ok(/jaRecebeuMensagemNoEvento\(\[telefone, func\.telefone as string \| null\], evento\.id, \['cadastro_encarregado_cpf_link'\]\)/.test(enc)
  && /if \(primeiroAcesso && perfilId && !jaTinhaLink\)/.test(enc), 'Encarregado: não reenvia quem já recebeu neste evento')

console.log('\n7 · a ficha')
ok(/<p className="text-slate-400 text-xs">Cargo<\/p>/.test(modal), 'o cargo de verdade continua, como "Cargo"')
ok(!/Tornar \{f\.nome/.test(modal), 'o botão antigo "Tornar supervisor" saiu (a Função cobre)')
ok(/<SecaoEscala key=\{funcaoAtual\}/.test(modal), 'os dias recarregam quando a função muda')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
