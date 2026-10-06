import { NextRequest } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { conversar, type MensagemChat } from '@/lib/ia/agente'
import type { PedidoConfirmacao } from '@/lib/ia/ferramentas'
import { mensagemAmigavel } from '@/lib/erros'
import type { LinhaPlanilha } from '@/lib/planilha'
import type { LinhaEstrutura } from '@/lib/estrutura-regras'

/**
 * Teto de linhas por anexo. Segura tanto o tempo da função quanto uma planilha
 * enorme mandada por engano; acima disso a importação pela tela do evento é o
 * caminho certo, porque não depende de uma volta do modelo.
 */
const MAX_LINHAS_PLANILHA = 1000

/**
 * Teto da planilha de ESTRUTURA — o mesmo da importação pela tela do evento
 * (MAX_LINHAS_ESTRUTURA em lib/actions.ts). Recusar aqui, em vez de cortar,
 * evita importar meia planilha achando que foi inteira.
 */
const MAX_LINHAS_ESTRUTURA = 500

// A conversa pode levar dezenas de segundos quando o modelo encadeia várias
// ferramentas antes de responder.
export const maxDuration = 120

/**
 * Conversa com o Suporte (assistente do sistema).
 *
 * Responde num stream de linhas JSON (uma por linha), cada uma com um tipo:
 *   {t:'texto', v}       — pedaço da resposta, pra escrever na tela ao vivo
 *   {t:'ferramenta', v}  — nome da ferramenta em uso, pra mostrar "consultando…"
 *   {t:'confirmar', ...} — exclusão parada esperando o clique do usuário
 *   {t:'erro', v}        — falhou; texto já em português
 *
 * O perfil vem da sessão no servidor, nunca do corpo da requisição: é ele que
 * define o que a IA enxerga, então aceitar do cliente seria entregar o escopo
 * de acesso pra quem chama a API.
 */
export async function POST(request: NextRequest) {
  const perfil = await getPerfil()
  if (!perfil) {
    return Response.json({ error: 'Faça login para usar o assistente.' }, { status: 401 })
  }
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: 'O assistente ainda não foi configurado neste ambiente. Fale com o administrador da plataforma.' },
      { status: 503 }
    )
  }

  let corpo: {
    mensagens?: MensagemChat[]
    confirmacoes?: string[]
    telaAtual?: string
    planilha?: LinhaPlanilha[]
    estrutura?: LinhaEstrutura[]
  }
  try {
    corpo = await request.json()
  } catch {
    return Response.json({ error: 'Requisição inválida.' }, { status: 400 })
  }

  const mensagens = (corpo.mensagens ?? []).filter(
    m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
  )
  if (!mensagens.length) {
    return Response.json({ error: 'Escreva uma pergunta.' }, { status: 400 })
  }

  // As linhas vêm do navegador: normaliza tudo pra texto antes de circular.
  // Sem isso, um campo numérico faria .trim() estourar lá dentro e o usuário
  // veria um erro genérico no meio da conversa.
  const texto = (v: unknown) => (v == null ? '' : String(v))
  const planilha: LinhaPlanilha[] | undefined = Array.isArray(corpo.planilha)
    ? corpo.planilha.map(l => ({
        nome: texto(l?.nome), cpf: texto(l?.cpf), telefone: texto(l?.telefone),
        cargo: texto(l?.cargo), cidade: texto(l?.cidade), valor: texto(l?.valor),
        chavePix: texto(l?.chavePix),
      }))
    : undefined

  // Estrutura: exatamente os campos de LinhaEstrutura, nada a mais. `linha`
  // vira número — é ela que aponta "linha 7: CPF inválido" pra pessoa, e é
  // por ela que as levas da importação escolhem o que gravar.
  const estrutura: LinhaEstrutura[] | undefined = Array.isArray(corpo.estrutura)
    ? corpo.estrutura.map((l, i) => ({
        linha: Number.isFinite(Number(l?.linha)) ? Math.trunc(Number(l?.linha)) : i + 2,
        fornecedor: texto(l?.fornecedor), subgrupo: texto(l?.subgrupo), trava: texto(l?.trava),
        supervisorNome: texto(l?.supervisorNome), supervisorCpf: texto(l?.supervisorCpf),
        supervisorTelefone: texto(l?.supervisorTelefone),
      }))
    : undefined

  if (estrutura && estrutura.length > MAX_LINHAS_ESTRUTURA) {
    return Response.json(
      { error: `Esta planilha de estrutura tem ${estrutura.length} linhas — o máximo por importação é ${MAX_LINHAS_ESTRUTURA}. Divida em partes (por subgrupo, por exemplo) e anexe uma de cada vez.` },
      { status: 413 }
    )
  }

  if (planilha && planilha.length > MAX_LINHAS_PLANILHA) {
    return Response.json(
      { error: `Esta planilha tem ${planilha.length} linhas — muita coisa para o chat. Importe pela tela do fornecedor, dentro do evento.` },
      { status: 413 }
    )
  }

  const encoder = new TextEncoder()
  // Confirmações pedidas durante esta volta. A ferramenta avisa aqui; a linha
  // só é escrita no stream depois, dentro do start() — o corpo da resposta
  // ainda não existe no momento em que o runner é montado.
  const pedidosDeConfirmacao: PedidoConfirmacao[] = []

  const runner = conversar({
    perfil: {
      id: perfil.id,
      nome: perfil.nome,
      email: perfil.email,
      role: perfil.role,
      organizacao_id: perfil.organizacao_id ?? null,
      fornecedor_id: perfil.fornecedor_id ?? null,
    },
    mensagens,
    confirmacoes: Array.isArray(corpo.confirmacoes) ? corpo.confirmacoes : [],
    telaAtual: typeof corpo.telaAtual === 'string' ? corpo.telaAtual : undefined,
    planilha,
    estrutura,
    aoPedirConfirmacao: pedido => pedidosDeConfirmacao.push(pedido),
  })

  const stream = new ReadableStream({
    async start(controller) {
      const enviar = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      let jaEnviados = 0
      const escoarConfirmacoes = () => {
        while (jaEnviados < pedidosDeConfirmacao.length) {
          enviar({ t: 'confirmar', ...pedidosDeConfirmacao[jaEnviados++] })
        }
      }
      try {
        for await (const evento of runner) {
          enviar(evento)
          // Uma exclusão pode ter parado esperando aval durante a volta: manda
          // pra interface desenhar o botão assim que acontecer.
          escoarConfirmacoes()
        }
      } catch (e) {
        console.error('Erro no assistente de IA:', e)
        enviar({ t: 'erro', v: mensagemAmigavel(e) })
        escoarConfirmacoes()
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
