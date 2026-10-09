/*
 * CORRIGIR O NOME do colaborador na ficha dele (pedido do Juan, 08/10/2026): a ficha já deixava corrigir CPF,
 * telefone e função, mas faltava o nome — mesmo tipo de erro de digitação do cadastro público. Mesma régua de
 * `editarCpfFuncionario`. Desde 09/10/2026 ("supervisor também pode editar o nome, cpf, telefone") a régua é a do
 * telefone: quem cuida da equipe — supervisor só nos setores dele, com motivo.
 *
 * Roda com: node testes/editar-nome.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const ini = acoes.indexOf('export async function editarNomeFuncionario')
const fim = acoes.indexOf('\nexport ', ini + 10)
const corpo = acoes.slice(ini, fim)

ok(ini > -1, 'a ação existe')
ok(/conferirCorrecaoDeIdentidade\(fornecedorId, eventoId, motivo, 'o nome'\)/.test(corpo), 'nome usa a mesma conferência do CPF')

const cpfIni = acoes.indexOf('export async function editarCpfFuncionario')
const cpfCorpo = acoes.slice(cpfIni, acoes.indexOf('\nexport ', cpfIni + 10))
ok(/conferirCorrecaoDeIdentidade\(fornecedorId, eventoId, motivo, 'o CPF'\)/.test(cpfCorpo), 'CPF usa a mesma conferência')
ok(/if \(!permissao\.plena\)[\s\S]{0,200}from\('perfis'\)/.test(cpfCorpo), 'supervisor/admin não mexe no CPF de quem tem login no sistema')

const confIni = acoes.indexOf('async function conferirCorrecaoDeIdentidade')
const conf = acoes.slice(confIni, acoes.indexOf('\n}\n', confIni))
ok(confIni > -1, 'a conferência existe')
ok(/exigirAcessoFuncionarios\(fornecedorId, eventoId\)/.test(conf), 'quem cuida da equipe: a régua do telefone (supervisor só nos setores dele)')
ok(/perfil\.role === 'supervisor' && !\(motivo \?\? ''\)\.trim\(\)/.test(conf), 'supervisor precisa dizer o motivo')
ok(/suporteTemEscopo/.test(conf), 'suporte continua só dentro do escopo')

const perm = ler('lib/permissions.ts')
ok(/export const podeCorrigirNomeECpf[\s\S]{0,250}role === 'supervisor'/.test(perm), 'o lápis aparece para o supervisor')
for (const pg of ['app/admin/eventos/[id]/fornecedor/[fid]/page.tsx', 'app/admin/eventos/[id]/page.tsx', 'app/admin/eventos/[id]/subevento/[sid]/page.tsx', 'app/admin/editar-colaborador/page.tsx']) {
  ok(/podeEditarCpf=\{podeCorrigirNomeECpf\(perfil\)\}/.test(ler(pg)), `${pg}: liga os lápis com a régua nova`)
}
ok(/novoNome\.length < 2 \|\| novoNome\.length > 120/.test(corpo), 'nome vazio ou gigante é recusado')
ok(/atual\.fornecedor_id !== fornecedorId/.test(corpo), 'confere que a pessoa é deste fornecedor (id vindo do cliente)')
ok(/acao: 'ALTERACAO_NOME'/.test(corpo), 'fica na auditoria com o rótulo já existente')
ok(/sincronizarFuncionarioNaPlanilha/.test(corpo), 'reflete o nome novo na planilha, como telefone e função já fazem')

const modal = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal.tsx')
ok(/onClick={abrirEditarNome}/.test(modal) && /podeEditarCpf && \(/.test(modal.slice(modal.indexOf('<h2 className="text-slate-800 font-bold truncate">{f.nome}</h2>'))), 'o lápis de corrigir nome só aparece para quem tem a mesma permissão do CPF')
ok(/editarNomeFuncionario\(f\.id, fornecedorId, eventoId, novoNome, motivoNome \|\| undefined\)/.test(modal), 'a tela chama a ação nova ao salvar')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
