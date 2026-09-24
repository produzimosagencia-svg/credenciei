import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'

/*
 * Início do consentimento do Google (Sheets + Drive) — SÓ O MASTER.
 *
 * Esta rota e a de callback nasceram sem autenticação nenhuma (achado da
 * auditoria de LGPD, 20/09/2026). Como `/api/*` não passa pelo `proxy.ts`,
 * qualquer pessoa na internet abria o consentimento e, no callback, trocava o
 * refresh token da integração. É esse token que abre as planilhas do Drive
 * onde estão nome, CPF, telefone e chave PIX de toda a equipe de todos os
 * eventos — ou seja, a porta lateral dos dados pessoais do sistema inteiro.
 *
 * É ferramenta de setup, usada pelo dono da plataforma. Exigir master não muda
 * o uso legítimo: só fecha a porta pra quem não deveria estar aqui.
 */
export async function GET() {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })

  return NextResponse.redirect(url)
}
