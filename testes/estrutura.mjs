/*
 * TESTE DA IMPORTAÇÃO DE ESTRUTURA (lib/estrutura-regras.ts) — a parte pura:
 * ler a trava por dia, validar as linhas e montar a prévia.
 *
 * Roda com: node testes/estrutura.mjs   (Node 24 lê .ts direto)
 */

import {
  interpretarTrava, planejarEstrutura, normalizarCpfPlanilha, normalizarNome, maiorTrava,
  chaveCanonica, nomesParecem, mesmoNome,
} from '../lib/estrutura-regras.ts'

let falhas = 0
function ok(cond, msg) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
  else { console.log(`  \x1b[31m✗ ${msg}\x1b[0m`); falhas++ }
}
function grupo(t) { console.log(`\n\x1b[1m${t}\x1b[0m`) }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Vital: sábado 10/10 e domingo 11/10.
const DIAS = ['2026-10-10', '2026-10-11']
// CPFs válidos de teste (dígitos verificadores corretos).
const CPF_JOAO = '52998224725'
const CPF_MARIA = '11144477735'
const validarCpf = c => {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === +c[9] && dv(10) === +c[10]
}

// ─────────────────────────────────────────────────────────────────────────────
grupo('1 · Trava por dia — os jeitos que as pessoas escrevem')

const t = txt => interpretarTrava(txt, DIAS)
ok(igual(t('Sábado: 10 / Domingo: 8'), { ok: true, porDia: { '2026-10-10': 10, '2026-10-11': 8 } }), '"Sábado: 10 / Domingo: 8" (o exemplo do pedido)')
ok(igual(t('Sáb 15, Dom 12'), { ok: true, porDia: { '2026-10-10': 15, '2026-10-11': 12 } }), '"Sáb 15, Dom 12"')
ok(igual(t('sabado=20;domingo=20'), { ok: true, porDia: { '2026-10-10': 20, '2026-10-11': 20 } }), '"sabado=20;domingo=20"')
ok(igual(t('10/10: 15 / 11/10: 12'), { ok: true, porDia: { '2026-10-10': 15, '2026-10-11': 12 } }), 'por data: "10/10: 15 / 11/10: 12"')
ok(igual(t('Sábado-feira 5'), { ok: false, erro: t('Sábado-feira 5').erro }) || t('Sábado-feira 5').ok, 'variação estranha não derruba (erro ou aceita, nunca exceção)')
ok(igual(t('12'), { ok: true, porDia: { '2026-10-10': 12, '2026-10-11': 12 } }), 'só um número = todos os dias')
ok(igual(t(''), { ok: true, porDia: {} }), 'vazio = sem trava')
ok(!t('Segunda: 10').ok && t('Segunda: 10').erro.includes('não é um dia'), 'dia que o evento não tem → erro')
ok(!t('Sábado: 0').ok, 'trava zero → erro')
ok(!t('Sábado: 10 / Sábado: 12').ok, 'o mesmo dia com dois números → erro')
ok(!t('muitos').ok, 'texto sem número → erro')
ok(maiorTrava({ a: 10, b: 8 }) === 10 && maiorTrava({}) === null, 'maior trava vira o teto total')

// ─────────────────────────────────────────────────────────────────────────────
grupo('2 · CPF e nomes')

ok(normalizarCpfPlanilha(1234567890) === '01234567890' && validarCpf('01234567890'), 'CPF que o Excel virou número ganha os zeros de volta')
ok(normalizarCpfPlanilha('529.982.247-25') === CPF_JOAO, 'CPF com pontuação')
ok(normalizarNome('  Bar   PRINCIPAL ') === normalizarNome('bar principal') && normalizarNome('Fervô') === 'fervo', 'nome sem diferença de maiúscula, espaço e acento')

// ─────────────────────────────────────────────────────────────────────────────
grupo('3 · Prévia — o exemplo do pedido')

const L = (linha, fornecedor, subgrupo, trava, nome, cpf, tel = '27999998888') =>
  ({ linha, fornecedor, subgrupo, trava, supervisorNome: nome, supervisorCpf: cpf, supervisorTelefone: tel })

const ctx = {
  dias: DIAS,
  subeventos: [{ id: 'sub-camarote', nome: 'CAMAROTE NAVISTA' }],
  fornecedores: [{ id: 'f-bar', nome: 'Bar', subevento_id: 'sub-camarote' }],
  acessos: new Map([[CPF_MARIA, { nome: 'Maria Santos', role: 'supervisor' }]]),
  validarCpf,
}
const plano = planejarEstrutura([
  L(2, 'Credenciais', 'Camarote Navista', 'Sábado: 10 / Domingo: 8', 'João Silva', CPF_JOAO),
  L(3, 'Bar', 'camarote navista', 'Sábado: 15 / Domingo: 12', 'Maria Santos', CPF_MARIA),
  L(4, 'Bar', 'Arquibancada', 'Sábado: 20 / Domingo: 20', 'João Silva', CPF_JOAO),
], ctx)

ok(plano.linhas[0].acao === 'criar' && !plano.linhas[0].subgrupoNovo, 'Credenciais no Camarote (área existe) → criar fornecedor')
ok(plano.linhas[1].acao === 'atualizar', 'Bar no Camarote já existe (nome sem diferença de caixa) → atualizar, não duplicar')
ok(plano.linhas[2].acao === 'criar' && plano.linhas[2].subgrupoNovo, 'Bar na Arquibancada: área nova é criada')
ok(igual(plano.linhas[0].travaPorDia, { '2026-10-10': 10, '2026-10-11': 8 }), 'trava por dia lida na linha')
ok(plano.contagens.fornecedoresCriar === 2 && plano.contagens.fornecedoresAtualizar === 1, '2 fornecedores criados, 1 atualizado')
ok(plano.contagens.subgruposCriar === 1, '1 subgrupo (área) criado')
ok(plano.contagens.supervisoresNovos === 1 && plano.contagens.supervisoresExistentes === 1, 'João é novo, Maria já existe')
ok(plano.contagens.supervisoresMultiplos === 1 && plano.multiplos[0].setores.length === 2,
  'João cuida de 2 setores → UM acesso, os dois setores listados')
ok(plano.contagens.linhasComErro === 0, 'nenhuma linha com erro')

// ─────────────────────────────────────────────────────────────────────────────
grupo('4 · Prévia — erros apontados antes de importar')

const ruim = planejarEstrutura([
  L(2, '', 'Camarote', '10', 'Ana', CPF_JOAO),
  L(3, 'Caixa', 'Camarote', 'Segunda: 5', 'Bia', '12345678900'),
  L(4, 'Caixa', 'Camarote', '5', 'Bia', CPF_MARIA, '999'),
  L(5, 'Caixa', 'Camarote', '5', 'Carla', CPF_MARIA),
  L(6, 'Segurança', 'Bloco', '', 'Ana', CPF_JOAO),
], { ...ctx, subeventos: [], fornecedores: [], acessos: new Map() })

const erros = n => ruim.linhas.find(l => l.linha === n).erros.join(' | ')
ok(erros(2).includes('Falta o nome do fornecedor'), 'campo obrigatório ausente')
ok(erros(3).includes('CPF do supervisor inválido') && erros(3).includes('Trava inválida'), 'CPF inválido e trava em dia que o evento não tem')
ok(erros(4).includes('Telefone'), 'telefone sem DDD')
ok(erros(4).includes('CPF duplicado') && erros(5).includes('CPF duplicado'), 'mesmo CPF com dois nomes diferentes')
ok(erros(5).includes('Setor duplicado') && !erros(3).includes('Setor duplicado'), 'setor repetido na mesma área: só a repetição é apontada')
ok(ruim.linhas.find(l => l.linha === 6).acao === 'criar', 'linha sem trava é válida (sem trava por dia)')
ok(ruim.contagens.linhasComErro === 4, '4 linhas com erro não entram')

// ─────────────────────────────────────────────────────────────────────────────
grupo('5 · Reimportação não duplica')

const depois = planejarEstrutura([
  L(2, 'Credenciais', 'Camarote Navista', 'Sábado: 12 / Domingo: 8', 'João Silva', CPF_JOAO),
], { ...ctx, fornecedores: [...ctx.fornecedores, { id: 'f-cred', nome: 'Credenciais', subevento_id: 'sub-camarote' }], acessos: new Map([[CPF_JOAO, { nome: 'João Silva', role: 'supervisor' }]]) })
ok(depois.linhas[0].acao === 'atualizar' && depois.contagens.supervisoresExistentes === 1 && depois.contagens.supervisoresNovos === 0,
  'mesma planilha de novo: atualiza a trava, reaproveita o supervisor')

// ─────────────────────────────────────────────────────────────────────────────
grupo('6 · Nomes de área escritos de outro jeito — os casos reais do Vital')

ok(mesmoNome('Camarote Na Vista', 'CAMAROTE NAVISTA'), '"Camarote Na Vista" é a mesma área de "CAMAROTE NAVISTA"')
ok(mesmoNome('Empresarial', 'EMPRESARIAIS'), '"Empresarial" é a mesma de "EMPRESARIAIS" (plural)')
ok(mesmoNome('Muvuka/Pega/Fervô', 'MUVUKA / PEGA / FERVÔ'), 'barra, espaço e acento não separam')
ok(mesmoNome('Arquibancadas', 'arquibancada') && mesmoNome('Fornecedores s/apontamento', 'FORNECEDORES S/ APONTAMENTO.'), 'plural, ponto e espaço')
ok(chaveCanonica('') === '' && !mesmoNome('', ''), 'nome vazio nunca "é o mesmo"')

ok(nomesParecem('Camarote Navist', 'CAMAROTE NAVISTA'), 'erro de digitação é "parecido" (pergunta, não junta sozinho)')
ok(nomesParecem('Empresaril', 'Empresarial'), '"Empresaril" parece "Empresarial"')
ok(!nomesParecem('Camarote', 'Camarote Navista'), '"Camarote" e "Camarote Navista" são áreas DIFERENTES')
ok(!nomesParecem('Bloco 1', 'Bloco 2') && !nomesParecem('Setor A1', 'Setor A2'), 'números diferentes → áreas diferentes')
ok(!nomesParecem('Arquibancada', 'Bloco') && !nomesParecem('Geral', 'Gerais'), 'nomes curtos ou sem relação não se juntam')

const vital = {
  dias: DIAS,
  subeventos: [
    { id: 'cam', nome: 'CAMAROTE NAVISTA' }, { id: 'emp', nome: 'EMPRESARIAIS' }, { id: 'muv', nome: 'MUVUKA / PEGA / FERVÔ' },
  ],
  fornecedores: [], acessos: new Map(), validarCpf,
}
const reimport = planejarEstrutura([
  L(2, 'Bar A', 'Camarote Na Vista', '', 'Ana', CPF_JOAO),
  L(3, 'Bar B', 'Empresarial', '', 'Ana', CPF_JOAO),
  L(4, 'Bar C', 'Muvuka/Pega/Fervô', '', 'Ana', CPF_JOAO),
  L(5, 'Bar D', 'Camarote Na Vista', '', 'Ana', CPF_JOAO),
], vital)
ok(reimport.contagens.subgruposCriar === 0, 'a planilha do Vital NÃO cria nenhuma área nova')
ok(reimport.linhas[0].subeventoId === 'cam' && reimport.linhas[0].subgrupoUsado === 'CAMAROTE NAVISTA', 'usa a área existente, com o nome dela')
ok(reimport.linhas[1].subeventoId === 'emp' && reimport.linhas[2].subeventoId === 'muv', 'Empresarial → EMPRESARIAIS e Muvuka → a existente')
ok(reimport.reconhecidos.length === 3, 'a prévia lista os 3 nomes reconhecidos')

const novaNaPlanilha = planejarEstrutura([
  L(2, 'Bar A', 'Pista Premium', '', 'Ana', CPF_JOAO),
  L(3, 'Bar B', 'pista  premium', '', 'Ana', CPF_JOAO),
  L(4, 'Bar C', 'Pistas Premium', '', 'Ana', CPF_JOAO),
], vital)
ok(novaNaPlanilha.contagens.subgruposCriar === 1, 'três escritas da MESMA área nova na planilha criam UMA só')

const digitado = [L(2, 'Bar A', 'Camarote Navist', '', 'Ana', CPF_JOAO)]
const padrao = planejarEstrutura(digitado, vital)
ok(padrao.parecidos.length === 1 && padrao.parecidos[0].decisao === 'usar' && padrao.linhas[0].subeventoId === 'cam' && padrao.contagens.subgruposCriar === 0,
  'nome parecido: sugere a existente (padrão) e não cria área')
const quisNova = planejarEstrutura(digitado, vital, { [padrao.parecidos[0].chave]: 'novo' })
ok(quisNova.linhas[0].subeventoId === null && quisNova.contagens.subgruposCriar === 1, 'a pessoa pode escolher criar a área nova')

const dup = planejarEstrutura([
  L(2, 'Caixa', 'Camarote Na Vista', '', 'Ana', CPF_JOAO),
  L(3, 'CAIXAS', 'CAMAROTE NAVISTA', '', 'Bia', CPF_MARIA),
], vital)
ok(dup.linhas[1].erros.join().includes('Setor duplicado'), 'mesmo fornecedor em duas escritas da mesma área → duplicado')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
