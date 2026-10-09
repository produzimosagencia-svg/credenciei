/*
 * SUPERVISOR EM TODAS AS EQUIPES DELE (pedido do Juan, 09/10/2026): quem supervisiona vários setores tem o crachá
 * em um só (cadastro é um por CPF por evento), mas o NOME aparece na lista de cada equipe que ele cobre — como
 * referência, sem virar uma segunda ficha.
 *
 * Roda com: node testes/supervisor-todas-equipes.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
const ini = pagina.indexOf('async function supervisoresComCrachaEmOutroSetor')
const helper = pagina.slice(ini, pagina.indexOf('\n}\n', ini))
ok(ini > -1, 'a página monta a lista de supervisores de fora')
ok(/from\('supervisor_setores'\)[\s\S]{0,120}\.eq\('fornecedor_id', fid\)/.test(helper), 'supervisor do setor = vínculo em supervisor_setores')
ok(/\.eq\('role', 'supervisor'\)\.eq\('fornecedor_id', fid\)/.test(helper), 'e o setor ativo do perfil, como rede de segurança')
ok(/!cpfsDaEquipe\.has\(/.test(helper), 'quem já tem crachá NESTA equipe não aparece duas vezes')
ok(/\.eq\('fornecedores\.evento_id', eventoId\)/.test(helper), 'procura o crachá só neste evento')
ok(/perfil\.role !== 'supervisor' \|\| setoresDoSupervisor\.some/.test(pagina), 'link pro setor do crachá só pra quem consegue abrir aquele setor')
ok(/supervisoresDeFora=\{supervisoresDeFora\}/.test(pagina), 'a tabela recebe a lista')

const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok((tabela.match(/supervisoresVisiveis\.map\(/g) ?? []).length === 2, 'aparece no celular e no computador')
ok(/!filtered\.length && !supervisoresVisiveis\.length/.test(tabela), 'equipe sem ninguém com crachá ainda mostra o supervisor')
ok(/filtroRapido !== 'todos' \|\| filtrosAvancadosAtivos > 0\) return \[\]/.test(tabela), 'some nos filtros de presença (as batidas dele são do outro setor)')
const linhas = tabela.slice(tabela.indexOf('{supervisoresVisiveis.map(sp => (\n                  <tr'), tabela.indexOf('{paginated.map(f => (\n                <tr'))
ok(linhas.length > 0 && !/FuncionarioDetalheModal|onClick/.test(linhas), 'linha de referência, sem ações (não é uma segunda ficha)')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
