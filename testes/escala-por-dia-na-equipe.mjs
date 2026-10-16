/*
 * ESCALA POR DIA NA LISTA DA EQUIPE (pedido do Juan, 09/10/2026): "ver a escala por dia dentro do sistema, sem
 * extrair relatório — filtrar equipe por dia". Master, admin e supervisor do setor.
 *
 * Roda com: node testes/escala-por-dia-na-equipe.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
ok(/const verEscala = ehMaster\(perfil\.role\) \|\| perfil\.role === 'admin' \|\| perfil\.role === 'supervisor'\s*\|\| setoresDoSupervisor\.some/.test(pagina), 'liberado para master, admin e supervisor do setor')
ok(/const diasParaOsBotoes = verEscala \? await diasDaEscalaDoEvento\(id\) : \[\]/.test(pagina) && /const diasDaEscala = diasParaOsBotoes\.length >= 2 \? diasParaOsBotoes : \[\]/.test(pagina),
  'os botões de dia valem em TODO evento com mais de um dia, com ou sem escala (Gabriel/Juan, 16/10/2026)')
ok(/\.eq\('tipo', 'entrada'\)/.test(pagina) && /diasComBatida: \[\.\.\.\(diasComEntrada\.get\(f\.id as string\) \?\? \[\]\)\]\.sort\(\)/.test(pagina), 'cada pessoa leva os dias em que bateu entrada')
ok(/usaEscala=\{usaEscalaNoEvento\}/.test(pagina), 'a tabela sabe se o evento usa escala (sem escala, nada de "Sem dias de trabalho" em cada pessoa)')
ok(/\.eq\('funcionarios\.fornecedor_id', fid\)/.test(pagina.slice(pagina.indexOf("from('funcionario_dias')"))), 'os dias vêm só da equipe deste setor')
ok(/d\?\.aprovados\.length\s*\? \{ diasEscala: \[\.\.\.d\.aprovados\]/.test(pagina), 'vale o aprovado; o pedido só enquanto não foi aprovado')
ok(/diasDaEscala=\{diasDaEscala\}/.test(pagina), 'a tabela recebe os dias do evento')

const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok(/if \(diaFiltro && !\(f\.diasEscala \?\? \[\]\)\.includes\(diaFiltro\) && !\(f\.diasComBatida \?\? \[\]\)\.includes\(diaFiltro\) && !\(diaFiltro === diaSelecionado && \(f\.entrada \|\| f\.meio \|\| f\.fim\)\)\) return false/.test(tabela), 'escolher um dia filtra a equipe: escalados nele, quem bateu entrada nele e quem bateu ponto no dia aberto')
ok(/for \(const d of new Set\(\[\.\.\.\(f\.diasEscala \?\? \[\]\), \.\.\.\(f\.diasComBatida \?\? \[\]\)\]\)\)/.test(tabela), 'o número do dia soma escalados e quem bateu entrada, sem contar duas vezes')
ok(/Escala por dia/.test(tabela) && /porDia\.get\(data\)/.test(tabela), 'fileira de dias com quantas pessoas em cada um')
ok(/f\.descredenciadoEm \|\| f\.statusCredenciamento === 'negado'\) continue/.test(tabela), 'a contagem do dia ignora quem saiu do evento ou foi negado')
ok((tabela.match(/<DiasDaPessoa f=\{f\} \/>/g) ?? []).length === 2, 'os dias de cada pessoa aparecem no celular e no computador')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
