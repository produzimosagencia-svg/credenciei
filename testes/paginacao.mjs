/*
 * PAGINAÇÃO COM ORDEM COMPLETA — o bug de 06/10/2026: a Base de funcionários
 * perdia ~6 pessoas por carregamento (e repetia outras), porque paginava de
 * 1000 em 1000 ordenando só por data, e cadastros em lote têm a MESMA data.
 *
 * Roda com: node testes/paginacao.mjs
 */
import { readFileSync } from 'node:fs'
let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const janela = (src, ini, tam = 1400) => { const i = src.indexOf(ini); return i < 0 ? '' : src.slice(i, i + tam) }

console.log('\n\x1b[1m1 · Toda consulta paginada tem desempate por id\x1b[0m')
const enc = ler('app/admin/encontrar/page.tsx')
ok(/\.order\('created_at', \{ ascending: false \}\)[\s\S]{0,400}\.order\('id', \{ ascending: true \}\)[\s\S]{0,40}\.range\(de, ate\)/.test(enc), 'Base de funcionários (Encontrar): created_at + id')
const act = ler('lib/actions.ts')
ok((act.match(/\.order\('nome'\)\s*\n\s*\.order\('id'\)/g) ?? []).length >= 2, 'Localizar (2 consultas): nome + id — homônimos não cortam a página')
ok(ler('lib/ia/ferramentas/consultas.ts').includes(".order('nome')\n            .order('id')"), 'consulta do assistente de IA: nome + id')
ok(ler('lib/gastos.ts').includes(".order('registrado_em', { ascending: false }).order('id')"), 'gastos: data + registro + id')
ok(ler('app/admin/page.tsx').includes(".order('created_at').order('id')"), 'gráfico do painel: created_at + id')

console.log('\n\x1b[1m2 · Vital (4 mil pessoas): nada decide em cima de uma resposta cortada em 1.000\x1b[0m')
const interno = ler('lib/internos-servidor.ts')
ok(interno.includes('export async function diasComBatida') && /\.eq\('data_ref', data\)\.limit\(1\)/.test(interno), 'dia com batida: uma pergunta por dia, não um conjunto montado das batidas')
ok(!/\.from\('registros'\)\.select\('data_ref'\)/.test(act.replace(/\s+/g, ' ')) && (act.match(/diasComBatida\(/g) ?? []).length >= 2, 'apagar/rebaixar dia de trabalho usa a pergunta por dia')
const imp = ler('lib/importacao.ts')
ok(imp.includes("emLotes(semRepetidos.map(f => f.cpf), 200)") && imp.includes("emLotes(finalPayload.map(f => f.cpf), 200)"), 'importação de planilha: CPFs em lotes de 200 (a URL com 4 mil estourava e nenhum duplicado era detectado)')
ok(/function contarPendentes\(/.test(act) && !/\.in\('fornecedores\.evento_id', eventosData/.test(act), 'pendentes de aprovação são CONTADOS no banco, não lidos')
ok(act.includes("from('biometria_templates').select('funcionario_id, vetor')") && /buscarTudo<\{ funcionario_id: string; vetor: unknown \}>/.test(act), 'galeria de rostos paginada (além da 1.000ª pessoa dava "não identificado" no totem)')
ok(/emLotes\(funcionarios\.map\(f => f\.id\), 200\)/.test(act), 'exportação do setor: pessoas e batidas paginadas e em lotes')
const msg = ler('lib/mensagens.ts')
ok(/cancelarMeioDesligado[\s\S]{0,500}paginarTudo/.test(msg), 'cancelar os lembretes do meio alcança a fila inteira')
ok(ler('app/admin/criar-porteiro/page.tsx').includes('buscarTudo') && ler('app/admin/bloquear-cpf/page.tsx').includes('buscarTudo') && ler('app/admin/whatsapp/disparo/page.tsx').includes('buscarTudo'), 'criar-porteiro, bloquear-cpf e disparo de WhatsApp listam tudo')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
