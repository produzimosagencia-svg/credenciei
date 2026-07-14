import { google } from 'googleapis'

function getAuth() {
  // Usa OAuth2 com refresh token do usuário se disponível
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    )
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    return oauth2Client
  }

  // Fallback: service account
  return new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })
}

// Colunas alinhadas ao formulário de cadastro atual (nome, CPF, telefone,
// empresa, cargo, chave PIX — sem e-mail). "Valor por Funcionário" é
// preenchido depois pelo supervisor do setor (não faz parte do cadastro).
// Entrada/Saída saíram: a presença hoje é feita por QR (entrada/fim) + foto/GPS
// (meio), acompanhada direto no painel — a planilha não tenta mais espelhar isso.
const HEADERS = ['Nome', 'CPF', 'Telefone', 'Empresa', 'Cargo', 'Chave PIX', 'Valor por Funcionário', 'QR Code', 'Cadastro']
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

const CREDENCIEI_FOLDER_NAME = 'Credenciei'

export async function encontrarOuCriarPasta(nome: string, parentId?: string): Promise<string> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const query = parentId
    ? `name='${nome}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${nome}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

  const { data } = await drive.files.list({ q: query, fields: 'files(id, name)' })

  if (data.files?.length) return data.files[0].id!

  const res = await drive.files.create({
    requestBody: {
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  })
  return res.data.id!
}

export async function garantirPastaCliente(nomeCliente: string): Promise<string> {
  const pastaRaizId = await encontrarOuCriarPasta(CREDENCIEI_FOLDER_NAME)
  return encontrarOuCriarPasta(nomeCliente, pastaRaizId)
}

export async function criarPlanilhaEvento(nomeEvento: string, clienteFolderId?: string | null): Promise<string> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

  // Cria via Drive API (evita restrições da Sheets API)
  const driveRes = await drive.files.create({
    requestBody: {
      name: nomeEvento,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      ...(clienteFolderId ? { parents: [clienteFolderId] } : {}),
    },
    fields: 'id',
  })

  const spreadsheetId = driveRes.data.id!

  // Descobre o nome da aba padrão (varia por idioma: "Plan1", "Sheet1", etc.)
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const abaAtual = meta.data.sheets?.[0]?.properties?.title ?? 'Plan1'
  const sheetId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0

  // Renomeia para "Geral"
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ updateSheetProperties: { properties: { sheetId, title: 'Geral' }, fields: 'title' } }],
    },
  })

  // Adiciona cabeçalho
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Geral!A1:I1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  })

  await formatarCabecalho(sheets, spreadsheetId, sheetId)

  // Compartilha com permissão de leitura pública
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return spreadsheetId
}

export async function garantirAbaFornecedor(
  spreadsheetId: string,
  fornecedorNome: string
): Promise<number> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const existente = meta.data.sheets?.find(s => s.properties?.title === fornecedorNome)

  if (existente) {
    const sheetId = existente.properties!.sheetId!
    // Atualiza cabeçalho pro formato atual — só quando a aba ainda não tem
    // nenhum funcionário lançado, pra não desalinhar dados já existentes
    // (colunas antigas como E-mail/Entrada/Saída saíram do layout).
    try {
      const [headerRes, dadosRes] = await Promise.all([
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${fornecedorNome}!A1:I1` }),
        sheets.spreadsheets.values.get({ spreadsheetId, range: `${fornecedorNome}!A2` }),
      ])
      const header = headerRes.data.values?.[0] ?? []
      const temDados = !!dadosRes.data.values?.length
      const headerDesatualizado = JSON.stringify(header) !== JSON.stringify(HEADERS)
      if (headerDesatualizado && !temDados) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${fornecedorNome}!A1:I1`,
          valueInputOption: 'RAW',
          requestBody: { values: [HEADERS] },
        })
        await formatarCabecalho(sheets, spreadsheetId, sheetId)
      }
    } catch {}
    return sheetId
  }

  // Cria a aba
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: fornecedorNome } } }],
    },
  })

  const sheetId = res.data.replies![0].addSheet!.properties!.sheetId!

  // Adiciona cabeçalho
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${fornecedorNome}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  })

  await formatarCabecalho(sheets, spreadsheetId, sheetId)

  return sheetId
}

export async function adicionarFuncionarioNaPlanilha(
  spreadsheetId: string,
  fornecedorNome: string,
  funcionario: {
    nome: string
    cpf: string
    telefone: string
    empresa: string
    cargo: string
    chavePix?: string | null
    valorReceber?: number
    qr_token?: string
  }
): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  await garantirAbaFornecedor(spreadsheetId, fornecedorNome)

  const cpfFormatado = funcionario.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  const telFormatado = funcionario.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  const cadastro = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const qrLink = funcionario.qr_token ? `${SITE_URL}/credential/${funcionario.qr_token}` : ''
  // Sem valor definido ainda (o supervisor do setor configura depois) → fica em branco
  const valor = funcionario.valorReceber ? funcionario.valorReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${fornecedorNome}!A:I`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        funcionario.nome,
        cpfFormatado,
        telFormatado,
        funcionario.empresa,
        funcionario.cargo,
        funcionario.chavePix || '', // Chave PIX (col F)
        valor,    // Valor por Funcionário (col G)
        qrLink,   // QR Code (col H)
        cadastro, // Cadastro (col I)
      ]],
    },
  })
}

/** Atualiza o "Valor por Funcionário" (col G) da linha do funcionário, pelo nome. */
export async function atualizarValorNaPlanilha(
  spreadsheetId: string,
  fornecedorNome: string,
  funcionarioNome: string,
  valor: number
): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${fornecedorNome}!A:A`,
  })

  const rows = res.data.values ?? []
  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === funcionarioNome)
  if (rowIndex === -1) return

  const rowNum = rowIndex + 1 // 1-based
  const valorFormatado = valor > 0 ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${fornecedorNome}!G${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[valorFormatado]] },
  })
}

export async function registrarPresencaNaPlanilha(
  spreadsheetId: string,
  fornecedorNome: string,
  funcionarioNome: string,
  tipo: 'entrada' | 'saida',
  horario: string
): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Busca todas as linhas para encontrar o funcionário pelo nome
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${fornecedorNome}!A:I`,
  })

  const rows = res.data.values ?? []
  const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === funcionarioNome)
  if (rowIndex === -1) return

  // Coluna I (index 8) = Entrada, J (index 9) = Saída
  const col = tipo === 'entrada' ? 'I' : 'J'
  const rowNum = rowIndex + 1 // 1-based

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${fornecedorNome}!${col}${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[horario]] },
  })
}

async function formatarCabecalho(sheets: any, spreadsheetId: string, sheetId: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.15, green: 0.27, blue: 0.53 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  })
}
