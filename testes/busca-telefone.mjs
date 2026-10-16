/*
 * BUSCA POR TELEFONE (Juan, 16/10/2026: "no campo de busca, tivesse a opção telefone — que é o que fica visível nos
 * grupos — ajudaria a encontrar cada colaborador"). Equipe do fornecedor, Registrar ponto e Editar colaborador.
 *
 * Roda com: node testes/busca-telefone.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx'), acoes = ler('lib/actions.ts'), editar = ler('app/admin/editar-colaborador/BuscarColaborador.tsx')
ok(/telefoneSemPais\(f\.telefone\)\.includes\(digitos\)/.test(tabela) && /Buscar por nome, CPF, telefone/.test(tabela), 'equipe do fornecedor: acha pelo telefone (com ou sem DDD, parênteses, traço, +55)')
ok(/const soTelefone = pareceCpf && digitos\.length === 11 && !validarCpf\(digitos\)/.test(acoes) && /telefone\.like\.%\$\{digitosTelefone\}%/.test(acoes), 'Registrar ponto: número de 11 dígitos que não é CPF vira busca por telefone (antes: "CPF inválido")')
ok(/semPais\(c\.telefone\)\.includes\(semPais\(digitos\)\)/.test(editar), 'Editar colaborador: acha pelo telefone')
// a regra do "sem o 55", rodando
const telefoneSemPais = t => { const d = (t ?? '').replace(/\D/g, ''); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d }
ok(telefoneSemPais('+55 (27) 99639-3893') === '27996393893' && telefoneSemPais('5527996393893') === '27996393893' && telefoneSemPais('(27) 99639-3893') === '27996393893', '"+55 (27) 99639-3893", "5527996393893" e "(27) 99639-3893" são o mesmo número')
console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
