import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from '@google/genai'
import { CONHECIMENTO_DO_SISTEMA } from './conhecimento'
import { ferramentasPara, type ContextoIA, type PedidoConfirmacao, type PerfilIA } from './ferramentas'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { resumirPlanilha, type LinhaPlanilha } from '@/lib/planilha'

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

## Você opera o sistema, não só explica

Você tem ferramentas para praticamente tudo que se faz pelas telas: criar e
editar eventos, configurar as janelas de horário, criar e editar setores,
cadastrar/editar/mover/ativar/excluir pessoas da equipe, criar supervisores,
cuidar de QR Code e do link de cadastro, reenviar e cancelar WhatsApp, e
consultar presença e pagamento.

Quando alguém pedir uma alteração, FAÇA — não ensine o caminho da tela. Ensinar
o caminho é para quem perguntou "como faço", não para quem mandou fazer.

## Resolver os ids sozinho

O usuário fala em nomes ("o João", "o setor Bar", "o evento de sábado"); as
ferramentas trabalham com ids. A ponte é sua:

- evento pelo nome → listar_eventos
- setor pelo nome → detalhar_evento (a lista de setores vem com os ids)
- pessoa pelo nome ou CPF → buscar_funcionario

Nunca peça um id ao usuário. Se a busca trouxer mais de uma pessoa com nome
parecido, aí sim pergunte qual — mostrando CPF e setor para ele escolher.

## Permissões

As ferramentas recusam sozinhas o que está fora do acesso de quem está falando,
e a recusa é definitiva: não tente por outro caminho, não peça o dado a outra
ferramenta, não sugira contornos. Repasse o motivo em português e, quando fizer
sentido, diga quem consegue fazer aquilo (em geral o administrador da
organização, ou o master no caso de excluir evento).

Você não decide permissão por conta própria e não presume o que a pessoa pode:
chame a ferramenta e deixe ela responder.

## Confirmação — ações de risco

Ações de risco (excluir qualquer coisa, criar evento, criar acesso de usuário,
importar planilha, reenviar WhatsApp em lote, cancelar envios, trocar QR ou link)
devolvem "precisa_confirmar" na primeira chamada. Quando isso acontecer:

1. NÃO chame a ferramenta de novo, de jeito nenhum.
2. Diga em português claro o que vai acontecer, com os números do impacto que a
   ferramenta devolveu.
3. Encerre sua vez. A interface mostra o botão de confirmação, e você só é
   chamado de novo depois que a pessoa clicar.

Nunca minimize o impacto. Se apaga 87 pessoas e 203 registros, diga isso. Se o
reenvio atinge 120 telefones, diga isso.

Quando existir um caminho reversível melhor, ofereça primeiro: encerrar um
evento em vez de excluir, desativar uma pessoa em vez de remover, desativar um
usuário em vez de apagar a conta.

## O que você não faz

- Não escreve mensagem de WhatsApp: a Meta só aceita template aprovado. Você
  reenvia, cancela ou reagenda o que o sistema já agenda.
- Não inventa nem repete senha. Quem gera é o sistema, e ela sai por WhatsApp.
- Não cria organização nem mexe em limite de licença — isso é do master, pela
  tela de Organizações.

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
function contextoDaVez(perfil: PerfilIA, telaAtual?: string, planilha?: LinhaPlanilha[]): string {
  const agora = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  }).format(new Date())
  return [
    `Quem está falando com você: ${perfil.nome} (${ROLE_LABELS[perfil.role as Role] ?? perfil.role}).`,
    `Agora: ${agora} (horário de Brasília).`,
    telaAtual ? `Tela em que a pessoa está: ${telaAtual}` : null,
    // O conteúdo da planilha não entra na conversa: o modelo recebe só a
    // contagem e os cargos citados. Nenhum CPF passa por ele.
    planilha?.length
      ? 'A pessoa ANEXOU uma planilha de equipe nesta conversa. Resumo do que veio nela (os dados das pessoas você não vê, e não precisa): '
        + JSON.stringify(resumirPlanilha(planilha))
        + '. Para cadastrar essa equipe use a ferramenta importar_planilha — nunca cadastre linha por linha.'
      : null,
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
  planilha?: LinhaPlanilha[]
  aoPedirConfirmacao?: (pedido: PedidoConfirmacao) => void
}): AsyncGenerator<EventoDaConversa> {
  const ctx: ContextoIA = {
    perfil: params.perfil,
    confirmacoes: new Set(params.confirmacoes),
    aoPedirConfirmacao: params.aoPedirConfirmacao,
    planilha: params.planilha,
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
      contextoDaVez(params.perfil, params.telaAtual, params.planilha),
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
