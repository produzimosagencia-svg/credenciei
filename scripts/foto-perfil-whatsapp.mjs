#!/usr/bin/env node
/**
 * Troca a foto de perfil do número de WhatsApp (API oficial da Meta) usado
 * pelo Credenciei.
 *
 * Uso:
 *   node --env-file=.env.local scripts/foto-perfil-whatsapp.mjs caminho/da/foto.jpg
 *
 * Precisa de WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no ambiente. META_APP_ID é
 * opcional: sem ele, o script descobre o app a partir do token.
 *
 * A foto deve ser JPG ou PNG, quadrada (640x640 é o recomendado) e com até 5 MB.
 * Passos: envia o arquivo pela API de upload retomável, recebe o "handle" e
 * grava esse handle no perfil comercial do número.
 */
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const VERSAO = 'v21.0'
const BASE = `https://graph.facebook.com/${VERSAO}`

function sair(msg) {
  console.error(`Erro: ${msg}`)
  process.exit(1)
}

async function lerJson(res, etapa) {
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok || corpo.error) {
    sair(`${etapa} falhou (${res.status}): ${corpo.error?.message ?? JSON.stringify(corpo)}`)
  }
  return corpo
}

const caminho = process.argv[2]
if (!caminho) sair('informe o caminho da foto. Ex.: node --env-file=.env.local scripts/foto-perfil-whatsapp.mjs foto.jpg')

const token = process.env.WHATSAPP_TOKEN
const phoneId = process.env.WHATSAPP_PHONE_ID
if (!token || !phoneId) sair('WHATSAPP_TOKEN e WHATSAPP_PHONE_ID precisam estar no ambiente.')

const tipos = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }
const tipo = tipos[extname(caminho).toLowerCase()]
if (!tipo) sair('a foto precisa ser .jpg, .jpeg ou .png.')

const arquivo = await readFile(caminho).catch(() => sair(`não consegui ler o arquivo ${caminho}.`))
if (arquivo.length > 5 * 1024 * 1024) sair('a foto passa de 5 MB.')

const auth = { Authorization: `Bearer ${token}` }

// 1. Descobre o app dono do token (a sessão de upload é aberta no app).
let appId = process.env.META_APP_ID
if (!appId) {
  const app = await lerJson(await fetch(`${BASE}/app`, { headers: auth }), 'Descobrir o app do token')
  appId = app.id
}

// 2. Abre a sessão de upload.
const sessao = await lerJson(
  await fetch(`${BASE}/${appId}/uploads?file_length=${arquivo.length}&file_type=${encodeURIComponent(tipo)}`, {
    method: 'POST',
    headers: auth,
  }),
  'Abrir sessão de upload',
)

// 3. Envia o arquivo e recebe o handle.
const envio = await lerJson(
  await fetch(`${BASE}/${sessao.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': tipo },
    body: arquivo,
  }),
  'Enviar a foto',
)
if (!envio.h) sair('a Meta não devolveu o handle da foto.')

// 4. Grava a foto no perfil comercial do número.
await lerJson(
  await fetch(`${BASE}/${phoneId}/whatsapp_business_profile`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', profile_picture_handle: envio.h }),
  }),
  'Gravar a foto no perfil',
)

// 5. Confere.
const perfil = await lerJson(
  await fetch(`${BASE}/${phoneId}/whatsapp_business_profile?fields=profile_picture_url`, { headers: auth }),
  'Conferir o perfil',
)
console.log('Foto de perfil trocada.')
console.log('URL atual:', perfil.data?.[0]?.profile_picture_url ?? '(a Meta ainda não devolveu a URL)')
