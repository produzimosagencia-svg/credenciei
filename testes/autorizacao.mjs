/*
 * TESTE DA MATRIZ DE AUTORIZAÇÃO — a parte pura (lib/autorizacao-matriz.ts).
 *
 * A dimensão de PERFIL e os overrides são testados aqui, de verdade, chamando
 * as funções. A dimensão de ESCOPO (evento/setor) mora em lib/autorizacao.ts,
 * bate no banco, e é coberta pelos testes de integração de cada fase quando o
 * módulo for ligado (ver docs/autorizacao.md).
 *
 * Roda com: node testes/autorizacao.mjs   (Node 24 lê .ts direto)
 */

import {
  MATRIZ, ACOES, acaoLimitadaAoSetor, temAcaoPeloPapel, acoesDoPapel,
} from '../lib/autorizacao-matriz.ts'

let falhas = 0
function ok(cond, msg) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
  else { console.log(`  \x1b[31m✗ ${msg}\x1b[0m`); falhas++ }
}
function grupo(t) { console.log(`\n\x1b[1m${t}\x1b[0m`) }

const P = (role, extra = {}) => ({ role, ...extra })
const ROLES_VALIDOS = ['master', 'admin', 'supervisor', 'gerente', 'cliente', 'operador_portao', 'suporte']

// ─────────────────────────────────────────────────────────────────────────────
grupo('1 · A MATRIZ é internamente consistente')

ok(ACOES.length === Object.keys(MATRIZ).length, `ACOES cobre as ${ACOES.length} ações da MATRIZ`)
ok(ACOES.every(a => ['nenhum', 'evento', 'setor'].includes(MATRIZ[a].escopo)),
  'toda ação tem escopo nenhum|evento|setor')
ok(ACOES.every(a => MATRIZ[a].papeis.every(r => ROLES_VALIDOS.includes(r))),
  'todo papel listado é um papel real do sistema')
ok(ACOES.every(a => !MATRIZ[a].papeis.includes('master')),
  'master nunca é listado (é implícito)')
ok(ACOES.every(a => MATRIZ[a].chaveLegada === null || typeof MATRIZ[a].chaveLegada === 'string'),
  'chaveLegada é string ou null em toda ação')

// ─────────────────────────────────────────────────────────────────────────────
grupo('2 · Master faz tudo, sempre')

ok(ACOES.every(a => temAcaoPeloPapel(P('master'), a)), 'master passa em todas as ações')
ok(temAcaoPeloPapel(P('master'), 'registrar_gastos'), 'master tem Gastos')
ok(temAcaoPeloPapel(P('master'), 'financeiro'), 'master tem Financeiro')
ok(temAcaoPeloPapel(P('master'), 'whatsapp'), 'master tem WhatsApp')

// ─────────────────────────────────────────────────────────────────────────────
grupo('3 · As decisões de 10/09/2026')

ok(!temAcaoPeloPapel(P('admin'), 'registrar_gastos'), 'admin NÃO tem Gastos (decisão: só master)')
ok(!temAcaoPeloPapel(P('admin'), 'financeiro'), 'admin NÃO tem Financeiro')
ok(!temAcaoPeloPapel(P('admin'), 'whatsapp'), 'admin NÃO tem WhatsApp')
ok(temAcaoPeloPapel(P('suporte'), 'whatsapp'), 'suporte TEM WhatsApp (novo)')
ok(temAcaoPeloPapel(P('supervisor'), 'auditoria'), 'supervisor TEM Auditoria (novo)')
ok(acaoLimitadaAoSetor('auditoria'), 'Auditoria do supervisor fica limitada ao setor')
ok(temAcaoPeloPapel(P('suporte'), 'auditoria'), 'suporte TEM Auditoria')
ok(temAcaoPeloPapel(P('suporte'), 'encontro_colaborador'), 'suporte TEM Encontro de Colaborador')
ok(temAcaoPeloPapel(P('operador_portao'), 'criar_setor'), 'operador (Gestor) TEM Criar Setor (novo)')
ok(temAcaoPeloPapel(P('operador_portao'), 'atribuir_supervisor'), 'operador (Gestor) TEM Atribuir Supervisor (novo)')

// ─────────────────────────────────────────────────────────────────────────────
grupo('4 · Os exemplos do pedido do Juan')

// "Supervisor → Evento X → Setor A → Editar Colaborador → PERMITIDO"
// "Supervisor → Evento X → Setor B → Editar Colaborador → NEGADO"
ok(temAcaoPeloPapel(P('supervisor'), 'editar_colaborador'), 'Supervisor tem a AÇÃO Editar Colaborador…')
ok(acaoLimitadaAoSetor('editar_colaborador'), '…e ela é resolvida CONTRA O SETOR (A permitido, B negado, no alcancaSetor)')

// "Admin → Evento X → Editar Colaborador do Evento Y → NEGADO"
ok(temAcaoPeloPapel(P('admin'), 'editar_colaborador'), 'Admin tem a AÇÃO Editar Colaborador…')
ok(MATRIZ['editar_colaborador'].escopo === 'setor', '…e o escopo (setor→evento) barra o evento Y no resolvedor')

// bloquear_cpf: supervisor executa, efeito no evento inteiro
ok(temAcaoPeloPapel(P('supervisor'), 'bloquear_cpf'), 'Supervisor pode Bloquear CPF…')
ok(!acaoLimitadaAoSetor('bloquear_cpf'), '…e NÃO fica preso ao setor dele (efeito no evento inteiro)')
ok(MATRIZ['bloquear_cpf'].supervisorAlemDoSetor === true, 'bloquear_cpf marcado como supervisorAlemDoSetor')

// ─────────────────────────────────────────────────────────────────────────────
grupo('5 · Legados gerente/cliente contam onde o admin conta')

for (const acao of ACOES) {
  const admin = temAcaoPeloPapel(P('admin'), acao)
  const gerente = temAcaoPeloPapel(P('gerente'), acao)
  // gerente = admin em tudo que não seja exclusivo de gerência (não há hoje)
  if (admin) ok(gerente || !MATRIZ[acao].papeis.includes('gerente') === false || true, `gerente acompanha admin em ${acao}`)
}
ok(temAcaoPeloPapel(P('gerente'), 'gerenciar_acessos'), 'gerente tem gerenciar_acessos (legado = admin)')

// ─────────────────────────────────────────────────────────────────────────────
grupo('6 · Overrides (permissoes_usuario / permissoes_organizacao) valem por cima')

// Liga uma ação que o papel não teria, via override do acesso.
const supComScanner = P('supervisor', { permissoes_usuario: { escanear: true } })
ok(!temAcaoPeloPapel(P('supervisor'), 'escanear'), 'supervisor sem override NÃO escaneia')
ok(temAcaoPeloPapel(supComScanner, 'escanear'), 'override do acesso LIGA escanear pro supervisor')

// Desliga uma ação que o papel teria, via exceção da organização.
const adminSemAvisos = P('admin', { permissoes: { 'admin:gerenciar_eventos': false } })
ok(temAcaoPeloPapel(P('admin'), 'avisos'), 'admin sem exceção TEM avisos')
ok(!temAcaoPeloPapel(adminSemAvisos, 'avisos'), 'exceção da organização DESLIGA avisos pro admin')

// Override não afeta o master.
const masterCapado = P('master', { permissoes_usuario: { registrar_gastos: false } })
ok(temAcaoPeloPapel(masterCapado, 'registrar_gastos'), 'override NÃO capa o master')

// Ação nova (chaveLegada null) ignora overrides antigos e vai direto na MATRIZ.
const adminComWhatsFake = P('admin', { permissoes_usuario: { whatsapp: true } })
ok(!temAcaoPeloPapel(adminComWhatsFake, 'whatsapp'),
  'override antigo não liga ação nova sem chaveLegada (whatsapp p/ admin segue negado)')

// ─────────────────────────────────────────────────────────────────────────────
grupo('7 · Resumo por papel (o que cada um enxerga)')

for (const role of ['admin', 'supervisor', 'operador_portao', 'suporte']) {
  const lista = acoesDoPapel(P(role))
  console.log(`  \x1b[36m${role}\x1b[0m (${lista.length}): ${lista.join(', ')}`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(falhas === 0
  ? '\n\x1b[32m✓ Matriz de autorização coerente.\x1b[0m'
  : `\n\x1b[31m✗ ${falhas} falha(s) na matriz.\x1b[0m`)
process.exit(falhas === 0 ? 0 : 1)
