/*
 * MONTE SUA EQUIPE (Juan, 18/10/2026): o supervisor vê quem já trabalhou com ele em outros eventos e adiciona várias
 * pessoas de uma vez, sem recadastro — cada uma passando pelas conferências do cadastro de hoje.
 *
 * 1. As regras (lib/historico-supervisor-regras.ts) de verdade, com dados de exemplo.
 * 2. O servidor (lib/actions-historico.ts) e a tela, pelo código-fonte.
 *
 * Roda com: node testes/monte-sua-equipe.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const R = await import(raiz + 'lib/historico-supervisor-regras.ts')

console.log('1 · Quem aparece e se pode entrar')
const ORG = 'org-q2', OUTRA = 'org-fatto'
const equipes = new Map([
  ['e-hj', { id: 'e-hj', nome: 'SEGURANÇA', eventoId: 'ev-hj', eventoNome: 'Henrique e Juliano', eventoData: '2026-09-05T20:00:00Z', organizacaoId: OUTRA }],
  ['e-vital', { id: 'e-vital', nome: 'BAR', eventoId: 'ev-vital', eventoNome: 'VITAL', eventoData: '2026-10-10T20:00:00Z', organizacaoId: ORG }],
])
const ficha = (id, cpf, nome, fornecedorId, extra = {}) => ({
  id, cpf, nome, cargo: 'Vigilante', cidade: 'Vitória', telefone: '27999990000', chavePix: null, fotoPath: `foto/${id}.jpg`,
  fornecedorId, criadoEm: fornecedorId === 'e-hj' ? '2026-09-01T10:00:00Z' : '2026-10-05T10:00:00Z', consentimento: false, ...extra,
})
const fichas = [
  ficha('a1', '11111111111', 'Ana Antiga', 'e-hj', { cargo: 'Fiscal' }), ficha('a2', '11111111111', 'Ana Atual', 'e-vital'),
  ficha('b1', '22222222222', 'Bia Fora Com Aceite', 'e-hj', { consentimento: true }),
  ficha('c1', '33333333333', 'Caio Fora Sem Aceite', 'e-hj'),
  ficha('d1', '44444444444', 'Davi Na Equipe', 'e-vital'),
  ficha('e1', '55555555555', 'Eva Em Outra', 'e-vital'),
  ficha('f1', '66666666666', 'Fabio Baixa Aqui', 'e-vital'),
  ficha('g1', '77777777777', 'Gil Baixa Em Outra', 'e-vital'),
  ficha('h1', '88888888888', 'Hugo Bloqueado', 'e-vital'),
  ficha('i1', '99999999999', 'Iara Telefone Generico', 'e-vital', { telefone: '2700000000' }),
  ficha('x1', '123', 'CPF Quebrado', 'e-vital'),
  ficha('z1', '10101010101', 'Zé De Equipe Desconhecida', 'e-sumiu'),
]
const { pessoas, ocultasSemAceite } = R.montarHistorico({
  fichas, equipes,
  diasPorFicha: new Map([['a1', 2], ['a2', 3], ['b1', 1], ['d1', 1]]),
  consentimentoNaBase: new Map([['44444444444', true]]),
  noEventoNovo: [
    { cpf: '44444444444', fornecedor_id: 'ALVO', descredenciado_em: null, equipe: 'SEGURANÇA LUAN' },
    { cpf: '55555555555', fornecedor_id: 'OUTRA-EQ', descredenciado_em: null, equipe: 'RED LINE' },
    { cpf: '66666666666', fornecedor_id: 'ALVO', descredenciado_em: '2026-10-17T00:00:00Z', equipe: 'SEGURANÇA LUAN' },
    { cpf: '77777777777', fornecedor_id: 'OUTRA-EQ', descredenciado_em: '2026-10-17T00:00:00Z', equipe: 'RED LINE' },
  ],
  bloqueados: new Set(['88888888888']),
  fornecedorAlvo: 'ALVO', organizacaoAlvo: ORG,
})
const por = nomeParcial => pessoas.find(p => p.nome.includes(nomeParcial))
const ana = por('Ana')
ok(ana && ana.cpf === '11111111111' && ana.participacoes.length === 2 && ana.diasTrabalhados === 5, 'a mesma pessoa em dois eventos vira UMA linha, com os dois eventos e os dias somados')
ok(ana.nome === 'Ana Atual' && ana.chave === 'a2' && ana.participacoes[0].evento === 'VITAL', 'os dados vêm da ficha mais recente; eventos do mais novo para o mais antigo')
ok(ana.fotoPath && !ana.outraOrganizacao, 'mesma organização: com foto')
const bia = por('Bia')
ok(bia && bia.outraOrganizacao && bia.fotoPath === null, 'outra organização com aceite: aparece, SEM foto')
ok(!por('Caio') && ocultasSemAceite === 1, 'outra organização sem aceite: não aparece (só conta)')
ok(por('Davi').situacao === 'na_equipe', 'quem já está na equipe nova: "já está na equipe"')
ok(por('Eva').situacao === 'em_outra_equipe' && por('Eva').detalhe === 'RED LINE', 'quem está em outra equipe do evento: não entra, e diz qual')
ok(por('Fabio').situacao === 'baixa_na_equipe', 'baixa nesta equipe: o caminho é "Trazer de volta"')
ok(por('Gil').situacao === 'disponivel', 'baixa em OUTRA equipe não impede (a regra de 16/10)')
ok(por('Hugo').situacao === 'bloqueado', 'CPF bloqueado não entra')
ok(por('Iara').situacao === 'sem_telefone', 'telefone genérico (27 0000-0000) conta como sem telefone')
ok(!por('Quebrado') && !por('Desconhecida'), 'CPF inválido e ficha de equipe fora do histórico ficam de fora')
ok(pessoas[0].situacao === 'disponivel' && pessoas[0].nome === 'Ana Atual' && pessoas.at(-1).situacao === 'na_equipe', 'ordem: prontas primeiro, quem mais trabalhou antes; quem já está na equipe por último')
const naTela = R.paraATela(ana)
ok(!('cpf' in naTela) && !('telefone' in naTela) && !('chavePix' in naTela) && !('fotoPath' in naTela), 'para a tela não vão CPF, telefone, PIX nem o caminho da foto')
ok(R.telefoneValido('(27) 99999-0000') && !R.telefoneValido('2700000000') && !R.telefoneValido('5527000000000') && !R.telefoneValido('123'), 'telefone válido: 10 a 13 dígitos e não o genérico')

console.log('\n2 · O servidor confere tudo de novo')
const acoes = ler('lib/actions-historico.ts')
const add = acoes.slice(acoes.indexOf('export async function adicionarDoHistorico'), acoes.indexOf('export type StatusDaCredencial'))
const acesso = ler('lib/acesso-equipe.ts')
ok(/if \(perfil\.role === 'supervisor' \|\| !podeGerenciarEventos\(perfil\)\) return null/.test(acesso) && /meus\.some\(s => s\.id === fornecedorId\)/.test(acesso) && /acessoAEquipe\(fornecedorId\)/.test(acoes), 'só o supervisor DESTA equipe, ou quem gerencia o evento da organização')
ok(/historicoParaEquipe\(\{ eventoId: a\.evento\.id, fornecedorId/.test(add) && /if \(p\.situacao !== 'disponivel'\)/.test(add), 'o histórico é recalculado no servidor: a lista da tela não vale como prova')
ok(/motivoCadastroTravado\(a\.evento\.id/.test(add), 'respeita o cadastro travado (equipe, subgrupo, evento)')
ok(/vagasNaCota\(a\.fornecedor\)/.test(add) && /Não coube: a equipe chegou ao limite/.test(add), 'respeita a cota da equipe (entra até onde cabe)')
ok(/if \(usaEscala && !diasEscolhidos\.length\) return \{ error: 'Escolha pelo menos um dia de trabalho\.' \}/.test(add) && /vagasAprovadasPorDia\(fornecedorId\)/.test(add) && /Dia lotado/.test(add), 'evento com escala: pede os dias e respeita o limite de cada dia')
ok(/fichaQueImpedeCadastro\(noEvento, fornecedorId\)/.test(add), 'conferência de última hora: dois cliques não duplicam ninguém')
ok(/origem: 'historico'/.test(add) && /gravarEscalaAprovada/.test(add) && /status_credenciamento: 'pendente'/.test(add), 'ficha nova (origem "historico"), dias gravados; sem dia gravado, fica aguardando aprovação')
ok(/after\(async \(\) => \{[\s\S]*agendarBoasVindasFuncionario[\s\S]*COLABORADOR_DO_HISTORICO[\s\S]*sincronizarAgendamentos/.test(add), 'credencial pela fila do WhatsApp e auditoria de cada pessoa, depois da resposta')
ok(/MAX_POR_VEZ = 200/.test(acoes) && !/throw new Error/.test(acoes), 'até 200 por vez; nunca lança (devolve o erro com o que fazer)')
ok(/from\('whatsapp_eventos'\)\.select\('wa_message_id, tipo'\)\.eq\('direcao', 'status'\)/.test(ler('lib/credencial-whatsapp.ts')) && /statusDasCredenciais\(/.test(acoes), 'status da credencial: fila + entregue/lida do webhook da Meta')
ok(/COLABORADOR_DO_HISTORICO/.test(ler('lib/auditoria-rotulos.ts')), 'a auditoria tem o rótulo da ação nova')

console.log('\n3 · A tela')
const tela = ler('app/admin/eventos/[id]/fornecedor/[fid]/MonteSuaEquipe.tsx')
const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
ok(/\(supervisorDesteSetor \|\| podeGerenciarEventos\(perfil\)\) && \(\s*<MonteSuaEquipe/.test(pagina), 'aparece no topo da equipe, para o supervisor dela e para quem gerencia o evento')
ok(/disabled=\{!pode\}/.test(tela) && /useState<Filtro>\('disponiveis'\)/.test(tela) && /useState\(true\)/.test(tela), 'só as prontas podem ser marcadas; começa em "Prontas" e "Só quem bateu ponto"')
ok(/disabled=\{enviando \|\| \(dados\.usaEscala && diasMarcados\.size === 0\)\}/.test(tela), 'confirmação pede os dias quando o evento usa escala')
ok(/createPortal\(/.test(tela), 'a confirmação abre por cima de tudo (portal), também no celular')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
