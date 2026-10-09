/*
 * Central de Relatórios + PDF de entrega de valor (pedido do Juan, 09/10/2026: "tudo que tenha de relatório no
 * sistema esteja dentro desse campo" e "um botão laranja: PDF de entrega de valor do sistema"). Texto cru, mesmo
 * padrão dos outros testes (os arquivos usam o cliente de serviço do banco).
 *
 * Roda com: node testes/central-relatorios.mjs
 */
import { readFileSync } from 'node:fs'

const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }

const extras = ler('lib/relatorios-extras.ts')
const acesso = ler('lib/relatorios-acesso.ts')
const outros = ler('app/admin/eventos/[id]/relatorios/OutrosRelatorios.tsx')
const pagEvento = ler('app/admin/eventos/[id]/relatorios/page.tsx')
const pagMenu = ler('app/admin/relatorios/page.tsx')
const rota = ler('app/api/relatorios/entrega-valor/route.ts')
const pdf = ler('lib/entrega-valor-pdf.ts')
const dados = ler('lib/entrega-valor.ts')

console.log('1 · todos os relatórios pedidos estão na central')
for (const t of ['hoje', 'aguardando', 'cadastros', 'pedidos_setor', 'veiculos', 'subeventos', 'bloqueios', 'auditoria', 'fora_local', 'limites']) {
  ok(outros.includes(`chave: '${t}'`), `cartão "${t}"`)
}
ok(pagEvento.includes('<OutrosRelatorios') && pagMenu.includes('<OutrosRelatorios'), 'aparece na tela do evento e na tela pelo menu')

console.log('\n2 · permissão: mesma régua dos relatórios; supervisor só o que tem setor, e só os setores dele')
ok(/export async function exigirAcessoAoEvento/.test(acesso) && /import \{ exigirAcessoAoEvento \} from '\.\/relatorios-acesso'/.test(ler('lib/relatorios.ts')),
  'a régua de acesso é uma só, compartilhada')
ok(/if \(permitidos && SO_GESTOR\.includes\(tipo\)\) return \{ erro:/.test(extras), 'tipos do evento inteiro recusados para o supervisor (no servidor)')
ok(/return permitidos \? todos\.filter\(s => permitidos\.has\(s\.id\)\) : todos/.test(extras), 'linhas recortadas pelos setores do supervisor')
ok(/RELATORIOS\.filter\(r => eventoInteiro \|\| !r\.soGestor\)/.test(outros), 'a tela esconde do supervisor o que ele não pode puxar')

console.log('\n3 · datas no horário de Brasília (o servidor é UTC)')
ok(/const dataHora = \(iso: unknown\) => \(typeof iso === 'string' && iso \? formatarBR\(iso, 'completo'\) : ''\)/.test(extras), 'datas saem em texto já em Brasília')

console.log('\n4 · PDF de entrega de valor')
ok(pagEvento.includes('<BotaoEntregaValor') && pagMenu.includes('<BotaoEntregaValor'), 'botão no topo das duas telas')
ok(/resumo\.eventoInteiro && <BotaoEntregaValor/.test(pagEvento), 'só para quem gerencia o evento inteiro')
ok(/if \(acesso\.setoresPermitidos\) \{\s*return new NextResponse\(/.test(rota), 'a rota recusa quem não vê o evento inteiro')
ok(pdf.includes("'RELATÓRIO DE ENTREGA DE VALOR'") && pdf.includes('O foco do Credenciei é dar controle total'), 'título e a mensagem de valor')
ok(dados.includes("barradasNoPortao: conta('negado', 'invalido', 'dia_nao_autorizado', 'setor_lotado')"), 'acessos barrados não contam as tentativas fora do local duas vezes')
ok(/percentualCompletos: turnosComEntrada \? /.test(dados), 'percentual de entrada e saída corretas sobre os turnos com entrada')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
