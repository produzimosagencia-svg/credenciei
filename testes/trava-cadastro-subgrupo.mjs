/*
 * TRAVA DE CADASTRO POR SUBGRUPO (pedido do Juan, 09/10/2026): dentro de cada subgrupo, travar e destravar o
 * cadastro de novas pessoas do subgrupo inteiro ou do evento inteiro, a qualquer hora; o fornecedor sozinho segue
 * no card dele. As três trancas valem juntas e são conferidas no formulário, no cartaz e no servidor.
 *
 * Roda com: node testes/trava-cadastro-subgrupo.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')

let falhas = 0
function ok(cond, nome) {
  if (!cond) falhas++
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}`)
}

const actions = ler('lib/actions.ts')
const internos = ler('lib/internos-servidor.ts')
const sql = ler('supabase/upgrade-cadastro-subevento.sql')

console.log('1 · banco e leitura tolerante')
ok(/alter table subeventos\s+add column if not exists cadastro_suspenso boolean not null default false/.test(sql), 'coluna nova, nasce aberta')
ok(/export async function subeventosComCadastroSuspenso/.test(internos) && /if \(error\) return new Set\(\)/.test(internos),
  'sem a coluna, ninguém fica travado (o cadastro não cai)')

console.log('\n2 · a tranca de verdade (servidor)')
const pub = actions.slice(actions.indexOf('const eventoSuspenso = Boolean('))
ok(/subgrupoSuspenso = \(await subeventosComCadastroSuspenso\(\[subeventoDoSetor\]\)\)\.size > 0/.test(pub), 'confere o subgrupo do fornecedor')
ok(/if \(\(setorSuspenso \|\| subgrupoSuspenso\) && !excecaoIndividualValida\)/.test(pub), 'recusa (o link individual do master continua passando)')

console.log('\n3 · o interruptor')
const acao = actions.slice(actions.indexOf('export async function alternarCadastroDoSubevento'))
ok(/const perfil = await exigirEventoDaOrg\(eventoId\)/.test(acao.slice(0, 600)), 'mesma permissão das outras travas')
ok(/sub\.evento_id !== eventoId/.test(acao.slice(0, 900)), 'o subgrupo precisa ser deste evento')
ok(/return \{ erro: mensagemAmigavel\(e\) \}/.test(acao.slice(0, 2200)), 'erro como valor (o Next esconde exceção em produção)')

console.log('\n4 · as telas')
ok(/subgrupoSuspenso\) && !excecaoIndividualValida/.test(ler('app/form/[token]/page.tsx')), 'formulário mostra "Cadastro encerrado"')
ok(/subgruposTravados\.has\(s\.subevento_id/.test(ler('app/portaria/[token]/page.tsx')), 'cartaz da portaria esconde os fornecedores do subgrupo travado')
const pagina = ler('app/admin/eventos/[id]/subevento/[sid]/page.tsx')
ok(/<TravaDeCadastro/.test(pagina) && /podeGerenciarEventos\(perfil\) && \(\s*<TravaDeCadastro/.test(pagina), 'painel dentro de cada subgrupo, para quem administra o evento')
const painel = ler('app/admin/eventos/[id]/subevento/[sid]/TravaDeCadastro.tsx')
ok(/alternarCadastroDoSubevento\(eventoId, subeventoId, !subgrupoTravado\)/.test(painel) && /alternarCadastroPorLink\(eventoId, !eventoTravado\)/.test(painel),
  'trava o subgrupo e o evento inteiro, nos dois sentidos')
ok(/travados\.includes\(s\.id\)/.test(ler('app/admin/eventos/[id]/SubeventosCard.tsx')), 'selo "travado" no card do subgrupo, na tela do evento')

console.log('\n5 · "ninguém se cadastra": planilha, sistema, IA e pedido de setor também')
ok(/export async function motivoCadastroTravado/.test(internos), 'conferência única (evento, subgrupo, fornecedor)')
ok(/travasDeCadastroDoEvento\(eventoId\)[\s\S]{0,900}status: 423/.test(ler('lib/importacao.ts')), 'planilha de funcionários recusa')
ok(/aplicarTravasNaEstrutura\(eventoId, planejarEstrutura/.test(actions) && (actions.match(/aplicarTravasNaEstrutura\(eventoId, planejarEstrutura/g) ?? []).length === 2,
  'planilha de estrutura: a prévia e a gravação marcam as linhas travadas')
const criarForn = actions.slice(actions.indexOf('async function criarFornecedorOuLanca('))
ok(/motivoCadastroTravado\(eventoId, \{ subeventoId: [^}]*oQue: 'setores' \}\)/.test(criarForn.slice(0, 3000)), 'novo fornecedor pela tela (e aprovação de pedido) recusa')
const criarSup = actions.slice(actions.indexOf('async function criarSupervisorOuLanca('))
ok(/if \(!fichaNoEvento\?\.length\) \{\s*const travado = await motivoCadastroTravado/.test(criarSup.slice(0, 4000)), 'supervisor novo no evento recusa; quem já está no evento passa')
const atribuir = actions.slice(actions.indexOf('export async function atribuirColaboradorAoEvento('))
ok(/motivoCadastroTravado\(setor\.evento_id as string, \{ fornecedorId \}\)/.test(atribuir.slice(0, 2000)), 'atribuir da base recusa')
ok(/motivoCadastroTravado/.test(ler('lib/ia/ferramentas/setores.ts')) && /motivoCadastroTravado/.test(ler('lib/ia/ferramentas/funcionarios.ts')), 'IA não cria setor nem pessoa')
ok(/cadastroTravado = travas\.evento/.test(ler('app/pedido-setor/[token]/page.tsx')) && /travas\.subgrupos\.has\(x\.subeventoId\)/.test(ler('lib/actions-pedidos-setor.ts')),
  'link de pedido de setor: fecha com o evento travado e esconde/recusa subgrupo travado')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
