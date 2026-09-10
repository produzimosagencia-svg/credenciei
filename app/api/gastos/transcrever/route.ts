import { NextResponse } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import { interpretarAudioDeGasto } from '@/lib/gastos-ia'
import { eventosParaGastos } from '@/lib/gastos'
import { diaBRT } from '@/lib/janelas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A ida ao Gemini com um áudio pode levar 10-20s; 60 é folga.
export const maxDuration = 60

/**
 * Recebe o áudio gravado na tela de Gastos, manda pra IA e devolve os campos
 * extraídos. NÃO salva nada — quem salva é `criarGasto`, depois que o produtor
 * confirma.
 *
 * É uma rota HTTP, não uma Server Action, de propósito: em produção o Next
 * mascara exceção de Server Action, e aqui a mensagem de erro precisa chegar
 * inteira na tela (foi a lição do relatório de WhatsApp, 09/09/2026). Erro
 * volta como status + texto legível.
 *
 * `interpretarAudioDeGasto` (lib/gastos-ia.ts) é uma função pura — quando o
 * WhatsApp entrar, o worker chama a MESMA função com o áudio da mensagem, sem
 * passar por aqui.
 */
export async function POST(request: Request) {
  const perfil = await getPerfil()
  if (!perfil) return new NextResponse('Sua sessão expirou. Entre no sistema de novo.', { status: 401 })
  if (!podeRegistrarGastos(perfil)) return new NextResponse('Você não tem acesso ao módulo de Gastos.', { status: 403 })

  let corpo: { audioBase64?: string; mime?: string; eventoId?: string }
  try {
    corpo = await request.json()
  } catch {
    return new NextResponse('Requisição inválida.', { status: 400 })
  }

  const { audioBase64, mime, eventoId } = corpo
  if (!audioBase64 || !mime) return new NextResponse('Áudio não recebido. Grave de novo.', { status: 400 })
  if (!eventoId) return new NextResponse('Escolha o evento antes de gravar.', { status: 400 })

  const permitidos = await eventosParaGastos()
  const evento = permitidos.find(e => e.id === eventoId)
  if (!evento) return new NextResponse('Esse evento não está disponível pra você.', { status: 403 })

  const audio = Buffer.from(audioBase64, 'base64')
  // ~15 MB de base64 já é mais de um minuto de áudio — recusa antes de gastar
  // a chamada da IA.
  if (audio.byteLength > 15 * 1024 * 1024) {
    return new NextResponse('O áudio ficou muito longo. Grave um trecho mais curto, só do gasto.', { status: 413 })
  }

  try {
    const extraido = await interpretarAudioDeGasto(audio, mime, {
      eventoNome: evento.nome,
      hoje: diaBRT(),
    })
    return NextResponse.json(extraido)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[gastos/transcrever] falhou', { eventoId, erro: msg })
    return new NextResponse(msg, { status: 502 })
  }
}
