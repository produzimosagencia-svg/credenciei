/*
 * FECHAR O DIA DA EQUIPE e PENDÊNCIAS DO TURNO (Juan, 14/10/2026): a maior dor do VITAL foram os turnos sem saída
 * (602; 459 saídas lançadas por script). Agora supervisor (só a própria equipe) ou gestão lança de uma vez a saída
 * de quem ficou aberto, com horário e motivo — e o supervisor tem a tela "Pendências do turno".
 *
 * Roda com: node testes/fechar-o-dia.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const acao = ler('lib/actions-fechar-dia.ts'), botao = ler('components/FecharDiaBotao.tsx'), tela = ler('app/admin/pendencias-turno/page.tsx')
const menu = ler('components/AppShell.tsx'), presenca = ler('app/admin/eventos/[id]/presenca/page.tsx')
console.log('As regras (servidor)')
ok(/if \(meus\.length\) return \{ ok: true, perfil: quem, organizacaoId, setores: meus \}/.test(acao) && /Você só fecha o dia da sua equipe/.test(acao), 'supervisor só fecha o dia dos próprios setores; gestão, do evento inteiro')
ok(/motivo\.length < 5/.test(acao) && /A saída não pode ficar no futuro/.test(acao), 'motivo obrigatório e saída nunca no futuro')
ok(/new Date\(pessoa\.entradaISO\)\.getTime\(\) >= quando/.test(acao), 'quem entrou depois do horário escolhido fica de fora')
ok(/ignoreDuplicates: true/.test(acao), 'nunca troca uma saída que já existe (alguém bateu no portão no meio-tempo)')
ok(/registro_manual: true/.test(acao) && /criado_por_perfil_id: escopo\.perfil\.id/.test(acao) && /acao: 'FECHAMENTO_DO_DIA'/.test(acao), 'fica marcado como lançado à mão, com quem lançou, e vai pra auditoria')
ok(/const abertos = new Map\(\(await semSaida\(/.test(acao), 'confere de novo na hora de lançar (a lista do modal pode ter mudado)')
console.log('\nAs telas')
ok(/Lançar a saída de \$\{marcadas\.size\} pessoa\(s\)/.test(botao) && /type="datetime-local"/.test(botao), 'o modal: pessoas marcadas, horário e motivo')
ok(/href: '\/admin\/pendencias-turno', label: 'Pendências do turno'/.test(menu), '"Pendências do turno" no menu do supervisor (e de quem gerencia)')
ok(/listarSemSaida\(eventoId, dia\)/.test(tela) && /pendenciasDoDia\(\{ eventoId, data: dia, fornecedorId, etapas: \['meio'\], meioJaAberto: true \}\)/.test(tela) && /<FecharDiaBotao/.test(tela), 'a tela: sem saída e sem meio do turno de agora, com o Fechar o dia')
ok(/eventosAindaVigentes/.test(tela), 'só os eventos que ainda estão acontecendo')
ok(/visao === 'sem_saida' && linhas\.length > 0 && <FecharDiaBotao/.test(presenca), 'na Presença "sem saída" (onde o aviso ao supervisor leva) também tem o botão')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
