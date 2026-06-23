import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 })

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  )

  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    return NextResponse.json({ error: 'No refresh token. Revogue o acesso em myaccount.google.com/permissions e tente de novo.' }, { status: 400 })
  }

  // Salva o refresh token no .env.local
  const envPath = path.join(process.cwd(), '.env.local')
  let envContent = fs.readFileSync(envPath, 'utf8')

  if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
    envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
  } else {
    envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
  }

  fs.writeFileSync(envPath, envContent)

  return new NextResponse(`
    <html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:white">
      <h2 style="color:#22c55e">✓ Google Drive autorizado com sucesso!</h2>
      <p>Refresh token salvo. <strong>Reinicie o servidor</strong> para carregar o token.</p>
      <p style="color:#94a3b8">Depois feche esta aba e crie um evento para testar.</p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
