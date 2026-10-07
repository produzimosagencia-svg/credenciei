/*
 * FUNÇÕES DE SERVIDOR SEM LOGIN NÃO PODEM SER ENDPOINTS PÚBLICOS.
 *
 * Toda função exportada de um arquivo 'use server' vira um endpoint que
 * qualquer pessoa chama do navegador. Estas rodam por dentro do cadastro
 * público, do portão e das telas de servidor — não conferem login — e duas
 * escrevem na planilha do evento. Por isso moram em lib/internos-servidor.ts
 * (sem 'use server'). Este teste impede que voltem.
 *
 * Roda com: node testes/seguranca.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const arquivos = dir => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap(n => {
  const rel = `${dir}/${n}`
  return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? arquivos(rel) : [rel]
})

const SEM_LOGIN = [
  'sincronizarFuncionarioNaPlanilha', 'sincronizarRegistroNaPlanilha', 'diasDoEvento',
  'cpfEstaBloqueado', 'obterFuncionalidadesOrganizacao',
]
const usaServer = arquivos('lib').concat(arquivos('app')).filter(f => /\.(ts|tsx)$/.test(f))
  .filter(f => /^\s*['"]use server['"]/.test(ler(f)))

console.log('\n\x1b[1m1 · Nada sem login exportado de arquivo \'use server\'\x1b[0m')
for (const nome of SEM_LOGIN) {
  const exportadoEmUseServer = usaServer.filter(f => new RegExp(`export\\s+async\\s+function\\s+${nome}\\b`).test(ler(f)))
  ok(exportadoEmUseServer.length === 0, `${nome} não é endpoint público`)
}

console.log('\n\x1b[1m2 · O módulo interno\x1b[0m')
const interno = ler('lib/internos-servidor.ts')
ok(!/^\s*['"]use server['"]/.test(interno) && interno.includes("import 'server-only'"), "lib/internos-servidor.ts não é 'use server' e é só de servidor")
ok(SEM_LOGIN.every(n => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(interno)), 'as cinco funções moram lá')

console.log('\n\x1b[1m3 · O que o navegador ainda chama exige login\x1b[0m')
const a = ler('lib/actions.ts')
const metodo = a.slice(a.indexOf('export async function metodoIdentificacaoDoEvento'), a.indexOf('type LinhaLocalizada'))
ok(metodo.includes('getPerfil()') && metodo.includes('podeAcompanhar(perfil)'), 'metodoIdentificacaoDoEvento só responde a quem acompanha a operação')
ok(ler('app/api/sheets/funcionario/route.ts').includes('podeGerenciarEventos(perfil)') && ler('app/api/sheets/registro/route.ts').includes('podeGerenciarEventos(perfil)'), 'as rotas da planilha continuam com login e permissão')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
