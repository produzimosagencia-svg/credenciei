/*
 * O QR ACOMPANHA A PESSOA (pedido do Juan, 10/10/2026): "quando eu mudar a pessoa de lugar, o QR code precisa ir
 * junto" e "preciso mover setor para outro subevento também".
 *
 * Roda com: node testes/qr-acompanha-setor.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
const actions = ler('lib/actions.ts')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const editar = actions.slice(actions.indexOf('export async function editarFornecedor('))
ok(/if \(mudou\) \{\s*const \{ error: erroEquipe \} = await db\.from\('funcionarios'\)\.update\(\{ subevento_id: subeventoIdEditado \}\)\.eq\('fornecedor_id', id\)/.test(editar.slice(0, 4000)),
  'setor que muda de subevento leva a equipe junto (a área do QR de cada pessoa)')
ok(/const subeventoDaCredencial = setorDaFicha\?\.subevento_id \?\? /.test(actions), 'no portão, a área que vale é a do SETOR da pessoa (a da ficha é reserva)')
const mover = actions.slice(actions.indexOf('export async function moverFuncionarioDeSetor('))
ok(/\.update\(\{ subevento_id: \(destinoSubevento/.test(mover.slice(0, 6000)), '"Mover para outro setor" leva a área do destino')
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok((tabela.match(/<TrazerCrachaSupervisor/g) ?? []).length === 2, 'supervisor de fora: botão "Trazer o crachá para esta equipe" (celular e computador)')
ok(/moverFuncionarioDeSetor\(fichaId, eventoId, fornecedorId/.test(ler('app/admin/eventos/[id]/fornecedor/[fid]/TrazerCrachaSupervisor.tsx')), 'o botão usa o mesmo "Mover" (permissões e área)')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
