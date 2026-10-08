/*
 * CORRIGIR O NOME do colaborador na ficha dele (pedido do Juan, 08/10/2026): a ficha já deixava corrigir CPF,
 * telefone e função, mas faltava o nome — mesmo tipo de erro de digitação do cadastro público. Mesma régua de
 * `editarCpfFuncionario` (identidade: só master/suporte escopado), não a mais aberta de telefone/função.
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
ok(/if \(!podeEditarIdentidade\(perfil\)\) return/.test(corpo), 'só quem edita identidade (master/suporte) corrige o nome — mesma régua do CPF')
ok(/novoNome\.length < 2 \|\| novoNome\.length > 120/.test(corpo), 'nome vazio ou gigante é recusado')
ok(/atual\.fornecedor_id !== fornecedorId/.test(corpo), 'confere que a pessoa é deste fornecedor (id vindo do cliente)')
ok(/acao: 'ALTERACAO_NOME'/.test(corpo), 'fica na auditoria com o rótulo já existente')
ok(/sincronizarFuncionarioNaPlanilha/.test(corpo), 'reflete o nome novo na planilha, como telefone e função já fazem')

const modal = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal.tsx')
ok(/onClick={abrirEditarNome}/.test(modal) && /podeEditarCpf && \(/.test(modal.slice(modal.indexOf('<h2 className="text-slate-800 font-bold truncate">{f.nome}</h2>'))), 'o lápis de corrigir nome só aparece para quem tem a mesma permissão do CPF')
ok(/editarNomeFuncionario\(f\.id, fornecedorId, eventoId, novoNome, motivoNome \|\| undefined\)/.test(modal), 'a tela chama a ação nova ao salvar')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
