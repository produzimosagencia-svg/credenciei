/*
 * EXCLUIR DA EQUIPE NÃO APAGA QUEM JÁ BATEU PONTO (08/10/2026, VITAL). Um supervisor excluiu da equipe
 * alguém que tinha registrado a ENTRADA de manhã: excluir leva as batidas junto e mata o QR — a pessoa seguiu
 * trabalhando com um QR "inválido" e sumiu do sistema.
 *
 * 11/10/2026 (Juan): "quando excluir uma pessoa da equipe, ela ainda precisa estar no relatório, o histórico de batida
 * dela... dar baixa na equipe e liberar uma nova vaga". Agora NINGUÉM apaga quem já tem batida, nem o master: excluir
 * vira BAIXA (o "Tirar da equipe") — a ficha e as batidas ficam no relatório, o QR para de valer e a vaga volta.
 * E o "Funcionários do evento" nunca diminui: quem foi apagado (sem batida) vem da lixeira.
 *
 * Roda com: node testes/exclusao.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const corpo = acoes.slice(acoes.indexOf('export async function deletarFuncionario'), acoes.indexOf('Valor que este funcionário deve receber'))
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
const ia = ler('lib/ia/ferramentas/funcionarios.ts')

console.log('Na tela do fornecedor')
ok(!/\.delete\(\)/.test(corpo) && !/guardarNaLixeira/.test(corpo), 'excluir NUNCA apaga a ficha (nem a lixeira entra mais) — 12/10/2026: "o botão excluir só tira o funcionário da equipe"')
ok(/await descredenciarFuncionario\(id, fornecedorId, eventoId, motivo\?\.trim\(\) \|\| 'Excluída da equipe \(baixa\)'\)\s*revalidatePath\([^)]*\)\s*return \{ baixa: true, nome: alvo\.nome as string \}/.test(corpo),
  'excluir = baixa, pra todo mundo (com ou sem batida, master inclusive)')
ok(/Promise<\{ error\?: string; baixa\?: boolean; nome\?: string \}>/.test(corpo) && /return \{ error: mensagemAmigavel\(e\) \}/.test(corpo), 'a ação devolve o erro em vez de lançar (o Next esconderia a mensagem em produção)')
ok(/const r = await deletarFuncionario\(f\.id, fornecedorId, eventoId\)/.test(tabela) && /if \(r\?\.error\) \{ setErroAtivacao\(r\.error\); return \}/.test(tabela), 'a tela mostra a recusa no aviso do topo da tabela')
ok(/if \(r\?\.baixa\) setErroAtivacao\(/.test(tabela) && /as batidas continuam no relatório/.test(tabela), 'e avisa que virou baixa')
ok(/titulo="Excluir da equipe"/.test(tabela) && /Nada é apagado: ela recebe baixa/.test(tabela) && !/vai para a lixeira/.test(tabela), 'o aviso de confirmação diz que nada é apagado')

console.log('\nSetor e evento com batida não se excluem (12/10/2026)')
ok(/Este fornecedor tem \$\{batidasDoSetor\} batida\(s\) de ponto e não pode ser excluído/.test(acoes) && acoes.indexOf('batidasDoSetor') < acoes.indexOf("await db.from('fornecedores').delete().eq('id', id)"), 'setor com batida: recusado antes do delete')
ok(/Este evento tem \$\{batidasDoEvento\} batida\(s\) de ponto e não pode ser excluído/.test(acoes) && acoes.indexOf('batidasDoEvento') < acoes.indexOf("db.from('eventos').delete().eq('id', id)"), 'evento com batida: recusado antes do delete')
ok(/valorAnterior: horarioAnterior \? `\$\{formatarBR\(horarioAnterior, 'curto'\)\} \(horário substituído\)` : null/.test(acoes), 'corrigir um horário guarda o horário substituído na auditoria')
const sqlProtecao = ler('supabase/upgrade-batidas-protegidas.sql')
ok(/before delete on registros/.test(sqlProtecao) && /insert into registros_apagados/.test(sqlProtecao) && /before delete on funcionarios/.test(sqlProtecao), 'no banco: cópia de toda batida apagada e ficha com batida não se apaga')

console.log('\nNo assistente de IA')
const setoresIA = ler('lib/ia/ferramentas/setores.ts'), eventosIA = ler('lib/ia/ferramentas/eventos.ts')
ok(!/from\('funcionarios'\)\.delete\(\)/.test(ia) && /update\(\{ descredenciado_em: new Date\(\)\.toISOString\(\), descredenciado_por: perfil\.id \}\)/.test(ia), 'o assistente também nunca apaga uma pessoa: dá baixa')
ok(setoresIA.indexOf('if ((registros ?? 0) > 0) {') > 0 && setoresIA.indexOf('if ((registros ?? 0) > 0) {') < setoresIA.indexOf(".from('fornecedores').delete()"), 'nem exclui setor com batida')
ok(eventosIA.indexOf('if ((registros ?? 0) > 0) {') > 0 && eventosIA.indexOf('if ((registros ?? 0) > 0) {') < eventosIA.indexOf(".from('eventos').delete()"), 'nem evento com batida')

console.log('\nA baixa libera a vaga')
const escala = ler('lib/escala.ts'), importacao = ler('lib/importacao.ts'), pedidos = ler('lib/actions-pedidos-setor.ts')
ok(/\.or\('origem\.is\.null,origem\.neq\.supervisor'\)\s*\.is\('descredenciado_em', null\)\s*if \(\(count \?\? 0\) >= cota\)/.test(acoes), 'cadastro pelo link: a quantidade do setor não conta quem recebeu baixa')
ok(/\.is\('descredenciado_em', null\)\s*let restante/.test(importacao), 'planilha: idem')
ok(/\.is\('descredenciado_em', null\)\s*const combinado/.test(pedidos), 'pedido de mais colaboradores: idem')
ok((escala.match(/f\.status_credenciamento === 'negado' \|\| f\.descredenciado_em\) continue/g) ?? []).length === 2, 'limite por dia (aprovação e planilha): quem recebeu baixa devolve o dia')
ok(/\.is\('funcionarios\.descredenciado_em', null\)/.test(escala), 'limite por dia no portão: idem')

console.log('\nQuem recebeu baixa CONTINUA na equipe, em cinza, com "Trazer de volta" no fim da linha (Juan, 11/10/2026)')
ok(/const LINHA_DE_BAIXA_TABELA = 'bg-slate-50\/80 \[&>td:not\(:last-child\)\]:opacity-50'/.test(tabela) && /\$\{f\.descredenciadoEm \? LINHA_DE_BAIXA_TABELA : ''\}/.test(tabela),
  'computador: a linha fica cinza, menos a coluna dos botões')
ok(/\$\{f\.descredenciadoEm \? LINHA_DE_BAIXA_CARTAO : ''\}/.test(tabela), 'celular: o cartão também')
ok((tabela.match(/\{f\.descredenciadoEm && <BotaoTrazerDeVolta nome=\{f\.nome\} onClick=\{\(\) => voltarParaEquipe\(f\)\}/g) ?? []).length === 2,
  'o botão "Trazer de volta" fica no fim da linha, no computador e no celular')
ok(!/FORA DA EQUIPE/.test(tabela) && (tabela.match(/>BAIXA<\/span>/g) ?? []).length === 2, 'o selo diz BAIXA, não "fora da equipe"')
ok(/titulo="Dar baixa"/.test(tabela) && /Ela continua na lista da equipe, em cinza, e no relatório com todas as batidas/.test(tabela), 'a confirmação diz que ela continua na equipe e no relatório')
const extras = ler('lib/relatorios-extras.ts')
ok(/cadastrados: lista\.length,/.test(extras) && /baixa: lista\.filter\(f => !!f\.descredenciado_em\)\.length/.test(extras) && (extras.match(/\{ titulo: 'Com baixa', largura: 11 \}/g) ?? []).length === 2,
  'relatório de subeventos: quem tem baixa conta nos cadastrados, com a coluna "Com baixa"')

console.log('\nExcluir também dentro da ficha da pessoa (Juan, 16/10/2026: "coloca aqui a opção de excluir o funcionário dentro do modal do perfil dele também")')
{
  const modal = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal.tsx')
  ok(/await deletarFuncionario\(f\.id, fornecedorId, eventoId, motivoExcluir\.trim\(\) \|\| undefined\)/.test(modal), 'a ficha chama a MESMA action do lixinho da linha (a baixa — nada é apagado)')
  ok(/\{podeExcluir && !f\.descredenciadoEm && \(/.test(modal) && /podeExcluir = false,/.test(modal), 'só aparece para quem pode excluir (padrão: não aparece) e some para quem já tem baixa')
  ok(/Nada é apagado: ela recebe baixa e continua na lista da\s+equipe, em cinza, com as batidas no relatório/.test(modal), 'a confirmação diz o mesmo que a da linha')
  ok((tabela.match(/podeExcluir=\{podeExcluir\}/g) ?? []).length === 2, 'a equipe liga o botão na ficha, no computador e no celular')
}

console.log('\n"Funcionários do evento" nunca diminui')
const lixeira = ler('lib/lixeira.ts'), paginaEvento = ler('app/admin/eventos/[id]/page.tsx')
ok(/export async function cadastrosSoNaLixeira/.test(lixeira) && /\.is\('restaurado_em', null\)/.test(lixeira) && /!aindaNoEvento\.has\(c\)/.test(lixeira),
  'quem foi apagado e não voltou (CPF distinto, fora de quem ainda tem ficha) vem da lixeira')
ok(/const cadastradosNoEvento = totalFuncionarios \+ await cadastrosSoNaLixeira\(id\)/.test(paginaEvento) && /label="Funcionários do evento" value=\{cadastradosNoEvento\}/.test(paginaEvento),
  'o cartão soma os dois')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
