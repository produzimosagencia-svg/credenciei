import { google } from 'googleapis'
import { NextResponse } from 'next/server'

export async function GET() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({ version: 'v3', auth })

  // Lista todos os arquivos do Drive da service account
  const { data } = await drive.files.list({
    fields: 'files(id, name, mimeType, quotaBytesUsed)',
    pageSize: 100,
  })

  const files = data.files ?? []

  // Deleta tudo exceto pastas
  const deleted: string[] = []
  for (const file of files) {
    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      await drive.files.delete({ fileId: file.id! })
      deleted.push(file.name!)
    }
  }

  return NextResponse.json({ deleted, total: deleted.length })
}
