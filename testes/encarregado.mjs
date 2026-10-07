/*
 * ENCARREGADO — o acesso de CONSULTA delegado pelo supervisor.
 *
 * Parte pura (lib/encarregado.ts, lib/permissions.ts) chamada de verdade, e as
 * garantias estáticas que não podem regredir: o papel não herda permissão
 * nenhuma, o escopo é sempre o vínculo, a tela de consulta nunca escreve.
 *
 * Roda com: node testes/encarregado.mjs   (Node 24 lê .ts direto)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import {
  cpfMascarado, temPermissaoEncarregado, PERMISSOES_PADRAO, PERMISSOES_ENCARREGADO, caminhoDoSetor, ehEncarregado,
} from '../lib/encarregado.ts'
import { CAPACIDADES, ROLE_LABELS, podeGerenciarEventos, podeAcompanhar, podeEscanear, podeGerenciarUsuarios, capacidadesDoPapel, PAPEIS_CONFIGURAVEIS } from '../lib/permissions.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const grupo = t => console.log(`\n\x1b[1m${t}\x1b[0m`)
const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const arquivos = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap(n => {
  const rel = `${dir}/${n}`
  return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? arquivos(rel) : [rel]
})

grupo('1 · O papel não herda nenhuma permissão')
ok(ROLE_LABELS.encarregado === 'Encarregado', 'tem rótulo')
ok(ehEncarregado('encarregado') && !ehEncarregado('supervisor'), 'ehEncarregado só vale pro papel dele')
ok(CAPACIDADES.every(c => c.padrao('encarregado') === false), 'nenhuma capacidade do catálogo é dele por padrão')
ok(!podeGerenciarEventos('encarregado') && !podeAcompanhar('encarregado') && !podeEscanear('encarregado') && !podeGerenciarUsuarios('encarregado'),
  'não gerencia evento, não acompanha, não escaneia, não gerencia acessos')
ok(!PAPEIS_CONFIGURAVEIS.includes('encarregado') && capacidadesDoPapel('encarregado').length === 0, 'não aparece na grade de permissões e não ganha capacidade extra')

grupo('2 · O que ele consulta')
ok(PERMISSOES_PADRAO.includes('ver_equipe') && PERMISSOES_PADRAO.includes('ver_presenca'), 'recebe ver equipe e ver presença')
ok(!PERMISSOES_PADRAO.includes('ver_contato'), 'telefone e CPF completos ficam desligados por padrão')
ok(Object.keys(PERMISSOES_ENCARREGADO).every(k => /^ver_/.test(k)), 'toda permissão do Encarregado é de LEITURA (ver_*)')
ok(temPermissaoEncarregado(['ver_equipe'], 'ver_equipe') && !temPermissaoEncarregado(['ver_equipe'], 'ver_contato') && !temPermissaoEncarregado(null, 'ver_equipe'), 'checagem de permissão')
ok(cpfMascarado('12345678909') === '***.456.789-**' && cpfMascarado('123') === '—', 'CPF mascarado na consulta')
ok(caminhoDoSetor({ evento: 'Vital', subevento: 'CAMAROTE', setor: 'Bar' }) === 'Vital › CAMAROTE › Bar' && caminhoDoSetor({ evento: 'X', subevento: null, setor: 'Bar' }) === 'X › Bar', 'caminho evento › subevento › setor (subevento só quando existe)')

grupo('3 · Quem designa e como')
const acoes = ler('lib/actions-encarregado.ts')
ok(!acoes.includes('supervisor_setores'), 'o Encarregado NUNCA entra em supervisor_setores (aquela tabela vale poder)')
ok(acoes.includes('!setorPorId.has(func.fornecedor_id as string)') && acoes.includes('não faz parte da sua equipe'), 'só designa quem já é da equipe de um dos setores do supervisor')
ok(acoes.includes('escolhidos.some(id => !setorPorId.has(id))'), 'só dá acesso aos setores que o supervisor supervisiona')
ok((acoes.match(/agendarTemplateSupervisor\(/g) ?? []).length === 1 && acoes.includes('primeiroAcesso'), 'UMA mensagem por pessoa e evento, com todos os setores (ajustar a lista não manda outra)')
ok(acoes.includes('encarregadosHabilitado') && acoes.includes('MSG_FUNCIONALIDADE_DESLIGADA'), 'recusa quando a funcionalidade está desligada')
ok(/organizacao_id: null, fornecedor_id: null/.test(acoes), 'a conta nasce sem organização e sem setor ativo no perfil')
ok(acoes.includes("existente.role !== 'encarregado'"), 'CPF que já tem outro acesso (supervisor, admin…) é recusado')
ok(acoes.includes("erro: 'Nada mudou"), 'não grava de novo o que já está igual')
ok(acoes.includes('escopoDoGestor') && (acoes.match(/escopoDoGestor\(/g) ?? []).length >= 3, 'toda ação passa pelo porteiro do escopo (setores do chamador)')
ok(!/throw new Error/.test(acoes), 'as ações devolvem { erro } — nenhuma lança (o Next mascara exceção em produção)')
const sql = ler('supabase/upgrade-encarregado.sql')
ok(/funcionario_id\s+uuid not null references funcionarios\(id\) on delete cascade/.test(sql), 'o acesso nasce da pessoa da equipe e some com ela')
ok(/encarregados_setor_funcionario_fornecedor\s+on encarregados_setor \(funcionario_id, fornecedor_id\)/.test(sql) && ler('supabase/upgrade-encarregado-multisetor.sql').includes('drop constraint if exists encarregados_setor_funcionario_id_key'), 'a mesma pessoa pode ter vários setores (único por pessoa+setor), com migração pra quem já rodou a primeira')
ok(sql.includes("'encarregado'") && sql.includes('enable row level security'), 'papel aceito no banco e tabela com RLS')
ok(/encarregados_habilitado boolean not null default false/.test(sql), 'a funcionalidade nasce desligada')

grupo('4 · A tela de consulta só lê')
const consulta = ler('lib/encarregado-consulta.ts')
ok(!/\.(insert|update|upsert|delete)\(/.test(consulta), 'o carregamento de consulta não escreve no banco')
const telas = arquivos('app/encarregado').filter(f => /\.tsx?$/.test(f)).map(ler).join('\n')
ok(!/from '@\/lib\/actions/.test(telas), 'as telas do Encarregado não importam nenhuma Server Action')
ok(ler('app/encarregado/[fid]/page.tsx').includes('exigirVinculo(') && ler('app/encarregado/[fid]/page.tsx').includes('notFound()'), 'a equipe só abre com vínculo válido (senão 404)')
ok(consulta.includes("f.status_credenciamento === 'aprovado'") && consulta.includes('descredenciado_em'), 'o vínculo para de valer se a pessoa sai da equipe')
ok(ler('app/encarregado/page.tsx').includes('porEvento') && ler('app/encarregado/[fid]/page.tsx').includes('irmaos'), 'o Encarregado escolhe evento e depois setor, como o supervisor')
ok(ler('app/encarregado/layout.tsx').includes("!ehEncarregado(perfil.role)"), 'só o papel encarregado entra na casca /encarregado')

grupo('5 · Fechando as outras portas')
ok(ler('app/admin/layout.tsx').includes("perfil.role === 'encarregado'") && ler('app/admin/layout.tsx').includes("redirect('/encarregado')"), 'o painel /admin manda o Encarregado embora')
ok(ler('app/admin/page.tsx').includes("perfil.role === 'encarregado'"), 'a home do admin também recusa (defesa em profundidade)')
ok(ler('app/api/ia/chat/route.ts').includes("perfil.role === 'encarregado'"), 'o assistente de IA (que escreve) recusa o Encarregado')
ok(ler('lib/historico.ts').includes("perfil.role === 'encarregado') return false"), 'histórico completo e QR de uma pessoa não são do Encarregado')
ok(ler('lib/actions.ts').includes("perfil.role === 'encarregado') return null"), 'a consulta de base por CPF não é do Encarregado')

grupo('6 · Configuração, menu e mensagem')
ok(ler('components/AppShell.tsx').includes("role === 'supervisor' && encarregadosHabilitado"), '"Criar Encarregado" só aparece pro supervisor quando a organização liberou')
ok(ler('app/admin/configuracoes/FuncionalidadesForm.tsx').includes('encarregados_habilitado'), 'interruptor em Configurações → Funcionalidades')
ok(ler('lib/actions.ts').includes("formData.get('encarregados_habilitado') === 'on'"), 'o servidor grava o interruptor')
ok(ler('lib/mensagens-modelos.ts').includes('cadastro_encarregado_cpf_link') && ler('lib/mensagens.ts').includes("'cadastro_encarregado_cpf_link'"), 'mensagem de WhatsApp do Encarregado existe')
ok(/Encarregado do\(s\) setor\(es\) \$\{setor\} no evento \$\{evento\}/.test(ler('lib/mensagens-modelos.ts')), 'a mensagem diz setor(es), com o subevento, e o evento')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
