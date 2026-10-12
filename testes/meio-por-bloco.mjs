/*
 * MEIO POR BLOCO (Juan, 12/10/2026): "um setor que pede batida de meio — a pessoa credencia, bate meio, descredencia e
 * volta no mesmo dia para trabalhar de novo: quando ela voltar, precisa pedir o meio também".
 *
 * Roda com: node testes/meio-por-bloco.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const janelas = ler('lib/janelas.ts'), actions = ler('lib/actions.ts'), mensagens = ler('lib/mensagens.ts')
const sql = ler('supabase/upgrade-meio-por-bloco.sql')

console.log('A regra')
ok(/export const PAUSA_MINIMA_NOVO_BLOCO_MIN = 30/.test(janelas), 'só pausa de 30 min ou mais é "voltou pra trabalhar de novo" (leitura dupla no portão não conta)')
ok(/export function inicioDoBloco\(/.test(janelas), 'o meio conta do início do BLOCO: a volta da última pausa longa, ou a entrada')

console.log('\nNa volta')
ok(/after\(\(\) => abrirNovoBlocoDoMeio\(\{ \.\.\.p, pausaId: pausa\.id as string \}\)/.test(actions), 'registrar a pausa abre o bloco novo (fora do caminho do portão)')
ok(/update\(\{ meio_em: meioAnterior\.created_at, meio_registro: meioAnterior \}\)/.test(actions)
  && actions.indexOf('if (erroGuardar) return') < actions.indexOf(".delete().eq('id', meioAnterior.id as string)"),
  'o meio do bloco que acabou vai INTEIRO pra pausa — e só sai de registros se a pausa guardou (sem a migração, nada é apagado)')
ok(/entradaEm: p\.voltouEm, dataRef: p\.dataRef, novoBloco: true/.test(actions) && /\.\.\.\(params\.novoBloco \? \{ status: 'pendente', erro: null \} : \{\}\)/.test(mensagens),
  'lembrete e reforço do meio voltam a ficar pendentes, contados da volta')
ok(/add column if not exists meio_em timestamptz/.test(sql) && /add column if not exists meio_registro jsonb/.test(sql), 'a migração guarda o meio na pausa')

console.log('\nTodo lugar que cobra ou mostra o meio conta do bloco')
ok(/janelaDoMeio\(evento, dia, await inicioDoBlocoDe\(funcionarioId, evento\.id, dataRef, entrada\?\.em \?\? null\)\)/.test(actions), 'batida do meio pelo celular')
ok(/const inicioDoMeio = entradaDoMeio \? await inicioDoBlocoDe\(func\.id, evento\.id, entradaDoMeio\.dataRef, entradaDoMeio\.em\) : null/.test(actions), 'Registrar ponto')
ok(/const inicio = await inicioDoBlocoDe\(msg\.funcionario_id!, msg\.evento_id, msg\.data_ref/.test(mensagens), 'prazo no texto do lembrete')
ok(/inicioDoBloco\(entradaEm, pausas\.get\(f\.id as string\) \?\? \[\]\)/.test(ler('lib/pendencias.ts')), 'pendências e alerta do supervisor')
ok(/inicioDoBloco\(entrada\?\.em \?\? null, pausas\.map/.test(ler('lib/historico.ts')), 'histórico da pessoa')
ok(/inicioDoBloco\(entrada\.em, \(pausasDoDia \?\? \[\]\)/.test(ler('app/credential/[token]/page.tsx')), 'cartão do meio no app da pessoa')
ok(/inicioDoBloco\(entrada\.feitoEm, pausasPorPessoa\.get\(f\.id\) \?\? \[\]\)/.test(ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')), 'coluna Meio na tela do setor')

console.log('\nO meio do bloco anterior continua visível')
ok(/bloco anterior \{formatarBR\(p\.meio!, 'hora'\)\}/.test(ler('components/HistoricoBatidas.tsx')), 'no histórico, embaixo do meio atual')
ok(/b\.meiosAnterioresISO = \[\.\.\.\(b\.meiosAnterioresISO \?\? \[\]\), p\.meio_em as string\]/.test(ler('lib/relatorios.ts')), 'no relatório do subgrupo (os meios do dia, separados por ·)')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
