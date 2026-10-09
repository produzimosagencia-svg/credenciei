/*
 * "Quem for supervisor pode deixar liberado todos os dias" (Juan, 08/10/2026, depois de liberar manualmente os
 * 86 supervisores do VITAL) — virou regra automática: `pessoaEhSupervisor` (lib/escala.ts) força todos os dias
 * em `aprovarCredenciamento` e `ajustarEscalaDoFuncionario`, ignorando o que foi pedido/marcado na tela.
 *
 * Texto cru, mesmo padrão de testes/dias-obrigatorios.mjs: lib/actions.ts não pode ser live-importado (cliente
 * de serviço no topo). lib/escala.ts tem o mesmo problema (importa supabase-server.ts).
 *
 * Roda com: node testes/supervisor-todos-dias.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')

const escala = ler('lib/escala.ts')
const actions = ler('lib/actions.ts')
const aprovDias = ler('components/AprovacaoComDias.tsx')

let falhas = 0
function ok(cond, nome) {
  if (!cond) falhas++
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}`)
}

console.log('1 · pessoaEhSupervisor — por CPF, supervisor de um setor DESTE evento (09/10/2026), tolerante à migração')
ok(/export async function pessoaEhSupervisor\(cpf: string \| null \| undefined, eventoId: string\)/.test(escala), 'função existe em lib/escala.ts e recebe o evento')
ok(/from\('supervisor_setores'\)[\s\S]{0,160}\.eq\('fornecedores\.evento_id', eventoId\)/.test(escala),
  'confere o vínculo de supervisor num setor do evento (não mais só a conta de supervisor)')
ok(/if \(limpo\.length !== 11\) return false/.test(escala), 'CPF inválido/incompleto não é supervisor')

console.log('\n2 · aprovarCredenciamento força todos os dias pra supervisor, ignorando o que foi pedido')
ok(/const souSupervisor = await pessoaEhSupervisor\(func\.cpf as string \| null, eventoId\)/.test(actions),
  'consulta pessoaEhSupervisor com o cpf do funcionário')
ok(/souSupervisor\s*\?\s*conferirDiasPermitidos\(disponiveis, disponiveis\)/.test(actions),
  'supervisor: confere com a lista inteira de dias disponíveis (sempre todos)')

console.log('\n3 · ajustarEscalaDoFuncionario: mesma regra, e pula a trava de cota do setor')
ok(/conferirDiasPermitidos\(souSupervisor \? disponiveis : dias, disponiveis\)/.test(actions),
  'ajuste também força todos os dias pra supervisor')
ok(/if \(!souSupervisor\) \{\s*const jaAprovados/.test(actions),
  'supervisor não é barrado pela trava de cota (sempre tem direito a todos os dias)')

console.log('\n4 · a tela de aprovação não pede pra marcar dias de um supervisor')
ok(/const exigeDias = detalhe\.usaEscala && !detalhe\.ehSupervisor/.test(aprovDias),
  'exigeDias desliga para supervisor')
ok(/Supervisor — liberado automaticamente para todos os dias do evento/.test(aprovDias),
  'mostra aviso informativo no lugar da grade')
ok(/\{!detalhe\.ehSupervisor && \(/.test(aprovDias),
  'a grade de dias (SeletorDiasEscala) não aparece pra supervisor')

console.log('\n5 · detalheDoCredenciamento expõe ehSupervisor pro componente usar')
ok(/ehSupervisor: boolean/.test(ler('lib/escala.ts')), 'campo no tipo DetalheCredenciamento')
ok(/const ehSupervisor = usaEscala \? await pessoaEhSupervisor\(f\.cpf as string \| null, eventoId\) : false/.test(actions),
  'calculado em detalheDoCredenciamento')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
