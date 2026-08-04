import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from '@google/genai'
import { CONHECIMENTO_DO_SISTEMA } from './conhecimento'
import { ferramentasPara, type ContextoIA, type PedidoConfirmacao, type PerfilIA } from './ferramentas'
import { ROLE_LABELS, type Role } from '@/lib/permissions'

const MODELO = 'gemini-3.6-flash'

/** Teto de idas e voltas de ferramenta numa pergunta. Evita laço infinito. */
const MAX_VOLTAS = 8

/**
 * Comportamento do assistente. Vai como systemInstruction — separado do
 * conhecimento só por legibilidade; os dois são concatenados no envio.
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

Não use tabelas nem títulos com #. Texto corrido e listas curtas com "-".

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

1. NÃO chame a ferramenta de novo, de jeito nenhum.
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

export type EventoDaConversa =
  | { t: 'texto'; v: string }
  | { t: 'ferramenta'; v: string }

/**
 * Duas falhas transitórias acontecem de verdade em produção: 503 (modelo
 * congestionado) e 429 (cota por minuto estourada, comum quando várias pessoas
 * perguntam ao mesmo tempo). Nas duas o certo é esperar, não estourar a
 * conversa na cara do usuário.
 *
 * Quando o Google diz em quanto tempo tentar de novo (retryDelay), respeitamos
 * — chutar backoff curto contra cota de minuto só queima tentativa à toa.
 */
function esperaSugerida(erro: unknown): number | null {
  const texto = String((erro as Error)?.message ?? erro)
  const m = texto.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null
}

async function comRetentativa<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const texto = String((e as Error)?.message ?? e)
      const transitorio = /UNAVAILABLE|503|RESOURCE_EXHAUSTED|429|high demand/i.test(texto)
      if (!transitorio || i >= tentativas - 1) throw e
      // Teto de 30s: acima disso é melhor devolver o erro do que deixar a
      // pessoa olhando pro "pensando..." sem fim.
      const espera = Math.min(esperaSugerida(e) ?? 2000 * 2 ** i, 30_000)
      await new Promise(r => setTimeout(r, espera))
    }
  }
}

/** Fatos voláteis da conversa — vão na instrução de sistema, que é por chamada. */
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
 * Roda uma volta da conversa, transmitindo o texto conforme o modelo escreve.
 *
 * O laço de ferramentas é escrito à mão: pede ao modelo, executa o que ele
 * chamou, devolve o resultado e repete até ele parar de chamar ferramenta. As
 * travas de permissão e de confirmação vivem DENTRO de cada ferramenta, então
 * nada aqui pode afrouxá-las — o laço só transporta pedido e resposta.
 */
export async function* conversar(params: {
  perfil: PerfilIA
  mensagens: MensagemChat[]
  confirmacoes: string[]
  telaAtual?: string
  aoPedirConfirmacao?: (pedido: PedidoConfirmacao) => void
}): AsyncGenerator<EventoDaConversa> {
  const ctx: ContextoIA = {
    perfil: params.perfil,
    confirmacoes: new Set(params.confirmacoes),
    aoPedirConfirmacao: params.aoPedirConfirmacao,
  }

  const ferramentas = ferramentasPara(ctx)
  const porNome = new Map(ferramentas.map(f => [f.nome, f]))
  const declaracoes: FunctionDeclaration[] = ferramentas.map(f => ({
    name: f.nome,
    description: f.descricao,
    parameters: f.parametros as FunctionDeclaration['parameters'],
  }))

  const ia = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const contents: Content[] = params.mensagens.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const config = {
    systemInstruction: [
      COMPORTAMENTO,
      CONHECIMENTO_DO_SISTEMA,
      contextoDaVez(params.perfil, params.telaAtual),
    ].join('\n\n'),
    tools: [{ functionDeclarations: declaracoes }],
    /*
     * Assistente de suporte não precisa raciocinar fundo: as respostas saem de
     * uma base de conhecimento fechada e de ferramentas que já devolvem o dado
     * pronto. Raciocínio longo aqui só adiciona espera antes da primeira
     * palavra aparecer — e numa conversa a espera é o que mais incomoda.
     */
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  }

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const stream = await comRetentativa(() =>
      ia.models.generateContentStream({ model: MODELO, contents, config })
    )

    let respondeu = false
    const partesDoModelo: NonNullable<Content['parts']> = []
    const chamadas: { name: string; args: Record<string, never> }[] = []

    for await (const pedaco of stream) {
      const partes = pedaco.candidates?.[0]?.content?.parts ?? []
      for (const parte of partes) {
        // Guarda a parte INTEIRA no histórico. O Gemini 3 exige receber de
        // volta o thoughtSignature junto da chamada de ferramenta, e ele fica
        // na parte, ao lado do functionCall — remontar a parte à mão perde o
        // campo e a próxima chamada é recusada com 400.
        partesDoModelo.push(parte)

        if (parte.thought) continue // raciocínio interno, não é resposta ao usuário
        if (parte.text) {
          respondeu = true
          yield { t: 'texto', v: parte.text }
        } else if (parte.functionCall?.name) {
          yield { t: 'ferramenta', v: parte.functionCall.name }
          chamadas.push({
            name: parte.functionCall.name,
            args: (parte.functionCall.args ?? {}) as Record<string, never>,
          })
        }
      }
    }

    // Sem ferramenta pedida: o modelo terminou a resposta.
    if (!chamadas.length) {
      if (!respondeu) yield { t: 'texto', v: 'Não consegui montar uma resposta. Reformule a pergunta, por favor.' }
      return
    }

    contents.push({ role: 'model', parts: partesDoModelo })

    const respostas = await Promise.all(chamadas.map(async c => {
      const f = porNome.get(c.name)
      if (!f) return { name: c.name, response: { erro: 'Ferramenta desconhecida.' } }
      try {
        return { name: c.name, response: { resultado: await f.executar(c.args) } }
      } catch (e) {
        console.error(`Ferramenta ${c.name} falhou:`, e)
        return { name: c.name, response: { erro: 'A operação falhou no sistema. Avise o usuário e sugira tentar pela tela.' } }
      }
    }))

    contents.push({ role: 'user', parts: respostas.map(r => ({ functionResponse: r })) })
  }

  yield {
    t: 'texto',
    v: '\n\nParei por aqui: precisei consultar o sistema vezes demais para uma pergunta só. Tente perguntar de forma mais específica.',
  }
}
