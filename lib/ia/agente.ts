import Anthropic from '@anthropic-ai/sdk'
import { CONHECIMENTO_DO_SISTEMA } from './conhecimento'
import { ferramentasPara, type ContextoIA, type PedidoConfirmacao, type PerfilIA } from './ferramentas'
import { ROLE_LABELS, type Role } from '@/lib/permissions'

const MODELO = 'claude-opus-5'

const cliente = new Anthropic()

/**
 * Comportamento do assistente. Junto com o conhecimento do sistema, forma o
 * prefixo estável do prompt — o que muda a cada mensagem (quem está falando,
 * data, tela atual) entra depois, como mensagem, pra não invalidar o cache.
 */
const COMPORTAMENTO = `
Você é o **Credenciei IA**, o assistente do sistema Credenciei. Fala português
do Brasil, direto e sem jargão — quem te lê é um organizador de evento ou um
supervisor de equipe, não um técnico.

## Como responder

Vá direto ao ponto. Primeira frase responde a pergunta; detalhe vem depois, se
precisar. Nada de "Ótima pergunta!" nem de repetir o que a pessoa pediu.

Quando ensinar a fazer algo, dê o caminho concreto — a tela, o botão, o campo —
na ordem em que a pessoa vai encontrar. Nunca invente uma tela ou um campo que
não esteja na base de conhecimento: se não souber, diga que não sabe.

Ao citar uma tela, escreva o caminho entre colchetes com o link, assim:
[Painel do setor](/admin/eventos/ID/fornecedor/ID). A interface transforma isso
num link clicável.

## Consultar antes de responder

Você tem ferramentas de consulta. Use-as em vez de perguntar dados que pode
descobrir sozinho. Se alguém pergunta "quem faltou hoje", não peça o id do
evento — liste os eventos, escolha o que faz sentido e responda. Só pergunte
quando houver ambiguidade real que muda a resposta.

Números você nunca chuta: ou veio de uma ferramenta, ou você não afirma.

## Executar ações

Você pode agir no sistema, sempre dentro do que o usuário logado já poderia
fazer sozinho — as ferramentas recusam qualquer coisa fora do acesso dele, e
essa recusa é definitiva, não tente contornar por outro caminho.

Antes de uma ação que grava dados, confirme os dados em uma frase e siga. Não
faça interrogatório: se a pessoa disse "cadastra o João Silva, CPF tal, no setor
Produção", cadastre.

## Exclusões — atenção

Ferramentas de exclusão devolvem "precisa_confirmar" na primeira chamada. Quando
isso acontecer:

1. NÃO chame a ferramenta de novo.
2. Diga em português claro o que exatamente será apagado, com os números do
   impacto que a ferramenta devolveu.
3. Encerre sua vez. A interface mostra o botão de confirmação, e você só é
   chamado de novo depois que a pessoa clicar.

Nunca minimize o impacto. Se apaga 87 pessoas e 203 registros, diga isso.

Quando existir um caminho reversível melhor, ofereça: encerrar um evento em vez
de excluir, desativar uma pessoa em vez de remover.

## Erros

Se uma ferramenta falhar, explique em português o que aconteceu, por que, e o
que fazer agora. Nunca repasse mensagem técnica crua nem diga só "deu erro".
`.trim()

export type MensagemChat = { role: 'user' | 'assistant'; content: string }

/** Fatos voláteis da conversa. Ficam DEPOIS do prefixo cacheado, de propósito. */
function contextoDaVez(perfil: PerfilIA, telaAtual?: string): string {
  const agora = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(new Date())
  return [
    `Quem está falando com você: ${perfil.nome} (${ROLE_LABELS[perfil.role as Role] ?? perfil.role}).`,
    `Agora: ${agora} (horário de Brasília).`,
    telaAtual ? `Tela em que a pessoa está: ${telaAtual}` : null,
  ].filter(Boolean).join('\n')
}

/**
 * Roda uma volta da conversa e devolve o stream de texto para a interface.
 *
 * Usa o tool runner do SDK: ele cuida do laço de chamar ferramenta → devolver
 * resultado → chamar de novo, até o modelo parar de pedir ferramenta. As travas
 * de permissão e de confirmação vivem dentro de cada ferramenta, então o laço
 * automático não abre brecha — o que a ferramenta recusa, fica recusado.
 */
export function conversar(params: {
  perfil: PerfilIA
  mensagens: MensagemChat[]
  confirmacoes: string[]
  telaAtual?: string
  aoPedirConfirmacao?: (pedido: PedidoConfirmacao) => void
}) {
  const ctx: ContextoIA = {
    perfil: params.perfil,
    confirmacoes: new Set(params.confirmacoes),
    aoPedirConfirmacao: params.aoPedirConfirmacao,
  }

  return cliente.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // Prefixo estável primeiro (cacheado), volátil depois — ver conhecimento.ts
    system: [
      { type: 'text', text: COMPORTAMENTO },
      { type: 'text', text: CONHECIMENTO_DO_SISTEMA, cache_control: { type: 'ephemeral' } },
    ],
    tools: ferramentasPara(ctx),
    messages: [
      { role: 'user', content: contextoDaVez(params.perfil, params.telaAtual) },
      { role: 'assistant', content: 'Entendido. Pode perguntar.' },
      ...params.mensagens,
    ],
    stream: true,
  })
}
