/*
 * AVISO AO SUPERVISOR (quem entrou e não bateu o meio) — conferido na véspera do dia principal do VITAL (09/10/2026):
 * nunca tinha sido enviado em evento nenhum. Três defeitos que fariam ele falhar ou sair pela metade:
 *   1. a lista de nomes (com quebra de linha) ia como variável pro template da Meta — a Meta recusa;
 *   2. iam 7 variáveis pra um template de 5 (nome · quantidade · setor · etapa · link);
 *   3. só o setor ABERTO na tela do supervisor entrava — quem cobre 5 setores recebia a lista de 1.
 *
 * Roda com: node testes/alerta-supervisor-meio.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
const msg = ler('lib/mensagens.ts'), meta = ler('lib/whatsapp-meta.ts'), modelos = ler('lib/mensagens-modelos.ts')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const bloco = msg.slice(msg.indexOf("if (msg.tipo.startsWith('alerta_supervisor_'))"), msg.indexOf('// Confirmação de escala pré-evento'))
ok(/from\('supervisor_setores'\)[\s\S]{0,200}\.eq\('fornecedores\.evento_id', msg\.evento_id\)/.test(bloco), 'soma TODOS os setores do supervisor no evento')
ok(/setores\.map\(fornecedorId => pendenciasDoDia\(/.test(bloco), 'pendentes de cada setor')
ok(/params: \[\s*supervisor\.nome,\s*String\(pendentes\.length\),\s*setorNoTexto,\s*ETAPA_CURTA\[momento\],\s*`\$\{SITE_URL\}/.test(bloco), 'ordem do template da Meta: nome · quantidade · setor · etapa · link')
ok(/alerta_supervisor_pendencia: 5,/.test(meta), 'só as 5 primeiras vão pro corpo da Meta')
ok(/alerta_supervisor_pendencia: \(\[nome, quantidade, setor, etapa, link, evento, lista\]\)/.test(modelos), 'o texto livre lê na mesma ordem (evento e lista no fim)')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
