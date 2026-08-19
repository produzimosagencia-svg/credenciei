import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'

/**
 * Limpeza do Drive da service account — ferramenta de manutenção.
 *
 * ⚠️ Esta rota APAGA todas as planilhas de todos os eventos de todas as
 * organizações. Ela nasceu sem autenticação nenhuma e respondia a GET, o que
 * significa que qualquer pessoa com a URL — ou um prefetch de navegador, ou um
 * crawler — zerava as planilhas da plataforma inteira.
 *
 * Agora exige as três coisas ao mesmo tempo:
 *   1. POST, para nunca ser disparada por navegação ou prefetch;
 *   2. sessão de MASTER;
 *   3. o header de confirmação, pra não acontecer por clique errado.
 */
export async function POST(request: NextRequest) {
  const perfil = await getPerfil()
  if (!ehMaster(perfil?.role)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }
  if (request.headers.get('x-confirmar-limpeza') !== 'apagar-planilhas') {
    return NextResponse.json(
      { error: 'Confirmação ausente. Esta operação apaga TODAS as planilhas de TODOS os eventos.' },
      { status: 428 }
    )
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({ version: 'v3', auth })

  const { data } = await drive.files.list({
    fields: 'files(id, name, mimeType, quotaBytesUsed)',
    pageSize: 100,
  })

  const files = data.files ?? []

  // Apaga tudo que não for pasta.
  const deleted: string[] = []
  for (const file of files) {
    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      await drive.files.delete({ fileId: file.id! })
      deleted.push(file.name!)
    }
  }

  console.warn(`[drive-cleanup] ${perfil!.email} apagou ${deleted.length} arquivo(s) do Drive`)
  return NextResponse.json({ deleted, total: deleted.length })
}
